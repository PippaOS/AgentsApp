-- Add include_images and include_text columns to files table
ALTER TABLE files ADD COLUMN include_images INTEGER DEFAULT 0;
ALTER TABLE files ADD COLUMN include_text INTEGER DEFAULT 0;

