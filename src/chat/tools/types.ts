/**
 * Shared types for chat tools (OpenRouter Chat Completions API function tools).
 *
 * A "tool" here is:
 * - a JSON-schema definition you send to OpenRouter (`definition`)
 * - a local executor you run when the model emits a tool call (`execute`)
 */

export type ToolDefinition = {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
};

export type ToolContext = {
  agentPublicId?: string;
};

// Invariant: chat tool execution always produces tool message `content` as a string.
// (Tools can print/format however they want; the chat system treats the result as text.)
export interface ChatTool<Args = unknown> {
  definition: ToolDefinition;
  execute: (args: Args, ctx: ToolContext) => Promise<string> | string;
}
