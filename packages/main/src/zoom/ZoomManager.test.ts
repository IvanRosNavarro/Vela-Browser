import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { describe, expect, it } from 'vitest';
import type { TabZoomState } from '@vela/shared';
import { ZoomManager, ZOOM_PER_SITE_KEY } from './ZoomManager';

/** Imita el HostZoomMap de una sesión de Chromium: zoom por host compartido. */
class FakeSession {
  readonly levels = new Map<string, number>();
}

class FakeContents extends EventEmitter {
  destroyed = false;
  constructor(public url: string, private readonly session: FakeSession) {
    super();
  }
  private host(): string {
    try {
      return new URL(this.url).host || this.url;
    } catch {
      return this.url;
    }
  }
  getURL(): string { return this.url; }
  getZoomFactor(): number { return this.session.levels.get(this.host()) ?? 1; }
  setZoomFactor(f: number): void { this.session.levels.set(this.host(), f); }
  isDestroyed(): boolean { return this.destroyed; }
  navigate(url: string): void {
    this.url = url;
    this.emit('did-navigate', {}, url);
  }
}

function setup(opts: { secure?: string[] } = {}) {
  const store = new Map<string, string>();
  const settings = {
    get: (k: string) => store.get(k) ?? null,
    set: (k: string, v: string) => { store.set(k, v); },
  };
  const emitted: TabZoomState[] = [];
  const secure = new Set(opts.secure ?? []);
  const manager = new ZoomManager({
    getSettings: () => settings,
    isSecureTab: (id) => secure.has(id),
    emit: (s) => emitted.push(s),
    logger: { warn: () => {} },
  });
  const stored = (): Record<string, number> =>
    JSON.parse(store.get(ZOOM_PER_SITE_KEY) ?? '{}') as Record<string, number>;
  return { manager, store, emitted, stored };
}

function attach(manager: ZoomManager, tabId: string, wc: FakeContents, profileId = 'p1'): void {
  manager.attach(tabId, wc as unknown as WebContents, profileId);
}

describe('ZoomManager', () => {
  it('Ctrl+rueda sube un escalón, lo recuerda por host y avisa', () => {
    const { manager, emitted, stored } = setup();
    const wc = new FakeContents('https://example.com/a', new FakeSession());
    attach(manager, 't1', wc);

    wc.emit('zoom-changed', {}, 'in');

    expect(wc.getZoomFactor()).toBe(1.1);
    expect(stored()).toEqual({ 'example.com': 1.1 });
    expect(emitted.at(-1)).toEqual({ tabId: 't1', factor: 1.1 });
  });

  it('restablecer borra la entrada del perfil', () => {
    const { manager, stored } = setup();
    const wc = new FakeContents('https://example.com/', new FakeSession());
    attach(manager, 't1', wc);
    manager.step('t1', 'out');
    expect(stored()).toEqual({ 'example.com': 0.9 });

    expect(manager.reset('t1')).toEqual({ tabId: 't1', factor: 1 });
    expect(stored()).toEqual({});
  });

  it('avisa de todas las pestañas del mismo host (split view)', () => {
    const { manager, emitted } = setup();
    const session = new FakeSession();
    const a = new FakeContents('https://example.com/a', session);
    const b = new FakeContents('https://example.com/b', session);
    const c = new FakeContents('https://other.org/', session);
    attach(manager, 'a', a);
    attach(manager, 'b', b);
    attach(manager, 'c', c);

    manager.step('a', 'in');

    expect(emitted).toEqual([
      { tabId: 'a', factor: 1.1 },
      { tabId: 'b', factor: 1.1 },
    ]);
    expect(c.getZoomFactor()).toBe(1);
  });

  it('reaplica el zoom guardado al navegar a ese host', () => {
    const { manager, store, emitted } = setup();
    store.set(ZOOM_PER_SITE_KEY, JSON.stringify({ 'example.com': 1.5 }));
    const wc = new FakeContents('about:blank', new FakeSession());
    attach(manager, 't1', wc);

    wc.navigate('https://example.com/');
    expect(wc.getZoomFactor()).toBe(1.5);
    expect(emitted.at(-1)).toEqual({ tabId: 't1', factor: 1.5 });

    wc.navigate('https://other.org/');
    expect(wc.getZoomFactor()).toBe(1);
    expect(emitted.at(-1)).toEqual({ tabId: 't1', factor: 1 });
  });

  it('las pestañas fantasma heredan el zoom pero no lo escriben', () => {
    const { manager, store, stored } = setup({ secure: ['s1'] });
    store.set(ZOOM_PER_SITE_KEY, JSON.stringify({ 'example.com': 1.25 }));
    const wc = new FakeContents('about:blank', new FakeSession());
    attach(manager, 's1', wc);

    wc.navigate('https://example.com/');
    expect(wc.getZoomFactor()).toBe(1.25);

    manager.step('s1', 'in');
    expect(wc.getZoomFactor()).toBe(1.5);
    expect(stored()).toEqual({ 'example.com': 1.25 });

    // Su propio zoom sobrevive a navegar dentro del mismo host.
    wc.navigate('https://example.com/otra');
    expect(wc.getZoomFactor()).toBe(1.5);
  });

  it('no recuerda esquemas sin host (file:, about:)', () => {
    const { manager, store } = setup();
    const wc = new FakeContents('file:///C:/doc.html', new FakeSession());
    attach(manager, 't1', wc);
    manager.step('t1', 'in');
    expect(wc.getZoomFactor()).toBe(1.1);
    expect(store.has(ZOOM_PER_SITE_KEY)).toBe(false);
  });

  it('pestaña sin WebContents vivo → 100 % y sin efectos', () => {
    const { manager, emitted } = setup();
    const wc = new FakeContents('https://example.com/', new FakeSession());
    attach(manager, 't1', wc);
    wc.destroyed = true;
    wc.emit('destroyed');

    expect(manager.getZoom('t1')).toBe(1);
    expect(manager.step('t1', 'in')).toEqual({ tabId: 't1', factor: 1 });
    expect(manager.getProfileForTab('t1')).toBeNull();
    expect(emitted).toEqual([]);
  });
});
