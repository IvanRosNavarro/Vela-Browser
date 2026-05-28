# ADR 0083 — Despliegue del servidor: Docker + Dokploy

## Estado
Aceptado — Fase 2

## Contexto
El servidor de sync (`packages/sync-server`) necesita infraestructura de despliegue. Opciones evaluadas:
1. **systemd + Caddy manual**: máximo control, requiere gestión de servidor, TLS manual, deploys manuales.
2. **Railway / Render**: PaaS gestionado, más caro a escala, datos de usuarios en infraestructura de terceros.
3. **Docker + Dokploy**: Docker propio en VPS con Dokploy como panel de control. Auto-deploy desde GitHub, TLS automático vía Traefik, volúmenes persistentes, monitorización básica.

## Decisión
**Docker + Dokploy** en VPS propio.

Dokploy gestiona:
- **TLS**: Traefik + Let's Encrypt automático para `sync.vela-browser.com`.
- **Auto-deploy**: webhook de GitHub → build de la imagen Docker → swap en caliente sin downtime.
- **Volumen**: `vela-sync-data` montado en `/data` del contenedor, persiste `sync.db` entre deploys.
- **Monitorización**: dashboard de logs y métricas básicas de CPU/RAM.

El `Dockerfile` en `packages/sync-server/` es multi-stage: build con Node 22 Alpine, runtime mínimo. La imagen final pesa <200 MB.

Variable de entorno `DATABASE_PATH=/data/sync.db` separa los datos del código.

## Consecuencias
**Ventajas:**
- Los datos nunca salen del VPS propio (cumplimiento RGPD simplificado).
- Auto-deploy desde `git push origin main` sin intervención manual.
- TLS gestionado automáticamente sin renovación manual.
- Dokploy es open source (Apache-2.0), sin vendor lock-in.

**Desventajas:**
- Requiere gestionar el VPS (actualizaciones del SO, Dokploy en sí).
- Escalado horizontal requiere sincronizar `sync.db` entre instancias (fuera de alcance v1.0; single-node es suficiente para el volumen esperado).
