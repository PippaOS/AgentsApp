import { ipcMain } from 'electron';
import { runCode } from './index';

/**
 * Register IPC handlers for code runner operations (main-process).
 *
 * The contract is NATS Request-Reply:
 * - Request: { publicId: string, code: string }
 * - Response: { output: string, exitCode: number, error?: string }
 *
 * All execution happens in-memory via NATS. No file I/O.
 */
export function registerCodeRunnerHandlers(): void {
  ipcMain.handle('code-runner:run', async (_evt, publicId: string, code: string, opts?: { timeoutMs?: number; permissions?: string[] }) => {
    try {
      const output = await runCode(publicId, code, opts);
      return { output };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        output: '', 
        error: errorMessage,
        exitCode: 1 
      };
    }
  });
}
