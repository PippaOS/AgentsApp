-- Create models table
CREATE TABLE models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_models_public_id ON models(public_id);
CREATE INDEX idx_models_name ON models(name);
CREATE INDEX idx_models_created_at ON models(created_at);

