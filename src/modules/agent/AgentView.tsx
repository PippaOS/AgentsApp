import type { AgentInstanceStore } from './store';
import { agentShallowEqual, useAgentInstanceStore } from './store';
import EmptyState from './components/EmptyState';
import ChatInput from './components/ChatInput';
import MessageList from './components/MessageList';
import ChatHeader from './components/ChatHeader';

export function AgentView(props: {
  store: AgentInstanceStore;
  onSubmit: (content: string, agentPublicId: string, images?: Array<{ id: string; dataUrl: string }>) => void;
  onCancelStream: () => void;
  onEntityClick?: (entityId: string, entityType: string) => void;
  onBranchFromMessage?: (messageId: string) => void;
}) {
  const chatId = useAgentInstanceStore(props.store, s => s.chatId);

  return (
    <div
      id="sidebar-chat-container"
      className="flex flex-col h-full"
      data-empty={chatId ? 'false' : 'true'}
    >
      {chatId ? (
        <div id="sidebar-chat-body" className="flex-1 flex flex-col min-h-0">
          <ChatHeaderComponent store={props.store} />
          <AgentMessages
            store={props.store}
            onEntityClick={props.onEntityClick}
            onBranchFromMessage={props.onBranchFromMessage}
          />
          <AgentInput
            store={props.store}
            onSubmit={props.onSubmit}
            onCancel={props.onCancelStream}
          />
        </div>
      ) : (
        <AgentEmptyState store={props.store} onSubmit={props.onSubmit} />
      )}
    </div>
  );
}

function ChatHeaderComponent(props: { store: AgentInstanceStore }) {
  const agentName = useAgentInstanceStore(props.store, s => s.chatData?.agent_name);
  const agentAvatarUrl = useAgentInstanceStore(props.store, s => s.chatData?.agent_avatar_url);
  const agentPublicId = useAgentInstanceStore(props.store, s => s.chatData?.agent_public_id);
  const model = useAgentInstanceStore(props.store, s => s.chatData?.model);

  return (
    <ChatHeader
      agentName={agentName}
      agentAvatarUrl={agentAvatarUrl}
      agentPublicId={agentPublicId}
      model={model}
      onSearchClick={() => {
        // TODO: Implement search functionality
        console.log('Search clicked');
      }}
    />
  );
}

function AgentMessages(props: {
  store: AgentInstanceStore;
  onEntityClick?: (entityId: string, entityType: string) => void;
  onBranchFromMessage?: (messageId: string) => void;
}) {
  const chatTitle = useAgentInstanceStore(props.store, s => s.chatData?.title);
  const messages = useAgentInstanceStore(props.store, s => s.chatData?.messages ?? []);
  const streaming = useAgentInstanceStore(props.store, s => s.streaming, { equalityFn: agentShallowEqual });

  return (
    <MessageList
      messages={messages}
      streaming={streaming}
      chatTitle={chatTitle}
      onEntityClick={props.onEntityClick}
      onBranchFromMessage={props.onBranchFromMessage}
    />
  );
}

function AgentInput(props: {
  store: AgentInstanceStore;
  onSubmit: (content: string, agentPublicId: string, images?: Array<{ id: string; dataUrl: string }>) => void;
  onCancel: () => void;
}) {
  const isStreaming = useAgentInstanceStore(props.store, s => s.streaming.isStreaming);
  const pendingInput = useAgentInstanceStore(props.store, s => s.pendingInput, { equalityFn: agentShallowEqual });
  const agentPublicId = useAgentInstanceStore(props.store, s => s.chatData?.agent_public_id ?? null);

  return (
    <ChatInput
      isStreaming={isStreaming}
      agentPublicId={agentPublicId}
      initialContent={pendingInput?.content}
      initialImages={pendingInput?.images}
      onSubmit={props.onSubmit}
      onCancel={props.onCancel}
    />
  );
}

function AgentEmptyState(props: {
  store: AgentInstanceStore;
  onSubmit: (content: string, agentPublicId: string, images?: Array<{ id: string; dataUrl: string }>) => void;
}) {
  const pendingInput = useAgentInstanceStore(props.store, s => s.pendingInput, { equalityFn: agentShallowEqual });
  const agentPublicId = useAgentInstanceStore(props.store, s => s.chatData?.agent_public_id ?? null);

  return (
    <EmptyState
      pendingInput={pendingInput}
      agentPublicId={agentPublicId}
      onSubmit={props.onSubmit}
    />
  );
}

