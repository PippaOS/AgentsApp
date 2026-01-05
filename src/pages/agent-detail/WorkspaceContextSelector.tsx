import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, RotateCcw, Save, X } from 'lucide-react';
import type { WorkspaceApi } from '../../db/window.d';

type WorkspaceListDirResponse = Awaited<ReturnType<WorkspaceApi['listDir']>>;

type Entry = Extract<WorkspaceListDirResponse, { ok: true }>['entries'][number];

function normalizePinnedPaths(input: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const p = String(raw ?? '').trim().replaceAll('\\', '/');
    if (!p) continue;
    const rel = p.startsWith('/') ? p.slice(1) : p;
    if (!rel) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
  }
  return out;
}

function sortEntries(entries: Entry[]): Entry[] {
  const copy = [...entries];
  copy.sort((a, b) => {
    const ak = a.kind === 'dir' ? 0 : 1;
    const bk = b.kind === 'dir' ? 0 : 1;
    if (ak !== bk) return ak - bk;
    return a.name.localeCompare(b.name);
  });
  return copy;
}

export default function WorkspaceContextSelector(props: { agentPublicId: string; initialPinnedPaths: string[] }) {
  // Lock/edit behavior is local for now (no persistence yet).
  const [isLocked, setIsLocked] = useState(true);
  const [savedSelected, setSavedSelected] = useState<Set<string>>(() => new Set(normalizePinnedPaths(props.initialPinnedPaths)));
  const [draftSelected, setDraftSelected] = useState<Set<string>>(() => new Set());

  const selected = isLocked ? savedSelected : draftSelected;

  const [rootPath, setRootPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([''])); // root expanded by default
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [entriesByDir, setEntriesByDir] = useState<Record<string, Entry[]>>(() => ({}));

  const allLoadedPaths = useMemo(() => {
    const out = new Set<string>();
    const visit = (dirRel: string) => {
      const entries = entriesByDir[dirRel] ?? [];
      for (const e of entries) {
        out.add(e.relPath);
        if (e.kind === 'dir') {
          // Only traverse directories we have loaded.
          if (entriesByDir[e.relPath]) visit(e.relPath);
        }
      }
    };
    visit('');
    return out;
  }, [entriesByDir]);

  // Re-apply from DB when props change (but don't stomp in-flight edits).
  useEffect(() => {
    if (!isLocked) return;
    const normalized = normalizePinnedPaths(props.initialPinnedPaths);
    setSavedSelected(new Set(normalized));
  }, [props.initialPinnedPaths, isLocked]);

  const loadDir = async (relPath: string) => {
    setError(null);
    setLoadingDirs((prev) => new Set(prev).add(relPath));
    try {
      const res = await window.workspace.listDir({ relPath });
      // Use explicit discriminant check for TS narrowing.
      if (res.ok === false) {
        setError(res.error || 'Failed to load workspace');
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(relPath);
          return next;
        });
        return;
      }
      setRootPath(res.rootPath);
      setEntriesByDir((prev) => ({
        ...prev,
        [relPath]: sortEntries(res.entries),
      }));

      // If this directory is selected, auto-select its children (as they load).
      if (selected.has(relPath)) {
        if (isLocked) {
          setSavedSelected((prev) => {
            const next = new Set(prev);
            for (const e of res.entries) next.add(e.relPath);
            return next;
          });
        } else {
          setDraftSelected((prev) => {
            const next = new Set(prev);
            for (const e of res.entries) next.add(e.relPath);
            return next;
          });
        }
      }
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to load workspace');
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(relPath);
        return next;
      });
    }
  };

  // Initial load (root).
  useEffect(() => {
    void loadDir('');
  }, []);

  const toggleExpanded = async (dirRel: string) => {
    const isOpen = expanded.has(dirRel);
    if (isOpen) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(dirRel);
        return next;
      });
      return;
    }

    setExpanded((prev) => new Set(prev).add(dirRel));
    if (!entriesByDir[dirRel]) {
      await loadDir(dirRel);
    }
  };

  const addSelection = (paths: string[]) => {
    if (isLocked) return;
    setDraftSelected((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.add(p);
      return next;
    });
  };

  const removeSelection = (paths: string[]) => {
    if (isLocked) return;
    setDraftSelected((prev) => {
      const next = new Set(prev);
      for (const p of paths) next.delete(p);
      return next;
    });
  };

  const collectLoadedDescendants = (relPath: string): string[] => {
    const out: string[] = [];
    const visit = (dirRel: string) => {
      const entries = entriesByDir[dirRel] ?? [];
      for (const e of entries) {
        out.push(e.relPath);
        if (e.kind === 'dir' && entriesByDir[e.relPath]) {
          visit(e.relPath);
        }
      }
    };
    visit(relPath);
    return out;
  };

  const toggleChecked = (entry: Entry) => {
    if (isLocked) return;
    const currently = draftSelected.has(entry.relPath);
    if (currently) {
      // Remove this path and any loaded descendants (for directories).
      const toRemove =
        entry.kind === 'dir' ? [entry.relPath, ...collectLoadedDescendants(entry.relPath)] : [entry.relPath];
      removeSelection(toRemove);
      return;
    }

    // Add this path and any loaded descendants if directory.
    const toAdd =
      entry.kind === 'dir' ? [entry.relPath, ...collectLoadedDescendants(entry.relPath)] : [entry.relPath];
    addSelection(toAdd);
  };

  const selectAllLoaded = () => {
    if (isLocked) return;
    setDraftSelected(() => new Set(allLoadedPaths));
  };

  const clearAll = () => {
    if (isLocked) return;
    setDraftSelected(() => new Set());
  };

  const handleEdit = () => {
    setDraftSelected(new Set(savedSelected));
    setIsLocked(false);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = normalizePinnedPaths(Array.from(draftSelected));
      await window.db.agents.updateWorkspacePaths(props.agentPublicId, next);
      setSavedSelected(new Set(next));
      setDraftSelected(new Set(next));
      setIsLocked(true);
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to save workspace selection');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftSelected(new Set(savedSelected));
    setIsLocked(true);
  };

  const refresh = async () => {
    setError(null);
    setEntriesByDir({});
    setExpanded(new Set(['']));
    await loadDir('');
  };

  const renderTree = (dirRel: string, depth: number) => {
    const entries = entriesByDir[dirRel] ?? [];
    if (entries.length === 0) return null;

    return (
      <div>
        {entries.map((e) => {
          const isDir = e.kind === 'dir';
          const isOpen = isDir && expanded.has(e.relPath);
          const isLoading = loadingDirs.has(e.relPath);
          const checked = selected.has(e.relPath);
          const rowPad = 10 + depth * 16;

          return (
            <div key={e.relPath}>
              <div
                className="flex items-center gap-2 py-1.5 pr-2 rounded hover:bg-[#333333] transition-colors"
                style={{ paddingLeft: rowPad }}
              >
                {isDir ? (
                  <button
                    type="button"
                    onClick={() => void toggleExpanded(e.relPath)}
                    className="p-0.5 rounded hover:bg-[#3a3a3a] transition-colors flex items-center justify-center"
                    title={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? (
                      <ChevronDown size={14} className="text-[#aaaaaa]" />
                    ) : (
                      <ChevronRight size={14} className="text-[#aaaaaa]" />
                    )}
                  </button>
                ) : (
                  <div className="w-[18px]" />
                )}

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-disabled={isLocked}
                  disabled={isLocked}
                  onClick={() => toggleChecked(e)}
                  onKeyDown={(ev) => {
                    if (isLocked) return;
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      toggleChecked(e);
                    }
                  }}
                  className={`h-5 w-5 rounded-[4px] border border-[#666666] bg-black flex items-center justify-center transition-colors ${
                    isLocked ? 'opacity-100 cursor-not-allowed' : 'hover:border-[#aaaaaa] focus:outline-none focus:ring-2 focus:ring-blue-500'
                  }`}
                  title={isLocked ? 'Click Edit to modify selection' : checked ? 'Unselect' : 'Select'}
                >
                  {checked ? <Check size={14} className="text-white" /> : null}
                </button>

                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="text-sm text-[#cccccc] truncate">
                    {e.name}
                  </div>
                </div>

                {isLoading && <Loader2 size={14} className="text-[#888888] animate-spin" />}
              </div>

              {isDir && isOpen && (
                <div>
                  {entriesByDir[e.relPath] ? (
                    renderTree(e.relPath, depth + 1)
                  ) : isLoading ? (
                    <div className="text-xs text-[#888888]" style={{ paddingLeft: rowPad + 24 }}>
                      Loading…
                    </div>
                  ) : (
                    <div className="text-xs text-[#888888]" style={{ paddingLeft: rowPad + 24 }}>
                      Empty
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const selectionCount = selected.size;

  return (
    <div className="rounded-md border border-[#333333] bg-[#303030]">
      <div className="flex items-start justify-between gap-4 px-3 py-3 border-b border-[#333333]">
        <div className="min-w-0">
          <div className="text-sm text-white">Workspace context</div>
          <div className="text-xs text-[#b2b2b2] mt-0.5">
            Choose files/folders from the synced workspace snapshot to make available for pinning.
          </div>
          <div className="text-xs text-[#888888] mt-1 font-mono truncate">
            {rootPath ? `Root: ${rootPath}` : 'Root: (loading…)'}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-2 text-[#888888] hover:text-white hover:bg-[#333333] rounded-full transition-colors"
            title="Refresh"
          >
            <RotateCcw size={18} />
          </button>

          {isLocked ? (
            <button
              type="button"
              onClick={handleEdit}
              className="p-2 text-[#888888] hover:text-white hover:bg-[#333333] rounded-full transition-colors"
              title="Edit selection"
            >
              <Pencil size={18} />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="p-2 text-[#888888] hover:text-white hover:bg-[#333333] rounded-full transition-colors"
                title="Save (lock)"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="p-2 text-[#888888] hover:text-white hover:bg-[#333333] rounded-full transition-colors"
                title="Cancel"
              >
                <X size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-3 py-2 flex items-center justify-between gap-3">
        <div className="text-xs text-[#888888]">
          {isLocked ? (
            <>
              Selected: <span className="text-[#cccccc]">{selectionCount}</span>
            </>
          ) : (
            <>
              Editing. Selected: <span className="text-[#cccccc]">{selectionCount}</span>
            </>
          )}
        </div>

        {!isLocked && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAllLoaded}
              disabled={saving}
              className="px-2 py-1 rounded border border-[#3a3a3a] bg-[#1a1a1a] text-xs text-white hover:bg-[#222222] transition-colors"
              title="Select all currently loaded items"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={saving}
              className="px-2 py-1 rounded border border-[#3a3a3a] bg-[#1a1a1a] text-xs text-white hover:bg-[#222222] transition-colors"
              title="Clear selection"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-3 mb-3 bg-red-900/30 border border-red-700/50 text-red-400 px-3 py-2 rounded-md text-sm">
          {error}
          <div className="text-xs text-red-300/80 mt-1">
            If you haven’t synced yet, go to Settings → Workspace Sync and run “Sync now”.
          </div>
        </div>
      )}

      <div className="pb-3">
        {entriesByDir[''] ? (
          <div className="max-h-[360px] overflow-auto">
            {renderTree('', 0)}
          </div>
        ) : (
          <div className="px-3 py-4 text-sm text-[#888888] flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Loading workspace…
          </div>
        )}
      </div>
    </div>
  );
}

