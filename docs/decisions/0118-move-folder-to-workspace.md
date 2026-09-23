# ADR 0118 — Mover una carpeta entera a otro workspace

- Estado: aceptado
- Fecha: 2026-09-23
- Versión: v0.2.9

## Contexto

El menú contextual de una pestaña lleva desde hace tiempo "Mover a workspace",
pero el de una carpeta no: reorganizar un grupo de pestañas obligaba a moverlas
de una en una y a reconstruir la jerarquía en el destino a mano.

El movimiento en sí ya estaba resuelto en la capa de datos:
`TreeNodeRepository.move` arrastra el subárbol completo al nuevo workspace
dentro de la misma transacción cuando el `workspace_id` cambia. Lo que faltaba
era la entrada en la interfaz — y una pieza que el menú de pestañas tampoco
tenía.

Esa pieza es qué ocurre con los `WebContentsView` vivos. Mover un nodo a otro
workspace solo cambiaba el árbol: la web seguía pintada en la ventana después
de que su fila desapareciera de la sidebar, y si era la pestaña activa se
quedaba encima del workspace de origen hasta cambiar de workspace. Con una
pestaña suelta el despiste es pequeño; con una carpeta entera, que puede
arrastrar la activa y varias pestañas cargadas, deja de serlo.

## Decisión

- **`TabManager.releaseTabsMovedToOtherWorkspace(tabIds)`**: destruye el WCV de
  las pestañas cuyo `workspace_id` ya no coincide con el de la ventana que lo
  aloja, las saca de `state.tabs`, del MRU (de ventana y de perfil) y de
  `panelTabIds`, y si una de ellas era la activa activa la siguiente por MRU
  (`pickNextTab`) o emite `ACTIVE_TAB_CHANGED` con `tabId: null`. El nodo no se
  toca: la vista se vuelve a crear al entrar en el workspace destino.
- **Las Anclas se saltan**: su WCV vive en la ventana independientemente del
  workspace (ADR 0100), así que moverlas de workspace no debe costarles la
  sesión viva.
- **Los handlers `node:move` y `node:move-many` lo invocan** cuando el
  movimiento cruza de workspace, con el nodo y todo su subárbol
  (`getDescendants`). Así vale igual para la carpeta, para la pestaña suelta y
  para la selección múltiple, que hasta ahora tenían el mismo defecto.
- **La entrada de menú vive en los dos sitios**: `FolderRow.tsx` (sidebar de la
  shell) y `makeFolderContextMenu` de `pages/sidebar-floating/`, que mantiene su
  propia copia por no tener acceso a los stores de la shell. La carpeta se
  encola al final de la raíz del workspace destino, con `generateKeyBetween`,
  igual que hace el menú de pestañas.
- **Feedback**: toast «"X" movida a "Y"» cuyo clic cambia a ese workspace, el
  mismo patrón que `LINK_OPENED_IN_WORKSPACE`. El sidebar flotante no lo emite:
  es una página aparte sin el toaster de la shell.

## Consecuencias

- Las pestañas de la carpeta movida pierden su estado vivo (scroll, formularios
  a medio escribir) y recargan la URL al abrir el workspace destino. Es el mismo
  precio que ya se paga al cambiar de workspace con la suspensión por defecto.
  Guardarlas en `suspendedWorkspaces` del destino lo evitaría, pero ese mapa se
  restaura en bloque por `(windowId, workspaceId)` y mezclar entradas sueltas lo
  volvería frágil.
- Mover una carpeta que contiene la pestaña activa deja la ventana en la
  siguiente pestaña por MRU, o sin ninguna activa si el workspace se queda
  vacío.
- Cualquier vía futura que cambie el `workspace_id` de un nodo debe llamar
  también a `releaseTabsMovedToOtherWorkspace`, o reaparecerá la web huérfana.
