import { getDatabase } from './database';
import type { Image, CreateImageInput } from './types';
import { randomUUID } from 'node:crypto';

/**
 * Image database operations
 */
export const imageStore = {
  getAll(): Image[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM images ORDER BY created_at DESC').all() as Image[];
  },

  getByPublicId(publicId: string): Image | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM images WHERE public_id = ?').get(publicId) as Image | undefined;
    return result ?? null;
  },

  getById(id: number): Image | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as Image | undefined;
    return result ?? null;
  },

  create(input: CreateImageInput): Image {
    const db = getDatabase();
    const publicId = randomUUID();
    
    const result = db.prepare(`
      INSERT INTO images (public_id, file_name, file_size)
      VALUES (?, ?, ?)
      RETURNING *
    `).get(
      publicId,
      input.file_name,
      input.file_size
    ) as Image;
    
    return result;
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM images WHERE public_id = ?').run(publicId);
  },
};

