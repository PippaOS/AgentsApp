import { getDatabase } from './database';
import fs from 'node:fs';
import path from 'node:path';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

/**
 * Run all pending migrations
 */
export function runMigrations(migrationsDir: string): void {
  const db = getDatabase();

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get current version
  const result = db.prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations').get() as { version: number };
  const currentVersion = result.version;

  // Load migration files
  const migrations = loadMigrations(migrationsDir);

  // Filter pending migrations
  const pendingMigrations = migrations.filter(m => m.version > currentVersion);

  if (pendingMigrations.length === 0) {
    return;
  }

  // Run each migration in a transaction
  for (const migration of pendingMigrations) {
    const transaction = db.transaction(() => {
      db.exec(migration.up);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    });

    transaction();
  }
}

/**
 * Load migration files from directory
 */
function loadMigrations(migrationsDir: string): Migration[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const migrations: Migration[] = [];

  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      continue;
    }

    const version = parseInt(match[1], 10);
    const name = match[2];
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Split by -- +migrate Down marker if present
    const parts = content.split(/^-- \+migrate Down$/m);
    const up = parts[0].trim();
    const down = parts[1]?.trim();

    migrations.push({
      version,
      name,
      up,
      down,
    });
  }

  return migrations;
}

/**
 * Get current schema version
 */
export function getCurrentVersion(): number {
  const db = getDatabase();
  
  // Check if migrations table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
  ).get();

  if (!tableExists) {
    return 0;
  }

  const result = db.prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations').get() as { version: number };
  return result.version;
}

/**
 * Get migration history
 */
export function getMigrationHistory(): Array<{ version: number; name: string; applied_at: string }> {
  const db = getDatabase();
  
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
  ).get();

  if (!tableExists) {
    return [];
  }

  return db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all() as Array<{ version: number; name: string; applied_at: string }>;
}

