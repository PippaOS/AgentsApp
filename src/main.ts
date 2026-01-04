import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { getDatabase, runMigrations, closeDatabase } from './db';
import { registerDatabaseHandlers } from './db/ipc-handlers';
import { registerChatHandlers } from './chat/ipc-handlers';
import { registerFileHandlers } from './main-file-handlers';
import { registerAPICallHandlers } from './api-calls/ipc-handlers';
import { initializeEntityCache, registerEntityCacheHandlers } from './entity-cache';
import { registerCodeRunnerHandlers } from './code-runner/ipc-handlers';
import { registerWorkspaceSyncHandlers } from './workspace-sync/ipc-handlers';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }
};

// Initialize database and run migrations
const initializeDatabase = () => {
  try {
    // In development: src/db/migrations
    // In production: relative to the build output
    const migrationsDir = path.join(__dirname, 'db', 'migrations');
    getDatabase();
    runMigrations(migrationsDir);
  } catch (error) {
    // Failed to initialize database
  }
};


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  initializeDatabase();
  registerDatabaseHandlers();
  registerChatHandlers();
  registerFileHandlers();
  registerAPICallHandlers();
  registerCodeRunnerHandlers();
  registerWorkspaceSyncHandlers();
  registerEntityCacheHandlers();
  // Initialize entity cache after all handlers are registered and database is ready
  initializeEntityCache();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

// Clean up database connection before quitting
app.on('before-quit', () => {
  closeDatabase();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
