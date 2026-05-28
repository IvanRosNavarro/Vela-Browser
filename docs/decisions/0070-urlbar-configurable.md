# ADR 0070 — URL bar con iconos configurables

## Contexto

La URL bar de Vela acumula iconos con cada prompt. Sin una forma de configurarlos, la barra puede llegar a ser demasiado densa. El usuario debe poder ocultar iconos que no usa y reorganizarlos según sus preferencias.

## Decisión

Los iconos de la URL bar son configurables por perfil:

- **Visibilidad**: cada icono puede mostrarse u ocultarse.
- **Orden**: drag & drop con `@dnd-kit/core` (ya instalado en el proyecto).
- **Persistencia**: `settings_profile` bajo la clave `urlbar:icon-config` como `UrlBarIconConfig[]`.
- **Icono fijo**: el `SecurityIndicator` (candado) siempre es visible y no aparece en la lista de configuración.

### IDs de iconos configurables

```
cookie | adblocker | favorites | developer | copy-url | notifications | vault | page-indicators
```

### Defecto

`developer` está oculto por defecto (feature avanzada). El resto visible.

### Prioridad de los Aparejos

Si un Aparejo está "arriado" (desactivado), su icono en la URL bar se oculta aunque `urlBarStore` lo marque como visible. La visibilidad del Aparejo tiene prioridad.

### Sincronización en tiempo real

`urlbar:set-config` persiste y emite `state:urlbar-config-changed` al renderer para refrescar sin reload.

## Consecuencias

- `AddressBar.tsx` ya no tiene una lista hardcodeada de iconos; itera `urlBarStore.getOrderedVisible()`.
- Los iconos no configurables (ReaderButton, ScreenshotButton, SecureTabButton, AnchorButton) permanecen fuera de la lista — son herramientas contextuales, no permanentes.
- El orden de los iconos en el código no importa; el orden en pantalla viene del store.
