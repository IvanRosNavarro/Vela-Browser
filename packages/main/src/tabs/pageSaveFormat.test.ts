import { describe, expect, it } from 'vitest';
import {
  SAVE_PAGE_FILTERS,
  defaultSavePageName,
  sanitizeFileName,
  savePageFormatForPath,
} from './pageSaveFormat';

describe('savePageFormatForPath', () => {
  it('deduce el formato de la extensión', () => {
    expect(savePageFormatForPath('C:\\Users\\a\\Downloads\\Página.html')).toBe('HTMLComplete');
    expect(savePageFormatForPath('/home/a/pagina.HTM')).toBe('HTMLOnly');
    expect(savePageFormatForPath('/home/a/pagina.mhtml')).toBe('MHTML');
    expect(savePageFormatForPath('/home/a/pagina.mht')).toBe('MHTML');
  });

  it('sin extensión conocida guarda la página completa', () => {
    expect(savePageFormatForPath('/home/a/pagina')).toBe('HTMLComplete');
    expect(savePageFormatForPath('/home/a.b/pagina')).toBe('HTMLComplete');
  });

  it('cada filtro del diálogo corresponde a un formato distinto', () => {
    const formats = SAVE_PAGE_FILTERS.map((f) => savePageFormatForPath(`x.${f.extensions[0]}`));
    expect(new Set(formats).size).toBe(SAVE_PAGE_FILTERS.length);
  });
});

describe('sanitizeFileName', () => {
  it('quita caracteres no válidos en Windows y puntos finales', () => {
    expect(sanitizeFileName('a/b:c*d?  e.')).toBe('abcd e');
  });
});

describe('defaultSavePageName', () => {
  it('usa el título y, si no hay, el host', () => {
    expect(defaultSavePageName('Hola: mundo', 'https://example.com/')).toBe('Hola mundo.html');
    expect(defaultSavePageName('', 'https://example.com/x')).toBe('example.com.html');
    expect(defaultSavePageName(null, 'about:blank')).toBe('pagina.html');
  });
});
