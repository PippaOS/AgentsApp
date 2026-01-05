import { useEffect, useRef, useState, useActionState, startTransition } from 'react';
import { Loader2, Trash2, Upload, X, ArrowLeft, MoreVertical, Check, Pencil, Save, Menu } from 'lucide-react';
import type { Agent } from '../db/types';
import AgentAvatar from '../components/AgentAvatar';
import { useActiveView } from '../contexts/ActiveViewContext';
import { useModelsStore } from '../stores/models-store';
import { renderMarkdown } from '../utils/markdown';
import { useClickOutside } from '../hooks/useClickOutside';

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  if (setA.size !== a.length) return false;
  for (const x of b) {
    if (!setA.has(x)) return false;
  }
  return true;
}

interface PermissionConfig {
  enabled: boolean;
  value: string; // e.g., "*" for network, "/tmp" for file paths, "API_KEY" for env vars
}

interface DraftState {
  prompt: string;
  bio: string;
  allowParallelToolCalls: boolean;
  canRunCode: boolean;
  permissions: {
    network: PermissionConfig;
    fileSystem: PermissionConfig;
    env: PermissionConfig;
    sys: PermissionConfig;
  };
  model: string | null;
  reasoning: string | null;
}

export default function AgentDetail({ agentPublicId }: { agentPublicId: string }) {
  const id = agentPublicId;
  const { setActiveView, openChat, lastChatId, sidebarOpen, setSidebarOpen } = useActiveView();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateModelInput, setShowCreateModelInput] = useState(false);
  const createModelInputRef = useRef<HTMLInputElement>(null);

  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [originalToolIds, setOriginalToolIds] = useState<string[]>([]);

  // Consolidated draft state
  const [draft, setDraft] = useState<DraftState>({
    prompt: '',
    bio: '',
    allowParallelToolCalls: false,
    canRunCode: false,
    permissions: {
      network: { enabled: false, value: '*' },
      fileSystem: { enabled: false, value: '/tmp' },
      env: { enabled: false, value: '' },
      sys: { enabled: false, value: '' },
    },
    model: null,
    reasoning: null,
  });

  const [newModelOpenRouterId, setNewModelOpenRouterId] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const modelsStore = useModelsStore();

  // Optimistic name for rename operation (using useState for now - useOptimistic has type issues)
  const [optimisticName, setOptimisticName] = useState<string | null>(null);

  // Use useActionState for save mutation
  const [saveState, saveAction, isSaving] = useActionState(
    async (_prevState: null, formData: FormData): Promise<null> => {
      if (!agent) return null;
      const updates: Array<Promise<void>> = [];
      const prompt = formData.get('prompt') as string;
      const bio = formData.get('bio') as string | null;
      const allowParallel = formData.get('allowParallel') === 'true';
      const canRunCode = formData.get('canRunCode') === 'true';
      const model = formData.get('model') as string | null;
      const reasoning = formData.get('reasoning') as string | null;
      
      // Build permissions array from form data
      const permissions: string[] = [];
      if (formData.get('permNetworkEnabled') === 'true') {
        const value = (formData.get('permNetworkValue') as string) || '*';
        permissions.push(`--allow-net=${value}`);
      }
      if (formData.get('permFileSystemEnabled') === 'true') {
        const value = (formData.get('permFileSystemValue') as string) || '/tmp';
        permissions.push(`--allow-read=${value}`);
        permissions.push(`--allow-write=${value}`);
      }
      if (formData.get('permEnvEnabled') === 'true') {
        const value = formData.get('permEnvValue') as string;
        if (value) {
          permissions.push(`--allow-env=${value}`);
        } else {
          permissions.push('--allow-env');
        }
      }
      if (formData.get('permSysEnabled') === 'true') {
        permissions.push('--allow-sys');
      }

      if ((prompt ?? '') !== (agent.prompt ?? '')) {
        updates.push(window.db.agents.updatePrompt(agent.public_id, prompt ?? ''));
      }
      if ((bio ?? null) !== (agent.bio ?? null)) {
        updates.push(window.db.agents.updateBio(agent.public_id, bio ?? null));
      }
      if (allowParallel !== (agent.allow_parallel_tool_calls === 1)) {
        updates.push(window.db.agents.updateAllowParallelToolCalls(agent.public_id, allowParallel));
      }
      if (canRunCode !== (agent.can_run_code === 1)) {
        updates.push(window.db.agents.updateCanRunCode(agent.public_id, canRunCode));
      }
      if ((model ?? null) !== (agent.model ?? null)) {
        updates.push(window.db.agents.updateModel(agent.public_id, model));
      }
      if ((reasoning ?? null) !== (agent.reasoning ?? null)) {
        updates.push(window.db.agents.updateReasoning(agent.public_id, reasoning));
      }
      
      // Check if permissions changed
      const currentPerms = agent.permissions ? JSON.parse(agent.permissions) : [];
      if (!sameStringSet(permissions, currentPerms)) {
        updates.push(window.db.agents.updatePermissions(agent.public_id, permissions));
      }
      
      if (!sameStringSet(selectedToolIds, originalToolIds)) {
        updates.push(
          window.db.agentTools.setForAgent(agent.public_id, selectedToolIds).then((): void => {
            // normalize to Promise<void>
          }),
        );
      }
      await Promise.all(updates);
      setIsEditing(false);
      return null;
    },
    null
  );

  // Use useActionState for rename mutation
  const [renameState, renameAction, isRenamingSaving] = useActionState(
    async (_prevState: null, formData: FormData): Promise<null> => {
      if (!agent) return null;
      const newName = (formData.get('name') as string).trim() || 'Untitled Agent';
      if (newName === (agent.name || '')) {
        setIsRenaming(false);
        return null;
      }
      await window.db.agents.updateName(agent.public_id, newName);
      setIsRenaming(false);
      setOptimisticName(newName);
      return null;
    },
    null
  );

  // Use useActionState for delete mutation
  const [deleteState, deleteAction, isDeleting] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (_prevState: null): Promise<null> => {
      if (!agent) return null;
      if (!confirm('Delete this agent?')) return null;
      await window.db.agents.delete(agent.public_id);
      startTransition(() => setActiveView(null));
      return null;
    },
    null
  );

  // Use useActionState for create model mutation
  const [createModelState, createModelAction, isCreatingModel] = useActionState(
    async (_prevState: null, formData: FormData): Promise<null> => {
      const openRouterId = (formData.get('openRouterId') as string).trim();
      if (!openRouterId) {
        throw new Error('Please enter an OpenRouter model ID');
      }
      const newModel = await window.db.models.addFromOpenRouter(openRouterId);
      setDraft(prev => ({ ...prev, model: newModel.openrouter_id || null }));
      setNewModelOpenRouterId('');
      setShowCreateModelInput(false);
      await modelsStore.refresh();
      return null;
    },
    null
  );

  // Click-outside hook for menu
  const [menuRef, buttonRef] = useClickOutside(
    () => setIsMenuOpen(false),
    isMenuOpen
  );

  useEffect(() => {
    if (!id) return;

    async function fetchAgent() {
      setLoading(true);
      setError(null);
      try {
        const data = await window.db.agents.getByPublicId(id);
        if (!data) {
          setError('Agent not found');
          setAgent(null);
          return;
        }
        setAgent(data);
        setOptimisticName(null); // Reset optimistic name when agent loads
        
        // Parse permissions from JSON string
        const permissions = {
          network: { enabled: false, value: '*' },
          fileSystem: { enabled: false, value: '/tmp' },
          env: { enabled: false, value: '' },
          sys: { enabled: false, value: '' },
        };
        
        try {
          const permsArray: string[] = data.permissions ? JSON.parse(data.permissions) : [];
          for (const perm of permsArray) {
            if (perm.startsWith('--allow-net')) {
              permissions.network.enabled = true;
              const match = perm.match(/--allow-net=(.+)/);
              if (match) permissions.network.value = match[1];
            } else if (perm.startsWith('--allow-read') || perm.startsWith('--allow-write')) {
              permissions.fileSystem.enabled = true;
              const match = perm.match(/--allow-(read|write)=(.+)/);
              if (match) permissions.fileSystem.value = match[2];
            } else if (perm.startsWith('--allow-env')) {
              permissions.env.enabled = true;
              const match = perm.match(/--allow-env=(.+)/);
              if (match) permissions.env.value = match[1];
            } else if (perm.startsWith('--allow-sys')) {
              permissions.sys.enabled = true;
              const match = perm.match(/--allow-sys=(.+)/);
              if (match) permissions.sys.value = match[1];
            }
          }
        } catch {
          // Invalid JSON, use defaults
        }
        
        setDraft({
          prompt: data.prompt ?? '',
          bio: data.bio ?? '',
          allowParallelToolCalls: data.allow_parallel_tool_calls === 1,
          canRunCode: data.can_run_code === 1,
          permissions,
          model: data.model ?? null,
          reasoning: data.reasoning ?? null,
        });

        // Load tools + agent-tool links
        await Promise.all([
          window.db.tools.getAll(),
          window.db.agentTools.getByAgentPublicId(id),
        ]).then(([, agentTools]) => {
          const toolIds = agentTools.map(t => t.public_id);
          setSelectedToolIds(toolIds);
          setOriginalToolIds(toolIds);
        });
      } catch (err) {
        setError('Failed to load agent: ' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchAgent();
  }, [id]);

  useEffect(() => {
    const unsubscribe = window.db.agents.onUpdated(async () => {
      if (!id) return;
      const data = await window.db.agents.getByPublicId(id);
      setAgent(data);
      if (data) {
        setOptimisticName(null); // Reset optimistic name when agent updates
        
        // Parse permissions from JSON string
        const permissions = {
          network: { enabled: false, value: '*' },
          fileSystem: { enabled: false, value: '/tmp' },
          env: { enabled: false, value: '' },
          sys: { enabled: false, value: '' },
        };
        
        try {
          const permsArray: string[] = data.permissions ? JSON.parse(data.permissions) : [];
          for (const perm of permsArray) {
            if (perm.startsWith('--allow-net')) {
              permissions.network.enabled = true;
              const match = perm.match(/--allow-net=(.+)/);
              if (match) permissions.network.value = match[1];
            } else if (perm.startsWith('--allow-read') || perm.startsWith('--allow-write')) {
              permissions.fileSystem.enabled = true;
              const match = perm.match(/--allow-(read|write)=(.+)/);
              if (match) permissions.fileSystem.value = match[2];
            } else if (perm.startsWith('--allow-env')) {
              permissions.env.enabled = true;
              const match = perm.match(/--allow-env=(.+)/);
              if (match) permissions.env.value = match[1];
            } else if (perm.startsWith('--allow-sys')) {
              permissions.sys.enabled = true;
              const match = perm.match(/--allow-sys=(.+)/);
              if (match) permissions.sys.value = match[1];
            }
          }
        } catch {
          // Invalid JSON, use defaults
        }
        
        setDraft({
          prompt: data.prompt ?? '',
          bio: data.bio ?? '',
          allowParallelToolCalls: data.allow_parallel_tool_calls === 1,
          canRunCode: data.can_run_code === 1,
          permissions,
          model: data.model ?? null,
          reasoning: data.reasoning ?? null,
        });
      }

      // agent-tools link updates piggyback on agents:updated right now
      await Promise.all([
        window.db.tools.getAll(),
        window.db.agentTools.getByAgentPublicId(id),
      ]).then(([, agentTools]) => {
        const toolIds = agentTools.map(t => t.public_id);
        setSelectedToolIds(toolIds);
        setOriginalToolIds(toolIds);
      });
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => {
    if (showCreateModelInput && createModelInputRef.current) {
      createModelInputRef.current.focus();
    }
  }, [showCreateModelInput]);

  // React 19 compiler handles memoization - no need for useMemo
  const canSave = (() => {
    if (!agent) return false;
    const promptChanged = (draft.prompt ?? '') !== (agent.prompt ?? '');
    const bioChanged = (draft.bio ?? '') !== (agent.bio ?? '');
    const toolsChanged = !sameStringSet(selectedToolIds, originalToolIds);
    const allowParallelChanged = draft.allowParallelToolCalls !== (agent.allow_parallel_tool_calls === 1);
    const canRunCodeChanged = draft.canRunCode !== (agent.can_run_code === 1);
    const modelChanged = (draft.model ?? null) !== (agent.model ?? null);
    const reasoningChanged = (draft.reasoning ?? null) !== (agent.reasoning ?? null);
    
    // Check permissions changed
    const currentPerms = agent.permissions ? JSON.parse(agent.permissions) : [];
    const newPerms: string[] = [];
    if (draft.permissions.network.enabled) {
      newPerms.push(`--allow-net=${draft.permissions.network.value || '*'}`);
    }
    if (draft.permissions.fileSystem.enabled) {
      const value = draft.permissions.fileSystem.value || '/tmp';
      newPerms.push(`--allow-read=${value}`);
      newPerms.push(`--allow-write=${value}`);
    }
    if (draft.permissions.env.enabled) {
      if (draft.permissions.env.value) {
        newPerms.push(`--allow-env=${draft.permissions.env.value}`);
      } else {
        newPerms.push('--allow-env');
      }
    }
    if (draft.permissions.sys.enabled) {
      newPerms.push('--allow-sys');
    }
    const permissionsChanged = !sameStringSet(newPerms, currentPerms);
    
    return promptChanged || bioChanged || toolsChanged || allowParallelChanged || canRunCodeChanged || modelChanged || reasoningChanged || permissionsChanged;
  })();

  // React 19 compiler handles memoization - no need for useMemo
  const renderedPrompt = renderMarkdown(draft.prompt || '');
  const renderedBio = renderMarkdown(draft.bio || '');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    setIsUploadingAvatar(true);
    setError(null);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await window.db.agents.updateAvatarUrl(agent.public_id, dataUrl);
    } catch (err) {
      setError('Failed to upload avatar: ' + (err as Error).message);
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!agent) return;
    setIsUploadingAvatar(true);
    setError(null);
    try {
      await window.db.agents.updateAvatarUrl(agent.public_id, null);
    } catch (err) {
      setError('Failed to remove avatar: ' + (err as Error).message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleEditStart = () => {
    setIsEditing(true);
    setIsMenuOpen(false);
  };

  const handleRenameStart = () => {
    if (!agent) return;
    setIsRenaming(true);
    setIsMenuOpen(false);
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
  };

  // Handle form submission errors
  useEffect(() => {
    if (saveState instanceof Error) {
      setError('Failed to save: ' + saveState.message);
    }
  }, [saveState]);

  useEffect(() => {
    if (renameState instanceof Error) {
      setError('Failed to rename: ' + renameState.message);
    }
  }, [renameState]);

  useEffect(() => {
    if (deleteState instanceof Error) {
      setError('Failed to delete: ' + deleteState.message);
    }
  }, [deleteState]);

  useEffect(() => {
    if (createModelState instanceof Error) {
      setError('Failed to create model: ' + createModelState.message);
    }
  }, [createModelState]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 bg-[#181818] h-[59px] relative">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 flex items-center">
              <AgentAvatar avatarUrl={null} name="Loading…" size={28} />
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <h2 className="text-white text-base font-medium truncate">Loading…</h2>
            </div>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-[#888888]" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 bg-[#181818] h-[59px] relative">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => startTransition(() => setActiveView(null))}
              className="p-2 text-[#888888] hover:text:white hover:bg-[#2a2a2a] rounded-full transition-colors"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0 flex items-center">
              <h2 className="text-white text-base font-medium truncate">Agent</h2>
            </div>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-3 rounded-md">{error}</div>
          </div>
        </main>
      </div>
    );
  }

  const displayName = optimisticName || agent.name || 'Untitled Agent';

  return (
    <div className="flex flex-col h-full">
      {/* Header (match in-chat header style) */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#181818] h-[59px] relative">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors flex-shrink-0"
              title="Open sidebar"
            >
              <Menu size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (lastChatId !== null) {
                openChat(lastChatId);
              } else {
                startTransition(() => setActiveView(null));
              }
            }}
            className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors flex-shrink-0"
            aria-label="Back to chat"
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-shrink-0 flex items-center">
            <AgentAvatar avatarUrl={agent.avatar_url} name={displayName} size={40} />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1 min-w-0 flex items-center">
            {isRenaming ? (
              <form action={renameAction} className="flex-1 min-w-0">
                <input
                  ref={renameInputRef}
                  type="text"
                  name="name"
                  defaultValue={agent.name || ''}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      handleRenameCancel();
                    }
                  }}
                  className="flex-1 min-w-0 text-white text-base font-medium bg-transparent border-b border-[#888888] focus:outline-none focus:border-white px-1"
                />
              </form>
            ) : (
              <h2 className="text-white text-base font-medium truncate">{displayName}</h2>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {isRenaming ? (
            <>
              <form action={renameAction}>
                <input type="hidden" name="name" value={renameInputRef.current?.value || agent.name || ''} />
                <button
                  type="submit"
                  disabled={isRenamingSaving}
                  className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors disabled:opacity-50"
                  aria-label="Save name"
                  title="Save name"
                >
                  <Check size={20} />
                </button>
              </form>
              <button
                type="button"
                onClick={handleRenameCancel}
                className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
                aria-label="Cancel rename"
                title="Cancel rename"
              >
                <X size={20} />
              </button>
            </>
          ) : isEditing ? (
            <form action={saveAction}>
              <input type="hidden" name="prompt" value={draft.prompt} />
              <input type="hidden" name="bio" value={draft.bio} />
              <input type="hidden" name="allowParallel" value={draft.allowParallelToolCalls.toString()} />
              <input type="hidden" name="canRunCode" value={draft.canRunCode.toString()} />
              <input type="hidden" name="model" value={draft.model || ''} />
              <input type="hidden" name="reasoning" value={draft.reasoning || ''} />
              <input type="hidden" name="permNetworkEnabled" value={draft.permissions.network.enabled.toString()} />
              <input type="hidden" name="permNetworkValue" value={draft.permissions.network.value} />
              <input type="hidden" name="permFileSystemEnabled" value={draft.permissions.fileSystem.enabled.toString()} />
              <input type="hidden" name="permFileSystemValue" value={draft.permissions.fileSystem.value} />
              <input type="hidden" name="permEnvEnabled" value={draft.permissions.env.enabled.toString()} />
              <input type="hidden" name="permEnvValue" value={draft.permissions.env.value} />
              <input type="hidden" name="permSysEnabled" value={draft.permissions.sys.enabled.toString()} />
              <button
                type="submit"
                disabled={isSaving || !canSave}
                className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors disabled:opacity-50"
                aria-label="Save"
                title="Save"
              >
                {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              </button>
            </form>
          ) : (
            <div className="relative">
              <button
                ref={buttonRef}
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
                aria-label="More options"
              >
                <MoreVertical size={20} />
              </button>
              {isMenuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full mt-1 bg-[#233138] border border-[#2a2a2a] rounded-lg shadow-lg min-w-[180px] z-50 overflow-hidden"
                >
                  <button
                    onClick={() => {
                      avatarInputRef.current?.click();
                      setIsMenuOpen(false);
                    }}
                    disabled={isUploadingAvatar}
                    className="w-full px-4 py-3 text-left text-white hover:bg-[#2a3942] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                  >
                    <Upload size={16} />
                    {agent.avatar_url ? 'Change Agent Avatar' : 'Set Agent Avatar'}
                  </button>
                  {agent.avatar_url && (
                    <button
                      onClick={() => {
                        handleRemoveAvatar();
                        setIsMenuOpen(false);
                      }}
                      disabled={isUploadingAvatar}
                      className="w-full px-4 py-3 text-left text-white hover:bg-[#2a3942] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                    >
                      <X size={16} />
                      Remove Agent Avatar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      handleEditStart();
                    }}
                    className="w-full px-4 py-3 text-left text-white hover:bg-[#2a3942] transition-colors text-sm flex items-center gap-2"
                  >
                    <Pencil size={16} />
                    Edit Agent
                  </button>
                  <button
                    onClick={() => {
                      handleRenameStart();
                    }}
                    className="w-full px-4 py-3 text-left text-white hover:bg-[#2a3942] transition-colors text-sm flex items-center gap-2"
                  >
                    <Pencil size={16} />
                    Rename Agent
                  </button>
                  <form action={deleteAction}>
                    <button
                      type="submit"
                      disabled={isDeleting}
                      className="w-full px-4 py-3 text-left text-white hover:bg-[#2a3942] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Delete Agent
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#aaaaaa]">Bio</h2>
          </div>

          {isEditing ? (
            <textarea
              value={draft.bio}
              onChange={e => setDraft(prev => ({ ...prev, bio: e.target.value }))}
              className="w-full min-h-[120px] rounded-md border border-[#333333] px-3 py-2 text-sm font-mono bg-[#2b2b2b] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Write a brief bio for the agent..."
            />
          ) : (
            <div className="assistant-bubble">
              <div
                className="text-sm text-[#b2b2b2] markdown-content"
                dangerouslySetInnerHTML={{ __html: renderedBio }}
              />
            </div>
          )}
        </section>

          <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#aaaaaa]">Model</h2>
          </div>

          {showCreateModelInput ? (
            <form action={createModelAction} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  ref={createModelInputRef}
                  type="text"
                  name="openRouterId"
                  value={newModelOpenRouterId}
                  onChange={(e) => setNewModelOpenRouterId(e.target.value)}
                  disabled={!isEditing || isCreatingModel}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowCreateModelInput(false);
                      setNewModelOpenRouterId('');
                    }
                  }}
                  placeholder="Enter OpenRouter model ID (e.g., openai/gpt-4)"
                  className="flex-1 rounded-md border border-[#333333] px-3 py-2 text-sm bg-[#2b2b2b] text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!isEditing || isCreatingModel || !newModelOpenRouterId.trim()}
                  className="px-3 py-2 rounded-md border border-[#333333] bg-[#2b2b2b] text-white hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  {isCreatingModel ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Create
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModelInput(false);
                    setNewModelOpenRouterId('');
                  }}
                  disabled={!isEditing || isCreatingModel}
                  className="px-3 py-2 rounded-md border border-[#333333] bg-[#2b2b2b] text-white hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <div className="relative">
              <select
                value={showCreateModelInput ? '' : (draft.model || '')}
                onChange={(e) => {
                  if (e.target.value === '__create_new__') {
                    setShowCreateModelInput(true);
                    setTimeout(() => createModelInputRef.current?.focus(), 0);
                  } else {
                    setDraft(prev => ({ ...prev, model: e.target.value || null }));
                  }
                }}
                disabled={!isEditing || showCreateModelInput}
                className={`w-full rounded-md px-3 py-2 text-sm text-[#b2b2b2] focus:outline-none disabled:cursor-not-allowed appearance-none pr-8 ${
                  isEditing
                    ? 'border border-[#333333] bg-[#2b2b2b] focus:ring-2 focus:ring-blue-500'
                    : 'border border-[#404040] bg-[#303030]'
                }`}
              >
                <option value="">No model selected</option>
                {isEditing && (
                  <option value="__create_new__" className="bg-[#2b2b2b] text-white">
                    + Create new model...
                  </option>
                )}
                {modelsStore.models
                  .filter((model) => model.openrouter_id) // Only show models with openrouter_id
                  .map((model) => (
                    <option key={model.public_id} value={model.openrouter_id || ''} className="bg-[#2b2b2b] text-white">
                      {model.openrouter_id}
                    </option>
                  ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-[#888888]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
        </section>

          <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#aaaaaa]">Capabilities</h2>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-md border border-[#333333] bg-[#2b2b2b] px-3 py-3">
            <div className="min-w-0">
              <div className="text-sm text-white">Can run code</div>
              <div className="text-xs text-[#b2b2b2]">
                Allow this agent to execute code
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.canRunCode}
              onChange={(e) => setDraft(prev => ({ ...prev, canRunCode: e.target.checked }))}
              disabled={!isEditing}
              className="h-4 w-4 accent-blue-500 disabled:opacity-50"
            />
          </label>
          
          {draft.canRunCode && (
            <div className="space-y-4 mt-4 pl-4 border-l-2 border-[#333333]">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#aaaaaa] mb-3">Permissions</h3>
                <p className="text-xs text-[#888888] mb-4">
                  Configure what the agent can access when running code. By default, code runs with zero I/O access.
                </p>
              </div>
              
              {/* Network Access */}
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.permissions.network.enabled}
                    onChange={(e) => setDraft(prev => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        network: { ...prev.permissions.network, enabled: e.target.checked }
                      }
                    }))}
                    disabled={!isEditing}
                    className="mt-1 h-4 w-4 accent-blue-500 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">Internet Access</div>
                    <div className="text-xs text-[#b2b2b2] mb-2">
                      Allow the agent to make web requests. You can limit this to specific domains (e.g., <code className="bg-[#1a1a1a] px-1 rounded">api.github.com</code>) or leave it as <code className="bg-[#1a1a1a] px-1 rounded">*</code> for full access.
                    </div>
                    {draft.permissions.network.enabled && isEditing && (
                      <input
                        type="text"
                        value={draft.permissions.network.value}
                        onChange={(e) => setDraft(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            network: { ...prev.permissions.network, value: e.target.value }
                          }
                        }))}
                        placeholder="* or specific domain"
                        className="w-full rounded-md border border-[#333333] px-3 py-1.5 text-sm bg-[#1a1a1a] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </label>
              </div>
              
              {/* File System Access */}
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.permissions.fileSystem.enabled}
                    onChange={(e) => setDraft(prev => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        fileSystem: { ...prev.permissions.fileSystem, enabled: e.target.checked }
                      }
                    }))}
                    disabled={!isEditing}
                    className="mt-1 h-4 w-4 accent-blue-500 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">File System</div>
                    <div className="text-xs text-[#b2b2b2] mb-2">
                      Grant permission to read or write files. Specify paths (e.g., <code className="bg-[#1a1a1a] px-1 rounded">/tmp</code>) to keep the agent contained to specific folders.
                    </div>
                    {draft.permissions.fileSystem.enabled && isEditing && (
                      <input
                        type="text"
                        value={draft.permissions.fileSystem.value}
                        onChange={(e) => setDraft(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            fileSystem: { ...prev.permissions.fileSystem, value: e.target.value }
                          }
                        }))}
                        placeholder="/tmp"
                        className="w-full rounded-md border border-[#333333] px-3 py-1.5 text-sm bg-[#1a1a1a] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </label>
              </div>
              
              {/* Environment Variables */}
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.permissions.env.enabled}
                    onChange={(e) => setDraft(prev => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        env: { ...prev.permissions.env, enabled: e.target.checked }
                      }
                    }))}
                    disabled={!isEditing}
                    className="mt-1 h-4 w-4 accent-blue-500 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">Environment Variables</div>
                    <div className="text-xs text-[#b2b2b2] mb-2">
                      Allow the agent to see system configuration or secrets. Best used for passing API keys to the script. Leave empty for all variables, or specify specific names (e.g., <code className="bg-[#1a1a1a] px-1 rounded">API_KEY</code>).
                    </div>
                    {draft.permissions.env.enabled && isEditing && (
                      <input
                        type="text"
                        value={draft.permissions.env.value}
                        onChange={(e) => setDraft(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            env: { ...prev.permissions.env, value: e.target.value }
                          }
                        }))}
                        placeholder="API_KEY or leave empty for all"
                        className="w-full rounded-md border border-[#333333] px-3 py-1.5 text-sm bg-[#1a1a1a] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </label>
              </div>
              
              {/* System Info */}
              <div className="space-y-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={draft.permissions.sys.enabled}
                    onChange={(e) => setDraft(prev => ({
                      ...prev,
                      permissions: {
                        ...prev.permissions,
                        sys: { ...prev.permissions.sys, enabled: e.target.checked }
                      }
                    }))}
                    disabled={!isEditing}
                    className="mt-1 h-4 w-4 accent-blue-500 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white">System Information</div>
                    <div className="text-xs text-[#b2b2b2]">
                      Allow the agent to see hardware details like OS version, memory usage, or uptime.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}
        </section>

          <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#aaaaaa]">Reasoning</h2>
          </div>

          <div className="relative">
            <select
              value={draft.reasoning || ''}
              onChange={(e) => setDraft(prev => ({ ...prev, reasoning: e.target.value || null }))}
              disabled={!isEditing}
              className={`w-full rounded-md px-3 py-2 text-sm text-[#b2b2b2] focus:outline-none disabled:cursor-not-allowed appearance-none pr-8 ${
                isEditing
                  ? 'border border-[#333333] bg-[#2b2b2b] focus:ring-2 focus:ring-blue-500'
                  : 'border border-[#404040] bg-[#303030]'
              }`}
            >
              <option value="">No reasoning</option>
              <option value="low" className="bg-[#2b2b2b] text-white">Low</option>
              <option value="medium" className="bg-[#2b2b2b] text-white">Medium</option>
              <option value="high" className="bg-[#2b2b2b] text-white">High</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-[#888888]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </section>

          <section className="space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#aaaaaa]">Instructions</h2>
          </div>

          {isEditing ? (
            <textarea
              value={draft.prompt}
              onChange={e => setDraft(prev => ({ ...prev, prompt: e.target.value }))}
              className="w-full min-h-[420px] rounded-md border border-[#333333] px-3 py-2 text-sm font-mono bg-[#2b2b2b] text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Write the agent instructions in markdown..."
            />
          ) : (
            <div className="assistant-bubble">
              <div
                className="text-sm text-[#b2b2b2] markdown-content"
                dangerouslySetInnerHTML={{ __html: renderedPrompt }}
              />
            </div>
          )}
        </section>
      </div>
      </main>
    </div>
  );
}
