# ADR 0123 — Avisos de las pull requests que te afectan

- Estado: aceptado
- Fecha: 2026-09-25
- Versión: v0.3.0

## Contexto

Quien trabaja con GitHub abre la pestaña de `github.com/pulls` cada poco para
ver si le han pedido una revisión. El navegador ya tiene un centro de
notificaciones propio (ADR 0019) y un sitio en la barra de título donde caben
indicadores; lo que faltaba era quien preguntase a GitHub.

## Decisión

**El sondeo vive en main, no en una pestaña.** `IntegrationsService` evalúa cada
30 s si toca sondear y consulta como mucho cada 2 minutos. Así los avisos llegan
con el navegador abierto aunque no haya ninguna pestaña de GitHub, y el token no
pasa nunca por el renderer.

**Un proveedor, una interfaz.** `PrProvider` (`integrations/types.ts`) sabe
autenticarse y devolver las PRs que conciernen al usuario; nada más. El ciclo de
sondeo, la deduplicación, el tope de avisos y las notificaciones son comunes.
Bitbucket o Jira entran implementando esa interfaz, sin tocar el servicio.

**La búsqueda manda; el buzón matiza.** `search/issues` con
`review-requested:@me` e `involves:@me` fija el conjunto, porque garantiza que
solo se cuentan PRs todavía abiertas. El buzón (`/notifications`) no aporta PRs
nuevas —trae también cerradas— pero sí dice *qué* ha pasado: sin él, una mención
y un comentario se ven igual. Con PAT fine-grained el buzón no es accesible y el
motivo se degrada a `involved`.

**Los tokens se cifran con `safeStorage`, no con la clave del vault.** El
sondeo tiene que arrancar solo, y el vault empieza bloqueado en cada arranque
(v0.2.9): esperar a que el usuario teclee su contraseña dejaría los avisos
callados hasta entonces. Si el SO no ofrece almacenamiento cifrado, Vela no
guarda el token: se niega a conectar. El prefijo `integrations:` entra en
`NON_SYNCABLE_PREFIXES`, así que la credencial no viaja a los demás equipos de
la cuenta.

**Al conectar no se notifica nada.** El primer sondeo solo registra lo que hay:
todo es backlog y avisar de golpe de cuarenta PRs no sirve a nadie. A partir de
ahí se notifica lo nuevo, con tope de 5 avisos por ronda y uno final que resume
el resto.

**Un origen de notificación nuevo: `integration`.** `notifyFromVela` no pasa por
el permiso de notificaciones de un origen web —no hay página que lo pida— pero
sí respeta las reglas de silencio y el modo de visualización. El clic lleva a la
pull request, no al panel, y la abre en la última ventana que tuvo el foco en
ese perfil: abrirla en otra cualquiera la pondría donde el usuario no está
mirando.

**El contador de la barra de título desaparece cuando no hay nada.**
`PullRequestsButton` no se renderiza sin cuenta conectada o sin PRs pendientes:
no ocupa sitio para no decir nada.

## Consecuencias

- El límite de peticiones de GitHub se trata como lo que es —algo que se
  reintenta solo—: se anota `blockedUntil` y no se molesta al usuario. Solo una
  credencial rechazada pone la integración en `error` y pide reconectar.
- El `client_id` de la OAuth App se lee de `VELA_GITHUB_CLIENT_ID` en tiempo de
  ejecución y **el workflow de release no lo inyecta**, así que en los binarios
  publicados hoy la conexión por dispositivo solo funciona si el usuario
  registra su propia OAuth App e indica su identificador en
  `vela://settings#integrations`. Anotado en `docs/pending.md`.
- Vela nunca escribe en GitHub: los scopes que pide son de lectura
  (`notifications`, `repo`).
