import { getDatabase } from './database';
import type { Message, CreateMessageInput } from './types';
import { nanoid } from 'nanoid';

/**
 * Message operations
 */
export const messageStore = {
  getByChatId(chatId: number): Message[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId) as Message[];
  },

  getByChatPublicId(chatPublicId: string): Message[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT m.* FROM messages m
      JOIN chats c ON c.id = m.chat_id
      WHERE c.public_id = ?
      ORDER BY m.created_at ASC
    `).all(chatPublicId) as Message[];
  },

  getByPublicId(publicId: string): Message | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM messages WHERE public_id = ?').get(publicId) as Message | undefined;
    return result ?? null;
  },

  create(input: CreateMessageInput): Message {
    const db = getDatabase();
    const publicId = nanoid();
    
    const result = db.prepare(`
      INSERT INTO messages (
        public_id, chat_id, role, content, reasoning, reasoning_details_json, response_json, model,
        message_type, entity_id, tool_calls_json, tool_call_id, tool_name, tool_input, tool_output, cost, chat_context_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      publicId,
      input.chat_id,
      input.role,
      input.content,
      input.reasoning || null,
      input.reasoning_details_json || null,
      input.response_json || null,
      input.model || null,
      input.message_type || 'text',
      input.entity_id || null,
      input.tool_calls_json || null,
      input.tool_call_id || null,
      input.tool_name || null,
      input.tool_input || null,
      input.tool_output || null,
      input.cost || null,
      input.chat_context_id ?? null
    ) as Message;
    
    return result;
  },

  updateToolOutput(publicId: string, toolOutput: string): void {
    const db = getDatabase();
    db.prepare('UPDATE messages SET tool_output = ? WHERE public_id = ?').run(toolOutput, publicId);
  },

  updateChatContextId(id: number, chatContextId: number | null): void {
    const db = getDatabase();
    db.prepare('UPDATE messages SET chat_context_id = ? WHERE id = ?').run(chatContextId, id);
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM messages WHERE public_id = ?').run(publicId);
  },

  deleteById(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  },
};
