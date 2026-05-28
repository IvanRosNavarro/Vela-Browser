<div align="center">

# Vela Browser

**Un navegador de escritorio organizado, privado y sincronizado.**
Inspirado en Arc y Zen. Construido sobre Electron + Chromium.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#instalación)
[![Version](https://img.shields.io/badge/version-0.1.0--beta-orange)](https://github.com/IvanRosNavarro/Vela-Browser/releases/tag/v0.1.0)

</div>

---

> **Beta pública.** Vela es funcional y lo usamos a diario, pero todavía hay
> aristas. Úsalo, rompe cosas, [abre issues](https://github.com/IvanRosNavarro/Vela-Browser/issues).

---

## ¿Qué es Vela?

Vela es un navegador de escritorio que pone la organización por delante. En lugar de
una barra de pestañas horizontal que colapsa a los 10 minutos de uso, Vela ofrece:

- **Árbol jerárquico de pestañas** en una sidebar vertical — carpetas, grupos, anidado infinito.
- **Workspaces** con nombre, color e icono para separar trabajo, ocio y proyectos.
- **Sincronización E2EE** entre todos tus dispositivos — cifrado de extremo a extremo
  con clave que solo tú conoces.
- **Multi-perfil** completamente aislado: cada perfil tiene su propia sesión, cookies,
  extensiones y base de datos.

Solo desktop: **Windows**, **macOS** y **Linux**. Sin versión móvil por ahora.

---

## Características principales

<details>
<summary><strong>Organización de pestañas</strong></summary>

- Sidebar vertical con árbol jerárquico (estilo Arc / Sidebery)
- Carpetas anidables a cualquier profundidad con drag & drop
- Workspaces con nombre, color e icono — CRUD completo
- Ctrl+Tab con modal MRU y scope configurable (workspace / global)
- Favoritos globales por perfil, fijados en la sidebar
- Auto-descartado de pestañas inactivas con whitelist de 4 niveles
- Previsualización de pestaña al hacer hover en la sidebar

</details>

<details>
<summary><strong>Privacidad y seguridad</strong></summary>

- Ad blocker nativo integrado (listas actualizadas cada 24h)
- Gestor de contraseñas AES-256-GCM con auditoría HIBP (k-anonymity)
- Tabs blindadas: sesión en memoria, sin historial, sin capturas, directorio temporal destruido al cerrar
- Denegación silenciosa de notificaciones por defecto
- Cookie Manager nativo con panel flotante
- Scripts de usuario sin acceso a APIs de Electron o Node

</details>

<details>
<summary><strong>Productividad</strong></summary>

- URL bar inteligente con modos de prefijo: `>` comandos, `#` historial, `@` tabs abiertas, `!` motores de búsqueda
- Split View horizontal/vertical: dos paneles simultáneos, layout persistido por workspace
- Glance: preview flotante de un enlace con Ctrl+hover — sesión efímera sin rastro
- Control de multimedia universal: gestiona el audio de cualquier pestaña desde la title bar
- Modo lectura con Mozilla Readability (tipografía y tema configurables)
- Captura de pantalla: área visible, selección libre y página completa — editor con flechas, recuadros, texto y blur
- Command Palette `Ctrl+Shift+P` con fuzzy matching, argumentos y condiciones contextuales
- Gestos de ratón configurables

</details>

<details>
<summary><strong>Personalización</strong></summary>

- 8 temas integrados: Vela Claro/Oscuro, Midnight, Solarized, Nord, Dracula, Gruvbox Dark, Sistema
- Editor de temas con preview en vivo — importar/exportar `.vela-theme.json`
- Custom CSS inyectable sobre el chrome del navegador
- URL bar configurable: elige qué iconos aparecen y en qué orden
- Atajos de teclado configurables con hot-reload
- Aparejos: accesos rápidos a páginas y herramientas, izables desde la sidebar

</details>

<details>
<summary><strong>Sincronización E2EE</strong></summary>

- Sincroniza workspaces, árbol de pestañas, favoritos, scripts, notas y el vault de contraseñas
- Cifrado AES-256-GCM con derivación scrypt — el servidor almacena blobs opacos
- Autenticación por magic link — sin contraseñas de cuenta
- Offline-first: los cambios se encolan y se envían al reconectar
- Recovery Card PDF descargada localmente — zero-knowledge by design
- Servidor propio en `sync.vela-browser.com` (Docker + Dokploy, VPS propio)

</details>

<details>
<summary><strong>Extensiones</strong></summary>

- Soporte de extensiones Manifest V3 nativo
- `vela://extensions`: instalar, activar/desactivar, gestionar por perfil — instalación desde `.crx`
- Scripts de usuario nativos (`vela://scripts`) — Userscripts y Userstyles sin extensión

</details>

---

## Instalación

Descarga el instalador para tu plataforma desde [Releases](https://github.com/IvanRosNavarro/Vela-Browser/releases):

| Plataforma | Archivo |
|-----------|---------|
| Windows | `Vela-Setup-0.1.0.exe` |
| macOS | `Vela-0.1.0.dmg` |
| Linux | `Vela-0.1.0.AppImage` o `.deb` |

Vela incluye auto-update: las versiones posteriores se instalan automáticamente.

---

## Compilar desde el código fuente

**Requisitos:**
- Node.js 22.x
- pnpm 9.x

```bash
# Clonar
git clone https://github.com/IvanRosNavarro/Vela-Browser.git
cd Vela-Browser

# Instalar dependencias
pnpm install

# Desarrollo (abre Electron con hot-reload)
pnpm dev

# Verificar tipos
pnpm typecheck

# Compilar instaladores
pnpm build
```

### Servidor de sincronización (self-hosted)

Vela usa `sync.vela-browser.com` como servidor de sync por defecto, pero cualquier fork
puede levantar su propio servidor. Es un proceso Node.js estándar:

```bash
cd packages/sync-server
cp .env.example .env   # edita con tus valores (JWT_SECRET, RESEND_API_KEY, etc.)
pnpm dev               # desarrollo
pnpm build && node dist/index.js   # producción
```

El `Dockerfile` incluido facilita el despliegue en cualquier VPS con Docker.
Para apuntar el cliente a tu propio servidor, cambia `SYNC_SERVER_URL` en
`packages/main/src/sync/SyncManager.ts`.

Variables de entorno: ver [`packages/sync-server/.env.example`](packages/sync-server/.env.example).

---

## Estructura del repositorio

```
vela/
├── packages/
│   ├── main/          proceso principal Electron — lógica, SQLite, IPC
│   ├── preload/       contextBridge entre main y renderer
│   ├── renderer/      UI React — solo presentación
│   ├── shared/        tipos TypeScript + schemas Zod + canales IPC
│   └── sync-server/   servidor de sincronización E2EE (Node + SQLite)
├── CLAUDE.md          convenciones de arquitectura y código
├── CONTRIBUTING.md    cómo contribuir
└── ROADMAP.md         estado del proyecto y backlog
```

---

## Contribuir

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) antes de abrir un PR.

El flujo es sencillo: **issue → rama → PR → merge**. Cada bug tiene su rama `fix/...`
y cada feature su rama `feat/...`.

---

## Licencia

**GPL-3.0-only** — ver [LICENSE](LICENSE).

Cualquier dependencia añadida debe ser GPL-compatible. Las no compatibles requieren
ADR explícito. Ver sección de licencias en [`CONTRIBUTING.md`](CONTRIBUTING.md).
