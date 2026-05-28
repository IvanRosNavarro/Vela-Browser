# ADR 0059 — Modal de guardado de contraseñas no invasivo

## Estado
Aceptado — Fase 5.0.3

## Contexto
Los gestores de contraseñas tradicionales interrumpen al usuario con un banner o modal justo cuando está rellenando un formulario, antes de saber si el login tiene éxito.

## Decisión
La modal de guardado solo aparece **después** de que el login sea exitoso, detectado por una navegación post-submit hacia una URL diferente que no contenga indicadores de error (login failed, wrong password, etc.). El icono de llave en la URL bar permite acceder al guardado manual en cualquier momento.

## Consecuencias
**Ventajas:**
- No interrumpe al usuario durante el proceso de login.
- Elimina la frustración de ver la modal con credenciales erróneas.
- El icono de llave es un punto de entrada siempre disponible.

**Desventajas:**
- Puede perderse la captura si el sitio hace la navegación de forma asíncrona sin cambiar la URL (SPAs). Fallback: el usuario guarda manualmente.
- Heurísticas de detección de éxito pueden dar falsos negativos.
