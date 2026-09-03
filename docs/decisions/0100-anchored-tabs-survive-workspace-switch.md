# 0100 — Las Anclas conservan su WebContentsView al cambiar de workspace

Fecha: 2026-09-03
Estado: aceptado

## Contexto

Las Anclas (`anchored` en `tree_nodes`, barra `GlobalAnchorBar`) son
globales al perfil: se ven y se pueden activar desde cualquier
workspace. `TabManager.activateTab` ya lo contemplaba, saltándose la
comprobación de pertenencia al workspace cuando `node.anchored` es
cierto.

El ciclo de vida de los WCV, en cambio, no lo contemplaba. Al cambiar de
workspace, `suspendTabsOf` desengancha **todos** los WCV de la ventana
(`contentView.removeChildView`) y los guarda en
`suspendedWorkspaces['{ventana}:{workspaceSaliente}']`, borrando además
su entrada de `tabToWindow`. Las Anclas caían en ese barrido igual que
cualquier otra pestaña.

Consecuencia: al pulsar un Ancla desde el nuevo workspace,
`activateTab` no encontraba su vista en `state.tabs` y llamaba a
`spawnView`, que crea un `WebContentsView` nuevo y carga `node.url` de
cero. Se perdía todo el estado vivo de la página: sesión de la propia
página, scroll, y —lo más visible— cualquier formulario a medio escribir.
El WCV original seguía en `suspendedWorkspaces` sin que nada lo
reclamara, así que al volver al workspace de origen `restoreSuspended`
hacía `state.tabs = survivingTabs` y descartaba la vista recién creada:
dos WCV por la misma pestaña y uno de ellos filtrado.

Había un segundo camino hacia la misma pérdida: `DiscardManager` no
exceptuaba las Anclas, de modo que el temporizador de inactividad podía
descartar un Ancla y liberar su WCV.

## Decisión

El WCV de un Ancla viaja con la **ventana**, no con el workspace.

- `suspendTabsOf` reparte `state.tabs` en dos grupos. Las Anclas
  (`treeNodes.listAnchored()`) se quedan adjuntas al `contentView` de la
  ventana y solo se ocultan con `HIDDEN_BOUNDS`; conservan su entrada en
  `tabToWindow`. El resto se suspende como antes. La pila MRU se parte
  igual: la de las Anclas se queda con la ventana, la del workspace
  saliente se guarda con él.
- `restoreSuspended` parte de las vistas que ya tiene la ventana en vez
  de sustituirlas, y decide si "había algo que restaurar" contando las
  vistas realmente reenganchadas, no el tamaño total del mapa.
- `discardAllTabsOf` acepta `keepAnchored`, que se activa en la ruta del
  ajuste `tabs:discard-on-workspace-switch`. Sin esto el bug volvía por
  esa vía para quien tuviera el ajuste puesto.
- `restoreOnStartup` no marca como `discarded` una pestaña que tiene WCV
  vivo en la ventana, ni le hace `spawnView` si ya lo tiene.
- `softActivate` (ciclo Ctrl+Tab) deja de abortar al toparse con un
  Ancla de otro workspace.
- `DiscardManager` exceptúa las Anclas bajo el mismo guard que las
  Cargas (`tabs:discard-pinned`, activo por defecto). El ajuste pasa a
  llamarse "No descartar Cargas ni Anclas".

Desanclar desde un workspace distinto al de la pestaña destruye su WCV y
la deja `discarded`: al dejar de ser Ancla vuelve a pertenecer solo a su
workspace, y una vista colgada de una ventana que mira a otro sitio
acabaría suspendida bajo un workspace que no es el suyo, donde
`activateTab` violaría su propio invariante.

## Consecuencias

- Una ventana mantiene vivos tantos WCV de Anclas como Anclas tenga el
  perfil, con independencia del workspace visible. Es el coste explícito
  de la función: un Ancla existe para no perder su estado. El
  `DiscardManager` sigue siendo la vía para liberarlos, desactivando "No
  descartar Cargas ni Anclas".
- `state.tabs` deja de ser "las pestañas del workspace visible" y pasa a
  ser "las pestañas con WCV vivo en esta ventana". Ningún recorrido
  existente asumía lo primero (`getTabIdForWebContents`,
  `applySplitBounds` y los de `detachWindow` son agnósticos), pero
  cualquier código nuevo que itere `state.tabs` debe filtrar por
  `workspaceId` si de verdad quiere solo las del workspace.
- Al **borrar** un workspace, `cleanupWorkspaceTabs` sigue destruyendo
  los WCV de Anclas de otros workspaces que estuvieran vivos en una
  ventana que mirase al workspace borrado. Es una acción rara y
  deliberada del usuario, y la pestaña se recarga; se acepta.
- Multi-ventana: si un Ancla está viva en la ventana A y se pulsa en la
  ventana B, B sigue creando su propia vista. Es la limitación
  preexistente de `tabToWindow` (una pestaña, una ventana) y queda
  fuera de este ADR.
