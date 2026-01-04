import { getDatabase } from './database';
import type { File, CreateFileInput, Page, CreatePageInput } from './types';
import { randomUUID } from 'node:crypto';

/**
 * File and Page database operations
 */
export const fileStore = {
  // File operations
  getAll(): File[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM files ORDER BY created_at DESC').all() as File[];
  },

  getById(id: number): File | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as File | undefined;
    return result ?? null;
  },

  getByPublicId(publicId: string): File | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM files WHERE public_id = ?').get(publicId) as File | undefined;
    return result ?? null;
  },

  getByHash(hash: string): File | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM files WHERE hash = ?').get(hash) as File | undefined;
    return result ?? null;
  },

  create(input: CreateFileInput): File {
    const db = getDatabase();
    const publicId = randomUUID();
    
    const result = db.prepare(`
      INSERT INTO files (public_id, name, original_path, storage_path, hash, total_pages, include_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      publicId,
      input.name,
      input.original_path,
      input.storage_path,
      input.hash,
      input.total_pages || 0,
      1  // Default include_data to 1 (enabled)
    ) as File;
    
    return result;
  },

  updateTotalPages(id: number, totalPages: number): void {
    const db = getDatabase();
    db.prepare('UPDATE files SET total_pages = ? WHERE id = ?').run(totalPages, id);
  },

  updateIncludeData(publicId: string, includeData: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE files SET include_data = ? WHERE public_id = ?').run(includeData ? 1 : 0, publicId);
  },

  // Page-level update methods
  updatePageIncludeImages(publicId: string, includeImages: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE pages SET include_images = ? WHERE public_id = ?').run(includeImages ? 1 : 0, publicId);
  },

  updatePageIncludeText(publicId: string, includeText: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE pages SET include_text = ? WHERE public_id = ?').run(includeText ? 1 : 0, publicId);
  },

  updatePageIncludeData(publicId: string, includeData: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE pages SET include_data = ? WHERE public_id = ?').run(includeData ? 1 : 0, publicId);
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM files WHERE public_id = ?').run(publicId);
  },

  // Page operations
  getPagesByFileId(fileId: number): Page[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM pages WHERE file_id = ? ORDER BY id ASC').all(fileId) as Page[];
  },

  getPageByPublicId(publicId: string): Page | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM pages WHERE public_id = ?').get(publicId) as Page | undefined;
    return result ?? null;
  },

  createPage(input: CreatePageInput): Page {
    const db = getDatabase();
    const publicId = randomUUID();
    
    // Default to 1 (enabled) for include_images and include_data if not explicitly set
    const includeImages = input.include_images !== undefined ? (input.include_images ? 1 : 0) : 1;
    const includeText = input.include_text !== undefined ? (input.include_text ? 1 : 0) : 0;
    const includeData = input.include_data !== undefined ? (input.include_data ? 1 : 0) : 1;
    
    const result = db.prepare(`
      INSERT INTO pages (file_id, public_id, image_path, text_content, include_images, include_text, include_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      input.file_id,
      publicId,
      input.image_path || null,
      input.text_content || null,
      includeImages,
      includeText,
      includeData
    ) as Page;
    
    return result;
  },

  deletePagesByFileId(fileId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM pages WHERE file_id = ?').run(fileId);
  }
};


