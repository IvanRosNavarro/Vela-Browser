import { app, BrowserWindow } from 'electron';

export class CertificateManager {
  private readonly allowedFingerprints = new Set<string>();

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

      if (this.allowedFingerprints.has(fp)) {
        event.preventDefault();
        callback(true);
        return;
      }

      callback(false);

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

  allow(fingerprint: string): void {
    this.allowedFingerprints.add(fingerprint);
  }
}
