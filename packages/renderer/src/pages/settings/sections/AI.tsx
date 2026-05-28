import { Sparkles, MessageSquare, FileText, Languages, Search, Terminal } from 'lucide-react';

const FEATURES = [
  { icon: MessageSquare, label: 'Chat con contexto de la página activa' },
  { icon: FileText,      label: 'Resumen de artículos con un clic' },
  { icon: Languages,     label: 'Traducción de selecciones y páginas' },
  { icon: Search,        label: 'Búsqueda semántica en el historial' },
  { icon: Terminal,      label: 'Comandos rápidos desde el command palette' },
];

export function AI() {
  return (
    <div className="flex flex-col items-center gap-6 py-14 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--vela-accent)]/10">
        <Sparkles className="h-8 w-8 text-[var(--vela-accent)]" strokeWidth={1.5} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-[var(--vela-fg)]">IA integrada</h2>
        <p className="max-w-sm text-sm text-[var(--vela-fg-muted)]">
          Conecta Vela con Claude, ChatGPT u Ollama para resumir páginas,
          traducir, buscar en tu historial y mucho más.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 text-left">
        {FEATURES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-4 py-3"
          >
            <Icon className="h-4 w-4 shrink-0 text-[var(--vela-accent)]" />
            <span className="text-sm text-[var(--vela-fg)]">{label}</span>
          </div>
        ))}
      </div>

      <span className="rounded-full border border-[var(--vela-accent)]/40 bg-[var(--vela-accent)]/10 px-3 py-1 text-xs font-medium text-[var(--vela-accent)]">
        Disponible en la próxima versión principal
      </span>

      <p className="max-w-xs text-xs text-[var(--vela-fg-muted)]">
        La configuración de claves API y modelos locales aparecerá aquí cuando
        esta función esté activa.
      </p>
    </div>
  );
}
