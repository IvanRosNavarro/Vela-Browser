# ADR 0007 — Reordenación de fases: Fase 2 (sync) se pospone al final

## Estado
Aceptado.

## Contexto

El plan original colocaba las fases en este orden:
Fase 0 → Fase 1 → Fase 2 (sync) → Fase 3 (multi-perfil) → Fase 4
→ Fase 5.

La Fase 2 implica:
- Backend con servidor en VPS público.
- Coste recurrente (~6€/mes mínimo).
- Servicio de email transaccional (Resend) para magic links.
- Diseño de cifrado E2EE y autenticación.
- Probablemente la fase técnicamente más compleja del proyecto.

La Fase 3 implica:
- Aislamiento de perfiles a nivel de filesystem y sesión Electron.
- Una BD por perfil.
- Extensiones por perfil.
- Gestor de contraseñas con clave maestra.
- Sin coste recurrente, sin infraestructura externa.

## Decisión

Posponer la Fase 2 al final del proyecto. El nuevo orden cronológico es:

Fase 0 → Fase 1 → Fase 3 → Fase 4 → Fase 4.5 → Fase 5 → Fase 2.

Los números de fase NO se renumeran. Se mantiene "Fase 3 multi-perfil",
"Fase 2 sync", etc., porque renombrar afecta a múltiples documentos
y commits históricos. El orden cronológico se documenta aquí.

## Motivos

1. **El sync con conciencia de perfil es mejor diseño que el sync genérico.**
   Hacer la sync primero asumiendo "un solo perfil" implica un refactor
   posterior cuando llegue Fase 3 para soportar múltiples perfiles
   aislados. Hacerla con perfiles ya funcionando permite diseñar el
   modelo de Y.Doc por perfil desde el primer prompt.

2. **Coste recurrente postergado.** El VPS y el dominio son gasto
   continuo. Posponer Fase 2 retrasa varios meses la necesidad de
   infraestructura externa.

3. **Validación del modelo de datos.** Para que Fase 2 funcione bien,
   las entidades deben tener `updatedAt` consistente, IDs UUID v7,
   sin autoincrement. Implementar Fase 3 primero da una pasada más al
   modelo antes de comprometerlo a un protocolo de sincronización.

4. **Curva de aprendizaje.** La Fase 2 es la más compleja. Llegar a
   ella con más experiencia en el codebase aumenta la probabilidad
   de hacerla bien.

## Alternativas descartadas

**A. Mantener orden original.** Implica refactor seguro del cliente
de sync al llegar Fase 3, y coste recurrente desde antes.

**B. Renumerar las fases.** Implica reescribir múltiples docs y
ADRs históricos. No aporta valor real.

## Consecuencias

- Vela funciona sin sync entre dispositivos durante Fases 3, 4, 4.5
  y 5. Aceptable para uso personal en una sola máquina.
- En Fase 3 hay que asegurar explícitamente que el modelo de datos
  queda preparado para sync (ver punto 3 arriba). Validación al
  cierre de Fase 3.
- El plan completo (`docs/Vela-Plan-Completo.docx`) sigue describiendo
  el orden original; la realidad es la documentada en este ADR.

## Condiciones de revisión

Si en Fase 3 se descubre que el modelo de datos requiere cambios
estructurales por razones ajenas a sync, replantear si la Fase 2
debería retomarse antes de seguir avanzando.

Si en Fase 4 o posterior se decide abrir Vela a otros usuarios
(distribución pública), Fase 2 pasa a ser bloqueante: no se puede
distribuir sin sync sin generar fricción seria a esos usuarios.