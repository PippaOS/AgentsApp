import { getDatabase } from './database';
import { randomUUID } from 'node:crypto';

export interface Data {
  id: number;
  public_id: string;
  parent_id: string;
  key: string;
  value: string | null;
  type: string | null;
  options: string | null;
  markdown: string | null;
  text: string | null;
  json: string | null;
  created_at: string;
}

export interface CreateDataInput {
  parent_id: string;
  key: string;
  value?: string | null;
  type?: string | null;
  options?: string | null;
  markdown?: string | null;
  text?: string | null;
  json?: string | null;
}

/**
 * Data database operations
 */
export const dataStore = {
  /**
   * Get data entry by ID
   */
  getById(id: number): Data | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM data WHERE id = ?').get(id) as Data | undefined;
    return result ?? null;
  },

  /**
   * Get data entry by public ID
   */
  getByPublicId(publicId: string): Data | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM data WHERE public_id = ?').get(publicId) as Data | undefined;
    return result ?? null;
  },

  /**
   * Get all data entries
   */
  getAll(): Data[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM data ORDER BY created_at DESC').all() as Data[];
  },

  /**
   * Get all data entries attached to a parent entity
   */
  getByParent(parentId: string): Data[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM data WHERE parent_id = ? ORDER BY key, created_at').all(parentId) as Data[];
  },

  /**
   * Get data entries with a specific key attached to a parent entity
   */
  getByParentAndKey(parentId: string, key: string): Data[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM data WHERE parent_id = ? AND key = ? ORDER BY created_at').all(parentId, key) as Data[];
  },

  /**
   * Get all data entries with a specific key (across all parents)
   */
  getByKey(key: string): Data[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM data WHERE key = ? ORDER BY created_at DESC').all(key) as Data[];
  },

  /**
   * Get data entries with a specific key that have child data matching metadata filters
   * Example: getByKeyWithMetadata("summary", { model: "claude" })
   */
  getByKeyWithMetadata(key: string, metadata: Record<string, string>): Data[] {
    const db = getDatabase();
    
    if (Object.keys(metadata).length === 0) {
      return this.getByKey(key);
    }

    // Build query with joins for each metadata filter
    let query = `
      SELECT DISTINCT d.id, d.public_id, d.parent_id, d.key, d.value, d.type, d.options, d.markdown, d.text, d.json, d.created_at
      FROM data d
    `;

    const args: string[] = [key];
    const sortedKeys = Object.keys(metadata).sort();
    
    sortedKeys.forEach((k, i) => {
      const v = metadata[k];
      const alias = `m${i}`;
      query += `
        JOIN data ${alias} ON ${alias}.parent_id = d.public_id AND ${alias}.key = ? AND ${alias}.value = ?
      `;
      args.push(k, v);
    });

    query += ` WHERE d.key = ? ORDER BY d.created_at DESC`;
    args.push(key);

    // Reorder args: key filters first, then the main key
    const reorderedArgs = args.slice(1);
    reorderedArgs.push(args[0]);

    return db.prepare(query).all(...reorderedArgs) as Data[];
  },

  /**
   * Create a new data entry
   */
  create(input: CreateDataInput): Data {
    const db = getDatabase();
    const publicId = randomUUID();
    
    const result = db.prepare(`
      INSERT INTO data (public_id, parent_id, key, value, type, options, markdown, text, json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      publicId,
      input.parent_id,
      input.key,
      input.value ?? null,
      input.type ?? null,
      input.options ?? null,
      input.markdown ?? null,
      input.text ?? null,
      input.json ?? null
    ) as Data;
    
    return result;
  },

  /**
   * Update a data entry's value
   */
  update(publicId: string, value: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE data SET value = ? WHERE public_id = ?').run(value, publicId);
  },

  /**
   * Update a data entry's key and/or value
   */
  updateKeyAndValue(publicId: string, key: string, value: string | null): void {
    const db = getDatabase();
    db.prepare('UPDATE data SET key = ?, value = ? WHERE public_id = ?').run(key, value, publicId);
  },

  /**
   * Delete a data entry and cascade to delete any child data entries
   */
  delete(publicId: string): void {
    const db = getDatabase();
    
    // Delete child data first (data attached to this data entry)
    db.prepare('DELETE FROM data WHERE parent_id = ?').run(publicId);
    
    // Then delete the data entry itself
    db.prepare('DELETE FROM data WHERE public_id = ?').run(publicId);
  },

  /**
   * Delete all data entries attached to a parent entity
   */
  deleteByParent(parentId: string): void {
    // Get all data entries for this parent
    const entries = this.getByParent(parentId);
    
    // Delete each entry (which will cascade to delete child data)
    entries.forEach(entry => {
      this.delete(entry.public_id);
    });
  },

  /**
   * Unlink all data entries from a parent entity (set parent_id to NULL)
   * This keeps the data entries but removes the relationship
   */
  unlinkByParent(parentId: string): void {
    const db = getDatabase();
    
    // Set parent_id to NULL for all entries with this parent_id
    db.prepare('UPDATE data SET parent_id = NULL WHERE parent_id = ?').run(parentId);
  },
};

