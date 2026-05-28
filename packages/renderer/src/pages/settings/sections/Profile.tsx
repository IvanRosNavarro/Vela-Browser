import { useEffect, useState } from 'react';
import type { Profile as ProfileType } from '@vela/shared';
import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';

interface Props {
  settings: ReturnType<typeof useSettings>;
}

export function Profile(_props: Props) {
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [clearState, setClearState] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle');

  useEffect(() => {
    void (async () => {
      const ctxRes = await window.api.context();
      if (!ctxRes.ok) return;
      const listRes = await window.api.profile.list();
      if (!listRes.ok) return;
      const p = listRes.data.find((x) => x.id === ctxRes.data.profileId) ?? null;
      setProfile(p);
      setEditName(p?.name ?? '');
    })();
  }, []);

  async function saveName() {
    if (!profile || editName.trim() === profile.name) return;
    setSavingName(true);
    const res = await window.api.profile.update({ id: profile.id, name: editName.trim() });
    if (res.ok) setProfile(res.data);
    setSavingName(false);
  }

  async function clearData() {
    if (clearState === 'idle') { setClearState('confirm'); return; }
    if (clearState !== 'confirm') return;
    setClearState('loading');
    await window.api.profile.clearData();
    setClearState('done');
    setTimeout(() => setClearState('idle'), 3000);
  }

  if (!profile) {
    return <p className="text-sm text-[var(--vela-fg-muted)]">Cargando perfil…</p>;
  }

  const clearLabels = { idle: 'Limpiar caché y cookies', confirm: '¿Confirmar?', loading: 'Limpiando…', done: 'Listo' };

  return (
    <>
      <SettingSection title="Información">
        <SettingRow label="Nombre del perfil">
          <div className="flex items-center gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => e.key === 'Enter' && void saveName()}
              className="w-48 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]"
            />
            {savingName && <span className="text-xs text-[var(--vela-fg-muted)]">Guardando…</span>}
          </div>
        </SettingRow>
        {profile.color && (
          <SettingRow label="Color del perfil">
            <div className="h-5 w-5 rounded-full border border-[var(--vela-border)]" style={{ background: profile.color }} />
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title="Seguridad">
        <SettingRow
          label="Contraseña maestra"
          description={
            profile.hasMasterPassword
              ? 'Este perfil está protegido con contraseña maestra.'
              : 'Protege el perfil con una contraseña al abrirlo.'
          }
        >
          {profile.hasMasterPassword ? (
            <button
              onClick={() => void window.api.profile.removeMasterPassword({ id: profile.id, currentMasterPassword: '' })}
              className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
            >
              Cambiar contraseña
            </button>
          ) : (
            <span className="text-xs text-[var(--vela-fg-muted)]">Sin contraseña (Fase 4)</span>
          )}
        </SettingRow>
      </SettingSection>

      <SettingSection title="Datos">
        <SettingRow label="Limpiar caché y cookies" description="Elimina datos de navegación de este perfil.">
          <button
            onClick={() => void clearData()}
            disabled={clearState === 'loading' || clearState === 'done'}
            className={[
              'rounded-md border px-3 py-1 text-sm transition-colors disabled:opacity-50',
              clearState === 'confirm'
                ? 'border-red-500 text-red-500 hover:bg-red-500/10'
                : 'border-[var(--vela-border)] bg-[var(--vela-bg-surface)] text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50',
            ].join(' ')}
          >
            {clearLabels[clearState]}
          </button>
        </SettingRow>
        <SettingRow label="Eliminar perfil" description="Borra permanentemente este perfil y sus datos.">
          <button
            onClick={() => void window.api.profile.delete({ id: profile.id })}
            className="rounded-md border border-red-500 px-3 py-1 text-sm text-red-500 hover:bg-red-500/10"
          >
            Eliminar perfil…
          </button>
        </SettingRow>
      </SettingSection>
    </>
  );
}
