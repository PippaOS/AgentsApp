import { getDatabase } from './database';
import { nanoid } from 'nanoid';
import { safeStorage } from 'electron';

type SecretRow = {
  id: number;
  public_id: string;
  name: string;
  ciphertext: Buffer;
  created_at: string;
  updated_at: string;
};

export type SecretMeta = Pick<SecretRow, 'name' | 'created_at' | 'updated_at'>;

function requireEncryptionAvailable(): void {
  // macOS: should be available (Keychain).
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secret encryption is not available on this system');
  }
}

function normalizeName(name: string): string {
  const n = String(name || '').trim();
  if (!n) throw new Error('Secret name is required');
  return n;
}

export const secretStore = {
  /**
   * Store (encrypt) a secret value by name.
   * Passing an empty string clears (deletes) the secret.
   */
  set(name: string, plaintext: string): void {
    const db = getDatabase();
    const key = normalizeName(name);
    const value = String(plaintext ?? '');

    if (!value.trim()) {
      db.prepare('DELETE FROM secrets WHERE name = ?').run(key);
      return;
    }

    requireEncryptionAvailable();
    const ciphertext = safeStorage.encryptString(value);
    const publicId = `secret_${nanoid()}`;

    db.prepare(
      `
      INSERT INTO secrets (public_id, name, ciphertext, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(name) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        updated_at = datetime('now')
    `,
    ).run(publicId, key, ciphertext);
  },

  /**
   * Read (decrypt) a secret by name.
   */
  get(name: string): string | null {
    const db = getDatabase();
    const key = normalizeName(name);
    const row = db
      .prepare('SELECT ciphertext FROM secrets WHERE name = ?')
      .get(key) as { ciphertext: Buffer } | undefined;

    if (!row?.ciphertext) return null;

    requireEncryptionAvailable();
    try {
      return safeStorage.decryptString(row.ciphertext);
    } catch {
      return null;
    }
  },

  has(name: string): boolean {
    const db = getDatabase();
    const key = normalizeName(name);
    const row = db
      .prepare('SELECT 1 as ok FROM secrets WHERE name = ? LIMIT 1')
      .get(key) as { ok: 1 } | undefined;
    return !!row?.ok;
  },

  getMeta(name: string): (SecretMeta & { exists: true }) | { name: string; exists: false } {
    const db = getDatabase();
    const key = normalizeName(name);
    const row = db
      .prepare('SELECT name, created_at, updated_at FROM secrets WHERE name = ?')
      .get(key) as SecretMeta | undefined;

    if (!row) return { name: key, exists: false };
    return { ...row, exists: true };
  },

  listMeta(): SecretMeta[] {
    const db = getDatabase();
    return db
      .prepare('SELECT name, created_at, updated_at FROM secrets ORDER BY name')
      .all() as SecretMeta[];
  },

  delete(name: string): void {
    const db = getDatabase();
    const key = normalizeName(name);
    db.prepare('DELETE FROM secrets WHERE name = ?').run(key);
  },
};

