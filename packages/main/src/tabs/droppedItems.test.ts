import { describe, expect, it } from 'vitest';
import { isViewableFile, parseDroppedUrl, planDrop } from './droppedItems';
import type { SearchSettings } from '@vela/shared';

const SEARCH: SearchSettings = { engine: 'duckduckgo', customUrl: null };

describe('parseDroppedUrl', () => {
  it('acepta http y https', () => {
    expect(parseDroppedUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(parseDroppedUrl('  http://example.com  ')).toBe('http://example.com/');
  });

  it('completa un dominio suelto', () => {
    expect(parseDroppedUrl('example.com')).toBe('https://example.com');
    expect(parseDroppedUrl('sub.example.com/ruta')).toBe('https://sub.example.com/ruta');
  });

  it('rechaza esquemas que podrían ejecutar algo', () => {
    // Soltar texto no debe poder ejecutar código ni colar un blob.
    expect(parseDroppedUrl('javascript:alert(1)')).toBeNull();
    expect(parseDroppedUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(parseDroppedUrl('blob:https://example.com/x')).toBeNull();
  });

  it('no convierte una frase en navegación', () => {
    expect(parseDroppedUrl('esto es una frase')).toBeNull();
    expect(parseDroppedUrl('amon amarth gjallarhorn')).toBeNull();
    expect(parseDroppedUrl('')).toBeNull();
  });
});

describe('isViewableFile', () => {
  it('reconoce lo que Chromium pinta', () => {
    for (const f of ['a.pdf', 'b.PNG', 'c.txt', 'd.mp4', 'e.svg', 'f.json']) {
      expect(isViewableFile(f)).toBe(true);
    }
  });

  it('deja fuera lo que acabaría en descarga', () => {
    for (const f of ['a.docx', 'b.zip', 'c.exe', 'd.psd', 'sin-extension']) {
      expect(isViewableFile(f)).toBe(false);
    }
  });
});

describe('planDrop', () => {
  it('un enlace abre una pestaña', () => {
    const acciones = planDrop([{ kind: 'url', value: 'https://example.com' }], SEARCH);
    expect(acciones).toEqual([
      { kind: 'tab', url: 'https://example.com/', label: 'example.com' },
    ]);
  });

  it('un fichero que se puede ver se abre como file://', () => {
    const [accion] = planDrop([{ kind: 'file', value: 'C:\\tmp\\informe.pdf' }], SEARCH);
    expect(accion?.kind).toBe('tab');
    expect(accion?.kind === 'tab' && accion.url.startsWith('file:///')).toBe(true);
    expect(accion?.kind === 'tab' && accion.url.endsWith('informe.pdf')).toBe(true);
  });

  it('un fichero que no se puede ver se deja al sistema', () => {
    const acciones = planDrop([{ kind: 'file', value: 'C:\\tmp\\contrato.docx' }], SEARCH);
    expect(acciones).toEqual([
      { kind: 'system', filePath: 'C:\\tmp\\contrato.docx', label: 'contrato.docx' },
    ]);
  });

  it('el texto que no es URL se busca', () => {
    const [accion] = planDrop([{ kind: 'text', value: 'amon amarth' }], SEARCH);
    expect(accion?.kind === 'tab' && accion.url).toContain('duckduckgo');
    expect(accion?.kind === 'tab' && accion.url).toContain('amon%20amarth');
  });

  it('el texto que sí es URL se navega, no se busca', () => {
    const [accion] = planDrop([{ kind: 'text', value: 'https://example.com/x' }], SEARCH);
    expect(accion).toEqual({ kind: 'tab', url: 'https://example.com/x', label: 'example.com/x' });
  });

  it('no abre dos veces lo mismo', () => {
    const acciones = planDrop(
      [
        { kind: 'url', value: 'https://example.com/a' },
        { kind: 'url', value: 'https://example.com/a' },
        { kind: 'file', value: '/tmp/x.pdf' },
        { kind: 'file', value: '/tmp/x.pdf' },
      ],
      SEARCH,
    );
    expect(acciones).toHaveLength(2);
  });

  it('mantiene el orden y mezcla tipos', () => {
    const acciones = planDrop(
      [
        { kind: 'url', value: 'https://a.com' },
        { kind: 'file', value: '/tmp/b.zip' },
        { kind: 'file', value: '/tmp/c.png' },
      ],
      SEARCH,
    );
    expect(acciones.map((a) => a.kind)).toEqual(['tab', 'system', 'tab']);
  });

  it('descarta lo que no sabe abrir sin romper el resto', () => {
    const acciones = planDrop(
      [
        { kind: 'url', value: 'javascript:alert(1)' },
        { kind: 'url', value: 'https://bueno.example' },
      ],
      SEARCH,
    );
    expect(acciones).toEqual([
      { kind: 'tab', url: 'https://bueno.example/', label: 'bueno.example' },
    ]);
  });
});
