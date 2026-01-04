import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, GitBranch, ChevronDown } from 'lucide-react';
import type { ChatMessage } from '../types';
import { useClickOutsideSelectors } from '../../../hooks/useClickOutsideSelectors';

interface UserMessageProps {
  message: ChatMessage;
  onBranchFromMessage?: (messageId: string) => void;
  /**
   * When true, constrain the text area height and allow scrolling.
   * Used for the "pinned" current prompt at the top of the chat.
   */
  isPinned?: boolean;
}

interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export default function UserMessage({ message, onBranchFromMessage, isPinned }: UserMessageProps) {
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [actionsMenuPosition, setActionsMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const actionsMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  // Used for styling in some layouts; keep referenced to avoid unused warnings.
  const _isPinned = isPinned;
  
  // Parse content: if it's a JSON array, extract text and images; otherwise use as string
  let textContent = '';
  const images: Array<{ id: string; url: string }> = [];
  
  try {
    // Try to parse as JSON array
    const parsed = JSON.parse(message.content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Extract text and images from content parts
      for (const part of parsed as ContentPart[]) {
        if (part.type === 'text' && part.text) {
          textContent = part.text;
        } else if (part.type === 'image_url' && part.image_url?.url) {
          images.push({
            id: `img-${images.length}`,
            url: part.image_url.url,
          });
        }
      }
    } else {
      // Not an array, use as plain string
      textContent = message.content;
    }
  } catch {
    // Not JSON, use as plain string (backward compatible)
    textContent = message.content;
  }

  const handleImageClick = (imageId: string) => {
    setViewingImageId(imageId);
  };

  const handleCloseModal = () => {
    setViewingImageId(null);
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewingImageId) {
        setViewingImageId(null);
      }
    };

    if (viewingImageId) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [viewingImageId]);

  // Find the image being viewed in modal
  const viewingImage = viewingImageId
    ? images.find(img => img.id === viewingImageId)
    : null;

  const handleBranch = () => {
    if (onBranchFromMessage) {
      onBranchFromMessage(message.id);
    }
  };

  const closeActionsMenu = () => {
    setIsActionsMenuOpen(false);
    setActionsMenuPosition(null);
  };

  useClickOutsideSelectors(
    isActionsMenuOpen,
    closeActionsMenu,
    ['.message-row-menu', '.message-row-menu-popup']
  );

  const toggleActionsMenu = () => {
    if (isActionsMenuOpen) {
      closeActionsMenu();
      return;
    }

    const btn = actionsMenuBtnRef.current;
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    // Open to the left of the button (messages are right-aligned).
    setActionsMenuPosition({
      top: rect.top + rect.height / 2,
      left: rect.left - 8,
    });
    setIsActionsMenuOpen(true);
  };

  const approxLineCount = textContent ? textContent.split('\n').length : 0;
  // Constrain to ~4 lines before enabling internal scroll for all user messages.
  const shouldScrollText = approxLineCount >= 5;

  return (
    <>
      <div id={`message-${message.id}`} className="ml-[20%] flex justify-end">
        <div className="relative bg-[#2a2a2a] max-w-fit group">
          {/* Images Thumbnails */}
          {images.length > 0 && (
            <div className="flex gap-2 px-3 pt-3 pb-2 overflow-x-auto">
              {images.map(image => (
                <div
                  key={image.id}
                  className="relative flex-shrink-0 group cursor-pointer"
                  onClick={() => handleImageClick(image.id)}
                >
                  <img
                    src={image.url}
                    alt="Message image"
                    className="w-20 h-20 object-cover rounded border border-[#444444] hover:border-[#555555] transition-colors"
                  />
                </div>
              ))}
            </div>
          )}
          
          {/* Text Content */}
          {textContent && (
            <div
              className={[
                'px-4 py-3 text-base text-[#b2b2b2] whitespace-pre-wrap break-words',
                shouldScrollText ? 'user-message-text-scroll' : '',
              ].join(' ')}
            >
              {textContent}
            </div>
          )}

          {/* Actions menu chevron - shown on hover (bubble only) */}
          {onBranchFromMessage && (
            <div
              className={`absolute top-2 right-2 transition-opacity ${
                isActionsMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <div className="message-row-menu code-menu-container user-message-actions-fade">
                <button
                  ref={actionsMenuBtnRef}
                  type="button"
                  className="code-menu-btn"
                  aria-label="Message actions"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleActionsMenu();
                  }}
                >
                  <ChevronDown size={16} className="text-[#888888]" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Portal-rendered actions menu */}
      {isActionsMenuOpen && actionsMenuPosition && (
        <MessageRowMenu
          position={actionsMenuPosition}
          onClose={closeActionsMenu}
          onBranch={handleBranch}
        />
      )}

      {/* Image Modal */}
      {viewingImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={handleCloseModal}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <img
                src={viewingImage.url}
                alt="Message image preview"
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
              />
              <button
                type="button"
                onClick={handleCloseModal}
                className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-[#2a2a2a] bg-opacity-90 flex items-center justify-center hover:bg-opacity-100 transition-all shadow-lg cursor-pointer"
                title="Close (ESC)"
              >
                <X className="w-5 h-5 text-white" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MessageRowMenu({
  position,
  onClose,
  onBranch,
}: {
  position: { top: number; left: number };
  onClose: () => void;
  onBranch: () => void;
}) {
  return createPortal(
    <div
      className="message-row-menu-popup fixed z-[9999] bg-[#2a2a2a] rounded-lg shadow-lg border border-[#333333] overflow-hidden min-w-[160px]"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translate(-100%, -50%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
        onClick={(e) => {
          e.stopPropagation();
          onBranch();
          onClose();
        }}
      >
        <GitBranch size={16} className="text-[#cccccc]" />
        Start new chat from here
      </button>
    </div>,
    document.body
  );
}

