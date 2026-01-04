import { getDatabase } from './database';
import type { Config } from './types';

/**
 * Config operations
 */
export const configStore = {
  get(key: string): string | null {
    const db = getDatabase();
    const result = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return result?.value ?? null;
  },

  set(key: string, value: string): void {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO config (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  },

  getAll(): Config[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM config ORDER BY key').all() as Config[];
  },
};
