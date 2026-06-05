import type { DatabaseSync } from 'node:sqlite';

export interface TranslationSettings {
  targetLang: string;
  sourceMode: 'auto' | string;
  sourceLang: string;
}

interface TranslationSettingsRow {
  target_lang: string;
  source_mode: string;
  source_lang: string;
}

const DEFAULT_SETTINGS: TranslationSettings = {
  targetLang: 'es',
  sourceMode: 'auto',
  sourceLang: 'en',
};

export class TranslationSettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(): TranslationSettings {
    const row = this.db
      .prepare('SELECT target_lang, source_mode, source_lang FROM translation_settings WHERE id = 1')
      .get() as TranslationSettingsRow | undefined;

    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      targetLang: row.target_lang,
      sourceMode: row.source_mode,
      sourceLang: row.source_lang,
    };
  }

  save(partial: Partial<TranslationSettings>): TranslationSettings {
    const current = this.get();
    const updated: TranslationSettings = {
      targetLang: partial.targetLang ?? current.targetLang,
      sourceMode: partial.sourceMode ?? current.sourceMode,
      sourceLang: partial.sourceLang ?? current.sourceLang,
    };
    this.db
      .prepare(
        `INSERT INTO translation_settings (id, target_lang, source_mode, source_lang)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           target_lang = excluded.target_lang,
           source_mode = excluded.source_mode,
           source_lang = excluded.source_lang`,
      )
      .run(updated.targetLang, updated.sourceMode, updated.sourceLang);
    return updated;
  }
}
