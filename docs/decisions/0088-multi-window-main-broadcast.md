# ADR 0088 — Multi-ventana coordinado: broadcast en el main process

**Estado:** Aceptado  
**Fecha:** 2026-05-21

## Contexto

Vela permite abrir múltiples ventanas del mismo perfil. Cualquier cambio de datos
(tabs, workspaces, favoritos…) debe reflejarse inmediatamente en todas las ventanas
abiertas de ese perfil.

## Decisión

La coordinación multi-ventana se implementa cambiando el broadcast de estado de
"solo al renderer origen" a "todos los renderers del mismo perfil". El main process
de Electron es único y compartido entre todas las ventanas, por lo que ya tiene el
estado completo del perfil en memoria y en SQLite.

El `MainEventBus` ya emitía a todas las `BrowserWindow` de la aplicación. Se
introduce el `WindowRegistry` para llevar un índice en memoria de ventanas por
perfil, permitiendo broadcasts filtrados por `profileId`.

No se usan Yjs, WebSocket ni IPC entre renderers. Todo ocurre dentro del main
process de Electron.

## Alternativas descartadas

- **Yjs**: añade complejidad de CRDT innecesaria cuando el estado vive en un
  único SQLite centralizado.
- **IPC entre renderers**: Electron no permite IPC directo renderer→renderer;
  requeriría mensajes de doble salto (renderer→main→renderer), que es exactamente
  lo que ya hacemos, pero sin pasar el estado por el main.

## Consecuencias

- Sin coste de red ni serialización CRDT.
- El main puede aplicar el cambio una vez y notificar a N renderers.
- El renderer ya filtra por `windowId` y `profileId` en las suscripciones;
  no se requieren cambios en los componentes consumidores existentes.
