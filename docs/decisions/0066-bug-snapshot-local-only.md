# ADR 0066 — Bug snapshot local únicamente, sin telemetría

## Estado
Aceptado — Fase 5.0.6

## Contexto
La captura de bug snapshot puede contener información sensible: URL visitada, DOM completo de la página, errores de consola con datos de usuario, peticiones de red con cookies/tokens.

## Decisión
El snapshot se genera y guarda **únicamente en local**, en el directorio de descargas del perfil, como archivo `.zip`. No se envía a ningún servidor. El usuario decide manualmente qué adjuntar a un informe de bug.

Los 5 archivos del zip:
1. `url.txt` — URL actual.
2. `dom.html` — HTML completo de la página (`outerHTML`).
3. `console.json` — buffer de errores de consola acumulado desde el inicio de la carga (capturado en preload).
4. `network.json` — peticiones de red vía `performance.getEntriesByType('resource')` (aproximación; no captura bodies ni headers de autenticación).
5. `screenshot.png` — captura visible de la página activa.

Si el usuario activa el toggle "no incluir red" en Privacy, `network.json` se incluye vacío.

## Consecuencias
**Ventajas:**
- Sin riesgo de fuga de datos sensibles por diseño.
- Sin dependencias de red para la captura.
- El usuario mantiene control total de qué comparte.

**Desventajas:**
- El equipo de desarrollo no recibe informes automáticos (trade-off aceptado en MVP).
- `network.json` es una aproximación: no captura cuerpos de respuesta ni headers de autenticación (limitación del API de Performance sin CDP habilitado al cargar).
