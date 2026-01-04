import { connect, ErrorCode, NatsConnection, JSONCodec } from 'nats';
import path from 'node:path';
import os from 'node:os';

export type RunRequest = {
  publicId: string;
  code: string;
  permissions?: string[];
};

export type RunResponse = {
  output: string;
  exitCode: number;
  error?: string;
};

export type RunOptions = {
  timeoutMs?: number;
  permissions?: string[];
};

/**
 * Legacy config for workspace sync (still uses shared directory).
 * Code execution now uses NATS and doesn't need this.
 */
export type CodeRunnerConfig = {
  sharedDir: string;
};

/**
 * Get code runner config (legacy, used by workspace sync).
 * Code execution no longer uses file-based approach.
 */
export function getCodeRunnerConfig(): CodeRunnerConfig {
  const defaultSharedDir =
    process.platform === 'win32' ? path.join(os.tmpdir(), 'pippachat-shared') : '/tmp/pippachat-shared';
  const sharedDir = process.env.PIPPACHAT_SHARED_DIR || defaultSharedDir;
  return { sharedDir };
}

let nc: NatsConnection | null = null;
const jsonCodec = JSONCodec<RunRequest>();
const responseCodec = JSONCodec<RunResponse>();

/**
 * Get or create a NATS connection.
 * Uses waitOnFirstConnect to handle startup race conditions.
 */
async function getConnection(): Promise<NatsConnection> {
  if (nc && !nc.isClosed()) {
    return nc;
  }

  nc = await connect({
    servers: '127.0.0.1:4222',
    waitOnFirstConnect: true,
    reconnectTimeWait: 100,
    maxReconnectAttempts: -1, // Infinite reconnects
  });

  return nc;
}

/**
 * Execute code via NATS Request-Reply pattern.
 * 
 * @param publicId - Unique identifier for this execution
 * @param code - The TypeScript/JavaScript code to execute
 * @param opts - Options including timeout (defaults to 15 seconds)
 * @returns The execution result with output, exitCode, and optional error
 */
export async function runCode(
  publicId: string,
  code: string,
  opts: RunOptions = {}
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const connection = await getConnection();

  const request: RunRequest = {
    publicId,
    code,
    permissions: opts.permissions,
  };

  try {
    const response = await connection.request(
      'runner.execute',
      jsonCodec.encode(request),
      { timeout: timeoutMs }
    );

    const result = responseCodec.decode(response.data);
    
    // Combine output with error if present
    let output = result.output || '';
    if (result.error) {
      output = output ? `${output}\n[Error]: ${result.error}` : `[Error]: ${result.error}`;
    }

    // If exit code is non-zero, include it in the output
    if (result.exitCode !== 0) {
      output = output || `Process exited with code ${result.exitCode}`;
    }

    return output;
  } catch (error) {
    // Prefer structured NATS error codes when available.
    const maybeNatsErr = error as unknown as { code?: unknown; message?: unknown };
    if (maybeNatsErr && typeof maybeNatsErr.code === 'string') {
      const code = maybeNatsErr.code;
      const msg = typeof maybeNatsErr.message === 'string' ? maybeNatsErr.message : '';
      if (code === ErrorCode.Timeout) {
        throw new Error(`Code execution timed out after ${timeoutMs}ms`);
      }
      if (code === ErrorCode.NoResponders) {
        throw new Error('Runner unavailable (no responders on runner.execute). Is the Go runner running?');
      }
      throw new Error(`Code execution failed: ${msg || code}`);
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('timeout') || errorMessage.includes('deadline')) {
      throw new Error(`Code execution timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Code execution failed: ${errorMessage}`);
  }
}

/**
 * Close the NATS connection (useful for cleanup).
 */
export async function closeConnection(): Promise<void> {
  if (nc && !nc.isClosed()) {
    await nc.close();
    nc = null;
  }
}
