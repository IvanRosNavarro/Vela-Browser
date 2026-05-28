# ADR 0006 — Registro central de comandos

- Estado: aceptado
- Fecha: 2026-05-07
- Fase: 1 — Núcleo de pestañas y workspaces (Paso 8.5, antes de cerrar
  Fase 1)

## Contexto

Vela apunta a tener un Quick Commands estilo Vivaldi en la Fase 4.5: una
paleta invocable con `Ctrl+Shift+P` que liste todas las acciones del
navegador, las filtre por texto y permita ejecutarlas por teclado. Para
que esa paleta sea útil necesita una sola fuente de verdad de "qué
acciones existen", con `id`, `título`, `categoría`, `args` y un `run`
homogéneo.

El Paso 8 de Fase 1 registró atajos de teclado a través de
`before-input-event`, con la lógica de cada acción incrustada en
`packages/main/src/keyboardShortcuts.ts`. El dispatch hablaba
directamente con `TabManager` y los repositorios. Funciona, pero deja
los comandos invisibles para cualquier otro consumidor (paleta, menús,
APIs externas) y obliga a re-implementar la misma acción cada vez que
queremos exponerla por otro canal.

## Decisión

Introducimos ya en Fase 1 el registro central de comandos
(`packages/main/src/commands/`) y migramos los atajos para que pasen
por él:

- `CommandRegistry`: estructura en memoria que expone
  `register / unregister / get / list / execute`.
  - `execute(id, ctx, args)` valida `args` con `argsSchema` (zod)
    antes de invocar `run(ctx, args)`.
  - `register` lanza si el `id` ya existe (los comandos no compiten
    por id).
- `CommandDefinition` (en `packages/shared/src/types/command.ts`):
  `id`, `title`, `category`, `defaultShortcut?`, `argsSchema?`,
  `isVisible?(ctx)`. El campo `isVisible` queda definido pero sin uso
  en esta fase; lo consume la paleta en Fase 4.5.
- `CommandContext`: `{ windowId, activeTabId, activeWorkspaceId }`.
  Construido por `buildContext(ipc, windowId)` desde `TabManager` +
  metadata de workspace activo.
- `registerCoreCommands(registry, deps)` registra los comandos
  enumerados al final de este ADR.
- `packages/main/src/shortcuts/index.ts`:
  - `buildShortcutTable(registry, ipc)` lee `defaultShortcut` de cada
    comando, parsea el combo y monta una tabla; añade además los
    bindings paramétricos (`Ctrl+1..9` → `workspace.switchToIndex`,
    `Ctrl+Tab`/`Ctrl+Shift+Tab` → `tab.cycleMru`) y el alias
    `Ctrl+R` → `nav.reload`.
  - `attachShortcuts` engancha la tabla a un `WebContents` (renderer
    o WCV de pestaña) y al `keyUp` de Ctrl invoca el commit MRU.
  - Un atajo declarado dos veces aborta el arranque con un error que
    nombra ambos `source`.
- `Ctrl+Shift+P` queda en `RESERVED_COMBOS`: registrar un comando
  bajo ese combo lanza error.

Los comandos que requieren UI del renderer (abrir modal, renombrar,
enfocar barra de direcciones, prompt de carpeta, alternar sidebar)
emiten el evento `state:command-renderer-action` en lugar de hablar
con la UI. El renderer escucha ese evento en
`packages/renderer/src/stores/subscriptions.ts` y reacciona vía
stores. El registry no toca `BrowserWindow` ni `webContents.send`
directamente.

## Alternativas descartadas

a) **Registry solo cuando llegue Fase 4.5.** Implicaría refactorar
   todos los atajos otra vez en seis meses. Cualquier comando nuevo
   añadido entre Fase 1 y Fase 4.5 viviría hardcoded y habría que
   migrarlo. El coste de adelantarlo ahora (un archivo de 250 líneas)
   es menor que el coste de la deuda acumulada.

b) **Que cada componente (renderer, menú, atajo) registre sus propios
   comandos en su sitio.** El listado quedaría disperso y la paleta
   no podría descubrir qué hay sin importar todos esos puntos. Un
   registry único hace `registry.list()` trivial.

c) **Reusar `electron`'s `Menu` accelerator + `globalShortcut`.**
   `globalShortcut` es para atajos globales del SO (Vela no los
   quiere), y los accelerators de `Menu` solo disparan cuando hay un
   `MenuItem` enganchado y el menú está visible. No nos sirve para
   comandos sin UI de menú.

## Consecuencias

- A partir de este paso, **ningún atajo se registra fuera del
  registry**. Si un módulo necesita un atajo nuevo, primero define
  el `Command` y le pone `defaultShortcut`. Esto se refleja en
  `CLAUDE.md` regla 14.
- En Fase 4.5 la paleta consume `registry.list()` directamente:
  filtra por `title`, ejecuta con `registry.execute(id, ctx, args)`.
  No hay que tocar el registry para que la paleta los recoja.
- Los `title` están en castellano (idioma del usuario). El i18n queda
  pendiente para Fase 4.5 cuando la paleta haga visibles los títulos
  al usuario final.
- Atajos paramétricos (`Ctrl+1..9`) no se expresan como
  `defaultShortcut` único sino como bindings explícitos en
  `buildShortcutTable`. Esto es un compromiso: la paleta los
  presentará como nueve entradas sólo si el `registerCoreCommands`
  los expande, o como una entrada única que pide `index`. La decisión
  sobre cómo presentarlos en la paleta se aplaza a Fase 4.5.
- Eliminamos el evento `state:workspace-modal-request` de
  `IPC_EVENTS`: estaba acoplado al atajo `Ctrl+Shift+N` y solo emitía
  modo `create`. Ese flujo pasa por
  `state:command-renderer-action` con
  `action: 'open-create-workspace-modal'`. El modo `manage` se abría
  ya desde el renderer (botón en `WorkspaceDropdown`) sin IPC.

## Comandos registrados (snapshot)

| `id` | Categoría | Atajo |
|---|---|---|
| `workspace.switchToIndex` | workspace | `Ctrl+1..9` (manual) |
| `workspace.next` | workspace | `Ctrl+Shift+]` |
| `workspace.previous` | workspace | `Ctrl+Shift+[` |
| `workspace.create` | workspace | `Ctrl+Shift+N` |
| `tab.activate` | tab | — |
| `tab.close` | tab | — |
| `tab.closeActive` | tab | — |
| `tab.pin` | tab | — |
| `tab.unpin` | tab | — |
| `tab.duplicate` | tab | — |
| `tab.rename` | tab | — |
| `tab.cycleMru` | tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` (manual) |
| `nav.back` | navigation | `Alt+Left` |
| `nav.forward` | navigation | `Alt+Right` |
| `nav.reload` | navigation | `F5` (alias `Ctrl+R`) |
| `nav.stop` | navigation | — |
| `nav.focusAddressBar` | navigation | `Ctrl+L` |
| `folder.createInActive` | folder | `Ctrl+E` |
| `folder.toggleCollapse` | folder | — |
| `view.toggleSidebarMode` | view | — |
| `view.toggleSidebar` | view | — |
