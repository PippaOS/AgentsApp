import { useEffect, useRef, useState, useTransition } from 'react';
import { Copy, Check } from 'lucide-react';
import type { ChatMessage } from '../types';
import { renderMarkdown } from '../../../utils/markdown';
import Reasoning from './Reasoning';
import ToolCallCard from './ToolCallCard';
import GeneratedImages from './GeneratedImages';
import RunCode from './RunCode';

interface AssistantMessageProps {
  message: ChatMessage;
  chatTitle?: string;
  isLastAssistantMessage?: boolean;
}

function CopyButton({
  onCopy,
  copied,
}: {
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <button
      onClick={onCopy}
      className="copy-button-row-btn p-1.5 text-[#888888] hover:text-white transition-all opacity-0 group-hover:opacity-100"
      title="Copy message"
    >
      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function extractGeneratedImages(message: ChatMessage): Array<{ id: string; url: string }> {
  if (message.message_type !== 'image_generation_call') return [];

  const images: Array<{ id: string; url: string }> = [];

  if (message.response_json) {
    try {
      const response = JSON.parse(message.response_json);
      // OpenRouter format: response.images is an array of { type: 'image_url', image_url: { url: string } }
      if (Array.isArray(response.images)) {
        for (let i = 0; i < response.images.length; i++) {
          const img = response.images[i];
          if (img?.image_url?.url) {
            images.push({
              id: `img-${i}`,
              url: img.image_url.url,
            });
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse response_json for images:', e);
    }
  }

  // Fallback: if no images found in response_json, use content
  if (images.length === 0 && message.content) {
    const imageDataUrl = message.content.startsWith('data:')
      ? message.content
      : `data:image/jpeg;base64,${message.content}`;
    images.push({
      id: message.id,
      url: imageDataUrl,
    });
  }

  return images;
}

export default function AssistantMessage({ message, chatTitle, isLastAssistantMessage }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const copyTimeoutRef = useRef<number | undefined>(undefined);

  // With the React Compiler always enabled, we can rely on automatic memoization
  // of derived values like rendered markdown.
  const renderedContent = renderMarkdown(message.content);

  // Handle copy button click
  const handleCopy = async () => {
    try {
      const textToCopy = message.content || '';
      await navigator.clipboard.writeText(textToCopy);

      // Use transition for the UI state update
      startTransition(() => {
        setCopied(true);
      });

      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      // Failed to copy
    }
  };

  // Cleanup timeout on unmount only (not on re-renders)
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);


  /**
   * REACT 19 REFINEMENT:
   * Instead of useEffect, we use a Ref Callback with a cleanup return.
   * This encapsulates the DOM logic perfectly within the element's lifecycle.
   */
  const messageRefCallback = (node: HTMLDivElement | null) => {
    if (!node) return;

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Handle three-dot menu button click
      const menuBtn = target.closest('.code-menu-btn');
      if (menuBtn && menuBtn instanceof HTMLElement) {
        event.stopPropagation();
        const container = menuBtn.closest('.code-menu-container');
        if (container) {
          // Toggle active state (close other menus first)
          const allContainers = node.querySelectorAll('.code-menu-container');
          allContainers.forEach(c => {
            if (c !== container) {
              c.classList.remove('active');
            }
          });
          container.classList.toggle('active');
        }
        return;
      }

      // Handle copy menu item click
      const copyItem = target.closest('.code-menu-item[data-action="copy"]');
      if (copyItem && copyItem instanceof HTMLElement) {
        event.stopPropagation();
        try {
          // Get the base64 encoded code from data attribute
          const codeData = copyItem.getAttribute('data-code');
          if (!codeData) return;

          // Decode the code
          const code = decodeURIComponent(escape(atob(codeData)));

          // Copy to clipboard
          await navigator.clipboard.writeText(code);

          // Close the menu
          const container = copyItem.closest('.code-menu-container');
          if (container) {
            container.classList.remove('active');
          }
        } catch (error) {
          // Failed to copy code
        }
        return;
      }

      // Close menu if clicking outside
      const clickedInsideMenu = target.closest('.code-menu-container');
      if (!clickedInsideMenu) {
        const allContainers = node.querySelectorAll('.code-menu-container');
        allContainers.forEach(c => c.classList.remove('active'));
      }
    };

    // Add event listener (only one per message, handles all menu interactions)
    node.addEventListener('click', handleClick);

    // Also close menus when clicking outside the message element
    const handleOutsideClick = (event: MouseEvent) => {
      if (node && !node.contains(event.target as Node)) {
        const allContainers = node.querySelectorAll('.code-menu-container');
        allContainers.forEach(c => c.classList.remove('active'));
      }
    };
    document.addEventListener('click', handleOutsideClick);

    // REACT 19: Return cleanup function directly from the ref
    // Only cleanup DOM-related resources (event listeners), not React state/timeouts
    return () => {
      node.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleOutsideClick);
    };
  };

  // Check for new tool_call format (dedicated columns)
  const toolName = message.tool_name;
  const hasNewToolCall = message.message_type === 'tool_call' && !!toolName;

  // Old tool_calls format (JSON array) - backwards compatibility
  const oldToolCalls = message.tool_calls ?? [];
  const hasOldToolCalls = oldToolCalls.length > 0;

  const isError = message.message_type === 'error';
  const isImageGeneration = message.message_type === 'image_generation_call';
  const generatedImages = isImageGeneration ? extractGeneratedImages(message) : [];

  return (
    <div
      id={`message-${message.id}`}
      ref={messageRefCallback} // Use the callback instead of the Ref object
      // Reserve space at the bottom so the hover copy button never overlaps text.
      className={`mb-4 relative group ${isLastAssistantMessage ? 'pb-16' : 'pb-10'}`}
    >
      {message.reasoning && <Reasoning reasoning={message.reasoning} />}

      {/* Old tool_calls format (JSON array) - backwards compatibility */}
      {!hasNewToolCall && hasOldToolCalls && (
        <div className="mb-3">
          {oldToolCalls.map((tc) => {
            if (tc.name === 'run_code') {
              return <RunCode key={`runcode-${tc.id}`} input={tc.arguments} output={tc.result} />;
            }
            return <ToolCallCard key={tc.id} name={tc.name} input={tc.arguments} output={tc.result} />;
          })}
        </div>
      )}

      {/* Message content (normal / error / image generation) */}
      {message.content?.trim() && (
        <div className={`assistant-bubble relative ${hasNewToolCall || isImageGeneration ? 'mb-3' : ''}`}>
          <div className="markdown-content-wrapper">
            <div
              className={`text-base markdown-content ${isError ? 'text-red-400' : 'text-[#b2b2b2]'}`}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          </div>
          {/* Copy button row - appears below the text */}
          <div className="copy-button-row mt-2">
            <CopyButton onCopy={handleCopy} copied={copied} />
          </div>
        </div>
      )}

      {/* Image generation message */}
      {isImageGeneration && generatedImages.length > 0 && (
        <div className="assistant-bubble">
          <GeneratedImages images={generatedImages} chatTitle={chatTitle} />
        </div>
      )}

      {/* New tool_call format (dedicated columns) */}
      {hasNewToolCall && toolName && (
        toolName === 'run_code' ? (
          <RunCode input={message.tool_input || '{}'} output={message.tool_output} />
        ) : (
          <ToolCallCard
            name={toolName}
            input={message.tool_input || '{}'}
            output={message.tool_output}
          />
        )
      )}
    </div>
  );
}

