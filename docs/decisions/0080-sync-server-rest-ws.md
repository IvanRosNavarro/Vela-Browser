# ADR 0080 — Servidor de sync: REST + WebSocket de notificación simple

## Estado
Aceptado — Fase 2

## Contexto
El servidor de sincronización necesita un protocolo de transporte. Las opciones evaluadas:
1. **y-websocket completo**: protocolo Yjs sobre WS para todas las entidades.
2. **REST puro con polling**: el cliente consulta periódicamente.
3. **REST + WebSocket de notificación**: REST para datos, WS solo para señalización de cambios.

## Decisión
**REST + WebSocket de notificación simple.**

El WebSocket solo entrega mensajes de la forma `{ type: 'entity:changed', entityType, profileId }`. El cliente recibe la notificación y hace un pull REST para obtener los datos. Los datos nunca viajan por el WebSocket.

Endpoints REST:
- `GET /sync/entities?since=<timestamp>` — delta de cambios desde un timestamp.
- `PUT /sync/entities/:type/:id` — upsert de una entidad.
- `DELETE /sync/entities/:type/:id` — eliminación lógica.
- `GET /sync/yjs/:workspaceId` — blob Yjs de notas.
- `PUT /sync/yjs/:workspaceId` — actualizar blob Yjs.

## Consecuencias
**Ventajas:**
- Mucho más simple que y-websocket completo para entidades no-CRDT.
- El REST es trazable, cacheable y fácil de depurar con curl.
- Desconexión del WS solo afecta a la latencia (polling de fallback), no a la integridad.
- El servidor puede ser stateless respecto al WS: cualquier instancia puede atender cualquier cliente.

**Desventajas:**
- Latencia de sync ligeramente mayor que push puro (round-trip extra). Aceptado: el target es <5s, no tiempo real.
- Si el WS cae, el cliente degrada a polling con backoff exponencial (implementado en `SyncManager`).
