// Export all database functionality
export { getDatabase, closeDatabase, getDatabasePath } from './database';
export { runMigrations, getCurrentVersion, getMigrationHistory } from './migrations';
export * from './types';
