import { getDatabase } from './database';
import type { Tool, CreateToolInput, UpdateToolInput } from './types';
import { nanoid } from 'nanoid';

export const toolStore = {
  getAll(): Tool[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM tools ORDER BY created_at DESC').all() as Tool[];
  },

  getByPublicId(publicId: string): Tool | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM tools WHERE public_id = ?').get(publicId) as Tool | undefined;
    return result ?? null;
  },

  create(input: CreateToolInput): Tool {
    const db = getDatabase();
    const publicId = nanoid();
    const name = (input.name ?? '').trim() || 'Untitled Tool';

    const result = db
      .prepare(
        `
        INSERT INTO tools (public_id, name, description, input_schema_json, code_ts, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        RETURNING *
      `,
      )
      .get(
        publicId,
        name,
        input.description ?? null,
        input.input_schema_json ?? '{}',
        input.code_ts ?? '',
      ) as Tool;

    return result;
  },

  update(publicId: string, input: UpdateToolInput): Tool | null {
    const db = getDatabase();

    db.prepare(
      `
      UPDATE tools SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        input_schema_json = COALESCE(?, input_schema_json),
        code_ts = COALESCE(?, code_ts),
        updated_at = datetime('now')
      WHERE public_id = ?
    `,
    ).run(
      input.name === undefined ? null : (input.name.trim() || 'Untitled Tool'),
      input.description === undefined ? null : input.description,
      input.input_schema_json === undefined ? null : input.input_schema_json,
      input.code_ts === undefined ? null : input.code_ts,
      publicId,
    );

    return this.getByPublicId(publicId);
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM tools WHERE public_id = ?').run(publicId);
  },
};

export const agentToolStore = {
  getToolsByAgentPublicId(agentPublicId: string): Tool[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT t.* FROM agent_tools at
        JOIN agents a ON a.id = at.agent_id
        JOIN tools t ON t.id = at.tool_id
        WHERE a.public_id = ?
        ORDER BY t.name ASC
      `,
      )
      .all(agentPublicId) as Tool[];
  },

  getToolsByAgentId(agentId: number): Tool[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT t.* FROM agent_tools at
        JOIN tools t ON t.id = at.tool_id
        WHERE at.agent_id = ?
        ORDER BY t.name ASC
      `,
      )
      .all(agentId) as Tool[];
  },

  /**
   * Replace the set of tools for an agent (atomic).
   */
  setToolsForAgent(agentPublicId: string, toolPublicIds: string[]): void {
    const db = getDatabase();

    const tx = db.transaction(() => {
      const agent = db.prepare('SELECT id FROM agents WHERE public_id = ?').get(agentPublicId) as { id: number } | undefined;
      if (!agent) throw new Error('Agent not found');

      db.prepare('DELETE FROM agent_tools WHERE agent_id = ?').run(agent.id);

      if (!toolPublicIds || toolPublicIds.length === 0) return;

      const toolIds = db
        .prepare(`SELECT id, public_id FROM tools WHERE public_id IN (${toolPublicIds.map(() => '?').join(',')})`)
        .all(...toolPublicIds) as Array<{ id: number; public_id: string }>;

      const insert = db.prepare('INSERT INTO agent_tools (agent_id, tool_id, created_at) VALUES (?, ?, datetime(\'now\'))');
      for (const tool of toolIds) {
        insert.run(agent.id, tool.id);
      }
    });

    tx();
  },
};

