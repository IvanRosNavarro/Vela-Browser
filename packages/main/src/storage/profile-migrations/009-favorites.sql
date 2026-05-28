CREATE TABLE IF NOT EXISTS profile_favorites (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL DEFAULT '',
  favicon     TEXT,
  position    TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_favorites_position
  ON profile_favorites(position);
