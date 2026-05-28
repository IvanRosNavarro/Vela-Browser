# Firma de código — Linux (GPG)

En Linux no hay un Gatekeeper equivalente. La firma GPG es opcional pero
es buena práctica para que los usuarios puedan verificar la autenticidad
de los binarios, especialmente si se distribuyen fuera de GitHub Releases
(repositorios APT, mirrors, etc.).

---

## Generar una clave GPG de firma

```bash
gpg --full-generate-key
# Tipo: RSA y RSA
# Tamaño: 4096 bits
# Expiración: 2y (renovar cada 2 años)
# Nombre: Vela Browser
# Email: releases@vela-browser.example
```

Ver el fingerprint de la clave generada:

```bash
gpg --list-keys --fingerprint releases@vela-browser.example
```

---

## Exportar la clave pública

Para que los usuarios puedan verificar las firmas, hay que publicar la
clave pública:

```bash
# Exportar a fichero ASCII
gpg --armor --export releases@vela-browser.example > vela-gpg-pubkey.asc

# Subir al release de GitHub
gh release upload v1.0.0 vela-gpg-pubkey.asc
```

Documentar en el README que los usuarios deben importar la clave:

```bash
gpg --import vela-gpg-pubkey.asc
# o desde keyserver:
gpg --keyserver keyserver.ubuntu.com --recv-keys <FINGERPRINT>
```

---

## Firmar los artefactos de release

```bash
# Firmar el .deb
gpg --armor --detach-sign Vela-1.0.0-x64.deb

# Firmar el .AppImage
gpg --armor --detach-sign Vela-1.0.0-x64.AppImage

# Subir artefactos y firmas al release de GitHub
gh release upload v1.0.0 \
  Vela-1.0.0-x64.deb \
  Vela-1.0.0-x64.deb.asc \
  Vela-1.0.0-x64.AppImage \
  Vela-1.0.0-x64.AppImage.asc
```

---

## Firma con `dpkg-sig` (para repositorios APT)

Si se distribuye a través de un repositorio APT, se puede usar `dpkg-sig`
para incrustar la firma dentro del propio `.deb`:

```bash
# Instalar dpkg-sig
sudo apt-get install dpkg-sig

# Firmar el .deb
dpkg-sig --sign builder Vela-1.0.0-x64.deb
```

Verificación:

```bash
dpkg-sig --verify Vela-1.0.0-x64.deb
```

---

## Verificación por el usuario final

```bash
# Importar la clave pública de Vela
gpg --import vela-gpg-pubkey.asc

# Verificar la firma del .deb
gpg --verify Vela-1.0.0-x64.deb.asc Vela-1.0.0-x64.deb

# Verificar la firma del .AppImage
gpg --verify Vela-1.0.0-x64.AppImage.asc Vela-1.0.0-x64.AppImage
```

Salida esperada:

```
gpg: Signature made ...
gpg: Good signature from "Vela Browser <releases@vela-browser.example>"
```

---

## En GitHub Actions

Para firmar automáticamente en CI, el secreto `GPG_PRIVATE_KEY` debe
contener la clave privada exportada como ASCII, y `GPG_PASSPHRASE` la
frase de paso:

```yaml
- name: Import GPG key
  if: matrix.os == 'ubuntu-latest'
  run: |
    echo "$GPG_PRIVATE_KEY" | gpg --batch --import
  env:
    GPG_PRIVATE_KEY: ${{ secrets.GPG_PRIVATE_KEY }}

- name: Sign Linux artifacts
  if: matrix.os == 'ubuntu-latest'
  run: |
    for f in release/${{ github.ref_name }}/*.deb release/${{ github.ref_name }}/*.AppImage; do
      gpg --batch --yes --passphrase "$GPG_PASSPHRASE" \
          --armor --detach-sign "$f"
    done
  env:
    GPG_PASSPHRASE: ${{ secrets.GPG_PASSPHRASE }}
```

---

## Nota sobre `latest.yml` y SHA-512

electron-updater genera automáticamente un `latest.yml` con el hash
SHA-512 de cada artefacto. Aunque no haya firma GPG, electron-updater
verifica este hash antes de instalar cualquier actualización, lo que
protege contra descargas corruptas o ataques de sustitución en tránsito
(siempre que la conexión a GitHub Releases use HTTPS).
