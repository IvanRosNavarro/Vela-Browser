# 0104 — El servidor no notifica a quien acaba de escribir

Fecha: 2026-09-04
Estado: aceptado

## Contexto

En una instalación con dos ventanas abiertas, cada una con un perfil distinto
bajo la misma cuenta, `sync:last-seq` del perfil principal llegó a **10,17
millones** y subía ~1.350 cada 30 s (≈45 escrituras por segundo) sin que
cambiara ni una fila de `tree_nodes`, `workspaces`, `settings_profile`,
`profile_favorites`, `adblocker_exceptions` ni `quick_notes`, y con
`sync_pending` vacía. El segundo perfil estaba parado.

Cada vuelta de ese ciclo hace un fetch HTTPS, descifra, fusiona y escribe
`sync:last-seq` en SQLite. `node:sqlite` es **síncrono**: bloquea el bucle de
eventos del proceso main. Con el main saturado, las respuestas de
`vault:count-for-domain` y `vault:get-pending` llegaban tarde y el icono de
llave se quedaba sin dibujar.

La causa: `req.ws` estaba **declarado** en la interfaz `Express.Request` pero
**nunca asignado**, así que las tres llamadas a `notifyPeers` pasaban `null`
como `excludeWs` y el servidor avisaba a todas las conexiones del usuario,
incluida la del dispositivo que acababa de escribir. Cada push se provocaba su
propio pull. Con dos `SyncManager` compartiendo `userId` el efecto se
realimenta.

## Decisión

**Servidor.** El middleware `requireAuth` expone `req.deviceToken`. Las
conexiones WebSocket guardan el token con el que se autenticaron
(`connectionTokens`, un `WeakMap`), y `notifyPeers` recibe un `excludeToken` en
lugar de un objeto `WebSocket` — la petición llega por HTTP, donde no hay
socket que excluir, que es por lo que el parámetro anterior era inservible.

**Cliente.** `pullChanges` deja de llamarse a sí misma dentro de su propio
`finally`. Los avisos que llegan mientras baja se atienden en un `while` con
un tope de `MAX_PULL_ROUNDS`. La versión recursiva anidaba una llamada por
aviso: el log muestra ocho niveles de `pullChanges` en la misma traza.

**Coalescencia.** Un aviso del WebSocket no dispara el pull de inmediato: se
agrupa con los que lleguen en `PULL_DEBOUNCE_MS`. Es una red de seguridad del
lado cliente — un servidor que hable de más no debe poder estrangular el main.

## Paginación

Aparte, `GET /sync/entities` tenía `LIMIT 1000` pero devolvía
`current_seq = profile_sequences.last_seq`, el máximo del perfil. El cliente
guarda ese valor como su nuevo punto de partida, así que con más de mil
entidades pendientes **se saltaba en silencio** todo lo que no cupo en el lote
y no volvía a pedirlo nunca. Ahora la respuesta lleva el `server_seq` de la
última entidad entregada más `has_more`, y el cliente encadena páginas.

## Consecuencias

- El arreglo que corta el ciclo de raíz está en el servidor: no surte efecto
  hasta desplegar `packages/sync-server/`. Los cambios de cliente (bucle en vez
  de recursión, coalescencia) acotan el daño mientras tanto.
- El `last_seq` inflado del perfil afectado se queda como está. No estorba: las
  entidades nuevas se escriben con `nextSeq` por encima de ese valor.
