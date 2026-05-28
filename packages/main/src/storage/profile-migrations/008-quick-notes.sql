CREATE TABLE IF NOT EXISTS quick_notes (
  workspace_id  TEXT PRIMARY KEY
                REFERENCES workspaces(id) ON DELETE CASCADE,
  content       TEXT NOT NULL DEFAULT '',
  updated_at    INTEGER NOT NULL
);
