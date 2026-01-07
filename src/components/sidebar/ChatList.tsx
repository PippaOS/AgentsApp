import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, Plus, Settings, X, MoreVertical, Archive, Trash2, Copy } from 'lucide-react';
import type { ChatWithAgent } from '../../db/types';
import { useActiveView } from '../../contexts/ActiveViewContext';
import { useClickOutsideSelectors } from '../../hooks/useClickOutsideSelectors';
import { useClickOutside } from '../../hooks/useClickOutside';
import ChatListItem from './ChatListItem';

interface MenuState {
  chatId: number | null;
  position: { top: number; left: number } | null;
}

function ChatRowMenu({
  chat,
  position,
  onClose,
  onDelete,
  onNewChat,
  onClone,
  openAgentDetail,
}: {
  chat: ChatWithAgent | undefined;
  position: { top: number; left: number };
  onClose: () => void;
  onDelete: (chatId: number) => void;
  onNewChat: (agentPublicId: string) => void;
  onClone: (agentPublicId: string, agentName: string) => void;
  openAgentDetail: (agentPublicId: string) => void;
}) {
  if (!chat) return null;

  return createPortal(
    <div
      className="chat-row-menu-popup fixed z-[9999] bg-[#2a2a2a] rounded-lg shadow-lg border border-[#333333] overflow-hidden min-w-[120px]"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateY(-50%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {chat.agent_public_id && (
        <>
          <button
            type="button"
            className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (chat.agent_public_id) {
                onNewChat(chat.agent_public_id);
              }
              onClose();
            }}
          >
            <Plus size={16} className="text-[#cccccc]" />
            New Chat
          </button>
          <button
            type="button"
            className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (chat.agent_public_id) {
                openAgentDetail(chat.agent_public_id);
              }
              onClose();
            }}
          >
            <Info size={16} className="text-[#cccccc]" />
            Agent info
          </button>
          <button
            type="button"
            className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (chat.agent_public_id) {
                onClone(chat.agent_public_id, chat.agent_name || 'Agent');
              }
              onClose();
            }}
          >
            <Copy size={16} className="text-[#cccccc]" />
            Clone Agent
          </button>
        </>
      )}
      <button
        type="button"
        className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Archive size={16} className="text-[#cccccc]" />
        Archive Chat
      </button>
      <button
        type="button"
        className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(chat.id);
        }}
      >
        <Trash2 size={16} className="text-[#cccccc]" />
        Delete Chat
      </button>
    </div>,
    document.body
  );
}

export default function ChatList() {
  const { activeView, openChat, openConfig, openNewChat, setActiveView, openAgentDetail, setSidebarOpen } = useActiveView();
  const [chats, setChats] = useState<ChatWithAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuState, setMenuState] = useState<MenuState>({ chatId: null, position: null });
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const menuButtonRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  
  // Custom hook handles click-outside detection for header menu
  const [headerMenuRef, headerMenuButtonRef] = useClickOutside(
    () => setIsHeaderMenuOpen(false),
    isHeaderMenuOpen
  );

  const activeChatId = activeView?.type === 'chat' ? activeView.chatId : null;

  // React 19 compiler handles memoization - no need for useCallback
  const refresh = async () => {
    try {
      const chatList = await window.chat.getAllWithAgent();
      setChats(chatList);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // Subscribe to updates
  useEffect(() => {
    const unsubChat = window.chat.onUpdated(() => refresh());
    return () => {
      unsubChat();
    };
  }, []);

  // Close menu helper
  const closeMenu = () => setMenuState({ chatId: null, position: null });

  // Custom hook for click-outside detection with multiple selectors
  useClickOutsideSelectors(
    menuState.chatId !== null,
    closeMenu,
    ['.chat-row-menu', '.chat-row-menu-popup']
  );

  const handleChatClick = (chat: ChatWithAgent) => {
    openChat(chat.id);
  };

  const handleNewChat = () => {
    openNewChat();
  };

  const toggleMenu = (chatId: number) => {
    if (menuState.chatId === chatId) {
      closeMenu();
    } else {
      const btn = menuButtonRefs.current.get(chatId);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setMenuState({
          chatId,
          position: {
            top: rect.top + rect.height / 2,
            left: rect.right + 8,
          },
        });
      }
    }
  };

  const handleDeleteChat = async (chatId: number) => {
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    try {
      await window.chat.delete(chat.public_id);
      
      // Close the menu
      closeMenu();
      
      // If the deleted chat is currently active, close the active view
      if (activeChatId === chatId) {
        setActiveView(null);
      }
      
      // Refresh will happen automatically via the onUpdated subscription
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleNewChatWithAgent = async (agentPublicId: string) => {
    try {
      const chat = await window.chat.create({ agent_public_id: agentPublicId });
      openChat(chat.id);
    } catch (err) {
      console.error('Failed to create new chat:', err);
    }
  };

  const handleCloneAgent = async (agentPublicId: string, agentName: string) => {
    try {
      const defaultName = `${agentName} (Copy)`;
      const clonedAgent = await window.db.agents.clone(agentPublicId, defaultName);
      
      // Switch to the new agent's details immediately 
      // so they can see the clone was successful
      openAgentDetail(clonedAgent.public_id);
    } catch (err) {
      console.error('Failed to clone agent:', err);
    }
  };

  // Ref callback with cleanup (React 19 pattern)
  const handleMenuButtonRef = (chatId: number, el: HTMLButtonElement | null) => {
    if (el) {
      menuButtonRefs.current.set(chatId, el);
    } else {
      menuButtonRefs.current.delete(chatId);
    }
  };

  const menuChat = menuState.chatId !== null ? chats.find(c => c.id === menuState.chatId) : undefined;

  return (
    <div className="flex flex-col h-full bg-[#1f1f1f] chat-list-container">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1f1f1f] h-[59px]">
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="p-2 rounded-full hover:bg-[#2a2a2a] transition-colors"
          title="Close sidebar"
        >
          <X size={20} className="text-[#888888]" />
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNewChat}
            className="p-2 rounded-full hover:bg-[#2a2a2a] transition-colors"
            title="New chat"
          >
            <Plus size={20} className="text-[#888888]" />
          </button>
          <div className="relative">
            <button
              ref={headerMenuButtonRef}
              type="button"
              onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
              className="p-2 rounded-full hover:bg-[#2a2a2a] transition-colors"
              title="More options"
            >
              <MoreVertical size={20} className="text-[#888888]" />
            </button>
            {isHeaderMenuOpen && (
              <div
                ref={headerMenuRef}
                className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#333333] rounded-lg shadow-lg min-w-[120px] z-50 overflow-hidden"
              >
                <button
                  onClick={() => {
                    openConfig();
                    setIsHeaderMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Settings size={16} className="text-[#cccccc]" />
                  Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto chat-list-scrollbar">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-[#888888]">Loading…</div>
        ) : chats.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#888888]">
            No chats yet
          </div>
        ) : (
          <div>
            {chats.map(chat => {
              const isActive = activeChatId === chat.id;
              const isMenuOpen = menuState.chatId === chat.id;

              return (
                <ChatListItem
                  key={chat.id}
                  chat={chat}
                  isActive={isActive}
                  isMenuOpen={isMenuOpen}
                  onChatClick={handleChatClick}
                  onMenuToggle={toggleMenu}
                  onMenuButtonRef={handleMenuButtonRef}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Portal-rendered dropdown menu */}
      {menuState.chatId !== null && menuState.position && (
        <ChatRowMenu
          chat={menuChat}
          position={menuState.position}
          onClose={closeMenu}
          onDelete={handleDeleteChat}
          onNewChat={handleNewChatWithAgent}
          onClone={handleCloneAgent}
          openAgentDetail={openAgentDetail}
        />
      )}
    </div>
  );
}
