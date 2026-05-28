# ADR 0054 — Icono estrella en la URL bar

## Estado
Aceptado

## Contexto
El usuario necesita una forma rápida de añadir/quitar la página activa de sus
Favorites sin necesidad de abrir `vela://favorites`.

## Decisión
Añadir un botón `FavoriteButton` dentro de la URL bar, posicionado justo antes
del botón de copiar URL. Patrón de opacidad consistente con los demás iconos
contextuales:

| Estado             | Icono           | Color          | Opacidad |
|--------------------|-----------------|----------------|----------|
| No es Favorite     | `ti-star` vacío | fg-muted       | 0.4      |
| Es Favorite        | `ti-star` relleno | accent       | 1.0      |

Solo visible para URLs `http://` y `https://`. Oculto en edición, en páginas
internas `vela://` y en `about:blank`.

El botón lee `useFavoritesStore` para estado reactivo: se actualiza
automáticamente cuando otro componente (la `GlobalFavoritesBar`, la página
`vela://favorites`) modifica el listado de favoritos vía el evento
`state:favorites-changed`.

## Consecuencias
- Click añade: recoge `url`, `title` y `favicon` del tab activo y llama
  `favorites:add`.
- Click quita: llama `favorites:remove` con el id del favorito existente.
- Animación `scale(1.3)` de 300 ms proporciona feedback visual en ambos casos.
- No requiere overlay ni modal; la interacción es síncrona desde el punto de
  vista del usuario.
