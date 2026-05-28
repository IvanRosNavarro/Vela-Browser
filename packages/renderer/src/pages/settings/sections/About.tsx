import { useCallback, useEffect, useState } from 'react';
import type { AppVersions } from '@vela/shared';

declare const __APP_VERSION__: string;

const GITHUB_REPO = 'https://github.com/IvanRosNavarro/Vela-Browser';

function buildBugReportUrl(versions: AppVersions | null): string {
  const app = versions?.app ?? __APP_VERSION__;
  const body = [
    '## Descripción del problema\n\n<!-- Describe el bug aquí -->',
    '## Pasos para reproducir\n\n1. \n2. \n3. ',
    '## Comportamiento esperado\n\n',
    '## Versiones\n\n' +
      `| Componente | Versión |\n|---|---|\n` +
      `| Vela | ${app} |\n` +
      (versions
        ? `| Electron | ${versions.electron} |\n` +
          `| Chromium | ${versions.chromium} |\n` +
          `| Node.js | ${versions.node} |\n`
        : '') +
      `| Plataforma | ${navigator.platform} |`,
  ].join('\n\n');
  return `${GITHUB_REPO}/issues/new?labels=bug&body=${encodeURIComponent(body)}`;
}

export function About() {
  const [versions, setVersions] = useState<AppVersions | null>(null);

  useEffect(() => {
    void window.api.runtime.getVersions().then((res) => {
      if (res.ok) setVersions(res.data);
    });
  }, []);

  const rows: [string, string][] = versions
    ? [
        ['Vela', versions.app],
        ['Electron', versions.electron],
        ['Chromium', versions.chromium],
        ['Node.js', versions.node],
      ]
    : [['Vela', __APP_VERSION__]];

  const handleReportBug = useCallback(() => {
    void window.api.runtime.openExternal({ url: buildBugReportUrl(versions) });
  }, [versions]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 py-4">
        <h2 className="text-2xl font-semibold text-[var(--vela-fg)]">Vela</h2>
        <p className="text-sm text-[var(--vela-fg-muted)]">Versión {__APP_VERSION__}</p>
        <p className="mt-1 max-w-sm text-center text-xs text-[var(--vela-fg-muted)]">
          Navegador de escritorio inspirado en Arc y Zen. Construido con Electron, React y TypeScript.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)]">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between border-b border-[var(--vela-border)] px-4 py-2.5 last:border-0"
          >
            <span className="text-sm text-[var(--vela-fg-muted)]">{label}</span>
            <span className="font-mono text-sm text-[var(--vela-fg)]">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
          Legal
        </p>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Vela se distribuye bajo la{' '}
          <span className="text-[var(--vela-fg)]">Licencia GPL-3.0-only</span>.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
          Ayuda
        </p>
        <button
          type="button"
          onClick={handleReportBug}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-4 py-2.5 text-left transition-colors hover:bg-[var(--vela-bg-hover)]"
        >
          <span className="text-sm text-[var(--vela-fg)]">Reportar un bug</span>
          <span className="text-xs text-[var(--vela-fg-muted)]">Abre GitHub ↗</span>
        </button>
      </div>
    </div>
  );
}
