import { startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import type { ChatMessage, StreamingState } from '../types';
import Message from './Message';
import Reasoning from './Reasoning';
import ToolCallCard from './ToolCallCard';
import RunCode from './RunCode';
import GeneratedImages from './GeneratedImages';
import TypedAssistantContent from './TypedAssistantContent';
import UserMessage from './UserMessage';

interface MessageListProps {
  messages: ChatMessage[];
  streaming: StreamingState;
  onEntityClick?: (entityId: string, entityType: string) => void;
  onBranchFromMessage?: (messageId: string) => void;
}

export default function MessageList({
  messages,
  streaming,
  onEntityClick,
  onBranchFromMessage,
}: MessageListProps) {
  const isStreaming = streaming.isStreaming;
  const containerNodeRef = useRef<HTMLDivElement | null>(null);

  // Temporal Virtualization: Control whether history (The Vault) is mounted
  // When streaming, history is unmounted. After streaming ends, it stays hidden
  // until user scrolls up or clicks the "Load Previous" button.
  const [showHistory, setShowHistory] = useState(true);

  // React 19: When streaming starts, hide history (unmount The Vault)
  useEffect(() => {
    if (isStreaming) {
      setShowHistory(false);
    }
  }, [isStreaming]);

  // Partition messages: The Vault (history) vs The Stage (active context)
  // Find the last user message to show on the stage after streaming completes
  const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
  const historyMessages = lastUserMessageIndex > 0 ? messages.slice(0, lastUserMessageIndex) : [];
  const pinnedUserMessage = lastUserMessageIndex >= 0 ? messages[lastUserMessageIndex] : null;
  const stageAfterUser = lastUserMessageIndex >= 0 ? messages.slice(lastUserMessageIndex + 1) : messages;

  // Pivot-point anchoring: capture scrollHeight/scrollTop before re-injection and correct after.
  const scrollInfoRef = useRef<{ height: number; top: number } | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const restoreScrollBehaviorRef = useRef<string | null>(null);
  const liveRef = useRef<{ isStreaming: boolean; showHistory: boolean; historyLen: number }>({
    isStreaming,
    showHistory,
    historyLen: historyMessages.length,
  });

  // Keep a "live" snapshot for event handlers (ref callbacks don't rebind every render).
  liveRef.current.isStreaming = isStreaming;
  liveRef.current.showHistory = showHistory;
  liveRef.current.historyLen = historyMessages.length;

  const revealHistory = (node: HTMLDivElement) => {
    // Guard: only reveal when history is currently hidden and we're not streaming.
    const s = liveRef.current;
    if (s.isStreaming || s.showHistory || s.historyLen === 0) return;

    // IMPORTANT: We use CSS `scroll-behavior: smooth` for user scroll,
    // but during anchoring we must force instant scrollTop writes,
    // otherwise it looks like "scroll to top then back down".
    if (restoreScrollBehaviorRef.current === null) {
      restoreScrollBehaviorRef.current = node.style.scrollBehavior;
    }
    node.style.scrollBehavior = 'auto';

    scrollInfoRef.current = { height: node.scrollHeight, top: node.scrollTop };
    startTransition(() => {
      setShowHistory(true);
    });
  };

  useLayoutEffect(() => {
    const node = containerNodeRef.current;
    const info = scrollInfoRef.current;
    if (!node || !info) return;
    if (!showHistory) return;

    const applyAnchor = () => {
      // If something changes layout between frames (fonts/images), re-reading scrollHeight keeps the anchor stable.
      const heightDiff = node.scrollHeight - info.height;
      node.scrollTop = info.top + heightDiff;
    };

    applyAnchor();
    // One more frame to catch late layout without fighting user scroll.
    requestAnimationFrame(() => {
      if (scrollInfoRef.current === info) {
        applyAnchor();
        scrollInfoRef.current = null;

        // Restore smooth scrolling for user interaction after anchoring.
        if (restoreScrollBehaviorRef.current !== null) {
          node.style.scrollBehavior = restoreScrollBehaviorRef.current;
          restoreScrollBehaviorRef.current = null;
        } else {
          node.style.scrollBehavior = '';
        }
      }
    });
  }, [showHistory]);

  // React 19: Ref callback with cleanup for event delegation
  const combinedRef = (node: HTMLDivElement | null) => {
    containerNodeRef.current = node;
    if (!node) return;

    const handleClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Handle three-dot menu button click
      const menuBtn = target.closest('.code-menu-btn');
      if (menuBtn && menuBtn instanceof HTMLElement) {
        // IMPORTANT: MessageRowMenu (user message actions) uses the same visual
        // styling class (`.code-menu-btn`) but is managed by React state +
        // portal, not by this event delegation. If we intercept it here, we
        // prevent React's onClick from firing (React listens on document).
        if (menuBtn.closest('.message-row-menu')) {
          return;
        }

        event.stopPropagation();
        const container = menuBtn.closest('.code-menu-container');
        if (container) {
          const allContainers = node.querySelectorAll('.code-menu-container');
          allContainers.forEach(c => {
            if (c !== container) c.classList.remove('active');
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
          const codeData = copyItem.getAttribute('data-code');
          if (!codeData) return;
          const code = decodeURIComponent(escape(atob(codeData)));
          await navigator.clipboard.writeText(code);
          const container = copyItem.closest('.code-menu-container');
          if (container) container.classList.remove('active');
        } catch {
          // Failed to copy
        }
        return;
      }

      // Close menu if clicking outside
      const clickedInsideMenu = target.closest('.code-menu-container');
      if (!clickedInsideMenu) {
        node.querySelectorAll('.code-menu-container').forEach(c => c.classList.remove('active'));
      }
    };

    node.addEventListener('click', handleClick);
    
    const handleScroll = () => {
      const s = liveRef.current;
      if (s.isStreaming || s.showHistory || s.historyLen === 0) return;

      const prevTop = lastScrollTopRef.current;
      const nextTop = node.scrollTop;
      lastScrollTopRef.current = nextTop;

      // Trigger only when the user scrolls upward into the top.
      const scrolledUp = nextTop < prevTop;
      if (scrolledUp && nextTop <= 5) {
        revealHistory(node);
      }
    };
    node.addEventListener('scroll', handleScroll, { passive: true });

    // If there's no overflow yet (no scrollbar), scroll events may not fire.
    // Use wheel/trackpad intent as the "pull up to reveal history" gesture.
    const handleWheel = (event: WheelEvent) => {
      const s = liveRef.current;
      if (s.isStreaming || s.showHistory || s.historyLen === 0) return;
      // Only reveal when user wheels upward at (or extremely near) the top.
      if (event.deltaY < 0 && node.scrollTop <= 5) {
        revealHistory(node);
      }
    };
    node.addEventListener('wheel', handleWheel, { passive: true });

    const handleOutsideClick = (event: MouseEvent) => {
      if (node && !node.contains(event.target as Node)) {
        node.querySelectorAll('.code-menu-container').forEach(c => c.classList.remove('active'));
      }
    };
    document.addEventListener('click', handleOutsideClick);

    // React 19: Return cleanup function directly from the ref callback
    return () => {
      containerNodeRef.current = null;
      node.removeEventListener('click', handleClick);
      node.removeEventListener('scroll', handleScroll);
      node.removeEventListener('wheel', handleWheel);
      document.removeEventListener('click', handleOutsideClick);
    };
  };

  return (
    <div
      ref={combinedRef}
      id="sidebar-messages"
      className="flex-1 overflow-y-auto relative sidebar-messages-area sidebar-scrollbar"
    >
      {/* THE VAULT: Historical messages - completely unmounted during streaming */}
      {/* Render history normally once user reveals it (needed for accurate scroll anchoring). */}
      {showHistory && historyMessages.length > 0 && (
        <div 
          className="history-vault p-4 space-y-4"
        >
          {historyMessages.map((msg) => (
            <Message
              key={msg.id}
              message={msg}
              onEntityClick={onEntityClick}
              onBranchFromMessage={onBranchFromMessage}
              isLastAssistantMessage={false}
            />
          ))}
        </div>
      )}

      {/* THE STAGE: Active context - this is the "top" of the scrollable world during streaming */}
      <div className="active-stage px-4 pb-4 space-y-4">
        {/* Always show the user's prompt that triggered this round */}
        {pinnedUserMessage && (
          <div className={!showHistory ? 'pinned-user-wrapper' : 'pt-4'}>
            <UserMessage
              message={pinnedUserMessage}
              onBranchFromMessage={onBranchFromMessage}
              // Only pinned visuals when history is hidden
              isPinned={!showHistory}
            />
          </div>
        )}

        {/* Completed assistant messages for the current round (shown when not streaming) */}
        {!isStreaming && stageAfterUser.length > 0 && (
          <StageMessages
            messages={stageAfterUser}
            onEntityClick={onEntityClick}
            onBranchFromMessage={onBranchFromMessage}
          />
        )}

        {/* The Streaming Area */}
        {isStreaming && (
          <StreamingDisplay
            events={streaming.events}
          />
        )}
      </div>
    </div>
  );
}

// React 19: Sub-component for stage messages (last user message + response)
function StageMessages({
  messages,
  onEntityClick,
  onBranchFromMessage,
}: {
  messages: ChatMessage[];
  onEntityClick?: (entityId: string, entityType: string) => void;
  onBranchFromMessage?: (messageId: string) => void;
}) {
  return (
    <>
      {messages.map((msg, index) => {
        const isLastMessage = index === messages.length - 1;
        const isLastAssistantMessage = isLastMessage && msg.role === 'assistant';

        return (
          <Message
            key={msg.id}
            message={msg}
            onEntityClick={onEntityClick}
            onBranchFromMessage={onBranchFromMessage}
            isLastAssistantMessage={isLastAssistantMessage}
          />
        );
      })}
    </>
  );
}

// React 19: Sub-component allows compiler to optimize streaming logic separately from history logic
function StreamingDisplay({ events }: { events: StreamingState['events'] }) {
  // React 19: Preload images as they arrive in the stream for faster display
  useEffect(() => {
    for (const event of events) {
      if (event.type === 'image' && event.data.type === 'image') {
        preload(event.data.imageUrl, { as: 'image' });
      }
    }
  }, [events]);

  // Group consecutive events of the same type for efficient rendering
  const groupedEvents = (() => {
    if (events.length === 0) return [];

    const grouped: Array<{
      type: 'content' | 'reasoning' | 'tool_call' | 'image';
      id: string;
      startSequence: number;
      contentText?: string;
      reasoningText?: string;
      toolCallData?: {
        toolCallId: string;
        name: string;
        arguments: string;
        status: 'streaming' | 'ready';
      };
      imageUrls?: string[];
    }> = [];

    for (const event of events) {
      const lastGroup = grouped[grouped.length - 1];

      if (
        lastGroup &&
        lastGroup.type === event.type &&
        (event.type === 'content' || event.type === 'reasoning' || event.type === 'image')
      ) {
        if (event.type === 'content' && event.data.type === 'content') {
          lastGroup.contentText = (lastGroup.contentText || '') + event.data.text;
        } else if (event.type === 'reasoning' && event.data.type === 'reasoning') {
          lastGroup.reasoningText = (lastGroup.reasoningText || '') + event.data.text;
        } else if (event.type === 'image' && event.data.type === 'image') {
          if (!lastGroup.imageUrls) lastGroup.imageUrls = [];
          lastGroup.imageUrls.push(event.data.imageUrl);
        }
      } else if (
        lastGroup &&
        event.type === 'tool_call' &&
        event.data.type === 'tool_call' &&
        lastGroup.type === 'tool_call' &&
        lastGroup.toolCallData?.toolCallId === event.data.toolCallId
      ) {
        // Merge streaming updates for the same tool call id to avoid duplicate UI blocks.
        lastGroup.toolCallData = {
          toolCallId: event.data.toolCallId,
          name: event.data.name,
          arguments: event.data.arguments,
          status: event.data.status,
        };
      } else {
        if (event.type === 'content' && event.data.type === 'content') {
          grouped.push({
            type: 'content',
            id: event.id,
            startSequence: event.sequence,
            contentText: event.data.text,
          });
        } else if (event.type === 'reasoning' && event.data.type === 'reasoning') {
          grouped.push({
            type: 'reasoning',
            id: event.id,
            startSequence: event.sequence,
            reasoningText: event.data.text,
          });
        } else if (event.type === 'tool_call' && event.data.type === 'tool_call') {
          grouped.push({
            type: 'tool_call',
            id: event.id,
            startSequence: event.sequence,
            toolCallData: {
              toolCallId: event.data.toolCallId,
              name: event.data.name,
              arguments: event.data.arguments,
              status: event.data.status,
            },
          });
        } else if (event.type === 'image' && event.data.type === 'image') {
          grouped.push({
            type: 'image',
            id: event.id,
            startSequence: event.sequence,
            imageUrls: [event.data.imageUrl],
          });
        }
      }
    }

    return grouped;
  })();

  return (
    <div className="streaming-stage">
      {events.length === 0 && (
        <div className="mb-3">
          <div className="text-sm font-medium text-[#6d6d6d]">
            <span className="shimmer-text">Processing</span>
          </div>
        </div>
      )}
      {groupedEvents.length > 0 && (
        <div className="streaming-round mb-4 space-y-4">
          {groupedEvents.map((group, index) => {
            if (group.type === 'reasoning' && group.reasoningText) {
              // Reasoning is only streaming if there's no content group after it
              const hasContentAfter = groupedEvents
                .slice(index + 1)
                .some(g => g.type === 'content');
              const isReasoningStreaming = !hasContentAfter;
              
              return (
                <Reasoning
                  key={`reasoning-${group.id}`}
                  reasoning={group.reasoningText}
                  isStreaming={isReasoningStreaming}
                />
              );
            }
            if (group.type === 'content' && group.contentText) {
              return (
                <div
                  key={`content-${group.id}`}
                  className="assistant-bubble"
                >
                  <TypedAssistantContent text={group.contentText} isStreaming={true} />
                </div>
              );
            }
            if (group.type === 'tool_call' && group.toolCallData) {
              if (group.toolCallData.name === 'run_code') {
                return (
                  <RunCode
                    key={`runcode-${group.toolCallData.toolCallId}`}
                    input={group.toolCallData.arguments}
                    output={undefined}
                    isStreaming={group.toolCallData.status !== 'ready'}
                  />
                );
              }
              return (
                <ToolCallCard
                  key={`toolcall-${group.toolCallData.toolCallId}`}
                  name={group.toolCallData.name}
                  input={group.toolCallData.arguments}
                  output={undefined}
                  isStreaming={group.toolCallData.status !== 'ready'}
                />
              );
            }
            if (group.type === 'image' && group.imageUrls && group.imageUrls.length > 0) {
              return (
                <div key={`image-${group.id}`} className="assistant-bubble">
                  <GeneratedImages
                    images={group.imageUrls.map((url, idx) => ({
                      id: `${group.id}-${idx}`,
                      url,
                    }))}
                    isStreaming={true}
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      )}
    </div>
  );
}
