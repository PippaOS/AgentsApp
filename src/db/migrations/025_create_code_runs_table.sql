-- Create code_runs table (runner tool executions)
CREATE TABLE IF NOT EXISTS code_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  input_ts TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  output TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_code_runs_public_id ON code_runs(public_id);
CREATE INDEX IF NOT EXISTS idx_code_runs_created_at ON code_runs(created_at);

