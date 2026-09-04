import { contextBridge, ipcRenderer, webFrame } from 'electron';

// ─── Bug Snapshot console buffer ──────────────────────────────────────────────
const MAX_CONSOLE_ENTRIES = 500;
const consoleBuffer: Array<{
  level: 'error' | 'warn' | 'log' | 'info';
  message: string;
  stack?: string;
  timestamp: number;
}> = [];

(['error', 'warn', 'log', 'info'] as const).forEach((level) => {
  const original = (console[level] as (...args: unknown[]) => void).bind(console);
  (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
    consoleBuffer.push({ level, message: args.map(String).join(' '), timestamp: Date.now() });
    if (consoleBuffer.length > MAX_CONSOLE_ENTRIES) consoleBuffer.shift();
    original(...args);
  };
});

window.addEventListener('error', (e) => {
  consoleBuffer.push({
    level: 'error',
    message: e.message,
    stack: (e.error as { stack?: string } | null)?.stack,
    timestamp: Date.now(),
  });
  if (consoleBuffer.length > MAX_CONSOLE_ENTRIES) consoleBuffer.shift();
});

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  consoleBuffer.push({
    level: 'error',
    message: `Unhandled rejection: ${String(e.reason)}`,
    stack: (e.reason as { stack?: string } | null)?.stack,
    timestamp: Date.now(),
  });
  if (consoleBuffer.length > MAX_CONSOLE_ENTRIES) consoleBuffer.shift();
});

contextBridge.exposeInMainWorld('velaApi', {
  bugSnapshot: { getConsoleBuffer: () => consoleBuffer },
  pushProxy: {
    getSubscription: (origin: string): Promise<{ endpoint: string; p256dh: string; auth: string } | null> =>
      ipcRenderer
        .invoke('push:get-proxy-subscription', { origin })
        .then((res: { ok: boolean; data?: unknown }) => {
          if (res?.ok && res.data) return res.data as { endpoint: string; p256dh: string; auth: string };
          return null;
        }),
  },
});

// Solo disponible desde vela://cert-error (el handler lo verifica por URL del sender).
contextBridge.exposeInMainWorld('velaCert', {
  allow: (fingerprint: string, url: string): Promise<void> =>
    ipcRenderer.invoke('cert:allow', { fingerprint, url }) as Promise<void>,
  goBack: (): Promise<void> =>
    ipcRenderer.invoke('cert:go-back') as Promise<void>,
});

// ─── Glance (Ctrl+Click / Shift+Click link preview) ───────────────────────────
// Two-stage approach to reliably intercept without breaking other modifier behaviors:
//
//  mousedown (capture): detect intent via sendSync — if main confirms it should
//    intercept, store anchor data in pendingGlance (no preventDefault here).
//  click (capture):  if pendingGlance is set, call preventDefault() to cancel
//    link-following *and* Chromium's "open in new tab" (Ctrl+Click), then fire
//    glance:show. This is the only reliable place where preventDefault stops
//    both navigation and setWindowOpenHandler.

type GlancePending = {
  href: string;
  anchorRect: { x: number; y: number; width: number; height: number; bottom: number };
  modifiers: { alt: boolean; ctrl: boolean; shift: boolean; meta: boolean };
};

let pendingGlance: GlancePending | null = null;

document.addEventListener(
  'mousedown',
  (e: MouseEvent) => {
    pendingGlance = null;
    if (e.button !== 0 || (!e.ctrlKey && !e.shiftKey && !e.metaKey)) return;

    const anchor = (e.composedPath() as Element[]).find(
      (el) => el instanceof HTMLAnchorElement && (el as HTMLAnchorElement).href,
    ) as HTMLAnchorElement | undefined;

    if (!anchor) return;

    const href = anchor.href;
    if (
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('#') ||
      href === window.location.href
    ) return;

    const modifiers = { alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey };
    const shouldShow = (ipcRenderer.sendSync('glance:should-show-sync', modifiers) as boolean | undefined) ?? false;
    if (!shouldShow) return;

    const rect = anchor.getBoundingClientRect();
    pendingGlance = {
      href,
      anchorRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height, bottom: rect.bottom },
      modifiers,
    };
  },
  true,
);

document.addEventListener(
  'click',
  (e: MouseEvent) => {
    if (!pendingGlance) return;
    const { href, anchorRect, modifiers } = pendingGlance;
    pendingGlance = null;
    // preventDefault on click cancels both link-following and Ctrl+Click new-tab,
    // which prevents setWindowOpenHandler from firing in main.
    e.preventDefault();
    e.stopPropagation();
    ipcRenderer.send('glance:show', { url: href, anchorRect, modifiers });
  },
  true,
);

// ─── Hover URL detection (status bar en address bar) ─────────────────────────
let hoverDebounce: ReturnType<typeof setTimeout> | null = null;
let currentHoverUrl: string | null = null;

document.addEventListener('mouseover', (e: MouseEvent) => {
  const anchor = (e.composedPath() as Element[]).find(
    (el) => el instanceof HTMLAnchorElement && (el as HTMLAnchorElement).href,
  ) as HTMLAnchorElement | undefined;

  if (!anchor) {
    if (currentHoverUrl) {
      currentHoverUrl = null;
      if (hoverDebounce) { clearTimeout(hoverDebounce); hoverDebounce = null; }
      ipcRenderer.send('hover-url:clear', {});
    }
    return;
  }

  const href = anchor.href;
  if (
    href.startsWith('javascript:') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href === '' ||
    href === window.location.href
  ) return;

  if (href === currentHoverUrl) return;

  if (hoverDebounce) clearTimeout(hoverDebounce);
  hoverDebounce = setTimeout(() => {
    currentHoverUrl = href;
    const isExternal = (() => {
      try {
        return new URL(href).hostname !== new URL(window.location.href).hostname;
      } catch { return false; }
    })();
    ipcRenderer.send('hover-url:set', { url: href, isExternal });
  }, 50);
});

document.addEventListener('mouseleave', () => {
  if (hoverDebounce) { clearTimeout(hoverDebounce); hoverDebounce = null; }
  if (currentHoverUrl) {
    currentHoverUrl = null;
    ipcRenderer.send('hover-url:clear', {});
  }
});

// ─── Media Session Bridge ─────────────────────────────────────────────────────
// Polls navigator.mediaSession every 500 ms and reports state to main.
// Receives 'media:command' from main and executes on DOM with user-gesture context.

let mediaLastTitle = '';
let mediaLastState = '';
let mediaPoller: ReturnType<typeof setInterval> | null = null;

function startMediaPoller(): void {
  if (mediaPoller) return;
  mediaPoller = setInterval(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const title = ms.metadata?.title ?? '';
    const state = ms.playbackState as string;
    if (title !== mediaLastTitle || state !== mediaLastState) {
      mediaLastTitle = title;
      mediaLastState = state;
      ipcRenderer.send('media:state-update', {
        title: ms.metadata?.title || document.title || '',
        artist: ms.metadata?.artist ?? null,
        album: ms.metadata?.album ?? null,
        artworkUrl: ms.metadata?.artwork?.[0]?.src ?? null,
        playbackState: state,
      });
    }
  }, 500);
}

startMediaPoller();

window.addEventListener('beforeunload', () => {
  if (mediaPoller) clearInterval(mediaPoller);
  mediaPoller = null;
});

function findActiveMedia(): HTMLMediaElement | null {
  const all = Array.from(document.querySelectorAll('video, audio')) as HTMLMediaElement[];
  return all.find((el) => !el.paused && !el.ended && el.readyState > 2) ?? all[0] ?? null;
}

ipcRenderer.on('media:command', (_event, command: string) => {
  switch (command) {
    case 'play': {
      const el = findActiveMedia();
      if (el && el.paused) void el.play().catch(() => { });
      break;
    }
    case 'pause': {
      const all = Array.from(document.querySelectorAll('video,audio')) as HTMLMediaElement[];
      all.filter((e) => !e.paused).forEach((e) => e.pause());
      break;
    }
    case 'nexttrack': {
      const el = findActiveMedia();
      if (el && isFinite(el.duration) && el.duration > 0) el.currentTime = el.duration;
      break;
    }
    case 'previoustrack': {
      const el = findActiveMedia();
      if (el) el.currentTime = 0;
      break;
    }
    case 'seekforward': {
      const el = findActiveMedia();
      if (el) el.currentTime = Math.min(el.currentTime + 15, el.duration || Infinity);
      break;
    }
    case 'seekbackward': {
      const el = findActiveMedia();
      if (el) el.currentTime = Math.max(el.currentTime - 10, 0);
      break;
    }
  }
});

// ─── Credential detection (password manager) ─────────────────────────────────
// El envío se comunica al main de inmediato ("provisional"). Es el main quien
// decide si la oferta de guardado llega a mostrarse, observando la navegación
// posterior del WebContentsView — el único indicio fiable de que el login ha
// funcionado.
//
// La señal de envío no puede ser solo el evento `submit`: la mayoría de logins
// modernos son un botón con un handler de click que hace fetch y nunca envían
// un <form>, así que ese evento no llega nunca y la oferta no aparecía. Aquí se
// escuchan además el clic sobre el botón de envío y el Enter en el campo de
// contraseña, y el identificador se busca esté o no dentro de un <form>.

let credConfirmPoller: ReturnType<typeof setInterval> | null = null;

function stopCredConfirmPoller(): void {
  if (credConfirmPoller) clearInterval(credConfirmPoller);
  credConfirmPoller = null;
}

/**
 * Logins SPA que no navegan ni tocan el historial: no hay ninguna señal de
 * navegación que el main pueda observar, así que confirmamos aquí cuando el
 * campo de contraseña desaparece del DOM (o se oculta), que es lo que hacen
 * estos formularios al autenticar correctamente.
 */
function watchForFormDismissal(passwordField: HTMLInputElement): void {
  stopCredConfirmPoller();
  let ticks = 0;
  credConfirmPoller = setInterval(() => {
    ticks++;
    // Solo desaparición real: un campo vaciado también es lo que hacen muchos
    // formularios al rechazar la contraseña.
    const gone = !passwordField.isConnected || passwordField.offsetParent === null;
    if (gone) {
      stopCredConfirmPoller();
      ipcRenderer.send('vault:credentials-confirm');
      return;
    }
    if (ticks >= 8) stopCredConfirmPoller(); // ~4 s
  }, 500);
}

/** Campos de texto rellenos que pueden ser el identificador del usuario. */
function isUsernameCandidate(el: HTMLInputElement): boolean {
  const t = el.type;
  return (
    t !== 'hidden' && t !== 'password' && t !== 'submit' && t !== 'button' &&
    t !== 'checkbox' && t !== 'radio' && t !== 'reset' && t !== 'file' &&
    el.value.trim().length > 0
  );
}

/**
 * Identificador asociado a un campo de contraseña: el último campo de texto
 * relleno que lo precede en el documento. Se busca dentro del <form> si lo hay
 * y, si no, en todo el documento — los logins sin <form> son la norma.
 */
function findUsernameFor(passwordField: HTMLInputElement): string | null {
  const scope: ParentNode = passwordField.form ?? document;
  const candidates = Array.from(scope.querySelectorAll('input')).filter(isUsernameCandidate);
  let preceding: HTMLInputElement | null = null;
  for (const input of candidates) {
    const pos = passwordField.compareDocumentPosition(input);
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) preceding = input;
  }
  // Si ninguno precede al campo (formularios que piden el correo después),
  // vale el primero relleno que haya.
  const chosen = preceding ?? candidates[0] ?? null;
  const value = chosen?.value.trim();
  return value ? value : null;
}

// Último par notificado, para no repetir el mismo envío en cada pulsación. Se
// reintenta pasados unos segundos: un login rechazado se vuelve a probar con
// las mismas credenciales y esa segunda vez sí puede acertar.
let lastSent = '';
let lastSentAt = 0;
const RESEND_AFTER_MS = 3_000;

function reportCredentials(passwordField: HTMLInputElement): void {
  const password = passwordField.value;
  if (!password) return;
  const username = findUsernameFor(passwordField);
  if (!username) return;

  const loginUrl = window.location.href;
  const fingerprint = `${loginUrl}\u0000${username}\u0000${password}`;
  const now = Date.now();
  if (fingerprint === lastSent && now - lastSentAt < RESEND_AFTER_MS) return;
  lastSent = fingerprint;
  lastSentAt = now;

  ipcRenderer.send('vault:credentials-detected', { username, password, loginUrl });
  watchForFormDismissal(passwordField);
}

/** Campo de contraseña relleno más cercano al elemento pulsado. */
function passwordFieldNear(el: Element): HTMLInputElement | null {
  const form = el.closest('form');
  const scope: ParentNode = form ?? document;
  const fields = Array.from(
    scope.querySelectorAll('input[type="password"]'),
  ) as HTMLInputElement[];
  return fields.find((f) => f.value.length > 0) ?? null;
}

// Formulario clásico.
document.addEventListener(
  'submit',
  (e: SubmitEvent) => {
    const form = e.target as HTMLFormElement | null;
    const field = form?.querySelector('input[type="password"]') as HTMLInputElement | null;
    if (field?.value) reportCredentials(field);
  },
  true,
);

// Botón de login sin <form>: el clic es la única señal de envío que existe.
document.addEventListener(
  'click',
  (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;
    const trigger = target.closest(
      'button, input[type="submit"], input[type="button"], [role="button"], a[href="#"]',
    );
    if (!trigger) return;
    const field = passwordFieldNear(trigger);
    if (field) reportCredentials(field);
  },
  true,
);

// Enter sobre el campo de contraseña.
document.addEventListener(
  'keydown',
  (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLInputElement | null;
    if (!target || target.type !== 'password' || !target.value) return;
    reportCredentials(target);
  },
  true,
);

window.addEventListener('beforeunload', stopCredConfirmPoller);

/**
 * Un documento del frame principal sin campo de contraseña es la señal de que
 * el login anterior salió bien: cubre los sitios que responden al submit
 * recargando la misma URL, donde el main no puede distinguir el éxito del
 * error solo por la navegación. El main ignora el aviso si esa pestaña no
 * tenía credenciales a la espera.
 */
function reportNoPasswordForm(): void {
  if (window.top !== window) return;
  if (document.querySelector('input[type="password"]')) return;
  ipcRenderer.send('vault:credentials-confirm');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', reportNoPasswordForm, { once: true });
} else {
  reportNoPasswordForm();
}

// ─── Dirty form tracking (auto-discard exclusion) ─────────────────────────────
// Reports to main whether the user has typed unsent data into a form field, so
// DiscardManager can avoid suspending a tab the user is filling in. We track
// real user interaction (an `input`/`change` event), NOT mere form presence —
// almost every site has a search box, so "has a form" would block discard for
// nearly all tabs. Pre-filled values without user interaction don't trigger.
let formDirty = false;

function isUserEditableField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    const type = target.type;
    return (
      type !== 'hidden' &&
      type !== 'submit' &&
      type !== 'button' &&
      type !== 'reset' &&
      type !== 'checkbox' &&
      type !== 'radio' &&
      type !== 'file'
    );
  }
  return false;
}

function setFormDirty(next: boolean): void {
  if (next === formDirty) return;
  formDirty = next;
  ipcRenderer.send('form-dirty:changed', { dirty: next });
}

document.addEventListener(
  'input',
  (e) => {
    if (formDirty) return;
    if (isUserEditableField(e.target)) setFormDirty(true);
  },
  true,
);

// Submitting the form sends the data, so it's no longer "unsent".
document.addEventListener('submit', () => setFormDirty(false), true);

// ─── WCV Mouse Gestures ───────────────────────────────────────────────────────
// Relays right-button drag events to GestureRecognizer in main (no visual trail).
// Normal right-clicks (movement < 60px) are not suppressed — contextmenu fires
// as usual. Only drags >= 60px suppress contextmenu so main can execute the
// matched gesture command instead.

const GESTURE_MIN_DIST = 60;
const GESTURE_MOVE_THROTTLE = 16; // ~60fps

let gestureActive = false;
let gestureStartScreenX = 0;
let gestureStartScreenY = 0;
let gestureMoveAt = 0;
let suppressNextContextMenu = false;

window.addEventListener(
  'pointerdown',
  (e: PointerEvent) => {
    if (e.button !== 2) return;
    e.preventDefault(); // enables continuous pointermove during right-click drag
    gestureActive = true;
    gestureStartScreenX = e.screenX;
    gestureStartScreenY = e.screenY;
    suppressNextContextMenu = false;
    ipcRenderer.send('gesture:wcv-start', { x: e.screenX, y: e.screenY });
  },
  { capture: true },
);

window.addEventListener(
  'pointermove',
  (e: PointerEvent) => {
    if (!gestureActive) return;
    const now = Date.now();
    if (now - gestureMoveAt < GESTURE_MOVE_THROTTLE) return;
    gestureMoveAt = now;
    ipcRenderer.send('gesture:wcv-move', { x: e.screenX, y: e.screenY });
  },
  { capture: true },
);

window.addEventListener(
  'pointerup',
  (e: PointerEvent) => {
    if (!gestureActive || e.button !== 2) return;
    gestureActive = false;
    const dx = e.screenX - gestureStartScreenX;
    const dy = e.screenY - gestureStartScreenY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= GESTURE_MIN_DIST) {
      suppressNextContextMenu = true;
      ipcRenderer.send('gesture:wcv-end', { x: e.screenX, y: e.screenY });
    } else {
      ipcRenderer.send('gesture:wcv-cancel');
    }
  },
  { capture: true },
);

window.addEventListener(
  'contextmenu',
  (e: MouseEvent) => {
    if (suppressNextContextMenu) {
      e.preventDefault();
      suppressNextContextMenu = false;
    }
  },
  { capture: true },
);

// ─── File input interception ──────────────────────────────────────────────────
// Intercepts clicks on input[type=file] in capture phase and routes them
// through Vela's custom file picker instead of the native OS dialog.
// Always intercepts; main decides whether to show custom picker or fall back
// to native dialog based on the 'filepicker:enabled' profile setting.

document.addEventListener(
  'click',
  (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    const input = el as HTMLInputElement;
    if (input.type !== 'file') return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // Tag the input with a unique ID so main can target it when injecting files.
    let pickerId = input.getAttribute('data-vela-picker') ?? '';
    if (!pickerId) {
      pickerId = Math.random().toString(36).slice(2);
      input.setAttribute('data-vela-picker', pickerId);
    }

    const rect = input.getBoundingClientRect();
    void ipcRenderer.invoke('filepicker:show', {
      accept: input.accept ?? '',
      multiple: input.multiple ?? false,
      inputRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      pickerId,
    });
  },
  true, // capture phase — fires before the browser opens the native dialog
);

// ─── Push Proxy — intercept PushManager.subscribe to route through Vela's sync server ─────
// When sync is configured, websites that call pushManager.subscribe() receive a fake
// PushSubscription backed by our sync server endpoint instead of FCM/Chromium.
// The sync server relays the encrypted payload to Electron via WebSocket, where
// PushProxyManager decrypts it and forwards it to NotificationManager.
//
// We inject into the MAIN WORLD so that the patch runs in the same context as the
// website's JS (bypasses contextIsolation). The velaApi.pushProxy bridge is the
// only way to cross back into the preload/IPC world.

const PUSH_PROXY_HOOK = `(function(){
  if(window.__VELA_PUSH_PROXY_HOOKED__)return;
  window.__VELA_PUSH_PROXY_HOOKED__=true;

  var api=window.velaApi&&window.velaApi.pushProxy;
  if(!api){return;}

  var OrigPushManager=window.PushManager;
  if(!OrigPushManager||!OrigPushManager.prototype){return;}

  // Store a reference to a pending subscription promise per ServiceWorkerRegistration
  // keyed by the registration object itself (WeakMap to avoid leaks).
  var cache=new WeakMap();

  function buildFakeSubscription(sub){
    // Minimal PushSubscription-like object satisfying the Web Push spec surface area.
    return Object.freeze({
      endpoint:sub.endpoint,
      expirationTime:null,
      options:{applicationServerKey:null,userVisibleOnly:true},
      getKey:function(name){
        if(name==='p256dh'){
          var b64=sub.p256dh.replace(/-/g,'+').replace(/_/g,'/');
          var pad=b64.length%4;if(pad)b64+=('====').slice(pad);
          var bin=atob(b64);var arr=new Uint8Array(bin.length);
          for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
          return arr.buffer;
        }
        if(name==='auth'){
          var b64=sub.auth.replace(/-/g,'+').replace(/_/g,'/');
          var pad=b64.length%4;if(pad)b64+=('====').slice(pad);
          var bin=atob(b64);var arr=new Uint8Array(bin.length);
          for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
          return arr.buffer;
        }
        return null;
      },
      toJSON:function(){
        return {endpoint:sub.endpoint,expirationTime:null,
          keys:{p256dh:sub.p256dh,auth:sub.auth}};
      },
      unsubscribe:function(){return Promise.resolve(true);},
    });
  }

  var origSubscribe=OrigPushManager.prototype.subscribe;
  OrigPushManager.prototype.subscribe=function(options){
    var self=this;
    var origin=window.location.origin;
    return api.getSubscription(origin).then(function(sub){
      if(sub){
        cache.set(self,sub);
        return buildFakeSubscription(sub);
      }
      // Sync not configured — fall back to native subscribe
      return origSubscribe.call(self,options);
    }).catch(function(){
      return origSubscribe.call(self,options);
    });
  };

  var origGetSubscription=OrigPushManager.prototype.getSubscription;
  OrigPushManager.prototype.getSubscription=function(){
    var self=this;
    var origin=window.location.origin;
    return api.getSubscription(origin).then(function(sub){
      if(sub){
        cache.set(self,sub);
        return buildFakeSubscription(sub);
      }
      return origGetSubscription.call(self);
    }).catch(function(){
      return origGetSubscription.call(self);
    });
  };
})()`;

void webFrame.executeJavaScript(PUSH_PROXY_HOOK).catch(() => { });

// ─── Analytics Debugger — dataLayer + GA4 POST body monitoring ───────────────
// Usamos webFrame.executeJavaScript() en lugar de <script> tag porque:
//  1. Bypasa la CSP de la página (el tag <script> es bloqueado por CSP estrictos)
//  2. Corre en el main world, donde vive dataLayer/fetch/sendBeacon
//  3. Se ejecuta antes de que GTM y GA4 hayan hecho sus peticiones POST
// Los listeners están en document (no window): document es el mismo nodo DOM
// entre el mundo aislado (preload) y el mundo principal (página).

const DL_EV = '__VELA_DL_PUSH__';
const NET_EV = '__VELA_NET_BODY__';

const DL_HOOK = `(function(){
  if(window.__VELA_ANALYTICS_HOOKED__)return;window.__VELA_ANALYTICS_HOOKED__=true;
  var DL_EV='${DL_EV}';
  var NET_EV='${NET_EV}';
  var GA4_RE=/google-analytics\\.com\\/(g|mp)\\/collect/;

  function dlDispatch(item){
    try{document.dispatchEvent(new CustomEvent(DL_EV,{detail:JSON.parse(JSON.stringify(item))}))}catch(_){}
  }
  function hookArr(arr){
    if(arr.__vlDlH)return;arr.__vlDlH=true;
    var orig=Array.prototype.push.bind(arr);
    arr.push=function(){
      for(var i=0;i<arguments.length;i++)dlDispatch(arguments[i]);
      return orig.apply(arr,arguments);
    };
  }

  // Replay items ya existentes (empujados antes de que instaláramos el hook)
  var existingDl=Array.isArray(window.dataLayer)?window.dataLayer.slice():[];
  if(Array.isArray(window.dataLayer))hookArr(window.dataLayer);
  var _dl=window.dataLayer;
  try{Object.defineProperty(window,'dataLayer',{enumerable:true,configurable:true,
    get:function(){return _dl;},
    set:function(v){_dl=v;if(Array.isArray(v))hookArr(v);}
  });}catch(_){}
  for(var _i=0;_i<existingDl.length;_i++)dlDispatch(existingDl[_i]);

  // Captura cuerpo POST de GA4 (fetch, sendBeacon, XHR)
  function emitPostBody(url,body){
    try{
      var s=null;
      if(typeof body==='string'){s=body;}
      else if(body instanceof URLSearchParams){s=body.toString();}
      else if(body&&typeof body.toString==='function'&&!(body instanceof Blob)&&!(body instanceof ArrayBuffer)){
        try{s=body.toString();}catch(_){}
      }
      if(!s)return;
      var params={};
      new URLSearchParams(s).forEach(function(v,k){params[k]=v;});
      if(Object.keys(params).length)
        document.dispatchEvent(new CustomEvent(NET_EV,{detail:{url:String(url),params:params}}));
    }catch(_){}
  }

  var origFetch=window.fetch;
  if(origFetch){window.fetch=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url?input.url:'');
    if(GA4_RE.test(url)&&init&&String(init.method||'').toUpperCase()==='POST'&&init.body)
      emitPostBody(url,init.body);
    return origFetch.apply(this,arguments);
  };}

  var origBeacon=navigator.sendBeacon?navigator.sendBeacon.bind(navigator):null;
  if(origBeacon){navigator.sendBeacon=function(url,data){
    if(GA4_RE.test(String(url))&&data)emitPostBody(url,data);
    return origBeacon(url,data);
  };}

  // XHR (fallback para implementaciones antiguas)
  var _xhrUrl=new WeakMap();
  var origOpen=XMLHttpRequest.prototype.open;
  var origSend=XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open=function(method,url){
    if(String(method).toUpperCase()==='POST'&&GA4_RE.test(String(url)))_xhrUrl.set(this,String(url));
    return origOpen.apply(this,arguments);
  };
  XMLHttpRequest.prototype.send=function(body){
    var u=_xhrUrl.get(this);
    if(u&&body)emitPostBody(u,body);
    return origSend.apply(this,arguments);
  };
})()`;

// webFrame.executeJavaScript corre en el main world y bypasa CSP de la página.
// Es async pero GTM tarda más (descarga de red) → llegamos antes que sus eventos.
void webFrame.executeJavaScript(DL_HOOK).catch(() => { });

// Los listeners en document cruzan el contextIsolation boundary (document es compartido)
document.addEventListener(DL_EV, (e) => {
  ipcRenderer.send('analytics-debugger:datalayer-push', (e as CustomEvent<unknown>).detail);
});

document.addEventListener(NET_EV, (e) => {
  ipcRenderer.send('analytics-debugger:net-body', (e as CustomEvent<unknown>).detail);
});
