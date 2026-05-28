# ADR 0067 — Sección "Aparejos" en settings: terminología náutica

## Contexto

Vela necesita un punto de configuración centralizado para las extensiones nativas con motor activo (Ad Blocker, Cookie Manager). Estas features tienen un motor de background que consume recursos o modifica el comportamiento de red, por lo que el usuario debe poder desactivarlas completamente sin tener que ir a secciones distintas.

El nombre del navegador ("Vela") evoca la náutica. La sección de configuración de estas extensiones nativas es una oportunidad para reforzar la identidad del producto con terminología del mismo campo semántico.

## Decisión

Se crea una sección "Aparejos" en `vela://settings`, entre Extensiones y Atajos en la sidebar.

- **Terminología náutica** limitada a esta sección: "Izar" = activar, "Arriar" = desactivar.
- **El resto de la UI** (tooltips, notificaciones del sistema) usa "activado/desactivado" para no confundir a usuarios que no lean esta sección.
- Los Aparejos se persisten en `settings_profile` con claves `aparejo:{id}:enabled`.
- Los cambios se aplican en caliente (hot-reload) sin reiniciar Vela.

## Consecuencias

- El término "Aparejo" debe documentarse en el onboarding si se añade en el futuro.
- La sección `aparejos` se añade al router de settings como sección válida.
- Nuevos Aparejos deben cumplir el criterio: motor activo de background (ver ADR 0068).
