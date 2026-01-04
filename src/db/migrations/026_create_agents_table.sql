-- +migrate Up
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL
);

-- +migrate Down
DROP TABLE IF EXISTS agents;

