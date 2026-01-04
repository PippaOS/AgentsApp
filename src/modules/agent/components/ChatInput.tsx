import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Send, X, Square } from 'lucide-react';

interface PastedImage {
  id: string;
  dataUrl: string;
}

interface ChatInputProps {
  isStreaming: boolean;
  /** The agent this chat is scoped to (derived from the selected chat). */
  agentPublicId?: string | null;
  initialContent?: string;
  initialImages?: Array<{ id: string; dataUrl: string }>;
  onSubmit: (content: string, agentPublicId: string, images?: PastedImage[]) => void;
  onCancel?: () => void;
}

interface SubmitButtonProps {
  isStreaming: boolean;
  isDisabled: boolean;
  onCancel: () => void;
}

// Sub-component using useFormStatus for automatic pending state
function SubmitButton({ isStreaming, isDisabled, onCancel }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  if (isStreaming) {
    return (
      <button
        type="button"
        onClick={onCancel}
        onMouseDown={e => e.preventDefault()}
        className="flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 bg-transparent text-[#b2b2b2] hover:bg-[#2f2f2f] hover:text-white cursor-pointer"
        title="Stop generation"
      >
        <div className="relative flex items-center justify-center w-5 h-5">
          <div className="absolute inset-0 border-2 border-[#555] border-t-transparent rounded-full animate-spin"></div>
          <Square className="w-3 h-3 text-[#b2b2b2] relative z-10 fill-current" strokeWidth={2.5} />
        </div>
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending || isDisabled}
      onMouseDown={e => e.preventDefault()}
      className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 bg-transparent ${
        !isDisabled
          ? 'text-[#b2b2b2] hover:bg-[#2f2f2f] hover:text-white'
          : 'text-[#555555]'
      } disabled:opacity-50`}
      title="Send message"
    >
      <Send className="w-5 h-5 rotate-45" strokeWidth={2.5} />
    </button>
  );
}

export default function ChatInput({
  isStreaming,
  agentPublicId,
  initialContent,
  initialImages,
  onSubmit,
  onCancel,
}: ChatInputProps) {
  const dbg = (...args: unknown[]) => console.log('[chat-debug][ChatInput]', ...args);

  const [content, setContent] = useState('');
  const agentValue = (agentPublicId ?? '').trim();
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [viewingImageId, setViewingImageId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isOnLastLine, setIsOnLastLine] = useState(false);

  const [submitError, submitAction] = useActionState(
    async (_prevState: string | null, formData: FormData): Promise<string | null> => {
      const raw = formData.get('content');
      const contentValue = (typeof raw === 'string' ? raw : '').trim();

      dbg('submitAction: start', {
        isStreaming,
        contentLen: contentValue.length,
        pastedImages: pastedImages.length,
      });

      if (isStreaming) return null;

      // Allow submit if there's content OR images
      if (!(contentValue || pastedImages.length > 0)) {
        dbg('submitAction: noop (empty content/images)');
        return null;
      }

      if (!agentValue) {
        dbg('submitAction: blocked (no agent assigned)');
        alert('This chat has no agent assigned. Select a chat (or create one) and try again.');
        return 'No agent assigned';
      }

      try {
        dbg('submitAction: calling onSubmit', {
          contentValuePreview: contentValue.slice(0, 120),
          agentValue,
          images: pastedImages.length,
        });

        await Promise.resolve(
          onSubmit(
            contentValue,
            agentValue,
            pastedImages.length > 0 ? pastedImages : undefined
          )
        );

        dbg('submitAction: onSubmit returned');
        setContent('');
        setPastedImages([]); // Clear images after submit
        textareaRef.current?.focus();
        return null;
      } catch (e) {
        console.error('Failed to submit message:', e);
        return 'Failed to send message';
      }
    },
    null
  );

  // Focus textarea when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus();
    }
  }, [isStreaming]);

  // Initialize from pending input (when branching from a message)
  useEffect(() => {
    if (initialContent !== undefined) {
      setContent(initialContent);
    }
  }, [initialContent]);

  useEffect(() => {
    if (initialImages !== undefined) {
      setPastedImages(initialImages);
    }
  }, [initialImages]);

  const handleKeydown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      dbg('handleKeydown: Enter (submit)', { isStreaming, contentLen: content.length });
      e.preventDefault();
      const form = (e.target as HTMLElement).closest('form');
      if (form) {
        form.requestSubmit();
      }
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    dbg('handlePaste: start');
    const items = e.clipboardData.items;
    if (!items) return;

    const imageFiles: File[] = [];
    
    // Check for image items in clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    // If we found images, prevent default paste and process them
    if (imageFiles.length > 0) {
      e.preventDefault();
      dbg('handlePaste: found images', { count: imageFiles.length, types: imageFiles.map(f => f.type) });
      
      // Convert each image file to base64 data URL
      const newImages: PastedImage[] = [];
      
      for (const file of imageFiles) {
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          
          newImages.push({
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            dataUrl,
          });
        } catch (error) {
          console.error('Failed to process pasted image:', error);
        }
      }
      
      if (newImages.length > 0) {
        setPastedImages(prev => [...prev, ...newImages]);
        dbg('handlePaste: appended images', { new: newImages.length });
      }
    }
  };

  const handleRemoveImage = (imageId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Prevent triggering image click
    }
    setPastedImages(prev => prev.filter(img => img.id !== imageId));
    // Close modal if we're viewing the removed image
    if (viewingImageId === imageId) {
      setViewingImageId(null);
    }
  };

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
    ? pastedImages.find(img => img.id === viewingImageId)
    : null;

  // Auto-resize textarea upward
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Calculate line height and padding
    const lineHeight = 24; // Approximate line height in pixels for text-base
    const padding = 16; // py-2 = 8px top + 8px bottom
    const minHeight = lineHeight * 1 + padding; // 1 line minimum
    const maxHeight = lineHeight * 10 + padding; // 10 lines maximum
    
    // Count the number of lines
    // Split by newline and count, also check if content ends with newline
    const lines = content.split('\n');
    const lineCount = lines.length;
    const endsWithNewline = content.endsWith('\n');
    
    // Check if we're on the last line (single line, no newline)
    const onLastLine = lineCount === 1 && !endsWithNewline;
    setIsOnLastLine(onLastLine);
    
    // If there's at least one newline (more than 1 line), expand
    // Always add one extra line for the empty line at the bottom
    let targetLines: number;
    if (onLastLine) {
      // Single line, no newline - stay at 1 line
      targetLines = 1;
    } else {
      // Has newlines - show all lines + 1 empty line at bottom
      targetLines = lineCount + 1;
    }
    
    const targetHeight = Math.min(lineHeight * targetLines + padding, maxHeight);
    
    // Set height, ensuring minimum height
    const newHeight = Math.max(targetHeight, minHeight);
    textarea.style.height = `${newHeight}px`;
    
    // Enable scrolling if content exceeds max height
    textarea.style.overflowY = targetHeight >= maxHeight ? 'auto' : 'hidden';
  }, [content]);

  return (
    <div className="flex-shrink-0 pl-4 pr-[21px] pb-3 bg-[#181818] sidebar-input-area">
      <form action={submitAction} onPaste={handlePaste}>
        <div className="bg-[#2a2a2a] shadow-none outline-none ring-0 flex flex-col overflow-hidden">
          {/* Pasted Images Thumbnails */}
          {pastedImages.length > 0 && (
            <div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto flex-shrink-0">
              {pastedImages.map(image => (
                <div
                  key={image.id}
                  className="relative flex-shrink-0 group cursor-pointer"
                  onClick={() => handleImageClick(image.id)}
                >
                  <img
                    src={image.dataUrl}
                    alt="Pasted"
                    className="w-20 h-20 object-cover rounded border border-[#444444] hover:border-[#555555] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={(e) => handleRemoveImage(image.id, e)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-lg bg-[#2a2a2a] bg-opacity-90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-opacity-100 shadow-lg z-10 cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Textarea wrapper that expands upward */}
          <div 
            className="flex flex-col-reverse min-h-[36px]"
            style={{ paddingBottom: isOnLastLine ? '12px' : '0' }}
          >
            <textarea
              ref={textareaRef}
              name="content"
              rows={1}
              placeholder="Type your message..."
              disabled={isStreaming}
              onKeyDown={handleKeydown}
              value={content}
              onChange={e => setContent(e.target.value)}
              autoFocus
              className="w-full px-4 py-2 text-base focus:outline-none focus:ring-0 resize-none border-0 bg-transparent text-white placeholder:text-[#6d6d6d] shadow-none overflow-hidden"
              style={{ minHeight: '36px' }}
            />
          </div>
          
          {/* Controls stay fixed at bottom */}
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0">
            <div className="flex-1"></div>

            <SubmitButton
              isStreaming={isStreaming}
              isDisabled={!agentValue || (!content.trim() && pastedImages.length === 0)}
              onCancel={() => onCancel?.()}
            />
          </div>
        </div>
      </form>

      {submitError && (
        <div className="mt-2 text-xs text-red-400 px-1">
          {submitError}
        </div>
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
                src={viewingImage.dataUrl}
                alt="Pasted image preview"
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
    </div>
  );
}
