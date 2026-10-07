# ADR 0124 — Avisos de Bitbucket y de Jira

- Estado: aceptado
- Fecha: 2026-10-05
- Versión: v0.3.1

## Contexto

El ADR 0123 dejó los avisos de pull requests de GitHub montados sobre una
interfaz de proveedor (`PrProvider`) para que otras plataformas entrasen sin
tocar el ciclo de sondeo. Las dos siguientes son las de Atlassian: Bitbucket,
que también son pull requests, y Jira, que no lo son. Atlassian impone además
condiciones que GitHub no tiene: no hay inicio de sesión posible para una app
de escritorio, hay dos clases de token que se usan contra URLs distintas y
falta el endpoint que haría barato saber qué PRs te toca revisar.

## Decisión

**Email + API token, no OAuth.** El OAuth 2.0 (3LO) de Atlassian exige client
secret, no admite PKCE sin él y tiene desactivado el device grant. En una app de
código abierto el secret sería público, así que la única vía limpia es que el
usuario cree un API token y lo pegue junto a su email (van en Basic auth). La
pantalla de conexión dice qué token crear y, en Bitbucket, los cuatro permisos
que necesita (`read:user`, `read:workspace`, `read:repository` y
`read:pullrequest`). Los *app passwords* no son opción: Atlassian los retiró en
junio de 2026.

**Solo se avisa de lo que hacen otros.** La interfaz gana un método opcional,
`explainChange`, que el servicio consulta solo para lo que ha cambiado desde la
ronda anterior: dice quién hizo el último cambio y qué fue. Si lo hizo el
propio usuario, no hay aviso. Bitbucket lo saca del historial de actividad de
la PR; Jira, de la creación del issue, su último comentario y la última entrada
del historial. Si la consulta falla se avisa igual con el motivo del listado:
perderse un aviso es peor que uno de más. Hay un tope de diez consultas por
ronda.

Una PR que aparece por primera vez sí avisa aunque la hayas abierto tú, como en
GitHub. En Jira, no: un issue que aparece porque acabas de crearlo o comentarlo
también lo has tocado tú.

**Los elementos dejan de ser solo pull requests.** `PullRequestSummary` pasa a
`IntegrationItem`, con `kind` (`pull-request` | `issue`) y `ref` para mostrar
(`acme/web#7`, `WEB-12`). Los motivos ganan `reviewed` y `updated`.

**Jira no entra en el contador de la barra de título.** Los issues asignados
suelen ser el backlog entero y el número dejaría de decir nada. El contador
suma las pull requests de GitHub y Bitbucket; los avisos de Jira van solo al
centro de notificaciones.

**El sitio de Jira se valida antes de cualquier petición.** Lo escribe el
usuario y acaba recibiendo su token desde main. `normalizeJiraSite` acepta
`acme`, `acme.atlassian.net` o una URL del sitio, y rechaza todo host que no
sea `<nombre>.atlassian.net` o `<nombre>.jira.com`, http en claro, puertos y
usuario en la URL. Sin esto, el campo serviría para que main enviase el token a
donde se le indicara.

**Jira acepta las dos clases de token.** Los clásicos funcionan contra el
propio sitio; los que llevan scopes dan 401 ahí y solo se aceptan por la
pasarela `api.atlassian.com/ex/jira/{cloudId}`. Se prueba el sitio y, si lo
rechaza, se resuelve el `cloudId` en `/_edge/tenant_info` (público) y se
reintenta por la pasarela. La base que funcione queda en la cuenta
(`apiBase`). La búsqueda usa `/rest/api/3/search/jql`, el que queda tras
retirarse `/rest/api/3/search`.

**Bitbucket recorre repos, con topes.** En febrero de 2025 Bitbucket retiró el
endpoint que listaba entre workspaces las PRs de un usuario, y nunca hubo uno
para las que le toca revisar. Las propias salen de un endpoint por workspace;
las de revisión, de consultar cada repo con actividad en los últimos 30 días
(como mucho 25). Los workspaces se piden una vez por hora. Bitbucket sondea cada
5 minutos en vez de cada 2 (`pollIntervalMs` por proveedor): con 2, un usuario
con varios workspaces se acercaría al límite de 1000 peticiones por hora. Un 403
o 404 en un repo concreto se salta; solo en la verificación de la cuenta es
fatal.

## Consecuencias

- Una PR donde eres revisor en un repo sin actividad en el último mes no
  aparece. Es el precio de no agotar el límite de peticiones.
- Las credenciales de Atlassian (email, token y, en Jira, sitio) se cifran
  juntas en el mismo blob con `safeStorage`. Las de GitHub siguen guardando el
  token tal cual, para que las cuentas conectadas en v0.3.0 sigan funcionando.
- Los rechazos de una plataforma llegan a la interfaz con su motivo, con el
  código IPC `INTEGRATION_REJECTED`. Antes acababan en un `INTERNAL` genérico.
- GitHub no implementa `explainChange` todavía, así que sigue avisando de los
  comentarios del propio usuario en sus PRs. Anotado en `docs/pending.md`.
- Bitbucket y Jira se han verificado con tests que simulan su API, no contra
  cuentas reales. Anotado en `docs/pending.md`.

## Actualización v0.3.2

- **GitHub ya implementa `explainChange`** y deja de avisar de los cambios del
  propio usuario. Con buzón se le pregunta al buzón: GitHub no te notifica de tus
  propias acciones, así que si el hilo de la PR en `/notifications?all=true` no
  se movió a la vez que ella (margen de dos minutos), el cambio fue tuyo; de paso
  da el motivo bueno. Sin buzón (token fine-grained) se lee la última página de
  la línea de tiempo de la PR. Los `committed` no cuentan: traen el autor de
  git, no la cuenta de GitHub. Una cabecera `Link` que no apunte a la API no se
  sigue.
- **Bitbucket sigue los repos donde hay algo para ti.** La consecuencia anterior
  —que una PR a revisar en un repo sin actividad en 30 días no aparecía— queda
  resuelta: el repo donde aparece una PR a revisar pasa a un conjunto de
  «seguidos» que se consulta antes que los activos, dentro del mismo tope, y
  sale cuando la consulta da cero. Ese conjunto vive en memoria, así que al
  arrancar se siembra con los repos de los ids ya vistos, que el servicio pasa
  a `listRelevant` en `context.knownIds`. El nombre del repo sale del perfil y
  acaba en una URL de la API: `repoFromItemId` solo acepta `workspace/slug` y
  rechaza los segmentos `.` y `..`.
- Sigue sin cubrirse un caso: que te añadan como revisor a una PR antigua de un
  repo sin actividad, si nunca antes habías tenido nada en él.
