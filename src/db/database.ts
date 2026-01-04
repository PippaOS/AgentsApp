import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';

let db: Database.Database | null = null;

/**
 * Get or initialize the SQLite database connection
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  // Store database in userData directory
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pippachat.db');

  // Ensure directory exists
  fs.mkdirSync(userDataPath, { recursive: true });

  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the database file path
 */
export function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'pippachat.db');
}

