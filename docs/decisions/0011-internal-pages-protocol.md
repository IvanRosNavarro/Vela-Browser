# ADR 0011 — Protocolo vela:// para páginas internas

## Estado
Aceptado — Sub-fase 4A (mayo 2026).

## Contexto

Vela necesita páginas de configuración, about, onboarding y futuras
herramientas internas que:

1. Sean navegables como cualquier URL (la barra de direcciones puede
   mostrar `vela://settings` y el usuario puede marcarlo como favorito).
2. Vivan dentro del renderer React, no en una ventana separada.
3. Funcionen en producción (ASAR) y en desarrollo (Vite dev server)
   sin bifurcaciones de código en la UI.
4. No expongan rutas del filesystem ni puedan ser invocadas por
   contenido web externo.

### Alternativas evaluadas

| Opción | Ventajas | Inconvenientes |
|---|---|---|
| **`vela://` protocol handler custom** | URL limpia y semántica; bloqueable en session; independiente del dev server | Requiere registrar un protocol handler en main |
| `app://` via `loadURL` con hash routing | Simple | `app://` es reservado internamente por Electron; puede colisionar |
| Rutas internas del renderer (`/settings`) sin URL propia | Sin overhead de protocolo | La URL en la barra nunca muestra algo reconocible; no funciona como pestaña navegable |
| Ventana secundaria `BrowserWindow` | Sencillo de separar | Pierde el contexto de pestaña; no cabe en el modelo tabs/workspaces |
| `about:vela-settings` | Parecido a Chrome | `about:` tiene semántica de sistema; confunde al usuario y a linters |

## Decisión

Se registra un **custom protocol `vela:`** en el proceso main mediante
`protocol.handle('vela', handler)`. El handler:

- En **producción**: resuelve la ruta a un fichero dentro del ASAR
  (`dist/renderer/index.html` con query `?page=settings`).
- En **desarrollo**: hace `net.fetch` al dev server de Vite
  (`http://localhost:5173/?page=settings`).

El renderer detecta el parámetro `?page` (o el pathname de la URL
completa) en el arranque y monta el componente correspondiente dentro
del árbol React existente, sin cambiar el layout de pestañas.

### Seguridad

- El protocol handler es registrado con `protocol.handle`, que es
  seguro frente a path-traversal si no se interpola la URL del
  renderer directamente.
- Las páginas `vela://` solo son cargadas por el main (al crear la
  pestaña interna); el renderer no puede invocar `vela://` desde
  JavaScript del contenido web porque el protocolo no está
  whitelisted en la CSP del contenido web externo.
- Se mantiene `session.webRequest` para bloquear peticiones `vela://`
  que provengan de contenido externo.

### Extensibilidad

Añadir una nueva página interna es siempre el mismo procedimiento:

1. Crear el componente en `packages/renderer/src/pages/`.
2. Registrar la ruta en el router de páginas internas
   (`packages/renderer/src/pages/router.tsx`).
3. No se requiere ningún cambio en main: el handler ya enruta
   cualquier `vela://<path>` de forma genérica.

## Consecuencias

- El main registra el handler al arrancar (antes de crear cualquier
  ventana) para que esté disponible desde el primer `loadURL`.
- En dev, el handler depende de que el dev server esté levantado; si
  no lo está, las páginas internas muestran un error de conexión
  explícito (no silencioso).
- Las URLs `vela://` se almacenan en historial de pestañas como el
  resto; el `TabRepository` no necesita conocer si una URL es interna.
- `vela://newtab` quedará reservado para la futura new-tab page (Fase
  4C o posterior).
