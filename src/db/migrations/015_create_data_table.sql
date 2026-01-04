-- Create data table for storing key-value pairs attached to entities
CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    parent_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_data_public_id ON data(public_id);
CREATE INDEX IF NOT EXISTS idx_data_parent_id ON data(parent_id);
CREATE INDEX IF NOT EXISTS idx_data_key ON data(key);
CREATE INDEX IF NOT EXISTS idx_data_parent_id_key ON data(parent_id, key);

