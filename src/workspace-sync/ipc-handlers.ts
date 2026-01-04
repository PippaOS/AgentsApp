import { ipcMain, dialog, BrowserWindow } from 'electron';
import { syncWorkspace } from './index';

export type WorkspaceSyncRequest = {
  sourcePath: string;
  destPath?: string;
  excludes?: string[];
  deleteExtraneous?: boolean;
  rsyncPath?: string;
};

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
}

