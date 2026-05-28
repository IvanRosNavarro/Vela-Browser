# ADR 0087 — Pantalla de onboarding en primera ejecución

## Estado
Aceptado — Fase 2 (Prompt 2.5b)

## Contexto
Vela tiene un conjunto amplio de funcionalidades no obvias: workspaces jerárquicos, árbol de tabs, Aparejos, Glance, Split View, gestos de ratón, Command Palette. Un usuario nuevo sin guía puede perderse o no descubrir features clave.

Opciones evaluadas:
1. **Sin onboarding**: el usuario explora por su cuenta. Riesgo de abandono por curva de aprendizaje.
2. **Tooltips in-context**: aparecen al llegar a cada feature. Complejo de implementar, intrusivo.
3. **Onboarding de 7 pasos en primera ejecución**: modal a pantalla completa antes de la ventana principal.

## Decisión
**Pantalla de onboarding de 7 pasos** mostrada en la primera ejecución.

Control de estado: flag `'onboarding:completed'` en `app_metadata` (tabla global, no por perfil). Si el flag no existe o es `false`, el onboarding aparece antes de la ventana principal.

Comportamiento:
- Si el usuario cierra el onboarding sin completarlo (`onboarding:completed` sigue `false`): vuelve a aparecer en el próximo arranque.
- Tras "Empezar a navegar" o "Configurar sincronización": `onboarding:completed = true`, no vuelve a aparecer.
- `prefers-reduced-motion`: sin animaciones entre pasos.

Los 7 pasos:
1. Bienvenida a Vela.
2. Workspaces y árbol de tabs.
3. Búsqueda y Command Palette.
4. Privacidad (ad blocker, vault, tabs blindadas).
5. Personalización (temas, URL bar, Aparejos).
6. Sincronización E2EE.
7. Listo — "Empezar a navegar" / "Configurar sincronización".

## Consecuencias
**Ventajas:**
- Reduce la fricción de descubrimiento de features no obvias.
- El paso de sync introduce la Recovery Card de forma natural.
- Implementado como BrowserWindow dedicada, sin acoplar al flujo de ventana principal.

**Desventajas:**
- Usuarios avanzados que reinstalan pueden verlo como molestia. Mitigado: se completa una vez y nunca más.
- No hay forma de volver a abrirlo (por diseño). Post-1.0 podría añadirse un "Reiniciar onboarding" en About.
