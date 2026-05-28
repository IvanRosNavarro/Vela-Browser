# ADR 0057 — Listas de filtros del ad blocker compartidas entre perfiles

## Estado
Aceptado — Fase 5.0.2

## Contexto
Cada perfil tiene su propia sesión de Electron. Si cada perfil descargara sus propias listas de filtros, el disco y la red se consumirían N veces.

## Decisión
Las listas de filtros (`easylists/`, `ublock-filters/`) se almacenan en `userData/` raíz (compartido entre perfiles). Las excepciones de usuario se guardan en `adblocker_exceptions` en `profile.db` de cada perfil (scope por perfil).

## Consecuencias
**Ventajas:**
- Una sola descarga y actualización cada 24 h independientemente del número de perfiles.
- Ahorro de disco significativo en entornos multi-perfil.

**Desventajas:**
- Si un perfil actualiza las listas durante una sesión compartida, los otros perfiles en memoria deben recargar el blocker (señal IPC interna).

**Invariante:** nunca compartir excepciones entre perfiles. Cada perfil tiene soberanía sobre sus propias excepciones de sitio.
