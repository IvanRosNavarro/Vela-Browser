# ADR 0049 — Preview hover: delay configurable de 500ms

## Estado
Aceptado — implementado en Fase 4.5.4d

## Contexto
El preview hover no debe activarse al pasar el cursor rápidamente por
la sidebar. Un delay evita activaciones accidentales al navegar entre
tabs o al mover el cursor hacia otro elemento.

## Decisión
- Delay por defecto: **500ms** desde que el cursor entra en una fila
  de tab (sin salir) hasta que se muestra el preview.
- El delay es configurable en `vela://settings`: rango 200ms–800ms.
- Si el cursor sale antes de que expire el timer, el timer se cancela
  y el preview no aparece.
- El delay es un `setTimeout` en el componente `TabRow`; se cancela
  en el handler de `onMouseLeave`.

## Consecuencias
- Navegación rápida entre tabs: sin activaciones accidentales.
- El valor de 500ms es percibido como "intencional" por el usuario.
  Por debajo de 200ms se percibe como nervioso; por encima de 800ms
  como lento.
- Ver ADR 0050 para el comportamiento al cambiar entre tabs sin salir
  del sidebar (el delay no se aplica en ese caso).
