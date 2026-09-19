import { useCallback, useEffect, useState } from 'react';
import { EMPTY_ADDRESS, type AddressData, type VaultAddress } from '@vela/shared';
import { EmptyState, Field, ListRow, btnPriStyle, btnSecStyle, inputStyle, toolbarStyle } from './autofillUi';

type Editing = { id: string | null; data: AddressData } | null;

const FIELDS: Array<{ key: keyof AddressData; label: string; placeholder?: string; type?: string }> = [
  { key: 'label', label: 'Etiqueta', placeholder: 'Casa, Oficina… (opcional)' },
  { key: 'fullName', label: 'Nombre completo' },
  { key: 'company', label: 'Empresa' },
  { key: 'addressLine1', label: 'Dirección', placeholder: 'Calle y número' },
  { key: 'addressLine2', label: 'Dirección (2)', placeholder: 'Piso, puerta… (opcional)' },
  { key: 'city', label: 'Ciudad' },
  { key: 'postalCode', label: 'Código postal' },
  { key: 'region', label: 'Provincia / región' },
  { key: 'country', label: 'País', placeholder: 'España' },
  { key: 'phone', label: 'Teléfono', type: 'tel' },
  { key: 'email', label: 'Email', type: 'email' },
];

function title(a: AddressData): string {
  return a.label || a.fullName || a.addressLine1 || 'Dirección';
}

function subtitle(a: AddressData): string {
  return [a.label ? a.fullName : '', a.addressLine1, [a.postalCode, a.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
}

export function AddressesView() {
  const [addresses, setAddresses] = useState<VaultAddress[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await window.api.autofill.listAddresses();
    if (res.ok) setAddresses(res.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const select = useCallback((a: VaultAddress) => {
    const { id, createdAt: _c, updatedAt: _u, lastUsedAt: _l, ...data } = a;
    setError('');
    setEditing({ id, data });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    const d = editing.data;
    if (!d.addressLine1.trim() && !d.fullName.trim()) {
      setError('Indica al menos el nombre o la dirección');
      return;
    }
    setSaving(true);
    const res = await window.api.autofill.saveAddress({ id: editing.id ?? undefined, data: d });
    setSaving(false);
    if (!res.ok) {
      setError('No se ha podido guardar la dirección');
      return;
    }
    setError('');
    setEditing({ id: res.data.id, data: d });
    void load();
  }, [editing, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta dirección?')) return;
    const res = await window.api.autofill.deleteAddress({ id });
    if (res.ok) {
      if (editing?.id === id) setEditing(null);
      void load();
    }
  }, [editing, load]);

  const set = (key: keyof AddressData, value: string) => {
    setEditing((e) => (e ? { ...e, data: { ...e.data, [key]: value } } : e));
  };

  return (
    <>
      <div style={toolbarStyle}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--vela-fg-muted)' }}>
          Direcciones para rellenar formularios de envío y facturación
        </span>
        <button
          type="button"
          onClick={() => { setError(''); setEditing({ id: null, data: { ...EMPTY_ADDRESS } }); }}
          style={btnPriStyle}
        >
          + Nueva dirección
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 260, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--vela-border)' }}>
          {addresses.length === 0 ? (
            <EmptyState text="Sin direcciones guardadas" />
          ) : (
            addresses.map((a) => (
              <ListRow
                key={a.id}
                title={title(a)}
                subtitle={subtitle(a)}
                selected={editing?.id === a.id}
                onSelect={() => select(a)}
                onDelete={() => void handleDelete(a.id)}
              />
            ))
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {editing ? (
            <div style={{ padding: 20, maxWidth: 560 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)', flex: 1, margin: 0 }}>
                  {editing.id ? 'Editar dirección' : 'Nueva dirección'}
                </h2>
                <button type="button" onClick={() => void handleSave()} style={btnPriStyle} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setEditing(null)} style={btnSecStyle}>Cancelar</button>
              </div>
              {error && (
                <p style={{ color: 'var(--vela-danger, #e05555)', fontSize: 12, marginBottom: 12, marginTop: -8 }}>{error}</p>
              )}
              {FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <input
                    type={f.type ?? 'text'}
                    value={editing.data[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    style={inputStyle}
                    autoComplete="off"
                  />
                </Field>
              ))}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--vela-fg-muted)', fontSize: 13 }}>Selecciona una dirección para editarla</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
