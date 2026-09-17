// Toasts de la shell y de las páginas internas. El store y el helper viven en
// vela-kit (ADR 0106); este módulo mantiene la ruta de import de siempre.
export { useToastStore, toast, TOAST_TIMEOUT_MS } from 'vela-kit/ui';
export type { Toast, ToastState, ToastVariant } from 'vela-kit/ui';
