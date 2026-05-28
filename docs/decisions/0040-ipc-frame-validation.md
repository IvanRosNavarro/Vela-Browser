# ADR 0040 — Auditoría IPC: validación de frame y payload

## Estado
Aceptado — implementado en Fase 4.5.2

## Contexto
Los handlers IPC del main process pueden ser invocados desde cualquier
`WebContents`, incluidas pestañas web externas (si el canal está expuesto
en el preload de esa sesión). Un sitio malicioso podría intentar invocar
APIs de la shell con payloads arbitrarios. La auditoría de Fase 4.5
reveló que no todos los handlers validaban el frame emisor ni el payload
con zod.

## Decisión
- Todos los handlers IPC usan `validateIpc()` de
  `packages/main/src/ipc/validate.ts` antes de procesar el payload.
- `validateIpc()` comprueba dos cosas:
  1. **Frame**: el `WebContents` emisor es la shell (no un WCV de tab).
     Si no lo es, loguea `warn` y devuelve `{ ok: false }` sin procesar.
  2. **Payload**: valida contra el schema zod del canal (definido en
     `packages/shared/src/ipc-schemas.ts`). Si falla, devuelve
     `{ ok: false, error: 'invalid_payload', details }`.
- Los schemas zod existen en `ipc-schemas.ts` para todos los canales.
- El preload NO expone `ipcRenderer` directamente; solo los métodos
  tipados del `contextBridge`.

## Alternativas descartadas
- **Validar solo el payload (sin frame check)**: insuficiente; una tab
  podría invocar canales de la shell si el preload los expusiera.
- **Lista blanca de canales por sesión**: más granular pero compleja de
  mantener. El frame check es equivalente y más simple.

## Consecuencias
- Payloads malformados devuelven error estructurado sin crash del main.
- Frames no fiables son rechazados y logueados para auditoría.
- Todo canal IPC nuevo debe seguir este patrón obligatoriamente.
