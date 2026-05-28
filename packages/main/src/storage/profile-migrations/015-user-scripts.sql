CREATE TABLE user_scripts (
  id            TEXT    PRIMARY KEY,
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  type          TEXT    NOT NULL CHECK(type IN ('js', 'css')),
  code          TEXT    NOT NULL,
  match_patterns TEXT   NOT NULL DEFAULT '[]',
  enabled       INTEGER NOT NULL DEFAULT 1,
  run_at        TEXT    NOT NULL DEFAULT 'document-idle'
                CHECK(run_at IN ('document-start', 'document-end', 'document-idle')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
