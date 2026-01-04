-- Add metadata_only column to files table
ALTER TABLE files ADD COLUMN metadata_only INTEGER DEFAULT 0;

