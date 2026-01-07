import { getDatabase } from './database';
import type { Agent, CreateAgentInput } from './types';
import { nanoid } from 'nanoid';

/**
 * Agent operations
 */
export const agentStore = {
  getAll(): Agent[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM agents ORDER BY id DESC').all() as Agent[];
  },

  getByPublicId(publicId: string): Agent | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM agents WHERE public_id = ?').get(publicId) as Agent | undefined;
    return result ?? null;
  },

  getById(id: number): Agent | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined;
    return result ?? null;
  },

  create(input: CreateAgentInput): Agent {
    const db = getDatabase();
    const publicId = nanoid();
    const name = (input.name ?? '').trim() || 'Untitled Agent';
    const prompt = input.prompt ?? '';

    const result = db
      .prepare(
        `
        INSERT INTO agents (public_id, name, prompt)
        VALUES (?, ?, ?)
        RETURNING *
      `
      )
      .get(publicId, name, prompt) as Agent;

    return result;
  },

  updateName(publicId: string, name: string): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET name = ? WHERE public_id = ?').run(name, publicId);
  },

  updatePrompt(publicId: string, prompt: string): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET prompt = ? WHERE public_id = ?').run(prompt, publicId);
  },

  updateBio(publicId: string, bio: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET bio = ? WHERE public_id = ?').run(bio, publicId);
  },

  updateAllowParallelToolCalls(publicId: string, allow: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET allow_parallel_tool_calls = ? WHERE public_id = ?').run(allow ? 1 : 0, publicId);
  },

  updateAvatarUrl(publicId: string, avatarUrl: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET avatar_url = ? WHERE public_id = ?').run(avatarUrl, publicId);
  },

  updateModel(publicId: string, model: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET model = ? WHERE public_id = ?').run(model, publicId);
  },

  updateReasoning(publicId: string, reasoning: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET reasoning = ? WHERE public_id = ?').run(reasoning, publicId);
  },

  updateCanRunCode(publicId: string, canRunCode: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE agents SET can_run_code = ? WHERE public_id = ?').run(canRunCode ? 1 : 0, publicId);
  },

  updatePermissions(publicId: string, permissions: string[]): void {
    const db = getDatabase();
    const permissionsJson = JSON.stringify(permissions);
    db.prepare('UPDATE agents SET permissions = ? WHERE public_id = ?').run(permissionsJson, publicId);
  },

  updateWorkspacePaths(publicId: string, paths: string[]): void {
    const db = getDatabase();
    const json = JSON.stringify(paths);
    db.prepare('UPDATE agents SET workspace_paths_json = ? WHERE public_id = ?').run(json, publicId);
  },

  clone(sourcePublicId: string, newName: string): Agent {
    const db = getDatabase();

    // Run everything in a transaction to ensure tool links are also copied correctly
    const tx = db.transaction(() => {
      const source = this.getByPublicId(sourcePublicId);
      if (!source) throw new Error('Source agent not found');

      const publicId = nanoid();

      // 1. Insert the new agent record copying all properties except ID and Public ID
      const newAgent = db
        .prepare(
          `
        INSERT INTO agents (
          public_id, name, prompt, bio, allow_parallel_tool_calls,
          avatar_url, model, reasoning, can_run_code, permissions, workspace_paths_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `,
        )
        .get(
          publicId,
          newName,
          source.prompt,
          source.bio ?? null,
          source.allow_parallel_tool_calls,
          source.avatar_url ?? null,
          source.model ?? null,
          source.reasoning ?? null,
          source.can_run_code,
          source.permissions,
          source.workspace_paths_json,
        ) as Agent;

      // 2. Copy tool associations from the source agent to the new agent
      // We fetch the tool IDs associated with the source and insert them for the new agent
      db.prepare(
        `
        INSERT INTO agent_tools (agent_id, tool_id, created_at)
        SELECT ?, tool_id, datetime('now')
        FROM agent_tools
        WHERE agent_id = ?
      `,
      ).run(newAgent.id, source.id);

      return newAgent;
    });

    return tx();
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM agents WHERE public_id = ?').run(publicId);
  },
};
