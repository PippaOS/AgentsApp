CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default empty OpenRouter API key
INSERT OR IGNORE INTO config (key, value) VALUES ('openrouter_api_key', '');

