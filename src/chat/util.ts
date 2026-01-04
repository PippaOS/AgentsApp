/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Utility functions for OpenRouter chat completions
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  secretStore,
  messageStore,
  agentStore,
  fileStore,
} from '../db/store';
import { toolDefinitions, toolByName } from './tools';
import { toolCatalogSection } from './tools/util';
import {
  ChatCompletionRequest,
  ChatMessage,
  ContentPart,
  ReasoningDetail,
  ToolCall,
} from './types';

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Get configured OpenRouter API key
 */
export function getOpenRouterApiKey(): string | null {
  return secretStore.get('openrouter_api_key');
}

// ============================================================================
// Image/File Processing Helpers
// ============================================================================

/**
 * Read page image and convert to base64
 */
export function readPageImageAsBase64(imagePath: string | null): string | null {
  if (!imagePath) return null;
  
  try {
    let fullPath = imagePath;
    if (!path.isAbsolute(imagePath)) {
      const userDataPath = app.getPath('userData');
      fullPath = path.join(userDataPath, 'pages', imagePath);
    }
    
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    
    const buffer = fs.readFileSync(fullPath);
    return buffer.toString('base64');
  } catch (error) {
    console.error(`Failed to read page image: ${imagePath}`, error);
    return null;
  }
}

/**
 * Build a mapping of base64 image data to page public_id
 */
export function buildBase64ToPageMapping(): Map<string, string> {
  const mapping = new Map<string, string>();
  const files = fileStore.getAll();
  
  for (const file of files) {
    const pages = fileStore.getPagesByFileId(file.id);
    for (const page of pages) {
      if (page.image_path) {
        const base64 = readPageImageAsBase64(page.image_path);
        if (base64) {
          mapping.set(base64, page.public_id);
        }
      }
    }
  }
  
  return mapping;
}

/**
 * Sanitize request JSON by replacing base64 image data with placeholders
 */
export function sanitizeRequestJson(requestJson: string): string {
  function sanitizeObject(obj: unknown, base64Mapping: Map<string, string>): unknown {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      const dataUrlMatch = obj.match(/^(data:image\/([^;]+);base64,)(.+)$/);
      if (dataUrlMatch) {
        const imageType = dataUrlMatch[2];
        const base64Data = dataUrlMatch[3];
        const pagePublicId = base64Mapping.get(base64Data);
        if (pagePublicId) {
          return `data:image/${imageType};base64:${pagePublicId}`;
        }
      }
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item, base64Mapping));
    }
    
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = sanitizeObject(value, base64Mapping);
      }
      return result;
    }
    
    return obj;
  }
  
  try {
    const request = JSON.parse(requestJson);
    const base64Mapping = buildBase64ToPageMapping();
    const sanitized = sanitizeObject(request, base64Mapping);
    return JSON.stringify(sanitized);
  } catch {
    return requestJson;
  }
}

/**
 * Check if messages contain any images
 */
export function messagesContainImages(chatId: number): boolean {
  const messages = messageStore.getByChatId(chatId);
  
  for (const msg of messages) {
    if (msg.message_type === 'chat_context' && msg.entity_id) {
      const file = fileStore.getByPublicId(msg.entity_id);
      if (file) {
        const pages = fileStore.getPagesByFileId(file.id);
        if (pages.some((p: { image_path: string | null }) => p.image_path)) {
          return true;
        }
      } else {
        const page = fileStore.getPageByPublicId(msg.entity_id);
        if (page && page.image_path) {
          return true;
        }
      }
    }
  }
  
  return false;
}

// ============================================================================
// Tool Helpers
// ============================================================================

/**
 * Execute a tool call and return the result
 */
export async function executeToolCall(
  toolCall: ToolCall,
  ctx?: {
    canRunCode?: boolean;
    agentPublicId?: string;
  },
): Promise<{ role: 'tool'; tool_call_id: string; content: string }> {
  const tool = toolByName.get(toolCall.function.name);

  if (!tool) {
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }),
    };
  }

  try {
    // here we need to harden and check with z
    const args = JSON.parse(toolCall.function.arguments || '{}');

    // Enforcement: `run_code` is only allowed when enabled on the agent.
    if (toolCall.function.name === 'run_code' && !ctx?.canRunCode) {
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({ error: 'run_code is disabled for this agent' }),
      };
    }

    // Pass agent context to tools
    const toolCtx = {
      agentPublicId: ctx?.agentPublicId,
    };

    const result = await tool.execute(args, toolCtx);
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result,
    };
  } catch (error) {
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: (error as Error).message || 'Tool execution failed' }),
    };
  }
}

/**
 * Convert tool definitions to Chat Completions format
 */
export function getToolsForChatCompletions(): ChatCompletionRequest['tools'] {
  return toolDefinitions.map(def => ({
    type: 'function' as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    },
  }));
}

// ============================================================================
// Agent Helpers
// ============================================================================

/**
 * Get agent capabilities (can run code and prompt)
 */
export function getAgentCapabilities(agentPublicId: string): {
  canRunCode: boolean;
  prompt: string;
} {
  const agent = agentStore.getByPublicId(agentPublicId);
  return {
    canRunCode: (agent as any)?.can_run_code === 1,
    prompt: (agent?.prompt ?? '').trim(),
  };
}

/**
 * Build system message with agent prompt and optional tool catalog
 */
export function buildSystemMessage(
  agentPrompt: string,
  canRunCode: boolean,
): ChatMessage {
  const content = canRunCode
    ? `${agentPrompt}\n${toolCatalogSection(toolDefinitions, true)}`
    : agentPrompt;

  return {
    role: 'system',
    content,
  };
}

// ============================================================================
// Message Building Helpers
// ============================================================================

/**
 * Build content parts array from user content and images
 */
export function buildContentParts(
  userContent: string,
  images?: Array<{ id: string; dataUrl: string }>,
): ContentPart[] {
  const contentParts: ContentPart[] = [];
  
  if (userContent.trim()) {
    contentParts.push({ type: 'text', text: userContent });
  }
  
  if (images && images.length > 0) {
    for (const img of images) {
      contentParts.push({
        type: 'image_url',
        image_url: { url: img.dataUrl, detail: 'auto' },
      });
    }
  }
  
  return contentParts;
}

// ============================================================================
// Reasoning Helpers
// ============================================================================

/**
 * Merge reasoning text into reasoning details structure
 * If reasoning_details exist, merge text into them. Otherwise, create a simple one.
 */
export function mergeReasoningDetails(
  reasoningDetails: ReasoningDetail[],
  reasoningText: string,
): ReasoningDetail[] | undefined {
  if (reasoningDetails.length > 0) {
    // Merge text into captured reasoning_details (streaming gives us signature/format but not text)
    return reasoningDetails.map(detail => {
      if (detail.type === 'reasoning.text' && !detail.text && reasoningText) {
        return { ...detail, text: reasoningText };
      }
      return detail;
    });
  } else if (reasoningText) {
    return [{ type: 'reasoning.text', text: reasoningText }];
  }
  
  return undefined;
}
