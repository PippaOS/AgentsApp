/**
 * IPC handlers for chat operations
 */
import { ipcMain, BrowserWindow, MessageChannelMain } from 'electron';
import { chatStore, messageStore, configStore, chatContextStore } from '../db/store';
import { fileStore } from '../db/file-store';
import { imageStore } from '../db/image-store';
import { streamChatCompletion } from '../chat/openrouter';

const dbg = (...args: unknown[]) => console.log('[chat-debug][main][ipc]', ...args);

// Track active stream AbortControllers by internal chat ID
const activeStreamControllers = new Map<number, AbortController>();

type StreamStartMsg = {
  type: 'stream:start';
  requestId: string;
  chatId: number;
  userContent: string;
  images?: Array<{ id: string; dataUrl: string }>;
  // Back-compat: older renderers sent public IDs.
  chatPublicId?: string;
  agentPublicId?: string;
  agentId?: number;
};

type StreamCancelMsg = {
  type: 'stream:cancel';
  requestId?: string;
  chatId?: number;
  // Back-compat: older renderers sent public IDs.
  chatPublicId?: string;
};

type AgentSessionInboundMsg = StreamStartMsg | StreamCancelMsg | { type: 'session:disconnect' };

type AgentSessionOutboundMsg =
  | { type: 'session:ready' }
  | { type: 'stream:chunk'; requestId: string; content: string }
  | { type: 'stream:reasoning'; requestId: string; reasoning: string }
  | { type: 'stream:tool_call'; requestId: string; toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' } }
  | { type: 'stream:image'; requestId: string; image: { type: 'image_url'; image_url: { url: string } } }
  | { type: 'stream:error'; requestId: string; error: string }
  | { type: 'stream:done'; requestId: string; result: { content: string; reasoning: string; usage?: unknown } };

// One persistent port per agent tab/session (renderer-managed lifetime).
const agentSessionPorts = new Map<string, { port: Electron.MessagePortMain }>();
const agentSessionAbortByRequestId = new Map<string, AbortController>();

/**
 * Register all chat-related IPC handlers
 */
export function registerChatHandlers(): void {
  // Chat operations
  ipcMain.handle('chat:getAll', () => {
    return chatStore.getAll();
  });

  ipcMain.handle('chat:getAllWithAgent', () => {
    return chatStore.getAllWithAgent();
  });

  ipcMain.handle('chat:getById', (_evt, id: number) => {
    return chatStore.getById(id);
  });

  ipcMain.handle('chat:getByPublicId', (_, publicId: string) => {
    return chatStore.getByPublicId(publicId);
  });

  ipcMain.handle('chat:create', (_, input?: { agent_public_id?: string }) => {
    const result = chatStore.create(input);
    // Emit update event so sidebar refreshes
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('chats:updated');
    });
    return result;
  });

  ipcMain.handle('chat:updateAgentPublicId', (_, publicId: string, agentPublicId: string | null) => {
    chatStore.updateAgentPublicId(publicId, agentPublicId);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('chats:updated');
    });
  });

  ipcMain.handle('chat:delete', (_, publicId: string) => {
    chatStore.delete(publicId);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('chats:updated');
    });
  });

  // Message operations
  ipcMain.handle('chat:getMessages', (_, chatPublicId: string) => {
    const messages = messageStore.getByChatPublicId(chatPublicId);

    const enrichedMessages = messages.map(msg => {
      // Enrich chat_context messages with file/image/page entity info and context public_id (for UI rendering)
      if (msg.message_type === 'chat_context' && msg.entity_id) {
        const file = fileStore.getByPublicId(msg.entity_id);
        const image = imageStore.getByPublicId(msg.entity_id);
        const page = fileStore.getPageByPublicId(msg.entity_id);
        
        // Get context public_id - try multiple methods:
        // 1. chat_context_id (direct reference)
        // 2. message_id (lookup by message)
        // 3. entity_id + chat_id (fallback lookup)
        let contextPublicId: string | undefined;
        if (msg.chat_context_id) {
          const context = chatContextStore.getById(msg.chat_context_id);
          contextPublicId = context?.public_id;
        }
        
        if (!contextPublicId && msg.id) {
          // Fallback: look up by message internal ID
          const context = chatContextStore.getByMessageId(msg.id);
          contextPublicId = context?.public_id;
        }
        
        if (!contextPublicId && msg.entity_id && msg.chat_id) {
          // Final fallback: look up by entity_id and chat_id
          const context = chatContextStore.getByEntityIdAndChatId(msg.entity_id, msg.chat_id);
          contextPublicId = context?.public_id;
        }
        
        if (file) {
          return {
            ...msg,
            entity: {
              id: file.public_id,
              type: 'file',
              name: file.name,
            },
            context_public_id: contextPublicId,
          };
        }
        
        if (image) {
          return {
            ...msg,
            entity: {
              id: image.public_id,
              type: 'image',
              name: image.file_name,
            },
            context_public_id: contextPublicId,
          };
        }
        
        if (page) {
          // Get parent file for page number
          const parentFile = fileStore.getById(page.file_id);
          const pages = parentFile ? fileStore.getPagesByFileId(parentFile.id) : [];
          const pageIndex = pages.findIndex(p => p.public_id === msg.entity_id);
          const pageNumber = pageIndex >= 0 ? pageIndex + 1 : 1;
          
          return {
            ...msg,
            entity: {
              id: page.public_id,
              type: 'page',
              name: parentFile ? `${parentFile.name}` : 'Unknown PDF',
              parent_name: parentFile?.name,
              page_number: pageNumber,
            },
            context_public_id: contextPublicId,
          };
        }
        
        // Return with context_public_id even if entity not found
        return {
          ...msg,
          context_public_id: contextPublicId,
        };
      }

      return msg;
    });

    return enrichedMessages;
  });

  ipcMain.handle('chat:createMessage', (_, input: {
    chat_public_id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    reasoning?: string;
    model?: string;
    message_type?: 'text' | 'tool_call' | 'tool_result' | 'image_generation_call' | 'error';
  }) => {
    // Get chat by public_id first
    const chat = chatStore.getByPublicId(input.chat_public_id);
    if (!chat) {
      throw new Error('Chat not found');
    }

    return messageStore.create({
      chat_id: chat.id,
      role: input.role,
      content: input.content,
      reasoning: input.reasoning,
      model: input.model,
      message_type: input.message_type,
    });
  });

  // Context operations
  ipcMain.handle('chat:getContext', (_, chatPublicId: string) => {
    const chat = chatStore.getByPublicId(chatPublicId);
    if (!chat) {
      throw new Error('Chat not found');
    }
    const contextItems = chatContextStore.getByChatId(chat.id);
    
    // Enrich context items with entity info
    const enrichedItems = contextItems.map(item => {
      const file = fileStore.getByPublicId(item.entity_id);
      const image = imageStore.getByPublicId(item.entity_id);
      const page = fileStore.getPageByPublicId(item.entity_id);
      
      if (file) {
        return {
          ...item,
          file_name: file.name,
          file_public_id: file.public_id,
        };
      }
      
      if (image) {
        return {
          ...item,
          file_name: image.file_name,
          image_public_id: image.public_id,
        };
      }
      
      if (page) {
        // Get parent file for page number and name
        const parentFile = fileStore.getById(page.file_id);
        const pages = parentFile ? fileStore.getPagesByFileId(parentFile.id) : [];
        const pageIndex = pages.findIndex(p => p.public_id === item.entity_id);
        const pageNumber = pageIndex >= 0 ? pageIndex + 1 : 1;
        
        return {
          ...item,
          file_name: parentFile ? `${parentFile.name} - Page ${pageNumber}` : `Page ${pageNumber}`,
          page_public_id: page.public_id,
          page_number: pageNumber,
          parent_file_name: parentFile?.name,
        };
      }
      
      return item;
    });
    
    return enrichedItems;
  });

  ipcMain.handle('chat:addToContext', (event, chatPublicId: string, entityId: string, entityType?: 'file' | 'image' | 'page') => {
    const chat = chatStore.getByPublicId(chatPublicId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Determine the actual entity type if not provided
    let actualEntityType = entityType;
    if (!actualEntityType) {
      // Try to determine from the entity ID
      const file = fileStore.getByPublicId(entityId);
      const image = imageStore.getByPublicId(entityId);
      const page = fileStore.getPageByPublicId(entityId);
      
      if (file) actualEntityType = 'file';
      else if (image) actualEntityType = 'image';
      else if (page) actualEntityType = 'page';
      else throw new Error('Entity not found');
    }

    // Create a chat_context message referencing the entity (positional marker)
    const message = messageStore.create({
      chat_id: chat.id,
      role: 'assistant',
      content: '',
      message_type: 'chat_context',
      entity_id: entityId,
    });

    // Link in chat_context
    const contextItem = chatContextStore.create({
      chat_id: chat.id,
      entity_id: entityId,
      message_id: message.id,
    });

    // Update back-reference on the message
    messageStore.updateChatContextId(message.id, contextItem.id);

    // Notify all windows that context was updated
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('chat:contextUpdated', { chatPublicId, action: 'added' });
    });

    return { context: contextItem, message };
  });

  ipcMain.handle('chat:removeFromContext', (event, contextPublicId: string) => {
    const context = chatContextStore.getByPublicId(contextPublicId);
    if (!context) {
      return;
    }

    // Get chat public ID for notification
    const chat = chatStore.getById(context.chat_id);
    const chatPublicId = chat?.public_id;

    // Remove linked message first to keep positional marker consistent
    if (context.message_id) {
      try {
        messageStore.deleteById(context.message_id);
      } catch (err) {
        // Failed to delete context message
      }
    }

    chatContextStore.delete(contextPublicId);

    // Notify all windows that context was updated
    if (chatPublicId) {
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('chat:contextUpdated', { chatPublicId, action: 'removed' });
      });
    }
  });

  // Streaming chat completion with MessagePort
  ipcMain.handle(
    'chat:stream',
    async (
      event,
      chatId: number,
      userContent: string,
      images?: Array<{ id: string; dataUrl: string }>,
    ) => {
    // Get chat record to read model and reasoning
    const chat = chatStore.getById(chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    dbg('chat:stream handle', {
      chatId,
      userContentLen: userContent?.length ?? 0,
      model: chat.model,
      reasoning: chat.reasoning,
      images: images?.length ?? 0,
    });
    const sender = event.sender;
    
    // Create a MessageChannel for direct communication
    const { port1, port2 } = new MessageChannelMain();
    
    // Create AbortController for this stream
    const abortController = new AbortController();
    activeStreamControllers.set(chatId, abortController);
    
    // Clean up controller when stream ends
    const cleanup = () => {
      activeStreamControllers.delete(chatId);
    };
    
    // Send port1 to the renderer for direct communication
    sender.postMessage('chat:stream:port', { chatId }, [port1]);
    dbg('chat:stream posted port to renderer', { chatId });
    
    // Stream using port2 to send data directly to renderer
    await streamChatCompletion(chatId, userContent, images, {
      onChunk: (content: string) => {
        port2.postMessage({ type: 'chunk', content });
      },
      onReasoning: (reasoning: string) => {
        port2.postMessage({ type: 'reasoning', reasoning });
      },
      onToolCall: (toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' }) => {
        port2.postMessage({ type: 'tool_call', toolCall });
      },
      onImage: (image: { type: 'image_url'; image_url: { url: string } }) => {
        port2.postMessage({ type: 'image', image });
      },
      onError: (error: Error) => {
        dbg('chat:stream onError', { chatId, error: error.message });
        port2.postMessage({ type: 'error', error: error.message });
        port2.close();
        cleanup();
      },
      onDone: (result: { content: string; reasoning: string; usage?: unknown }) => {
        dbg('chat:stream onDone', { chatId, contentLen: result?.content?.length ?? 0 });
        port2.postMessage({ type: 'done', result });
        port2.close();
        cleanup();
      },
    }, abortController.signal);

    dbg('chat:stream handler done', { chatId });
    return { success: true };
  },
  );

  /**
   * Persistent Agent Session transport (MessagePort per agent tab).
   *
   * This is an architecture upgrade from per-request ports:
   * - Renderer opens a session once per agent tab: `chat:session:connect(sessionId)`
   * - Main sends a MessagePort back: `chat:session:port {sessionId}`
   * - Subsequent streaming/cancel commands happen over the port (requestId-scoped).
   */
  ipcMain.handle('chat:session:connect', async (event, sessionId: string) => {
    dbg('chat:session:connect handle', { sessionId });
    // If session already exists, close and replace it (renderer may reconnect after refresh/hmr).
    const existing = agentSessionPorts.get(sessionId);
    if (existing) {
      try {
        existing.port.close();
      } catch {
        // ignore
      }
      agentSessionPorts.delete(sessionId);
    }

    const sender = event.sender;
    const { port1, port2 } = new MessageChannelMain();

    agentSessionPorts.set(sessionId, { port: port2 });
    dbg('chat:session:connect created port', { sessionId });

    // Wire inbound commands from renderer.
    port2.on('message', async (portEvent: { data: AgentSessionInboundMsg }) => {
      const data = portEvent?.data;
      const meta =
        data && typeof data === 'object'
          ? (data as Partial<{ type: string; requestId: string; chatId: number; agentId: number }>)
          : {};
      dbg('chat:session port inbound', { sessionId, type: meta.type, requestId: meta.requestId, chatId: meta.chatId, agentId: meta.agentId });
      if (!data || typeof data !== 'object' || !('type' in data)) return;

      if (data.type === 'session:disconnect') {
        // Renderer is explicitly closing this session.
        const current = agentSessionPorts.get(sessionId);
        if (current?.port === port2) {
          agentSessionPorts.delete(sessionId);
        }
        try {
          port2.close();
        } catch {
          // ignore
        }
        return;
      }

      if (data.type === 'stream:cancel') {
        let cancelChatId: number | undefined = data.chatId;
        if ((!cancelChatId || cancelChatId <= 0) && data.chatPublicId) {
          const chat = chatStore.getByPublicId(data.chatPublicId);
          cancelChatId = chat?.id;
        }

        dbg('chat:session stream:cancel', { sessionId, chatId: cancelChatId, requestId: data.requestId });
        // Prefer request-scoped controller if provided, otherwise fall back to chatId map.
        if (data.requestId) {
          const c = agentSessionAbortByRequestId.get(data.requestId);
          if (c) {
            c.abort();
            agentSessionAbortByRequestId.delete(data.requestId);
          }
        }
        const controller = cancelChatId ? activeStreamControllers.get(cancelChatId) : undefined;
        if (controller) {
          controller.abort();
          if (cancelChatId) activeStreamControllers.delete(cancelChatId);
        }
        return;
      }

      if (data.type === 'stream:start') {
        const msg = data;
        let chatId: number | undefined = msg.chatId;
        let chat: ReturnType<typeof chatStore.getById> | ReturnType<typeof chatStore.getByPublicId> | null = null;
        
        if ((!chatId || chatId <= 0) && msg.chatPublicId) {
          chat = chatStore.getByPublicId(msg.chatPublicId);
          chatId = chat?.id;
        } else if (chatId) {
          chat = chatStore.getById(chatId);
        }

        if (!chatId || !chat) {
          const out: AgentSessionOutboundMsg = { type: 'stream:error', requestId: msg.requestId, error: 'Chat not found' };
          try { port2.postMessage(out); } catch { /* ignore */ }
          return;
        }

        dbg('chat:session stream:start', {
          sessionId,
          requestId: msg.requestId,
          chatId,
          userContentLen: msg.userContent?.length ?? 0,
          model: chat.model,
          reasoning: chat.reasoning,
          images: msg.images?.length ?? 0,
        });

        // Create AbortController for this request and also keep backward-compatible chat-level cancel.
        const abortController = new AbortController();
        agentSessionAbortByRequestId.set(msg.requestId, abortController);
        activeStreamControllers.set(chatId, abortController);

        const cleanup = () => {
          agentSessionAbortByRequestId.delete(msg.requestId);
          // Only delete chatId controller if it still points at this controller.
          const current = activeStreamControllers.get(chatId);
          if (current === abortController) {
            activeStreamControllers.delete(chatId);
          }
        };

        try {
          await streamChatCompletion(
            chatId,
            msg.userContent,
            msg.images,
            {
              onChunk: (content: string) => {
                const out: AgentSessionOutboundMsg = { type: 'stream:chunk', requestId: msg.requestId, content };
                port2.postMessage(out);
              },
              onReasoning: (reasoningText: string) => {
                const out: AgentSessionOutboundMsg = { type: 'stream:reasoning', requestId: msg.requestId, reasoning: reasoningText };
                port2.postMessage(out);
              },
              onToolCall: (toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' }) => {
                const out: AgentSessionOutboundMsg = { type: 'stream:tool_call', requestId: msg.requestId, toolCall };
                port2.postMessage(out);
              },
              onImage: (image: { type: 'image_url'; image_url: { url: string } }) => {
                const out: AgentSessionOutboundMsg = { type: 'stream:image', requestId: msg.requestId, image };
                port2.postMessage(out);
              },
              onError: (error: Error) => {
                dbg('chat:session onError', { sessionId, requestId: msg.requestId, error: error.message });
                const out: AgentSessionOutboundMsg = { type: 'stream:error', requestId: msg.requestId, error: error.message };
                port2.postMessage(out);
                cleanup();
              },
              onDone: (result: { content: string; reasoning: string; usage?: unknown }) => {
                dbg('chat:session onDone', { sessionId, requestId: msg.requestId, contentLen: result?.content?.length ?? 0 });
                const out: AgentSessionOutboundMsg = { type: 'stream:done', requestId: msg.requestId, result };
                port2.postMessage(out);
                // Notify sidebar that chats have updated (for last message preview)
                BrowserWindow.getAllWindows().forEach(win => {
                  win.webContents.send('chats:updated');
                });
                cleanup();
              },
            },
            abortController.signal
          );
        } catch (err) {
          dbg('chat:session stream:start threw', { sessionId, requestId: msg.requestId, err: (err as Error)?.message });
          const out: AgentSessionOutboundMsg = {
            type: 'stream:error',
            requestId: msg.requestId,
            error: (err as Error)?.message || 'Unknown error',
          };
          try {
            port2.postMessage(out);
          } catch {
            // ignore
          }
          cleanup();
        }
      }
    });

    port2.start();

    // Send port1 to renderer.
    sender.postMessage('chat:session:port', { sessionId }, [port1]);
    port2.postMessage({ type: 'session:ready' } as AgentSessionOutboundMsg);
    dbg('chat:session:connect posted port to renderer', { sessionId });

    return { success: true };
  });

  // Cancel active stream
  ipcMain.handle('chat:cancel', (_, chatId: number) => {
    const controller = activeStreamControllers.get(chatId);
    if (controller) {
      controller.abort();
      activeStreamControllers.delete(chatId);
      return { success: true };
    }
    return { success: false, error: 'No active stream found' };
  });

  // Config operations
  ipcMain.handle('config:get', (_, key: string) => {
    return configStore.get(key);
  });

  ipcMain.handle('config:set', (_, key: string, value: string) => {
    configStore.set(key, value);
  });

  ipcMain.handle('config:getAll', () => {
    return configStore.getAll();
  });

  // Branch from message - create a new chat with all messages before a given message
  ipcMain.handle('chat:branchFromMessage', (_, messagePublicId: string) => {
    const message = messageStore.getByPublicId(messagePublicId);
    if (!message) {
      throw new Error('Message not found');
    }

    // Ensure it's a user message
    if (message.role !== 'user') {
      throw new Error('Can only branch from user messages');
    }

    const chat = chatStore.getById(message.chat_id);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Get all messages in this chat
    const allMessages = messageStore.getByChatId(message.chat_id);
    
    // Filter messages that come before the target message (by created_at)
    const messageIndex = allMessages.findIndex(m => m.public_id === messagePublicId);
    if (messageIndex === -1) {
      throw new Error('Message not found in chat');
    }
    
    const messagesToCopy = allMessages.slice(0, messageIndex);

    // Create new chat
    const newChat = chatStore.create({ agent_public_id: chat.agent_public_id || undefined });

    // Copy all messages before the target message
    for (const msg of messagesToCopy) {
      messageStore.create({
        chat_id: newChat.id,
        role: msg.role,
        content: msg.content,
        reasoning: msg.reasoning || undefined,
        reasoning_details_json: msg.reasoning_details_json || undefined,
        response_json: msg.response_json || undefined,
        model: msg.model || undefined,
        message_type: msg.message_type,
        entity_id: msg.entity_id || undefined,
        tool_calls_json: msg.tool_calls_json || undefined,
        tool_call_id: msg.tool_call_id || undefined,
        tool_name: msg.tool_name || undefined,
        tool_input: msg.tool_input || undefined,
        tool_output: msg.tool_output || undefined,
        cost: msg.cost || undefined,
        chat_context_id: msg.chat_context_id ?? undefined,
      });

      // If this is a chat_context message, also copy the chat_context entry
      if (msg.message_type === 'chat_context' && msg.entity_id) {
        const contextItem = chatContextStore.getByMessageId(msg.id);
        if (contextItem) {
          const newMessage = messageStore.getByChatId(newChat.id).find(
            m => m.entity_id === msg.entity_id && m.message_type === 'chat_context'
          );
          if (newMessage) {
            const newContextItem = chatContextStore.create({
              chat_id: newChat.id,
              entity_id: contextItem.entity_id,
              message_id: newMessage.id,
            });
            // Update the message with the new context ID
            messageStore.updateChatContextId(newMessage.id, newContextItem.id);
          }
        }
      }
    }

    // Parse the target message content to extract text and images
    let textContent = '';
    const images: Array<{ id: string; dataUrl: string }> = [];
    
    try {
      const parsed = JSON.parse(message.content);
      if (Array.isArray(parsed)) {
        for (const part of parsed) {
          if (part.type === 'text' && part.text) {
            textContent = part.text;
          } else if (part.type === 'image_url' && part.image_url?.url) {
            images.push({
              id: `img-${images.length}`,
              dataUrl: part.image_url.url,
            });
          }
        }
      } else {
        // Not a JSON array, use as plain text
        textContent = message.content;
      }
    } catch {
      // Not JSON, use as plain text
      textContent = message.content;
    }

    return {
      newChatPublicId: newChat.public_id,
      content: textContent,
      images,
    };
  });
}