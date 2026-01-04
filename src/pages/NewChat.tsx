import { useEffect, useRef, useState, useActionState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, Info, Loader2, Plus, Search, X } from 'lucide-react';
import type { Agent } from '../db/types';
import { useActiveView } from '../contexts/ActiveViewContext';
import AgentAvatar from '../components/AgentAvatar';

function labelForAgent(agent: Agent): string {
  const trimmed = (agent.name ?? '').trim();
  return trimmed || 'Untitled Agent';
}

// Agent creation action for useActionState
type AgentCreationState = {
  error: string | null;
  chatId: number | null;
};

async function createAgentAction(
  previousState: AgentCreationState,
  formData: FormData
): Promise<AgentCreationState> {
  const newAgentName = formData.get('newAgentName')?.toString().trim() || '';
  if (!newAgentName) {
    return { error: 'Agent name cannot be empty', chatId: null };
  }
  try {
    const created = await window.db.agents.create({ name: newAgentName });
    const chat = await window.chat.create({ agent_public_id: created.public_id });
    return { error: null, chatId: chat.id };
  } catch (err) {
    return { error: 'Failed to create agent: ' + (err as Error).message, chatId: null };
  }
}

export default function NewChat() {
  const { openChat, showChatList, openAgentDetail } = useActiveView();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Grouped creation-related state
  const [creationState, setCreationState] = useState({
    isCreating: false,
    isAddingAgent: false,
    newAgentName: '',
  });
  
  // Use useActionState for agent creation form
  const [agentCreationState, submitAgentAction, isCreatingAgent] = useActionState(
    createAgentAction,
    { error: null, chatId: null }
  );
  
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [openMenuAgentId, setOpenMenuAgentId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // React 19 compiler handles memoization - no need for useCallback
  const refresh = async () => {
    setLoading(true);
    try {
      const all = await window.db.agents.getAll();
      setAgents(all);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const unsubscribe = window.db.agents.onUpdated(() => refresh());
    return unsubscribe;
  }, []);
  
  // Handle successful agent creation
  useEffect(() => {
    if (agentCreationState.chatId) {
      openChat(agentCreationState.chatId);
      setCreationState(prev => ({ ...prev, isAddingAgent: false, newAgentName: '' }));
    }
  }, [agentCreationState.chatId, openChat]);
  
  // Cleanup menuButtonRefs on unmount
  useEffect(() => {
    return () => {
      menuButtonRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    if (creationState.isAddingAgent) {
      inputRef.current?.focus();
    }
  }, [creationState.isAddingAgent]);

  // Focus search input when component mounts
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close the agent row menu when clicking outside it.
  useEffect(() => {
    if (!openMenuAgentId) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const clickedInsideMenu = target.closest('.agent-row-menu') || target.closest('.agent-row-menu-popup');
      if (!clickedInsideMenu) {
        setOpenMenuAgentId(null);
        setMenuPosition(null);
      }
    };

    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [openMenuAgentId]);

  const filteredAgents = agents.filter(agent => {
    if (!searchQuery.trim()) return true;
    const name = (agent.name ?? '').toLowerCase();
    return name.includes(searchQuery.toLowerCase());
  });

  // Group agents by their first letter (case-insensitive)
  const groupedAgents = filteredAgents.reduce((acc, agent) => {
    const name = labelForAgent(agent);
    const firstLetter = name.charAt(0).toUpperCase();
    // Use '#' for non-alphabetic characters
    const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
    
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  // Sort groups alphabetically and sort agents within each group
  const sortedGroups = Object.keys(groupedAgents).sort((a, b) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  sortedGroups.forEach(key => {
    groupedAgents[key].sort((a, b) => {
      const nameA = labelForAgent(a).toLowerCase();
      const nameB = labelForAgent(b).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  });

  const handleSelectAgent = async (agent: Agent) => {
    if (creationState.isCreating) return;
    setCreationState(prev => ({ ...prev, isCreating: true }));
    try {
      const chat = await window.chat.create({ agent_public_id: agent.public_id });
      openChat(chat.id);
    } catch (err) {
      console.error('Failed to create chat:', err);
    } finally {
      setCreationState(prev => ({ ...prev, isCreating: false }));
    }
  };

  const cancelAddAgent = () => {
    if (isCreatingAgent) return;
    setCreationState(prev => ({ ...prev, isAddingAgent: false, newAgentName: '' }));
  };

  const toggleMenu = (agentId: string) => {
    if (openMenuAgentId === agentId) {
      setOpenMenuAgentId(null);
      setMenuPosition(null);
    } else {
      const btn = menuButtonRefs.current.get(agentId);
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setMenuPosition({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      }
      setOpenMenuAgentId(agentId);
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-[#1f1f1f]">
      <title>New Chat | AgentsApp</title>
      {/* Header */}
      <div className="bg-[#1f1f1f] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={showChatList}
              className="p-1 rounded-full hover:bg-[#2a2a2a] transition-colors"
            >
              <ArrowLeft size={24} className="text-[#888888]" />
            </button>
            <h1 className="text-xl font-medium text-white">New chat</h1>
          </div>
        </div>
      </div>

      {/* New agent option */}
      {creationState.isAddingAgent ? (
        <form action={submitAgentAction}>
          <div className="flex items-center gap-3 px-4 py-3 bg-[#1f1f1f]">
            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0">
              <Plus size={24} className="text-white" />
            </div>
            <input
              ref={inputRef}
              type="text"
              name="newAgentName"
              value={creationState.newAgentName}
              onChange={e => setCreationState(prev => ({ ...prev, newAgentName: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelAddAgent();
                }
              }}
              placeholder="Agent name…"
              disabled={isCreatingAgent}
              className="flex-1 bg-transparent text-white placeholder:text-[#6d6d6d] text-base focus:outline-none"
            />
            <div className="flex items-center gap-2">
              {isCreatingAgent && <Loader2 className="w-5 h-5 animate-spin text-[#888888]" />}
              <button
                type="button"
                onClick={cancelAddAgent}
                disabled={isCreatingAgent}
                className="p-1 text-[#888888] hover:text-white disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div
          onClick={() => setCreationState(prev => ({ ...prev, isAddingAgent: true }))}
          className="group relative flex items-center gap-3 px-4 py-3 cursor-pointer hover:before:content-[''] hover:before:absolute hover:before:inset-y-0 hover:before:left-0 hover:before:right-0 hover:before:bg-[#2a2a2a] hover:before:pointer-events-none"
        >
          <div className="relative z-10 flex items-center gap-3 w-full">
            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center flex-shrink-0">
              <Plus size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base text-white">New agent</div>
            </div>
          </div>
        </div>
      )}

      {agentCreationState.error && (
        <div className="px-4 py-2 text-sm text-red-400">{agentCreationState.error}</div>
      )}

      {/* Search */}
      <div className="px-3 py-2 bg-[#1f1f1f]">
        <div className="flex items-center gap-3 bg-[#1f1f1f] border border-[#2a2a2a] rounded-lg px-4 py-2">
          <Search size={20} className="text-[#888888]" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name"
            className="flex-1 bg-transparent text-white placeholder:text-[#6d6d6d] text-base focus:outline-none"
          />
        </div>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto">
        {/* Agents section */}
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-[#888888]">Loading…</div>
        ) : filteredAgents.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[#888888]">
            {searchQuery ? 'No agents found' : 'No agents yet. Create one above!'}
          </div>
        ) : (
          <>
            {sortedGroups.map((letter, groupIndex) => (
              <div key={letter}>
                {/* Section header */}
                <div className={`px-4 text-sm font-medium text-[#888888] uppercase ${groupIndex === 0 ? 'pt-6 pb-3' : 'pt-8 pb-3'}`}>
                  {letter}
                </div>
                {/* Agents in this group */}
                {groupedAgents[letter].map(agent => {
                  const isMenuOpen = openMenuAgentId === agent.public_id;
                  return (
                    <div
                      key={agent.public_id}
                      onClick={() => handleSelectAgent(agent)}
                      className="group relative flex items-center gap-3 px-4 py-3 cursor-pointer hover:before:content-[''] hover:before:absolute hover:before:inset-y-0 hover:before:left-0 hover:before:right-0 hover:before:bg-[#2a2a2a] hover:before:pointer-events-none"
                    >
                      <div className="relative z-10 flex items-center gap-3 w-full">
                        <AgentAvatar
                          avatarUrl={agent.avatar_url}
                          name={labelForAgent(agent)}
                          size={48}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-base text-white truncate">
                            {labelForAgent(agent)}
                          </div>
                          <div className="relative mt-0.5">
                            {agent.prompt ? (
                              <div
                                className={`text-sm text-[#888888] truncate pr-0 transition-[padding] duration-150 ease-out ${
                                  isMenuOpen ? 'pr-8' : 'group-hover:pr-8'
                                }`}
                              >
                                {agent.prompt.slice(0, 50)}…
                              </div>
                            ) : (
                              <div
                                className={`text-sm text-[#888888] truncate pr-0 transition-[padding] duration-150 ease-out ${
                                  isMenuOpen ? 'pr-8' : 'group-hover:pr-8'
                                }`}
                              >
                                &nbsp;
                              </div>
                            )}
                            <div
                              className={`absolute right-0 top-1/2 -translate-y-1/2 transition-all duration-150 ease-out ${
                                isMenuOpen
                                  ? 'opacity-100 translate-x-0'
                                  : 'opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
                              }`}
                            >
                              <div className="agent-row-menu code-menu-container">
                                <button
                                  ref={(el) => {
                                    if (el) {
                                      menuButtonRefs.current.set(agent.public_id, el);
                                    } else {
                                      menuButtonRefs.current.delete(agent.public_id);
                                    }
                                  }}
                                  type="button"
                                  className="code-menu-btn"
                                  aria-label="Agent actions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMenu(agent.public_id);
                                  }}
                                >
                                  <ChevronDown size={16} className="text-[#888888]" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Loading overlay when creating chat */}
      {creationState.isCreating && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
        </div>
      )}

      {/* Portal-rendered dropdown menu (escapes all overflow clipping) */}
      {openMenuAgentId !== null && menuPosition && createPortal(
        <div
          className="agent-row-menu-popup fixed z-[9999] bg-[#2a2a2a] rounded-lg shadow-lg border border-[#333333] overflow-hidden min-w-[120px]"
          style={{
            top: menuPosition.top,
            left: menuPosition.left,
            transform: 'translateY(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="code-menu-item w-full px-3 py-2 text-left text-sm text-[#cccccc] hover:bg-[#333333] hover:text-white transition-colors cursor-pointer flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (openMenuAgentId) {
                openAgentDetail(openMenuAgentId);
              }
              setOpenMenuAgentId(null);
              setMenuPosition(null);
            }}
          >
            <Info size={16} className="text-[#cccccc]" />
            Agent info
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
