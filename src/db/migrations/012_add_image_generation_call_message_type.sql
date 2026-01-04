-- Add 'image_generation_call' to message_type CHECK constraint
PRAGMA foreign_keys=off;

CREATE TABLE messages_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL DEFAULT '',
  reasoning TEXT,
  reasoning_details_json TEXT,
  response_json TEXT,
  model TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK(message_type IN ('text', 'file_system', 'chat_context', 'tool_call', 'tool_result', 'image_generation_call')),
  entity_id TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  cost REAL,
  chat_context_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_context_id) REFERENCES chat_context(id) ON DELETE SET NULL
);

INSERT INTO messages_new (
  id, public_id, chat_id, role, content, reasoning, reasoning_details_json, response_json, model,
  message_type, entity_id, tool_calls_json, tool_call_id, cost, chat_context_id, created_at
)
SELECT
  id, public_id, chat_id, role, content, reasoning, reasoning_details_json, response_json, model,
  message_type, entity_id, tool_calls_json, tool_call_id, cost, chat_context_id, created_at
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX IF NOT EXISTS idx_messages_public_id ON messages(public_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat_context_id ON messages(chat_context_id);

PRAGMA foreign_keys=on;

