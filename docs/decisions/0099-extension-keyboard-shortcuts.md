# 0099 — Atajos de teclado de las extensiones (`chrome.commands`)

Fecha: 2026-08-28
Estado: aceptado

## Contexto

Las extensiones declaran atajos en la clave `commands` de su manifest.
Bitwarden declara tres: `Ctrl+Shift+L` (autorrelleno), `Ctrl+Shift+Y` (abrir
su popup, vía el comando especial `_execute_action`) y `Ctrl+Shift+9`
(generar contraseña).

`electron-chrome-extensions` implementa `chrome.commands.getAll()` —
devolviendo siempre `shortcut: ""` — y expone el evento
`chrome.commands.onCommand` en su preload, pero **no engancha ningún atajo ni
emite nunca el evento**. En Vela esos atajos no hacían nada.

## Decisión

`packages/main/src/extensions/extensionCommands.ts` lee los `commands` de cada
extensión cargada y los registra en la `ShortcutTable` central, respetando la
regla 14 de `CLAUDE.md` (ningún módulo de feature registra atajos por su
cuenta).

- El `suggested_key` de Chrome se traduce al formato de `parseShortcut`
  (`Command` → `Meta`, `MacCtrl` → `Ctrl`), eligiendo la variante de la
  plataforma actual antes que `default`.
- Los atajos de extensión se registran **después** de los comandos de Vela,
  con `tryRegister`: ante un combo ya ocupado, la extensión se queda sin
  atajo. Es lo mismo que hace Chrome ante un conflicto.
- Los comandos se agrupan **por combinación**, no por extensión. La misma
  extensión puede estar cargada en varios perfiles a la vez, cada uno con su
  sesión y su copia; un combo se registra una sola vez y al pulsarlo se
  resuelve qué copia dispararlo según la sesión de la pestaña activa.
  Registrar un binding por sesión haría que el segundo colisionara con el
  primero y el atajo solo funcionase en un perfil.
- `_execute_action` no genera evento: envía `IPC_EVENTS.EXTENSION_POPUP_TRIGGER`
  a la ventana, porque las coordenadas del icono en la barra solo las conoce el
  renderer. `ExtensionActionsBar` localiza el botón por `data-extension-id` y
  abre el popup igual que con un clic.
- El resto se entrega con `router.sendEvent(extensionId, 'commands.onCommand',
  name)`, despertando antes el service worker (ADR 0097).

La tabla se rehace cuando cambia el conjunto de extensiones cargadas, mediante
los eventos `extension-loaded` / `extension-unloaded` de la sesión con un
debounce de 250 ms. No se usa `EXTENSION_ACTIONS_CHANGED` para esto: ese
evento se emite en cada navegación (para los badges) y reconstruir la tabla
tan a menudo sería un desperdicio.

### `Ctrl+Shift+L`

Ese combo era el de `profile.lockCurrent` ("Cerrar el perfil actual"), así que
Bitwarden se quedaba sin su atajo de autorrelleno — el que más usa la gente y
el que tienen interiorizado de otros navegadores.

`profile.lockCurrent` pasa a `Ctrl+Alt+L` y `Ctrl+Shift+L` queda libre para
que lo tome la extensión que lo declare. La regla general no cambia: los
comandos de Vela siguen ganando ante un conflicto; lo que se ha hecho es
liberar un combo concreto por convención de facto del ecosistema.

## Consecuencias

- Quien tuviera `Ctrl+Shift+L` reasignado a mano en `vela://settings#shortcuts`
  conserva su elección: los atajos personalizados del usuario se registran
  antes que los de las extensiones.
- Los atajos de extensión **no** aparecen todavía en
  `vela://settings#shortcuts` y no se pueden reasignar desde la interfaz. Es
  el siguiente paso natural de esta línea; anotado en `docs/pending.md`.
- Se depende del `ctx.router` interno de ECE para emitir `commands.onCommand`.
  El acceso es opcional: si una versión futura cambia la estructura, se pierde
  la función y se registra un aviso, no se rompe el arranque.
