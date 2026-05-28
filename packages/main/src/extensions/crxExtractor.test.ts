import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { extractCrx, extractZip } from './crxExtractor';

/**
 * Construye un ZIP en memoria con los entries indicados. Solo soporta lo
 * mínimo que necesitamos: archivos con compresión deflate o store, sin
 * cabeceras extra. Esto evita depender de un wrapper de tests específico.
 */
function buildZip(
  entries: Array<{ name: string; data: Buffer; method?: 0 | 8 }>,
): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  const offsets: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 8;
    const compressed =
      method === 0 ? entry.data : zlib.deflateRawSync(entry.data);
    const nameBuf = Buffer.from(entry.name, 'utf8');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(0, 14); // crc (no usado al leer)
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    offsets.push(offset);
    localChunks.push(localHeader, nameBuf, compressed);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  let centralOffset = offset;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const method = entry.method ?? 8;
    const compressed =
      method === 0 ? entry.data : zlib.deflateRawSync(entry.data);
    const nameBuf = Buffer.from(entry.name, 'utf8');

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offsets[i]!, 42);

    centralChunks.push(centralHeader, nameBuf);
  }

  const centralStart = centralOffset;
  const centralBuf = Buffer.concat(centralChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralBuf, eocd]);
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vela-crx-test-'));
}

describe('extractZip', () => {
  it('extrae archivos deflate y store correctamente', () => {
    const zip = buildZip([
      {
        name: 'manifest.json',
        data: Buffer.from('{"name":"x"}', 'utf8'),
        method: 8,
      },
      {
        name: 'background.js',
        data: Buffer.from('console.log(1)', 'utf8'),
        method: 0,
      },
    ]);
    const dest = tmpDir();
    extractZip(zip, dest);
    expect(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8')).toBe(
      '{"name":"x"}',
    );
    expect(fs.readFileSync(path.join(dest, 'background.js'), 'utf8')).toBe(
      'console.log(1)',
    );
  });

  it('crea subdirectorios anidados', () => {
    const zip = buildZip([
      {
        name: 'icons/16.png',
        data: Buffer.from([1, 2, 3, 4]),
        method: 0,
      },
      {
        name: 'icons/sub/32.png',
        data: Buffer.from([5, 6]),
        method: 0,
      },
    ]);
    const dest = tmpDir();
    extractZip(zip, dest);
    expect(fs.readFileSync(path.join(dest, 'icons/16.png'))).toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
    expect(fs.readFileSync(path.join(dest, 'icons/sub/32.png'))).toEqual(
      Buffer.from([5, 6]),
    );
  });

  it('rechaza path traversal con ".."', () => {
    const zip = buildZip([
      {
        name: '../escape.js',
        data: Buffer.from('!'),
        method: 0,
      },
    ]);
    const dest = tmpDir();
    expect(() => extractZip(zip, dest)).toThrow(/traversal/);
  });

  it('rechaza paths absolutos', () => {
    const zip = buildZip([
      {
        name: '/etc/passwd',
        data: Buffer.from('!'),
        method: 0,
      },
    ]);
    const dest = tmpDir();
    expect(() => extractZip(zip, dest)).toThrow(/absoluto/);
  });
});

describe('extractCrx', () => {
  it('extrae un CRX3 envolviendo un ZIP válido', () => {
    const inner = buildZip([
      {
        name: 'manifest.json',
        data: Buffer.from('{"name":"crx3"}', 'utf8'),
        method: 8,
      },
    ]);
    const header = Buffer.alloc(12);
    header.write('Cr24', 0, 'ascii');
    header.writeUInt32LE(3, 4);
    header.writeUInt32LE(0, 8); // header_size = 0 (sin firma — válido para nuestro extractor)
    const crx = Buffer.concat([header, inner]);

    const crxPath = path.join(tmpDir(), 'test.crx');
    fs.writeFileSync(crxPath, crx);
    const dest = tmpDir();
    extractCrx(crxPath, dest);
    expect(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8')).toBe(
      '{"name":"crx3"}',
    );
  });

  it('rechaza magic incorrecta', () => {
    const crxPath = path.join(tmpDir(), 'bad.crx');
    fs.writeFileSync(crxPath, Buffer.from('NOPE000000000000', 'utf8'));
    expect(() => extractCrx(crxPath, tmpDir())).toThrow(/cabecera inválida/);
  });

  it('rechaza versión no soportada', () => {
    const header = Buffer.alloc(16);
    header.write('Cr24', 0, 'ascii');
    header.writeUInt32LE(99, 4);
    const crxPath = path.join(tmpDir(), 'bad.crx');
    fs.writeFileSync(crxPath, header);
    expect(() => extractCrx(crxPath, tmpDir())).toThrow(/versión/);
  });
});
