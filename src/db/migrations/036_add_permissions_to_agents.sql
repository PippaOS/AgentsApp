-- +migrate Up
-- Add permissions column to agents table (stores JSON array of permission flags)
ALTER TABLE agents ADD COLUMN permissions TEXT NOT NULL DEFAULT '[]';

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.
