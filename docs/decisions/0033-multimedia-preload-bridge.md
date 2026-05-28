# ADR-0033 — Control multimedia vía preload bridge bidireccional

## Estado
Aceptado — Sub-fase 4D, Prompt 4D.3 revisado (2026-05-14)

## Contexto
El control de reproducción multimedia desde la title bar (sin activar la tab) requería enviar
comandos play/pause/skip al WebContentsView de la tab en background. Los primeros intentos
fallaron por las razones descritas a continuación.

## Por qué los enfoques directos fallaron

1. **`executeJavaScript` sin `userGesture: true`**: muchos sitios (YouTube, Spotify Web)
   tienen políticas de autoplay que rechazan `el.play()` si no hay gesto de usuario. La
   promesa se resolvía sin efecto.

2. **`navigator.mediaSession._handlers['play']()`**: los internals privados de la Media
   Session API no existen en la API pública. Solo `navigator.mediaSession.setActionHandler`
   es público, y registra handlers para que el SO/UA llame, no para invocación directa.

3. **CDP `Page.addScriptToEvaluateOnNewDocument` puro**: interceptar `setActionHandler` antes
   que el sitio funcionaba cuando el sitio registraba los handlers, pero muchos no lo hacen, y
   el debugger CDP conflictúa con DevTools abierto.

## Decisión
Arquitectura **preload bridge bidireccional**:

1. El preload script de cada WCV escucha `ipcRenderer.on('media:command', cmd)`.
2. Al recibir el comando, el preload llama `el.play()` / `el.pause()` sobre el elemento de
   media activo localizado en el DOM.
3. Como refuerzo para sitios con política de autoplay estricta, el main usa
   `wc.executeJavaScript(js, true)` con `userGesture: true` en paralelo.
4. Los eventos nativos de Electron `media-started-playing` y `media-paused` sobre el WCV
   detectan el estado real de reproducción, independientemente del `playbackState` de
   `navigator.mediaSession` (que muchos sitios no actualizan correctamente).
5. Metadata (título, artista, artwork) se extrae vía un poller de 500 ms en el preload que
   lee `navigator.mediaSession.metadata` y lo envía al main por `ipcRenderer.send('media:state-update')`.

## Consecuencias
- El preload ya está disponible en todos los WCV de tabs reales (no en Glance).
- La detección de reproducción es fiable para cualquier elemento `<audio>`/`<video>` del
  frame principal.
- Limitación conocida: iframes cross-origin (Spotify embed, YouTube embed en webs de terceros)
  no son accesibles desde el preload del frame principal.
- `MediaSessionManager` mantiene un `Map<tabId, MediaSource>` con el estado agregado.
- El widget en la title bar y el popup se alimentan de ese Map vía IPC.
