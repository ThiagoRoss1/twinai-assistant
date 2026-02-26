import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { verify } from "@octokit/webhooks-methods";
import { getAiReview } from "../src/core/engine.js";

export const config = {
    api: {
        bodyParser: false,
    },
};

type ReviewComment = {
    file: string;
    line: number;
    severity: "🚨 Critical" | "⚠ High" | "⚠ Medium" | "⚠ Low";
    comment: {
        issue: string;
        suggestion: string;
        rationale: string;
    };
};

const PATRICK_GIF = "![PatrickLoading](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZmx6cmRiZ2Nyb203ampmOXJjYWo0ZnZvanRzZTd0MnUzNGt6cmlyZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Ij5kcfI6YwcPCN26U2/giphy.gif)";

function getHeaderValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
        return value[0] || "";
    }
    return value || "";
}

async function getWebhookPayload(req: any): Promise<string> {
    if (typeof req.rawBody === "string") {
        return req.rawBody;
    }

    if (Buffer.isBuffer(req.rawBody)) {
        return req.rawBody.toString("utf8");
    }

    if (typeof req.body === "string") {
        return req.body;
    }

    if (Buffer.isBuffer(req.body)) {
        return req.body.toString("utf8");
    }
    
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

function normalizeGithubPrivateKey(privateKey: string | undefined): string {
    if (!privateKey) {
        return "";
    }

    return privateKey
        .replace(/^"|"$/g, "")
        .replace(/\\n/g, "\n")
        .trim();
}

function extractJsonArray(text: string): string {
    const withoutCodeFence = text
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();

    const start = withoutCodeFence.indexOf("[");
    const end = withoutCodeFence.lastIndexOf("]");

    if (start === -1 || end === -1 || end < start) {
        throw new Error("AI response does not contain a valid JSON array.");
    }

    return withoutCodeFence.substring(start, end + 1);
}

function parseReviewComments(review: string): ReviewComment[] {
    const cleanJson = extractJsonArray(review);
    const parsed = JSON.parse(cleanJson);

    if (!Array.isArray(parsed)) {
        throw new Error("AI response JSON is not an array.");
    }

    return parsed
        .map((item: unknown) => {
            if (!item || typeof item !== "object") {
                return null;
            }

            const candidate = item as Record<string, unknown>;
            const file = typeof candidate.file === "string" ? candidate.file.trim() : "";
            const severity = typeof candidate.severity === "string" ? candidate.severity.trim() : "⚠ Low";
            const rawLine = candidate.line;
            const line =
                typeof rawLine === "number"
                    ? rawLine
                    : typeof rawLine === "string"
                    ? Number(rawLine)
                    : NaN;

            const rawComment = candidate.comment;
            
            if (
                !rawComment ||
                typeof rawComment !== "object" ||
                typeof (rawComment as Record<string, unknown>).issue !== "string" ||
                typeof (rawComment as Record<string, unknown>).suggestion !== "string" ||
                typeof (rawComment as Record<string, unknown>).rationale !== "string"
            ) {
                return null;
            }

            const comment = rawComment as { issue: string; suggestion: string; rationale: string };

            if (!file || !Number.isFinite(line)) {
                return null;
            }

            const safeLine = Math.trunc(line);
            if (safeLine < 1) {
                return null;
            }

            return {
                file,
                line: safeLine,
                severity: severity as ReviewComment["severity"],
                comment: {
                    issue: comment.issue.trim(),
                    suggestion: comment.suggestion.trim(),
                    rationale: comment.rationale.trim(),
                },
            };
        })
        .filter((item): item is ReviewComment => item !== null);
}

export async function handleWebhook(req: any, res: any) {
    const secret = process.env.WEBHOOK_SECRET || '';
    const signature = getHeaderValue(req.headers['x-hub-signature-256']);
    const payload = await getWebhookPayload(req);

    if (!secret) {
        return res.status(500).send('Webhook secret is not configured');
    }

    if (!signature) {
        return res.status(400).send('Missing signature');
    }

    if (!payload) {
        return res.status(400).send('Missing payload');
    }

    let isValid = false;
    try {
        isValid = await verify(secret, payload, signature);
    } catch (error) {
        console.error('Webhook signature verification error:', error);
        return res.status(401).send('Invalid signature payload');
    }

    if (!isValid) {
        return res.status(401).send('Invalid signature');
    }

    let body: any;
    try {
        body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(payload);
    } catch (error) {
        console.error('Error parsing webhook payload:', error);
        return res.status(400).send('Invalid JSON payload');
    }

    const { action, pull_request, installation } = body;

    if (action !== 'opened' && action !== 'synchronize') {
        res.status(200).send('Event ignored');
        return;
    }

    if (!installation || !installation.id) {
        return res.status(400).send('Invalid payload: missing installation information.');
    }

    try {
        const octokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: process.env.GITHUB_APP_ID,
                privateKey: normalizeGithubPrivateKey(process.env.GITHUB_APP_PRIVATE_KEY),
                installationId: installation.id,
            },
        });

        const loadingMessage = await octokit.rest.issues.createComment({
            owner: pull_request.base.repo.owner.login,
            repo: pull_request.base.repo.name,
            issue_number: pull_request.number,
            body: `TwinAI is reviewing this Pull request...\n\n${PATRICK_GIF}`,
        });

        try {
        const { data: diff } = await octokit.rest.pulls.get({
            owner: pull_request.base.repo.owner.login,
            repo: pull_request.base.repo.name,
            pull_number: pull_request.number,
            mediaType: { format: 'diff' },
        });

        const diffText = typeof diff === 'string' ? diff : String(diff);
        const review = await getAiReview('english', diffText, process.env.GEMINI_API_KEY, true);
        const reviewsArray = parseReviewComments(review);

        await octokit.rest.pulls.createReview({
            owner: pull_request.base.repo.owner.login,
            
            repo: pull_request.base.repo.name,
            pull_number: pull_request.number,
            event: 'COMMENT',
            body: "TwinAI Code Review!",
            comments: reviewsArray.map((item: ReviewComment) => ({
                path: item.file,
                line: item.line,
                body: `${item.severity}\n\n**🔍 Issue**\n${item.comment.issue}\n\n**💡 Suggestion**\n${item.comment.suggestion}\n\n**📝 Why**\n${item.comment.rationale}`,
            })),
        });
    } catch (error) {
        console.error('Error during review process:', error);
        await octokit.rest.issues.updateComment({
            owner: pull_request.base.repo.owner.login,
            repo: pull_request.base.repo.name,
            comment_id: loadingMessage.data.id,
            body: "TwinAI encountered an error while reviewing this Pull Request.",
        });
    } finally {
        await octokit.rest.issues.deleteComment({
            owner: pull_request.base.repo.owner.login,
            repo: pull_request.base.repo.name,
            comment_id: loadingMessage.data.id,
        });
    }

        return res.status(200).send('Review created');
    } catch (error) {
        console.error('Error handling webhook:', error);
        return res.status(500).send('Internal Server Error');
    }
}

export default async function webhook(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }
    return handleWebhook(req, res);
}
