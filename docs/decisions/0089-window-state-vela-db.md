# ADR 0089 — window_state vive en vela.db

**Estado:** Aceptado  
**Fecha:** 2026-05-21

## Contexto

Necesitamos persistir el estado de cada ventana (windowId estable, perfil,
workspace asignado, bounds) para restaurarlo entre reinicios de la aplicación.

## Decisión

La tabla `window_state` se guarda en `vela.db` (base de datos global de la
aplicación), no en `profile.db` (datos del perfil).

**Motivo**: el `windowId`, los bounds y el workspace asignado a una ventana son
datos de la sesión de esta máquina concreta, no datos del perfil que deban
sincronizarse entre dispositivos. Si el usuario tiene Vela en dos máquinas, cada
una tendrá su propia distribución de ventanas.

El `windowId` es un UUID estable generado al crear la ventana por primera vez y
persistido en `window_state`. Al abrir la ventana primaria de un perfil en un
reinicio, el main reutiliza el UUID guardado; para ventanas secundarias, siempre
se genera un UUID nuevo.

## Alternativas descartadas

- **En profile.db**: dificultaría el aislamiento de la sincronización E2EE, ya
  que los datos de ventana son específicos de este dispositivo.
- **En app_metadata (KV)**: no tiene estructura para múltiples ventanas por perfil.

## Consecuencias

- La sincronización entre dispositivos no transporta `window_state`.
- La migración `005-window-state.sql` se aplica a `vela.db`.
- `WindowStateRepository` opera sobre el `db` global, no sobre el `profileDb`.
