/**
 * Genera build/blindada.ico — fantasma 32x32 en PNG-in-ICO.
 * Uso: node scripts/generate-blindada-ico.mjs
 */
import { deflateRawSync } from 'zlib';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'build', 'fantasma.ico');

const W = 32, H = 32;
const pixels = new Array(W * H).fill(null).map(() => [0, 0, 0, 0]);

// ── helpers ──────────────────────────────────────────────────────────────────

function set(x, y)   { if (x>=0&&x<W&&y>=0&&y<H) pixels[y*W+x]=[255,255,255,255]; }
function clear(x, y) { if (x>=0&&x<W&&y>=0&&y<H) pixels[y*W+x]=[0,0,0,0]; }

function fillCircle(cx, cy, r) {
  for (let dy=-r; dy<=r; dy++)
    for (let dx=-r; dx<=r; dx++)
      if (dx*dx+dy*dy <= r*r+r*0.5) set(cx+dx, cy+dy);
}

function clearCircle(cx, cy, r) {
  for (let dy=-r-1; dy<=r+1; dy++)
    for (let dx=-r-1; dx<=r+1; dx++)
      if (dx*dx+dy*dy <= r*r+r*0.5) clear(cx+dx, cy+dy);
}

function fillRect(x1, y1, x2, y2) {
  for (let y=y1; y<=y2; y++) for (let x=x1; x<=x2; x++) set(x,y);
}

function clearRect(x1, y1, x2, y2) {
  for (let y=y1; y<=y2; y++) for (let x=x1; x<=x2; x++) clear(x,y);
}

// ── diseño del fantasma ───────────────────────────────────────────────────────

// Cabeza redonda
fillCircle(16, 11, 10);

// Cuerpo (costados rectos hacia abajo)
fillRect(6, 11, 25, 22);

// Cola ondulada — 3 protuberancias hacia abajo
fillCircle(10, 22, 4);
fillCircle(16, 22, 4);
fillCircle(22, 22, 4);

// Valles entre protuberancias (recortes cóncavos para el efecto de ola)
clearCircle(13, 24, 3);
clearCircle(19, 24, 3);

// Recortar los flancos para que el cuerpo sea más estrecho que la cabeza
clearRect(0, 0, 5, 31);
clearRect(26, 0, 31, 31);

// Ojos (huecos en la cabeza — dos óvalos)
clearCircle(12, 10, 2);
clearCircle(20, 10, 2);

// ── codificación PNG ──────────────────────────────────────────────────────────

function crc32(buf) {
  const t = [];
  for (let i=0; i<256; i++) {
    let c=i;
    for (let j=0; j<8; j++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[i]=c;
  }
  let crc=0xFFFFFFFF;
  for (const b of buf) crc=t[(crc^b)&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

function pngChunk(type, data) {
  const lenBuf=Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
  const typeBuf=Buffer.from(type,'ascii');
  const crcBuf=Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf,data])));
  return Buffer.concat([lenBuf,typeBuf,data,crcBuf]);
}

function makePng() {
  const SIG=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
  ihdr[8]=8; ihdr[9]=6; // RGBA
  const rows=[];
  for (let y=0; y<H; y++) {
    const row=Buffer.alloc(1+W*4);
    for (let x=0; x<W; x++) {
      const [r,g,b,a]=pixels[y*W+x];
      row[1+x*4]=r; row[1+x*4+1]=g; row[1+x*4+2]=b; row[1+x*4+3]=a;
    }
    rows.push(row);
  }
  return Buffer.concat([
    SIG,
    pngChunk('IHDR',ihdr),
    pngChunk('IDAT',deflateRawSync(Buffer.concat(rows))),
    pngChunk('IEND',Buffer.alloc(0)),
  ]);
}

function makeIco(png) {
  const header=Buffer.alloc(6);
  header.writeUInt16LE(0,0); header.writeUInt16LE(1,2); header.writeUInt16LE(1,4);
  const dir=Buffer.alloc(16);
  dir[0]=W; dir[1]=H; dir[2]=0; dir[3]=0;
  dir.writeUInt16LE(1,4); dir.writeUInt16LE(32,6);
  dir.writeUInt32LE(png.length,8); dir.writeUInt32LE(22,12);
  return Buffer.concat([header,dir,png]);
}

const ico = makeIco(makePng());
writeFileSync(OUT, ico);
console.log(`Generado: ${OUT} (${ico.length} bytes)`);
