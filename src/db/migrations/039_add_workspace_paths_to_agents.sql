-- +migrate Up
ALTER TABLE agents ADD COLUMN workspace_paths_json TEXT NOT NULL DEFAULT '[]';

-- +migrate Down
-- SQLite doesn't support DROP COLUMN in older versions; rebuild table if needed.
