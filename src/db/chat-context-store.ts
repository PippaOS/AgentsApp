import { getDatabase } from './database';
import type { ChatContextItem, ChatContextItemWithFile, CreateChatContextInput } from './types';
import { nanoid } from 'nanoid';

/**
 * Chat context operations
 */
export const chatContextStore = {
  getByChatId(chatId: number): ChatContextItemWithFile[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT 
          cc.*,
          COALESCE(f.name, i.file_name) AS file_name,
          f.public_id AS file_public_id,
          i.public_id AS image_public_id,
          m.public_id AS message_public_id
        FROM chat_context cc
        LEFT JOIN files f ON f.public_id = cc.entity_id
        LEFT JOIN images i ON i.public_id = cc.entity_id
        LEFT JOIN messages m ON m.id = cc.message_id
        WHERE cc.chat_id = ?
        ORDER BY cc.created_at ASC
      `
      )
      .all(chatId) as ChatContextItemWithFile[];
  },

  getById(id: number): ChatContextItem | null {
    const db = getDatabase();
    const result = db
      .prepare('SELECT * FROM chat_context WHERE id = ?')
      .get(id) as ChatContextItem | undefined;
    return result ?? null;
  },

  getByMessageId(messageId: number): ChatContextItem | null {
    const db = getDatabase();
    const result = db
      .prepare('SELECT * FROM chat_context WHERE message_id = ?')
      .get(messageId) as ChatContextItem | undefined;
    return result ?? null;
  },

  getByEntityIdAndChatId(entityId: string, chatId: number): ChatContextItem | null {
    const db = getDatabase();
    const result = db
      .prepare('SELECT * FROM chat_context WHERE entity_id = ? AND chat_id = ?')
      .get(entityId, chatId) as ChatContextItem | undefined;
    return result ?? null;
  },

  getByPublicId(publicId: string): ChatContextItem | null {
    const db = getDatabase();
    const result = db
      .prepare('SELECT * FROM chat_context WHERE public_id = ?')
      .get(publicId) as ChatContextItem | undefined;
    return result ?? null;
  },

  create(input: CreateChatContextInput): ChatContextItem {
    const db = getDatabase();
    const publicId = nanoid();

    const result = db
      .prepare(
        `
        INSERT INTO chat_context (
          public_id, chat_id, entity_id, message_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        RETURNING *
      `
      )
      .get(publicId, input.chat_id, input.entity_id, input.message_id ?? null) as ChatContextItem;

    return result;
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_context WHERE public_id = ?').run(publicId);
  },
};
