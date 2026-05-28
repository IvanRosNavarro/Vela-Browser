CREATE TABLE IF NOT EXISTS recent_files (
  id          TEXT PRIMARY KEY,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT '',
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  used_at     INTEGER NOT NULL,
  profile_id  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recent_files_profile_path
  ON recent_files(profile_id, path);

CREATE INDEX IF NOT EXISTS idx_recent_files_profile_used
  ON recent_files(profile_id, used_at DESC);
