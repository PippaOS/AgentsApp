-- Allow NULL parent_id in data table to support unlinking
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Create new table with parent_id allowing NULL
CREATE TABLE IF NOT EXISTS data_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    parent_id TEXT,
    key TEXT NOT NULL,
    value TEXT,
    type TEXT,
    options TEXT,
    markdown TEXT,
    text TEXT,
    json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table
INSERT INTO data_new SELECT * FROM data;

-- Drop old table
DROP TABLE data;

-- Rename new table
ALTER TABLE data_new RENAME TO data;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_data_public_id ON data(public_id);
CREATE INDEX IF NOT EXISTS idx_data_parent_id ON data(parent_id);
CREATE INDEX IF NOT EXISTS idx_data_key ON data(key);
CREATE INDEX IF NOT EXISTS idx_data_parent_id_key ON data(parent_id, key);

