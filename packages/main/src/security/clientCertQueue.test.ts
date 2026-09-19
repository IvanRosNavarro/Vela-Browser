import { describe, expect, it } from 'vitest';
import { ClientCertRequestQueue } from './clientCertQueue';

interface Cert { fingerprint: string }

const A: Cert = { fingerprint: 'aa' };
const B: Cert = { fingerprint: 'bb' };

function caller(certificates: Cert[] = [A, B]) {
  const received: Array<Cert | undefined> = [];
  return {
    received,
    caller: { certificates, callback: (c?: Cert) => { received.push(c); } },
  };
}

const byFingerprint = (fp: string) => (list: Cert[]) => list.find((c) => c.fingerprint === fp);

describe('ClientCertRequestQueue', () => {
  it('la primera petición pide mostrar el selector', () => {
    const q = new ClientCertRequestQueue<Cert>();
    expect(q.enqueue(1, 'https://sede.gob.es', caller().caller)).toBe('show');
    expect(q.current(1)?.origin).toBe('https://sede.gob.es');
  });

  it('las peticiones al mismo origen se agrupan y reciben el mismo certificado', () => {
    const q = new ClientCertRequestQueue<Cert>();
    const first = caller();
    const second = caller([B, A]);
    q.enqueue(1, 'https://sede.gob.es', first.caller);
    expect(q.enqueue(1, 'https://sede.gob.es', second.caller)).toBe('joined');

    q.resolveCurrent(1, byFingerprint('bb'));
    expect(first.received).toEqual([B]);
    // Cada llamador recibe el objeto de su propia lista.
    expect(second.received[0]).toBe(B);
    expect(q.has(1)).toBe(false);
  });

  it('no cancela la petición anterior al llegar otra', () => {
    const q = new ClientCertRequestQueue<Cert>();
    const first = caller();
    q.enqueue(1, 'https://sede.gob.es', first.caller);
    q.enqueue(1, 'https://sede.gob.es', caller().caller);
    expect(first.received).toEqual([]);
  });

  it('otro origen espera su turno y pasa a ser el actual al resolver', () => {
    const q = new ClientCertRequestQueue<Cert>();
    q.enqueue(1, 'https://a.gob.es', caller().caller);
    const other = caller();
    expect(q.enqueue(1, 'https://b.gob.es', other.caller)).toBe('queued');

    const next = q.resolveCurrent(1, () => undefined);
    expect(next?.origin).toBe('https://b.gob.es');
    expect(q.current(1)?.origin).toBe('https://b.gob.es');
    expect(other.received).toEqual([]);
  });

  it('cancelar entrega undefined a todos los agrupados', () => {
    const q = new ClientCertRequestQueue<Cert>();
    const first = caller();
    const second = caller();
    q.enqueue(1, 'https://sede.gob.es', first.caller);
    q.enqueue(1, 'https://sede.gob.es', second.caller);
    q.resolveCurrent(1, () => undefined);
    expect(first.received).toEqual([undefined]);
    expect(second.received).toEqual([undefined]);
  });

  it('las pestañas son independientes', () => {
    const q = new ClientCertRequestQueue<Cert>();
    expect(q.enqueue(1, 'https://sede.gob.es', caller().caller)).toBe('show');
    expect(q.enqueue(2, 'https://sede.gob.es', caller().caller)).toBe('show');
  });

  it('cancelAll resuelve todo lo pendiente y un callback que lanza no corta el resto', () => {
    const q = new ClientCertRequestQueue<Cert>();
    const ok = caller();
    q.enqueue(1, 'https://a.gob.es', { certificates: [A], callback: () => { throw new Error('destruido'); } });
    q.enqueue(1, 'https://b.gob.es', ok.caller);
    q.cancelAll(1);
    expect(ok.received).toEqual([undefined]);
    expect(q.has(1)).toBe(false);
  });
});
