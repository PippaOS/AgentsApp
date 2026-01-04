/**
 * Agent module (renderer)
 *
 * This is the refactored replacement for the old sidebar chat module.
 *
 * Goal:
 * - Allow rendering multiple independent "agent views" on screen at once.
 * - Each instance is scoped to a single chat id.
 * - "New Chat" replaces the chat id within the same view instance.
 *
 * Notes:
 * - Agent UI and types live entirely under `src/modules/agent/`.
 * - The instance controller (`useAgentInstance`) removes the singleton/localStorage coupling.
 */

export { AgentInstance } from './AgentInstance';
export { AgentView } from './AgentView';
export { ChatHost } from './ChatHost';
export { useAgentInstance } from './useAgentInstance';
export { AgentSessionsProvider, useAgentSessions } from './session-context';
export {
  createAgentInstanceStore,
  useAgentInstanceStore,
  agentShallowEqual,
  type AgentInstanceStore,
  type AgentInstanceState,
  type PendingInput,
} from './store';

