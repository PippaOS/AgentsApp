-- +migrate Up
ALTER TABLE agents ADD COLUMN avatar_url TEXT;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.
