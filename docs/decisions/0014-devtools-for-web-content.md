# ADR 0014 — DevTools para contenido web

## Estado

Aceptado — implementado en Sub-fase 4C (previa a 4C.2).

## Contexto

Vela no exponía ninguna forma de abrir las Chrome DevTools sobre el contenido
web cargado en las pestañas (`WebContentsView`). El único `openDevTools` que
existía ([`packages/main/src/index.ts`](../../packages/main/src/index.ts))
abría los DevTools de la **shell de Electron** (el renderer de Vela) solo en
modo desarrollo, y sin atajo de teclado accesible desde el contenido web.

Para un desarrollador web, inspeccionar el DOM, la red, la consola y la
Device Toolbar (emulación de pantallas) son herramientas de trabajo diario.

## Decisiones

### 1. Método `TabManager.toggleDevTools`

Se añade un método público `toggleDevTools(windowId, tabId?)` que obtiene el
`WebContentsView` de la tab activa (o de la tab indicada) y llama a:

- `openDevTools({ mode: 'detach' })` si los DevTools no están abiertos.
- `closeDevTools()` si ya están abiertos.

`mode: 'detach'` abre los DevTools en una ventana independiente, que es el
comportamiento estándar para un navegador (no interfiere con el layout del
`WebContentsView`).

### 2. Comandos en el registry central

Se registran dos comandos nuevos en
[`packages/main/src/commands/definitions.ts`](../../packages/main/src/commands/definitions.ts):

| id | defaultShortcut | Acción |
|---|---|---|
| `devtools.toggleForActiveTab` | `F12` | Abre/cierra DevTools de la tab activa |
| `devtools.toggleForShell` | `Ctrl+Shift+Alt+I` | Abre/cierra DevTools de la shell de Vela |

`F12` sigue la convención de cualquier navegador web. Se registra como
`defaultShortcut` y por tanto es configurable por el usuario vía el panel de
atajos de Sub-fase 4C.

`devtools.toggleForShell` usa un combo poco usual (`Ctrl+Shift+Alt+I`) para
no colisionar con combos web ni del SO. Está pensado para el desarrollo del
propio Vela, no para usuarios finales.

### 3. Shortcut routing hacia `WebContentsView`

No requiere trabajo adicional. `attachShortcuts` ya se engancha a cada
`WebContentsView` en `onTabAttached`
([`packages/main/src/index.ts:182`](../../packages/main/src/index.ts#L182)),
por lo que F12 pulsado mientras el foco está en el contenido web llega al
`ShortcutTable` y dispara el comando.

### 4. "Inspeccionar elemento" en el menú contextual

Se añade la opción **Inspeccionar elemento** al pie del menú contextual en
[`packages/main/src/tabs/webContextMenu.ts`](../../packages/main/src/tabs/webContextMenu.ts).

- Siempre visible (independientemente del contexto: texto, link, imagen, etc.).
- Llama a `webContents.inspectElement(x, y)` si los DevTools ya están
  abiertos, o a `openDevTools({ mode: 'detach' })` + `inspectElement` si no.
- La guardia `if (items.length === 0) return` se elimina: el menú tiene
  siempre al menos esta opción.

### 5. Device Toolbar

No requiere implementación adicional. Al abrir DevTools sobre un
`WebContentsView` Electron expone las Chrome DevTools completas, incluyendo
el Device Toolbar (emulación de dispositivos, viewport responsivo, throttling
de red, etc.). Se activa con el botón de dispositivo dentro de DevTools o con
`Ctrl+Shift+M` dentro de la ventana de DevTools.

## Alternativas descartadas

- **Modo docked** (`mode: 'bottom' | 'right'`): requeriría ajustar los bounds
  del `WebContentsView` para ceder espacio al panel de DevTools, añadiendo
  complejidad de layout. Se puede añadir en el futuro como opción de usuario.
- **`Ctrl+Shift+I` como atajo principal**: colisiona con patrones de OS en
  algunos entornos Linux y con shortcuts de páginas web. F12 es el estándar
  universal de navegadores.
- **IPC channel dedicado** (`devtools:toggle`): innecesario. El comando se
  despacha íntegramente desde main vía el registry; el renderer no necesita
  saber nada.

## Consecuencias

- El usuario (o el desarrollador) puede pulsar F12 en cualquier momento,
  tanto con el foco en el contenido web como en la shell.
- El menú contextual expone "Inspeccionar elemento" que posiciona el panel
  Elements directamente en el nodo clicado.
- El comando `devtools.toggleForActiveTab` queda expuesto en la paleta de
  comandos de Fase 4.5 de forma automática.
- El combo `Ctrl+Shift+P` sigue reservado para el command palette.
