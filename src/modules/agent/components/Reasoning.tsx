import { renderMarkdown } from '../../../utils/markdown';
import { useState } from 'react';

interface ReasoningProps {
  reasoning: string;
  isStreaming?: boolean;
}

export default function Reasoning({
  reasoning,
  isStreaming = false,
}: ReasoningProps) {
  // React 19: Compiler handles memoization automatically
  const renderedReasoning = renderMarkdown(reasoning);

  // Open Reasoning by default so users can see progress while streaming.
  // It will stay open until manually closed by the user.
  const [isOpen, setIsOpen] = useState<boolean>(true);

  // React 19: Ref callback with cleanup for event delegation
  // This co-locates DOM logic with the element lifecycle
  const reasoningRefCallback = (node: HTMLDivElement | null) => {
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

    // Add event listener
    node.addEventListener('click', handleClick);
    
    // Also close menus when clicking outside the reasoning element
    const handleOutsideClick = (event: MouseEvent) => {
      if (node && !node.contains(event.target as Node)) {
        const allContainers = node.querySelectorAll('.code-menu-container');
        allContainers.forEach(c => c.classList.remove('active'));
      }
    };
    document.addEventListener('click', handleOutsideClick);

    // React 19: Return cleanup function directly from the ref callback
    return () => {
      node.removeEventListener('click', handleClick);
      document.removeEventListener('click', handleOutsideClick);
    };
  };

  return (
    <details
      className="mb-3"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="mb-1 text-sm font-medium text-[#6d6d6d] cursor-pointer hover:text-gray-400 flex items-center gap-2">
        <span className={isStreaming ? 'shimmer-text' : ''}>Reasoning</span>
      </summary>
      <div
        ref={reasoningRefCallback}
        className="text-sm text-[#6d6d6d] markdown-content reasoning-markdown max-h-[15rem] overflow-y-auto sidebar-scrollbar pr-2"
        dangerouslySetInnerHTML={{ __html: renderedReasoning }}
      />
    </details>
  );
}

