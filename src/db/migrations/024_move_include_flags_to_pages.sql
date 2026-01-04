-- Delete all existing files and pages (dev only)
DELETE FROM pages;
DELETE FROM files;

-- Recreate files table without include_images, include_text, and metadata_only columns
-- Keep only include_data at file level
DROP TABLE IF EXISTS files;
CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    original_path TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    total_pages INTEGER DEFAULT 0,
    include_data INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_files_public_id ON files(public_id);

-- Recreate pages table with include_images, include_text, and include_data columns
DROP TABLE IF EXISTS pages;
CREATE TABLE pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    public_id TEXT NOT NULL UNIQUE,
    image_path TEXT,
    text_content TEXT,
    include_images INTEGER DEFAULT 1,
    include_text INTEGER DEFAULT 0,
    include_data INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_pages_public_id ON pages(public_id);
CREATE INDEX IF NOT EXISTS idx_pages_file_id ON pages(file_id);

