import * as React from 'react';
import type { ChatData, ChatMessage, Model, StreamingEvent, StreamingState } from './types';

export interface PendingInput {
  content: string;
  images: Array<{ id: string; dataUrl: string }>;
}

export interface AgentInstanceState {
  // Internal DB ID (INTEGER PRIMARY KEY) used for streaming + cancellation.
  chatDbId: number | null;
  // Chat ID (INTEGER PRIMARY KEY) used for routing and lookups.
  chatId: number | null;
  chatData: ChatData | null;
  models: Model[];
  streaming: StreamingState;
  pendingInput: PendingInput | null;
}

export type AgentInstanceStore = {
  // External store primitives
  getState: () => AgentInstanceState;
  setState: (updater: (prev: AgentInstanceState) => AgentInstanceState) => void;
  subscribe: (listener: () => void) => () => void;

  // Actions (match the legacy single-chat store API)
  setChatDbId: (chatDbId: number | null) => void;
  setChatId: (chatId: number | null) => void;
  setChatData: (chatData: ChatData | null) => void;
  setModels: (models: Model[]) => void;
  setStreaming: (streaming: Partial<StreamingState>) => void;
  resetStreaming: () => void;
  addMessage: (message: ChatMessage) => void;
  startStreaming: () => void;
  appendContentChunk: (chunk: string) => void;
  appendReasoningChunk: (chunk: string) => void;
  appendImageEvent: (imageUrl: string) => void;
  upsertToolCallEvent: (toolCallData: {
    toolCallId: string;
    name: string;
    arguments: string;
    status: 'streaming' | 'ready';
  }) => void;
  setPendingInput: (pendingInput: PendingInput | null) => void;
};

function createInitialStreamingState(): StreamingState {
  return {
    isStreaming: false,
    events: [],
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, k)) return false;
    if (!Object.is(aObj[k], bObj[k])) return false;
  }
  return true;
}

export function createAgentInstanceStore(): AgentInstanceStore {
  let state: AgentInstanceState = {
    chatDbId: null,
    chatId: null,
    chatData: null,
    models: [],
    streaming: createInitialStreamingState(),
    pendingInput: null,
  };

  const listeners = new Set<() => void>();
  const notify = () => {
    listeners.forEach(l => l());
  };

  // Streaming event sequence counter: per-store.
  let streamingSeq = 0;

  // Mutable buffer for streaming events to avoid O(n²) array spreading
  let streamingEventBuffer: StreamingEvent[] = [];
  let flushScheduled = false;

  const getState = () => state;
  const setState = (updater: (prev: AgentInstanceState) => AgentInstanceState) => {
    const next = updater(state);
    if (next === state) return;
    state = next;
    notify();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  // Flush buffered events to state (batched update)
  const flushStreamingEvents = () => {
    if (streamingEventBuffer.length === 0) {
      flushScheduled = false;
      return;
    }

    const eventsToAdd = streamingEventBuffer;
    streamingEventBuffer = [];
    flushScheduled = false;

    setState(prev => ({
      ...prev,
      streaming: {
        ...prev.streaming,
        events: [...prev.streaming.events, ...eventsToAdd],
      },
    }));
  };

  const appendStreamingEvent = (event: StreamingEvent) => {
    // Push to mutable buffer (O(1))
    streamingEventBuffer.push(event);

    // Schedule flush if not already scheduled (batches multiple events per frame)
    if (!flushScheduled) {
      flushScheduled = true;
      // Use requestAnimationFrame for smooth batching (updates at most once per frame)
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(flushStreamingEvents);
      } else {
        // Fallback for non-browser environments (Node.js/Electron main process)
        setTimeout(flushStreamingEvents, 0);
      }
    }
  };

  return {
    getState,
    setState,
    subscribe,

    setChatDbId: (chatDbId) => {
      setState(prev => ({ ...prev, chatDbId }));
    },
    setChatId: (chatId) => {
      setState(prev => ({ ...prev, chatId }));
    },
    setChatData: (chatData) => {
      setState(prev => ({ ...prev, chatData }));
    },
    setModels: (models) => {
      setState(prev => ({ ...prev, models }));
    },
    setStreaming: (streaming) => {
      setState(prev => ({
        ...prev,
        streaming: { ...prev.streaming, ...streaming },
      }));
    },
    resetStreaming: () => {
      streamingSeq = 0;
      streamingEventBuffer = [];
      flushScheduled = false;
      setState(prev => ({
        ...prev,
        streaming: createInitialStreamingState(),
      }));
    },
    addMessage: (message) => {
      setState(prev => {
        if (!prev.chatData) return prev;
        return {
          ...prev,
          chatData: {
            ...prev.chatData,
            messages: [...prev.chatData.messages, message],
          },
        };
      });
    },
    startStreaming: () => {
      streamingSeq = 0;
      streamingEventBuffer = [];
      flushScheduled = false;
      setState(prev => ({
        ...prev,
        streaming: {
          isStreaming: true,
          events: [],
        },
      }));
    },
    appendContentChunk: (chunk) => {
      appendStreamingEvent({
        id: `content-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sequence: streamingSeq++,
        type: 'content',
        data: { type: 'content', text: chunk },
      });
    },
    appendReasoningChunk: (chunk) => {
      appendStreamingEvent({
        id: `reasoning-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sequence: streamingSeq++,
        type: 'reasoning',
        data: { type: 'reasoning', text: chunk },
      });
    },
    appendImageEvent: (imageUrl) => {
      appendStreamingEvent({
        id: `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sequence: streamingSeq++,
        type: 'image',
        data: { type: 'image', imageUrl },
      });
    },
    upsertToolCallEvent: (toolCallData) => {
      // Flush any pending events first to ensure we're working with latest committed state
      if (flushScheduled) {
        flushStreamingEvents();
      }

      setState(prev => {
        const existingIndex = prev.streaming.events.findIndex(
          e => e.type === 'tool_call' && e.data.type === 'tool_call' && e.data.toolCallId === toolCallData.toolCallId
        );

        if (existingIndex >= 0) {
          // Update existing event in place
          const updated = [...prev.streaming.events];
          updated[existingIndex] = {
            ...updated[existingIndex],
            data: {
              type: 'tool_call',
              toolCallId: toolCallData.toolCallId,
              name: toolCallData.name,
              arguments: toolCallData.arguments,
              status: toolCallData.status,
            },
          };
          return {
            ...prev,
            streaming: { ...prev.streaming, events: updated },
          };
        }

        // Not found, append new event via buffer (will be flushed next frame)
        const event: StreamingEvent = {
          id: `toolcall-${toolCallData.toolCallId}`,
          sequence: streamingSeq++,
          type: 'tool_call',
          data: {
            type: 'tool_call',
            toolCallId: toolCallData.toolCallId,
            name: toolCallData.name,
            arguments: toolCallData.arguments,
            status: toolCallData.status,
          },
        };
        streamingEventBuffer.push(event);
        
        if (!flushScheduled) {
          flushScheduled = true;
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(flushStreamingEvents);
          } else {
            setTimeout(flushStreamingEvents, 0);
          }
        }
        
        // Return unchanged state (buffer will be flushed separately)
        return prev;
      });
    },
    setPendingInput: (pendingInput) => {
      setState(prev => ({ ...prev, pendingInput }));
    },
  };
}

export function useAgentInstanceStore<T>(
  store: AgentInstanceStore,
  selector: (state: AgentInstanceState) => T,
  opts?: { equalityFn?: (a: T, b: T) => boolean }
): T {
  const equalityFn = opts?.equalityFn ?? (Object.is as (a: T, b: T) => boolean);
  const selectionRef = React.useRef<T | null>(null);
  
  // Store selector in a ref to avoid recreating getSelection on every render
  // when selector is recreated (inline functions)
  const selectorRef = React.useRef(selector);
  const equalityFnRef = React.useRef(equalityFn);
  const prevSelectorRef = React.useRef(selector);
  
  // Update refs when they change, and invalidate cache if selector changed
  React.useEffect(() => {
    const selectorChanged = prevSelectorRef.current !== selector;
    prevSelectorRef.current = selector;
    selectorRef.current = selector;
    equalityFnRef.current = equalityFn;
    
    // If selector changed, invalidate cached selection to force recomputation
    if (selectorChanged) {
      selectionRef.current = null;
    }
  }, [selector, equalityFn]);

  // Stable getSelection function that reads from refs (doesn't depend on selector)
  const getSelection = React.useCallback((): T => {
    const currentSelector = selectorRef.current;
    const currentEqualityFn = equalityFnRef.current;
    const next = currentSelector(store.getState());
    const prev = selectionRef.current;
    if (prev !== null && currentEqualityFn(prev, next)) {
      return prev;
    }
    selectionRef.current = next;
    return next;
  }, [store]); // Only depends on store, not selector

  return React.useSyncExternalStore(store.subscribe, getSelection, getSelection);
}

export function agentShallowEqual<T>(a: T, b: T): boolean {
  return shallowEqual(a, b);
}

