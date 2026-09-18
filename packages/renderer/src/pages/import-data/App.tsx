import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BrowserImportResult, ImportBrowserId, ImportableBrowser } from '@vela/shared';
import { themeManager } from '../../shared-ui/theme';
import { Toaster } from '../../components/Toaster';
import { toast } from '../../stores/toastStore';

/** Cómo exportar las contraseñas a CSV en cada navegador. */
const PASSWORD_EXPORT_STEPS: { browser: string; steps: string }[] = [
  { browser: 'Chrome', steps: 'Abre chrome://password-manager/settings y pulsa «Exportar contraseñas» → «Descargar archivo».' },
  { browser: 'Edge', steps: 'Abre edge://wallet/passwords, pulsa «…» junto a «Contraseñas» y elige «Exportar contraseñas».' },
  { browser: 'Brave', steps: 'Abre brave://password-manager/settings y pulsa «Exportar contraseñas».' },
  { browser: 'Vivaldi', steps: 'Abre vivaldi://settings/passwords y usa «Exportar contraseñas».' },
  { browser: 'Opera', steps: 'Abre opera://settings/passwords, pulsa «⋮» junto a «Contraseñas guardadas» y elige «Exportar contraseñas».' },
  { browser: 'Firefox', steps: 'Abre about:logins, pulsa «⋯» arriba a la derecha y elige «Exportar contraseñas».' },
];

function resultMessage(r: BrowserImportResult, wantBookmarks: boolean, wantHistory: boolean): string {
  const fav = `${r.bookmarksAdded} ${r.bookmarksAdded === 1 ? 'favorito' : 'favoritos'}`;
  const hist = `${r.historyAdded} ${r.historyAdded === 1 ? 'entrada' : 'entradas'} de historial`;
  if (wantBookmarks && wantHistory && !r.historyDisabled) return `Importados ${fav} y ${hist}`;
  if (wantBookmarks) return `Importados ${fav}`;
  return `Importadas ${hist}`;
}

const card = 'rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)]';
const button = 'rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'rounded-md border border-[var(--vela-accent)] bg-[var(--vela-accent)] px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50';

export function App() {
  const [browsers, setBrowsers] = useState<ImportableBrowser[] | null>(null);
  const [browserId, setBrowserId] = useState<ImportBrowserId | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [wantBookmarks, setWantBookmarks] = useState(true);
  const [wantHistory, setWantHistory] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{ result: BrowserImportResult; browser: string } | null>(null);
  const [importingPasswords, setImportingPasswords] = useState(false);

  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  const detect = useCallback(async () => {
    setBrowsers(null);
    const res = await window.api.browserImport.detect();
    const list = res.ok ? res.data : [];
    setBrowsers(list);
    const first = list[0];
    setBrowserId((prev) => (prev && list.some((b) => b.id === prev) ? prev : first?.id ?? null));
  }, []);

  useEffect(() => {
    void detect();
    void window.api.settings.get({ key: 'history:enabled' }).then((res) => {
      if (res.ok) setHistoryEnabled(res.data?.value !== false);
    });
  }, [detect]);

  const browser = useMemo(() => browsers?.find((b) => b.id === browserId) ?? null, [browsers, browserId]);
  const profile = useMemo(() => browser?.profiles.find((p) => p.id === profileId) ?? null, [browser, profileId]);

  // Al cambiar de navegador, proponer su perfil por defecto.
  useEffect(() => {
    if (!browser) { setProfileId(null); return; }
    setProfileId((prev) => {
      if (prev && browser.profiles.some((p) => p.id === prev)) return prev;
      return (browser.profiles.find((p) => p.isDefault) ?? browser.profiles[0])?.id ?? null;
    });
  }, [browser]);

  const canBookmarks = !!profile?.hasBookmarks;
  const canHistory = !!profile?.hasHistory && historyEnabled;
  const doBookmarks = wantBookmarks && canBookmarks;
  const doHistory = wantHistory && canHistory;

  const runImport = useCallback(async () => {
    if (!browser || !profile || (!doBookmarks && !doHistory)) return;
    setRunning(true);
    try {
      const res = await window.api.browserImport.run({
        browserId: browser.id,
        profileId: profile.id,
        bookmarks: doBookmarks,
        history: doHistory,
      });
      if (res.ok) {
        setLastResult({ result: res.data, browser: browser.name });
        toast(resultMessage(res.data, doBookmarks, doHistory), 'success');
        return;
      }
      const reason = (res.details as { reason?: string } | undefined)?.reason;
      if (reason === 'SOURCE_LOCKED') {
        toast(`No se pudieron leer los datos de ${browser.name}. Ciérralo y vuelve a intentarlo.`, 'error');
      } else if (res.error === 'NOT_FOUND') {
        toast('Ese perfil ya no está disponible. Vuelve a buscar navegadores.', 'error');
        void detect();
      } else {
        toast('No se pudo completar la importación', 'error');
      }
    } finally {
      setRunning(false);
    }
  }, [browser, profile, doBookmarks, doHistory, detect]);

  const importPasswords = useCallback(async () => {
    setImportingPasswords(true);
    try {
      const res = await window.api.vault.importCsv();
      if (!res.ok) {
        toast('No se pudieron importar las contraseñas. ¿Está desbloqueado el gestor?', 'error');
        return;
      }
      const { imported, skipped } = res.data;
      if (imported === 0 && skipped === 0) return; // diálogo cancelado
      toast(
        `Importadas ${imported} ${imported === 1 ? 'contraseña' : 'contraseñas'}` +
          (skipped > 0 ? ` (${skipped} omitidas: repetidas o sin dirección web)` : ''),
        'success',
      );
    } finally {
      setImportingPasswords(false);
    }
  }, []);

  return (
    <div className="vela-scroll h-screen overflow-y-auto bg-[var(--vela-bg-app)] text-[var(--vela-fg)]">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-xl font-semibold">Importar datos de otro navegador</h1>
        <p className="mt-1 text-sm text-[var(--vela-fg-muted)]">
          Trae tus marcadores (a Favoritos) y tu historial desde Chrome, Edge, Brave, Vivaldi, Opera o Firefox.
          Los datos se leen de este equipo; no sale nada de él.
        </p>

        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">Marcadores e historial</h2>
            <button type="button" className={button} onClick={() => void detect()} disabled={browsers === null}>
              Volver a buscar
            </button>
          </div>

          <div className={`${card} p-4`}>
            {browsers === null ? (
              <p className="text-sm text-[var(--vela-fg-muted)]">Buscando navegadores…</p>
            ) : browsers.length === 0 ? (
              <p className="text-sm text-[var(--vela-fg-muted)]">
                No se ha encontrado ningún navegador compatible en este equipo.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div role="radiogroup" aria-label="Navegador" className="flex flex-wrap gap-2">
                  {browsers.map((b) => {
                    const selected = b.id === browserId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setBrowserId(b.id)}
                        className={`rounded-md border px-3 py-1.5 text-sm ${selected
                          ? 'border-[var(--vela-accent)] bg-[var(--vela-accent)] text-white'
                          : 'border-[var(--vela-border)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)] hover:bg-[var(--vela-bg-row-hover)]'}`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>

                {browser && browser.profiles.length > 1 && (
                  <label className="flex items-center justify-between gap-4 text-sm">
                    <span>Perfil</span>
                    <select
                      value={profileId ?? ''}
                      onChange={(e) => setProfileId(e.target.value)}
                      className="max-w-[60%] rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]"
                    >
                      {browser.profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (predeterminado)' : ''}</option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="flex flex-col gap-2 text-sm">
                  <label className={`flex items-start gap-2 ${canBookmarks ? '' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--vela-accent)]"
                      checked={doBookmarks}
                      disabled={!canBookmarks}
                      onChange={(e) => setWantBookmarks(e.target.checked)}
                    />
                    <span>
                      Marcadores
                      <span className="block text-xs text-[var(--vela-fg-muted)]">
                        Se guardan en Favoritos, en la carpeta «Importado de {browser?.name ?? '…'}», con sus carpetas.
                        Los que ya tengas no se duplican.
                      </span>
                    </span>
                  </label>
                  <label className={`flex items-start gap-2 ${canHistory ? '' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--vela-accent)]"
                      checked={doHistory}
                      disabled={!canHistory}
                      onChange={(e) => setWantHistory(e.target.checked)}
                    />
                    <span>
                      Historial
                      <span className="block text-xs text-[var(--vela-fg-muted)]">
                        {historyEnabled
                          ? 'Se respeta el periodo de retención del historial. Las visitas que ya estén no se repiten.'
                          : 'Desactivado: «No registrar historial» está activo en Ajustes → Privacidad.'}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {lastResult && lastResult.result.bookmarksAdded > 0 && (
                    <button type="button" className={button} onClick={() => void window.api.commands.execute('internal.openFavorites')}>
                      Ver favoritos
                    </button>
                  )}
                  <button
                    type="button"
                    className={primaryButton}
                    disabled={running || !profile || (!doBookmarks && !doHistory)}
                    onClick={() => void runImport()}
                  >
                    {running ? 'Importando…' : 'Importar'}
                  </button>
                </div>

                {lastResult && (
                  <p className="text-xs text-[var(--vela-fg-muted)]">
                    Última importación de {lastResult.browser}: {lastResult.result.bookmarksAdded} favoritos nuevos
                    {lastResult.result.bookmarksSkipped > 0 && ` (${lastResult.result.bookmarksSkipped} ya estaban)`}
                    , {lastResult.result.historyAdded} visitas nuevas
                    {lastResult.result.historySkipped > 0 && ` (${lastResult.result.historySkipped} ya estaban o fuera del periodo de retención)`}.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">Contraseñas</h2>
          <div className={`${card} p-4 text-sm`}>
            <p>
              Los navegadores cifran las contraseñas con una clave que otros programas no pueden leer (Chrome, por ejemplo,
              las liga a su propia aplicación). Por eso se importan desde el archivo CSV que exporta el propio navegador:
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {PASSWORD_EXPORT_STEPS.map((s) => (
                <li key={s.browser}>
                  <span className="font-medium">{s.browser}:</span>{' '}
                  <span className="text-[var(--vela-fg-muted)]">{s.steps}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-[var(--vela-fg-muted)]">
              El CSV guarda las contraseñas sin cifrar: bórralo en cuanto termines la importación.
            </p>
            <div className="mt-3 flex justify-end">
              <button type="button" className={button} disabled={importingPasswords} onClick={() => void importPasswords()}>
                {importingPasswords ? 'Importando…' : 'Importar CSV de contraseñas…'}
              </button>
            </div>
          </div>
        </section>
      </div>
      <Toaster />
    </div>
  );
}
