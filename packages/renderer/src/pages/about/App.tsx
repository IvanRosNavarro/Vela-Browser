declare const __APP_VERSION__: string;

export function App() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-[var(--vela-bg-app)] text-[var(--vela-fg)]">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Vela</h1>
        <p className="text-sm text-[var(--vela-fg-muted)]">Versión {__APP_VERSION__}</p>
      </div>
      <p className="max-w-sm text-center text-xs text-[var(--vela-fg-muted)]">
        Navegador de escritorio inspirado en Arc y Zen. Licenciado bajo GPL-3.0-only.
      </p>
    </div>
  );
}
