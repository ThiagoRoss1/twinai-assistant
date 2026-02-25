#!/usr/bin/env node
// Ai Code Review Assistant
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildRefactorPrompt } from '../core/prompts.js';
import { checkSyntax } from '../utils/fileCommands.js';
import { getAiReview } from '../core/engine.js';

config();

const [,, command, arg1, arg2] = process.argv;

let language = 'english';
let targetPath = '';

if (arg2) {
    language = arg1;
    targetPath = arg2;
} else {
    targetPath = arg1;
}

const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

async function reviewCode(language: string, filePath: string) {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        return;
    }

    const code = fs.readFileSync(fullPath, 'utf-8');

    console.log(`Reviewing code in: ${fullPath}`);

    try {
        const response = await getAiReview(language, code, process.env.GEMINI_API_KEY);
        console.log(`Review for ${filePath}`);
        console.log(response);
    } catch (error) {
        console.error(`Error reviewing code: ${error}`);
    }
}

async function refactorCode(language: string, filePath: string) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath);
    const twinFilePath = filePath.replace(/(\.[a-zA-Z0-9]+)$/, '.twin$1');

    console.log(`Refactoring code in: ${filePath}`);

    const prompt = buildRefactorPrompt(language, code, ext);

    let tries = 0;
    const maxRetries = 3;
    let actualPrompt = prompt;

    while (tries < maxRetries) {


        try {
            const response = await ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: actualPrompt,
            });
            
            const aiText = response.text || '';
            const cleanText = aiText
                .replace(new RegExp('\\x60\\x60\\x60[a-z]*\\n', 'gi'), '')
                .replace(new RegExp('\\x60\\x60\\x60', 'g'), '')
                .trim();

            fs.writeFileSync(twinFilePath, cleanText, 'utf-8');

            console.log(`Refactored code written and saved to: ${twinFilePath}`);

            const result = checkSyntax(twinFilePath);

            if (result.success) {
                console.log('Code is syntactically correct. Refactoring complete.');
                break;
            } else {
                tries++;
                console.error(`Syntax error detected after refactoring. Attempt ${tries} of ${maxRetries}. Retrying...`);
                console.error(`Syntax error details: ${result.error}`);

                if (tries >= maxRetries) {
                    console.error('Maximum retry attempts reached.');
                    break;
                }

                actualPrompt = `
                    ${prompt}
                    
                    You generated code with syntax errors. The compiler error message is: ${result.error || 'Unknown syntax or linting error found.'}
                    
                    Please fix the syntax errors in the code, while preserving the original functionality and improvements you made, following the prompt instructions.
                    Previous Code:
                    ${cleanText}
                `;
            }

        } catch (error: any) {
            if (error.message.includes('503')) {
                console.log('Service unavailable. Retrying after a short delay...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            } else if (error.message.includes('429')) {
                console.log('API Limit exceeded.');
                break;
            }
            console.error(`Error refactoring code: ${error}`);
            break;
        }
    }
}

if (command === 'review' && targetPath) {
    reviewCode(language, targetPath);
} else if (command === 'refactor' && targetPath) {
    refactorCode(language, targetPath);
} else {
    console.log('Usage: twinai [review|refactor] [language] <file-path>');
}
