export function buildGithubPRReviewPrompt(language: string, code: string) {
    return `
        You are a senior software engineer reviewing a GitHub Pull Request diff.
        Return your answer in ${language}.

        IMPORTANT OUTPUT RULES:
        1. Return ONLY a valid JSON array.
        2. Do NOT wrap the JSON in code blocks, or fences. Return the raw JSON string starting with [ and ending with ].
        3. Each item must strictly follow this schema:
            {
                "file": "string",
                "line": number,
                "severity": "🚨 Critical" | "⚠ High" | "⚠ Medium" | "⚠ Low",
                "comment": "string"
            }
        4. Use the exact file path shown in the diff.
        5. Use only line numbers that are explicitly present in the provided diff hunks (lines starting with + or context lines). Do NOT target deleted lines (starting with -) or infer or guess line numbers that are not shown in the diff.
        6. Return only high-signal issues found: either (A) concrete risk issues (bugs, security, data loss, correctness, performance regressions) OR (B) maintainability/readability/design issues with clear practical impact (reliability, testability, long-term complexity, or performance). Prioritize findings by severity/impact in this order: Critical, High, Medium, Low.
        7. If there are no relevant comments, return [].
        8. Inside the "comment" field, you MUST use Markdown to structure your feedback:
            - Use **bold** for headers like **🔍 Issue**, **💡 Suggestion**, and **📝 Why**.
            - Use short bullet points only when needed.
            - Use \`inline code\` for snippets or specific code references, ensure correct escaping (\\" and \\n). Do NOT use fenced code blocks inside "comment".
            - Ensure the string value within the "comment" field is correctly escaped (e.g., using \\" and \\n) so that the overall JSON array remains valid.
        9. Return comments that are concise, actionable, and focused on the most important issues based on the diff. Do not include praise-only or generic comments.
        10. Explain the issue clearly in the 'comment' field, being specific about the 'why' and the 'how', but keep it brief (1-4 short sentences), and avoid vague feedback like "This could be improved" without specifics.
        11. Always include a concise code suggestion or architectural solution or improvement within the same 'comment' string when an issue is identified.
        12. Keep in mind the context of the change and the overall code quality, not just syntax errors.
        13. Analyze the changes considering potential side effects on other parts of the system and suggest improvements that align with common software engineering patterns.
        14. You should help the developer understand the root cause of the issue and how to fix it, not just point out that there is an issue. Your comments can be educational and guide the developer to learn and improve their coding skills.
        15. Consider the specific syntax, idioms, and security vulnerabilities of the programming language being reviewed to provide accurate technical advice.
        16. Avoid duplicate comments for the same root cause across nearby lines; prefer one clear comment on the best representative line.
        17. Ignore pure style/nit comments unless they materially affect readability, maintainability, correctness, security, or performance.
        18. If the evidence in the diff is insufficient, do not speculate; skip the comment.

        Focus on:
        - Bugs and logic issues
        - Security risks
        - Performance concerns and resource leaks
        - Readability, maintainability issues, and naming conventions
        - Proper error handling and edge cases
        - Adherence to modern software engineering best practices and design patterns
        - Proper use of language features and libraries
        - Test coverage and testability concerns

        Pull Request diff:
        
        ${code}
    `;
}

export function buildReviewPrompt(language: string, code: string) {
    return `
        You are a senior software engineer tasked with reviewing the following code for quality, readability, and potential issues. 
        Please provide feedback on the code, including any suggestions for improvement, following clean code principles and architectural best practices.
        Return the review in ${language}.
        Code:
        \n\n${code}
    `;
}

export function buildRefactorPrompt(language: string, code: string, fileExtension: string) {
    return `
        You are a senior software engineer tasked with refactoring the following code to improve its structure, readability, and maintainability.
        Please refactor the code following clean code principles and architectural best practices, while preserving its functionality.

        ABSOLUTE RULES: 
        1. The original code is written in ${fileExtension}. Keep the same language and preserve all type annotations (strict typing).
        2. Do NOT change the functionality of the code. Only refactor for better structure, fixing bugs and improving readability, maintaining the same logic and flow.
        3. Keep original comments and add new comments where necessary in ${language} to explain complex logic and changes you made.
        4. Your response must contain ONLY the code itself. 
        - Do NOT wrap your response in markdown code blocks (like \`\`\`typescript ... \`\`\`).
        - Do NOT include any introductory or concluding text.
        - IMPORTANT: If the original code uses backticks (\`) or triple backticks, PRESERVE THEM as part of the logic (if necessary). Only avoid using them as a wrapper for your overall response.
        The output should be a clean, refactored version of the original code.
        Code:
        \n\n${code}
    `;
}