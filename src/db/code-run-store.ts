import { getDatabase } from './database';
import type { CodeRun, CreateCodeRunInput } from './types';
import { nanoid } from 'nanoid';

export const codeRunStore = {
  getByPublicId(publicId: string): CodeRun | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM code_runs WHERE public_id = ?').get(publicId) as CodeRun | undefined;
    return result ?? null;
  },

  getRecent(limit = 200): CodeRun[] {
    const db = getDatabase();
    return db
      .prepare(
        `
        SELECT * FROM code_runs
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(limit) as CodeRun[];
  },

  create(input: CreateCodeRunInput): CodeRun {
    const db = getDatabase();
    const publicId = nanoid();
    const status = input.status ?? 'queued';

    const result = db
      .prepare(
        `
        INSERT INTO code_runs (public_id, input_ts, status, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        RETURNING *
      `,
      )
      .get(publicId, input.input_ts, status) as CodeRun;

    return result;
  },

  updateStatus(publicId: string, status: CodeRun['status']): void {
    const db = getDatabase();
    db.prepare("UPDATE code_runs SET status = ?, updated_at = datetime('now') WHERE public_id = ?").run(status, publicId);
  },

  updateOutput(publicId: string, output: string | null, error: string | null = null): void {
    const db = getDatabase();
    db.prepare(
      `
      UPDATE code_runs SET
        output = ?,
        error = ?,
        updated_at = datetime('now')
      WHERE public_id = ?
    `,
    ).run(output, error, publicId);
  },
};

