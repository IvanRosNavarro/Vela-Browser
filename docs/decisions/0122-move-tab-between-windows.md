# ADR 0122 — Mover una pestaña a otra ventana

- Estado: aceptado
- Fecha: 2026-09-24
- Versión: v0.2.11

## Contexto

Con varias ventanas abiertas (ADRs 0088–0091) no había forma de llevarse una
pestaña de una a otra: había que copiar la dirección, abrirla al lado y cerrar
la original, perdiendo por el camino la sesión, el scroll y lo que estuviera a
medio escribir.

## Decisión

**La vista viaja; la pestaña no se recarga.** Electron permite sacar un
`WebContentsView` de una ventana (`removeChildView`) y meterlo en otra
(`addChildView`) sin destruirlo. Comprobado en Electron con audio sonando: el
mismo target de DevTools sobrevive al cambio y el `currentTime` sigue avanzando
desde donde estaba (25,3 s → 29,9 s, sin pausa). Lo que hay que mover a mano es
el estado que `TabManager` mantiene en paralelo: el mapa de vistas, `tabToWindow`,
el MRU de cada ventana, los paneles de Split View y la pestaña activa.

**`TabManager.moveTabToWindow(tabId, targetWindowId)`** devuelve:

- `moved` — la vista viva cambió de ventana.
- `reopened` — las ventanas son de perfiles distintos.
- `noop` — la pestaña ya estaba allí.

**Perfiles distintos: se abre la URL, no se mueve la sesión.** Cada perfil tiene
su partición (`persist:profile-{uuid}`), así que una pestaña no puede cruzar
llevándose cookies ni sesión. En ese caso se abre la dirección en la ventana
destino y se cierra la de origen, y la interfaz lo dice con un aviso en vez de
fingir que se movió. El nodo se lee con los repositorios **del perfil de
origen**: con los del destino no existe, y la comprobación del perfil no llegaba
a ejecutarse nunca.

**Workspace destino.** Si la ventana destino muestra otro workspace, el nodo se
mueve allí llamando al repositorio directamente, no al handler `node:move`: ese
suelta la vista de las pestañas que cambian de workspace (ADR 0118) y aquí
queremos exactamente lo contrario.

**La entrada está en el menú contextual** («Mover a ventana»), junto a «Mover a
workspace», y lista las demás ventanas abiertas con el nombre de su workspace.
No hay arrastre entre ventanas: dos ventanas de Electron son dos documentos
distintos y dnd-kit no cruza esa frontera. Se puede aproximar más adelante
mirando qué ventana hay bajo el cursor al soltar, pero el menú resuelve el caso
sin inventar mecanismos frágiles.

## Consecuencias

- Con ambas ventanas en el mismo workspace, la pestaña sigue apareciendo en las
  dos barras laterales: el árbol es del workspace, no de la ventana. Lo que
  cambia es dónde vive la vista, que es lo que el usuario percibe.
- Si la pestaña movida era la activa en la ventana de origen, esa ventana pasa a
  la siguiente por MRU, o se queda sin pestaña activa si no hay más.
- Una pestaña suspendida (sin vista viva) se mueve igual: el árbol apunta a la
  ventana destino y la vista nace allí al activarla.
- El caso de perfiles distintos tiene el código y el aviso, pero **no está
  probado en vivo**: montar dos ventanas de perfiles distintos desde fuera no
  salió, y la prueba a mano son dos clics. Anotado en `docs/pending.md`.
