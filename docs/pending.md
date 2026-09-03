# Pendientes vivos

Cosas que hay que cerrar pero no bloquean la fase actual.

## Hardening de distribución

- [ ] Firma Authenticode en Windows. Ver `docs/distribution/windows-signing.md`.
- [ ] Firma Developer ID + notarización en macOS. Ver `docs/distribution/macos-signing.md`.
- [ ] Firma GPG de los `.deb` (opcional). Ver `docs/distribution/linux-signing.md`.

## Pendientes activos

### Extensiones

- [ ] **Menú contextual — hooks de extensiones**: ECE no expone `getContextMenuItems()` en la
      versión actual. Extensiones como uBlock y Bitwarden que usan la API `contextMenus`
      de Chrome no añaden sus ítems al menú de Vela todavía. Revisar en futuras versiones de
      electron-chrome-extensions o implementar bridge propio.

- [ ] **Dependencia de internals de ECE para la pestaña activa**: `applyActiveTabToExtensions`
      en `packages/main/src/index.ts` escribe en `ctx.store` de electron-chrome-extensions
      (`windowToActiveTab`, `tabDetailsCache`), que no es API pública. Revisar al subir de
      versión de la librería; si upstream deja de marcar activa toda pestaña recién observada
      (`TabsAPI.observeTab` → `onActivated` incondicional), este apaño puede retirarse.
      Ver ADR 0095. Nota: desde v0.1.21 el cache se **invalida** en lugar de reescribirse,
      y los datos correctos los repone `assignTabDetails` desde `TabManager`.

- [ ] **Atajos de extensión en `vela://settings#shortcuts`**: desde v0.1.21 los `commands`
      del manifest se enganchan a la tabla central (ADR 0099), pero no aparecen en la
      interfaz de ajustes ni se pueden reasignar. Falta listarlos junto a los comandos de
      Vela y permitir cambiarlos, con la misma persistencia por perfil.

- [ ] **Interacción con la página estando el worker dormido**: si el usuario hace clic en
      un campo esperando el menú inline de Bitwarden y el worker está parado, ese primer
      clic solo sirve para despertarlo. El camino nace en el content script, así que se
      recupera solo, pero puede requerir un segundo intento. Ver ADR 0097.

- [ ] **Autorrelleno de Bitwarden tras inactividad** (sin resolver). Chromium duerme el
      service worker de la extensión a los ~30 s; en Chrome un port abierto prolonga su
      vida, en Electron no. Al morir, los content scripts se desmontan y Bitwarden ya no
      puede leer la página: "Unable to autofill the selected item on this page". Los tres
      intentos de arreglarlo (v0.1.21 reactivar al pararse, v0.1.22 despertar antes del
      popup, v0.1.23 `startTask()`) dejaron el popup con la lista vacía en la instalación
      del usuario pese a funcionar en desarrollo, y se revirtieron. Ver ADR 0097.
      Preguntas abiertas: por qué `startWorkerForScope` falla ("Failed to start service
      worker") en unas instalaciones y no en otras, y por qué `startTask()` retiene el
      worker (el log lo confirma) sin que el popup recupere los datos.
      **Cualquier intento futuro debe verificarse contra una instalación real de Bitwarden
      con sesión iniciada antes de publicarse.**

### Rendimiento

- [ ] **Renderer con fuga de memoria sin identificar**. En una sesión de v0.1.19
      se observó un proceso renderer de Vela creciendo sin techo hasta 10,7 GB de
      working set, con ~10.400 s de CPU acumulados y ninguna conexión TCP abierta
      (bucle local, no descarga). Nacido 2h39m después del arranque de la
      aplicación, con `--renderer-client-id` alto. No era una pestaña del árbol
      del perfil, así que los candidatos son: shell, popup, página de extensión,
      pestaña blindada, Glance o pestaña de otra ventana/perfil. Con el
      visualizador de v0.1.20 aparecerá en "Otros procesos" con nombre y PID:
      reproducir y anotar de qué proceso se trata antes de buscar la causa.

### Tests

- [ ] **Fixtures de tests desalineados con el esquema**: 31 tests de
      `TreeNodeRepository` / repositorios asociados fallan con
      `table tree_nodes has no column named is_secure` y similares. El esquema que
      montan los tests no aplica las migraciones posteriores a Fase 5.0. Fallan
      igual en `main` desde antes de v0.1.19; no bloquean la build ni el typecheck.

### Multimedia

- [ ] **Control multimedia en iframes cross-origin**: sitios como Spotify Web o reproductores
      embebidos en SPAs montan el audio en iframes cross-origin no accesibles desde el preload
      del frame principal. Enfoques pendientes de investigar:
      - `webContents.sendInputEvent` con `mediaPlay` / `mediaPause` (simula teclas multimedia).
      - CDP `Page.addScriptToEvaluateOnNewDocument` combinado con el preload bridge.
      Ver ADR 0033.

### Notificaciones web — push

- [ ] **Verificar nombre del evento `notification-show` en Electron 42**. La implementación
      en `sessions.ts` registra este evento con un cast (`as unknown`) porque el tipo
      `Session` de Electron no lo declara. Si el nombre es incorrecto, las notificaciones
      push del SW llegarán al SO directamente sin pasar por el centro de Vela. Ver ADR 0015.

- [ ] **Enfoque B de push (proceso background)**. Recibir pushes cuando Vela está cerrado
      requiere un ejecutable auxiliar por plataforma. Diferido a post-1.0. Ver ADR 0015.

- [ ] **Web Push nativo en Electron (Google API Keys)**. `pushManager.subscribe()`
      falla en Electron con `AbortError: Registration failed – push service not available`
      porque el build de Electron no incluye las GCM API Keys de Google. La solución correcta
      es compilar Electron con API Keys de Google aprobadas para Vela como proyecto open-source.
      Alternativa: relay propio tipo Brave Push Service. Ver ADR 0016.

### Sidebar y title bar

- [ ] **Arrastre de ventana desde el sidebar**. El sidebar debería poder usarse como zona de
      arrastre en las áreas vacías entre pestañas. Requiere `-webkit-app-region: no-drag` en
      cada nodo del árbol para que el DnD de reordenación siga funcionando.

- [ ] **Posición del botón Nueva pestaña configurable** desde Ajustes (arriba del workspace
      o abajo del perfil). Toggle en sección Pestañas de `vela://settings`.

### SafeStorage en Linux

- [ ] **Validar safeStorage en Linux**. En distros sin libsecret/kwallet,
      `safeStorage.isEncryptionAvailable()` devuelve false y `ProfileKeyring` lanza
      `SafeStorageUnavailableError`. La UI debe detectar ese caso y forzar contraseña
      maestra al crear perfil. Hoy se delega al dev console.

## Para post-1.0 (IA integrada)

- [ ] Panel lateral de IA (atajo configurable; default ninguno hasta que el usuario lo asigne).
- [ ] Integración Claude API (api.anthropic.com) con streaming de tokens.
- [ ] Integración OpenAI compatible con streaming (URL base configurable).
- [ ] Ollama local: detección automática en localhost:11434, lista de modelos.
- [ ] Chat con contexto de página activa vía Readability.
- [ ] Resumen de página: acción rápida en el panel.
- [ ] Traducción de selección: activa el stub del menú contextual, ejecuta en el panel.
- [ ] `vela://settings#ai` completamente implementado: proveedor, API key (keychain), modelo, temperatura.
- [ ] API keys almacenadas en keychain del SO por perfil.
- [ ] Resultado "Buscar con IA" activo en `vela://newtab`.
- [ ] Stubs "Traducir selección" y "Resumir página" en menú contextual del WebContentsView.
- [ ] Rellenar sección IA en vela://settings (actualmente es stub con badge).

## Para post-1.0

- [ ] Grid 2×2 de Split View (4 paneles simultáneos). Ver ADR 0031.
- [ ] Swipe de trackpad (macOS nativo, Electron 35+; asimetría en Win/Linux). Ver ADR 0044.
- [ ] Vista de grafo del historial (requiere campo `referrer` en tabla `history`
      y librería de visualización). Ver ADR 0038.
- [ ] Barra de estado en borde inferior (alternativa a la animación en URL bar).
- [ ] Compatibilidad completa Chrome Web Store (OAuth Google). Ver ADR 0051.
- [ ] Galería online de temas de la comunidad (depende de servidor sync).
- [ ] Modo lectura con TTS (decisión de privacidad: local vs nube pendiente).
- [ ] Versiones móviles (Android/iOS) — explícitamente fuera de alcance del MVP.

---

## Cerrado

### Cerrados en v0.1.20

- [x] El visualizador de recursos reportaba una fracción del consumo real (162,5 MB
      frente a 11,6 GB del sistema) porque solo recorría los nodos `kind === 'tab'`
      del perfil activo. Ahora parte de `app.getAppMetrics()` completo y lista en
      "Otros procesos" todo lo que no es una pestaña. Ver ADR 0096.
- [x] El total sumaba filas, contando dos veces los renderers compartidos por
      varias pestañas. Se calcula por proceso.
- [x] Pestaña suspendida y pestaña sin métrica se pintaban ambas como `0 MB`.

### Cerrados en v0.1.18

- [x] Interstitial de certificado: volvía a mostrarse. El guard que evitaba
      reemplazar la shell usaba `BrowserWindow.fromWebContents(wc) !== null`,
      que en Electron 42 es true también para los `WebContentsView`, así que
      descartaba todas las pestañas y la pestaña quedaba en blanco. Ahora se
      resuelve con `tabManager.getTabIdForWebContents`.
- [x] Descargas duplicadas: `attachToSession` se reinvocaba sobre la misma
      `Session` al reabrir un perfil y acumulaba listeners `will-download`.
      Guard con `WeakSet<Session>` + dedupe por `DownloadItem`, con tests.
- [x] Badge numérico en el icono de la barra de tareas de Windows: eran las
      toasts sin descartar en el Centro de notificaciones. Ver ADR 0094.

### Cerrados en Sub-fase 4C (v0.4.0)

- [x] URL bar: modos con prefijo con chip visual (>, #, @, !).
- [x] URL bar: atajos configurables para abrir cada modo (Ctrl+Shift+T, Ctrl+Shift+H).
- [x] URL bar: motores con alias ! configurables en vela://settings#search.
- [x] URL bar: breadcrumb clicable para URLs con más de 3 segmentos.
- [x] URL bar: indicadores de contenido de página (RSS, media).
- [x] SecurityIndicator funcional: popover con info de certificado y estado HTTP/HTTPS/vela://.
- [x] Notificaciones: interceptar con setPermissionRequestHandler (denegación silenciosa).
- [x] Notificaciones: icono contextual en URL bar con 5 estados (none/pending/granted/denied/push-active).
- [x] Notificaciones: centro con panel lateral, agrupado por origen y badge en title bar.
- [x] Notificaciones: reglas de silencio (horario, workspace, temporal "No molestar 1 hora").
- [x] Push: tabla push_subscriptions y PushSubscriptionManager (ADRs 0015-0017).
- [x] Push: interceptación de permisos push unificada con notificaciones.
- [x] Push: enrutamiento de pushes al NotificationManager.
- [x] Push: sección en vela://settings#privacy.
- [x] Middle click sobre tab → tab:close (TabRow y FavoritesBar).
- [x] Iconos de extensiones en title bar con badges + popups vía ECE activateClick.
- [x] Página vela://extensions: listar, enable/disable, instalar CRX, desinstalar.
- [x] Settings: sección Atajos con edición inline, captura de tecla, detección de conflictos.
- [x] Settings: mru:scope y mru:behavior movidos de WorkspaceModal a sección Pestañas.
- [x] Settings: sección Apariencia, Pestañas, Privacidad e IA (stub) completas.

### Cerrados en Sub-fase 4B2 (v0.5.2)

- [x] File Picker mejorado con panel propio (BrowserWindow frameless alwaysOnTop).
- [x] Tabla `recent_files` en profile.db (migración 006). RecentFilesRepository.
- [x] Página `vela://filepicker` con secciones Recientes, Descargas, Portapapeles.
- [x] Filtrado por `accept`, selección múltiple, inyección via DataTransfer, fallback nativo.
- [x] Toggle en vela://settings#privacy; botón "Limpiar historial". Aislado por perfil.

### Cerrados en Sub-fase 4B (v0.5.0)

- [x] Sistema de previews: capturas JPEG en `userData/profiles/{profileId}/previews/{tabId}.webp`,
      throttling máx 1 captura/tab cada 5 s, protocolo `vela-preview://`. ADR 0021.
- [x] Modal MRU consumiendo previews reales con fallback favicon-card.
- [x] Captura de pantalla: tres modos (visible, región, página completa) + editor Konva.js
      (flecha, recuadro, elipse, texto, resaltado, blur pixelado). ADR 0022.
- [x] Auto-descartado avanzado: whitelist completa (dominio, tab, workspace, carpeta),
      excepciones automáticas (audio, formulario, pinned). ADR 0023.
- [x] Menú contextual rico del WebContentsView: popup BrowserWindow custom. ADR 0024.
- [x] Tabla `history` con `workspaceId` y `sessionId` en profile.db.

### Cerrados en Sub-fase 4D (v0.5.5)

- [x] Split View H/V: dos paneles con WCV independientes, indicador de panel enfocado,
      drag de tab al borde crea el split.
- [x] Layout `single | split-h | split-v` persistido en workspace (migración 007).
- [x] Glance: WCV efímero al Ctrl+hover sobre enlace. Sesión efímera in-memory,
      timeout 200 ms, máximo 1 activo a la vez. ADR 0032.
- [x] MediaSessionManager con arquitectura preload bridge bidireccional. ADR 0033.
- [x] Widget de multimedia en title bar (corchea + punto indicador).
- [x] Popup de multimedia con controles Play/Pause/Skip y artwork.
- [x] Indicador de reproducción animado en TabRow.
- [x] Barra de estado hover en URL bar: preload debounce 50 ms, animación CSS 40/60,
      interacción con breadcrumb, filtro por tabId en Split View. ADR 0034.
- [x] Tab Switcher Modal con agrupación por workspace y fuzzy matching. ADR 0027.
- [x] Buffer de tabs cerradas recientemente (en memoria, máx. 10, FIFO). ADR 0028.
- [x] Modo `@` en URL bar como alias del Tab Switcher Modal. ADR 0030.

### Cerrados en Sub-fase 4E (v0.5.8)

- [x] `vela://newtab` con cards de workspaces activos.
- [x] Quick notes por workspace en SQLite con debounce de 500 ms.
- [x] Búsqueda unificada en New Tab: tabs abiertas + historial.
- [x] `vela://history` con filtro por workspace y vista de dominios.
- [x] Sesiones automáticas (agrupación por día + separadores por gap >30 min).
- [x] Botón "Restaurar sesión" en `vela://history`.
- [x] Modo `#` de la URL bar conectado al historial real.
- [x] Sección "Historial" en vela://settings (retención + toggle no registrar).

### Cerrados en Fase 4.5 (v0.6.0)

- [x] CSP estricta vía `session.webRequest.onHeadersReceived` en producción.
      Políticas dev/prod en `security/csp.ts`. Ver ADR 0039.
- [x] Auditoría IPC: todos los handlers validados con zod (payload + frame check).
      Ver ADR 0040.
- [x] Hardening de distribución documentado: `docs/distribution/windows-signing.md`,
      `macos-signing.md`, `linux-signing.md`.
- [x] Command palette (Ctrl+Shift+P) con fuzzy matching, comandos con args y
      condición when(). Ver ADR 0041.
- [x] Fuzzy matcher mejorado con bonus por consecutivos y positions para highlight.
      Tab Switcher con highlights. Ver ADR 0042.
- [x] Gestos de ratón (renderer puro, 3 plataformas): 6 gestos predefinidos,
      configurables en settings#shortcuts. Ver ADR 0043.
- [x] Cookie Manager nativo. Cookie Editor retirado de bundled. Ver ADRs 0045-0046.
- [x] Preview hover en sidebar (BrowserWindow hijo). Ver ADRs 0047-0050.

### Cerrados en Fase 5.0 (v0.6.5)

- [x] Favorites globales por perfil (`profile_favorites`, `GlobalFavoritesBar`,
      `FavoriteButton`, `vela://favorites`). ADRs 0052-0054.
- [x] Ad Blocker nativo con `@cliqz/adblocker-electron`. Panel como BrowserWindow
      hijo. Listas compartidas, excepciones por perfil. ADRs 0055-0057.
- [x] Gestor de contraseñas con `vault.db` cifrado AES-256-GCM, modales BrowserWindow
      hijo, captura en submit, auditoría HIBP k-anonymity. ADRs 0058-0062.
- [x] Sandboxing blindado: `SecureTabManager` con tmpdir del SO, destrucción física
      al cerrar, limpieza de residuos en arranque. ADRs 0063-0064.
- [x] Scripts de usuario (`user_scripts` en profile.db, inyección executeJavaScript
      e insertCSS, `vela://scripts`). ADR 0065.
- [x] Bug snapshot local como .zip (`BugSnapshotService` + `archiver`). ADR 0066.
- [x] Visualizador de recursos: modal React con polling getProcessMemoryInfo cada 2s.
- [x] Aparejos (Izar/Arriar), iconos URL bar configurables con DnD,
      DevModeModal unificado, modo responsive en titlebar. ADRs 0067-0071.

### Cerrados en Fase 2 — v1.0.0

- [x] Sincronización E2EE (scrypt + AES-256-GCM). SyncManager, sync_pending, backoff
      exponencial. ADRs 0079-0087.
- [x] Servidor sync en `packages/sync-server/`, desplegado en sync.vela-browser.app.
- [x] Auth con magic links vía Resend. Flujo vela://sync-callback.
- [x] Yjs para quick_notes: `Y.Text` por workspace con sync bidireccional.
- [x] Onboarding controlado por `'onboarding:completed'` en `app_metadata`.
- [x] Multi-ventana coordinado: WindowRegistry, window_state, broadcast. ADRs 0088-0091.
- [x] Sync de lista de orígenes con permiso push entre dispositivos. ADR 0016.
