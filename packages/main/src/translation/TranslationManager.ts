import { translate } from '@vitalets/google-translate-api';

export interface TranslationResult {
  translatedText: string;
  detectedLang: string;
}

export class TranslationManager {
  async translate(
    text: string,
    targetLang: string,
    sourceLang: string | 'auto',
  ): Promise<TranslationResult> {
    const res = await translate(text, {
      to: targetLang,
      ...(sourceLang !== 'auto' ? { from: sourceLang } : {}),
    });
    return {
      translatedText: res.text,
      detectedLang: res.raw.src ?? 'und',
    };
  }

  async detectPageLanguage(text: string): Promise<string> {
    try {
      const res = await translate(text.slice(0, 500), { to: 'en' });
      return res.raw.src ?? 'und';
    } catch {
      return 'und';
    }
  }
}
