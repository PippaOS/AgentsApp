import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const dbg = (...args: unknown[]) => console.log('[chat-debug][preload]', ...args);

// Keep session MessagePorts in the preload world; do NOT pass MessagePort objects across contextBridge.
const chatSessionPorts = new Map<string, MessagePort>();

// Expose protected methods that allow the renderer process to use
// the database through IPC
contextBridge.exposeInMainWorld('db', {
  // Migration/admin operations
  migrations: {
    getCurrentVersion: () => ipcRenderer.invoke('db:migrations:getCurrentVersion'),
    getHistory: () => ipcRenderer.invoke('db:migrations:getHistory'),
  },
  
  // Model operations
  models: {
    getAll: () => ipcRenderer.invoke('db:models:getAll'),
    getByPublicId: (publicId: string) => ipcRenderer.invoke('db:models:getByPublicId', publicId),
    getById: (id: number) => ipcRenderer.invoke('db:models:getById', id),
    getByName: (name: string) => ipcRenderer.invoke('db:models:getByName', name),
    getByOpenRouterId: (openrouterId: string) => ipcRenderer.invoke('db:models:getByOpenRouterId', openrouterId),
    create: (input: { name: string; openrouter_id?: string }) => ipcRenderer.invoke('db:models:create', input),
    addFromOpenRouter: (openrouterId: string) => ipcRenderer.invoke('db:models:addFromOpenRouter', openrouterId),
    syncWithOpenRouter: (publicId: string) => ipcRenderer.invoke('db:models:syncWithOpenRouter', publicId),
    delete: (publicId: string) => ipcRenderer.invoke('db:models:delete', publicId),
    deleteById: (id: number) => ipcRenderer.invoke('db:models:deleteById', id),
    onUpdated: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('models:updated', subscription);
      return () => ipcRenderer.removeListener('models:updated', subscription);
    },
  },

  // Agent operations
  agents: {
    getAll: () => ipcRenderer.invoke('db:agents:getAll'),
    getByPublicId: (publicId: string) => ipcRenderer.invoke('db:agents:getByPublicId', publicId),
    create: (input: { name: string; prompt?: string }) => ipcRenderer.invoke('db:agents:create', input),
    clone: (sourcePublicId: string, newName: string) => ipcRenderer.invoke('db:agents:clone', sourcePublicId, newName),
    updateName: (publicId: string, name: string) => ipcRenderer.invoke('db:agents:updateName', publicId, name),
    updatePrompt: (publicId: string, prompt: string) => ipcRenderer.invoke('db:agents:updatePrompt', publicId, prompt),
    updateBio: (publicId: string, bio: string | null) => ipcRenderer.invoke('db:agents:updateBio', publicId, bio),
    updateAllowParallelToolCalls: (publicId: string, allow: boolean) =>
      ipcRenderer.invoke('db:agents:updateAllowParallelToolCalls', publicId, allow),
    updateAvatarUrl: (publicId: string, avatarUrl: string | null) =>
      ipcRenderer.invoke('db:agents:updateAvatarUrl', publicId, avatarUrl),
    updateModel: (publicId: string, model: string | null) =>
      ipcRenderer.invoke('db:agents:updateModel', publicId, model),
    updateReasoning: (publicId: string, reasoning: string | null) =>
      ipcRenderer.invoke('db:agents:updateReasoning', publicId, reasoning),
    updateCanRunCode: (publicId: string, canRunCode: boolean) =>
      ipcRenderer.invoke('db:agents:updateCanRunCode', publicId, canRunCode),
    updatePermissions: (publicId: string, permissions: string[]) =>
      ipcRenderer.invoke('db:agents:updatePermissions', publicId, permissions),
    updateWorkspacePaths: (publicId: string, paths: string[]) =>
      ipcRenderer.invoke('db:agents:updateWorkspacePaths', publicId, paths),
    delete: (publicId: string) => ipcRenderer.invoke('db:agents:delete', publicId),
    onUpdated: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('agents:updated', subscription);
      return () => ipcRenderer.removeListener('agents:updated', subscription);
    },
  },

  // Tool operations
  tools: {
    getAll: () => ipcRenderer.invoke('db:tools:getAll'),
    getByPublicId: (publicId: string) => ipcRenderer.invoke('db:tools:getByPublicId', publicId),
    create: (input: { name: string; description?: string | null; input_schema_json?: string; code_ts?: string }) =>
      ipcRenderer.invoke('db:tools:create', input),
    update: (publicId: string, input: { name?: string; description?: string | null; input_schema_json?: string; code_ts?: string }) =>
      ipcRenderer.invoke('db:tools:update', publicId, input),
    delete: (publicId: string) => ipcRenderer.invoke('db:tools:delete', publicId),
    onUpdated: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('tools:updated', subscription);
      return () => ipcRenderer.removeListener('tools:updated', subscription);
    },
  },

  agentTools: {
    getByAgentPublicId: (agentPublicId: string) => ipcRenderer.invoke('db:agentTools:getByAgentPublicId', agentPublicId),
    setForAgent: (agentPublicId: string, toolPublicIds: string[]) =>
      ipcRenderer.invoke('db:agentTools:setForAgent', agentPublicId, toolPublicIds),
  },
  
  // Data operations
  data: {
    getAll: () => ipcRenderer.invoke('db:data:getAll'),
    getById: (id: number) => ipcRenderer.invoke('db:data:getById', id),
    getByParent: (parentId: string) => ipcRenderer.invoke('db:data:getByParent', parentId),
    create: (input: { 
      parent_id: string; 
      key: string; 
      value?: string | null;
      type?: string | null;
      options?: string | null;
      markdown?: string | null;
      text?: string | null;
      json?: string | null;
    }) => ipcRenderer.invoke('db:data:create', input),
    update: (publicId: string, value: string | null) => ipcRenderer.invoke('db:data:update', publicId, value),
    updateKeyAndValue: (publicId: string, key: string, value: string | null) => ipcRenderer.invoke('db:data:updateKeyAndValue', publicId, key, value),
    delete: (publicId: string) => ipcRenderer.invoke('db:data:delete', publicId),
  },
});

// Expose chat operations
contextBridge.exposeInMainWorld('chat', {
  // Chat CRUD
  getAll: () => ipcRenderer.invoke('chat:getAll'),
  getAllWithAgent: () => ipcRenderer.invoke('chat:getAllWithAgent'),
  getById: (id: number) => ipcRenderer.invoke('chat:getById', id),
  getByPublicId: (publicId: string) => ipcRenderer.invoke('chat:getByPublicId', publicId),
  create: (input?: { agent_public_id?: string }) => ipcRenderer.invoke('chat:create', input),
  updateAgentPublicId: (publicId: string, agentPublicId: string | null) =>
    ipcRenderer.invoke('chat:updateAgentPublicId', publicId, agentPublicId),
  delete: (publicId: string) => ipcRenderer.invoke('chat:delete', publicId),
  onUpdated: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('chats:updated', subscription);
    return () => ipcRenderer.removeListener('chats:updated', subscription);
  },
  
  // Message operations
  getMessages: (chatPublicId: string) => ipcRenderer.invoke('chat:getMessages', chatPublicId),
  createMessage: (input: {
    chat_public_id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    reasoning?: string;
    model?: string;
    message_type?: 'text' | 'tool_call' | 'tool_result' | 'image_generation_call' | 'error';
  }) => ipcRenderer.invoke('chat:createMessage', input),
  
  // Streaming with MessagePort
  stream: (
    chatId: number,
    userContent: string, 
    images?: Array<{ id: string; dataUrl: string }>,
    callbacks?: {
      onChunk?: (content: string) => void;
      onReasoning?: (reasoning: string) => void;
      onToolCall?: (toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' }) => void;
      onImage?: (image: { type: 'image_url'; image_url: { url: string } }) => void;
      onError?: (error: string) => void;
      onDone?: (result: unknown) => void;
    }
  ) => {
    dbg('chat.stream: called', {
      chatId,
      userContentLen: userContent?.length ?? 0,
      images: images?.length ?? 0,
    });
    // Set up listener for the MessagePort
    const portListener = (event: IpcRendererEvent, data?: { chatId?: number }) => {
      // IMPORTANT: multiple streams may run concurrently. Only bind the port intended for THIS chatId.
      if (data?.chatId !== chatId) return;
      dbg('chat.stream: received port', { chatId });
      const ports = (event as unknown as { ports: MessagePort[] }).ports;
      if (!ports || ports.length === 0) return;
      
      const [port] = ports;
      if (port) {
        // Set up MessagePort listeners for direct streaming
        port.onmessage = (portEvent: MessageEvent) => {
          const eventData = portEvent.data;
          dbg('chat.stream: port message', eventData);
          switch (eventData.type) {
              case 'chunk':
                callbacks.onChunk?.(eventData.content);
                break;
              case 'reasoning':
                callbacks.onReasoning?.(eventData.reasoning);
                break;
              case 'tool_call':
                callbacks.onToolCall?.(eventData.toolCall);
                break;
              case 'image':
                callbacks.onImage?.(eventData.image);
                break;
              case 'error':
                callbacks.onError?.(eventData.error);
                port.close();
                break;
              case 'done':
                callbacks.onDone?.(eventData.result);
                port.close();
                break;
          }
        };
        
      port.start();
    }
  };
    
    ipcRenderer.on('chat:stream:port', portListener);
    
    // Start the stream (model and reasoning are read from chat record)
    dbg('chat.stream: invoking ipc chat:stream', { chatId });
    return ipcRenderer.invoke('chat:stream', chatId, userContent, images)
      .then((res) => {
        dbg('chat.stream: ipc resolved', res);
        return res;
      })
      .catch((err) => {
        dbg('chat.stream: ipc rejected', err);
        throw err;
      })
      .finally(() => {
        // Clean up port listener
        dbg('chat.stream: cleanup listener', { chatId });
        ipcRenderer.removeListener('chat:stream:port', portListener);
      });
  },

  // Cancel active stream
  cancelStream: (chatId: number) => ipcRenderer.invoke('chat:cancel', chatId),

  // Context operations
  getContext: (chatPublicId: string) => ipcRenderer.invoke('chat:getContext', chatPublicId),
  addToContext: (chatPublicId: string, entityId: string, entityType?: 'file' | 'image' | 'page') =>
    ipcRenderer.invoke('chat:addToContext', chatPublicId, entityId, entityType).then((res) => res.context ?? res),
  removeFromContext: (contextPublicId: string) =>
    ipcRenderer.invoke('chat:removeFromContext', contextPublicId),
  branchFromMessage: (messagePublicId: string) =>
    ipcRenderer.invoke('chat:branchFromMessage', messagePublicId),
  onContextUpdated: (callback: (data: { chatPublicId: string; action: string }) => void) => {
    const subscription = (_event: IpcRendererEvent, data: { chatPublicId: string; action: string }) => callback(data);
    ipcRenderer.on('chat:contextUpdated', subscription);
    return () => ipcRenderer.removeListener('chat:contextUpdated', subscription);
  },

  /**
   * Persistent session transport for Agent tabs.
   *
   * Renderer calls `connectSession(sessionId)` once (per agent tab). Main responds by
   * posting a MessagePort on the `chat:session:port` channel. The returned port is
   * used for:
   * - starting streams (requestId-scoped)
   * - cancelling streams
   */
  connectSession: (sessionId: string, onEvent: (data: unknown) => void) => {
    dbg('chat.connectSession: called', { sessionId });
    return new Promise<{ success: true }>((resolve, reject) => {
      const portListener = (event: IpcRendererEvent, data?: { sessionId?: string }) => {
        if (data?.sessionId !== sessionId) return;
        dbg('chat.connectSession: received port', { sessionId });
        const ports = (event as unknown as { ports: MessagePort[] }).ports;
        if (!ports || ports.length === 0) return;
        const [port] = ports;
        if (!port) return;

        // Replace any existing port for this session.
        const existing = chatSessionPorts.get(sessionId);
        if (existing) {
          try { existing.close(); } catch (err) { dbg('chat.connectSession: existing port close threw', err); }
          chatSessionPorts.delete(sessionId);
        }
        chatSessionPorts.set(sessionId, port);

        port.onmessage = (ev: MessageEvent) => {
          try {
            dbg('chat.connectSession: port message', { sessionId, data: ev.data });
            onEvent(ev.data);
          } catch (err) {
            dbg('chat.connectSession: onEvent threw', err);
          }
        };

        // Some MessagePort implementations require start(); others auto-start on onmessage assignment.
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (port as any).start?.();
        } catch (err) {
          dbg('chat.connectSession: port start threw', err);
        }

        ipcRenderer.removeListener('chat:session:port', portListener);
        resolve({ success: true });
      };

      ipcRenderer.on('chat:session:port', portListener);
      ipcRenderer
        .invoke('chat:session:connect', sessionId)
        .catch((err) => {
          dbg('chat.connectSession: ipc rejected', err);
          ipcRenderer.removeListener('chat:session:port', portListener);
          reject(err);
        });
    });
  },

  sessionPost: (sessionId: string, message: unknown) => {
    const port = chatSessionPorts.get(sessionId);
    if (!port) {
      dbg('chat.sessionPost: no port for session', { sessionId, message });
      return false;
    }
    dbg('chat.sessionPost: postMessage', { sessionId, message });
    port.postMessage(message);
    return true;
  },

  disconnectSession: (sessionId: string) => {
    const port = chatSessionPorts.get(sessionId);
    dbg('chat.disconnectSession: called', { sessionId, hasPort: !!port });
    chatSessionPorts.delete(sessionId);
    if (!port) return;
    try {
      port.postMessage({ type: 'session:disconnect' });
    } catch (err) {
      dbg('chat.disconnectSession: port postMessage threw', err);
    }
    try {
      port.close();
    } catch (err) {
      dbg('chat.disconnectSession: port close threw', err);
    }
  },
});

// Expose config operations
contextBridge.exposeInMainWorld('config', {
  get: (key: string) => ipcRenderer.invoke('config:get', key),
  set: (key: string, value: string) => ipcRenderer.invoke('config:set', key, value),
  getAll: () => ipcRenderer.invoke('config:getAll'),
});

// Expose secrets operations (encrypted at rest in DB via safeStorage)
contextBridge.exposeInMainWorld('secrets', {
  getMeta: (name: string) => ipcRenderer.invoke('secrets:getMeta', name),
  listMeta: () => ipcRenderer.invoke('secrets:listMeta'),
  set: (name: string, plaintext: string) => ipcRenderer.invoke('secrets:set', name, plaintext),
  delete: (name: string) => ipcRenderer.invoke('secrets:delete', name),
});

// Expose file operations
contextBridge.exposeInMainWorld('files', {
  upload: () => ipcRenderer.invoke('files:upload'),
  uploadFile: () => ipcRenderer.invoke('files:uploadFile'),
  getAll: () => ipcRenderer.invoke('files:getAll'),
  getByPublicId: (publicId: string) => ipcRenderer.invoke('files:getByPublicId', publicId),
  getPages: (publicId: string) => ipcRenderer.invoke('files:getPages', publicId),
  getPageByPublicId: (publicId: string) => ipcRenderer.invoke('files:getPageByPublicId', publicId),
  getPageImage: (imagePath: string) => ipcRenderer.invoke('files:getPageImage', imagePath),
  getFileContent: (publicId: string) => ipcRenderer.invoke('files:getFileContent', publicId),
  delete: (publicId: string, deleteData?: boolean) => ipcRenderer.invoke('files:delete', publicId, deleteData),
  processPDF: (publicId: string) => ipcRenderer.invoke('files:processPDF', publicId),
  updateIncludeData: (publicId: string, includeData: boolean) => ipcRenderer.invoke('files:updateIncludeData', publicId, includeData),
  updatePageIncludeImages: (publicId: string, includeImages: boolean) => ipcRenderer.invoke('pages:updateIncludeImages', publicId, includeImages),
  updatePageIncludeText: (publicId: string, includeText: boolean) => ipcRenderer.invoke('pages:updateIncludeText', publicId, includeText),
  updatePageIncludeData: (publicId: string, includeData: boolean) => ipcRenderer.invoke('pages:updateIncludeData', publicId, includeData),
  download: (publicId: string) => ipcRenderer.invoke('files:download', publicId),
  onUpdated: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('files:updated', subscription);
    return () => ipcRenderer.removeListener('files:updated', subscription);
  },
});

// Expose image operations
contextBridge.exposeInMainWorld('images', {
  upload: () => ipcRenderer.invoke('images:upload'),
  getAll: () => ipcRenderer.invoke('images:getAll'),
  getByPublicId: (publicId: string) => ipcRenderer.invoke('images:getByPublicId', publicId),
  getImageContent: (publicId: string) => ipcRenderer.invoke('images:getImageContent', publicId),
  saveFromBase64: (base64DataUrl: string, fileName?: string) => ipcRenderer.invoke('images:saveFromBase64', base64DataUrl, fileName),
  delete: (publicId: string, deleteData?: boolean) => ipcRenderer.invoke('images:delete', publicId, deleteData),
  download: (publicId: string) => ipcRenderer.invoke('images:download', publicId),
  onUpdated: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('images:updated', subscription);
    return () => ipcRenderer.removeListener('images:updated', subscription);
  },
});

// Expose API call operations
contextBridge.exposeInMainWorld('apiCalls', {
  getAll: () => ipcRenderer.invoke('api-calls:getAll'),
  getById: (id: number) => ipcRenderer.invoke('api-calls:getById', id),
});

// Expose code runner operations (NATS Request-Reply)
contextBridge.exposeInMainWorld('codeRunner', {
  run: (publicId: string, code: string, opts?: { timeoutMs?: number; permissions?: string[] }) =>
    ipcRenderer.invoke('code-runner:run', publicId, code, opts),
});

// Expose code runs (historical executions stored in DB)
contextBridge.exposeInMainWorld('codeRuns', {
  getRecent: (limit?: number) => ipcRenderer.invoke('code-runs:getRecent', limit),
  getByPublicId: (publicId: string) => ipcRenderer.invoke('code-runs:getByPublicId', publicId),
});

// Expose entity cache operations
contextBridge.exposeInMainWorld('entityCache', {
  get: (publicId: string) => ipcRenderer.invoke('entityCache:get', publicId),
  getBatch: (publicIds: string[]) => ipcRenderer.invoke('entityCache:getBatch', publicIds),
  refresh: () => ipcRenderer.invoke('entityCache:refresh'),
  onUpdated: (callback: (entity: { publicId: string; table: string; name: string; route: string; parentId?: string }) => void) => {
    const subscription = (_event: IpcRendererEvent, entity: { publicId: string; table: string; name: string; route: string; parentId?: string }) => callback(entity);
    ipcRenderer.on('entityCache:updated', subscription);
    return () => ipcRenderer.removeListener('entityCache:updated', subscription);
  },
});

// Expose workspace sync operations (rsync into shared runner folder)
contextBridge.exposeInMainWorld('workspace', {
  selectSourceDir: () => ipcRenderer.invoke('workspace:selectSourceDir'),
  sync: (req: { sourcePath: string; destPath?: string; excludes?: string[]; deleteExtraneous?: boolean; rsyncPath?: string }) =>
    ipcRenderer.invoke('workspace:sync', req),
  listDir: (req?: { relPath?: string }) => ipcRenderer.invoke('workspace:listDir', req ?? {}),
  onUpdated: (callback: (data: { ok: boolean; destPath: string }) => void) => {
    const subscription = (_event: IpcRendererEvent, data: { ok: boolean; destPath: string }) => callback(data);
    ipcRenderer.on('workspace:updated', subscription);
    return () => ipcRenderer.removeListener('workspace:updated', subscription);
  },
});
