# ADR 0084 — El historial de navegación no se sincroniza

## Estado
Aceptado — Fase 2

## Contexto
La tabla `history` de `profile.db` puede crecer a cientos de miles de filas. Se evaluó incluirla en la sincronización E2EE junto con el resto de entidades.

## Decisión
**El historial no se sincroniza en v1.0.**

Razones:
1. **Volumen**: un usuario activo puede generar 1000+ entradas de historial al día. Sincronizar deltas tiene sentido para workspaces (decenas de cambios/día) pero no para historial.
2. **Privacidad**: las URLs visitadas son los datos más sensibles del usuario. Aunque el cifrado E2EE protegería el contenido, minimizar la superficie de datos sincronizados reduce el riesgo.
3. **Valor limitado**: el historial es contextual del dispositivo. Buscar "algo que vi hace 3 días" es útil en el dispositivo donde se navegó; cruzarlo entre dispositivos añade complejidad sin caso de uso claro en v1.0.
4. **Precedente**: Arc Browser tampoco sincroniza historial de navegación.

## Consecuencias
**Ventajas:**
- Sync más rápida y menos datos en el servidor.
- Menor superficie de riesgo de privacidad.
- Implementación más simple (sin resolver conflictos de historial entre dispositivos).

**Desventajas:**
- El historial queda silado por dispositivo. Documentado en la UI de settings como comportamiento esperado.
- Post-1.0 podría añadirse con opt-in explícito del usuario si hay demanda.
