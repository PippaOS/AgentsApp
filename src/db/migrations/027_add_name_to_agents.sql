-- +migrate Up
ALTER TABLE agents ADD COLUMN name TEXT NOT NULL DEFAULT 'Untitled Agent';

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.

