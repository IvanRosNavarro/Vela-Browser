import { describe, expect, it } from 'vitest';
import {
  ZOOM_FACTORS,
  isDefaultZoom,
  nextZoomFactor,
  normalizeZoomFactor,
  parseZoomMap,
  previousZoomFactor,
  stepZoomFactor,
  withZoomEntry,
  zoomKeyForUrl,
  zoomPercent,
} from './zoomLevels';

describe('escalones de zoom', () => {
  it('coinciden con los de Chrome', () => {
    expect(ZOOM_FACTORS.map(zoomPercent)).toEqual([
      25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500,
    ]);
  });

  it('avanza y retrocede un escalón desde 100 %', () => {
    expect(nextZoomFactor(1)).toBe(1.1);
    expect(previousZoomFactor(1)).toBe(0.9);
  });

  it('recorre la escala entera sin saltarse escalones', () => {
    let f = ZOOM_FACTORS[0]!;
    const up: number[] = [f];
    while (f < 5) {
      f = nextZoomFactor(f);
      up.push(f);
    }
    expect(up).toEqual([...ZOOM_FACTORS]);

    const down: number[] = [f];
    while (f > 0.25) {
      f = previousZoomFactor(f);
      down.push(f);
    }
    expect(down).toEqual([...ZOOM_FACTORS].reverse());
  });

  it('se queda en los extremos', () => {
    expect(nextZoomFactor(5)).toBe(5);
    expect(previousZoomFactor(0.25)).toBe(0.25);
  });

  it('desde un factor fuera de escala salta al escalón más cercano en esa dirección', () => {
    expect(nextZoomFactor(1.3)).toBe(1.5);
    expect(previousZoomFactor(1.3)).toBe(1.25);
    // Chromium devuelve el factor con ruido de coma flotante (log/pow).
    expect(nextZoomFactor(1.2500000001)).toBe(1.5);
    expect(previousZoomFactor(0.3333333)).toBe(0.25);
    expect(nextZoomFactor(0.6666667)).toBe(0.75);
  });

  it('stepZoomFactor elige por dirección', () => {
    expect(stepZoomFactor(1.25, 'in')).toBe(1.5);
    expect(stepZoomFactor(1.25, 'out')).toBe(1.1);
  });
});

describe('normalizeZoomFactor', () => {
  it('acota al rango y redondea a centésimas', () => {
    expect(normalizeZoomFactor(10)).toBe(5);
    expect(normalizeZoomFactor(0.1)).toBe(0.25);
    expect(normalizeZoomFactor(1.23456)).toBe(1.23);
  });

  it('valores inválidos vuelven a 100 %', () => {
    expect(normalizeZoomFactor(Number.NaN)).toBe(1);
    expect(normalizeZoomFactor(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalizeZoomFactor(0)).toBe(1);
    expect(normalizeZoomFactor(-2)).toBe(1);
  });

  it('isDefaultZoom tolera el ruido de Chromium', () => {
    expect(isDefaultZoom(1)).toBe(true);
    expect(isDefaultZoom(0.9999999)).toBe(true);
    expect(isDefaultZoom(1.1)).toBe(false);
  });
});

describe('zoomKeyForUrl', () => {
  it('usa el hostname de http/https, sin puerto ni ruta', () => {
    expect(zoomKeyForUrl('https://example.com/a/b?c=1#d')).toBe('example.com');
    expect(zoomKeyForUrl('http://localhost:5173/x')).toBe('localhost');
    expect(zoomKeyForUrl('https://Sub.Example.COM/')).toBe('sub.example.com');
  });

  it('no fusiona www con el dominio desnudo (igual que Chromium)', () => {
    expect(zoomKeyForUrl('https://www.example.com/')).toBe('www.example.com');
  });

  it('quita el punto final de un FQDN', () => {
    expect(zoomKeyForUrl('https://example.com./')).toBe('example.com');
  });

  it('páginas internas por página', () => {
    expect(zoomKeyForUrl('vela://settings#appearance')).toBe('vela://settings');
    expect(zoomKeyForUrl('vela://newtab')).toBe('vela://newtab');
  });

  it('otros esquemas y URLs inválidas no se recuerdan', () => {
    expect(zoomKeyForUrl('file:///C:/x.html')).toBeNull();
    expect(zoomKeyForUrl('about:blank')).toBeNull();
    expect(zoomKeyForUrl('data:text/html,hola')).toBeNull();
    expect(zoomKeyForUrl('chrome-extension://abc/popup.html')).toBeNull();
    expect(zoomKeyForUrl('')).toBeNull();
    expect(zoomKeyForUrl('no es una url')).toBeNull();
  });
});

describe('mapa de zoom por sitio', () => {
  it('parsea y descarta entradas corruptas o al 100 %', () => {
    const raw = JSON.stringify({
      'a.com': 1.25,
      'b.com': 'x',
      'c.com': 1,
      'd.com': -1,
      'e.com': 99,
    });
    expect(parseZoomMap(raw)).toEqual({ 'a.com': 1.25, 'e.com': 5 });
  });

  it('JSON inválido o con otra forma → mapa vacío', () => {
    expect(parseZoomMap(null)).toEqual({});
    expect(parseZoomMap('{')).toEqual({});
    expect(parseZoomMap('[1,2]')).toEqual({});
    expect(parseZoomMap('3')).toEqual({});
  });

  it('100 % borra la entrada y no muta el original', () => {
    const map = { 'a.com': 1.5 };
    const next = withZoomEntry(map, 'a.com', 1);
    expect(next).toEqual({});
    expect(map).toEqual({ 'a.com': 1.5 });
    expect(withZoomEntry(next, 'b.com', 0.9)).toEqual({ 'b.com': 0.9 });
  });
});
