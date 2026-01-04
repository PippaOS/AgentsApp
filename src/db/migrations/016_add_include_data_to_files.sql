-- Add include_data column to files table
ALTER TABLE files ADD COLUMN include_data INTEGER DEFAULT 0;

