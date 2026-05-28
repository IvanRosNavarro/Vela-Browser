-- 018: remove NOT NULL from url in profile_favorites.
-- Folders have url = NULL. SQLite does not support ALTER COLUMN,
-- so we recreate the table copying all existing data.
-- SQLite UNIQUE allows multiple NULL values, so bookmarks keep
-- their implicit uniqueness without a redundant constraint.

DROP TABLE IF EXISTS profile_favorites_new;

CREATE TABLE profile_favorites_new (
  id          TEXT PRIMARY KEY,
  url         TEXT,
  title       TEXT NOT NULL DEFAULT '',
  favicon     TEXT,
  position    TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER,
  type        TEXT NOT NULL DEFAULT 'bookmark',
  parent_id   TEXT
);

INSERT INTO profile_favorites_new
  SELECT id, url, title, favicon, position, created_at, created_at, type, parent_id
  FROM profile_favorites;

DROP TABLE profile_favorites;
ALTER TABLE profile_favorites_new RENAME TO profile_favorites;

CREATE INDEX IF NOT EXISTS idx_favorites_position
  ON profile_favorites(position);
