# ADR 0086 — Recovery Card generada localmente, sin servidor

## Estado
Aceptado — Fase 2

## Contexto
Si el usuario olvida su sync password, los datos cifrados en el servidor son irrecuperables (zero-knowledge by design). Se necesita un mecanismo de recuperación que no comprometa el modelo de seguridad.

Opciones evaluadas:
1. **Recuperación vía email**: el servidor guarda una copia de la clave cifrada con la clave pública del usuario. Requiere gestión de claves en servidor → rompe zero-knowledge.
2. **Security questions**: deprecado, inseguro.
3. **Recovery Card offline**: la sync key (o mnemónico BIP39 equivalente) se muestra una sola vez tras la configuración inicial. El usuario la imprime o la guarda. Sin copia en servidor.

## Decisión
**Recovery Card generada y descargada localmente** tras la primera activación de sync.

La Recovery Card es un PDF generado en el renderer que contiene:
- El mnemónico de 24 palabras equivalente a la sync key.
- Instrucciones de recuperación.
- Fecha de generación y email asociado.

El PDF se descarga automáticamente en el directorio de descargas del perfil. El servidor **nunca recibe** la sync key ni el mnemónico.

Si el usuario pierde la Recovery Card y olvida la sync password: los datos en el servidor son irrecuperables. El usuario puede desconectar la cuenta y empezar de cero (los datos locales se conservan).

Inspiración: Arc, 1Password Emergency Kit, hardware wallets.

## Consecuencias
**Ventajas:**
- Zero-knowledge estricto: el servidor no puede recuperar datos aunque sea comprometido.
- Sin complejidad adicional en el servidor.
- El usuario entiende desde el onboarding que es responsable de su Recovery Card.

**Desventajas:**
- UX potencialmente frustrante si el usuario pierde ambos factores. Mitigado con UI prominente ("guarda esto, es importante").
- No hay mecanismo de asistencia de soporte para recuperación de datos.
