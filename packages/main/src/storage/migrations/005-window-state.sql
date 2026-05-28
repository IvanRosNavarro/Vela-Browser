CREATE TABLE IF NOT EXISTS window_state (
  window_id    TEXT PRIMARY KEY,
  profile_id   TEXT NOT NULL,
  workspace_id TEXT,
  bounds       TEXT NOT NULL DEFAULT '{}',
  is_primary   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_window_state_profile
  ON window_state(profile_id);
