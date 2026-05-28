# Firma de código — Windows (Authenticode)

Sin firma Authenticode, Windows SmartScreen muestra el aviso
"Windows protegió tu PC" la primera vez que se ejecuta el instalador.
Los usuarios pueden saltarlo con "Más información" → "Ejecutar de todas formas",
pero es una fricción significativa para la distribución pública.

---

## Opciones

### Opción A — Certificado OV Code Signing (recomendado para distribución pública)

- **Coste**: ~200-500 USD/año.
- **Efecto**: SmartScreen muestra el aviso inicialmente, pero desaparece
  una vez que el instalador acumula suficiente reputación en el servicio
  de SmartScreen de Microsoft (normalmente unas semanas/meses de descargas).
- **Proveedores**: DigiCert, Sectigo, GlobalSign, SSL.com.
- **Forma del certificado**: fichero `.pfx` protegido con contraseña.

### Opción B — Certificado EV Code Signing (elimina SmartScreen completamente)

- **Coste**: ~400-800 USD/año.
- **Efecto**: SmartScreen se elimina desde el primer instalador firmado.
- **Requisito adicional**: el certificado vive en un **Hardware Security Module (HSM)**
  (token USB físico o HSM en la nube como Azure Key Vault, DigiCert KeyVault, etc.).
  No se puede exportar como `.pfx`. Requiere un script de firma personalizado.
- **Proveedores**: DigiCert, Sectigo (con HSM), SSL.com (eSigner).

### Opción C — Sin certificado (beta privada o uso personal)

Aceptar el aviso de SmartScreen. Documentarlo en el README para que los
usuarios sepan que deben hacer clic en "Más información" → "Ejecutar de todas formas".

---

## Variables de entorno

```
WIN_CERT_PATH        Ruta absoluta al fichero .pfx del certificado
WIN_CERT_PASSWORD    Contraseña del .pfx
```

Para EV en HSM (Azure Key Vault, etc.) estas variables no aplican; ver
la sección "Firma con HSM" más abajo.

---

## Configuración en `electron-builder.config.cjs`

La configuración ya está preparada en el fichero. Las variables de entorno
`WIN_CERT_PATH` y `WIN_CERT_PASSWORD` se leen en tiempo de build; si no están
definidas, el build se genera sin firma.

Para activar la firma basta con exportar las variables antes de ejecutar
`pnpm exec electron-builder`:

```bash
export WIN_CERT_PATH=/ruta/al/certificado.pfx
export WIN_CERT_PASSWORD=mi_contraseña_segura
pnpm exec electron-builder --config electron-builder.config.cjs --win --publish never
```

---

## Firma con HSM (certificado EV)

Los certificados EV requieren un script de firma externo que delegue la
operación al HSM. Ejemplo con Azure Key Vault:

```js
// scripts/sign-win-akv.js
const { execSync } = require('child_process');

exports.default = async function(config) {
  const args = [
    'sign', '/fd', 'sha256',
    '/tr', 'http://timestamp.digicert.com',
    '/td', 'sha256',
    '/kvu', process.env.AZURE_KEY_VAULT_URI,
    '/kvi', process.env.AZURE_KEY_VAULT_CLIENT_ID,
    '/kvs', process.env.AZURE_KEY_VAULT_CLIENT_SECRET,
    '/kvc', process.env.AZURE_KEY_VAULT_CERT_NAME,
    config.path,
  ];
  execSync(`AzureSignTool ${args.join(' ')}`);
};
```

Y en `electron-builder.config.cjs` bajo `win`:

```js
sign: './scripts/sign-win-akv.js',
signingHashAlgorithms: ['sha256'],
```

---

## Firma manual (si electron-builder falla)

```powershell
# Requiere Windows SDK (signtool.exe)
$cert = "C:\ruta\al\certificado.pfx"
$pass = "contraseña"
$ts   = "http://timestamp.digicert.com"

signtool sign /fd sha256 /tr $ts /td sha256 /f $cert /p $pass Vela-Setup-*.exe
```

---

## Verificación

```powershell
signtool verify /pa /v "Vela-Setup-1.0.0-x64.exe"
```

Salida esperada con firma válida:

```
Successfully verified: Vela-Setup-1.0.0-x64.exe
Number of files successfully Verified: 1
```

---

## En GitHub Actions

Añadir los secretos `WIN_CERT_PATH_B64` (certificado .pfx codificado en base64)
y `WIN_CERT_PASSWORD` en la configuración del repositorio. En el workflow:

```yaml
- name: Decode certificate
  if: env.WIN_CERT_PATH_B64 != ''
  run: |
    echo "$WIN_CERT_PATH_B64" | base64 -d > /tmp/cert.pfx
    echo "WIN_CERT_PATH=/tmp/cert.pfx" >> $GITHUB_ENV
  env:
    WIN_CERT_PATH_B64: ${{ secrets.WIN_CERT_PATH_B64 }}

- name: Package & Publish (Windows)
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    WIN_CERT_PATH: ${{ env.WIN_CERT_PATH }}
    WIN_CERT_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
  run: pnpm exec electron-builder --config electron-builder.config.cjs --win --publish always
```
