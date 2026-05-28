-- 020: restore UNIQUE constraint on url in profile_favorites.
-- Migration 018 removed the UNIQUE constraint when making url nullable.
-- Without it, ON CONFLICT(url) in FavoritesRepository.add() throws
-- "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint".
-- SQLite UNIQUE indexes allow multiple NULLs (treated as distinct),
-- so folders (url = NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_url_unique
  ON profile_favorites(url);
