import { app, type WebContents } from 'electron';

function originOf(url: string): string | null {
  try {
    const o = new URL(url).origin;
    return o && o !== 'null' ? o : null;
  } catch {
    return null;
  }
}

export interface CertificateManagerDeps {
  /**
   * Devuelve true si ese WebContents es una pestaña de usuario gestionada por
   * TabManager. Solo en esas navegamos a vela://cert-error; en la shell, popups
   * y vistas auxiliares (glance, preview) el error se rechaza en silencio.
   */
  isUserTab(webContentsId: number): boolean;
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

  // wcId → URL de la navegación de main frame en curso. Sirve para distinguir
  // el fallo de certificado de la propia página (interstitial) del de un
  // subrecurso (imagen, favicon, XHR), que solo debe fallar en silencio.
  private readonly mainFrameNavByWc = new Map<number, string>();

  constructor(private readonly deps: CertificateManagerDeps) {
    app.on('web-contents-created', (_e, wc) => {
      this.trackMainFrameNavigation(wc);
    });

    app.on('certificate-error', (event, wc, url, error, certificate, callback) => {
      const fp = certificate.fingerprint;
      const origin = originOf(url);

      // Huella ya aceptada por el usuario para ese origen: se acepta venga de
      // donde venga (navegación principal, subrecurso o favicon en la shell).
      if (origin && this.allowedByOrigin.get(origin)?.has(fp)) {
        event.preventDefault();
        callback(true);
        return;
      }

      // Solo las pestañas del usuario muestran el interstitial. La shell, los
      // popups y las vistas auxiliares comparten este evento (p. ej. al cargar
      // un favicon de un sitio con cert inválido): ahí rechazamos sin navegar,
      // porque cargar vela://cert-error reemplazaría la UI entera.
      // NOTA: no se puede usar `BrowserWindow.fromWebContents(wc) !== null` para
      // esto — desde Electron 30+ devuelve la ventana propietaria también para
      // los WebContentsView adjuntos, así que descartaba todas las pestañas.
      if (!this.deps.isUserTab(wc.id)) {
        callback(false);
        return;
      }

      // Fallo en un subrecurso de la página, no en la navegación principal:
      // rechazar sin interstitial (el recurso simplemente no carga).
      if (!this.isMainFrameFailure(wc, url)) {
        callback(false);
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

  private trackMainFrameNavigation(wc: WebContents): void {
    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      this.mainFrameNavByWc.set(wc.id, details.url);
    });
    wc.once('destroyed', () => {
      this.mainFrameNavByWc.delete(wc.id);
      this.pendingByWc.delete(wc.id);
    });
  }

  /**
   * El error es de la navegación principal si su origen coincide con el de la
   * URL que el main frame está cargando. Si no hay navegación registrada (el
   * WebContents existía antes que este manager) asumimos que sí lo es, para no
   * dejar al usuario con una pestaña en blanco sin explicación.
   */
  private isMainFrameFailure(wc: WebContents, url: string): boolean {
    const navUrl = this.mainFrameNavByWc.get(wc.id);
    if (navUrl === undefined) return true;
    return originOf(navUrl) === originOf(url);
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
