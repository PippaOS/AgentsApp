import { ipcMain, BrowserWindow } from 'electron';
import { fileStore } from './db/file-store';
import { imageStore } from './db/image-store';

/**
 * Entity info stored in the cache
 */
export interface EntityInfo {
  publicId: string;
  table: 'files' | 'pages' | 'images' | 'data';
  name: string;
  /** Route path for navigation (e.g., /files/uuid) */
  route: string;
  /** Parent entity ID (for pages, this is the file's public_id; for data, this is the parent entity's public_id) */
  parentId?: string;
}

/**
 * In-memory cache mapping entity UUIDs to their info
 */
const entityCache = new Map<string, EntityInfo>();

/**
 * Load all files into the entity cache
 */
function loadFiles(): void {
  const files = fileStore.getAll();
  for (const file of files) {
    entityCache.set(file.public_id, {
      publicId: file.public_id,
      table: 'files',
      name: file.name,
      route: `/files/${file.public_id}`,
    });
    
    // Also load pages for this file
    const pages = fileStore.getPagesByFileId(file.id);
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      entityCache.set(page.public_id, {
        publicId: page.public_id,
        table: 'pages',
        name: `${file.name} - Page ${i + 1}`,
        route: `/files/${file.public_id}?page=${i + 1}`,
        parentId: file.public_id,
      });
    }
  }
}

/**
 * Load all images into the entity cache
 */
function loadImages(): void {
  const images = imageStore.getAll();
  for (const image of images) {
    entityCache.set(image.public_id, {
      publicId: image.public_id,
      table: 'images',
      name: image.file_name,
      route: `/images/${image.public_id}`,
    });
  }
}


/**
 * Initialize the entity cache by loading all entities from the database
 */
export function initializeEntityCache(): void {
  entityCache.clear();
  loadFiles();
  loadImages();
  console.log(`Entity cache initialized with ${entityCache.size} entities`);
}

/**
 * Add or update an entity in the cache
 */
export function addToEntityCache(entity: EntityInfo): void {
  entityCache.set(entity.publicId, entity);
  
  // Notify all windows about the cache update
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('entityCache:updated', entity);
  });
}

/**
 * Add a file to the cache
 */
export function addFileToCache(file: { public_id: string; name: string }): void {
  addToEntityCache({
    publicId: file.public_id,
    table: 'files',
    name: file.name,
    route: `/files/${file.public_id}`,
  });
}

/**
 * Add a page to the cache
 */
export function addPageToCache(
  page: { public_id: string }, 
  file: { public_id: string; name: string },
  pageNumber: number
): void {
  addToEntityCache({
    publicId: page.public_id,
    table: 'pages',
    name: `${file.name} - Page ${pageNumber}`,
    route: `/files/${file.public_id}?page=${pageNumber}`,
    parentId: file.public_id,
  });
}

/**
 * Remove an entity from the cache
 */
export function removeFromEntityCache(publicId: string): void {
  entityCache.delete(publicId);
}

/**
 * Remove a file and all its pages from the cache
 */
export function removeFileFromCache(filePublicId: string): void {
  // Remove all pages belonging to this file
  for (const [id, entity] of entityCache.entries()) {
    if (entity.parentId === filePublicId) {
      entityCache.delete(id);
    }
  }
  // Remove the file itself
  entityCache.delete(filePublicId);
}

/**
 * Add an image to the cache
 */
export function addImageToCache(image: { public_id: string; file_name: string }): void {
  addToEntityCache({
    publicId: image.public_id,
    table: 'images',
    name: image.file_name,
    route: `/images/${image.public_id}`,
  });
}

/**
 * Remove an image from the cache
 */
export function removeImageFromCache(imagePublicId: string): void {
  entityCache.delete(imagePublicId);
}

/**
 * Get entity info by public ID
 */
export function getEntityInfo(publicId: string): EntityInfo | null {
  return entityCache.get(publicId) ?? null;
}

/**
 * Get multiple entities by their public IDs
 */
export function getEntitiesInfo(publicIds: string[]): Record<string, EntityInfo | null> {
  const result: Record<string, EntityInfo | null> = {};
  for (const id of publicIds) {
    result[id] = entityCache.get(id) ?? null;
  }
  return result;
}

/**
 * Register IPC handlers for entity cache operations
 */
export function registerEntityCacheHandlers(): void {
  // Get a single entity's info
  ipcMain.handle('entityCache:get', (_, publicId: string) => {
    return getEntityInfo(publicId);
  });

  // Get multiple entities' info
  ipcMain.handle('entityCache:getBatch', (_, publicIds: string[]) => {
    return getEntitiesInfo(publicIds);
  });

  // Force refresh the cache (useful if data was modified externally)
  ipcMain.handle('entityCache:refresh', () => {
    initializeEntityCache();
    return entityCache.size;
  });
}

