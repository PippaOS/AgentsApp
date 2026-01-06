import { useState } from 'react';
import { MoreVertical, Menu, Info, Plus } from 'lucide-react';
import AgentAvatar from '../../../components/AgentAvatar';
import { useActiveView } from '../../../contexts/ActiveViewContext';
import { useClickOutside } from '../../../hooks/useClickOutside';

interface ChatHeaderProps {
  agentName?: string | null;
  agentAvatarUrl?: string | null;
  agentPublicId?: string | null;
  model?: string | null;  
}

export default function ChatHeader({
  agentName = 'Unknown Agent',
  agentAvatarUrl,
  agentPublicId,
  model,
}: ChatHeaderProps) {
  const { openAgentDetail, sidebarOpen, setSidebarOpen, openChat } = useActiveView();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Custom hook handles click-outside detection
  const [menuRef, buttonRef] = useClickOutside(
    () => setIsMenuOpen(false),
    isMenuOpen
  );

  const handleEditAgent = () => {
    if (agentPublicId) {
      openAgentDetail(agentPublicId);
      setIsMenuOpen(false);
    }
  };

  const handleNewChat = async () => {
    if (!agentPublicId) return;
    
    try {
      const chat = await window.chat.create({ agent_public_id: agentPublicId });
      openChat(chat.id);
    } catch (err) {
      console.error('Failed to create new chat:', err);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#181818] h-[59px] relative">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors flex-shrink-0"
            title="Open sidebar"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="flex-shrink-0 flex items-center">
          <AgentAvatar avatarUrl={agentAvatarUrl} name={agentName} size={40} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <h2 className="text-white text-base font-medium truncate">
            {agentName}
          </h2>
          {model && (
            <span className="text-xs text-[#888888] truncate">
              {model}
            </span>
          )}
        </div>
      </div>


      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
        {agentPublicId && (
          <div className="relative">
            <button
              onClick={handleNewChat}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
              aria-label="New chat"
            >
              <Plus size={20} />
            </button>
            {showTooltip && (
              <div
                className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#333333] rounded-lg shadow-lg px-3 py-1.5 z-50 whitespace-nowrap"
              >
                <span className="text-xs text-[#cccccc]">New Chat</span>
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
            aria-label="More options"
          >
            <MoreVertical size={20} />
          </button>
          {isMenuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-full mt-1 bg-[#2a2a2a] border border-[#333333] rounded-lg shadow-lg min-w-[120px] z-50 overflow-hidden"
            >
              <button
                onClick={handleEditAgent}
                disabled={!agentPublicId}
                className="w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                <Info size={16} className="text-[#cccccc]" />
                Agent info
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
