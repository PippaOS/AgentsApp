import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileStore } from './db/file-store';
import { imageStore } from './db/image-store';
import { dataStore } from './db/data-store';
import { removeFileFromCache, addImageToCache, removeImageFromCache } from './entity-cache';



/**
 * Register IPC handlers for file operations
 */
export function registerFileHandlers(): void {


  // Get all files
  ipcMain.handle('files:getAll', () => {
    return fileStore.getAll();
  });

  // Get file by public ID
  ipcMain.handle('files:getByPublicId', (_, publicId: string) => {
    return fileStore.getByPublicId(publicId);
  });

  // Get pages for a file by public ID (keeping for backwards compatibility)
  ipcMain.handle('files:getPages', (_, publicId: string) => {
    const file = fileStore.getByPublicId(publicId);
    if (!file) return [];
    return fileStore.getPagesByFileId(file.id);
  });

  // Get a single page by public ID
  ipcMain.handle('files:getPageByPublicId', (_, publicId: string) => {
    return fileStore.getPageByPublicId(publicId);
  });

  // Get page image as base64 data URL (keeping for backwards compatibility)
  ipcMain.handle('files:getPageImage', (_, imagePath: string) => {
    try {
      // Resolve relative paths
      let fullPath = imagePath;
      if (!path.isAbsolute(imagePath)) {
        const userDataPath = app.getPath('userData');
        fullPath = path.join(userDataPath, 'pages', imagePath);
      }
      
      if (!fs.existsSync(fullPath)) return null;
      const buffer = fs.readFileSync(fullPath);
      const base64 = buffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch (error) {
      return null;
    }
  });

  // Get file content as base64 data URL (for PDF viewing in renderer)
  ipcMain.handle('files:getFileContent', (_, publicId: string) => {
    const file = fileStore.getByPublicId(publicId);
    if (!file) return null;

    try {
      if (!fs.existsSync(file.storage_path)) return null;
      const buffer = fs.readFileSync(file.storage_path);
      const base64 = buffer.toString('base64');
      const extension = path.extname(file.storage_path).toLowerCase();
      
      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp',
      };
      const mimeType = mimeTypes[extension] || 'application/octet-stream';
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      return null;
    }
  });

  // Delete file
  ipcMain.handle('files:delete', (_, publicId: string, deleteData = false) => {
    const file = fileStore.getByPublicId(publicId);
    if (!file) return;

    // Delete pages from database first
    fileStore.deletePagesByFileId(file.id);

    // Handle data entries for the file and its pages
    // Always unlink, optionally delete based on checkbox
    const pages = fileStore.getPagesByFileId(file.id);
    
    // Process data entries for each page
    pages.forEach(page => {
      if (deleteData) {
        // Delete data entries
        dataStore.deleteByParent(page.public_id);
      } else {
        // Unlink data entries (keep them but remove relationship)
        dataStore.unlinkByParent(page.public_id);
      }
    });
    
    // Process data entries for the file itself
    if (deleteData) {
      // Delete data entries
      dataStore.deleteByParent(publicId);
    } else {
      // Unlink data entries (keep them but remove relationship)
      dataStore.unlinkByParent(publicId);
    }

    // Remove file from disk if no other entry uses this storage path
    // (Though hash is unique in our schema, so this is safe)
    if (fs.existsSync(file.storage_path)) {
      fs.unlinkSync(file.storage_path);
    }

    // Remove page images folder (hash directory)
    const userDataPath = app.getPath('userData');
    const pagesDir = path.join(userDataPath, 'pages', file.hash);
    if (fs.existsSync(pagesDir)) {
      fs.rmSync(pagesDir, { recursive: true, force: true });
    }

    // Remove from entity cache (file and all its pages)
    removeFileFromCache(publicId);

    // Remove from database (pages already deleted above)
    fileStore.delete(publicId);
    
    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('files:updated');
    });
  });

  // Process PDF pages (manual trigger or reprocessing)
  ipcMain.handle('files:processPDF', async (_, publicId: string) => {
    const file = fileStore.getByPublicId(publicId);
    if (!file) {
      throw new Error('File not found');
    }

    const extension = path.extname(file.storage_path).toLowerCase();
    if (extension !== '.pdf') {
      throw new Error('File is not a PDF');
    }

    // Delete existing pages first
    fileStore.deletePagesByFileId(file.id);

    // Remove existing page images
    const userDataPath = app.getPath('userData');
    const pagesDir = path.join(userDataPath, 'pages', file.hash);
    if (fs.existsSync(pagesDir)) {
      fs.rmSync(pagesDir, { recursive: true, force: true });
    }

    
    return fileStore.getByPublicId(publicId);
  });

  // Image operations
  
  // Upload an image
  ipcMain.handle('images:upload', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const originalPath = result.filePaths[0];
    const fileName = path.basename(originalPath);
    const extension = path.extname(originalPath).toLowerCase();
    
    // Validate extension
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    if (!allowedExtensions.includes(extension)) {
      throw new Error(`Unsupported image format. Allowed: PNG, JPEG, WEBP`);
    }

    // Get file size
    const stats = fs.statSync(originalPath);
    const fileSize = stats.size;

    // Prepare storage directory
    const userDataPath = app.getPath('userData');
    const imagesDir = path.join(userDataPath, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Create image record in database first to get the ID
    const newImage = imageStore.create({
      file_name: fileName,
      file_size: fileSize,
    });

    // Copy file to storage using the database ID as filename
    const storageName = `${newImage.id}${extension}`;
    const storagePath = path.join(imagesDir, storageName);
    fs.copyFileSync(originalPath, storagePath);

    // Add to entity cache
    addImageToCache(newImage);

    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('images:updated');
    });

    return newImage;
  });

  // Get all images
  ipcMain.handle('images:getAll', () => {
    return imageStore.getAll();
  });

  // Get image by public ID
  ipcMain.handle('images:getByPublicId', (_, publicId: string) => {
    return imageStore.getByPublicId(publicId);
  });

  // Get image content as base64 data URL
  ipcMain.handle('images:getImageContent', (_, publicId: string) => {
    const image = imageStore.getByPublicId(publicId);
    if (!image) return null;

    try {
      const userDataPath = app.getPath('userData');
      const imagesDir = path.join(userDataPath, 'images');
      const extension = path.extname(image.file_name).toLowerCase();
      const storageName = `${image.id}${extension}`;
      const storagePath = path.join(imagesDir, storageName);
      
      if (!fs.existsSync(storagePath)) return null;
      const buffer = fs.readFileSync(storagePath);
      const base64 = buffer.toString('base64');
      
      // Determine MIME type
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
      };
      const mimeType = mimeTypes[extension] || 'image/png';
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      return null;
    }
  });

  // Save image from base64 data URL
  ipcMain.handle('images:saveFromBase64', async (_, base64DataUrl: string, fileName?: string) => {
    // Parse data URL: data:image/png;base64,{data}
    const dataUrlMatch = base64DataUrl.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!dataUrlMatch) {
      throw new Error('Invalid base64 data URL format');
    }

    const imageType = dataUrlMatch[1].toLowerCase();
    const base64Data = dataUrlMatch[2];

    // Map image type to extension
    const extensionMap: Record<string, string> = {
      'png': '.png',
      'jpeg': '.jpg',
      'jpg': '.jpg',
      'webp': '.webp',
    };

    const extension = extensionMap[imageType] || '.png';
    if (!extensionMap[imageType]) {
      throw new Error(`Unsupported image type: ${imageType}. Supported: PNG, JPEG, WEBP`);
    }

    // Convert base64 to buffer
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      throw new Error('Failed to decode base64 data');
    }

    const fileSize = buffer.length;

    // Generate filename if not provided
    let finalFileName = fileName;
    if (!finalFileName) {
      // Default: generate a UUID and use first part
      const uuid = randomUUID();
      const firstPart = uuid.split('-')[0];
      finalFileName = `chat-image-${firstPart}${extension}`;
    } else {
      // Ensure filename has correct extension
      const existingExt = path.extname(finalFileName).toLowerCase();
      if (existingExt !== extension) {
        finalFileName = path.basename(finalFileName, existingExt) + extension;
      }
    }

    // Prepare storage directory
    const userDataPath = app.getPath('userData');
    const imagesDir = path.join(userDataPath, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Create image record in database first to get the ID
    const newImage = imageStore.create({
      file_name: finalFileName,
      file_size: fileSize,
    });

    // Save file to storage using the database ID as filename
    const storageName = `${newImage.id}${extension}`;
    const storagePath = path.join(imagesDir, storageName);
    fs.writeFileSync(storagePath, buffer);

    // Add to entity cache
    addImageToCache(newImage);

    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('images:updated');
    });

    return newImage;
  });

  // Delete image
  ipcMain.handle('images:delete', (_, publicId: string, deleteData = false) => {
    const image = imageStore.getByPublicId(publicId);
    if (!image) return;

    // Handle data entries for the image
    if (deleteData) {
      // Delete data entries
      dataStore.deleteByParent(publicId);
    } else {
      // Unlink data entries (keep them but remove relationship)
      dataStore.unlinkByParent(publicId);
    }

    // Remove image from disk
    const userDataPath = app.getPath('userData');
    const imagesDir = path.join(userDataPath, 'images');
    const extension = path.extname(image.file_name).toLowerCase();
    const storageName = `${image.id}${extension}`;
    const storagePath = path.join(imagesDir, storageName);
    
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }

    // Remove from entity cache
    removeImageFromCache(publicId);

    // Remove from database
    imageStore.delete(publicId);
    
    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('images:updated');
    });
  });

  // Download image to user-selected location
  ipcMain.handle('images:download', async (_, publicId: string) => {
    const image = imageStore.getByPublicId(publicId);
    if (!image) {
      throw new Error('Image not found');
    }

    const userDataPath = app.getPath('userData');
    const imagesDir = path.join(userDataPath, 'images');
    const extension = path.extname(image.file_name).toLowerCase();
    const storageName = `${image.id}${extension}`;
    const storagePath = path.join(imagesDir, storageName);

    if (!fs.existsSync(storagePath)) {
      throw new Error('Image file not found on disk');
    }

    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: 'Save Image',
      defaultPath: image.file_name,
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    // Copy file to selected location
    fs.copyFileSync(storagePath, result.filePath);

    return { canceled: false, filePath: result.filePath };
  });

  // Update include_data setting (file-level)
  ipcMain.handle('files:updateIncludeData', (_, publicId: string, includeData: boolean) => {
    const file = fileStore.getByPublicId(publicId);
    if (!file) {
      throw new Error('File not found');
    }
    fileStore.updateIncludeData(publicId, includeData);
    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('files:updated');
    });
    return fileStore.getByPublicId(publicId);
  });

  // Page-level update handlers
  // Update page include_images setting
  ipcMain.handle('pages:updateIncludeImages', (_, publicId: string, includeImages: boolean) => {
    const page = fileStore.getPageByPublicId(publicId);
    if (!page) {
      throw new Error('Page not found');
    }
    fileStore.updatePageIncludeImages(publicId, includeImages);
    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('files:updated');
    });
    return fileStore.getPageByPublicId(publicId);
  });

  // Update page include_text setting
  ipcMain.handle('pages:updateIncludeText', (_, publicId: string, includeText: boolean) => {
    const page = fileStore.getPageByPublicId(publicId);
    if (!page) {
      throw new Error('Page not found');
    }
    fileStore.updatePageIncludeText(publicId, includeText);
    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('files:updated');
    });
    return fileStore.getPageByPublicId(publicId);
  });

  // Update page include_data setting
  ipcMain.handle('pages:updateIncludeData', (_, publicId: string, includeData: boolean) => {
    const page = fileStore.getPageByPublicId(publicId);
    if (!page) {
      throw new Error('Page not found');
    }
    fileStore.updatePageIncludeData(publicId, includeData);
    // Emit update event
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('files:updated');
    });
    return fileStore.getPageByPublicId(publicId);
  });

  // Download file to user-selected location
  ipcMain.handle('files:download', async (_, publicId: string) => {
    const file = fileStore.getByPublicId(publicId);
    if (!file) {
      throw new Error('File not found');
    }

    if (!fs.existsSync(file.storage_path)) {
      throw new Error('File not found on disk');
    }

    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: 'Save Image',
      defaultPath: file.name,
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    // Copy file to selected location
    fs.copyFileSync(file.storage_path, result.filePath);

    return { canceled: false, filePath: result.filePath };
  });
}
