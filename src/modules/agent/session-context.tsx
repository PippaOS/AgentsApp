import React, { createContext, use, useEffect, useState } from 'react';
import { useActiveView } from '../../contexts/ActiveViewContext';

/**
 * Agent session registry (renderer).
 *
 * Why this exists:
 * - Chat sessions have stable identity: `chat-{id}` (sessionId)
 * - We still need a global way to target the "current chat" from non-chat pages.
 *
 * Non-agent pages still need to "target a chat" for actions like "Add to Chat".
 * We do that by keeping a small registry of:
 * - chat id per session id
 * - last-focused session id
 */

type AgentSessionRegistry = {
  /** sessionId -> chat id */
  chatIdBySessionId: Record<string, number | null | undefined>;
  lastFocusedSessionId: string | null;
};

type AgentSessionsContextValue = {
  /**
   * Register/update a chat id for a given session id.
   */
  registerChat: (sessionId: string, chatId: number | null) => void;

  /**
   * Mark a session as the most recently focused chat surface.
   */
  markFocused: (sessionId: string) => void;

  /**
   * Ensure there is an active chat.
   *
   * Behavior:
   * - If we already have a chat id registered -> returns it
   * - Otherwise creates a chat and returns new id
   */
  ensureChatForActions: () => Promise<{ chatId: number; sessionId: string }>;

  /**
   * Current best-guess chat id for "global" actions.
   */
  currentChatId: number | null;
};

const AgentSessionsContext = createContext<AgentSessionsContextValue | null>(null);

function isSessionId(sessionId: string | null | undefined): sessionId is string {
  return !!sessionId && sessionId.startsWith('chat-');
}

export function AgentSessionsProvider({ children }: { children: React.ReactNode }) {
  const { activeChatId, openChat } = useActiveView();

  const [registry, setRegistry] = useState<AgentSessionRegistry>({
    chatIdBySessionId: {},
    lastFocusedSessionId: null,
  });

  const registerChat = (sessionId: string, chatId: number | null) => {
    setRegistry(prev => {
      if (prev.chatIdBySessionId[sessionId] === chatId) return prev;
      return {
        ...prev,
        chatIdBySessionId: { ...prev.chatIdBySessionId, [sessionId]: chatId },
      };
    });
  };

  const markFocused = (sessionId: string) => {
    setRegistry(prev => {
      if (prev.lastFocusedSessionId === sessionId) return prev;
      return { ...prev, lastFocusedSessionId: sessionId };
    });
  };

  const ensureChatForActions = async (): Promise<{ chatId: number; sessionId: string }> => {
    const currentSessionId = activeChatId ? `chat-${activeChatId}` : null;

    // If we already have a session with a chat id, use it.
    if (currentSessionId) {
      const existing = registry.chatIdBySessionId[currentSessionId];
      if (existing) return { chatId: existing, sessionId: currentSessionId };
    }

    // No active chat: create one and open it.
    const chat = await window.chat.create();
    const sessionId = `chat-${chat.id}`;
    openChat(chat.id);
    registerChat(sessionId, chat.id);
    markFocused(sessionId);
    return { chatId: chat.id, sessionId };
  };

  const sessionId = activeChatId ? `chat-${activeChatId}` : registry.lastFocusedSessionId;
  const currentChatId = sessionId
    ? (registry.chatIdBySessionId[sessionId] ?? null)
    : null;

  // If the user is currently on a chat, keep last-focused updated.
  useEffect(() => {
    const sid = activeChatId ? `chat-${activeChatId}` : null;
    if (!isSessionId(sid)) return;
    setRegistry(prev => {
      if (prev.lastFocusedSessionId === sid) return prev;
      return { ...prev, lastFocusedSessionId: sid };
    });
  }, [activeChatId]);

  const value: AgentSessionsContextValue = {
    registerChat,
    markFocused,
    ensureChatForActions,
    currentChatId,
  };

  return <AgentSessionsContext value={value}>{children}</AgentSessionsContext>;
}

export function useAgentSessions(): AgentSessionsContextValue {
  const ctx = use(AgentSessionsContext);
  if (!ctx) {
    throw new Error('useAgentSessions must be used within AgentSessionsProvider');
  }
  return ctx;
}
