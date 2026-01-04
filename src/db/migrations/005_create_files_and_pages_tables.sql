-- Create files table
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    original_path TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    total_pages INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create pages table
CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    public_id TEXT NOT NULL UNIQUE,
    image_path TEXT,
    text_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_files_public_id ON files(public_id);
CREATE INDEX IF NOT EXISTS idx_pages_public_id ON pages(public_id);
CREATE INDEX IF NOT EXISTS idx_pages_file_id ON pages(file_id);


