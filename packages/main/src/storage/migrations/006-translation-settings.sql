CREATE TABLE IF NOT EXISTS translation_settings (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  target_lang TEXT NOT NULL DEFAULT 'es',
  source_mode TEXT NOT NULL DEFAULT 'auto',
  source_lang TEXT NOT NULL DEFAULT 'en'
);

INSERT OR IGNORE INTO translation_settings (id, target_lang, source_mode, source_lang)
VALUES (1, 'es', 'auto', 'en');
