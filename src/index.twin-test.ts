#!/usr/bin/env node

/**
 * Ai Code Review Assistant
 * 
 * Refactored for better structure and maintainability while preserving original logic.
 */

import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildReviewPrompt, buildRefactorPrompt } from './core/prompts.js';
import { execSync } from 'child_process'; // Kept as per original imports
import { checkSyntax } from './utils/fileCommands.js';

// Initialize environment variables
config();

// Constants
const MAX_REFACTOR_RETRIES = 3;
const SERVICE_UNAVAILABLE_DELAY_MS = 5000;
const MODEL_NAME = 'gemini-flash-latest';

/**
 * AI Service Configuration
 */
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

/**
 * Helper to handle file reading with path resolution
 */
function readCodeFile(filePath: string): { code: string; fullPath: string } {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
    }
    const code = fs.readFileSync(fullPath, 'utf-8');
    return { code, fullPath };
}

/**
 * Cleans AI markdown response to extract pure code
 */
function cleanAiResponse(text: string): string {
    return text
        .replace(new RegExp('\\x60\\x60\\x60[a-z]*\\n', 'gi'), '')
        .replace(new RegExp('\\x60\\x60\\x60', 'g'), '')
        .trim();
}

/**
 * Reviews code using the AI model
 */
async function reviewCode(language: string, filePath: string): Promise<void> {
    try {
        const { code, fullPath } = readCodeFile(filePath);
        console.log(`Reviewing code in: ${fullPath}`);

        const prompt = buildReviewPrompt(language, code);
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
        });

        console.log(`Review for ${filePath}`);
        console.log(response.text);
    } catch (err) {
        console.error(`Error reviewing code: ${err}`);
    }
}

/**
 * Refactors code using the AI model with syntax validation and retry logic
 */
async function refactorCode(language: string, filePath: string): Promise<void> {
    let code: string;
    let fullPath: string;

    try {
        const fileData = readCodeFile(filePath);
        code = fileData.code;
        fullPath = fileData.fullPath;
    } catch (err) {
        console.error(err);
        return;
    }

    const ext = path.extname(fullPath);
    const twinFilePath = fullPath.replace(/(\.[a-zA-Z0-9]+)$/, '.twin$1');

    console.log(`Refactoring code in: ${fullPath}`);

    const basePrompt = buildRefactorPrompt(language, code, ext);
    let currentPrompt = basePrompt;
    let attempts = 0;

    while (attempts < MAX_REFACTOR_RETRIES) {
        try {
            const response = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: currentPrompt,
            });

            const aiText = response.text || '';
            const cleanText = cleanAiResponse(aiText);

            fs.writeFileSync(twinFilePath, cleanText, 'utf-8');
            console.log(`Refactored code written and saved to: ${twinFilePath}`);

            const result = checkSyntax(twinFilePath);

            if (result.success) {
                console.log('Code is syntactically correct. Refactoring complete.');
                break;
            }

            attempts++;
            console.error(`Syntax error detected after refactoring. Attempt ${attempts} of ${MAX_REFACTOR_RETRIES}. Retrying...`);
            console.error(`Syntax error details: ${result.error}`);

            if (attempts >= MAX_REFACTOR_RETRIES) {
                console.error('Maximum retry attempts reached.');
                break;
            }

            // Update prompt for the next retry attempt with error context
            currentPrompt = `
                    ${basePrompt}
                    
                    You generated code with syntax errors. The compiler error message is: ${result.error || 'Unknown syntax or linting error found.'}
                    
                    Please fix the syntax errors in the code, while preserving the original functionality and improvements you made, following the prompt instructions.
                    Previous Code:
                    ${cleanText}
                `;

        } catch (err: any) {
            if (err.message?.includes('503')) {
                console.log('Service unavailable. Retrying after a short delay...');
                await new Promise(resolve => setTimeout(resolve, SERVICE_UNAVAILABLE_DELAY_MS));
                continue; // Does not increment attempts for 503
            } else if (err.message?.includes('429')) {
                console.log('API Limit exceeded.');
                break;
            }
            console.error(`Error refactoring code: ${err}`);
            break;
        }
    }
}

/**
 * Main execution and argument parsing
 */
function main() {
    const [,, command, arg1, arg2] = process.argv;

    let language = 'english';
    let targetPath = '';

    // Logic for parsing optional language argument
    if (arg2) {
        language = arg1;
        targetPath = arg2;
    } else {
        targetPath = arg1;
    }

    if (command === 'review' && targetPath) {
        reviewCode(language, targetPath);
    } else if (command === 'refactor' && targetPath) {
        refactorCode(language, targetPath);
    } else {
        console.log('Usage: twinai [review|refactor] [language] <file-path>');
    }
}

main();