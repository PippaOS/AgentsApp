import { nanoid } from 'nanoid';
import { runCode } from '../../../code-runner';
import { agentStore } from '../../../db/store';
import type { ChatTool } from '../types';
import toolDescription from './run_code.md?raw';

export interface RunCodeArgs {
  code: string;
  why?: string;
  input?: Record<string, unknown>;
}

export const runCodeTool: ChatTool<RunCodeArgs> = {
  definition: {
    name: 'run_code',
    description: toolDescription,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Raw TypeScript/JavaScript code to execute.',
        }
      },
      required: ['code'],
    },
  },
  execute: async (args, ctx) => {
    const code = String((args as RunCodeArgs | undefined)?.code ?? '');
    if (!code.trim()) return 'run_code error: code is required';

    const publicId = `coderun_${nanoid()}`;

    // Get permissions from agent if available
    let permissions: string[] = [];
    if (ctx.agentPublicId) {
      const agent = agentStore.getByPublicId(ctx.agentPublicId);
      if (agent?.permissions) {
        try {
          permissions = JSON.parse(agent.permissions);
        } catch {
          // Invalid JSON, use empty array
        }
      }
    }

    try {
      const output = await runCode(publicId, code, { timeoutMs: 15_000, permissions });
      return output;
    } catch (e) {
      return `run_code error: ${(e as Error)?.message ?? 'Code execution failed'}`;
    }
  },
};
