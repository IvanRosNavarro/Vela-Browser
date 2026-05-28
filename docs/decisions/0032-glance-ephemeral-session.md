# ADR-0032 — Glance: sesión efímera in-memory

## Estado
Aceptado — Sub-fase 4D, Prompt 4D.2 (2026-05-14)

## Contexto
Glance precarga el contenido de un enlace mientras el usuario mantiene el cursor sobre él
(con modificador Ctrl por defecto; configurable a Shift). Es necesario decidir qué sesión
usa ese WebContentsView efímero.

## Decisión
Glance usa una **sesión efímera in-memory** (`session.fromPartition('glance-ephemeral', { cache: false })`),
completamente separada de la sesión del perfil activo.

Esto significa:
- El historial del perfil **no registra** visitas de Glance.
- Las cookies y el caché del perfil **no se contaminan**.
- Los sitios donde el usuario está autenticado aparecerán como no autenticados en Glance.

## Motivación
**Privacidad por diseño**: Glance es una herramienta de previsualización, no de navegación.
Contaminar el historial o el caché con previsualizaciones efímeras degradaría la señal de
navegación real y podría filtrar datos sensibles a través del historial.

El comportamiento "no autenticado" es correcto y deseable: avisa al usuario de que lo que ve
en Glance puede diferir del contenido real una vez abierto como tab completa.

## Alternativa descartada
**Usar la sesión del perfil**: filtración de cookies, historial contaminado, interferencias
con autenticación SSO. Descartada.

## Consecuencias
- Solo 1 Glance activo simultáneamente (singleton en `GlanceManager`).
- Timeout de 200 ms en el preload antes de abrir el Glance (evita aperturas involuntarias).
- Al convertir el Glance en tab completa ("Abrir"), se crea una tab nueva con la sesión del
  perfil; el contenido se recarga autenticado.
- El WCV de Glance se destruye al cerrarse; la sesión efímera no persiste.
