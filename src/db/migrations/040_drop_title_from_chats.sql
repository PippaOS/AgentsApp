-- +migrate Up
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
CREATE TABLE IF NOT EXISTS chats_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  agent_public_id TEXT,
  model TEXT,
  reasoning TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_public_id) REFERENCES agents(public_id)
);

-- Copy data from old table to new table (excluding title column)
INSERT INTO chats_new (id, public_id, agent_public_id, model, reasoning, created_at)
SELECT id, public_id, agent_public_id, model, reasoning, created_at
FROM chats;

-- Drop old table
DROP TABLE chats;

-- Rename new table to original name
ALTER TABLE chats_new RENAME TO chats;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_chats_public_id ON chats(public_id);
CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);

-- +migrate Down
-- Re-add title column (as nullable since we can't restore the original values)
ALTER TABLE chats ADD COLUMN title TEXT;
