import React, { createContext, use, useState, startTransition } from 'react';

/**
 * Describes the currently active view in the app.
 * - chat: Display a specific chat (by internal numeric ID)
 * - config: Display the settings page
 * - agent-detail: Display agent detail page
 */
export type ActiveView =
  | { type: 'chat'; chatId: number }
  | { type: 'config' }
  | { type: 'agent-detail'; agentPublicId: string };

/**
 * Describes what the left sidebar is currently showing.
 * - chats: The chat list
 * - new-chat: Agent picker for starting a new chat
 */
export type SidebarView =
  | { type: 'chats' }
  | { type: 'new-chat' };

type ActiveViewContextValue = {
  activeView: ActiveView | null;
  setActiveView: (view: ActiveView | null) => void;
  sidebarView: SidebarView;
  setSidebarView: (view: SidebarView) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  openChat: (chatId: number) => void;
  openConfig: () => void;
  openAgentDetail: (agentPublicId: string) => void;
  openNewChat: () => void;
  showChatList: () => void;
  /** Get the current chat ID if viewing a chat, otherwise null */
  activeChatId: number | null;
  /** Most recently opened chat ID (for "back to chat" UX). */
  lastChatId: number | null;
};

const ActiveViewContext = createContext<ActiveViewContextValue | null>(null);

export function ActiveViewProvider({ children }: { children: React.ReactNode }) {
  const [activeView, setActiveView] = useState<ActiveView | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>({ type: 'chats' });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [lastChatId, setLastChatId] = useState<number | null>(null);

  const toggleSidebar = () => {
    setSidebarOpen(prev => !prev);
  };

  const openChat = (chatId: number) => {
    startTransition(() => {
      setActiveView({ type: 'chat', chatId });
      setSidebarView({ type: 'chats' });
      setLastChatId(chatId);
    });
  };

  const openConfig = () => {
    startTransition(() => {
      setActiveView({ type: 'config' });
    });
  };

  const openAgentDetail = (agentPublicId: string) => {
    startTransition(() => {
      setActiveView({ type: 'agent-detail', agentPublicId });
    });
  };

  const openNewChat = () => {
    startTransition(() => {
      setSidebarView({ type: 'new-chat' });
    });
  };

  const showChatList = () => {
    startTransition(() => {
      setSidebarView({ type: 'chats' });
    });
  };

  const activeChatId = activeView?.type === 'chat' ? activeView.chatId : null;

  const value: ActiveViewContextValue = {
    activeView,
    setActiveView,
    sidebarView,
    setSidebarView,
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    openChat,
    openConfig,
    openAgentDetail,
    openNewChat,
    showChatList,
    activeChatId,
    lastChatId,
  };

  return (
    <ActiveViewContext value={value}>
      {children}
    </ActiveViewContext>
  );
}

export function useActiveView(): ActiveViewContextValue {
  const ctx = use(ActiveViewContext);
  if (!ctx) {
    throw new Error('useActiveView must be used within ActiveViewProvider');
  }
  return ctx;
}
