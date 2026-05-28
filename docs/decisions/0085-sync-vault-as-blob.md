# ADR 0085 — El vault se sincroniza como blob cifrado completo

## Estado
Aceptado — Fase 2

## Contexto
El vault de contraseñas (`vault.db`) tiene su propio cifrado AES-256-GCM entrada a entrada (ADR 0058). Al sincronizarlo se evaluaron dos enfoques:
1. **Sync por entradas individuales**: serializar cada credencial como entidad LWW, cifrar individualmente con la sync key.
2. **Sync del blob completo**: serializar `vault.db` completo como un blob binario, sincronizarlo como una única entidad opaca.

## Decisión
**El vault se sincroniza como blob cifrado completo.**

El blob es el contenido binario de `vault.db` tal como está en disco (ya cifrado AES-256-GCM por entrada desde Fase 5). Se añade una capa adicional de cifrado E2EE sobre el blob completo antes de enviarlo al servidor.

El servidor almacena una única entidad `vault_blob` por perfil con timestamp. En conflicto LWW: gana el timestamp más reciente.

## Consecuencias
**Ventajas:**
- **Consistencia garantizada**: el vault es atómico; no hay estado intermedio donde A tenga la entrada 1 nueva y B la entrada 2 nueva.
- **Implementación mínima**: sin serializer de entidades individuales para el vault, sin resolver merges de credenciales.
- **Doble cifrado**: el blob ya cifrado por `VaultManager` + capa E2EE de sync. El servidor ve un blob doblemente opaco.

**Desventajas:**
- Transferir el blob completo aunque solo cambie una contraseña (trade-off aceptado: el vault raramente supera unos pocos KB en uso normal).
- En conflicto extremo (edición simultánea en dos dispositivos offline), se pierde la edición del dispositivo con timestamp más antiguo. Riesgo aceptado: el caso de uso real es "añado una contraseña en el móvil, la quiero en el escritorio", no edición concurrente.
