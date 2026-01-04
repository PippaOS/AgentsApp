-- +migrate Up
-- Drop all existing chat data (dev reset)
DELETE FROM chat_context;
DELETE FROM messages;
DELETE FROM chats;

-- Add agent_public_id to link chats to agents
ALTER TABLE chats ADD COLUMN agent_public_id TEXT REFERENCES agents(public_id);

-- +migrate Down
-- SQLite doesn't support DROP COLUMN without table rebuild; leave as no-op.
