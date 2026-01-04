/**
 * Chat Completions API tool definition: run_tool
 *
 * This is the single static "dispatcher" tool. The model calls this tool with a `tool_id`
 * (which is the tool's `public_id` in the DB) and an arbitrary `input` object.
 *
 * NOTE: This intentionally does not expose dynamic tools directly to the model yet; instead,
 * the model always calls `run_tool`, and the app resolves + executes the selected tool.
 */

import { nanoid } from 'nanoid';
import { toolStore } from '../../../db/tool-store';
import { runCode } from '../../../code-runner';
import type { ChatTool } from '../types';
import toolDescription from './run_tool.md?raw';

export interface RunToolArgs {
  tool_id: string;
  why?: string;
  input?: Record<string, unknown>;
}

function buildRunnerProgram(toolCode: string, argsJson: string): string {
  // The user's tool code is imported as a data: URL module.
  // It may be:
  // - a module with top-level code (prints whatever it wants)
  // - optionally exporting default(input, ctx) which we will call (without forcing output format)
  return `
function __toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const __argsJson = ${JSON.stringify(argsJson)};
const __args = JSON.parse(__argsJson);
const __input = __args.input ?? {};
const __ctx = { why: __args.why ?? "" };

// Provide a stable global for tools to read from (concept phase).
globalThis.pippachat = { input: __input, ctx: __ctx, tool_id: __args.tool_id ?? "" };

const __toolCode = ${JSON.stringify(toolCode)};
const __url = "data:text/typescript;base64," + __toBase64(__toolCode);
const __mod = await import(__url);

// If a default export exists and is callable, run it. Otherwise, importing the module
// is considered "running" it (top-level side effects / console output).
if (typeof __mod.default === "function") {
  await __mod.default(__input, __ctx);
}
`.trimStart();
}

export const runTool: ChatTool<RunToolArgs> = {
  definition: {
    name: 'run_tool',
    description: toolDescription,
    parameters: {
      type: 'object',
      properties: {
        tool_id: {
          type: 'string',
          description: 'The tool public id to execute (tools.public_id).',
        },
        why: {
          type: 'string',
          description: 'Short explanation for why the tool is being run.',
        },
        input: {
          type: 'object',
          description: 'Tool-specific input payload (validated later; currently passed through as-is).',
          additionalProperties: true,
        },
      },
      required: ['tool_id'],
    },
  },
  execute: async (args) => {
    const toolId = (args?.tool_id ?? '').trim();
    if (!toolId) return 'run_tool error: tool_id is required';

    const tool = toolStore.getByPublicId(toolId);
    if (!tool) {
      return `run_tool error: unknown tool_id: ${toolId}`;
    }

    // Runner public id must be path-safe. nanoid is safe for filenames/URLs.
    const publicId = `toolrun_${nanoid()}`;
    const payload = JSON.stringify({ tool_id: toolId, why: args.why ?? '', input: args.input ?? {} });
    const program = buildRunnerProgram(tool.code_ts ?? '', payload);

    try {
      const output = await runCode(publicId, program, { timeoutMs: 30_000 });
      return output;
    } catch (e) {
      return `run_tool error: ${(e as Error)?.message ?? 'Tool execution failed'}`;
    }
  },
};
