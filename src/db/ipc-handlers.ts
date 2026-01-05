import { ipcMain, BrowserWindow } from 'electron';
import { getCurrentVersion, getMigrationHistory } from './migrations';
import { modelStore, agentStore, secretStore } from './store';
import { dataStore } from './data-store';
import { codeRunStore } from './code-run-store';
import { agentToolStore, toolStore } from './tool-store';
import { fetchOpenRouterModel } from '../modules/openrouter-models';

/**
 * Register all IPC handlers for database operations
 */
export function registerDatabaseHandlers(): void {
  // Migration operations
  ipcMain.handle('db:migrations:getCurrentVersion', () => {
    return getCurrentVersion();
  });

  ipcMain.handle('db:migrations:getHistory', () => {
    return getMigrationHistory();
  });

  // Model operations
  ipcMain.handle('db:models:getAll', () => {
    return modelStore.getAll();
  });

  ipcMain.handle('db:models:getByPublicId', (_, publicId: string) => {
    return modelStore.getByPublicId(publicId);
  });

  ipcMain.handle('db:models:getById', (_, id: number) => {
    return modelStore.getById(id);
  });

  ipcMain.handle('db:models:getByName', (_, name: string) => {
    return modelStore.getByName(name);
  });

  ipcMain.handle('db:models:getByOpenRouterId', (_, openrouterId: string) => {
    return modelStore.getByOpenRouterId(openrouterId);
  });

  ipcMain.handle('db:models:create', (_, input) => {
    const result = modelStore.create(input);
    // Emit update event to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('models:updated');
    });
    return result;
  });

  // Add model from OpenRouter by ID
  ipcMain.handle('db:models:addFromOpenRouter', async (_, openrouterId: string) => {
    const apiKey = secretStore.get('openrouter_api_key');
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Please set it in the config page.');
    }

    // Check if model already exists
    const existing = modelStore.getByOpenRouterId(openrouterId);
    if (existing) {
      throw new Error(`Model "${openrouterId}" already exists in the database.`);
    }

    // Fetch model metadata from OpenRouter API
    const openrouterModel = await fetchOpenRouterModel(apiKey, openrouterId);
    
    if (!openrouterModel) {
      throw new Error(`Model "${openrouterId}" not found on OpenRouter. Please check the model ID.`);
    }

    // Create model in database
    const result = modelStore.createFromOpenRouter(openrouterModel);

    // Emit update event to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('models:updated');
    });

    return result;
  });

  // Sync existing model with OpenRouter (refresh metadata)
  ipcMain.handle('db:models:syncWithOpenRouter', async (_, publicId: string) => {
    const apiKey = secretStore.get('openrouter_api_key');
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured. Please set it in the config page.');
    }

    // Get existing model
    const existing = modelStore.getByPublicId(publicId);
    if (!existing || !existing.openrouter_id) {
      throw new Error('Model not found or does not have an OpenRouter ID.');
    }

    // Fetch latest metadata from OpenRouter API
    const openrouterModel = await fetchOpenRouterModel(apiKey, existing.openrouter_id);
    
    if (!openrouterModel) {
      throw new Error(`Model "${existing.openrouter_id}" not found on OpenRouter.`);
    }

    // Update model in database
    modelStore.updateFromOpenRouter(publicId, openrouterModel);

    // Emit update event to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('models:updated');
    });

    return modelStore.getByPublicId(publicId);
  });

  ipcMain.handle('db:models:delete', (_, publicId: string) => {
    modelStore.delete(publicId);
    // Emit update event to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('models:updated');
    });
  });

  ipcMain.handle('db:models:deleteById', (_, id: number) => {
    modelStore.deleteById(id);
    // Emit update event to all windows
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('models:updated');
    });
  });

  // Agent operations
  ipcMain.handle('db:agents:getAll', () => {
    return agentStore.getAll();
  });

  ipcMain.handle('db:agents:getByPublicId', (_, publicId: string) => {
    return agentStore.getByPublicId(publicId);
  });

  ipcMain.handle('db:agents:create', (_, input: { name: string; prompt?: string }) => {
    const result = agentStore.create(input);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
    return result;
  });

  ipcMain.handle('db:agents:updateName', (_, publicId: string, name: string) => {
    agentStore.updateName(publicId, name);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updatePrompt', (_, publicId: string, prompt: string) => {
    agentStore.updatePrompt(publicId, prompt);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updateBio', (_, publicId: string, bio: string | null) => {
    agentStore.updateBio(publicId, bio);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updateAllowParallelToolCalls', (_, publicId: string, allow: boolean) => {
    agentStore.updateAllowParallelToolCalls(publicId, allow);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updateAvatarUrl', (_, publicId: string, avatarUrl: string | null) => {
    agentStore.updateAvatarUrl(publicId, avatarUrl);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updateModel', (_, publicId: string, model: string | null) => {
    agentStore.updateModel(publicId, model);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updateReasoning', (_, publicId: string, reasoning: string | null) => {
    agentStore.updateReasoning(publicId, reasoning);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updateCanRunCode', (_, publicId: string, canRunCode: boolean) => {
    agentStore.updateCanRunCode(publicId, canRunCode);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:updatePermissions', (_, publicId: string, permissions: string[]) => {
    agentStore.updatePermissions(publicId, permissions);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  ipcMain.handle('db:agents:delete', (_, publicId: string) => {
    agentStore.delete(publicId);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
  });

  // Tool operations
  ipcMain.handle('db:tools:getAll', () => {
    return toolStore.getAll();
  });

  ipcMain.handle('db:tools:getByPublicId', (_, publicId: string) => {
    return toolStore.getByPublicId(publicId);
  });

  ipcMain.handle('db:tools:create', (_, input: { name: string; description?: string | null; input_schema_json?: string; code_ts?: string }) => {
    const result = toolStore.create(input);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('tools:updated');
    });
    return result;
  });

  ipcMain.handle(
    'db:tools:update',
    (_evt, publicId: string, input: { name?: string; description?: string | null; input_schema_json?: string; code_ts?: string }) => {
      const result = toolStore.update(publicId, input);
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('tools:updated');
      });
      return result;
    },
  );

  ipcMain.handle('db:tools:delete', (_evt, publicId: string) => {
    toolStore.delete(publicId);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('tools:updated');
    });
  });

  // Agent-tool linking
  ipcMain.handle('db:agentTools:getByAgentPublicId', (_evt, agentPublicId: string) => {
    return agentToolStore.getToolsByAgentPublicId(agentPublicId);
  });

  ipcMain.handle('db:agentTools:setForAgent', (_evt, agentPublicId: string, toolPublicIds: string[]) => {
    agentToolStore.setToolsForAgent(agentPublicId, toolPublicIds);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('agents:updated');
    });
    return { ok: true };
  });

  // Data operations
  ipcMain.handle('db:data:getAll', () => {
    return dataStore.getAll();
  });

  ipcMain.handle('db:data:getById', (_, id: number) => {
    return dataStore.getById(id);
  });

  ipcMain.handle('db:data:getByParent', (_, parentId: string) => {
    return dataStore.getByParent(parentId);
  });

  ipcMain.handle('db:data:create', (_, input: { 
    parent_id: string; 
    key: string; 
    value?: string | null;
    type?: string | null;
    options?: string | null;
    markdown?: string | null;
    text?: string | null;
    json?: string | null;
  }) => {
    return dataStore.create(input);
  });

  ipcMain.handle('db:data:update', (_, publicId: string, value: string | null) => {
    dataStore.update(publicId, value);
  });

  ipcMain.handle('db:data:updateKeyAndValue', (_, publicId: string, key: string, value: string | null) => {
    dataStore.updateKeyAndValue(publicId, key, value);
  });

  ipcMain.handle('db:data:delete', (_, publicId: string) => {
    dataStore.delete(publicId);
  });

  // Code runs (runner executions)
  ipcMain.handle('code-runs:getRecent', (_evt, limit?: number) => {
    return codeRunStore.getRecent(limit ?? 200);
  });

  ipcMain.handle('code-runs:getByPublicId', (_evt, publicId: string) => {
    return codeRunStore.getByPublicId(publicId);
  });

  // Secrets (encrypted-at-rest via Electron safeStorage)
  ipcMain.handle('secrets:getMeta', (_evt, name: string) => {
    return secretStore.getMeta(name);
  });

  ipcMain.handle('secrets:listMeta', () => {
    return secretStore.listMeta();
  });

  ipcMain.handle('secrets:set', (_evt, name: string, plaintext: string) => {
    secretStore.set(name, plaintext);
    return { ok: true };
  });

  ipcMain.handle('secrets:delete', (_evt, name: string) => {
    secretStore.delete(name);
    return { ok: true };
  });
}
