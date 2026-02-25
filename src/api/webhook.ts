import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { verify } from "@octokit/webhooks-methods";
import { getAiReview } from "../core/engine.js";

type ReviewComment = {
    file: string;
    line: number;
    comment: string;
};

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
            const comment = typeof candidate.comment === "string" ? candidate.comment.trim() : "";
            const rawLine = candidate.line;
            const line =
                typeof rawLine === "number"
                    ? rawLine
                    : typeof rawLine === "string"
                    ? Number(rawLine)
                    : NaN;

            if (!file || !comment || !Number.isFinite(line)) {
                return null;
            }

            const safeLine = Math.trunc(line);
            if (safeLine < 1) {
                return null;
            }

            return {
                file,
                line: safeLine,
                comment,
            };
        })
        .filter((item): item is ReviewComment => item !== null);
}

export async function handleWebhook(req: any, res: any) {
    const secret = process.env.WEBHOOK_SECRET || '';
    const signature = req.headers['x-hub-signature-256'] as string;
    
    const PATRICK_GIF = "![PatrickLoading](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZmx6cmRiZ2Nyb203ampmOXJjYWo0ZnZvanRzZTd0MnUzNGt6cmlyZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Ij5kcfI6YwcPCN26U2/giphy.gif)";

    if (!signature) {
        res.status(400).send('Missing signature');
        return;
    }

    const isValid = verify(secret, req.rawBody, signature);

    if (!isValid) {
        res.status(401).send('Invalid signature');
        return;
    }
    
    const { action, pull_request, installation } = req.body;

    if (action !== 'opened' && action !== 'synchronize') {
        res.status(200).send('Event ignored');
        return;
    }

    try {
        const octokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: process.env.GITHUB_APP_ID,
                privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
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
            comments: reviewsArray.map((comment: any) => ({
                path: comment.file,
                line: comment.line,
                body: comment.comment,
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
