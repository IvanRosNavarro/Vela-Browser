import path from 'node:path';
import fs from 'node:fs';
import {
  BrowserWindow,
  app,
  ipcMain,
  screen,
  clipboard,
  dialog,
  type WebContents,
} from 'electron';
import { generateKeyBetween } from 'fractional-indexing';
import type { IpcContext } from '../ipc/context';
import type { ContextMenuShowPayload } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';

const MENU_WIDTH = 272;

const CTXMENU_PRELOAD_PATH = path.join(
  __dirname,
  '../../preload/dist/ctxMenu.js',
);

// ─── HTML del popup ───────────────────────────────────────────────────────────

function getMenuHtml(): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;overflow:hidden;background:transparent}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  -webkit-user-select:none;user-select:none;
}
.menu{
  background:#1c1f25;
  border:1px solid rgba(255,255,255,0.09);
  border-radius:10px;
  box-shadow:0 8px 40px rgba(0,0,0,0.65),0 2px 8px rgba(0,0,0,0.35);
  overflow:hidden;
}
.nav-row{
  display:flex;gap:2px;padding:6px;align-items:center;
  border-bottom:1px solid rgba(255,255,255,0.08);
}
.nav-btn{
  width:36px;height:36px;border:none;border-radius:6px;
  background:transparent;color:#e6e8ee;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:background 80ms;padding:0;
}
.nav-btn:hover:not(:disabled){background:rgba(255,255,255,0.07)}
.nav-btn:active:not(:disabled){background:rgba(255,255,255,0.13)}
.nav-btn:disabled{opacity:.3;cursor:not-allowed}
.nav-btn svg{display:block;flex-shrink:0}
.nav-vsep{width:1px;background:rgba(255,255,255,0.1);height:20px;flex-shrink:0;margin:0 2px}
.ctx-btn{
  flex:1;height:36px;border:none;border-radius:6px;
  background:transparent;color:#e6e8ee;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;transition:background 80ms;padding:0;
}
.ctx-btn:hover{background:rgba(255,255,255,0.07)}
.ctx-btn:active{background:rgba(255,255,255,0.13)}
.ctx-btn svg{display:block;flex-shrink:0}
.items{padding:4px}
.item{
  width:100%;padding:5px 12px;border:none;border-radius:6px;
  background:transparent;color:#e6e8ee;font-size:13px;
  text-align:left;cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  line-height:1.4;white-space:nowrap;
  transition:background 80ms;
}
.item:hover:not(:disabled){background:rgba(255,255,255,0.07)}
.item:disabled{opacity:.45;cursor:not-allowed;color:#8c93a3}
.item-label{overflow:hidden;text-overflow:ellipsis;min-width:0}
.item-kbd{color:#8c93a3;font-size:11px;flex-shrink:0;letter-spacing:0.02em}
.sep{height:1px;background:rgba(255,255,255,0.08);margin:2px 8px}
.expand-btn{
  width:100%;padding:5px 12px;border:none;border-radius:6px;
  background:transparent;color:#e6e8ee;font-size:13px;
  text-align:left;cursor:pointer;
  display:flex;align-items:center;justify-content:space-between;
  transition:background 80ms;
}
.expand-btn:hover{background:rgba(255,255,255,0.07)}
.expand-arrow{color:#8c93a3;font-size:10px;flex-shrink:0;margin-left:8px}
.expand-content{padding-left:12px;display:none}
.expand-content.open{display:block}
</style>
</head>
<body>
<div class="menu" id="menu">
  <div class="nav-row" id="navRow"></div>
  <div class="items" id="items"></div>
</div>
<script>
/* eslint-disable */
const SVG_BACK   = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>';
const SVG_FWD    = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 5 7 7-7 7"/><path d="M5 12h14"/></svg>';
const SVG_RELOAD = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>';

const SVG_EXTLINK= '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const SVG_IMAGE  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
const SVG_COPY2  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const SVG_SAVE   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const SVG_LINKCP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
const SVG_TEXT   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4,7 4,4 20,4 20,7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>';
const SVG_NOTE   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
const SVG_SEARCH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';
const SVG_CAMERA = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
const SVG_STAR   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>';
const SVG_SOURCE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>';

function send(action) { window.velaCtx.send('ctx:action', action); }
function close()      { window.velaCtx.send('ctx:close'); }

function resize() {
  const h = document.getElementById('menu').getBoundingClientRect().height;
  window.velaCtx.send('ctx:resize', { height: Math.ceil(h) + 2 });
}

function navBtn(svg, enabled, action) {
  const btn = document.createElement('button');
  btn.className = 'nav-btn';
  btn.innerHTML = svg;
  btn.disabled = !enabled;
  if (enabled) btn.addEventListener('click', () => send(action));
  return btn;
}

function vSep() {
  const d = document.createElement('div');
  d.className = 'nav-vsep';
  return d;
}

function ctxIcon(svg, title, action) {
  const btn = document.createElement('button');
  btn.className = 'ctx-btn';
  btn.title = title;
  btn.innerHTML = svg;
  btn.addEventListener('click', () => send(action));
  return btn;
}

const MOD = navigator.platform.startsWith('Mac') ? '\\u2318' : 'Ctrl';

function item(label, disabled, action, shortcut) {
  const btn = document.createElement('button');
  btn.className = 'item';
  btn.disabled = !!disabled;
  const spanLabel = document.createElement('span');
  spanLabel.className = 'item-label';
  spanLabel.textContent = label;
  btn.appendChild(spanLabel);
  if (shortcut) {
    const spanKbd = document.createElement('span');
    spanKbd.className = 'item-kbd';
    spanKbd.textContent = shortcut.replace('Ctrl', MOD);
    btn.appendChild(spanKbd);
  }
  if (!disabled && action) btn.addEventListener('click', () => send(action));
  return btn;
}

function sep() {
  const d = document.createElement('div');
  d.className = 'sep';
  return d;
}

function expandItem(label, children) {
  const wrap = document.createElement('div');
  let open = false;
  const btn = document.createElement('button');
  btn.className = 'expand-btn';
  const spanLabel = document.createElement('span');
  spanLabel.textContent = label;
  const spanArrow = document.createElement('span');
  spanArrow.className = 'expand-arrow';
  spanArrow.textContent = '\\u25be';
  btn.appendChild(spanLabel);
  btn.appendChild(spanArrow);
  const content = document.createElement('div');
  content.className = 'expand-content';
  children.forEach(c => content.appendChild(c));
  btn.addEventListener('click', () => {
    open = !open;
    spanArrow.textContent = open ? '\\u25b4' : '\\u25be';
    content.className = 'expand-content' + (open ? ' open' : '');
    resize();
  });
  wrap.appendChild(btn);
  wrap.appendChild(content);
  return wrap;
}

function trunc(text, n) {
  return text.length > n ? text.slice(0, n) + '\\u2026' : text;
}

function render(p) {
  const navRow = document.getElementById('navRow');
  const itemsEl = document.getElementById('items');
  navRow.innerHTML = '';
  itemsEl.innerHTML = '';

  navRow.appendChild(navBtn(SVG_BACK,   p.canGoBack,    { type: 'nav:back' }));
  navRow.appendChild(navBtn(SVG_FWD,    p.canGoForward, { type: 'nav:forward' }));
  navRow.appendChild(navBtn(SVG_RELOAD, true,           { type: 'nav:reload' }));

  // Iconos contextuales en la misma fila, separados por un divisor vertical
  if (p.link && p.image) {
    navRow.appendChild(vSep());
    navRow.appendChild(ctxIcon(SVG_EXTLINK, 'Abrir enlace',  { type: 'link:new-tab', url: p.link.url, activate: true }));
    navRow.appendChild(ctxIcon(SVG_IMAGE,   'Abrir imagen',  { type: 'link:new-tab', url: p.image.url, activate: true }));
    navRow.appendChild(ctxIcon(SVG_COPY2,   'Copiar imagen', { type: 'image:copy', wcvX: p.wcvX, wcvY: p.wcvY }));
  } else if (p.link) {
    navRow.appendChild(vSep());
    navRow.appendChild(ctxIcon(SVG_EXTLINK, 'Abrir', { type: 'link:new-tab', url: p.link.url, activate: true }));
    navRow.appendChild(ctxIcon(SVG_LINKCP,  'Copiar URL', { type: 'copy', text: p.link.url }));
    navRow.appendChild(ctxIcon(p.link.text ? SVG_TEXT : SVG_COPY2,
                               p.link.text ? 'Copiar texto' : 'Copiar URL',
                               { type: 'copy', text: p.link.text || p.link.url }));
  } else if (p.image) {
    navRow.appendChild(vSep());
    navRow.appendChild(ctxIcon(SVG_EXTLINK, 'Abrir',   { type: 'link:new-tab', url: p.image.url, activate: true }));
    navRow.appendChild(ctxIcon(SVG_COPY2,   'Copiar',  { type: 'image:copy', wcvX: p.wcvX, wcvY: p.wcvY }));
    navRow.appendChild(ctxIcon(SVG_SAVE,    'Guardar', { type: 'image:save', url: p.image.url }));
  } else if (p.selection) {
    navRow.appendChild(vSep());
    navRow.appendChild(ctxIcon(SVG_COPY2,  'Copiar', { type: 'edit:copy' }));
    navRow.appendChild(ctxIcon(SVG_NOTE,   'Nota',   { type: 'notes:append', text: p.selection.text }));
    navRow.appendChild(ctxIcon(SVG_SEARCH, 'Buscar', { type: 'selection:search', url: p.selection.searchUrl }));
  } else if (!p.isEditable) {
    navRow.appendChild(vSep());
    navRow.appendChild(ctxIcon(SVG_CAMERA, 'Captura',    { type: 'page:screenshot' }));
    navRow.appendChild(ctxIcon(SVG_STAR,   'Favorito',   { type: 'favorites:add-current', url: p.currentUrl, title: p.currentTitle }));
    navRow.appendChild(ctxIcon(SVG_SOURCE, 'Ver código', { type: 'page:view-source', url: p.currentUrl }));
  }

  const add = [];

  if (p.link) {
    add.push(item('Abrir enlace en nueva pesta\\u00f1a',        false, { type: 'link:new-tab', url: p.link.url, activate: false }));
    add.push(item('Abrir enlace en nueva pesta\\u00f1a activa', false, { type: 'link:new-tab', url: p.link.url, activate: true  }));
    add.push(item('Abrir enlace en nueva ventana',              false, { type: 'link:new-window', url: p.link.url }));
    if (p.link.profiles && p.link.profiles.length > 1) {
      const profileItems = p.link.profiles.map(pr =>
        item(pr.name, false, { type: 'link:open-profile', url: p.link.url, profileId: pr.id })
      );
      add.push(expandItem('Abrir enlace en perfil\\u2026', profileItems));
    }
    add.push(sep());
    add.push(item('Copiar enlace',          false, { type: 'copy', text: p.link.url }));
    if (p.link.text) {
      add.push(item('Copiar texto del enlace', false, { type: 'copy', text: p.link.text }));
    }
    add.push(sep());
  }

  if (p.image) {
    add.push(item('Abrir imagen en nueva pesta\\u00f1a', false, { type: 'link:new-tab', url: p.image.url, activate: true }));
    add.push(item('Copiar imagen',                       false, { type: 'image:copy', wcvX: p.wcvX, wcvY: p.wcvY }));
    add.push(item('Copiar direcci\\u00f3n de la imagen', false, { type: 'copy', text: p.image.url }));
    add.push(item('Guardar imagen como\\u2026',          false, { type: 'image:save', url: p.image.url }));
    add.push(sep());
  }

  if (p.selection) {
    const q = trunc(p.selection.text, 30);
    add.push(item('Buscar "' + q + '" en ' + p.selection.searchLabel, false, { type: 'selection:search', url: p.selection.searchUrl }));
    add.push(item('Traducir "' + trunc(p.selection.text, 20) + '"',   true,  null));
    add.push(sep());
  }

  if (p.isEditable) {
    add.push(item('Cortar',          !p.editFlags.canCut,       { type: 'edit:cut' },        'Ctrl+X'));
    add.push(item('Copiar',          !p.editFlags.canCopy,      { type: 'edit:copy' },       'Ctrl+C'));
    add.push(item('Pegar',           !p.editFlags.canPaste,     { type: 'edit:paste' },      'Ctrl+V'));
    add.push(item('Seleccionar todo',!p.editFlags.canSelectAll, { type: 'edit:select-all' }, 'Ctrl+A'));
    add.push(sep());
  } else if (p.selection) {
    add.push(item('Copiar', !p.editFlags.canCopy, { type: 'edit:copy' }, 'Ctrl+C'));
    add.push(sep());
  }

  add.push(item('Guardar p\\u00e1gina como\\u2026', false, { type: 'page:save' },  'Ctrl+S'));
  add.push(item('Imprimir\\u2026',                  false, { type: 'page:print' }, 'Ctrl+P'));
  add.push(sep());
  add.push(item('Inspeccionar elemento', false, { type: 'devtools:inspect', wcvX: p.wcvX, wcvY: p.wcvY }, 'Ctrl+Shift+I'));

  add.forEach(el => itemsEl.appendChild(el));
  resize();
}

window.velaCtx.on('ctx:payload', (p) => render(p));

document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
</script>
</body>
</html>`;
}

// ─── Clase principal ──────────────────────────────────────────────────────────

export class ContextMenuPopup {
  private popupWin: BrowserWindow | null = null;
  private readonly htmlPath: string;
  private currentWcWebContents: WebContents | null = null;
  private currentWindowId: number | null = null;
  private currentWorkspaceId: string | null = null;
  private currentParentWin: BrowserWindow | null = null;
  private currentCursorPos = { x: 0, y: 0 };
  private readonly cleanupFns: Array<() => void> = [];

  constructor(private readonly ctx: IpcContext) {
    this.htmlPath = path.join(app.getPath('userData'), 'vela-ctxmenu.html');
    fs.writeFileSync(this.htmlPath, getMenuHtml(), 'utf8');
    this.registerIpcHandlers();
  }

  private registerIpcHandlers(): void {
    const onClose = () => this.hide();

    const onResize = (_e: Electron.IpcMainEvent, { height }: { height: number }) => {
      if (!this.popupWin || this.popupWin.isDestroyed()) return;
      const { x, y } = this.calcPosition(height);
      this.popupWin.setPosition(x, y, false);
      this.popupWin.setSize(MENU_WIDTH, Math.max(10, height), false);
      if (!this.popupWin.isVisible()) this.popupWin.show();
    };

    const onAction = (_e: Electron.IpcMainEvent, action: Record<string, unknown>) => {
      this.hide();
      void this.dispatchAction(action);
    };

    ipcMain.on('ctx:close', onClose);
    ipcMain.on('ctx:resize', onResize);
    ipcMain.on('ctx:action', onAction);

    this.cleanupFns.push(
      () => ipcMain.off('ctx:close', onClose),
      () => ipcMain.off('ctx:resize', onResize),
      () => ipcMain.off('ctx:action', onAction),
    );
  }

  private calcPosition(height: number): { x: number; y: number } {
    const cursor = this.currentCursorPos;
    const display = screen.getDisplayNearestPoint(cursor);
    const b = display.bounds;
    const x = Math.max(b.x + 4, Math.min(cursor.x, b.x + b.width - MENU_WIDTH - 8));
    const fitsBelow = cursor.y + height < b.y + b.height - 8;
    const rawY = fitsBelow ? cursor.y : cursor.y - height;
    const y = Math.max(b.y + 4, Math.min(rawY, b.y + b.height - height - 8));
    return { x, y };
  }

  show(
    payload: ContextMenuShowPayload,
    parentWin: BrowserWindow,
    wcWebContents: WebContents,
    workspaceId: string | null,
  ): void {
    this.currentWcWebContents = wcWebContents;
    this.currentWindowId = payload.windowId;
    this.currentWorkspaceId = workspaceId;
    this.currentParentWin = parentWin;
    this.currentCursorPos = screen.getCursorScreenPoint();

    if (!this.popupWin || this.popupWin.isDestroyed()) {
      this.popupWin = new BrowserWindow({
        width: MENU_WIDTH,
        height: 400,
        x: -9999,
        y: 0,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: true,
        hasShadow: false,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          preload: CTXMENU_PRELOAD_PATH,
          devTools: false,
        },
      });

      this.popupWin.loadFile(this.htmlPath);
      this.popupWin.on('blur', () => this.hide());

      this.popupWin.webContents.once('did-finish-load', () => {
        this.popupWin?.webContents.send('ctx:payload', payload);
        // show() se llama desde el handler ctx:resize después de medir el contenido.
      });
    } else {
      this.popupWin.hide();
      this.popupWin.webContents.send('ctx:payload', payload);
      // show() se llama desde el handler ctx:resize.
    }
  }

  hide(): void {
    if (this.popupWin && !this.popupWin.isDestroyed()) {
      this.popupWin.hide();
    }
  }

  destroy(): void {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns.length = 0;
    if (this.popupWin && !this.popupWin.isDestroyed()) {
      this.popupWin.destroy();
      this.popupWin = null;
    }
  }

  private async dispatchAction(action: Record<string, unknown>): Promise<void> {
    const wc = this.currentWcWebContents;
    const windowId = this.currentWindowId;
    const workspaceId = this.currentWorkspaceId;
    const parentWin = this.currentParentWin;

    switch (action.type) {
      case 'nav:back':
        if (windowId !== null) this.ctx.tabManager.goBack(windowId);
        break;

      case 'nav:forward':
        if (windowId !== null) this.ctx.tabManager.goForward(windowId);
        break;

      case 'nav:reload':
        wc?.reload();
        break;

      case 'link:new-tab': {
        if (windowId === null || !workspaceId) break;
        await this.ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: action.url as string,
          activate: (action.activate as boolean) ?? false,
        });
        break;
      }

      case 'link:new-window': {
        const profileId = windowId !== null
          ? this.ctx.tabManager.getProfileForWindow(windowId)
          : null;
        if (!profileId) break;
        const newWin = await this.ctx.profileWindowManager.openWindow(profileId);
        const newWsId = this.ctx.tabManager.getWorkspaceForWindow(newWin.id);
        if (newWsId) {
          await this.ctx.tabManager.createTab(newWin.id, {
            workspaceId: newWsId,
            parentId: null,
            url: action.url as string,
            activate: true,
          });
        }
        break;
      }

      case 'link:open-profile': {
        const newWin = await this.ctx.profileWindowManager.openWindow(action.profileId as string);
        const newWsId = this.ctx.tabManager.getWorkspaceForWindow(newWin.id);
        if (newWsId) {
          await this.ctx.tabManager.createTab(newWin.id, {
            workspaceId: newWsId,
            parentId: null,
            url: action.url as string,
            activate: true,
          });
        }
        break;
      }

      case 'copy':
        clipboard.writeText(action.text as string);
        break;

      case 'image:copy':
        wc?.copyImageAt(action.wcvX as number, action.wcvY as number);
        break;

      case 'image:save': {
        wc?.downloadURL(action.url as string);
        break;
      }

      case 'selection:search': {
        if (windowId === null || !workspaceId) break;
        await this.ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: action.url as string,
          activate: true,
        });
        break;
      }

      case 'edit:cut':        wc?.cut();        break;
      case 'edit:copy':       wc?.copy();       break;
      case 'edit:paste':      wc?.paste();      break;
      case 'edit:select-all': wc?.selectAll();  break;

      case 'notes:append': {
        if (!workspaceId || windowId === null) break;
        const profileId = this.ctx.tabManager.getProfileForWindow(windowId);
        if (!profileId) break;
        const repos = this.ctx.profileManager.getRepositories(profileId);
        const existing = repos.quickNotes.get(workspaceId);
        const current = existing?.content ?? '';
        const appended = current ? current + '\n\n' + (action.text as string) : (action.text as string);
        repos.quickNotes.upsert(workspaceId, appended);
        break;
      }

      case 'favorites:add-current': {
        const url = action.url as string | null;
        const title = (action.title as string | null) ?? url ?? '';
        if (!url || windowId === null) break;
        const profileId = this.ctx.tabManager.getProfileForWindow(windowId);
        if (!profileId) break;
        const repos = this.ctx.profileManager.getRepositories(profileId);
        const existing = repos.favorites.getByUrl(url);
        if (!existing) {
          const lastPos = repos.favorites.lastPositionInParent(null);
          const position = generateKeyBetween(lastPos, null);
          repos.favorites.add({ id: crypto.randomUUID(), url, title, favicon: null, position, parentId: null });
          this.ctx.events.emit(IPC_EVENTS.FAVORITES_CHANGED, { profileId, favorites: repos.favorites.list() });
        }
        break;
      }

      case 'page:view-source': {
        const url = action.url as string | null;
        if (!url || windowId === null || !workspaceId) break;
        await this.ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: `view-source:${url}`,
          activate: true,
        });
        break;
      }

      case 'page:screenshot': {
        if (!wc || wc.isDestroyed()) break;
        const image = await wc.capturePage();
        clipboard.writeImage(image);
        break;
      }

      case 'page:save': {
        const { filePath, canceled } = await dialog.showSaveDialog(
          parentWin as BrowserWindow,
          {
            defaultPath: 'pagina.html',
            filters: [{ name: 'Página web', extensions: ['html', 'htm'] }],
          },
        );
        if (!canceled && filePath) {
          await wc?.savePage(filePath, 'HTMLComplete')?.catch(() => {});
        }
        break;
      }

      case 'page:print':
        wc?.print();
        break;

      case 'devtools:inspect':
        if (!wc) break;
        if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' });
        wc.inspectElement(action.wcvX as number, action.wcvY as number);
        break;
    }
  }
}
