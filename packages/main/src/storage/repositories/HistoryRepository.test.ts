import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '../../test/createTestDb';
import { HistoryRepository } from './HistoryRepository';

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);
const DAY = 86_400_000;

describe('HistoryRepository.autocomplete', () => {
  let db: DatabaseSync;
  let history: HistoryRepository;
  let seq = 0;

  const visit = (url: string, daysAgo = 0, times = 1): void => {
    for (let i = 0; i < times; i++) {
      seq += 1;
      history.insert({
        id: `h${seq}`,
        url,
        title: '',
        favicon: null,
        visitedAt: NOW - daysAgo * DAY - i,
        workspaceId: 'ws',
        sessionId: 's',
      });
    }
  };

  const complete = (prefix: string, extra?: { url: string; score: number }[]) =>
    history.autocomplete(prefix, { now: NOW, extra });

  beforeEach(() => {
    db = createTestDb('profile');
    history = new HistoryRepository(db);
    seq = 0;
  });

  it('completa hasta el host sin esquema ni www aunque solo se visitaran rutas', () => {
    visit('https://www.github.com/IvanRosNavarro/Vela-Kit');
    expect(complete('gi')).toEqual({
      text: 'github.com/',
      url: 'https://www.github.com/',
    });
  });

  it('respeta el www. cuando el usuario lo escribe', () => {
    visit('https://www.github.com/');
    expect(complete('www.gi')).toEqual({
      text: 'www.github.com/',
      url: 'https://www.github.com/',
    });
  });

  it('respeta el esquema cuando el usuario lo escribe', () => {
    visit('https://github.com/');
    expect(complete('https://gi')).toEqual({
      text: 'https://github.com/',
      url: 'https://github.com/',
    });
    expect(complete('http://gi')).toBeNull();
  });

  it('elige el host con más frecencia sumando todas sus URLs', () => {
    visit('https://gitlab.com/a', 0, 2);
    visit('https://github.com/a', 0, 1);
    visit('https://github.com/b', 0, 2);
    expect(complete('git')?.url).toBe('https://github.com/');
  });

  it('las visitas recientes pesan más que las antiguas', () => {
    visit('https://gitlab.com/', 200, 5); // 5 × 10 = 50
    visit('https://github.com/', 1, 1); // 1 × 100 = 100
    expect(complete('git')?.url).toBe('https://github.com/');
  });

  it('si lo escrito incluye ruta, completa hasta la URL más visitada', () => {
    visit('https://github.com/IvanRosNavarro/Vela-Kit', 0, 1);
    visit('https://github.com/IvanRosNavarro/Vela-Browser', 0, 3);
    expect(complete('github.com/iv')).toEqual({
      text: 'github.com/IvanRosNavarro/Vela-Browser',
      url: 'https://github.com/IvanRosNavarro/Vela-Browser',
    });
  });

  it('no distingue mayúsculas en lo escrito', () => {
    visit('https://github.com/');
    expect(complete('GI')?.text).toBe('github.com/');
  });

  it('trata % y _ como caracteres literales', () => {
    visit('https://example.com/a_b');
    visit('https://example.com/axb', 0, 5);
    expect(complete('example.com/a_')?.url).toBe('https://example.com/a_b');
    expect(complete('example.com/a%')).toBeNull();
  });

  it('devuelve null sin coincidencias, con espacios o vacío', () => {
    visit('https://github.com/');
    expect(complete('zz')).toBeNull();
    expect(complete('git hub')).toBeNull();
    expect(complete('   ')).toBeNull();
    expect(complete('https://')).toBeNull();
  });

  it('ignora URLs que no son http(s)', () => {
    visit('file:///C:/github.txt');
    expect(complete('file')).toBeNull();
  });

  it('suma candidatos extra (favoritos, pestañas) a la frecencia', () => {
    visit('https://gitlab.com/', 0, 2);
    expect(complete('git')?.url).toBe('https://gitlab.com/');
    expect(
      complete('git', [{ url: 'https://github.com/x', score: 500 }])?.url,
    ).toBe('https://github.com/');
    // Un candidato extra que no casa con lo escrito no cuenta.
    expect(
      complete('git', [{ url: 'https://example.com/', score: 500 }])?.url,
    ).toBe('https://gitlab.com/');
  });

  it('la búsqueda por prefijo recorre el índice de url por rango', () => {
    const plan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT url FROM history
         WHERE url >= ? AND url < ? AND url LIKE ? ESCAPE '\\'
         GROUP BY url`,
      )
      .all('https://gi', 'https://gi￿', 'https://gi%') as Array<{ detail: string }>;
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/idx_history_url.*url>\? AND url<\?/);
  });

  it('conserva el puerto del origen', () => {
    visit('http://localhost:5173/index.html');
    expect(complete('localhost:5')).toEqual({
      text: 'localhost:5173/',
      url: 'http://localhost:5173/',
    });
  });
});
