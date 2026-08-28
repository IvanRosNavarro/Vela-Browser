import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/**
 * Convierte un locale BCP 47 (ej: 'es-ES', 'es') a la lista de candidatos en
 * formato `_locales` (guión bajo), del más al menos específico.
 */
function localeCandidates(locale: string): string[] {
  const normalized = locale.replace(/-/g, '_'); // 'es-ES' → 'es_ES'
  const base = normalized.split('_')[0]!;       // 'es_ES' → 'es'
  const candidates = normalized === base ? [base] : [normalized, base];
  // Siempre añadir inglés como fallback universal
  for (const en of ['en', 'en_US', 'en_GB']) {
    if (!candidates.includes(en)) candidates.push(en);
  }
  return candidates;
}

/**
 * Resuelve cadenas de localización tipo `__MSG_key__` que Chrome i18n usa en los
 * manifests. Prioriza el locale del sistema (`app.getLocale()`) con fallback a
 * inglés y, en último término, a cualquier locale disponible.
 */
export function resolveI18nMessage(extPath: string, value: string | undefined): string {
  if (!value) return '';
  const match = value.match(/^__MSG_(\w+)__$/);
  if (!match) return value;
  const key = match[1]!;
  const localesDir = path.join(extPath, '_locales');
  const systemLocale = (() => { try { return app.getLocale(); } catch { return 'en'; } })();
  const priority = localeCandidates(systemLocale);
  // Añadir el resto de locales disponibles como última opción
  let localesToTry = [...priority];
  try {
    const available = fs.readdirSync(localesDir);
    localesToTry = [...priority, ...available.filter((l) => !priority.includes(l))];
  } catch { /* sin _locales */ }
  for (const locale of localesToTry) {
    try {
      const messagesPath = path.join(localesDir, locale, 'messages.json');
      const raw = fs.readFileSync(messagesPath, 'utf8');
      const messages = JSON.parse(raw) as Record<string, { message?: string }>;
      // Chrome es case-insensitive con las claves de mensajes
      const entry = messages[key] ?? messages[key.toLowerCase()] ?? messages[key.toUpperCase()];
      if (entry?.message) return entry.message;
    } catch { /* este locale no existe, continuar */ }
  }
  return value; // fallback: devolver el placeholder original
}
