import { ipcMain } from 'electron';
import {
  apiCallStore,
  apiCallToolCallStore,
  apiCallEntityStore,
} from '../db/store';

/**
 * Redacts base64 strings from JSON by replacing image_url.url values
 * that contain ";base64," with "redacted"
 */
function redactBase64InJSON(jsonString: string | null | undefined): string | null {
  if (!jsonString) return jsonString;
  
  // Recursively process the object to find and redact base64 image URLs
  const processObject = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => processObject(item));
    }
    
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'url' && typeof value === 'string' && value.includes(';base64,')) {
          // Redact base64 URLs
          result[key] = 'redacted';
        } else if (key === 'image_url' && typeof value === 'object' && value !== null) {
          // Handle nested image_url objects
          result[key] = processObject(value);
        } else {
          result[key] = processObject(value);
        }
      }
      return result;
    }
    
    return obj;
  };
  
  try {
    const parsed = JSON.parse(jsonString);
    const redacted = processObject(parsed);
    return JSON.stringify(redacted, null, 2);
  } catch {
    // If JSON parsing fails, return original
    return jsonString;
  }
}

export function registerAPICallHandlers(): void {
  // Return only minimal fields needed for the list view
  ipcMain.handle('api-calls:getAll', () => {
    return apiCallStore.getRecentMinimal(200);
  });

  // Get full details by id, with base64 strings redacted
  ipcMain.handle('api-calls:getById', (_event, id: number) => {
    const call = apiCallStore.getById(id);
    if (!call) return null;

    const tool_calls = apiCallToolCallStore.getByApiCallId(call.id);
    const entities = apiCallEntityStore.getByApiCallId(call.id);

    // Redact base64 strings from response_json before sending to renderer
    const redactedCall = {
      ...call,
      response_json: redactBase64InJSON(call.response_json),
      request_json: redactBase64InJSON(call.request_json),
    };

    return { call: redactedCall, tool_calls, entities };
  });
}


