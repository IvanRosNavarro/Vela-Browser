CREATE TABLE IF NOT EXISTS adblocker_exceptions (
  id         TEXT PRIMARY KEY,
  domain     TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adblocker_exceptions_domain
  ON adblocker_exceptions(domain);
