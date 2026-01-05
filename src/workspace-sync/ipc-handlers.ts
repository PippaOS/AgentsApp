import { ipcMain, dialog, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { getDefaultWorkspaceDestPath, syncWorkspace } from './index';

export type WorkspaceSyncRequest = {
  sourcePath: string;
  destPath?: string;
  excludes?: string[];
  deleteExtraneous?: boolean;
  rsyncPath?: string;
};

export type WorkspaceEntry = {
  name: string;
  /** Path relative to the workspace root (posix-style). */
  relPath: string;
  kind: 'file' | 'dir' | 'other';
  size: number | null;
  mtimeMs: number | null;
};

export type WorkspaceListDirRequest = {
  /** Path relative to the workspace root. Empty/undefined means root. */
  relPath?: string;
};

export type WorkspaceListDirResponse =
  | { ok: true; rootPath: string; relPath: string; entries: WorkspaceEntry[] }
  | { ok: false; error: string };

function normalizeRelPath(relPath: string | undefined): string {
  const p = (relPath ?? '').trim();
  if (!p || p === '.' || p === '/' || p === path.posix.sep) return '';
  // Always treat it as posix so the renderer can store paths consistently.
  const posix = p.replaceAll('\\', '/');
  // Strip leading slash to keep it relative.
  return posix.startsWith('/') ? posix.slice(1) : posix;
}

function resolveWorkspacePath(rootPath: string, relPath: string): string | null {
  // Join using platform path (rootPath is a host path).
  const abs = path.resolve(rootPath, relPath.split('/').join(path.sep));
  const rootResolved = path.resolve(rootPath);
  if (abs === rootResolved) return abs;
  // Ensure abs is within root. Add separator to avoid prefix tricks.
  const rootPrefix = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;
  if (!abs.startsWith(rootPrefix)) return null;
  return abs;
}

function shouldExcludeName(name: string): boolean {
  // Hard excludes for browsing. This is intentionally conservative.
  // (We can later incorporate user-configured excludes if needed.)
  if (!name) return true;
  return (
    name === 'node_modules' ||
    name === '.git' ||
    name === '.DS_Store' ||
    name === '.vite' ||
    name === '.devtools' ||
    name === 'dist' ||
    name === 'out'
  );
}

/**
 * Register IPC handlers for syncing a host workspace into the shared runner directory.
 *
 * This is intentionally "sync only" (no sync-back/patched-apply yet).
 */
export function registerWorkspaceSyncHandlers(): void {
  ipcMain.handle('workspace:selectSourceDir', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
    const options = { properties: ['openDirectory'] as Array<'openDirectory'> };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return { path: result.filePaths[0] };
  });

  ipcMain.handle('workspace:sync', async (_evt, req: WorkspaceSyncRequest) => {
    const res = await syncWorkspace({
      sourcePath: req?.sourcePath,
      destPath: req?.destPath,
      excludes: req?.excludes,
      deleteExtraneous: req?.deleteExtraneous,
      rsyncPath: req?.rsyncPath,
    });

    // Broadcast an update so UI can refresh if needed (and future features can react).
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('workspace:updated', { ok: res.ok, destPath: res.destPath });
    });

    return res;
  });

  // Read-only directory listing of the synced workspace snapshot (dest).
  ipcMain.handle('workspace:listDir', async (_evt, req: WorkspaceListDirRequest): Promise<WorkspaceListDirResponse> => {
    const rootPath = getDefaultWorkspaceDestPath();
    const relPath = normalizeRelPath(req?.relPath);
    const abs = resolveWorkspacePath(rootPath, relPath);
    if (!abs) {
      return { ok: false, error: 'Invalid path' };
    }
    try {
      const dirents = await fs.promises.readdir(abs, { withFileTypes: true });
      const entries: WorkspaceEntry[] = await Promise.all(
        dirents
          .filter((d) => !shouldExcludeName(d.name))
          .map(async (d) => {
            const childRel = relPath ? `${relPath}/${d.name}` : d.name;
            const childAbs = resolveWorkspacePath(rootPath, childRel);
            let size: number | null = null;
            let mtimeMs: number | null = null;
            if (childAbs) {
              try {
                const st = await fs.promises.stat(childAbs);
                size = typeof st.size === 'number' ? st.size : null;
                mtimeMs = typeof st.mtimeMs === 'number' ? st.mtimeMs : null;
              } catch {
                // ignore stat failures (e.g. broken symlink)
              }
            }
            const kind: WorkspaceEntry['kind'] = d.isDirectory()
              ? 'dir'
              : d.isFile()
                ? 'file'
                : 'other';
            return { name: d.name, relPath: childRel, kind, size, mtimeMs };
          }),
      );

      // Sort: dirs first, then files; alpha by name.
      entries.sort((a, b) => {
        const ak = a.kind === 'dir' ? 0 : 1;
        const bk = b.kind === 'dir' ? 0 : 1;
        if (ak !== bk) return ak - bk;
        return a.name.localeCompare(b.name);
      });

      return { ok: true, rootPath, relPath, entries };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message ?? 'Failed to read directory' };
    }
  });
}

