import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findLaunchTarget, resolveLaunchTarget } from './launchTarget';

let dir: string;
let pdf: string;
let docx: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-launch-'));
  pdf = path.join(dir, 'informe con espacios.pdf');
  docx = path.join(dir, 'carta.docx');
  fs.writeFileSync(pdf, '%PDF-1.4');
  fs.writeFileSync(docx, '');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveLaunchTarget', () => {
  it('acepta URLs http y https', () => {
    expect(resolveLaunchTarget('https://example.com/a')).toBe('https://example.com/a');
    expect(resolveLaunchTarget('http://example.com')).toBe('http://example.com');
  });

  it('convierte la ruta de un fichero visible en file://', () => {
    expect(resolveLaunchTarget(pdf)).toBe(pathToFileURL(pdf).toString());
  });

  it('acepta una URL file:// de un fichero visible', () => {
    const url = pathToFileURL(pdf).toString();
    expect(resolveLaunchTarget(url)).toBe(url);
  });

  it('descarta ficheros que Chromium no pinta y rutas que no existen', () => {
    expect(resolveLaunchTarget(docx)).toBeNull();
    expect(resolveLaunchTarget(path.join(dir, 'no-existe.pdf'))).toBeNull();
    expect(resolveLaunchTarget(dir)).toBeNull();
  });

  it('descarta flags, rutas relativas y otros esquemas', () => {
    expect(resolveLaunchTarget('--new-tab')).toBeNull();
    expect(resolveLaunchTarget('.')).toBeNull();
    expect(resolveLaunchTarget('javascript:alert(1)')).toBeNull();
    expect(resolveLaunchTarget('vela://settings')).toBeNull();
  });
});

describe('findLaunchTarget', () => {
  it('salta el ejecutable y los flags de Chromium', () => {
    const argv = ['C:\\Vela\\Vela.exe', '--allow-file-access-from-files', pdf];
    expect(findLaunchTarget(argv)).toBe(pathToFileURL(pdf).toString());
  });

  it('devuelve null sin nada que abrir', () => {
    expect(findLaunchTarget(['C:\\Vela\\Vela.exe', '--profile=abc'])).toBeNull();
  });
});
