# ADR 0052 — Favorites (scope perfil) vs Pinned (scope workspace)

## Estado
Aceptado

## Contexto
El navegador necesita dos mecanismos de acceso rápido a URLs:

- **Pinned (anclados)**: pestañas fijadas en un workspace concreto. El usuario las quiere
  visibles cuando está en ese workspace, pero no necesariamente en los demás.
  Persisten como `TreeNode` con `pinned: true` en el árbol de ese workspace.

- **Favorites (favoritos)**: URLs guardadas de forma permanente a nivel de perfil.
  El usuario quiere acceder a ellas desde cualquier workspace sin importar cuál
  esté activo.

La pregunta inicial fue: ¿son la misma entidad con distinto scope, o entidades
distintas?

## Decisión
Son entidades **ortogonales** con propósitos distintos:

| Aspecto           | Pinned                       | Favorites                    |
|-------------------|------------------------------|------------------------------|
| Scope             | Workspace                    | Perfil                       |
| Modelo de datos   | `TreeNode.pinned = true`     | `profile_favorites` tabla    |
| Persistencia      | profile.db (workspace)       | profile.db (tabla global)    |
| Posición en UI    | Franja 2 del sidebar         | Franja 1 del sidebar         |
| Puede coexistir   | Sí — la misma URL puede ser  | Sí — Favorite global Y       |
|                   | Pinned en workspace X        | Pinned en workspace X        |

La misma URL puede estar simultáneamente como Favorite global Y como Pinned
en un workspace específico sin redundancia lógica: significan cosas distintas.

## Consecuencias
- `FavoritesRepository` es una nueva tabla `profile_favorites` en `profile.db`.
- Los indicadores de tab abierta en el `GlobalFavoritesBar` consultan el `treeStore`
  pero NO modifican los nodes; solo leen el estado de runtime.
- La UI separa visualmente las dos franjas con un separador de 1px.
