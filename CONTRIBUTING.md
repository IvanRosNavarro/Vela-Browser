# Contribuir a Vela

Gracias por querer contribuir. Lee esto antes de abrir un PR — no es burocracia,
es lo necesario para que el código sea mantenible a largo plazo.

---

## Antes de empezar

- **Abre un issue primero.** Si vas a trabajar en algo no trivial, cuéntalo antes.
  Evita duplicar esfuerzo o que un PR se rechace por ir en dirección contraria a una
  decisión ya tomada.
- **Revisa el backlog.** Las features en `ROADMAP.md` son bienvenidas, pero algunas
  tienen restricciones técnicas o legales documentadas. Leer el ADR correspondiente
  evita sorpresas.
- **Licencia: GPL-3.0-only.** Al contribuir aceptas que tu código se distribuye
  bajo los mismos términos.

---

## Filosofía de diseño

Vela parte de una premisa sencilla: el navegador es una herramienta, no una plataforma.
Esto se traduce en decisiones de diseño concretas que afectan a cada feature nueva:

### No invasivo por defecto

- **Notificaciones web denegadas por defecto.** El navegador no pide permiso al usuario
  para recibirlas y no lo hace en su nombre. Si el usuario quiere activarlas para un
  sitio, puede hacerlo desde `vela://settings#privacy`. No hay pop-up de "¿permitir
  notificaciones?" — existe un opt-in explícito, no un opt-out.
- **Sin telemetría.** Vela no envía datos a ningún servidor sin consentimiento explícito.
  Las únicas llamadas de red que hace por iniciativa propia son: sync (si el usuario
  lo activa), verificación de breaches HIBP con k-anonymity (si el usuario audita el
  vault), y actualización de listas del ad blocker.
- **Sin diálogos ni modales sorpresa.** La UI de Vela no interrumpe al usuario. Los
  toasts son informativos y efímeros; nunca bloquean el flujo de trabajo.

### Privacy-first

- **Historial no sincronizado.** El historial de navegación queda solo en el dispositivo
  (ver ADR 0084). No forma parte de las entidades que replica el sync.
- **Zero-knowledge.** El servidor de sync almacena blobs cifrados que no puede descifrar.
  La clave de cifrado derivada con scrypt existe solo en memoria del cliente y se zeriza
  al cerrar sesión.
- **Recovery Card local.** El PDF de recuperación de cuenta se genera y descarga
  localmente. El servidor nunca lo ve (ver ADR 0086).
- **Vault separado.** Las contraseñas viven en `vault.db`, cifrado entrada a entrada
  con AES-256-GCM. La clave está solo en memoria mientras el vault está abierto.

### Sin lock-in

- Los datos viven en SQLite con esquema público y migraciones versionadas.
- La sincronización es completamente opcional. Sin ella, Vela funciona igual.
- El servidor de sync es self-hostable: ver `packages/sync-server/`.
- Los temas se exportan como `.vela-theme.json`. Los scripts de usuario, como texto plano.

### Offline-first

Toda la funcionalidad esencial funciona sin conexión. El sync encola los cambios
pendientes en `sync_pending` y los aplica al reconectar con backoff exponencial.

---

## Flujo de trabajo

```
main  ← rama protegida, siempre funcional
  ├── fix/descripcion-corta       bugs
  ├── feat/descripcion-corta      features del backlog
  └── chore/descripcion-corta     mantenimiento sin cambio de comportamiento
```

1. Haz fork del repo y crea tu rama desde `main`.
2. Haz commits pequeños y descriptivos (en inglés o español, consistente con el historial).
3. Abre un PR contra `main` con una descripción clara de qué cambia y por qué.
4. El PR debe pasar CI (typecheck + lint + tests) antes de revisión.

Los releases se etiquetan desde `main`. Un fix relevante puede generar un release
patch; las features se acumulan hasta un minor.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Electron + Chromium (wrapper, no fork) |
| Lenguaje | TypeScript 5 estricto — sin `any` salvo en límites externos |
| UI | React 18 |
| Bundler | Vite |
| Estado renderer | Zustand |
| Persistencia | `node:sqlite` (built-in Node 22, síncrono) |
| Estilos | Tailwind CSS + CSS variables (`--vela-*`) |
| Drag & drop | `@dnd-kit/core` |
| Posiciones | `fractional-indexing` |
| Extensiones | `electron-chrome-extensions` |
| Cifrado | `libsodium-wrappers` + `node:crypto` |
| Empaquetado | `electron-builder` + `electron-updater` |
| Lectura | Mozilla Readability |
| Sync | Yjs (notas) + REST + WebSocket (entidades) |
| Gestión de paquetes | pnpm workspaces |

---

## Arquitectura — lo mínimo que hay que saber

### Procesos de Electron

- **Main process** — único proceso Node.js. Es la fuente de verdad: lógica de negocio,
  SQLite, gestión de `WebContentsView`, IPC, APIs externas.
- **Renderer process** — uno por ventana. Solo UI React. Se suscribe al main vía IPC.
  No hace optimistic updates.
- **WebContentsView** — uno por pestaña web. Nunca uses `BrowserView` (deprecated).
- **Preload scripts** — única barrera permitida entre main y renderer. Expone API
  limitada vía `contextBridge`. Nunca uses `nodeIntegration: true`.

### Flujo de datos típico

```
Usuario click en sidebar (renderer)
  → IPC tab:activate → main
  → main valida + actualiza store + persiste en SQLite
  → main publica state:active-tab-changed
  → renderer actualiza UI
```

El renderer nunca escribe directamente en SQLite. Todo pasa por IPC al main.

### Aislamiento de perfiles

```
userData/
├── vela.db                  DB global: app metadata, perfiles
└── profiles/
    └── {uuid}/
        ├── profile.db       workspaces, tabs, historial, notas, scripts
        ├── vault.db         contraseñas (cifrado AES-256-GCM entrada a entrada)
        ├── extensions/
        └── previews/        capturas WebP de pestañas
```

Cada perfil tiene su propia sesión Electron particionada (`persist:profile-{uuid}`),
su propia base de datos y su propia clave de cifrado. No comparten nada.

---

## Reglas de código

### TypeScript

- **Estricto sin excepciones.** Sin `any` salvo en límites de librerías externas, y
  con comentario explicando por qué.
- **Zod en todos los cruces de IPC.** Todo dato que llegue del renderer al main se
  valida con un schema Zod en `packages/shared/src/ipc-schemas.ts` antes de procesarse.
  Usar siempre `validateIpc()` de `packages/main/src/ipc/validate.ts`.

### Comentarios

Solo escribe un comentario cuando el **porqué** no es obvio: una restricción oculta,
un invariante sutil, un workaround para un bug específico. Si quitar el comentario
no confundiría a un lector futuro, no lo escribas. Nunca describas lo que el código
ya dice.

### IPC

- Los canales IPC se definen en `packages/shared/src/ipc-channels.ts`.
  Primero el tipo, luego el canal, luego ambos lados. Nunca al revés.
- Nombrado: `dominio:accion` en kebab-case. Ejemplos: `tab:activate`, `workspace:rename`.
- Los handlers IPC nunca lanzan al renderer: devuelven `{ ok: false, error, details }`.

### Base de datos

- **Nunca `localStorage`** en el renderer. El estado persistente vive en SQLite.
- **Migraciones siempre.** Cualquier cambio de schema necesita un archivo numerado en
  `packages/main/src/storage/migrations/` (global) o `profile-migrations/` (por perfil).
  Las migraciones son hacia adelante únicamente.
- **IDs: UUID v7** (fallback v4 con comentario `TODO: upgrade to v7`).
- **Posiciones: `fractional-indexing`.** Nunca enteros secuenciales.

### Comandos y atajos

- **Todo atajo de teclado es un `Command`** en el registro central de
  `packages/main/src/commands/definitions.ts`. Nunca se registran atajos directamente.
- Esto garantiza que aparezcan en la command palette, sean configurables por el usuario
  y no entren en conflicto entre sí.
- `Ctrl+Shift+P` está reservado para la command palette. No asignar.

### UI sobre el WebContentsView

El **WebContentsView (WCV)** es una capa nativa de Electron que flota sobre todo el HTML
del renderer, ignorando completamente el z-index CSS. Cualquier elemento HTML que
intentes renderizar encima del WCV quedará tapado.

Para UI que deba aparecer sobre el área de contenido, hay exactamente tres opciones:

**1. Overlay temporal** (`useOverlayStore.acquire()`)  
Oculta el WCV completamente durante el tiempo que el modal está visible. Apropiado
para modales a pantalla completa (TabSwitcher, CommandPalette). El fondo de Vela queda
expuesto — solo es aceptable cuando el modal lo tapa completamente.

```tsx
// En el componente modal — libera el WCV al desmontar:
const release = useOverlayStore((s) => s.release);
useEffect(() => () => { release(); }, [release]);

// En el botón/padre que abre el modal:
const acquireAndWait = useOverlayStore((s) => s.acquireAndWait);
await acquireAndWait(); // espera a que el WCV se oculte antes de mostrar la UI
setOpen(true);
```

**2. Panel lateral** (`layout:set-notification-panel-width`)  
Reduce los bounds del WCV dejando espacio a la derecha. El contenido web se desplaza.
Apropiado para paneles persistentes que conviven con la navegación.

**3. BrowserWindow popup** — la opción correcta para dropdowns y menús flotantes  
Ventana nativa `alwaysOnTop` que siempre aparece por encima del WCV sin moverlo ni
mostrar el fondo de Vela. Es el patrón usado por todos los menús de la barra lateral,
la URL bar, los menús contextuales y los paneles flotantes.

Implementación en seis pasos:
1. Definir los canales IPC en `packages/shared/src/ipc-channels.ts`.
2. Añadir los tipos en `packages/shared/src/preloadApi.ts`.
3. Implementar en `packages/preload/src/index.ts`.
4. Registrar el handler en `packages/main/src/ipc/popups.ts` usando
   `createPopupWindow()` y `wirePopupLifecycle()` de `popupUtils.ts`.
5. Crear la página renderer en `packages/renderer/src/pages/<nombre>/` y registrarla
   en `packages/main/src/protocols/velaProtocol.ts`.
6. Abrir el popup desde el componente renderer con `getBoundingClientRect()` para
   calcular la posición del ancla.

Ver ejemplos en: workspace-dropdown, profile-dropdown, security-popup, add-node-menu.

### Notificaciones al usuario (toasts)

Para mostrar feedback al usuario desde el renderer, usar siempre el helper `toast`
de `packages/renderer/src/stores/toastStore.ts`:

```ts
import { toast } from '../../stores/toastStore';
toast('Operación completada', 'success');
toast('Algo ha fallado', 'error');
```

Variantes: `'info'` (por defecto), `'success'`, `'warning'`, `'error'`.

Desde el main process: emitir un evento push con `IPC_EVENTS` y capturarlo en
`App.tsx` con `window.api.on(...)`.

Nunca usar `alert()`, `confirm()`, ni notificaciones del sistema operativo para
comunicar feedback de operaciones internas.

### Seguridad

- `nodeIntegration: false` y `contextIsolation: true` — siempre, sin excepción.
- `webSecurity: true` — nunca `false`.
- Los scripts de usuario se ejecutan con `webContents.executeJavaScript()` en contexto
  web puro, sin acceso a APIs de Electron o Node.
- La sync key y la vault key viven **solo en memoria**. Nunca se escriben a disco ni logs.

### Licencias de dependencias

**GPL-3.0-only** significa que todas las dependencias deben ser GPL-compatibles.

✅ Compatibles: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0, LGPL,
GPL-2.0-or-later, GPL-3.0-or-later, Unlicense.

❌ No compatibles: GPL-2.0-only (sin "or later"), AGPL (sin "or later"),
Patron License, Business Source License, CC-BY-NC, licencias propietarias o "source
available".

**Antes de `pnpm add` cualquier cosa**, verifica la licencia. Si hay duda, abre
un issue antes de incluirla.

---

## Tests y CI

El CI corre en cada PR. Un PR no se mergea con CI rojo.

Para correr los checks localmente:

```bash
pnpm typecheck   # TypeScript sin errores
pnpm lint        # ESLint
pnpm test        # tests unitarios
```

---

## ADRs (Architecture Decision Records)

Las decisiones técnicas relevantes se documentan en `docs/decisions/` con el formato
`NNNN-titulo-corto.md`. Si tu PR cambia una decisión arquitectónica — o toma una
nueva — incluye el ADR correspondiente en el mismo PR.

Estructura mínima de un ADR:
- **Contexto**: por qué había una decisión que tomar.
- **Decisión**: qué se eligió.
- **Consecuencias**: qué implica hacia adelante (ventajas e inconvenientes).

---

## Preguntas

Abre un issue con la etiqueta `question`. No hay preguntas tontas.
