import { app, BrowserWindow } from 'electron';

function originOf(url: string): string | null {
  try {
    const o = new URL(url).origin;
    return o && o !== 'null' ? o : null;
  } catch {
    return null;
  }
}

export class CertificateManager {
  // Origen → huellas que el usuario aceptó EXPLÍCITAMENTE para ese origen.
  // La confianza es por-origen (no global de proceso): aceptar el cert de
  // intranet.local no debe hacer que se acepte un cert MITM para banco.com.
  private readonly allowedByOrigin = new Map<string, Set<string>>();

  // wcId → error de certificado que se está mostrando ahora mismo en ese
  // WebContents. Solo se puede "continuar" con la huella exacta que provocó el
  // error visible; así una navegación a vela://cert-proceed con parámetros
  // arbitrarios no puede whitelistar un cert que nunca se presentó.
  private readonly pendingByWc = new Map<
    number,
    { fingerprint: string; origin: string; url: string }
  >();

  constructor() {
    app.on('certificate-error', (event, wc, url, error, certificate, callback) => {
      // Si el WebContents pertenece a un BrowserWindow (shell o popup),
      // el cert error viene de un recurso secundario (p.ej. favicon de img src).
      // En ese caso rechazamos sin navegar: la imagen simplemente no se carga.
      // Solo navegamos a cert-error en WebContentsViews (tabs del usuario).
      if (BrowserWindow.fromWebContents(wc) !== null) {
        callback(false);
        return;
      }

      const fp = certificate.fingerprint;
      const origin = originOf(url);

      if (origin && this.allowedByOrigin.get(origin)?.has(fp)) {
        event.preventDefault();
        callback(true);
        return;
      }

      callback(false);

      if (origin) {
        this.pendingByWc.set(wc.id, { fingerprint: fp, origin, url });
      }

      setImmediate(() => {
        if (wc.isDestroyed()) return;
        const params = new URLSearchParams({
          url,
          fingerprint: fp,
          error,
          subject: certificate.subjectName,
          issuer: certificate.issuerName,
          wcId: String(wc.id),
        });
        wc.loadURL(`vela://cert-error?${params.toString()}`).catch(() => {
          // ERR_ABORTED esperado si otra navegación ya tomó el relevo
        });
      });
    });
  }

  /**
   * Acepta una huella SOLO si coincide con el error de certificado que se está
   * mostrando ahora en ese WebContents, y la confina al origen afectado.
   * Devuelve la URL original validada a la que navegar, o null si la petición
   * no casa (huella distinta, origen distinto o sin error pendiente).
   */
  allowForWebContents(
    wcId: number,
    fingerprint: string,
    proceedUrl: string,
  ): string | null {
    const pending = this.pendingByWc.get(wcId);
    if (!pending) return null;
    if (pending.fingerprint !== fingerprint) return null;
    if (originOf(proceedUrl) !== pending.origin) return null;

    let set = this.allowedByOrigin.get(pending.origin);
    if (!set) {
      set = new Set<string>();
      this.allowedByOrigin.set(pending.origin, set);
    }
    set.add(fingerprint);
    this.pendingByWc.delete(wcId);
    // Navegamos a la URL original que provocó el error, no a la que venga en el
    // parámetro (evita usar este flujo como redirector arbitrario).
    return pending.url;
  }

  clearPending(wcId: number): void {
    this.pendingByWc.delete(wcId);
  }
}
