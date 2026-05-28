# ADR 0041 — Command Palette con argumentos tipados

## Estado
Aceptado — implementado en Fase 4.5.4

## Contexto
El registro central de comandos tiene 40+ entradas. Algunos comandos
necesitan un argumento antes de ejecutarse (ej. "Mover pestaña a
workspace" necesita saber a qué workspace). El command palette debe
soportar un flujo de dos pasos: seleccionar comando → rellenar argumento
→ ejecutar.

## Decisión
- Los comandos pueden declarar un array `args` en su definición. Tipos
  soportados: `string`, `select` (lista fija), `tab` (tab abierta),
  `workspace` (workspace existente).
- Al seleccionar un comando con args, el palette entra en **modo args**:
  muestra el panel de argumentos con el primer arg no rellenado.
- `Escape` en modo args vuelve a la lista de comandos (no cierra).
- `Escape` en modo lista cierra el palette.
- Los comandos pueden declarar una condición `when()` que devuelve
  `boolean`. Si devuelve `false`, el comando no aparece en la lista.
  Ejemplo: `layout.closeSplit` solo aparece con Split View activo.
- `Ctrl+Shift+P` está marcado como `reserved` en `ShortcutTable` y no
  puede reasignarse desde settings (muestra "Reservado — no reasignable").

## Alternativas descartadas
- **Args inline en el input** (estilo VS Code `> comando arg`): requiere
  parseo de texto libre; peor UX para args tipo workspace (no hay
  autocompletado). Descartado.
- **Comandos sin args siempre**: limita la utilidad del palette para
  comandos que necesitan contexto. Descartado.

## Consecuencias
- El palette soporta comandos complejos sin UI dedicada por comando.
- La condición `when()` permite un catálogo único sin comandos huérfanos
  visibles al usuario.
- Al añadir un comando nuevo: registrar con `title`, `category`, `args`
  si aplica, y `when` si es contextual.
