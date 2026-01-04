-- +migrate Up
ALTER TABLE agents ADD COLUMN allow_parallel_tool_calls INTEGER NOT NULL DEFAULT 0;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.

