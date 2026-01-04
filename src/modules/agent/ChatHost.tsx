import { useEffect, useState } from 'react';
import { useAgentSessions } from './session-context';
import { AgentInstance } from './AgentInstance';

/**
 * Host component for displaying a single chat.
 * Replaces the multi-tab ChatTabsHost with a simpler single-chat approach.
 */
export function ChatHost({ chatId }: { chatId: number }) {
  const agentSessions = useAgentSessions();
  const [chatIdState, setChatIdState] = useState<number | null>(null);
  const sessionId = `chat-${chatId}`;

  useEffect(() => {
    let cancelled = false;
    // Prevent briefly rendering the previous chat's id for a new chatId.
    setChatIdState(null);
    const load = async () => {
      const chat = await window.chat.getById(chatId);
      if (cancelled) return;
      setChatIdState(chat?.id ?? null);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // Keep the session registry in sync.
  useEffect(() => {
    agentSessions.registerChat(sessionId, chatIdState);
  }, [agentSessions, chatIdState, sessionId]);

  // Mark focused since this is the active chat.
  useEffect(() => {
    agentSessions.markFocused(sessionId);
  }, [agentSessions, sessionId]);

  return (
    <div className="h-full w-full">
      <AgentInstance
        key={sessionId}
        initialChatId={chatIdState}
        sessionId={sessionId}
      />
    </div>
  );
}
