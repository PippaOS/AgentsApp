import { useState } from 'react';
import { useAgentInstance } from './useAgentInstance';
import { AgentView } from './AgentView';
import { createAgentInstanceStore } from './store';

/**
 * Renderable agent view instance.
 *
 * You can mount N of these on screen. Each instance manages its own state,
 * streaming lifecycle, and chat id.
 */
export function AgentInstance(props: {
  /** Optional: start by hydrating an existing chat. */
  initialChatId?: number | null;
  /** Optional: observe chat changes (e.g. to sync URL query param). */
  onChatIdChange?: (chatId: number | null) => void;
  /** Stable session id used for persistent transport (ideally the tab pathname). */
  sessionId?: string;
}) {
  // React 19: useState with initializer ensures store is created only once
  const [store] = useState(() => createAgentInstanceStore());
  const agent = useAgentInstance({
    initialChatId: props.initialChatId,
    onChatIdChange: props.onChatIdChange,
    sessionId: props.sessionId,
    store,
  });

  return (
    <AgentView
      store={store}
      onSubmit={agent.handleSubmit}
      onCancelStream={() => void agent.handleCancelStream()}
      onEntityClick={agent.handleEntityClick}
      onBranchFromMessage={agent.branchFromMessage}
    />
  );
}

