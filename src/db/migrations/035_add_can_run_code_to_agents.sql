-- +migrate Up
-- Add can_run_code flag to agents table (0/1)
ALTER TABLE agents ADD COLUMN can_run_code INTEGER NOT NULL DEFAULT 0;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.

