import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CARD_BRAND_LABELS,
  detectCardBrand,
  luhnValid,
  maskCardNumber,
  normalizeCardNumber,
  type VaultCardSummary,
} from '@vela/shared';
import { EmptyState, Field, ListRow, btnPriStyle, btnSecStyle, inputStyle, toolbarStyle } from './autofillUi';

interface CardForm {
  holderName: string;
  number: string;
  expMonth: string;
  expYear: string;
  alias: string;
}

type Editing = { id: string | null; form: CardForm } | null;

const EMPTY_FORM: CardForm = { holderName: '', number: '', expMonth: '', expYear: '', alias: '' };

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function expiry(c: { expMonth: number | null; expYear: number | null }): string {
  return c.expMonth != null && c.expYear != null ? `${pad2(c.expMonth)}/${pad2(c.expYear % 100)}` : '';
}

/** "4111111111111111" → "4111 1111 1111 1111" (Amex: 4-6-5). */
function groupDigits(digits: string): string {
  if (detectCardBrand(digits) === 'amex') {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  }
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

export function CardsView() {
  const [cards, setCards] = useState<VaultCardSummary[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [showNumber, setShowNumber] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 16 }, (_, i) => String(now - 1 + i));
  }, []);

  const load = useCallback(async () => {
    const res = await window.api.autofill.listCards();
    if (res.ok) setCards(res.data);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const select = useCallback(async (id: string) => {
    setError('');
    setShowNumber(false);
    const res = await window.api.autofill.getCard({ id });
    if (!res.ok || !res.data) return;
    const c = res.data;
    setEditing({
      id: c.id,
      form: {
        holderName: c.holderName,
        number: c.number,
        expMonth: c.expMonth != null ? pad2(c.expMonth) : '',
        expYear: c.expYear != null ? String(c.expYear) : '',
        alias: c.alias,
      },
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!editing) return;
    const f = editing.form;
    const number = normalizeCardNumber(f.number);
    if (!luhnValid(number)) {
      setError('El número de tarjeta no es válido');
      return;
    }
    setSaving(true);
    const res = await window.api.autofill.saveCard({
      id: editing.id ?? undefined,
      data: {
        holderName: f.holderName,
        number,
        expMonth: f.expMonth ? Number(f.expMonth) : null,
        expYear: f.expYear ? Number(f.expYear) : null,
        alias: f.alias,
      },
    });
    setSaving(false);
    if (!res.ok) {
      setError('No se ha podido guardar la tarjeta');
      return;
    }
    setError('');
    setShowNumber(false);
    setEditing({ id: res.data.id, form: { ...f, number } });
    void load();
  }, [editing, load]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta tarjeta?')) return;
    const res = await window.api.autofill.deleteCard({ id });
    if (res.ok) {
      if (editing?.id === id) setEditing(null);
      void load();
    }
  }, [editing, load]);

  const set = (key: keyof CardForm, value: string) => {
    setEditing((e) => (e ? { ...e, form: { ...e.form, [key]: value } } : e));
  };

  const digits = editing ? normalizeCardNumber(editing.form.number) : '';
  const brand = detectCardBrand(digits);
  // Una tarjeta guardada se muestra enmascarada hasta que se pide verla; una
  // nueva se escribe en claro.
  const masked = !!editing?.id && !showNumber;

  return (
    <>
      <div style={toolbarStyle}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--vela-fg-muted)' }}>
          Tarjetas para rellenar pagos (solo en páginas https). El CVV no se guarda nunca.
        </span>
        <button
          type="button"
          onClick={() => { setError(''); setShowNumber(false); setEditing({ id: null, form: { ...EMPTY_FORM } }); }}
          style={btnPriStyle}
        >
          + Nueva tarjeta
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 260, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--vela-border)' }}>
          {cards.length === 0 ? (
            <EmptyState text="Sin tarjetas guardadas" />
          ) : (
            cards.map((c) => (
              <ListRow
                key={c.id}
                badge={CARD_BRAND_LABELS[c.brand]}
                title={`•••• ${c.last4}`}
                subtitle={[c.alias, c.holderName, expiry(c)].filter(Boolean).join(' · ')}
                selected={editing?.id === c.id}
                onSelect={() => void select(c.id)}
                onDelete={() => void handleDelete(c.id)}
              />
            ))
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {editing ? (
            <div style={{ padding: 20, maxWidth: 560 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)', flex: 1, margin: 0 }}>
                  {editing.id ? 'Editar tarjeta' : 'Nueva tarjeta'}
                </h2>
                <button type="button" onClick={() => void handleSave()} style={btnPriStyle} disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setEditing(null)} style={btnSecStyle}>Cancelar</button>
              </div>
              {error && (
                <p style={{ color: 'var(--vela-danger, #e05555)', fontSize: 12, marginBottom: 12, marginTop: -8 }}>{error}</p>
              )}

              <Field label="Número">
                {masked ? (
                  <input type="text" value={maskCardNumber(digits)} readOnly style={inputStyle} />
                ) : (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={groupDigits(digits)}
                    onChange={(e) => set('number', normalizeCardNumber(e.target.value).slice(0, 19))}
                    placeholder="1234 5678 9012 3456"
                    style={inputStyle}
                    autoComplete="off"
                  />
                )}
                {editing.id && (
                  <button
                    type="button"
                    onClick={() => setShowNumber(!showNumber)}
                    title={showNumber ? 'Ocultar' : 'Mostrar y editar'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 2 }}
                  >
                    {showNumber ? '🙈' : '👁'}
                  </button>
                )}
                <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', flexShrink: 0, minWidth: 70 }}>
                  {digits ? CARD_BRAND_LABELS[brand] : ''}
                </span>
              </Field>

              <Field label="Titular">
                <input
                  type="text"
                  value={editing.form.holderName}
                  onChange={(e) => set('holderName', e.target.value)}
                  placeholder="Como aparece en la tarjeta"
                  style={inputStyle}
                  autoComplete="off"
                />
              </Field>

              <Field label="Caducidad">
                <select value={editing.form.expMonth} onChange={(e) => set('expMonth', e.target.value)} style={{ ...inputStyle, flex: '0 0 80px' }}>
                  <option value="">Mes</option>
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={editing.form.expYear} onChange={(e) => set('expYear', e.target.value)} style={{ ...inputStyle, flex: '0 0 100px' }}>
                  <option value="">Año</option>
                  {(editing.form.expYear && !years.includes(editing.form.expYear)
                    ? [editing.form.expYear, ...years]
                    : years
                  ).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>

              <Field label="Alias">
                <input
                  type="text"
                  value={editing.form.alias}
                  onChange={(e) => set('alias', e.target.value)}
                  placeholder="Personal, Empresa… (opcional)"
                  style={inputStyle}
                  autoComplete="off"
                />
              </Field>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'var(--vela-fg-muted)', fontSize: 13 }}>Selecciona una tarjeta para editarla</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
