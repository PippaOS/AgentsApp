-- Create chat_context table
CREATE TABLE IF NOT EXISTS chat_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  chat_id INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  message_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_chat_context_public_id ON chat_context(public_id);
CREATE INDEX IF NOT EXISTS idx_chat_context_chat_id ON chat_context(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_context_entity_id ON chat_context(entity_id);
CREATE INDEX IF NOT EXISTS idx_chat_context_message_id ON chat_context(message_id);


