CREATE TABLE IF NOT EXISTS history (
  id           TEXT PRIMARY KEY,
  url          TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  favicon      TEXT,
  visited_at   INTEGER NOT NULL,
  workspace_id TEXT NOT NULL,
  session_id   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_visited_at
  ON history(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_url
  ON history(url);
CREATE INDEX IF NOT EXISTS idx_history_workspace
  ON history(workspace_id, visited_at DESC);
