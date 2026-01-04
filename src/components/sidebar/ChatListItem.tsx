import { ChevronDown } from 'lucide-react';
import type { ChatWithAgent } from '../../db/types';
import AgentAvatar from '../AgentAvatar';
import { formatTime, truncateMessage } from './util';

interface ChatListItemProps {
  chat: ChatWithAgent;
  isActive: boolean;
  isMenuOpen: boolean;
  onChatClick: (chat: ChatWithAgent) => void;
  onMenuToggle: (chatId: number) => void;
  onMenuButtonRef: (chatId: number, el: HTMLButtonElement | null) => void;
}

export default function ChatListItem({
  chat,
  isActive,
  isMenuOpen,
  onChatClick,
  onMenuToggle,
  onMenuButtonRef,
}: ChatListItemProps) {
  return (
    <div
      onClick={() => onChatClick(chat)}
      className={`group relative flex items-start gap-3 px-3 py-3 cursor-pointer w-full
        hover:before:content-[''] hover:before:absolute hover:before:inset-y-0 hover:before:left-0 hover:before:right-0 hover:before:bg-[#2a2a2a] hover:before:pointer-events-none ${
        isActive
          ? "before:content-[''] before:absolute before:inset-y-0 before:left-0 before:right-0 before:bg-[#2a2a2a] before:pointer-events-none"
          : ''
      }`}
    >
      <div className="relative z-10 flex items-start gap-3 w-full">
        <AgentAvatar
          avatarUrl={chat.agent_avatar_url}
          name={chat.agent_name || 'Unknown'}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-normal text-white truncate">
              {chat.agent_name || 'Unknown Agent'}
            </span>
            <span className="text-xs text-[#888888] flex-shrink-0">
              {formatTime(chat.last_message_at || chat.created_at)}
            </span>
          </div>

          {/* Message preview + hover chevron (time stays untouched) */}
          <div className="relative mt-0.5">
            <div
              className={`text-sm text-[#888888] truncate pr-0 transition-[padding] duration-150 ease-out ${
                isMenuOpen ? 'pr-8' : 'group-hover:pr-8'
              }`}
            >
              {chat.last_message_content ? (
                <>
                  {chat.last_message_role === 'user' && (
                    <span className="text-[#aaaaaa]">You: </span>
                  )}
                  {truncateMessage(chat.last_message_content)}
                </>
              ) : (
                <span className="italic">No messages yet</span>
              )}
            </div>

            <div
              className={`absolute right-0 top-1/2 -translate-y-1/2 transition-all duration-150 ease-out ${
                isMenuOpen
                  ? 'opacity-100 translate-x-0'
                  : 'opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
              }`}
            >
              <div className="chat-row-menu code-menu-container">
                <button
                  ref={(el) => { onMenuButtonRef(chat.id, el); }}
                  type="button"
                  className="code-menu-btn"
                  aria-label="Chat actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMenuToggle(chat.id);
                  }}
                >
                  <ChevronDown size={16} className="text-[#888888]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
