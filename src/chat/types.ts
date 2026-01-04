export interface ReasoningConfig {
  effort: "low" | "medium" | "high";
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
  is_byok?: boolean;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
    audio_tokens?: number;
    video_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
    image_tokens?: number;
  };
  cost_details?: {
    upstream_inference_cost?: number | null;
    upstream_inference_prompt_cost?: number;
    upstream_inference_completions_cost?: number;
  };
}

// Tool call types
export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  index?: number;
  type: "function";
  function: ToolCallFunction;
}

// Reasoning detail types
export interface ReasoningDetail {
  id?: string;
  format?: string;
  index?: number;
  type: "reasoning.text" | "reasoning.encrypted";
  text?: string;
  data?: string;
  signature?: string;
}

// Message types
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<ContentPart> | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  refusal?: string | null;
  reasoning?: string | null;
  reasoning_details?: ReasoningDetail[];
  images?: GeneratedImage[];
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

// Image generation types (for output)
export interface GeneratedImage {
  type: "image_url";
  image_url: {
    url: string; // Base64 data URL
  };
}

// Response types
export interface ChatCompletionChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    refusal?: string | null;
    reasoning?: string | null;
    reasoning_details?: ReasoningDetail[];
    tool_calls?: ToolCall[];
    images?: GeneratedImage[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  native_finish_reason?: string;
  logprobs?: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  provider?: string;
  model: string;
  object: "chat.completion";
  created: number;
  choices: ChatCompletionChoice[];
  usage?: Usage;
  // Optional: when a prior tool-call iteration existed, we include its assistant message
  previous_tool_message?: ChatCompletionChoice["message"];
}

// Streaming delta types
export interface DeltaToolCall {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface StreamDelta {
  role?: "assistant";
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: ReasoningDetail[];
  tool_calls?: DeltaToolCall[];
  images?: GeneratedImage[];
}

export interface StreamChoice {
  index: number;
  delta: StreamDelta;
  finish_reason?: "stop" | "length" | "tool_calls" | "content_filter" | null;
  logprobs?: unknown;
}

export interface StreamChunk {
  id: string;
  provider?: string;
  model: string;
  object: "chat.completion.chunk";
  created: number;
  choices: StreamChoice[];
  usage?: Usage;
}

// ============================================================================
// OpenRouter API Client
// ============================================================================

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
  reasoning?: ReasoningConfig;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  modalities?: string[];
  [key: string]: unknown;
}

/**
 * Callback for streaming chunks
 */
export type StreamChunkCallback = (chunk: StreamChunk) => void;

export interface StreamingCallbacks {
  onChunk?: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' }) => void;
  onImage?: (image: GeneratedImage) => void;
  onError?: (error: Error) => void;
  onDone?: (result: { content: string; reasoning: string; reasoningDetails?: unknown[]; usage?: unknown }) => void;
}
