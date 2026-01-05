-- +migrate Up
-- Add bio column to agents table
ALTER TABLE agents ADD COLUMN bio TEXT;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.
