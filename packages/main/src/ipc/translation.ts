import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { getDb } from '../storage/db';
import { TranslationSettingsRepository } from '../storage/repositories/TranslationSettingsRepository';
import { TranslationManager } from '../translation/TranslationManager';
import { TranslationPopup, type FullTranslationResult } from '../translation/TranslationPopup';
import { guardTrustedFrame } from './validate';
import { mapError } from './errors';

const manager = new TranslationManager();
let popup: TranslationPopup | null = null;

// Almacena textos originales por tabId para permitir revertir la traducción
const originalTextsMap = new Map<string, string[]>();

function getSettings(): TranslationSettingsRepository {
  return new TranslationSettingsRepository(getDb());
}

/** Si detectado == destino, cambia destino a inglés (o español si destino era inglés). */
function resolveTarget(detectedLang: string, configuredTarget: string): string {
  if (detectedLang && detectedLang !== 'und' && detectedLang === configuredTarget) {
    return configuredTarget === 'en' ? 'es' : 'en';
  }
  return configuredTarget;
}

// Script JS que extrae nodos de texto del DOM, los envuelve en <span data-vela-t="id">
// y devuelve un array con los textos normalizados (sin saltos de línea internos).
const EXTRACT_SCRIPT = `
(function(){
  var texts=[];
  var SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','META','LINK','CODE','PRE','TEXTAREA','INPUT','SELECT','BUTTON','SVG','IMG','CANVAS','VIDEO','AUDIO']);
  var MAX=200;
  function walk(node){
    if(texts.length>=MAX)return;
    if(node.nodeType===3){
      var v=node.nodeValue;
      if(!v||!v.trim()||v.trim().length<2)return;
      var id=texts.length;
      var s=document.createElement('span');
      s.setAttribute('data-vela-t',String(id));
      s.textContent=v;
      if(node.parentNode)node.parentNode.replaceChild(s,node);
      texts.push(v.replace(/\\n/g,' ').replace(/\\s+/g,' ').trim());
    }else if(node.nodeType===1){
      if(SKIP.has(node.tagName))return;
      var ch=[].slice.call(node.childNodes);
      for(var i=0;i<ch.length;i++)walk(ch[i]);
    }
  }
  walk(document.body);
  return texts;
})()
`.trim();

function buildInjectScript(translated: string[]): string {
  return `(function(t){for(var i=0;i<t.length;i++){var s=document.querySelector('[data-vela-t="'+i+'"]');if(s&&t[i])s.textContent=t[i];}})(${JSON.stringify(translated)})`;
}

function emitTranslationError(ctx: IpcContext, windowId: number, err: unknown): void {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.includes('Too Many Requests')
    ? 'Demasiadas peticiones a Google Translate. Espera unos minutos.'
    : `Error de traducción: ${raw.slice(0, 80)}`;
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.TRANSLATION_ERROR, { windowId, message });
  }
}

async function doTranslatePage(ctx: IpcContext, tabId: string, overrideTarget?: string): Promise<void> {
  const wcv = ctx.tabManager.getWcvForTab(tabId);
  if (!wcv) return;

  const windowId = ctx.tabManager.getWindowIdForTab(tabId);

  const settings = getSettings().get();
  let targetLang = overrideTarget ?? settings.targetLang;
  const sourceLang = settings.sourceMode === 'auto' ? 'auto' : settings.sourceLang;

  const texts = (await wcv.webContents.executeJavaScript(EXTRACT_SCRIPT, true)) as string[];
  originalTextsMap.set(tabId, texts);
  if (!texts || texts.length === 0) return;

  const BATCH = 25;
  const translated: string[] = new Array(texts.length).fill('');
  let detectedLang = 'und';
  let firstBatch = true;
  let firstError: unknown = null;

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const joined = batch.join('\n');
    try {
      const res = await manager.translate(joined, targetLang, sourceLang);
      if (firstBatch) {
        firstBatch = false;
        detectedLang = res.detectedLang;
        const effective = resolveTarget(detectedLang, targetLang);
        if (effective !== targetLang) {
          targetLang = effective;
          const retried = await manager.translate(joined, targetLang, sourceLang);
          const parts = retried.translatedText.split('\n');
          for (let j = 0; j < batch.length; j++) translated[i + j] = parts[j] ?? batch[j]!;
          continue;
        }
      }
      const parts = res.translatedText.split('\n');
      for (let j = 0; j < batch.length; j++) translated[i + j] = parts[j] ?? batch[j]!;
    } catch (err) {
      if (firstError === null) firstError = err;
      for (let j = 0; j < batch.length; j++) translated[i + j] = batch[j]!;
    }
  }

  // Si el primer lote falló, asumimos que la API está bloqueada — avisar al usuario
  if (firstBatch && firstError !== null && windowId !== null) {
    emitTranslationError(ctx, windowId, firstError);
    return;
  }

  await wcv.webContents.executeJavaScript(buildInjectScript(translated), true);

  if (windowId !== null) {
    const parentWin = BrowserWindow.fromId(windowId);
    if (parentWin && !parentWin.isDestroyed()) {
      parentWin.webContents.send(IPC_EVENTS.TRANSLATION_STATUS_CHANGED, {
        windowId, tabId, status: 'translated',
      });
    }
  }
}

export function registerTranslationHandlers(ctx: IpcContext): void {
  popup = new TranslationPopup(ctx);

  // ── translate:get-settings ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_GET_SETTINGS,
    async (event): Promise<IpcResponse<ReturnType<TranslationSettingsRepository['get']>>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_GET_SETTINGS);
        return { ok: true, data: getSettings().get() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_GET_SETTINGS);
      }
    },
  );

  // ── translate:save-settings ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_SAVE_SETTINGS,
    async (event, payload): Promise<IpcResponse<ReturnType<TranslationSettingsRepository['get']>>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_SAVE_SETTINGS);
        const updated = getSettings().save(payload as Parameters<TranslationSettingsRepository['save']>[0]);
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_SAVE_SETTINGS);
      }
    },
  );

  // ── translate:detect-page ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_DETECT_PAGE,
    async (event, payload): Promise<IpcResponse<{ lang: string }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_DETECT_PAGE);
        const { text } = payload as { text: string };
        const lang = await manager.detectPageLanguage(text);
        return { ok: true, data: { lang } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_DETECT_PAGE);
      }
    },
  );

  // ── translate:text ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_TEXT,
    async (event, payload): Promise<IpcResponse<FullTranslationResult>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_TEXT);
        const { text, targetLang: overrideTarget, sourceLang: overrideSource } = payload as {
          text: string;
          targetLang?: string;
          sourceLang?: string;
        };
        const settings = getSettings().get();
        let targetLang = overrideTarget ?? settings.targetLang;
        const sourceLang = overrideSource ?? (settings.sourceMode === 'auto' ? 'auto' : settings.sourceLang);

        let result = await manager.translate(text, targetLang, sourceLang);

        // Smart swap: si detectado == destino, retraducir con idioma alternativo
        const effectiveTarget = resolveTarget(result.detectedLang, targetLang);
        if (effectiveTarget !== targetLang) {
          targetLang = effectiveTarget;
          result = await manager.translate(text, targetLang, sourceLang);
        }

        const full: FullTranslationResult = {
          translatedText: result.translatedText,
          detectedLang: result.detectedLang,
          sourceLang,
          targetLang,
          originalText: text,
        };
        return { ok: true, data: full };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_TEXT);
      }
    },
  );

  // ── translate:show-popup ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_SHOW_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_SHOW_POPUP);
        const { windowId, result } = payload as { windowId: number; result: FullTranslationResult };
        const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
        let glass = null;
        if (profileId) {
          const repos = ctx.profileManager.getRepositories(profileId);
          glass = TranslationPopup.readGlass(repos);
        }
        popup?.show(windowId, result, glass);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_SHOW_POPUP);
      }
    },
  );

  // ── translate:close-popup ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_CLOSE_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_CLOSE_POPUP);
        const { windowId } = payload as { windowId: number };
        popup?.close(windowId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_CLOSE_POPUP);
      }
    },
  );

  // ── translate:page ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_PAGE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_PAGE);
        const { tabId, targetLang: overrideTarget } = payload as { tabId: string; targetLang?: string };
        await doTranslatePage(ctx, tabId, overrideTarget);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_PAGE);
      }
    },
  );

  // ── translate-confirm:exec ────────────────────────────────────────────────
  // Cierra el popup desde main y lanza la traducción en background.
  // Evita la race condition de void+window.close() desde el renderer.
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_CONFIRM_EXEC,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_CONFIRM_EXEC);
        const { windowId, tabId, targetLang } = payload as { windowId: number; tabId: string; targetLang: string };
        // Cerrar el popup inmediatamente desde main (antes de que el renderer se destruya)
        popup?.closeConfirmPopup(windowId);
        // Lanzar traducción en background — la respuesta IPC vuelve antes de que termine
        void doTranslatePage(ctx, tabId, targetLang);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_CONFIRM_EXEC);
      }
    },
  );

  // ── translate:revert ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_REVERT,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_REVERT);
        const { tabId } = payload as { tabId: string };
        const originals = originalTextsMap.get(tabId);
        if (!originals) return { ok: false, error: 'NOT_FOUND' as const };
        const wcv = ctx.tabManager.getWcvForTab(tabId);
        if (!wcv) return { ok: false, error: 'NOT_FOUND' as const };
        await wcv.webContents.executeJavaScript(buildInjectScript(originals), true);
        originalTextsMap.delete(tabId);
        const windowId = ctx.tabManager.getWindowIdForTab(tabId);
        if (windowId !== null) {
          const parentWin = BrowserWindow.fromId(windowId);
          if (parentWin && !parentWin.isDestroyed()) {
            parentWin.webContents.send(IPC_EVENTS.TRANSLATION_STATUS_CHANGED, {
              windowId, tabId, status: 'suggested',
            });
          }
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_REVERT);
      }
    },
  );

  // ── translate:detect-lang ─────────────────────────────────────────────────
  // Detecta el idioma de la página usando el atributo HTML lang (sin llamada a API)
  ipcMain.handle(
    IPC_CHANNELS.TRANSLATE_DETECT_LANG,
    async (event, payload): Promise<IpcResponse<{ lang: string; status: string }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TRANSLATE_DETECT_LANG);
        const { tabId } = payload as { tabId: string };
        const wcv = ctx.tabManager.getWcvForTab(tabId);
        if (!wcv) return { ok: false, error: 'NOT_FOUND' as const };

        // No ejecutar si la página aún está cargando: el DOM no está listo
        if (wcv.webContents.isLoading()) {
          return { ok: true, data: { lang: '', status: 'neutral' } };
        }

        const url = wcv.webContents.getURL();
        if (!url || url.startsWith('vela://') || url.startsWith('about:') || url.startsWith('data:')) {
          return { ok: true, data: { lang: '', status: 'neutral' } };
        }
        const settings = getSettings().get();
        const pageLang = (await wcv.webContents.executeJavaScript(
          `(document.documentElement.lang || '').split('-')[0].toLowerCase()`,
          true,
        )) as string;
        // Sin lang attr → asumir que puede traducirse (mostrar icono)
        const status = (pageLang && pageLang === settings.targetLang) ? 'neutral' : 'suggested';
        const windowId = ctx.tabManager.getWindowIdForTab(tabId);
        if (windowId !== null) {
          const parentWin = BrowserWindow.fromId(windowId);
          if (parentWin && !parentWin.isDestroyed()) {
            parentWin.webContents.send(IPC_EVENTS.TRANSLATION_STATUS_CHANGED, {
              windowId, tabId, status,
            });
          }
        }
        return { ok: true, data: { lang: pageLang, status } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TRANSLATE_DETECT_LANG);
      }
    },
  );

  // ── translate-confirm:open ────────────────────────────────────────────────
  popup?.registerConfirmPopup(ctx);
}

/** Traduce texto seleccionado desde main (ContextMenu, Command) y muestra el popup. */
export async function translateAndShow(
  ctx: IpcContext,
  windowId: number,
  text: string,
): Promise<void> {
  const settings = getSettings().get();
  let targetLang = settings.targetLang;
  const sourceLang = settings.sourceMode === 'auto' ? 'auto' : settings.sourceLang;

  let result;
  try {
    result = await manager.translate(text, targetLang, sourceLang);
    // Smart swap: si detectado == destino, retraducir con idioma alternativo
    const effective = resolveTarget(result.detectedLang, targetLang);
    if (effective !== targetLang) {
      targetLang = effective;
      result = await manager.translate(text, targetLang, sourceLang);
    }
  } catch (err) {
    emitTranslationError(ctx, windowId, err);
    return;
  }

  const full: FullTranslationResult = {
    translatedText: result.translatedText,
    detectedLang: result.detectedLang,
    sourceLang,
    targetLang,
    originalText: text,
  };

  const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
  let glass = null;
  if (profileId) {
    const repos = ctx.profileManager.getRepositories(profileId);
    glass = TranslationPopup.readGlass(repos);
  }

  popup?.show(windowId, full, glass);
  // Nota: NO emitimos TRANSLATION_STATUS_CHANGED aquí.
  // La traducción de texto seleccionado no afecta al estado de traducción de la página.
}
