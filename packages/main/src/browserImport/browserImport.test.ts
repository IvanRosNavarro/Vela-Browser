import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/createTestDb';
import { FavoritesRepository } from '../storage/repositories/FavoritesRepository';
import { HistoryRepository } from '../storage/repositories/HistoryRepository';
import {
  CHROMIUM_EPOCH_OFFSET_MS,
  chromiumTimeToUnixMs,
  parseChromiumBookmarks,
  parseChromiumLocalState,
  readChromiumHistory,
} from './chromium';
import {
  firefoxTimeToUnixMs,
  parseProfilesIni,
  readFirefoxBookmarks,
  readFirefoxHistory,
} from './firefox';
import {
  historyRetentionCutoff,
  importBookmarksIntoFavorites,
  importVisitsIntoHistory,
} from './apply';
import { browserLocations } from './paths';

// 2024-01-01T00:00:00Z
const JAN_2024_MS = Date.UTC(2024, 0, 1);

describe('conversión de fechas', () => {
  it('Chromium: microsegundos desde 1601 → ms Unix', () => {
    const micros = BigInt(JAN_2024_MS + CHROMIUM_EPOCH_OFFSET_MS) * 1000n;
    expect(chromiumTimeToUnixMs(micros)).toBe(JAN_2024_MS);
    expect(chromiumTimeToUnixMs(Number(micros))).toBe(JAN_2024_MS);
    expect(chromiumTimeToUnixMs(CHROMIUM_EPOCH_OFFSET_MS * 1000)).toBe(0);
  });

  it('Firefox: microsegundos Unix → ms Unix', () => {
    expect(firefoxTimeToUnixMs(JAN_2024_MS * 1000)).toBe(JAN_2024_MS);
    expect(firefoxTimeToUnixMs(BigInt(JAN_2024_MS) * 1000n + 999n)).toBe(JAN_2024_MS);
  });
});

describe('parseChromiumBookmarks', () => {
  const json = {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks bar',
        children: [
          { type: 'url', name: 'Vela', url: 'https://vela-browser.com/' },
          { type: 'url', name: 'Bookmarklet', url: 'javascript:alert(1)' },
          {
            type: 'folder',
            name: 'Trabajo',
            children: [
              { type: 'url', name: 'Docs', url: 'https://docs.example.com/' },
              { type: 'folder', name: '', children: [] },
            ],
          },
        ],
      },
      other: { type: 'folder', name: 'Other', children: [{ type: 'url', name: 'Otro', url: 'https://otro.example/' }] },
      synced: { type: 'folder', name: 'Mobile', children: [] },
    },
  };

  it('mantiene la jerarquía y renombra las raíces', () => {
    const roots = parseChromiumBookmarks(json);
    expect(roots.map((r) => r.title)).toEqual(['Barra de marcadores', 'Otros marcadores']);
    const bar = roots[0]!;
    expect(bar.children).toHaveLength(2);
    expect(bar.children[0]).toEqual({ kind: 'bookmark', title: 'Vela', url: 'https://vela-browser.com/' });
    const trabajo = bar.children[1]!;
    expect(trabajo.kind).toBe('folder');
    if (trabajo.kind === 'folder') {
      expect(trabajo.title).toBe('Trabajo');
      expect(trabajo.children[0]).toMatchObject({ kind: 'bookmark', url: 'https://docs.example.com/' });
      expect(trabajo.children[1]).toMatchObject({ kind: 'folder', title: 'Carpeta', children: [] });
    }
  });

  it('tolera JSON malformado', () => {
    expect(parseChromiumBookmarks(null)).toEqual([]);
    expect(parseChromiumBookmarks({ roots: 'x' })).toEqual([]);
    expect(parseChromiumBookmarks({ roots: { bookmark_bar: { children: 'nope' } } })).toEqual([]);
  });

  it('lee nombres y último perfil de Local State', () => {
    const state = {
      profile: {
        last_used: 'Profile 1',
        info_cache: { Default: { name: 'Persona 1' }, 'Profile 1': { name: 'Trabajo' }, 'Profile 2': {} },
      },
    };
    expect(parseChromiumLocalState(state)).toEqual({
      names: { Default: 'Persona 1', 'Profile 1': 'Trabajo', 'Profile 2': 'Profile 2' },
      lastUsed: 'Profile 1',
    });
    expect(parseChromiumLocalState(undefined)).toEqual({ names: {}, lastUsed: null });
  });
});

describe('readChromiumHistory', () => {
  function chromiumHistoryDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, hidden INTEGER DEFAULT 0);
      CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, transition INTEGER);
    `);
    return db;
  }

  it('convierte fechas en SQL y descarta subframes, ocultas y esquemas no web', () => {
    const db = chromiumHistoryDb();
    const t = (ms: number): bigint => BigInt(ms + CHROMIUM_EPOCH_OFFSET_MS) * 1000n;
    db.prepare('INSERT INTO urls VALUES (?, ?, ?, ?)').run(1, 'https://a.example/', 'A', 0);
    db.prepare('INSERT INTO urls VALUES (?, ?, ?, ?)').run(2, 'https://oculta.example/', 'Oculta', 1);
    db.prepare('INSERT INTO urls VALUES (?, ?, ?, ?)').run(3, 'chrome://settings/', 'Ajustes', 0);
    db.prepare('INSERT INTO visits VALUES (?, ?, ?, ?)').run(1, 1, t(JAN_2024_MS), 0x30000000 | 1);
    db.prepare('INSERT INTO visits VALUES (?, ?, ?, ?)').run(2, 1, t(JAN_2024_MS + 1000), 3); // AUTO_SUBFRAME
    db.prepare('INSERT INTO visits VALUES (?, ?, ?, ?)').run(3, 2, t(JAN_2024_MS + 2000), 0);
    db.prepare('INSERT INTO visits VALUES (?, ?, ?, ?)').run(4, 3, t(JAN_2024_MS + 3000), 0);
    db.prepare('INSERT INTO visits VALUES (?, ?, ?, ?)').run(5, 1, t(JAN_2024_MS - 10_000), 0);

    const visits = readChromiumHistory(db, { since: JAN_2024_MS - 5000, limit: 100 });
    expect(visits).toEqual([{ url: 'https://a.example/', title: 'A', visitedAt: JAN_2024_MS }]);
  });
});

describe('Firefox places.sqlite', () => {
  function placesDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT);
      CREATE TABLE moz_bookmarks (
        id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, parent INTEGER,
        position INTEGER, title TEXT, guid TEXT
      );
      CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER, visit_type INTEGER);
    `);
    const place = db.prepare('INSERT INTO moz_places VALUES (?, ?, ?)');
    place.run(1, 'https://mozilla.org/', 'Mozilla');
    place.run(2, 'https://mdn.example/', 'MDN');
    place.run(3, 'place:sort=8', 'Más visitados');
    place.run(4, 'https://etiqueta.example/', 'Etiquetado');
    const bm = db.prepare('INSERT INTO moz_bookmarks VALUES (?, ?, ?, ?, ?, ?, ?)');
    bm.run(1, 2, null, 0, 0, '', 'root________');
    bm.run(2, 2, null, 1, 0, 'menu', 'menu________');
    bm.run(3, 2, null, 1, 1, 'toolbar', 'toolbar_____');
    bm.run(4, 2, null, 1, 2, 'tags', 'tags________');
    bm.run(5, 2, null, 1, 3, 'unfiled', 'unfiled_____');
    bm.run(6, 2, null, 1, 4, 'mobile', 'mobile______');
    bm.run(10, 1, 1, 3, 0, 'Mozilla', 'aaaaaaaaaaaa');
    bm.run(11, 2, null, 3, 1, 'Dev', 'bbbbbbbbbbbb');
    bm.run(12, 1, 2, 11, 0, 'MDN', 'cccccccccccc');
    bm.run(13, 3, null, 3, 2, '', 'dddddddddddd'); // separador
    bm.run(14, 1, 3, 2, 0, 'Más visitados', 'eeeeeeeeeeee');
    bm.run(15, 2, null, 4, 0, 'etiqueta', 'ffffffffffff');
    bm.run(16, 1, 4, 15, 0, null, 'gggggggggggg');
    return db;
  }

  it('lee el árbol sin separadores, consultas place: ni etiquetas', () => {
    const roots = readFirefoxBookmarks(placesDb());
    expect(roots).toHaveLength(1);
    expect(roots[0]!.title).toBe('Barra de marcadores');
    expect(roots[0]!.children).toEqual([
      { kind: 'bookmark', title: 'Mozilla', url: 'https://mozilla.org/' },
      { kind: 'folder', title: 'Dev', children: [{ kind: 'bookmark', title: 'MDN', url: 'https://mdn.example/' }] },
    ]);
  });

  it('lee el historial en ms y descarta descargas y cargas embebidas', () => {
    const db = placesDb();
    const visit = db.prepare('INSERT INTO moz_historyvisits VALUES (?, ?, ?, ?)');
    visit.run(1, 1, JAN_2024_MS * 1000, 1);
    visit.run(2, 2, (JAN_2024_MS + 5000) * 1000, 7); // descarga
    visit.run(3, 2, (JAN_2024_MS + 6000) * 1000, 2);
    visit.run(4, 3, (JAN_2024_MS + 7000) * 1000, 1); // place:
    const visits = readFirefoxHistory(db, { since: 0, limit: 10 });
    expect(visits).toEqual([
      { url: 'https://mdn.example/', title: 'MDN', visitedAt: JAN_2024_MS + 6000 },
      { url: 'https://mozilla.org/', title: 'Mozilla', visitedAt: JAN_2024_MS },
    ]);
  });

  it('parsea profiles.ini y detecta el perfil por defecto', () => {
    const ini = [
      '[Install308046B0AF4A39CB]',
      'Default=Profiles/abcd.default-release',
      '',
      '[Profile1]',
      'Name=default',
      'IsRelative=1',
      'Path=Profiles/efgh.default',
      'Default=1',
      '',
      '[Profile0]',
      'Name=default-release',
      'IsRelative=1',
      'Path=Profiles/abcd.default-release',
      '',
      '[General]',
      'StartWithLastProfile=1',
    ].join('\r\n');
    expect(parseProfilesIni(ini)).toEqual([
      { name: 'default', path: 'Profiles/efgh.default', isRelative: true, isDefault: false },
      { name: 'default-release', path: 'Profiles/abcd.default-release', isRelative: true, isDefault: true },
    ]);
  });
});

describe('browserLocations', () => {
  it('construye las rutas de cada plataforma', () => {
    const win = browserLocations({
      platform: 'win32',
      home: 'C:\\Users\\ana',
      localAppData: 'C:\\Users\\ana\\AppData\\Local',
      appData: 'C:\\Users\\ana\\AppData\\Roaming',
    });
    expect(win.find((b) => b.id === 'chrome')!.dataDirs).toEqual(['C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\User Data']);
    expect(win.find((b) => b.id === 'firefox')!.dataDirs).toEqual(['C:\\Users\\ana\\AppData\\Roaming\\Mozilla\\Firefox']);
    expect(win.find((b) => b.id === 'opera')!.dataDirs).toEqual(['C:\\Users\\ana\\AppData\\Roaming\\Opera Software\\Opera Stable']);

    const mac = browserLocations({ platform: 'darwin', home: '/Users/ana' });
    expect(mac.find((b) => b.id === 'edge')!.dataDirs).toEqual(['/Users/ana/Library/Application Support/Microsoft Edge']);

    const linux = browserLocations({ platform: 'linux', home: '/home/ana' });
    expect(linux.find((b) => b.id === 'brave')!.dataDirs).toEqual(['/home/ana/.config/BraveSoftware/Brave-Browser']);
    expect(linux.find((b) => b.id === 'firefox')!.dataDirs).toContain('/home/ana/snap/firefox/common/.mozilla/firefox');
    expect(linux.some((b) => b.id === 'opera-gx')).toBe(false);
  });
});

describe('importBookmarksIntoFavorites', () => {
  const roots = parseChromiumBookmarks({
    roots: {
      bookmark_bar: {
        children: [
          { type: 'url', name: 'Vela', url: 'https://vela-browser.com/' },
          { type: 'folder', name: 'Trabajo', children: [{ type: 'url', name: 'Docs', url: 'https://docs.example.com/' }] },
          { type: 'folder', name: 'Vacía', children: [] },
        ],
      },
    },
  });

  it('crea la carpeta raíz con la jerarquía y no duplica al reimportar', () => {
    const db = createTestDb('profile');
    const repo = new FavoritesRepository(db);
    let n = 0;
    const newId = (): string => `id-${++n}`;

    const first = repo.runBatch(() => importBookmarksIntoFavorites(repo, 'Importado de Chrome', roots, newId));
    expect(first.result).toEqual({ added: 2, skipped: 0 });

    const all = repo.list();
    const root = all.find((f) => f.title === 'Importado de Chrome')!;
    expect(root.type).toBe('folder');
    expect(root.parentId).toBeNull();
    const bar = all.find((f) => f.title === 'Barra de marcadores')!;
    expect(bar.parentId).toBe(root.id);
    const trabajo = all.find((f) => f.title === 'Trabajo')!;
    expect(trabajo.parentId).toBe(bar.id);
    expect(all.find((f) => f.url === 'https://docs.example.com/')!.parentId).toBe(trabajo.id);
    // Las carpetas sin marcadores nuevos no se crean.
    expect(all.some((f) => f.title === 'Vacía')).toBe(false);

    const second = repo.runBatch(() => importBookmarksIntoFavorites(repo, 'Importado de Chrome', roots, newId));
    expect(second.result).toEqual({ added: 0, skipped: 2 });
    expect(repo.list()).toHaveLength(all.length);
  });

  it('salta los marcadores que ya están en Favoritos', () => {
    const db = createTestDb('profile');
    const repo = new FavoritesRepository(db);
    repo.add({ id: 'x', url: 'https://vela-browser.com/', title: 'Ya estaba', position: 'a0' });
    const { result } = repo.runBatch(() => importBookmarksIntoFavorites(repo, 'Importado de Edge', roots));
    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(repo.getByUrl('https://vela-browser.com/')!.title).toBe('Ya estaba');
  });
});

describe('importVisitsIntoHistory', () => {
  it('respeta la retención y no duplica visitas', () => {
    const db = createTestDb('profile');
    const history = new HistoryRepository(db);
    const now = Date.now();
    const cutoff = historyRetentionCutoff('week', now);
    expect(cutoff).toBe(now - 7 * 24 * 60 * 60 * 1000);
    expect(historyRetentionCutoff('forever', now)).toBe(0);
    expect(historyRetentionCutoff(null, now)).toBe(0);

    history.insert({
      id: 'propia', url: 'https://b.example/', title: 'B', favicon: null,
      visitedAt: now - 2000, workspaceId: 'default', sessionId: 's',
    });
    const visits = [
      { url: 'https://a.example/', title: 'A', visitedAt: now - 1000 },
      { url: 'https://b.example/', title: 'B', visitedAt: now - 2000 }, // ya estaba
      { url: 'https://vieja.example/', title: 'Vieja', visitedAt: now - 30 * 24 * 60 * 60 * 1000 },
    ];
    const opts = { workspaceId: 'default', sessionId: 'imp', cutoff };
    expect(importVisitsIntoHistory(history, visits, opts)).toEqual({ added: 1, skipped: 2 });
    expect(importVisitsIntoHistory(history, visits, opts)).toEqual({ added: 0, skipped: 3 });
    expect(history.getRecent(10).map((e) => e.url)).toEqual(['https://a.example/', 'https://b.example/']);
  });
});
