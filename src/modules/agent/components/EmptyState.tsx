import ChatInput from './ChatInput';

interface EmptyStateProps {
  pendingInput: { content: string; images: Array<{ id: string; dataUrl: string }> } | null;
  agentPublicId?: string | null;
  onSubmit: (content: string, agentPublicId: string, images?: Array<{ id: string; dataUrl: string }>) => void;
}

export default function EmptyState({
  pendingInput,
  agentPublicId,
  onSubmit,
}: EmptyStateProps) {
  return (
    <>
      {/* Empty header for consistent spacing */}
      <div className="flex-shrink-0 px-4 py-1 h-8" />

      {/* Chat body wrapper - same layout as active chat */}
      <div id="sidebar-chat-body" className="flex-1 flex flex-col min-h-0">
        {/* Message Input */}
        <ChatInput
          isStreaming={false}
          agentPublicId={agentPublicId}
          initialContent={pendingInput?.content}
          initialImages={pendingInput?.images}
          onSubmit={onSubmit}
        />

        {/* Empty messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 sidebar-messages-area sidebar-scrollbar" />
      </div>
    </>
  );
}