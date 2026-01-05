/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Utility functions for OpenRouter chat completions
 */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getDefaultWorkspaceDestPath } from '../workspace-sync';
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
  workspacePins: string[];
} {
  const agent = agentStore.getByPublicId(agentPublicId);
  let workspacePins: string[] = [];
  try {
    const parsed = (agent as any)?.workspace_paths_json ? JSON.parse((agent as any).workspace_paths_json) : [];
    if (Array.isArray(parsed)) {
      workspacePins = parsed.map(String);
    }
  } catch {
    workspacePins = [];
  }
  return {
    canRunCode: (agent as any)?.can_run_code === 1,
    prompt: (agent?.prompt ?? '').trim(),
    workspacePins,
  };
}

/**
 * Build system message with agent prompt and optional tool catalog
 */
export function buildSystemMessage(
  agentPrompt: string,
  canRunCode: boolean,
  workspacePins: string[] = [],
): ChatMessage {
  const workspaceSection = buildWorkspaceFilesSection(workspacePins);
  const base = canRunCode
    ? `${agentPrompt}\n${toolCatalogSection(toolDefinitions, true)}`
    : agentPrompt;
  const content = workspaceSection ? `${base}\n\n${workspaceSection}` : base;

  return {
    role: 'system',
    content,
  };
}

function normalizeWorkspaceRelPath(p: string): string | null {
  const raw = String(p ?? '').trim().replaceAll('\\', '/');
  if (!raw) return null;
  const rel = raw.startsWith('/') ? raw.slice(1) : raw;
  if (!rel || rel === '.' || rel.includes('\0')) return null;
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((seg) => seg === '.' || seg === '..')) return null;
  return parts.join('/');
}

function safeResolveUnderRoot(root: string, relPosix: string): string | null {
  const abs = path.resolve(root, relPosix.split('/').join(path.sep));
  const rootResolved = path.resolve(root);
  if (abs === rootResolved) return abs;
  const rootPrefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (!abs.startsWith(rootPrefix)) return null;
  return abs;
}

function shouldExcludeWorkspaceName(name: string): boolean {
  return (
    name === 'node_modules' ||
    name === '.git' ||
    name === '.DS_Store' ||
    name === '.vite' ||
    name === '.devtools' ||
    name === 'dist' ||
    name === 'out'
  );
}

function escapeXmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Expand pinned workspace paths into a flat list of file paths, then render as <file path="..."></file> tags.
 */
function buildWorkspaceFilesSection(pins: string[]): string {
  const normalizedPins = pins
    .map(normalizeWorkspaceRelPath)
    .filter((x): x is string => Boolean(x));
  if (normalizedPins.length === 0) return '';

  const root = getDefaultWorkspaceDestPath();
  const files = new Set<string>();
  const MAX_FILES = 2000;

  const addFile = (rel: string) => {
    if (files.size >= MAX_FILES) return;
    files.add(rel);
  };

  const walkDir = (absDir: string, relDir: string) => {
    if (files.size >= MAX_FILES) return;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (files.size >= MAX_FILES) return;
      if (shouldExcludeWorkspaceName(d.name)) continue;
      const childRel = relDir ? `${relDir}/${d.name}` : d.name;
      const childAbs = path.join(absDir, d.name);
      if (d.isDirectory()) {
        walkDir(childAbs, childRel);
      } else if (d.isFile()) {
        addFile(childRel);
      }
    }
  };

  for (const pin of normalizedPins) {
    if (files.size >= MAX_FILES) break;
    const abs = safeResolveUnderRoot(root, pin);
    if (!abs) continue;
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkDir(abs, pin);
    } else if (st.isFile()) {
      addFile(pin);
    }
  }

  if (files.size === 0) return '';

  const sorted = Array.from(files).sort((a, b) => a.localeCompare(b));

  // Read file contents with safety limits (to avoid blowing up the system prompt).
  const MAX_TOTAL_CHARS = 400_000;
  const MAX_FILE_CHARS = 80_000;
  let totalChars = 0;

  const cdata = (text: string): string => {
    // Keep valid XML even if content contains "]]>"
    const safe = text.replaceAll(']]>', ']]]]><![CDATA[>');
    return `<![CDATA[${safe}]]>`;
  };

  const readTextFile = (absPath: string): { kind: 'ok'; text: string } | { kind: 'skip'; reason: string } => {
    let buf: Buffer;
    try {
      buf = fs.readFileSync(absPath);
    } catch {
      return { kind: 'skip', reason: 'unreadable' };
    }
    // Basic binary detection: null bytes.
    if (buf.includes(0)) return { kind: 'skip', reason: 'binary' };
    // Decode as UTF-8 (good enough for now).
    const text = buf.toString('utf-8');
    return { kind: 'ok', text };
  };

  const blocks: string[] = [];
  for (const rel of sorted) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const abs = safeResolveUnderRoot(root, rel);
    if (!abs) continue;

    const read = readTextFile(abs);
    if (read.kind === 'skip') {
      // Still include the file tag so the model knows it exists.
      blocks.push(`<file path="${escapeXmlAttr(rel)}" note="${escapeXmlAttr(read.reason)}"></file>`);
      continue;
    }

    let text = read.text;
    let truncated = false;
    if (text.length > MAX_FILE_CHARS) {
      text = text.slice(0, MAX_FILE_CHARS);
      truncated = true;
    }

    // Enforce global budget.
    const remaining = Math.max(0, MAX_TOTAL_CHARS - totalChars);
    if (text.length > remaining) {
      text = text.slice(0, remaining);
      truncated = true;
    }

    totalChars += text.length;
    const truncAttr = truncated ? ' truncated="true"' : '';
    blocks.push(
      `<file path="${escapeXmlAttr(rel)}"${truncAttr}>\n${cdata(text)}\n</file>`,
    );
  }

  return `<workspace_files>\n${blocks.join('\n')}\n</workspace_files>`;
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
