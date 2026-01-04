import { FileText, File, Box, Trash2, Image as ImageIcon } from 'lucide-react';
import type { ChatMessage } from '../types';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';

interface MessageProps {
  message: ChatMessage;
  chatTitle?: string;
  onEntityClick?: (entityId: string, entityType: string) => void;
  onBranchFromMessage?: (messageId: string) => void;
  isLastAssistantMessage?: boolean;
}

export default function  Message({ message, chatTitle, onEntityClick, onBranchFromMessage, isLastAssistantMessage }: MessageProps) {
  // Chat context message (attachment)
  if (message.message_type === 'chat_context' && message.entity) {
    return (
      <ContextAttachmentMessage message={message} onEntityClick={onEntityClick} />
    );
  }

  // User message
  if (message.role === 'user') {
    return <UserMessage message={message} onBranchFromMessage={onBranchFromMessage} />;
  }

  // Assistant message
  if (message.role === 'assistant') {
    return <AssistantMessage message={message} chatTitle={chatTitle} isLastAssistantMessage={isLastAssistantMessage} />;
  }

  // Fallback for other roles (should not normally render)
  return null;
}

function ContextAttachmentMessage({
  message,
  onEntityClick,
}: {
  message: ChatMessage;
  onEntityClick?: (entityId: string, entityType: string) => void;
}) {
  const entity = message.entity;

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the entity click
    
    // If context_public_id is not available, try to find it via message ID
    const contextPublicId = message.context_public_id;
    
    if (!contextPublicId) {
      alert('Unable to remove: context ID not found. Please refresh and try again.');
      return;
    }
    
    try {
      await window.chat.removeFromContext(contextPublicId);
      // Chat sidebar will automatically refresh via chat:contextUpdated event
    } catch (err) {
      alert('Failed to remove from context: ' + (err as Error).message);
    }
  };

  return (
    <div
      id={`message-${message.id}`}
      className="mb-4 cursor-pointer"
      onClick={() => {
        if (onEntityClick) {
          onEntityClick(entity.id, entity.type);
        }
      }}
    >
      <div className="rounded-lg transition-colors group">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[#6d6d6d] group-hover:text-white transition-colors">
            {entity.type === 'page' && (
              <FileText className="w-4 h-4 flex-shrink-0" />
            )}
            {entity.type === 'file' && (
              <File className="w-4 h-4 flex-shrink-0" />
            )}
            {entity.type === 'image' && (
              <ImageIcon className="w-4 h-4 flex-shrink-0" />
            )}
            {entity.type === 'element' && (
              <Box className="w-4 h-4 flex-shrink-0" />
            )}
          </span>
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-sm text-[#cccccc] group-hover:text-white truncate transition-colors">
              {entity.type === 'page' && entity.page_number ? (
                <>
                  {entity.parent_name || 'PDF'} - Page {entity.page_number}
                </>
              ) : (
                entity.name
              )}
            </span>
            <button
              onClick={handleRemove}
              className="text-[#6d6d6d] hover:text-red-500 transition-colors flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 [&:hover]:text-red-500 cursor-pointer"
              title="Remove from context"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

