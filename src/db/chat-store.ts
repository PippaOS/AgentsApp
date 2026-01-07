import { getDatabase } from './database';
import type { Chat, ChatWithAgent, CreateChatInput } from './types';
import { nanoid } from 'nanoid';
import { agentStore } from './agent-store';

/**
 * Chat operations
 */
export const chatStore = {
  getAll(): Chat[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM chats ORDER BY created_at DESC').all() as Chat[];
  },

  getAllWithAgent(): ChatWithAgent[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT 
        c.*,
        a.name as agent_name,
        a.avatar_url as agent_avatar_url,
        m.content as last_message_content,
        m.role as last_message_role,
        m.created_at as last_message_at
      FROM chats c
      LEFT JOIN agents a ON a.public_id = c.agent_public_id
      LEFT JOIN (
        SELECT chat_id, content, role, created_at
        FROM messages m1
        WHERE m1.id = (
          SELECT m2.id FROM messages m2 
          WHERE m2.chat_id = m1.chat_id 
          ORDER BY m2.created_at DESC 
          LIMIT 1
        )
      ) m ON m.chat_id = c.id
      ORDER BY COALESCE(m.created_at, c.created_at) DESC
    `).all() as ChatWithAgent[];
  },

  getByPublicId(publicId: string): Chat | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM chats WHERE public_id = ?').get(publicId) as Chat | undefined;
    return result ?? null;
  },

  getById(id: number): Chat | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as Chat | undefined;
    return result ?? null;
  },

  create(input: CreateChatInput = {}): Chat {
    const db = getDatabase();
    const publicId = nanoid();
    const agentPublicId = input.agent_public_id || null;
    
    // If creating a chat with an agent, copy model and reasoning from the agent
    let model: string | null = null;
    let reasoning: string | null = null;
    if (agentPublicId) {
      const agent = agentStore.getByPublicId(agentPublicId);
      if (agent) {
        model = agent.model ?? null;
        reasoning = agent.reasoning ?? null;
      }
    }
    
    const result = db.prepare(`
      INSERT INTO chats (public_id, agent_public_id, model, reasoning)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `).get(publicId, agentPublicId, model, reasoning) as Chat;
    
    return result;
  },

  updateAgentPublicId(publicId: string, agentPublicId: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE chats SET agent_public_id = ? WHERE public_id = ?').run(agentPublicId, publicId);
  },

  delete(publicId: string): void {
    const db = getDatabase();
    // Delete the chat - CASCADE will automatically delete:
    // - messages (ON DELETE CASCADE)
    // - chat_context (ON DELETE CASCADE)
    // API calls will have chat_id set to NULL (ON DELETE SET NULL) - they are preserved
    db.prepare('DELETE FROM chats WHERE public_id = ?').run(publicId);
  },
};
