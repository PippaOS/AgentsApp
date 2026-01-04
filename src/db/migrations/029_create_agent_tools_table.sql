-- +migrate Up
CREATE TABLE IF NOT EXISTS agent_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  tool_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, tool_id),
  FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY(tool_id) REFERENCES tools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_agent_id ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_tool_id ON agent_tools(tool_id);

-- +migrate Down
DROP TABLE IF EXISTS agent_tools;

