-- +migrate Up
-- Add model and reasoning columns to agents table
ALTER TABLE agents ADD COLUMN model TEXT;
ALTER TABLE agents ADD COLUMN reasoning TEXT;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.
