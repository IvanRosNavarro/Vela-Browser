# ADR 0044 — Swipe de trackpad diferido a post-1.0

## Estado
Aceptado — diferido

## Contexto
Los gestos de ratón se adelantaron a Fase 4.5 (ADR 0043). El swipe de
trackpad (dos dedos) es diferente: requiere acceso a eventos de scroll
con información de fase (inertia, began, ended) que Electron expone de
forma asimétrica entre plataformas.

## Decisión
El swipe de trackpad se mantiene en post-1.0.

## Razonamiento
- **macOS**: Electron 35+ expone `scroll-touch-begin` / `scroll-touch-end`
  en `BrowserWindow`. Soporte nativo viable.
- **Windows**: los eventos de fase de scroll no están disponibles en
  Electron. Requeriría un addon nativo (WinRT `IScrollBarInfo` o
  `DirectInput`). Complejidad desproporcionada.
- **Linux**: soporte fragmentado según el backend de input (X11 vs Wayland).
- Implementar solo en macOS crearía asimetría de UX entre plataformas.
  Vela busca paridad de features entre plataformas en el MVP.

## Consecuencias
- Los usuarios de macOS no tienen swipe de trackpad hasta post-1.0.
- Al iniciar el trabajo post-1.0, redactar ADR de implementación
  detallando la estrategia por plataforma.
