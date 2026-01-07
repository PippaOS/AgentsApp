/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Per-instance agent controller.
 *
 * This is intentionally similar to the old single-chat controller, but:
 * - No singleton provider
 * - No localStorage "current chat id"
 * - Designed to be mounted multiple times concurrently
 * - "New chat" replaces the chat within the same instance
 */

import { useEffect, useRef, useState } from 'react';
import { useModelsStore } from '../../stores/models-store';
import type { ChatMessage, ChatData, Entity } from './types';
import type { AgentInstanceStore } from './store';
import { useActiveView } from '../../contexts/ActiveViewContext';
import type { Chat, Message } from '../../db/types';

// Debug function moved outside component to avoid recreation on every render
const dbg = (...args: unknown[]) => console.log('[chat-debug][useAgentInstance]', ...args);

// Extended types for messages that may have joined fields
interface ExtendedMessage extends Message {
  entity?: Entity;
  context_public_id?: string;
}

// Utility function to map database message to chat message
function mapDbMessageToChatMessage(m: ExtendedMessage): ChatMessage {
  return {
    id: m.public_id,
    role: m.role,
    content: m.content,
    reasoning: m.reasoning,
    reasoning_details_json: m.reasoning_details_json,
    response_json: m.response_json,
    model: m.model,
    message_type: m.message_type,
    entity_id: m.entity_id,
    entity: m.entity,
    context_public_id: m.context_public_id,
    tool_calls: m.tool_calls_json ? JSON.parse(m.tool_calls_json) : undefined,
    tool_call_id: m.tool_call_id,
    tool_name: m.tool_name,
    tool_input: m.tool_input,
    tool_output: m.tool_output,
    cost: m.cost,
    created_at: m.created_at,
  };
}

// Utility function to build ChatData from database records
async function buildChatData(chat: Chat, messages: ExtendedMessage[], models: Array<{ id: string; name: string; openrouter_id?: string; created_at: string }>): Promise<ChatData> {
  let agentName: string | null = null;
  let agentAvatarUrl: string | null = null;
  
  if (chat.agent_public_id) {
    try {
      const agent = await window.db.agents.getByPublicId(chat.agent_public_id);
      if (agent) {
        agentName = agent.name ?? null;
        agentAvatarUrl = agent.avatar_url ?? null;
      }
    } catch (err) {
      dbg('buildChatData: failed to load agent', { agentPublicId: chat.agent_public_id, err });
    }
  }

  return {
    id: chat.public_id,
    created_at: chat.created_at,
    agent_public_id: chat.agent_public_id ?? null,
    agent_name: agentName,
    agent_avatar_url: agentAvatarUrl,
    model: chat.model ?? null,
    reasoning: chat.reasoning ?? null,
    messages: messages.map(mapDbMessageToChatMessage),
    context_items: [],
    models,
    total_cost: messages.reduce((sum, m) => sum + (m.cost || 0), 0),
  };
}

export function useAgentInstance(opts: {
  initialChatId?: number | null;
  onChatIdChange?: (chatId: number | null) => void;
  /** Stable id for the chat session (e.g., `chat-123`). */
  sessionId?: string;
  store: AgentInstanceStore;
}) {
  const { openChat } = useActiveView();
  const modelsStore = useModelsStore();
  const store = opts.store;

  // Track the internal chat ID for the active stream (to scope callbacks).
  const activeStreamChatIdRef = useRef<number | null>(null);
  // Which sessionId (if any) this instance currently has a live port for.
  const connectedSessionIdRef = useRef<string | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  // Keep refreshChatDataRef for MessagePort callback (needs latest version)
  const refreshChatDataRef = useRef<(() => Promise<void>) | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);

  // Connect a persistent MessagePort for this agent instance/session (one per agent tab).
  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      const sessionId = opts.sessionId;
      if (!sessionId) return;

      try {
        dbg('session: connect start', { sessionId });
        await window.chat.connectSession(sessionId, (data: any) => {
          dbg('session: port message', data);
          if (!data || typeof data !== 'object') return;
          const requestId = (data as any).requestId as string | undefined;
          if (requestId && activeRequestIdRef.current && requestId !== activeRequestIdRef.current) {
            dbg('session: ignoring stale event', { requestId, active: activeRequestIdRef.current });
            return; // ignore events from old streams
          }

          switch ((data as any).type) {
            case 'session:ready':
              return;
            case 'stream:chunk':
              if (activeStreamChatIdRef.current != null) {
                store.appendContentChunk((data as any).content ?? '');
              }
              return;
            case 'stream:reasoning':
              if (activeStreamChatIdRef.current != null) {
                store.appendReasoningChunk((data as any).reasoning ?? '');
              }
              return;
            case 'stream:tool_call':
              if (activeStreamChatIdRef.current != null) {
                const tc = (data as any).toolCall;
                if (tc?.id && tc?.name) {
                  store.upsertToolCallEvent({
                    toolCallId: tc.id,
                    name: tc.name,
                    arguments: tc.arguments ?? '',
                    status: tc.status ?? 'streaming',
                  });
                }
              }
              return;
            case 'stream:image':
              if (activeStreamChatIdRef.current != null) {
                const img = (data as any).image;
                const url = img?.image_url?.url;
                if (url) store.appendImageEvent(url);
              }
              return;
            case 'stream:error':
              if (activeStreamChatIdRef.current != null) {
                store.setStreaming({ isStreaming: false });
                void refreshChatDataRef.current?.();
              }
              activeStreamChatIdRef.current = null;
              activeRequestIdRef.current = null;
              return;
            case 'stream:done':
              if (activeStreamChatIdRef.current != null) {
                store.resetStreaming();
                void refreshChatDataRef.current?.();
              }
              activeStreamChatIdRef.current = null;
              activeRequestIdRef.current = null;
              return;
          }
        });
        if (cancelled) {
          return;
        }
        connectedSessionIdRef.current = sessionId;
        dbg('session: connected', { sessionId });
      } catch (err) {
        dbg('session: connect failed (will fallback to per-request stream)', err);
        // If session connect fails, we fall back to per-request streaming (existing behavior).
        // No-op here; handleSubmit will choose fallback if port is unavailable.
        connectedSessionIdRef.current = null;
      }
    };

    void connect();

    return () => {
      cancelled = true;
      activeRequestIdRef.current = null;
      connectedSessionIdRef.current = null;
      if (opts.sessionId) {
        dbg('session: disconnect/close');
        try {
          window.chat.disconnectSession(opts.sessionId);
        } catch (err) {
          dbg('session: disconnect/close threw', err);
        }
      }
    };
  }, [opts.sessionId, store]); // session id is stable per agent tab

  // Sync models from global store to this instance store
  const prevModelsRef = useRef<string>('');
  useEffect(() => {
    const mappedModels = modelsStore.models.map(m => ({
      id: m.public_id,
      name: m.name,
      openrouter_id: m.openrouter_id,
      created_at: m.created_at,
    }));

    const modelsKey = mappedModels.map(m => `${m.id}:${m.name}`).join(',');
    if (prevModelsRef.current !== modelsKey) {
      prevModelsRef.current = modelsKey;
      store.setModels(mappedModels);
    }
  }, [modelsStore.models, store]);

  // React 19 compiler handles memoization - no need for useCallback
  const openChatById = async (chatId: number): Promise<void> => {
    try {
      dbg('openChat: start', { chatId });
      const chat = await window.chat.getById(chatId);
      if (!chat) throw new Error('Chat not found');

      const messages = await window.chat.getMessages(chat.public_id);
      dbg('openChat: loaded', { chatId, messageCount: messages.length });

      const chatData = await buildChatData(chat, messages as ExtendedMessage[], modelsStore.models.map(m => ({
        id: m.public_id,
        name: m.name,
        openrouter_id: m.openrouter_id,
        created_at: m.created_at,
      })));

      store.setChatId(chatId);
      store.setChatDbId(chat.id ?? null);
      store.setChatData(chatData);
      opts.onChatIdChange?.(chatId);

      // Reset streaming state and clear any active stream for this instance
      store.resetStreaming();
      activeStreamChatIdRef.current = null;
    } catch (err) {
      dbg('openChat: failed', { chatId, err });
      if ((err as Error).message === 'Chat not found') {
        store.setChatDbId(null);
        store.setChatId(null);
        store.setChatData(null);
        store.resetStreaming();
        activeStreamChatIdRef.current = null;
        opts.onChatIdChange?.(null);
      }
    }
  };

  // React 19 compiler handles memoization - no need for useCallback
  const newChat = async (): Promise<number> => {
    // If a stream is active for this instance, cancel it before switching chats.
    const currentChatDbId = store.getState().chatDbId;
    if (store.getState().streaming.isStreaming && currentChatDbId) {
      try {
        await window.chat.cancelStream(currentChatDbId);
      } catch {
        // ignore
      }
    }

    const chat = await window.chat.create();
    dbg('newChat: created', { id: chat.id });
    await openChatById(chat.id);
    return chat.id;
  };

  // React 19 compiler handles memoization - no need for useCallback
  const refreshChatData = async (): Promise<void> => {
    const chatId = store.getState().chatId;
    if (!chatId) return;
    try {
      const chat = await window.chat.getById(chatId);
      if (!chat) return;
      const messages = await window.chat.getMessages(chat.public_id);

      const chatData = await buildChatData(chat, messages as ExtendedMessage[], modelsStore.models.map(m => ({
        id: m.public_id,
        name: m.name,
        openrouter_id: m.openrouter_id,
        created_at: m.created_at,
      })));

      store.setChatData(chatData);
    } catch {
      // ignore
    }
  };

  // Keep latest refresh callable for MessagePort handlers (avoid stale closure).
  useEffect(() => {
    refreshChatDataRef.current = refreshChatData;
  }, [refreshChatData]);

  // Initialize: if an initial chat id was provided, hydrate it.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const initial = opts.initialChatId;
        if (initial) {
          await openChatById(initial);
        }
      } finally {
        if (!cancelled) setIsInitialized(true);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [opts.initialChatId, openChatById]);

  // Consolidated subscription effects - listen for chat and context updates
  useEffect(() => {
    const unsubscribers = [
      window.chat.onUpdated(() => {
        const currentChatId = store.getState().chatId;
        if (currentChatId) {
          void refreshChatData();
        }
      }),
      window.chat.onContextUpdated(async (data) => {
        // Look up chat by public_id to get id for comparison
        const chat = await window.chat.getByPublicId(data.chatPublicId);
        if (chat && chat.id === store.getState().chatId) {
          void refreshChatData();
        }
      }),
    ];
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [refreshChatData, store]);

  // React 19 compiler handles memoization - no need for useCallback
  const handleSubmit = async (
    content: string,
    agentPublicId: string,
    images?: Array<{ id: string; dataUrl: string }>
  ): Promise<void> => {
    dbg('handleSubmit: start', {
      chatId: store.getState().chatId,
      hasChatData: !!store.getState().chatData,
      isStreaming: store.getState().streaming.isStreaming,
      contentLen: content.length,
      images: images?.length ?? 0,
      agentPublicId,
      connectedSessionId: connectedSessionIdRef.current,
    });
    if (store.getState().streaming.isStreaming) {
      dbg('handleSubmit: early return (already streaming)');
      return;
    }

    if (store.getState().pendingInput) {
      store.setPendingInput(null);
    }

    // Ensure this instance has a chat id; if not, create one (this becomes the instance chat)
    let chatId = store.getState().chatId;
    if (!chatId) {
      dbg('handleSubmit: no chatId, creating new chat');
      const created = await window.chat.create({ agent_public_id: agentPublicId });
      dbg('handleSubmit: created chat with agent', { id: created.id, agentPublicId });
      await openChatById(created.id);
      chatId = created.id;
    }

    const chat = await window.chat.getById(chatId);
    if (!chat) {
      dbg('handleSubmit: chat not found after ensuring chatId', { chatId });
      return;
    }

    // Backfill agent assignment for legacy chats (created without agent_public_id).
    if (!chat.agent_public_id) {
      dbg('handleSubmit: backfilling chat agent_public_id', { chatId, agentPublicId });
      await window.chat.updateAgentPublicId(chat.public_id, agentPublicId);
    }
    
    // Get model and reasoning from chat record (from database)
    const model = chat.model || '';
    const reasoning = (chat.reasoning || '') as 'low' | 'medium' | 'high' | '';
    
    const streamChatId = chat.id; // internal numeric id
    activeStreamChatIdRef.current = streamChatId;
    dbg('handleSubmit: resolved chat', { chatId, internalId: streamChatId, model, reasoning });

    // Add user message to UI immediately
    let messageContent: string;
    if (images && images.length > 0) {
      const contentParts: any[] = [];
      if (content.trim()) contentParts.push({ type: 'text', text: content });
      for (const img of images) {
        contentParts.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'auto' } });
      }
      messageContent = JSON.stringify(contentParts);
    } else {
      messageContent = content;
    }

    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: messageContent,
      message_type: 'text',
      created_at: new Date().toISOString(),
    };

    if (!store.getState().chatData) {
      dbg('handleSubmit: initializing chatData shell');
      // Load agent info if agent_public_id exists
      let agentName: string | null = null;
      let agentAvatarUrl: string | null = null;
      const agentPublicId = chat.agent_public_id;
      if (agentPublicId) {
        try {
          const agent = await window.db.agents.getByPublicId(agentPublicId);
          if (agent) {
            agentName = agent.name ?? null;
            agentAvatarUrl = agent.avatar_url ?? null;
          }
        } catch (err) {
          dbg('handleSubmit: failed to load agent', { agentPublicId, err });
        }
      }
      store.setChatData({
        id: chatId,
        title: '',
        created_at: new Date().toISOString(),
        agent_public_id: agentPublicId ?? null,
        agent_name: agentName,
        agent_avatar_url: agentAvatarUrl,
        model: chat.model ?? null,
        reasoning: chat.reasoning ?? null,
        messages: [],
        context_items: [],
        models: store.getState().models,
        total_cost: 0,
      } as any);
    }

    dbg('handleSubmit: addMessage (optimistic)', { tempId: userMessage.id });
    store.addMessage(userMessage);
    dbg('handleSubmit: startStreaming');
    store.startStreaming();

    try {
      const sessionId = opts.sessionId;
      if (sessionId && connectedSessionIdRef.current === sessionId) {
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        activeRequestIdRef.current = requestId;
        dbg('handleSubmit: session stream:start', { requestId, chatId: streamChatId, model, reasoning, images: images?.length ?? 0, sessionId });
        // Model and reasoning are optional - backend will read from chat record
        const ok = window.chat.sessionPost(sessionId, {
          type: 'stream:start',
          requestId,
          chatId: streamChatId,
          userContent: content,
          images,
        } as any);
        if (ok) return;
        dbg('handleSubmit: sessionPost failed (no port), falling back to per-request stream', { sessionId });
      }

      dbg('handleSubmit: fallback to window.chat.stream (per-request port)');
      // Fallback: legacy per-request port (kept for safety).
      // Model and reasoning are read from chat record
      await window.chat.stream(streamChatId, content, images, {
        onChunk: (chunk: string) => {
          if (activeStreamChatIdRef.current === streamChatId) {
            store.appendContentChunk(chunk);
          }
        },
        onReasoning: (reasoningChunk: string) => {
          if (activeStreamChatIdRef.current === streamChatId) {
            store.appendReasoningChunk(reasoningChunk);
          }
        },
        onToolCall: (toolCall: { id: string; name: string; arguments: string; status: 'streaming' | 'ready' }) => {
          if (activeStreamChatIdRef.current === streamChatId) {
            store.upsertToolCallEvent({
              toolCallId: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments,
              status: toolCall.status,
            });
          }
        },
        onImage: (image: { type: 'image_url'; image_url: { url: string } }) => {
          if (activeStreamChatIdRef.current === streamChatId) {
            store.appendImageEvent(image.image_url.url);
          }
        },
        onError: async () => {
          if (activeStreamChatIdRef.current === streamChatId) {
            store.setStreaming({ isStreaming: false });
            await refreshChatData();
          }
          activeStreamChatIdRef.current = null;
        },
        onDone: async () => {
          if (activeStreamChatIdRef.current === streamChatId) {
            store.resetStreaming();
            await refreshChatData();
          }
          activeStreamChatIdRef.current = null;
        },
      });
    } catch {
      dbg('handleSubmit: caught error (stream start failed)');
      if (activeStreamChatIdRef.current === streamChatId) {
        store.setStreaming({ isStreaming: false });
      }
      activeStreamChatIdRef.current = null;
      activeRequestIdRef.current = null;
    }
  };

  // React 19 compiler handles memoization - no need for useCallback
  const handleCancelStream = async (): Promise<void> => {
    const snap = store.getState();
    let chatDbId = snap.chatDbId;
    if (!chatDbId && snap.chatId) {
      chatDbId = snap.chatId;
    }
    if (!chatDbId) return;

    try {
      const sessionId = opts.sessionId;
      const requestId = activeRequestIdRef.current;
      if (sessionId && connectedSessionIdRef.current === sessionId) {
        window.chat.sessionPost(sessionId, { type: 'stream:cancel', chatId: chatDbId, requestId } as any);
      } else {
        await window.chat.cancelStream(chatDbId);
      }
      store.resetStreaming();
      activeStreamChatIdRef.current = null;
      activeRequestIdRef.current = null;
      await refreshChatData();
    } catch (err) {
      console.error('Failed to cancel stream:', err);
    }
  };

  // React 19 compiler handles memoization - no need for useCallback
  const branchFromMessage = async (messageId: string): Promise<void> => {
    const result = await window.chat.branchFromMessage(messageId);
    store.setPendingInput({
      content: result.content,
      images: result.images,
    });
    // Look up the chat by public_id to get the id
    const newChat = await window.chat.getByPublicId(result.newChatPublicId);
    if (newChat) {
      await openChatById(newChat.id);
    }
  };

  // React 19 compiler handles memoization - no need for useCallback
  const newChatAndSwitch = async (): Promise<void> => {
    // Create a fresh chat and switch to it.
    const chat = await window.chat.create();
    openChat(chat.id);
  };

  // React 19 compiler handles memoization - no need for useCallback
  const handleEntityClick = (_entityId: string, _entityType: string) => {
    // TODO: Wire up entity detail views when implementing non-chat views
    // For now, this is a no-op since routing has been removed
    void _entityId;
    void _entityType;
  };

  return {
    store,
    isInitialized,
    openChat: openChatById,
    newChat,
    newChatAndSwitch,
    handleSubmit,
    handleCancelStream,
    branchFromMessage,
    handleEntityClick,
  };
}
