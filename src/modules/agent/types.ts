/**
 * TypeScript types for the ChatSidebar module.
 * These match the JSON API responses from the Go backend.
 */

export interface ChatData {
  id: string;
  title: string;
  created_at: string;
  agent_public_id?: string | null;
  agent_name?: string | null;
  agent_avatar_url?: string | null;
  messages: ChatMessage[];
  context_items: ContextItem[];
  models: Model[];
  total_cost: number;
  model?: string | null;
  reasoning?: string | null;
  last_model?: string;
  last_reasoning?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string;
  reasoning_details_json?: string;
  response_json?: string;
  model?: string;
  message_type: 'text' | 'chat_context' | 'tool_call' | 'tool_result' | 'image_generation_call' | 'error';
  entity_id?: string;
  entity?: Entity;
  tool_calls?: ToolCall[]; // Deprecated - use tool_call_id, tool_name, tool_input, tool_output
  tool_call_id?: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  cost?: number;
  context_public_id?: string;
  created_at: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

export interface Entity {
  id: string;
  type: 'page' | 'file' | 'element' | 'image';
  name: string;
  parent_name?: string;
  page_number?: number;
}

export interface ContextItem {
  id: string;
  message_id?: string;
  entity?: Entity;
  include_content: boolean;
  include_image: boolean;
  include_text: boolean;
  image_detail: string;
}

export interface Model {
  id: string;
  name: string;
  openrouter_id?: string;
  created_at: string;
}

export interface ChatListItem {
  id: string;
  title: string;
  created_at: string;
}

/**
 * Streaming event types for temporal ordering
 */
export type StreamingEventType = 'content' | 'reasoning' | 'tool_call' | 'image';

export interface StreamingEvent {
  id: string;
  sequence: number;
  type: StreamingEventType;
  data: StreamingEventData;
}

export type StreamingEventData =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      name: string;
      arguments: string;
      status: 'streaming' | 'ready';
    }
  | {
      type: 'image';
      imageUrl: string; // Base64 data URL
    };

/**
 * Streaming state for real-time message updates
 * Uses event-based stream to preserve temporal order
 */
export interface StreamingState {
  isStreaming: boolean;
  events: StreamingEvent[];
}

