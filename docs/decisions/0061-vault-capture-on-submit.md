# ADR 0061 — Captura de credenciales en submit, no en keydown

## Estado
Aceptado — Fase 5.0.3

## Contexto
Necesitamos capturar usuario y contraseña del formulario. Las opciones son: escuchar cada keystroke (keydown) o capturar en el submit.

## Decisión
Las credenciales se capturan en el evento `submit` del formulario, leyendo `input[type=password]` y el campo de usuario asociado en ese momento. La modal de guardado solo se muestra si la navegación post-submit indica éxito (ver ADR 0059).

## Consecuencias
**Ventajas:**
- No se procesan datos mientras el usuario escribe (menos riesgo de capturar contraseñas parciales).
- Compatible con gestores de contraseñas externos: si el usuario usa Bitwarden para rellenar, el submit captura el valor final.
- Menor superficie de ataque: el preload no tiene un listener keydown activo en todos los inputs.

**Desventajas:**
- Si el formulario envía vía JS sin disparar el evento `submit` nativo, la captura falla. Fallback al guardado manual.
