import { execSync } from 'child_process';
import path from 'path';

export function checkSyntax(filePath: string): { success: boolean; error?: string } {
    const ext = path.extname(filePath);

    const checkCommands: Record<string, string> = {
        '.js': `node --check "${filePath}"`,
        '.ts': `npx tsc "${filePath}" --noEmit --esModuleInterop --skipLibCheck`,
    };

    const command = checkCommands[ext];

    if (!command) {
        return { success: true }; // No syntax check for unsupported file types, consider it a success
    }

    try {
        execSync(command, { stdio: 'pipe' });

        try {
            console.log(`Running linter for additional syntax checks on: ${filePath}`);
            const lintCommands: Record<string, string> = {
                '.js': `npx eslint "${filePath}" --no-error-on-unmatched-pattern`,
                '.ts': `npx eslint "${filePath}" --no-error-on-unmatched-pattern`,
            };

            const lintCommand = lintCommands[ext];
            if (lintCommand) {
                console.log(`Linting code with command: ${lintCommand}`);
                execSync(lintCommand, { stdio: 'pipe' });
            }
        } catch (lintError: any) {
            const detailedError = lintError.stdout?.toString() || (lintError instanceof Error ? lintError.message : String(lintError));
            return { success: false, error: detailedError };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}