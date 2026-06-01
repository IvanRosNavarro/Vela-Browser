/**
 * Escribe texto en el portapapeles vía IPC al proceso principal.
 * Usar esta función en lugar de navigator.clipboard.writeText() para
 * evitar el error NotAllowedError cuando el documento no tiene foco
 * (p.ej. al disparar el comando desde un atajo de teclado vía IPC).
 */
export async function writeToClipboard(text: string): Promise<void> {
  await window.api.clipboard.writeText(text);
}
