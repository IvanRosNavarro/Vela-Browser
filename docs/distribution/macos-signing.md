# Firma de código — macOS (Developer ID + Notarización)

Sin firma y notarización, **Gatekeeper bloquea la app** en macOS 10.15+ con el
mensaje "Vela no puede abrirse porque Apple no puede comprobar que no contiene
software malicioso". No hay manera de saltarlo con un simple clic; el usuario
necesita ir a Preferencias del Sistema → Seguridad y Privacidad para permitirlo.
Para distribución pública la firma es obligatoria.

---

## Requisitos previos

1. **Apple Developer Program** (~€99/año): https://developer.apple.com/programs/
2. Crear un certificado **Developer ID Application** en
   https://developer.apple.com/account/resources/certificates/list
3. Importar el certificado al Keychain del Mac de firma.
4. Crear una **App Specific Password** para notarytool en
   https://appleid.apple.com/account/manage (sección "Seguridad de la cuenta"
   → "Contraseñas para apps").

---

## Variables de entorno

```
APPLE_IDENTITY          Nombre del certificado tal como aparece en Keychain.
                        Ej.: "Developer ID Application: Nombre Empresa (TEAMID)"
                        Si no está definida, el build se genera sin firma.

APPLE_ID                Tu Apple ID (email). Ej.: tu@empresa.com
APPLE_APP_SPECIFIC_PASSWORD  App Specific Password generada en appleid.apple.com
                             Formato: xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID           Team ID de tu Developer Program (10 caracteres).
                        Se encuentra en https://developer.apple.com/account
                        Ej.: XXXXXXXXXX
```

---

## Configuración en `electron-builder.config.cjs`

La configuración ya está preparada. Si `APPLE_IDENTITY` está definida,
`hardenedRuntime` se activa y se adjunta el plist de entitlements.
Si `APPLE_TEAM_ID` también está definida, electron-builder notariza
automáticamente tras firmar.

---

## Proceso completo

```bash
export APPLE_IDENTITY="Developer ID Application: Empresa (TEAMID)"
export APPLE_ID="tu@empresa.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

pnpm exec electron-builder --config electron-builder.config.cjs --mac --publish never
```

electron-builder ejecuta internamente:
1. `codesign` con Hardened Runtime y los entitlements de `build/entitlements.mac.plist`
2. Empaqueta el `.dmg`
3. Sube el `.dmg` a Apple para notarización (`notarytool submit`)
4. Espera la respuesta de Apple (normalmente < 5 minutos)
5. Ejecuta `stapler staple` para adjuntar el ticket de notarización al `.dmg`

---

## Verificación

```bash
# Verificar que la app está firmada correctamente
spctl --assess --type execute --verbose Vela.app

# Verificar el DMG
spctl --assess --type open --context context:primary-signature Vela.dmg

# Ver detalles de la firma
codesign -dv --verbose=4 Vela.app
```

Salida esperada:

```
Vela.app: accepted
source=Notarized Developer ID
```

---

## Notarización manual (si el automático falla)

```bash
# 1. Comprimir la app
ditto -c -k --keepParent Vela.app Vela.zip

# 2. Subir a Apple para notarización
xcrun notarytool submit Vela.zip \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# 3. Adjuntar el ticket (staple) al .app y al .dmg
xcrun stapler staple Vela.app
xcrun stapler staple Vela.dmg

# 4. Verificar
xcrun stapler validate Vela.dmg
```

---

## Entitlements

El fichero `build/entitlements.mac.plist` incluye los entitlements mínimos
necesarios para que Electron funcione con Hardened Runtime:

| Entitlement | Motivo |
|---|---|
| `cs.allow-jit` | V8 necesita memoria ejecutable dinámica (JIT) |
| `cs.allow-unsigned-executable-memory` | Algunos módulos nativos lo requieren |
| `cs.disable-library-validation` | electron-chrome-extensions carga libs sin firma propia |
| `network.client` | Navegador: conexiones de red salientes |
| `files.user-selected.read-write` | Acceso a ficheros del file picker |

---

## En GitHub Actions

Añadir estos secretos en la configuración del repositorio:
- `APPLE_IDENTITY`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

```yaml
- name: Package & Publish (macOS, con firma)
  if: matrix.os == 'macos-latest'
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GITHUB_REPO: ${{ github.repository }}
    APPLE_IDENTITY: ${{ secrets.APPLE_IDENTITY }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: pnpm exec electron-builder --config electron-builder.config.cjs --mac --publish always
```

Mientras no se tengan los secretos, el workflow actual usa
`CSC_IDENTITY_AUTO_DISCOVERY: 'false'` para generar el DMG sin firma.
