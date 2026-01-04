-- +migrate Up
-- Add model and reasoning columns to chats table
ALTER TABLE chats ADD COLUMN model TEXT;
ALTER TABLE chats ADD COLUMN reasoning TEXT;

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.
