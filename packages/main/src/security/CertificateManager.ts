import { app } from 'electron';

export class CertificateManager {
  private readonly allowedFingerprints = new Set<string>();

  constructor() {
    app.on('certificate-error', (event, wc, url, error, certificate, callback) => {
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
