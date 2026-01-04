/**
 * Build PDF messages for OpenRouter Chat Completions API
 * Formats PDFs and PDF pages as content parts with text and images
 */

import { fileStore } from '../db/file-store';
import { getDatabase } from '../db/database';
import { dataStore } from '../db/data-store';
import { imageStore } from '../db/image-store';
import type { File, Page } from '../db/types';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { readPageImageAsBase64 } from './util';

// Content part types for Chat Completions API
export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type ContentPart = TextContentPart | ImageContentPart;
  


/**
 * Read image file and convert to base64 data URL with correct MIME type
 */
function readImageAsBase64DataUrl(imageId: number, fileName: string): string | null {
  try {
    const userDataPath = app.getPath('userData');
    const imagesDir = path.join(userDataPath, 'images');
    const extension = path.extname(fileName).toLowerCase();
    const storageName = `${imageId}${extension}`;
    const storagePath = path.join(imagesDir, storageName);
    
    if (!fs.existsSync(storagePath)) {
      return null;
    }
    
    const buffer = fs.readFileSync(storagePath);
    const base64 = buffer.toString('base64');
    
    // Map extension to MIME type
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeTypes[extension] || 'image/png';
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Failed to read image: ${fileName}`, error);
    return null;
  }
}

/**
 * Build opening tag for a PDF page
 */
function buildPdfPageOpenTag(page: Page, pageNumber: number, filename: string): string {
  return `<pdf_page id="${page.public_id}" page_number="${pageNumber}" filename="${filename}">`;
}

/**
 * Build text content tag for a PDF page
 */
function buildPdfPageTextContent(page: Page, indent = ''): string {
  const text = page.text_content || '';
  return `${indent}<text_content>${text}</text_content>`;
}

/**
 * Build closing tag for a PDF page
 */
function buildPdfPageCloseTag(): string {
  return `</pdf_page>`;
}

/**
 * Build message parts for a PDF file
 * Returns an array of content parts for the Chat Completions API:
 * - Interleaved: PDF opening tag, then for each page: page XML (text) + image, then PDF closing tag
 */
export function buildPdfFileMessage(fileId: string): ContentPart[] | null {
  const file = fileStore.getByPublicId(fileId);
  if (!file) {
    return null;
  }
  
  const pages = fileStore.getPagesByFileId(file.id);
  const messageParts: ContentPart[] = [];
  
  // Start with PDF opening tag
  const pdfOpenTag = `<pdf id="${file.public_id}" file_name="${file.name}" page_count="${pages.length}">`;
  messageParts.push({
    type: 'text',
    text: pdfOpenTag,
  });
  
  // Add data entries if include_data is enabled
  if (file.include_data === 1) {
    const dataEntries = dataStore.getByParent(file.public_id);
    for (const dataEntry of dataEntries) {
      const value = dataEntry.value || '';
      const dataTag = `<data public_id="${dataEntry.public_id}" key="${dataEntry.key}">${value}</data>`;
      messageParts.push({
        type: 'text',
        text: dataTag,
      });
    }
  }
  
  // For each page: add opening tag, text content, image, then closing tag
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNumber = i + 1;
    
    // Add opening tag
    const openTag = buildPdfPageOpenTag(page, pageNumber, file.name);
    messageParts.push({
      type: 'text',
      text: openTag,
    });
    
    // Add page-level data entries if include_data is enabled
    if (page.include_data === 1) {
      const pageDataEntries = dataStore.getByParent(page.public_id);
      for (const dataEntry of pageDataEntries) {
        const value = dataEntry.value || '';
        const dataTag = `<data public_id="${dataEntry.public_id}" key="${dataEntry.key}">${value}</data>`;
        messageParts.push({
          type: 'text',
          text: dataTag,
        });
      }
    }
    
    // Add text content
    const textToInclude = page.include_text === 1 ? page.text_content || '' : '';
    const textContent = buildPdfPageTextContent({ ...page, text_content: textToInclude });
    messageParts.push({
      type: 'text',
      text: textContent,
    });
    
    // Add page image if available and include_images is enabled
    if (page.include_images === 1) {
      const base64 = readPageImageAsBase64(page.image_path);
      if (base64) {
        messageParts.push({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${base64}`,
            detail: 'auto',
          },
        });
      }
    }
    
    // Add closing tag
    const closeTag = buildPdfPageCloseTag();
    messageParts.push({
      type: 'text',
      text: closeTag,
    });
  }
  
  // Close PDF tag
  messageParts.push({
    type: 'text',
    text: '</pdf>',
  });
  
  return messageParts;
}

/**
 * Build message parts for a single PDF page
 * Returns an array of content parts for the Chat Completions API
 */
export function buildPdfPageMessage(pageId: string): ContentPart[] | null {
  const page = fileStore.getPageByPublicId(pageId);
  if (!page) {
    return null;
  }
  
  // Get the parent file
  const db = getDatabase();
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(page.file_id) as File | undefined;
  if (!file) {
    return null;
  }
  
  // Get all pages to determine page number
  const pages = fileStore.getPagesByFileId(file.id);
  const pageIndex = pages.findIndex(p => p.public_id === pageId);
  const pageNumber = pageIndex >= 0 ? pageIndex + 1 : 1;
  
  const messageParts: ContentPart[] = [];
  
  // Add opening tag with filename
  const openTag = buildPdfPageOpenTag(page, pageNumber, file.name);
  messageParts.push({
    type: 'text',
    text: openTag,
  });
  
  // Add page-level data entries if include_data is enabled
  if (page.include_data === 1) {
    const pageDataEntries = dataStore.getByParent(page.public_id);
    for (const dataEntry of pageDataEntries) {
      const value = dataEntry.value || '';
      const dataTag = `<data public_id="${dataEntry.public_id}" key="${dataEntry.key}">${value}</data>`;
      messageParts.push({
        type: 'text',
        text: dataTag,
      });
    }
  }
  
  // Add text content
  const textToInclude = page.include_text === 1 ? page.text_content || '' : '';
  const textContent = buildPdfPageTextContent({ ...page, text_content: textToInclude });
  messageParts.push({
    type: 'text',
    text: textContent,
  });
  
  // Add image if available and include_images is enabled
  if (page.include_images === 1) {
    const base64 = readPageImageAsBase64(page.image_path);
    if (base64) {
      messageParts.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${base64}`,
          detail: 'auto',
        },
      });
    }
  }
  
  // Add closing tag
  const closeTag = buildPdfPageCloseTag();
  messageParts.push({
    type: 'text',
    text: closeTag,
  });
  
  return messageParts;
}

/**
 * Build message parts for an image file
 * Returns an array of content parts for the Chat Completions API:
 * - Text part with XML tag: <image type="extension">filename</image>
 * - Image part with base64 data URL
 */
export function buildImageMessage(imageId: string): ContentPart[] | null {
  const image = imageStore.getByPublicId(imageId);
  if (!image) {
    return null;
  }
  
  const messageParts: ContentPart[] = [];
  
  // Extract file extension from filename
  const extension = path.extname(image.file_name).toLowerCase().replace('.', '');
  const fileName = image.file_name;
  
  // Add text part with XML tag
  const imageTag = `<image type="${extension}">${fileName}</image>`;
  messageParts.push({
    type: 'text',
    text: imageTag,
  });
  
  // Read image and convert to base64 data URL
  const imageDataUrl = readImageAsBase64DataUrl(image.id, image.file_name);
  if (imageDataUrl) {
    messageParts.push({
      type: 'image_url',
      image_url: {
        url: imageDataUrl,
        detail: 'auto',
      },
    });
  }
  
  return messageParts;
}
