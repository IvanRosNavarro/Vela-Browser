import { describe, expect, it } from 'vitest';
import {
  matchSpellcheckLanguage,
  parseSpellcheckEnabled,
  parseSpellcheckLanguages,
  resolveSpellcheckLanguages,
} from './spellcheckSettings';

const LINUX = ['en-GB', 'en-US', 'es', 'es-419', 'es-ES', 'es-MX', 'fr', 'pt-BR', 'pt-PT'];
const WINDOWS = ['en-US', 'es-ES'];

describe('parseSpellcheckEnabled', () => {
  it('está activo por defecto', () => {
    expect(parseSpellcheckEnabled(null)).toBe(true);
    expect(parseSpellcheckEnabled('no-es-json')).toBe(true);
  });

  it('solo se desactiva con false explícito', () => {
    expect(parseSpellcheckEnabled('false')).toBe(false);
    expect(parseSpellcheckEnabled('true')).toBe(true);
  });
});

describe('parseSpellcheckLanguages', () => {
  it('null o ausente significa seguir al sistema', () => {
    expect(parseSpellcheckLanguages(null)).toBeNull();
    expect(parseSpellcheckLanguages('null')).toBeNull();
  });

  it('descarta valores corruptos', () => {
    expect(parseSpellcheckLanguages('{')).toBeNull();
    expect(parseSpellcheckLanguages('"es-ES"')).toBeNull();
    expect(parseSpellcheckLanguages('[1, 2]')).toBeNull();
  });

  it('devuelve la lista elegida', () => {
    expect(parseSpellcheckLanguages('["es-ES","en-US"]')).toEqual(['es-ES', 'en-US']);
  });
});

describe('matchSpellcheckLanguage', () => {
  it('prefiere la coincidencia exacta sin distinguir mayúsculas', () => {
    expect(matchSpellcheckLanguage('es-es', LINUX)).toBe('es-ES');
    expect(matchSpellcheckLanguage('es_MX', LINUX)).toBe('es-MX');
  });

  it('cae al idioma base y luego a otra región', () => {
    expect(matchSpellcheckLanguage('es-AR', LINUX)).toBe('es');
    expect(matchSpellcheckLanguage('pt', LINUX)).toBe('pt-BR');
    expect(matchSpellcheckLanguage('de-DE', LINUX)).toBeNull();
  });
});

describe('resolveSpellcheckLanguages', () => {
  it('sin elección del usuario usa los idiomas del sistema disponibles', () => {
    expect(resolveSpellcheckLanguages(null, ['es-ES', 'en-US', 'de-DE'], WINDOWS)).toEqual([
      'es-ES',
      'en-US',
    ]);
  });

  it('respeta la elección del usuario y quita duplicados', () => {
    expect(resolveSpellcheckLanguages(['fr', 'es-ES', 'es-es'], ['en-US'], LINUX)).toEqual([
      'fr',
      'es-ES',
    ]);
  });

  it('si ningún idioma elegido existe aquí (llegó por sync), vuelve a los del sistema', () => {
    expect(resolveSpellcheckLanguages(['de-DE'], ['es-ES'], WINDOWS)).toEqual(['es-ES']);
  });

  it('sin nada usable cae a en-US o al primer diccionario', () => {
    expect(resolveSpellcheckLanguages(null, ['ja-JP'], WINDOWS)).toEqual(['en-US']);
    expect(resolveSpellcheckLanguages(null, ['ja-JP'], ['fr'])).toEqual(['fr']);
  });

  it('sin diccionarios (macOS) no devuelve nada', () => {
    expect(resolveSpellcheckLanguages(['es-ES'], ['es-ES'], [])).toEqual([]);
  });
});
