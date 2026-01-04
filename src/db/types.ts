// Database types
export interface Model {
  id: number;
  public_id: string;
  name: string;
  created_at: string;
  
  // OpenRouter metadata
  openrouter_id?: string;
  canonical_slug?: string;
  hugging_face_id?: string | null;
  openrouter_created?: number;
  description?: string | null;
  context_length?: number | null;
  
  // Architecture
  modality?: string | null;
  input_modalities?: string; // JSON array
  output_modalities?: string; // JSON array
  tokenizer?: string | null;
  instruct_type?: string | null;
  
  // Pricing (all string except discount)
  price_prompt?: string;
  price_completion?: string;
  price_request?: string | null;
  price_image?: string | null;
  price_image_token?: string | null;
  price_image_output?: string | null;
  price_audio?: string | null;
  price_input_audio_cache?: string | null;
  price_web_search?: string | null;
  price_internal_reasoning?: string | null;
  price_input_cache_read?: string | null;
  price_input_cache_write?: string | null;
  price_discount?: number | null;
  
  // Top provider info
  top_provider_context_length?: number | null;
  top_provider_max_completion_tokens?: number | null;
  top_provider_is_moderated?: number;
  
  // Capability flags
  supports_tools?: number;
  supports_reasoning?: number;
  supports_image_input?: number;
  supports_image_output?: number;
  supports_structured_outputs?: number;
  
  // JSON storage
  supported_parameters?: string; // JSON array
  default_parameters?: string | null; // JSON object
  full_metadata?: string | null; // Complete OpenRouter response
  
  // Timestamps
  last_synced_at?: string;
  updated_at?: string;
}

export interface CreateModelInput {
  name: string;
  openrouter_id?: string;
}

export interface Agent {
  id: number;
  public_id: string;
  name: string;
  prompt: string;
  allow_parallel_tool_calls: number; // 0/1
  can_run_code: number; // 0/1
  permissions: string; // JSON array of permission flags, e.g., '["--allow-net=api.github.com", "--allow-read=/tmp"]'
  avatar_url?: string | null;
  model?: string | null;
  reasoning?: string | null;
}

export interface CreateAgentInput {
  name: string;
  prompt?: string;
}

export interface Tool {
  id: number;
  public_id: string;
  name: string;
  description?: string | null;
  input_schema_json: string;
  code_ts: string;
  created_at: string;
  updated_at: string;
}

export interface CreateToolInput {
  name: string;
  description?: string | null;
  input_schema_json?: string;
  code_ts?: string;
}

export interface UpdateToolInput {
  name?: string;
  description?: string | null;
  input_schema_json?: string;
  code_ts?: string;
}

// OpenRouter API types
export interface OpenRouterModel {
  id: string;
  canonical_slug: string;
  hugging_face_id: string | null;
  name: string;
  created: number;
  description: string;
  context_length: number | null;
  architecture: {
    modality: string | null;
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
    image_token?: string;
    image_output?: string;
    audio?: string;
    input_audio_cache?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
    input_cache_write?: string;
    discount?: number;
  };
  top_provider: {
    context_length: number | null;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  per_request_limits: {
    prompt_tokens: number;
    completion_tokens: number;
  } | null;
  supported_parameters: string[];
  default_parameters: {
    temperature?: number | null;
    top_p?: number | null;
    frequency_penalty?: number | null;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface Chat {
  id: number;
  public_id: string;
  title: string;
  agent_public_id?: string | null;
  model?: string | null;
  reasoning?: string | null;
  created_at: string;
}

export interface ChatWithAgent extends Chat {
  agent_name?: string | null;
  agent_avatar_url?: string | null;
  last_message_content?: string | null;
  last_message_role?: string | null;
  last_message_at?: string | null;
}

export interface CreateChatInput {
  title?: string;
  agent_public_id?: string;
}

export interface Message {
  id: number;
  public_id: string;
  chat_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string;
  reasoning_details_json?: string | null;
  response_json?: string | null;
  model?: string;
  message_type: 'text' | 'chat_context' | 'tool_call' | 'tool_result' | 'image_generation_call' | 'error';
  entity_id?: string;
  tool_calls_json?: string; // Deprecated - use tool_name, tool_input, tool_output
  tool_call_id?: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  cost?: number;
  chat_context_id?: number | null;
  created_at: string;
}

export interface CreateMessageInput {
  chat_id: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning?: string;
  reasoning_details_json?: string;
  response_json?: string;
  model?: string;
  message_type?: 'text' | 'chat_context' | 'tool_call' | 'tool_result' | 'image_generation_call' | 'error';
  entity_id?: string;
  tool_calls_json?: string; // Deprecated - use tool_name, tool_input, tool_output
  tool_call_id?: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  cost?: number;
  chat_context_id?: number | null;
}

export interface ChatContextItem {
  id: number;
  public_id: string;
  chat_id: number;
  entity_id: string;
  message_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChatContextItemWithFile extends ChatContextItem {
  file_name?: string | null;
  file_public_id?: string | null;
  image_public_id?: string | null;
  page_public_id?: string | null;
  page_number?: number | null;
  parent_file_name?: string | null;
  message_public_id?: string | null;
}

export interface CreateChatContextInput {
  chat_id: number;
  entity_id: string;
  message_id?: number | null;
}

// API call logging
export interface APICall {
  id: number;
  public_id: string;
  chat_id?: number | null;
  model: string;
  model_actual?: string | null;
  request_json?: string | null;
  response_json?: string | null;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cached_tokens?: number | null;
  reasoning_tokens?: number | null;
  latency_ms?: number | null;
  duration_ms?: number | null;
  provider?: string | null;
  finish_reason?: string | null;
  is_streaming: number;
  has_tools: number;
  has_images: number;
  cost?: number | null;
  is_byok: number;
  created_at: string;
  completed_at?: string | null;
}

export interface CreateAPICallInput {
  chat_id?: number | null;
  model: string;
  request_json?: string | null;
  is_streaming?: boolean;
  has_tools?: boolean;
  has_images?: boolean;
}

export interface UpdateAPICallInput {
  public_id: string;
  status?: string;
  model_actual?: string | null;
  request_json?: string | null;
  response_json?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  cached_tokens?: number | null;
  reasoning_tokens?: number | null;
  latency_ms?: number | null;
  duration_ms?: number | null;
  provider?: string | null;
  finish_reason?: string | null;
  cost?: number | null;
  is_byok?: boolean;
  has_tools?: boolean;
  has_images?: boolean;
  completed_at?: string | null;
}

export interface APICallToolCall {
  id: number;
  public_id: string;
  api_call_id: number;
  tool_call_id: string;
  tool_name: string;
  arguments_json: string;
  result_json?: string | null;
  status: string;
  error_message?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface CreateAPICallToolCallInput {
  api_call_id: number;
  tool_call_id: string;
  tool_name: string;
  arguments_json: string;
  status?: string;
  result_json?: string | null;
  error_message?: string | null;
  duration_ms?: number | null;
}

export interface APICallEntity {
  id: number;
  api_call_id: number;
  entity_id: string;
  entity_type: string;
  message_index: number;
  content_index: number;
  detail?: string | null;
  created_at: string;
}

export interface CreateAPICallEntityInput {
  api_call_id: number;
  entity_id: string;
  entity_type: string;
  message_index: number;
  content_index: number;
  detail?: string | null;
}

export interface Config {
  key: string;
  value: string;
  updated_at: string;
}

export interface File {
  id: number;
  public_id: string;
  name: string;
  original_path: string;
  storage_path: string;
  hash: string;
  total_pages: number;
  include_data: number;
  created_at: string;
}

export interface CreateFileInput {
  name: string;
  original_path: string;
  storage_path: string;
  hash: string;
  total_pages?: number;
}

export interface Page {
  id: number;
  file_id: number;
  public_id: string;
  image_path: string | null;
  text_content: string | null;
  include_images: number;
  include_text: number;
  include_data: number;
  created_at: string;
}

export interface CreatePageInput {
  file_id: number;
  image_path?: string;
  text_content?: string;
  include_images?: boolean;
  include_text?: boolean;
  include_data?: boolean;
}

export interface Image {
  id: number;
  public_id: string;
  file_name: string;
  file_size: number;
  created_at: string;
}

export interface CreateImageInput {
  file_name: string;
  file_size: number;
}

// Runner / tool execution logs
export interface CodeRun {
  id: number;
  public_id: string;
  input_ts: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  output?: string | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCodeRunInput {
  input_ts: string;
  status?: CodeRun['status'];
}

