import { useState, useEffect } from 'react';
import { Menu, Settings, X } from 'lucide-react';
import { useActiveView } from '../contexts/ActiveViewContext';

export default function Config() {
  const { sidebarOpen, setSidebarOpen, setActiveView } = useActiveView();
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [workspaceSourcePath, setWorkspaceSourcePath] = useState('');
  const [rsyncPath, setRsyncPath] = useState('');
  const [excludeLines, setExcludeLines] = useState(
    ['node_modules/', '.devtools/', '.vite/', '.git/'].join('\n'),
  );
  const [deleteExtraneous, setDeleteExtraneous] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [lastSync, setLastSync] = useState<null | {
    ok: boolean;
    exitCode?: number;
    error?: string;
    sourcePath: string;
    destPath: string;
    durationMs: number;
    command: { exe: string; args: string[] };
    stdout: string;
    stderr: string;
  }>(null);
  const [showSyncDetails, setShowSyncDetails] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const meta = await window.secrets.getMeta('openrouter_api_key');
        setHasApiKey(meta.exists === true);
        // Do not load the plaintext key back into the renderer.
        setApiKey('');

        const savedSource = await window.config.get('workspace_sync_source_path');
        if (savedSource) setWorkspaceSourcePath(savedSource);

        const savedRsyncPath = await window.config.get('workspace_sync_rsync_path');
        if (savedRsyncPath) setRsyncPath(savedRsyncPath);

        const savedExcludes = await window.config.get('workspace_sync_excludes_json');
        if (savedExcludes) {
          try {
            const parsed = JSON.parse(savedExcludes) as unknown;
            if (Array.isArray(parsed)) {
              const lines = parsed.map(String).join('\n');
              if (lines.trim()) setExcludeLines(lines);
            }
          } catch {
            // ignore
          }
        }

        const savedDelete = await window.config.get('workspace_sync_delete_extraneous');
        if (savedDelete) {
          setDeleteExtraneous(savedDelete === 'true' || savedDelete === '1');
        }
      } catch (error) {
        setMessage('Failed to load configuration');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await window.secrets.set('openrouter_api_key', apiKey);
      const meta = await window.secrets.getMeta('openrouter_api_key');
      setHasApiKey(meta.exists === true);
      setApiKey('');
      setMessage('API key saved securely!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleBrowseWorkspace = async () => {
    try {
      setSyncMessage('');
      setLastSync(null);
      const res = await window.workspace.selectSourceDir();
      if (!res?.path) return;
      setWorkspaceSourcePath(res.path);
    } catch (e) {
      setSyncMessage((e as Error)?.message ?? 'Browse failed');
    }
  };

  const handleSaveWorkspaceSyncSettings = async () => {
    setSaving(true);
    setMessage('');
    try {
      await window.config.set('workspace_sync_source_path', workspaceSourcePath.trim());
      await window.config.set('workspace_sync_rsync_path', rsyncPath.trim());
      const excludes = excludeLines
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      await window.config.set('workspace_sync_excludes_json', JSON.stringify(excludes));
      await window.config.set('workspace_sync_delete_extraneous', deleteExtraneous ? 'true' : 'false');
      setMessage('Workspace sync settings saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save workspace sync settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage('');
    setLastSync(null);
    try {
      const excludes = excludeLines
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const res = await window.workspace.sync({
        sourcePath: workspaceSourcePath.trim(),
        excludes,
        deleteExtraneous,
        rsyncPath: rsyncPath.trim() || undefined,
      });

      if (res.ok) {
        setSyncMessage(`Sync complete in ${res.durationMs}ms → ${res.destPath}`);
        setShowSyncDetails(false);
      } else {
        setSyncMessage(res.error || 'Sync failed');
        setShowSyncDetails(true);
      }
      setLastSync(res);
    } catch (e) {
      setSyncMessage((e as Error)?.message ?? 'Sync failed');
      setShowSyncDetails(true);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header (match AgentDetail and ChatHeader style) */}
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
            <div className="flex-shrink-0 flex items-center">
              <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
                <Settings size={20} className="text-[#888888]" />
              </div>
            </div>
            <div className="flex-1 min-w-0 flex items-center">
              <h2 className="text-white text-base font-medium truncate">Settings</h2>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setActiveView(null)}
              className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
              aria-label="Close"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <div className="text-gray-500">Loading configuration...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header (match AgentDetail and ChatHeader style) */}
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
          <div className="flex-shrink-0 flex items-center">
            <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center">
              <Settings size={20} className="text-[#888888]" />
            </div>
          </div>
          <div className="flex-1 min-w-0 flex items-center">
            <h2 className="text-white text-base font-medium truncate">Settings</h2>
          </div>
        </div>

        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveView(null)}
            className="p-2 text-[#888888] hover:text-white hover:bg-[#2a2a2a] rounded-full transition-colors"
            aria-label="Close"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Body */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium mb-2">
              OpenRouter API Key
            </label>
            <div className="text-xs text-gray-500 mb-2">
              {hasApiKey ? 'Configured (stored securely on this Mac).' : 'Not configured.'}
            </div>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="sk-or-v1-..."
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>

            {message && (
              <span
                className={`text-sm ${
                  message.includes('Failed') ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {message}
              </span>
            )}
          </div>
        </form>

        <div className="mt-10 p-4 bg-gray-50 rounded-md space-y-4">
          <h2 className="text-lg font-semibold">Workspace Sync (rsync)</h2>
          <p className="text-sm text-gray-600">
            Sync a local workspace folder into the runner shared directory so tools can read it inside the container (as{' '}
            <code className="font-mono">/shared/workspace</code>). This is sync-only (no apply-back yet).
          </p>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Workspace folder (repo root)</label>
            <div className="flex items-center gap-2">
              <input
                value={workspaceSourcePath}
                onChange={(e) => setWorkspaceSourcePath(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="/Users/you/project"
              />
              <button
                type="button"
                onClick={handleBrowseWorkspace}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
              >
                Browse…
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">rsync executable (optional)</label>
            <input
              value={rsyncPath}
              onChange={(e) => setRsyncPath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="rsync (or full path to rsync.exe on Windows)"
            />
            <p className="text-xs text-gray-500">
              Windows note: install rsync (e.g. via MSYS2/cwRsync) and ensure it’s on PATH, or set the full path here.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Exclude patterns (one per line)</label>
            <textarea
              value={excludeLines}
              onChange={(e) => setExcludeLines(e.target.value)}
              className="w-full min-h-[140px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder={'node_modules/\n.vite/\n.git/'}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={deleteExtraneous}
              onChange={(e) => setDeleteExtraneous(e.target.checked)}
            />
            Delete extraneous files in destination (mirror semantics)
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveWorkspaceSyncSettings}
              disabled={saving}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
            >
              Save workspace sync settings
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing || !workspaceSourcePath.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            {syncMessage && (
              <span
                className={`text-sm ${
                  syncMessage.toLowerCase().includes('failed') ? 'text-red-600' : 'text-green-700'
                }`}
              >
                {syncMessage}
              </span>
            )}
          </div>

          {lastSync && (lastSync.stderr || lastSync.stdout || lastSync.error) && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                lastSync.ok
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {lastSync.ok ? 'Sync details' : 'Sync failed details'}
                    {typeof lastSync.exitCode === 'number' ? ` (exit ${lastSync.exitCode})` : ''}
                  </div>
                  <div className="text-xs opacity-80 font-mono truncate">
                    {lastSync.command?.exe} {(lastSync.command?.args ?? []).join(' ')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSyncDetails((v) => !v)}
                  className="px-2 py-1 rounded border border-current/20 hover:bg-black/5"
                >
                  {showSyncDetails ? 'Hide' : 'Show'}
                </button>
              </div>

              {showSyncDetails && (
                <div className="mt-2 space-y-2">
                  {lastSync.error && (
                    <div>
                      <span className="font-semibold">Error:</span> {lastSync.error}
                    </div>
                  )}
                  {lastSync.stderr && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">stderr</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs bg-white/60 border border-current/10 rounded p-2 max-h-64 overflow-auto">
                        {lastSync.stderr}
                      </pre>
                    </div>
                  )}
                  {lastSync.stdout && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider opacity-80">stdout</div>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs bg-white/60 border border-current/10 rounded p-2 max-h-64 overflow-auto">
                        {lastSync.stdout}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
