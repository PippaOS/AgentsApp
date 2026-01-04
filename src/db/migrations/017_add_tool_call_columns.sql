-- Add dedicated columns for tool call data
-- This replaces the tool_calls_json blob approach

-- Add new columns for tool call data
ALTER TABLE messages ADD COLUMN tool_name TEXT;
ALTER TABLE messages ADD COLUMN tool_input TEXT;
ALTER TABLE messages ADD COLUMN tool_output TEXT;

-- Note: tool_call_id already exists from the original schema
-- We keep tool_calls_json for backwards compatibility but won't use it for new messages


