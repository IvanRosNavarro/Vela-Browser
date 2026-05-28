# ADR 0079 — Arquitectura híbrida de sincronización: LWW + Yjs

## Estado
Aceptado — Fase 2

## Contexto
Vela necesita sincronizar distintos tipos de datos entre dispositivos con semánticas de conflicto diferentes:
- **Entidades estructurales** (workspaces, tabs, favoritos, settings, scripts, excepciones del adblocker): cada entidad es discreta, tiene dueño claro y raramente se edita en dos dispositivos al mismo tiempo.
- **Quick notes**: texto editable de forma colaborativa donde dos dispositivos pueden estar escribiendo offline simultáneamente.

Se evaluaron tres enfoques: LWW puro para todo, Yjs para todo, y arquitectura híbrida.

## Decisión
Arquitectura **híbrida**:
- **LWW (Last-Write-Wins)** para todas las entidades estructurales. El campo `updated_at` (timestamp de milisegundos) es el árbitro. En conflicto gana el más reciente.
- **Yjs Y.Text** para `quick_notes` únicamente. El Y.Doc se serializa como `Uint8Array` opaco y se sincroniza como bloque.

Arc Browser usa el mismo enfoque implícitamente: sync estructural + texto colaborativo separados.

## Consecuencias
**Ventajas:**
- LWW es suficiente para un usuario con 2-3 dispositivos: la edición simultánea real de una misma tab es prácticamente inexistente.
- Yjs solo donde hay texto editable; el protocolo general no arrastra la complejidad de CRDT.
- El servidor no necesita lógica de merge: almacena blobs y resuelve por timestamp.

**Desventajas:**
- En conflicto LWW extremo (reloj desajustado) puede perderse una edición. Riesgo aceptado: no hay edición crítica en tabs/favoritos.
- Yjs añade ~40 KB al bundle del renderer. Aceptado por la mejora de UX en notas colaborativas.
