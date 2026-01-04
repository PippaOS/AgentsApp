CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  reasoning TEXT,
  model TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'file_system', 'tool_call', 'tool_result')),
  entity_id TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  cost REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE INDEX idx_messages_public_id ON messages(public_id);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

