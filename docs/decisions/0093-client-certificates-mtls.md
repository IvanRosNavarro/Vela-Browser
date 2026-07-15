# ADR 0093 — Certificados cliente (mTLS)

## Estado
Aceptado

## Contexto
Vela no tenía ninguna cobertura para autenticación TLS mutua: cuando un
sitio (sede electrónica, banca, VPN corporativa) pide al navegador que se
identifique con un certificado personal, Electron dispara
`app.on('select-client-certificate', ...)` y, al no estar manejado, la
conexión falla sin ningún feedback. Esto es distinto del `CertificateManager`
existente (`packages/main/src/security/CertificateManager.ts`), que cubre
errores de certificado de *servidor* con el interstitial `vela://cert-error`
— ese flujo no se toca.

Alcance decidido con el usuario: certificados cliente para mTLS, tomados del
almacén de certificados de Windows (Electron ya puebla `certificateList`
desde ahí). Esto cubre también DNIe/tarjetas criptográficas sin trabajo
adicional: si el middleware oficial del DNIe está instalado, Windows
registra el certificado de la tarjeta en el almacén personal (CryptoAPI/CNG)
al insertarla, y aparece en la lista igual que un `.p12` importado. El PIN
de la tarjeta lo pide el propio SO durante el handshake TLS.

## Decisión

### Flujo
`ClientCertificateManager` (`packages/main/src/security/ClientCertificateManager.ts`)
escucha `select-client-certificate` a nivel de `app`. Por cada petición:
1. Resuelve `origin`, y `windowId`/`profileId` a partir del `webContents.id`
   de la tab vía `TabManager.getTabIdForWebContents` → `getWindowIdForTab`
   → `ProfileWindowManager.getProfileForWindow`.
2. Si hay una elección recordada para ese origen+perfil y su huella sigue
   entre los candidatos, resuelve el `callback` de Electron directamente sin
   mostrar nada. Si la huella recordada ya no está (cert renovado), se
   olvida y se cae al flujo normal.
3. Si no, abre un popup modal `vela://client-cert-select` (BrowserWindow
   `modal: true` sobre la ventana padre, centrado con el nuevo helper
   `centerOverWindow` de `ipc/popupUtils.ts`) con la lista de certificados
   candidatos (subject, issuer, vigencia — nunca el DER binario).
4. El usuario elige un certificado (con checkbox opcional "recordar") o
   cancela. El manager localiza el `Certificate` real por huella y resuelve
   el `callback` de Electron original.
5. Si el popup se cierra sin responder (Alt+F4, cierre de la ventana padre),
   el manager cancela la petición igualmente — el callback de Electron nunca
   queda sin resolver.

Las peticiones y popups pendientes se indexan por `webContents.id` de la tab
(no por `windowId` de la ventana), para que dos tabs de la misma ventana
puedan pedir certificados cliente de forma concurrente sin pisarse.

### Persistencia de la elección recordada
Sin tabla SQL nueva: mismo patrón que `MediaPermissionManager` — blob JSON
bajo la clave `client-cert:choices` en el repositorio `settings` del perfil
(`{origin, fingerprint, subject, chosenAt}[]`). Gestionable desde
Ajustes → Privacidad → "Certificados cliente recordados" (`Privacy.tsx`),
con botón "Olvidar" por origen.

### Popup modal
`createPopupWindow`/`popupUtils.ts` gana soporte `modal: true` (requiere
`parent`): a diferencia del resto de popups de Vela (que se cierran al
perder el foco, `closeOnBlur`), este no se descarta por un clic accidental
fuera — es una decisión de seguridad puntual. Aun así, si se cierra sin
responder, la petición pendiente se cancela (ver flujo, paso 5).

### IPC
Canales `client-cert:get-initial-data`, `client-cert:select`,
`client-cert:cancel` — restringidos, además de `guardTrustedFrame`, a que
`event.sender.getURL()` empiece por `vela://client-cert-select` (mismo
patrón que `cert:allow`/`cert:go-back` en `ipc/cert.ts`, por resolver una
decisión de seguridad pendiente). Canales `client-cert:get-all` y
`client-cert:forget` (usados por Ajustes) solo requieren `guardTrustedFrame`.
Evento push `state:client-cert-changed` para refrescar la lista de Ajustes
en caliente si el cambio ocurre en otra ventana del mismo perfil.

## Consecuencias
- Fuera de alcance: certificados en archivo `.p12`/`.pfx` suelto sin
  importar al almacén de Windows (Windows ya ofrece "Importar" en
  `certmgr.msc`), y cualquier UI de gestión/importación de certificados
  dentro de Vela — se delega enteramente al almacén del SO.
- El soporte de DNIe/tarjeta criptográfica depende de que el usuario tenga
  instalado el middleware oficial correspondiente; Vela no lo detecta ni
  lo instala.
- No cubre Linux/macOS de forma especial: Electron también puebla
  `certificateList` desde el almacén del SO en esas plataformas, pero no se
  ha probado explícitamente (el alcance pedido era Windows).
