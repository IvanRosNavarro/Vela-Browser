import { useEffect, useMemo, useState } from 'react';
import type { Profile } from '@vela/shared';
import {
  useProfileModalStore,
  useProfilesStore,
} from '../../stores';
import { toast } from '../../stores/toastStore';
import { ProfileForm, type ProfileFormValue } from './ProfileForm';
import { ProfileManagementTable } from './ProfileManagementTable';
import { DeleteProfileDialog } from './DeleteProfileDialog';
import { SetMasterPasswordDialog } from './SetMasterPasswordDialog';

function useEscToClose(close: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);
}

export function ProfileModal() {
  const open = useProfileModalStore((s) => s.open);
  const mode = useProfileModalStore((s) => s.mode);
  const editId = useProfileModalStore((s) => s.editId);
  const close = useProfileModalStore((s) => s.close);
  const openCreate = useProfileModalStore((s) => s.openCreate);
  const openEdit = useProfileModalStore((s) => s.openEdit);

  const masterPasswordOpen = useProfileModalStore((s) => s.masterPasswordOpen);
  const masterPasswordMode = useProfileModalStore((s) => s.masterPasswordMode);
  const masterPasswordTargetId = useProfileModalStore(
    (s) => s.masterPasswordTargetId,
  );
  const openMasterPassword = useProfileModalStore((s) => s.openMasterPassword);
  const closeMasterPassword = useProfileModalStore(
    (s) => s.closeMasterPassword,
  );

  const profiles = useProfilesStore((s) => s.profiles);
  const archivedProfiles = useProfilesStore((s) => s.archivedProfiles);
  const activeProfileId = useProfilesStore((s) => s.activeProfileId);
  const create = useProfilesStore((s) => s.create);
  const update = useProfilesStore((s) => s.update);
  const archive = useProfilesStore((s) => s.archive);
  const deleteProfile = useProfilesStore((s) => s.delete);
  const reload = useProfilesStore((s) => s.reload);

  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);

  useEscToClose(close);

  useEffect(() => {
    if (!open) setPendingDelete(null);
  }, [open]);

  const allProfiles = useMemo(
    () => [...profiles, ...archivedProfiles],
    [profiles, archivedProfiles],
  );

  const editing = useMemo(
    () =>
      mode === 'edit' && editId
        ? allProfiles.find((p) => p.id === editId) ?? null
        : null,
    [mode, editId, allProfiles],
  );

  // En Fase 3 sólo conocemos las ventanas abiertas del perfil de ESTA
  // ventana. Para el resto asumimos 0 (Fase 4 expondrá el conteo total
  // desde ProfileWindowManager). El propósito principal del mapa es
  // bloquear la eliminación del perfil actualmente abierto.
  const openWindowsByProfile = useMemo(() => {
    const m = new Map<string, number>();
    if (activeProfileId) m.set(activeProfileId, 1);
    return m;
  }, [activeProfileId]);

  const masterPasswordTarget = useMemo(
    () =>
      masterPasswordTargetId
        ? allProfiles.find((p) => p.id === masterPasswordTargetId) ?? null
        : null,
    [masterPasswordTargetId, allProfiles],
  );

  if (!open && !masterPasswordOpen) return null;

  const renderHeader = (title: string): React.ReactNode => (
    <div
      className="flex items-center justify-between border-b px-5 py-3"
      style={{ borderColor: 'var(--vela-border)' }}
    >
      <h2 className="text-[14px] font-semibold text-[var(--vela-fg)]">
        {title}
      </h2>
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar"
        className="rounded p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
      >
        ×
      </button>
    </div>
  );

  const submitCreate = async (value: ProfileFormValue): Promise<void> => {
    await create({
      name: value.name,
      icon: value.icon,
      color: value.color,
      ...(value.masterPassword !== undefined
        ? { masterPassword: value.masterPassword }
        : {}),
      ...(value.passwordHint !== undefined
        ? { passwordHint: value.passwordHint }
        : {}),
    });
    await reload();
    close();
    toast(`Perfil “${value.name}” creado`, 'success');
  };

  const submitEdit = async (value: ProfileFormValue): Promise<void> => {
    if (!editing) return;
    await update({
      id: editing.id,
      name: value.name,
      icon: value.icon,
      color: value.color,
    });
    await reload();
    close();
    toast(`Perfil “${value.name}” actualizado`, 'success');
  };

  const askDelete = (profile: Profile): void => {
    setPendingDelete(profile);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    const name = pendingDelete.name;
    setPendingDelete(null);
    try {
      await deleteProfile(id);
      toast(`Perfil “${name}” eliminado`, 'success');
    } catch (err) {
      toast(
        `No se pudo eliminar: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-[640px] max-w-[94vw] flex-col overflow-hidden rounded-lg shadow-2xl"
            style={{
              background: 'var(--vela-bg-sidebar-elev)',
              border: '1px solid var(--vela-border)',
            }}
          >
            {mode === 'create' && (
              <>
                {renderHeader('Nuevo perfil')}
                <div className="overflow-y-auto px-5 py-4">
                  <ProfileForm
                    showSecuritySection
                    onSubmit={submitCreate}
                    onCancel={close}
                    submitLabel="Crear"
                  />
                </div>
              </>
            )}

            {mode === 'edit' && (
              <>
                {renderHeader(
                  `Editar perfil${editing ? ` — ${editing.name}` : ''}`,
                )}
                <div className="overflow-y-auto px-5 py-4">
                  {editing ? (
                    <ProfileForm
                      initial={editing}
                      showSecuritySection={false}
                      onSubmit={submitEdit}
                      onCancel={close}
                      submitLabel="Guardar"
                    />
                  ) : (
                    <p className="text-[13px] text-[var(--vela-fg-muted)]">
                      Perfil no encontrado.
                    </p>
                  )}
                </div>
              </>
            )}

            {mode === 'manage' && (
              <>
                {renderHeader('Gestionar perfiles')}
                <div
                  className="flex shrink-0 items-center gap-1 border-b px-5 py-2"
                  style={{ borderColor: 'var(--vela-border)' }}
                >
                  <span className="text-[12px] text-[var(--vela-fg-muted)]">
                    {allProfiles.length} perfil
                    {allProfiles.length === 1 ? '' : 'es'}
                  </span>
                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={() => void openCreate()}
                      className="rounded px-2 py-1 text-[12px] font-medium text-[var(--vela-fg)]"
                      style={{ background: 'var(--vela-accent)' }}
                    >
                      + Nuevo
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  <ProfileManagementTable
                    profiles={allProfiles}
                    activeProfileId={activeProfileId}
                    openWindowsByProfile={openWindowsByProfile}
                    onEdit={(p) => void openEdit(p.id)}
                    onArchiveToggle={async (p) => {
                      await archive({ id: p.id, archived: !p.archived });
                      await reload();
                    }}
                    onDelete={askDelete}
                    onSetMasterPassword={(p, m) =>
                      openMasterPassword(m, p.id)
                    }
                  />
                </div>
              </>
            )}

            {pendingDelete && (
              <DeleteProfileDialog
                profile={pendingDelete}
                openWindowCount={
                  openWindowsByProfile.get(pendingDelete.id) ?? 0
                }
                workspaceCount={null}
                savedTabCount={null}
                onCancel={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
              />
            )}
          </div>
        </div>
      )}

      {masterPasswordOpen && masterPasswordTarget && (
        <SetMasterPasswordDialog
          profile={masterPasswordTarget}
          mode={masterPasswordMode}
          onCancel={closeMasterPassword}
          onSuccess={async () => {
            await reload();
            closeMasterPassword();
            toast(
              masterPasswordMode === 'remove'
                ? 'Contraseña maestra desactivada'
                : 'Contraseña maestra actualizada',
              'success',
            );
          }}
        />
      )}
    </>
  );
}
