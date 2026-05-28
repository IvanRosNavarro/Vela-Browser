# ADR 0062 — Auditoría de breaches con HIBP y k-anonymity

## Estado
Aceptado — Fase 5.0.3

## Contexto
La auditoría de seguridad del vault necesita comprobar si una contraseña ha aparecido en brechas conocidas. Enviar la contraseña completa a un tercero es inaceptable.

## Decisión
Usar la API de Have I Been Pwned con el modelo **k-anonymity**: se computa el hash SHA-1 de la contraseña, se envían solo los primeros 5 caracteres hexadecimales (`/range/{prefix}`) y HIBP devuelve todos los hashes que comparten ese prefijo. La comprobación del sufijo se hace en local.

## Consecuencias
**Ventajas:**
- HIBP nunca recibe la contraseña ni el hash completo.
- El modelo k-anonymity está documentado y auditado públicamente.
- Sin API key requerida para el endpoint `/range/`.

**Desventajas:**
- Requiere conexión a internet para la auditoría (no funciona offline).
- La comprobación tiene ~600ms de latencia de red (aceptable para una auditoría bajo demanda).
