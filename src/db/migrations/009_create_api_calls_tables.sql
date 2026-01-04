-- API call logging tables (streaming-first)
PRAGMA foreign_keys=off;

CREATE TABLE IF NOT EXISTS api_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  chat_id INTEGER,
  model TEXT NOT NULL,
  model_actual TEXT,
  request_json TEXT,
  response_json TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cached_tokens INTEGER,
  reasoning_tokens INTEGER,
  latency_ms INTEGER,
  duration_ms INTEGER,
  provider TEXT,
  finish_reason TEXT,
  is_streaming INTEGER NOT NULL DEFAULT 0,
  has_tools INTEGER NOT NULL DEFAULT 0,
  has_images INTEGER NOT NULL DEFAULT 0,
  cost REAL,
  is_byok INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS api_call_tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  api_call_id INTEGER NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  result_json TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (api_call_id) REFERENCES api_calls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_call_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_call_id INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  message_index INTEGER NOT NULL,
  content_index INTEGER NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (api_call_id) REFERENCES api_calls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_calls_public_id ON api_calls(public_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_chat_id ON api_calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at);

CREATE INDEX IF NOT EXISTS idx_api_call_tool_calls_api_call_id ON api_call_tool_calls(api_call_id);
CREATE INDEX IF NOT EXISTS idx_api_call_tool_calls_tool_call_id ON api_call_tool_calls(tool_call_id);

CREATE INDEX IF NOT EXISTS idx_api_call_entities_api_call_id ON api_call_entities(api_call_id);

PRAGMA foreign_keys=on;


