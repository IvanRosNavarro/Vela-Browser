# ADR 0053 — Sidebar de cuatro zonas

## Estado
Aceptado

## Contexto
La sidebar tenía tres zonas: Pinned / Árbol / Footer. Con la introducción de
Favorites de scope perfil se necesita una cuarta zona, siempre visible, que
muestre los favoritos independientemente del workspace activo.

## Decisión
Cuatro zonas verticales, de arriba hacia abajo:

1. **Franja Favorites** (`GlobalFavoritesBar`) — scope perfil, visible desde
   cualquier workspace. `display: none` si no hay ningún favorito y no hay
   drag activo.
2. **Franja Pinned** (`FavoritesBar` existente) — scope workspace, pestañas con
   `pinned: true`. `display: none` si no hay ninguna y no hay drag activo.
3. **Árbol de tabs** (`TreeView`) — scrollable, sin cambios.
4. **Footer** (`SidebarFooter`) — fijo abajo, sin cambios.

El orden Favorites > Pinned refleja que el scope del Favorite (perfil entero)
es mayor que el del Pinned (un workspace). Lo más global va arriba.

## Implementación
- `GlobalFavoritesBar` usa su propio `DndContext` interno para reordenación
  entre favoritos.
- El `DndContext` padre de `Sidebar` gestiona el drop de tabs del árbol hacia
  `GlobalFavoritesBar` mediante el droppable `GLOBAL_FAVORITES_TARGET`.
- El highlight accent-15% en la franja durante el hover de drag se gestiona
  con la prop `isExternalDragOver` para no introducir estado global.

## Consecuencias
- El drag de un tab del árbol sobre `GlobalFavoritesBar` añade el tab como
  favorito sin moverlo ni modificar el árbol.
- Las dos franjas superiores pueden quedar ambas vacías; la sidebar no muestra
  espacio en blanco innecesario.
