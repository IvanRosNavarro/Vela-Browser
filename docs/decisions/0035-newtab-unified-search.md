# ADR 0035 — New Tab con búsqueda unificada y cards de workspaces

**Fecha**: 2026-05-14
**Estado**: Aceptado
**Sub-fase**: 4E

## Contexto

`vela://newtab` existía como stub desde Sub-fase 4A. La URL bar ya ofrece
búsqueda unificada (tabs, historial, motores), pero vive en la barra de título,
lejos del centro visual de la pantalla. Al abrir una nueva pestaña el usuario
espera un punto de partida accionable, no una página en blanco.

## Decisión

`vela://newtab` se implementa con tres bloques principales:

1. **UnifiedSearch centrado**: campo de búsqueda con foco automático al abrir
   la tab. Reutiliza `resolveQueryToUrl` de `useAddressBar` para garantizar
   comportamiento consistente con la URL bar (motores configurados, sugerencias
   de tabs, sugerencias del historial). Las secciones de resultados son: Tabs
   abiertas → Historial → Búsqueda en motor (siempre presente como fallback).

2. **WorkspaceCards**: rejilla de cards mostrando los workspaces del perfil con
   sus tabs activas. El workspace activo se marca con el color `--vela-accent`.
   Click en una tab de otro workspace lo activa y navega a esa tab. Las cards
   leen del `treeStore` existente; no se requiere IPC adicional.

3. **Quick Notes por workspace**: área de texto asociada al workspace activo.
   Debounce de 500 ms antes de persistir en la tabla `quick_notes` de
   `profile.db` (migración 008). URLs en modo display se vuelven clicables.
   Las notas sobreviven reinicios de Vela.

### Configuración de página de nueva pestaña

Setting `newtab:mode` en `settings_profile` con tres valores:
- `vela` (por defecto): carga `vela://newtab`.
- `blank`: abre `about:blank`.
- `custom`: carga la URL guardada en `newtab:custom-url`.

## Alternativas descartadas

- **Redirigir a la URL bar**: la barra de título está en la parte superior;
  el usuario tiene que mirar hacia arriba. No es el patrón de Chrome, Arc ni Edge.
- **Iframe con página externa**: rompe el aislamiento de sesión y requiere
  conexión a internet. No apto para uso offline.
- **Página estática con links favoritos**: demasiado estático. Los workspaces
  son la unidad de organización central de Vela; exponerlos en new tab es más
  valioso.

## Consecuencias

- `UnifiedSearch` encapsula la lógica de resolución de queries; si cambia
  la lógica de la URL bar hay que mantener ambas en sync.
- Quick notes usan `quick_notes` en `profile.db`; en Fase 2 se sincronizarán
  vía Yjs como `Y.Text` por workspace para resolución de conflictos CRDT.
- El setting `newtab:mode` vive en `settings_profile` (scope por perfil).
