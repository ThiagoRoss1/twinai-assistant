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