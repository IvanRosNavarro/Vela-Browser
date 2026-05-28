# ADR 0048 — Preview hover reutiliza capturas WebP de Sub-fase 4B

## Estado
Aceptado — implementado en Fase 4.5.4d

## Contexto
El preview hover necesita una imagen de cada tab para mostrarla en la
miniatura. La Sub-fase 4B (ADR 0021) implementó un sistema de capturas
WebP por tab almacenadas en
`userData/profiles/{profileId}/previews/{tabId}.webp`, con throttling
de una captura máximo cada 5 s. Ya existen dos consumers: el modal MRU
(Sub-fase 4B) y el preview hover (Fase 4.5.4d).

## Decisión
- El preview hover **reutiliza** las capturas WebP existentes del
  sistema de Sub-fase 4B. No genera capturas adicionales.
- Acceso vía el protocolo `vela-preview://{profileId}/{tabId}` ya
  registrado.
- Si no hay captura disponible (tab recién abierta o descartada):
  placeholder con favicon centrado. Sin imagen rota ni espacio vacío.
- Tab descartada: placeholder + badge "Suspendida".

## Alternativas descartadas
- **Capturas dedicadas para el hover** (menor resolución, mayor
  frecuencia): añade carga de captura duplicada. El sistema de 4B es
  suficiente. Descartado.
- **Capturas bajo demanda en hover**: introduce latencia visible al
  usuario. Descartado.

## Consecuencias
- Cero coste adicional de captura para el hover preview.
- La calidad y frecuencia de las miniaturas depende del sistema de 4B:
  JPEG/WebP, máx una captura cada 5 s.
- Los dos consumers (modal MRU y hover preview) se benefician
  automáticamente de mejoras futuras en el sistema de capturas.
