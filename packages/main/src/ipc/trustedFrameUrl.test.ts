import { describe, expect, it } from 'vitest';
import { isTrustedFrameUrl } from './trustedFrameUrl';

const DEV = 'http://localhost:5173';

describe('isTrustedFrameUrl', () => {
  it('acepta páginas internas y el renderer empaquetado', () => {
    expect(isTrustedFrameUrl('vela://settings', null)).toBe(true);
    expect(isTrustedFrameUrl('file:///C:/Vela/resources/app.asar/index.html', null)).toBe(true);
  });

  it('acepta el dev server solo con su origen exacto', () => {
    expect(isTrustedFrameUrl('http://localhost:5173/?page=settings', DEV)).toBe(true);
    expect(isTrustedFrameUrl('http://localhost.evil.com:5173/', DEV)).toBe(false);
    expect(isTrustedFrameUrl('http://localhost:8080/', DEV)).toBe(false);
    expect(isTrustedFrameUrl('http://localhost/', DEV)).toBe(false);
  });

  it('en producción no confía en localhost', () => {
    expect(isTrustedFrameUrl('http://localhost:5173/', null)).toBe(false);
  });

  it('rechaza webs y URLs vacías o inválidas', () => {
    expect(isTrustedFrameUrl('https://example.com', DEV)).toBe(false);
    expect(isTrustedFrameUrl('', DEV)).toBe(false);
    expect(isTrustedFrameUrl('no es una url', DEV)).toBe(false);
  });
});
