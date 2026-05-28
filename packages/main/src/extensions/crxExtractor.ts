import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Extracción mínima de paquetes .crx (CRX2 y CRX3) sin dependencias externas.
 *
 * Layout CRX:
 *   [4]  magic "Cr24"
 *   [4]  version LE
 *   CRX3:
 *     [4]  header_size LE
 *     [..] header (CrxFileHeader protobuf — lo saltamos sin parsear)
 *     [..] datos ZIP
 *   CRX2 (legacy):
 *     [4]  public_key_len LE
 *     [4]  signature_len LE
 *     [..] public_key
 *     [..] signature
 *     [..] datos ZIP
 *
 * Solo extraemos el ZIP embebido — la verificación criptográfica de la firma
 * la hace Electron al cargar la extensión. Esta función solo debe usarse con
 * .crx que el usuario haya descargado conscientemente: el endpoint público
 * (Chrome Web Store) es la frontera de confianza, no nosotros.
 */
export function extractCrx(crxPath: string, destDir: string): void {
  const buf = fs.readFileSync(crxPath);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'Cr24') {
    throw new Error(`[crx] cabecera inválida en ${crxPath}`);
  }
  const version = buf.readUInt32LE(4);
  let zipStart: number;
  if (version === 3) {
    const headerSize = buf.readUInt32LE(8);
    zipStart = 12 + headerSize;
  } else if (version === 2) {
    const publicKeyLen = buf.readUInt32LE(8);
    const signatureLen = buf.readUInt32LE(12);
    zipStart = 16 + publicKeyLen + signatureLen;
  } else {
    throw new Error(`[crx] versión no soportada: ${version}`);
  }
  if (zipStart >= buf.length) {
    throw new Error(`[crx] cabecera incoherente en ${crxPath}`);
  }
  extractZip(buf.subarray(zipStart), destDir);
}

/**
 * Extrae un ZIP en memoria al directorio de destino. Soporta los métodos de
 * compresión que Chrome usa en .crx: store (0) y deflate (8). Otros métodos
 * (LZMA, etc.) lanzan error: en la práctica las extensiones reales no los
 * usan.
 *
 * Protección de path traversal: nombres con ".." en cualquier segmento o
 * separadores absolutos se rechazan antes de tocar el filesystem.
 */
export function extractZip(buf: Buffer, destDir: string): void {
  const eocd = findEocd(buf);
  if (eocd < 0) {
    throw new Error('[zip] EOCD no encontrado — archivo corrupto');
  }
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const centralDirOffset = buf.readUInt32LE(eocd + 16);

  fs.mkdirSync(destDir, { recursive: true });

  let pos = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error('[zip] firma de directorio central inválida');
    }
    const compMethod = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const fileNameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const externalAttrs = buf.readUInt32LE(pos + 38);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const fileName = buf.toString('utf8', pos + 46, pos + 46 + fileNameLen);
    pos += 46 + fileNameLen + extraLen + commentLen;

    assertSafePath(fileName);

    const isDir =
      fileName.endsWith('/') || (externalAttrs & 0x10) !== 0;
    const outPath = path.join(destDir, fileName);

    if (isDir) {
      fs.mkdirSync(outPath, { recursive: true });
      continue;
    }

    if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error('[zip] firma local de archivo inválida');
    }
    const lhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lhFileNameLen + lhExtraLen;
    const compressed = buf.subarray(dataStart, dataStart + compSize);

    let raw: Buffer;
    if (compMethod === 0) {
      raw = Buffer.from(compressed);
    } else if (compMethod === 8) {
      raw = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(
        `[zip] método de compresión no soportado: ${compMethod} (${fileName})`,
      );
    }

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, raw);
  }
}

function findEocd(buf: Buffer): number {
  // EOCD máximo a 22 + 65535 bytes del final. Empezamos por el offset mínimo
  // y vamos hacia atrás buscando la firma 0x06054b50.
  const start = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  return -1;
}

function assertSafePath(name: string): void {
  if (!name) throw new Error('[zip] nombre vacío');
  if (path.isAbsolute(name) || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
    throw new Error(`[zip] path absoluto rechazado: ${name}`);
  }
  const segments = name.split(/[\\/]/);
  for (const seg of segments) {
    if (seg === '..') {
      throw new Error(`[zip] path traversal rechazado: ${name}`);
    }
  }
}
