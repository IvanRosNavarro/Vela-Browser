# ADR 0112 — Autocompletado en la barra de direcciones

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

La barra de URL sugería historial en una lista, pero no completaba dentro del
propio campo como Chrome o Firefox.

## Decisión

- **`HistoryRepository.autocomplete(prefix)`** busca URLs http(s) cuya forma
  visible (sin esquema ni `www.`) empieza por lo escrito. Si lo escrito no pasa
  del host, completa hasta el origen sumando la puntuación de sus URLs; si
  incluye ruta, hasta la URL más puntuada.
- **Frecencia en SQL** por tramos de antigüedad de cada visita (100/70/50/30/10
  según ≤4/14/31/90 días o más), estilo Firefox. Sin columna precalculada, así
  que no hay migración. La consulta va por rango sobre `idx_history_url` con
  `LIMIT 200` por variante: es barata aunque se llame a cada tecla.
- Canal `history:autocomplete` (zod + `guardTrustedFrame`); suma favoritos y
  pestañas abiertas como candidatos con peso extra.
- **Hook `useInlineAutocomplete`**, compartido por la barra de URL y el buscador
  de `vela://newtab`:
  - solo completa al teclear (`insertText`), con el cursor al final, sin
    selección y fuera de composición IME;
  - desactivado con los prefijos `>`, `#`, `@` y `!alias` y cuando hay espacios;
  - descarta respuestas obsoletas por número de secuencia.
- **Teclas**: Enter navega a lo completado; →, Fin, ← e Inicio aceptan (como
  Chrome); Retroceso y Supr borran lo completado; Escape lo quita.
- La compleción encabeza la lista de sugerencias y sale resaltada, para que lo
  que muestra el campo y lo que hace Enter coincidan.
- Ajuste de perfil `addressbar:inline-autocomplete`, activo por defecto.

## Consecuencias

- La entrada destacada en la lista no tiene título ni favicon.
