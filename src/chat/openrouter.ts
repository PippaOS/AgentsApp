/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * OpenRouter Chat Completions API integration for streaming chat
 */


import {
  messageStore,
  chatStore,
  apiCallStore,
  apiCallToolCallStore,
  agentStore,
} from '../db/store';
import { fileStore } from '../db/file-store';
import { imageStore } from '../db/image-store';
import { buildPdfFileMessage, buildPdfPageMessage, buildImageMessage, ContentPart } from './pdf-messages';
import {
  getOpenRouterApiKey,
  sanitizeRequestJson,
  messagesContainImages,
  executeToolCall,
  getToolsForChatCompletions,
  getAgentCapabilities,
  buildSystemMessage,
  buildContentParts,
  mergeReasoningDetails,
} from './util';
import { ChatCompletionRequest, StreamingCallbacks, ChatCompletionResponse, ChatMessage, GeneratedImage, ReasoningDetail, StreamChunk, StreamChunkCallback, Usage } from './types';

const MAX_TOOL_ITERATIONS = 10;

/**
 * Send a streaming request to OpenRouter Chat Completions API
 * Fires callback for each chunk as it arrives
 */
export async function sendStreamingChatCompletion(
  apiKey: string,
  request: ChatCompletionRequest,
  onChunk: StreamChunkCallback,
  signal?: AbortSignal,
): Promise<void> {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  
  const payload = {
    ...request,
    stream: true,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API error: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    let done = false;
    while (!done) {
      // Check for cancellation
      if (signal?.aborted) {
        reader.cancel();
        throw new Error('Request cancelled');
      }
      
      const result = await reader.read();
      done = result.done;
      
      if (done) break;

      buffer += decoder.decode(result.value, { stream: true });
      
      // Process complete SSE messages
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          
          if (jsonStr.trim() === "[DONE]") {
            continue;
          }
          
          try {
            const chunk = JSON.parse(jsonStr) as StreamChunk;
            // write to file in root called log as JSONL with the chunk
            // fs.appendFileSync('log.jsonl', JSON.stringify(chunk) + '\n');
            onChunk(chunk);
          } catch {
            // Failed to parse chunk
          }
        }
      }
    }
    
    // Process remaining buffer
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6);
          if (jsonStr.trim() !== "[DONE]") {
            try {
              const chunk = JSON.parse(jsonStr) as StreamChunk;
              onChunk(chunk);
            } catch {
              // Failed to parse chunk
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Build message history for Chat Completions API
 * @param chatId - The chat ID
 */
export function buildMessages(chatId: number): ChatMessage[] {
  const messages = messageStore.getByChatId(chatId);
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    // Skip error messages - they should not be sent to the API
    if (msg.message_type === 'error') {
      continue;
    }
    // Handle chat_context messages - PDF content
    if (msg.message_type === 'chat_context' && msg.entity_id) {
      const file = fileStore.getByPublicId(msg.entity_id);
      if (file) {
        const pdfParts = buildPdfFileMessage(msg.entity_id);
        if (pdfParts && pdfParts.length > 0) {
          result.push({
            role: 'user',
            content: pdfParts,
          });
        }
        continue;
      }
      
      const page = fileStore.getPageByPublicId(msg.entity_id);
      if (page) {
        const pdfParts = buildPdfPageMessage(msg.entity_id);
        if (pdfParts && pdfParts.length > 0) {
          result.push({
            role: 'user',
            content: pdfParts,
          });
        }
        continue;
      }
      
      // Check if it's an image
      const image = imageStore.getByPublicId(msg.entity_id);
      if (image) {
        const imageParts = buildImageMessage(msg.entity_id);
        if (imageParts && imageParts.length > 0) {
          result.push({
            role: 'user',
            content: imageParts,
          });
        }
        continue;
      }
      continue;
    }

    // Reconstruct tool call + result messages
    if (msg.message_type === 'tool_call' && msg.tool_call_id && msg.tool_name) {
      // Assistant tool call message
      let reasoningDetails: ReasoningDetail[] | undefined;
      if (msg.reasoning_details_json) {
        try {
          reasoningDetails = JSON.parse(msg.reasoning_details_json);
        } catch {
          reasoningDetails = undefined;
        }
      }

      const toolCallMessage: ChatMessage = {
        role: 'assistant',
        content: msg.content || null,
        refusal: null,
        reasoning: msg.reasoning || null,
        reasoning_details: reasoningDetails,
        tool_calls: [
          {
            id: msg.tool_call_id,
            index: 0,
            type: 'function',
            function: {
              name: msg.tool_name,
              arguments: msg.tool_input || '{}',
            },
          },
        ],
      };

      result.push(toolCallMessage);

      // Tool result message (if we have output)
      if (msg.tool_output) {
        result.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.tool_output,
        });
      }

      continue;
    }
    
    if (msg.role === 'user') {
      // Parse content as JSON array (always stored in array format)
      let parsedContent: Array<ContentPart> | null = null;
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed)) {
          parsedContent = parsed.length > 0 ? parsed as Array<ContentPart> : [];
        }
      } catch {
        // Invalid JSON - should not happen with new format, but handle gracefully
        parsedContent = null;
      }
      
      result.push({
        role: 'user',
        content: parsedContent,
      });
    } else if (msg.role === 'assistant') {
      // Parse response_json (contains complete message as returned by OpenRouter)
      if (!msg.response_json) {
        console.error('Assistant message missing response_json:', msg.id);
        continue;
      }
      
      try {
        const storedMessage = JSON.parse(msg.response_json) as {
          role: 'assistant';
          content: string | null;
          refusal?: string | null;
          reasoning?: string | null;
          reasoning_details?: ReasoningDetail[];
          tool_calls?: Array<{
            id: string;
            index: number;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
          images?: GeneratedImage[];
        };
        
        // Use the stored message as-is (the format OpenRouter returned)
        result.push({
          role: 'assistant',
          content: storedMessage.content,
          refusal: storedMessage.refusal ?? null,
          reasoning: storedMessage.reasoning ?? null,
          reasoning_details: storedMessage.reasoning_details,
          tool_calls: storedMessage.tool_calls?.map((tc) => ({
            id: tc.id,
            index: tc.index,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
          images: storedMessage.images,
        });
      } catch (error) {
        console.error('Failed to parse assistant message response_json:', msg.id, error);
        continue;
      }
    } else if (msg.role === 'tool') {
      // Tool result message
      result.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id || '',
        content: msg.content,
      });
    } else if (msg.role === 'system') {
      result.push({
        role: 'system',
        content: msg.content,
      });
    }
  }

  return result;
}


/**
 * Stream a chat completion and persist API call metadata
 */
export async function streamChatCompletion(
  chatId: number,
  userContent: string,
  images: Array<{ id: string; dataUrl: string }> | undefined,
  callbacks: StreamingCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const dbg = (...args: unknown[]) => console.log('[chat-debug][main][openrouter]', ...args);
  const chat = chatStore.getById(chatId);
  if (!chat) {
    dbg('streamChatCompletion: chat not found', { chatId });
    callbacks.onError?.(new Error('Chat not found'));
    return;
  }

  // Use model and reasoning from chat record (inherited from agent)
  // chat.model contains the openrouter_id directly (e.g., "bytedance-seed/seedream-4.5")
  if (!chat.model) {
    dbg('streamChatCompletion: no model available', { chatId, chatModel: chat.model });
    callbacks.onError?.(new Error('No model specified for chat'));
    return;
  }
  const model = chat.model; // After the check, TypeScript knows this is non-null
  const reasoning = (chat.reasoning || '') as 'low' | 'medium' | 'high' | '';

  dbg('streamChatCompletion: start', {
    chatId,
    userContentLen: userContent?.length ?? 0,
    model,
    reasoning,
    images: images?.length ?? 0,
    aborted: abortSignal?.aborted ?? false,
  });

  // Chats are scoped to an agent via chats.agent_public_id.
  const agentPublicId = (chat as any)?.agent_public_id as string | null | undefined;
  if (!agentPublicId) {
    dbg('streamChatCompletion: chat missing agent_public_id', { chatId });
    callbacks.onError?.(new Error('Chat has no agent assigned'));
    return;
  }

  // Auto-set title from first message
  if (!chat.title) {
    const title = userContent.length > 30 ? userContent.substring(0, 30) : userContent;
    chatStore.updateTitleById(chat.id, title);
  }

  // Build content for storage: always use JSON array format
  const contentParts = buildContentParts(userContent, images);
  const storedContent = JSON.stringify(contentParts);

  // Save user message
  dbg('streamChatCompletion: saving user message', { chatId: chat.id });
  messageStore.create({
    chat_id: chat.id,
    role: 'user',
    content: storedContent,
    message_type: 'text',
  });

  // Build message history
  const inputMessages: ChatMessage[] = buildMessages(chat.id);

  // Agent prompt is the system prompt
  const agent = agentStore.getByPublicId(agentPublicId);
  const agentPrompt = (agent?.prompt ?? '').trim();
  if (!agentPrompt) {
    dbg('streamChatCompletion: agent prompt missing', { agentPublicId });
    callbacks.onError?.(new Error('Agent prompt not configured'));
    return;
  }

  // Remove any existing system messages and replace with the agent prompt
  for (let i = inputMessages.length - 1; i >= 0; i--) {
    if (inputMessages[i]?.role === 'system') {
      inputMessages.splice(i, 1);
    }
  }
  
  const { canRunCode: initialCanRunCode, prompt: initialPrompt } = getAgentCapabilities(agentPublicId);
  inputMessages.unshift(buildSystemMessage(initialPrompt, initialCanRunCode));

  // Tools are controlled solely by agent.can_run_code (re-evaluated per iteration).
  let tools = initialCanRunCode ? getToolsForChatCompletions() : [];

  const hasImages = messagesContainImages(chat.id);

  let accumulatedContent = '';
  let accumulatedReasoning = '';
  let lastApiCallPublicId: string | null = null; // Track for error handling
  let lastToolAssistantResponse: ChatCompletionResponse | null = null;

  try {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      callbacks.onError?.(new Error('OpenRouter API key not configured'));
      return;
    }

    let iteration = 0;
    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      // Agent settings can change mid-chat; re-read each iteration.
      const { canRunCode, prompt: currentAgentPrompt } = getAgentCapabilities(agentPublicId);
      tools = canRunCode ? getToolsForChatCompletions() : [];

      // Keep system prompt in sync with the current agent prompt + capabilities.
      if (inputMessages.length > 0 && inputMessages[0]?.role === 'system') {
        inputMessages[0] = buildSystemMessage(currentAgentPrompt, canRunCode);
      }

      // Per-iteration state
      const iterationStartedAt = performance.now();
      let firstChunkAt: number | null = null;
      let iterationUsage: Usage | undefined;
      let iterationModel: string = model;
      let iterationProvider: string | undefined;
      let iterationFinishReason: string | null = null;

      const params: ChatCompletionRequest = {
        model,
        messages: inputMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,
      };

      if (reasoning) {
        params.reasoning = { effort: reasoning };
      }

    

      // Create API call record for THIS iteration
      const requestJsonForLogging = sanitizeRequestJson(JSON.stringify(params));
      const apiCall = apiCallStore.create({
        chat_id: chat.id,
        model,
        request_json: requestJsonForLogging,
        is_streaming: true,
        has_tools: tools.length > 0,
        has_images: hasImages,
      });
      lastApiCallPublicId = apiCall.public_id;

      // Track tool calls being streamed
      const streamingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
      const streamingImages: GeneratedImage[] = [];
      let currentIterationContent = '';
      let currentIterationReasoning = '';
      let currentIterationReasoningDetails: ReasoningDetail[] = [];

      // Stream the response
      await sendStreamingChatCompletion(apiKey, params, (chunk: StreamChunk) => {
        const now = performance.now();

        // Track model/provider from response
        if (chunk.model) iterationModel = chunk.model;
        if (chunk.provider) iterationProvider = chunk.provider;

        for (const choice of chunk.choices) {
          // Track finish reason
          if (choice.finish_reason) {
            iterationFinishReason = choice.finish_reason;
          }

          const delta = choice.delta;

          // Handle content delta
          if (delta.content) {
            if (firstChunkAt === null) firstChunkAt = now;
            currentIterationContent += delta.content;
            accumulatedContent += delta.content;
            callbacks.onChunk?.(delta.content);
          }

          // Handle reasoning delta (text accumulation for display)
          if (delta.reasoning) {
            if (firstChunkAt === null) firstChunkAt = now;
            currentIterationReasoning += delta.reasoning;
            accumulatedReasoning += delta.reasoning;
            callbacks.onReasoning?.(delta.reasoning);
          }

          // Handle reasoning_details (capture full structure with signature, format, etc.)
          if (delta.reasoning_details && delta.reasoning_details.length > 0) {
            // Replace with the latest reasoning_details (they come complete, not as deltas)
            currentIterationReasoningDetails = delta.reasoning_details;
          }

          // Handle tool call deltas
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = streamingToolCalls.get(tc.index) || { id: '', name: '', arguments: '' };
              
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              
              streamingToolCalls.set(tc.index, existing);
              
              callbacks.onToolCall?.({
                id: existing.id,
                name: existing.name,
                arguments: existing.arguments,
                status: 'streaming',
              });
            }
          }

          // Handle image deltas
          if (delta.images) {
            for (const image of delta.images) {
              // Images come complete, not as deltas
              streamingImages.push(image);
              callbacks.onImage?.(image);
            }
          }
        }

        // Track usage from final chunk
        if (chunk.usage) {
          iterationUsage = chunk.usage;
        }
      }, abortSignal);

      // Mark tool calls as ready
      for (const [, tc] of streamingToolCalls) {
        callbacks.onToolCall?.({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
          status: 'ready',
        });
      }

      const completedToolCalls = Array.from(streamingToolCalls.values());
      const toolCallsJson = completedToolCalls.length > 0 
        ? JSON.stringify(completedToolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: tc.arguments })))
        : undefined;

      // Persist tool calls for API call detail view
      if (completedToolCalls.length > 0) {
        for (const tc of completedToolCalls) {
          try {
            apiCallToolCallStore.create({
              api_call_id: apiCall.id,
              tool_call_id: tc.id,
              tool_name: tc.name,
              arguments_json: tc.arguments || '{}',
              status: 'called',
            });
          } catch {
            // Ignore DB errors
          }
        }
      }

      // Calculate timing for this iteration
      const iterationCompletedAt = performance.now();
      const latencyMs = firstChunkAt ? Math.round(firstChunkAt - iterationStartedAt) : null;
      const durationMs = Math.round(iterationCompletedAt - iterationStartedAt);

      // Build effective reasoning_details:
      // - If we captured reasoning_details from streaming (has signature, format, etc.), 
      //   merge in the text from accumulated reasoning
      // - Otherwise construct a simple one from text
      const effectiveReasoningDetails = mergeReasoningDetails(
        currentIterationReasoningDetails,
        currentIterationReasoning,
      );

      // Build response object for this iteration
      const iterationResponse: ChatCompletionResponse = {
        id: apiCall.public_id,
        provider: iterationProvider,
        model: iterationModel,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: currentIterationContent || null,
            refusal: null,
            reasoning: currentIterationReasoning || null,
            reasoning_details: effectiveReasoningDetails,
            tool_calls: completedToolCalls.length > 0 
              ? completedToolCalls.map((tc, index) => ({
                  id: tc.id,
                  index,
                  type: 'function' as const,
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                }))
              : undefined,
            images: streamingImages.length > 0 ? streamingImages : undefined,
          },
          finish_reason: iterationFinishReason as 'stop' | 'length' | 'tool_calls' | 'content_filter' | null,
        }],
        usage: iterationUsage,
        previous_tool_message: lastToolAssistantResponse?.choices?.[0]?.message,
      };

      // If there are tool calls, execute them and continue
      if (completedToolCalls.length > 0) {
        // Update API call record for this tool-call iteration
        apiCallStore.update({
          public_id: apiCall.public_id,
          status: 'completed',
          model_actual: iterationModel,
          provider: iterationProvider ?? null,
          response_json: JSON.stringify(iterationResponse),
          prompt_tokens: iterationUsage?.prompt_tokens ?? null,
          completion_tokens: iterationUsage?.completion_tokens ?? null,
          total_tokens: iterationUsage?.total_tokens ?? null,
          cached_tokens: iterationUsage?.prompt_tokens_details?.cached_tokens ?? null,
          reasoning_tokens: iterationUsage?.completion_tokens_details?.reasoning_tokens ?? null,
          latency_ms: latencyMs,
          duration_ms: durationMs,
          finish_reason: iterationFinishReason,
          cost: iterationUsage?.cost ?? null,
          is_byok: iterationUsage?.is_byok ?? undefined,
          has_tools: true,
          has_images: hasImages,
          completed_at: new Date().toISOString(),
        });

        // Remember this tool-call iteration's assistant message so the final response can reference it
        lastToolAssistantResponse = iterationResponse;

        // Build assistant message with tool calls for API
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: currentIterationContent || null,
          refusal: null,
          reasoning: currentIterationReasoning || null,
          reasoning_details: effectiveReasoningDetails,
          tool_calls: completedToolCalls.map((tc, index) => ({
            id: tc.id,
            index,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        };

        inputMessages.push(assistantMessage);

        // Save each tool call as its own message and execute
        for (let i = 0; i < completedToolCalls.length; i++) {
          const tc = completedToolCalls[i];
          
          // Save tool call message (with reasoning only on first tool call)
          const toolCallMsg = messageStore.create({
            chat_id: chat.id,
            role: 'assistant',
            content: currentIterationContent || '',
            reasoning: i === 0 ? (currentIterationReasoning || undefined) : undefined,
            reasoning_details_json: i === 0 && effectiveReasoningDetails ? JSON.stringify(effectiveReasoningDetails) : undefined,
            model: iterationModel,
            message_type: 'tool_call',
            tool_call_id: tc.id,
            tool_name: tc.name,
            tool_input: tc.arguments,
            cost: i === 0 ? (iterationUsage?.cost ?? undefined) : undefined,
          });

          // Execute tool
          const toolResult = await executeToolCall(
            {
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            },
            { canRunCode, agentPublicId },
          );

          // Update tool call message with output
          messageStore.updateToolOutput(toolCallMsg.public_id, toolResult.content);

          inputMessages.push(toolResult);
        }

        // Reset accumulated content/reasoning for next iteration (don't duplicate in final message)
        accumulatedContent = '';
        accumulatedReasoning = '';

        // Continue to next iteration
        continue;
      }

      // No tool calls - save final message and exit
      const finalContent = accumulatedContent;
      const finalReasoning = accumulatedReasoning;
      
      // Use captured reasoning_details for storage (includes signature, format, etc.)
      const reasoningDetailsJson = effectiveReasoningDetails 
        ? JSON.stringify(effectiveReasoningDetails)
        : undefined;

      // Determine message type based on content
      let messageType: 'text' | 'tool_call' | 'image_generation_call' = 'text';
      if (toolCallsJson && !finalContent) {
        messageType = 'tool_call';
      } else if (streamingImages.length > 0) {
        messageType = 'image_generation_call';
      }

      // Build response_json for message storage (assistant message in Chat Completions format)
      const messageResponseJson = JSON.stringify({
        role: 'assistant',
        content: finalContent || null,
        refusal: null,
        reasoning: finalReasoning || null,
        reasoning_details: effectiveReasoningDetails,
        tool_calls: completedToolCalls.length > 0 
          ? completedToolCalls.map((tc, index) => ({
              id: tc.id,
              index,
              type: 'function',
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            }))
          : undefined,
        images: streamingImages.length > 0 ? streamingImages : undefined,
      });
      
      messageStore.create({
        chat_id: chat.id,
        role: 'assistant',
        content: finalContent,
        reasoning: finalReasoning || undefined,
        reasoning_details_json: reasoningDetailsJson,
        response_json: messageResponseJson,
        model: iterationModel,
        message_type: messageType,
        tool_calls_json: toolCallsJson,
        cost: iterationUsage?.cost ?? undefined,
      });

      // Update API call record for final iteration
      apiCallStore.update({
        public_id: apiCall.public_id,
        status: 'completed',
        model_actual: iterationModel,
        provider: iterationProvider ?? null,
        response_json: JSON.stringify(iterationResponse),
        prompt_tokens: iterationUsage?.prompt_tokens ?? null,
        completion_tokens: iterationUsage?.completion_tokens ?? null,
        total_tokens: iterationUsage?.total_tokens ?? null,
        cached_tokens: iterationUsage?.prompt_tokens_details?.cached_tokens ?? null,
        reasoning_tokens: iterationUsage?.completion_tokens_details?.reasoning_tokens ?? null,
        latency_ms: latencyMs,
        duration_ms: durationMs,
        finish_reason: iterationFinishReason,
        cost: iterationUsage?.cost ?? null,
        is_byok: iterationUsage?.is_byok ?? undefined,
        has_tools: tools.length > 0,
        has_images: hasImages,
        completed_at: new Date().toISOString(),
      });

      callbacks.onDone?.({
        content: finalContent,
        reasoning: finalReasoning,
        reasoningDetails: effectiveReasoningDetails,
        usage: iterationUsage,
      });

      break;
    }
  } catch (error) {
    // Check if this was a cancellation
    const isCancelled = (error as Error)?.message === 'Request cancelled' || 
                        (error as Error)?.name === 'AbortError';
    
    if (isCancelled) {
      // For cancellation, just mark API call as cancelled and don't create error message
      if (lastApiCallPublicId) {
        try {
          apiCallStore.update({
            public_id: lastApiCallPublicId,
            status: 'failed',
            error_message: 'Cancelled by user',
            completed_at: new Date().toISOString(),
          });
        } catch {
          // Ignore errors when updating the cancelled status
        }
      }
      // Don't create error message for cancellation - user message stays, no assistant response
      return;
    }
    
    // For other errors, mark API call as failed and create error message
    const errorMessage = (error as Error)?.message ?? 'Unknown error';
    if (lastApiCallPublicId) {
      try {
        apiCallStore.update({
          public_id: lastApiCallPublicId,
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        });
      } catch {
        // Ignore errors when updating the failed status
      }
    }
    
    // Create an error message in the chat
    try {
      messageStore.create({
        chat_id: chat.id,
        role: 'assistant',
        content: errorMessage,
        message_type: 'error',
        model,
      });
    } catch {
      // Ignore errors when creating error message
    }
    
    callbacks.onError?.(error as Error);
  }
}