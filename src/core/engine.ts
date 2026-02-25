import { GoogleGenAI } from '@google/genai';
import { buildReviewPrompt, buildGithubPRReviewPrompt } from '../core/prompts.js';

export async function getAiReview(language: string, code: string, apiKey: string | undefined, isGithub: boolean = false): Promise<string> {
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set in environment variables.');
    }
    
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = isGithub
        ? buildGithubPRReviewPrompt(language, code)
        : buildReviewPrompt(language, code);

    const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
    });

    if (response && typeof response.text === 'string') {
        return response.text;
    }
    throw new Error('Unexpected response format from AI model.');
}

