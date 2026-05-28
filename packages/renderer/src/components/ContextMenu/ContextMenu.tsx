import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, RotateCw, type LucideIcon } from 'lucide-react';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { useOverlayStore } from '../../stores/overlayStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import type { ContextMenuExecAction } from '@vela/shared';

const MENU_WIDTH = 272;

// ─── Nav button en la fila superior ───────────────────────────────────────────

interface NavBtnProps {
  icon: LucideIcon;
  enabled: boolean;
  label: string;
  onClick: () => void;
}

function NavBtn({ icon: Icon, enabled, label, onClick }: NavBtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
      className={[
        'flex items-center justify-center w-9 h-9 rounded-md transition-colors',
        enabled
          ? 'text-[var(--vela-fg)] hover:bg-[var(--vela-hover)] active:bg-[var(--vela-active)] cursor-pointer'
          : 'text-[var(--vela-fg-muted)] opacity-35 cursor-not-allowed',
      ].join(' ')}
    >
      <Icon size={16} strokeWidth={2} />
    </button>
  );
}

// ─── Separador ────────────────────────────────────────────────────────────────

function Sep() {
  return <div className="mx-2 my-0.5 h-px bg-[var(--vela-border)]" />;
}

// ─── Ítem de menú ─────────────────────────────────────────────────────────────

interface ItemProps {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}

function Item({ label, disabled, onClick }: ItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex w-full items-center px-3 py-[5px] text-[13px] text-left leading-none rounded-md transition-colors',
        disabled
          ? 'text-[var(--vela-fg-muted)] opacity-50 cursor-not-allowed'
          : 'text-[var(--vela-fg)] hover:bg-[var(--vela-hover)] cursor-pointer',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ─── Ítem con expansión de sub-ítems ──────────────────────────────────────────

interface ExpandItemProps {
  label: string;
  children: React.ReactNode;
}

function ExpandItem({ label, children }: ExpandItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-[5px] text-[13px] text-left leading-none rounded-md text-[var(--vela-fg)] hover:bg-[var(--vela-hover)] cursor-pointer transition-colors"
      >
        <span>{label}</span>
        <span className="text-[var(--vela-fg-muted)] text-[10px] ml-2">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="pl-3">
          {children}
        </div>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ContextMenu() {
  const menu = useContextMenuStore((s) => s.menu);
  const hide = useContextMenuStore((s) => s.hide);
  const acquire = useOverlayStore((s) => s.acquire);
  const release = useOverlayStore((s) => s.release);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const menuRef = useRef<HTMLDivElement>(null);

  // Acquire overlay mientras el menú está abierto.
  useEffect(() => {
    if (!menu) return;
    acquire();
    return () => { release(); };
  }, [!!menu]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Cerrar con Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); hide(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menu, hide]);

  // Cerrar al hacer clic fuera del menú.
  useEffect(() => {
    if (!menu) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hide();
      }
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, [menu, hide]);

  if (!menu) return null;
  // Solo responder al menú de esta ventana.
  if (currentWindowId !== null && menu.windowId !== currentWindowId) return null;

  // ── Cálculo de posición evitando salirse de pantalla ──────────────────────

  const { x, y } = menu;
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  // La altura se desconoce antes de renderizar; estimamos ~300px y usamos CSS
  // para hacer overflow scroll si fuera más alto.
  const fitsBelow = y + 320 < window.innerHeight;
  const top = fitsBelow ? y : undefined;
  const bottom = fitsBelow ? undefined : window.innerHeight - y;

  // ── Helpers de acción ─────────────────────────────────────────────────────

  const exec = (action: ContextMenuExecAction) => {
    hide();
    void window.api.contextMenu.exec(action);
  };

  const navBack = () => {
    hide();
    if (menu.activeTabId) void window.api.nav.back({ id: menu.activeTabId });
  };
  const navForward = () => {
    hide();
    if (menu.activeTabId) void window.api.nav.forward({ id: menu.activeTabId });
  };
  const navReload = () => {
    hide();
    if (menu.activeTabId) void window.api.nav.reload({ id: menu.activeTabId });
  };

  const openUrl = (url: string, activate: boolean) => {
    hide();
    void window.api.window.openUrlInNewTab({ url, activate });
  };

  const copyText = (text: string) => {
    hide();
    void navigator.clipboard.writeText(text);
  };

  const searchSelection = () => {
    if (!menu.selection) return;
    hide();
    void window.api.window.openUrlInNewTab({ url: menu.selection.searchUrl, activate: true });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: 'none' }}
    >
      <div
        ref={menuRef}
        role="menu"
        className="absolute rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-panel)] shadow-2xl overflow-hidden"
        style={{
          width: MENU_WIDTH,
          left,
          top,
          bottom,
          maxHeight: '80vh',
          overflowY: 'auto',
          pointerEvents: 'auto',
        }}
      >
        {/* ── FILA DE ICONOS DE NAVEGACIÓN (siempre visible, al estilo Zen) ── */}
        <div className="flex items-center gap-0.5 px-2 py-2 border-b border-[var(--vela-border)]">
          <NavBtn
            icon={ArrowLeft}
            enabled={menu.canGoBack}
            label="Atrás"
            onClick={navBack}
          />
          <NavBtn
            icon={ArrowRight}
            enabled={menu.canGoForward}
            label="Adelante"
            onClick={navForward}
          />
          <NavBtn
            icon={RotateCw}
            enabled
            label="Recargar"
            onClick={navReload}
          />
        </div>

        <div className="py-1 px-1">

          {/* ── BLOQUE ENLACE ─────────────────────────────────────────────── */}
          {menu.link && (
            <>
              <Item label="Abrir enlace en nueva pestaña" onClick={() => openUrl(menu.link!.url, false)} />
              <Item label="Abrir enlace en nueva pestaña activa" onClick={() => openUrl(menu.link!.url, true)} />
              <Item label="Abrir enlace en nueva ventana" onClick={() => exec({ type: 'link:open-window', url: menu.link!.url })} />
              {menu.link.profiles.length > 1 && (
                <ExpandItem label="Abrir enlace en perfil...">
                  {menu.link.profiles.map((p) => (
                    <Item
                      key={p.id}
                      label={p.name}
                      onClick={() => exec({ type: 'link:open-profile', url: menu.link!.url, profileId: p.id })}
                    />
                  ))}
                </ExpandItem>
              )}
              <Sep />
              <Item label="Copiar enlace" onClick={() => copyText(menu.link!.url)} />
              {menu.link.text && (
                <Item label="Copiar texto del enlace" onClick={() => copyText(menu.link!.text!)} />
              )}
              <Sep />
            </>
          )}

          {/* ── BLOQUE IMAGEN ─────────────────────────────────────────────── */}
          {menu.image && (
            <>
              <Item label="Abrir imagen en nueva pestaña" onClick={() => openUrl(menu.image!.url, true)} />
              <Item label="Copiar imagen" onClick={() => { hide(); exec({ type: 'image:copy', wcvX: menu.wcvX, wcvY: menu.wcvY }); }} />
              <Item label="Copiar dirección de la imagen" onClick={() => copyText(menu.image!.url)} />
              <Item label="Guardar imagen como..." onClick={() => exec({ type: 'image:save', url: menu.image!.url })} />
              <Sep />
            </>
          )}

          {/* ── BLOQUE SELECCIÓN ──────────────────────────────────────────── */}
          {menu.selection && (
            <>
              <Item
                label={`Buscar "${menu.selection.text.length > 30 ? menu.selection.text.slice(0, 30) + '…' : menu.selection.text}" en ${menu.selection.searchLabel}`}
                onClick={searchSelection}
              />
              <Item
                label={`Traducir "${menu.selection.text.length > 20 ? menu.selection.text.slice(0, 20) + '…' : menu.selection.text}"`}
                disabled
              />
              <Sep />
            </>
          )}

          {/* ── BLOQUE EDITABLE ───────────────────────────────────────────── */}
          {menu.isEditable ? (
            <>
              <Item label="Cortar" disabled={!menu.editFlags.canCut} onClick={() => { hide(); document.execCommand('cut'); }} />
              <Item label="Copiar" disabled={!menu.editFlags.canCopy} onClick={() => { hide(); document.execCommand('copy'); }} />
              <Item label="Pegar" disabled={!menu.editFlags.canPaste} onClick={() => { hide(); document.execCommand('paste'); }} />
              <Item label="Seleccionar todo" disabled={!menu.editFlags.canSelectAll} onClick={() => { hide(); document.execCommand('selectAll'); }} />
              <Sep />
            </>
          ) : menu.selection ? (
            <>
              <Item label="Copiar" disabled={!menu.editFlags.canCopy} onClick={() => { hide(); document.execCommand('copy'); }} />
              <Sep />
            </>
          ) : null}

          {/* ── BLOQUE NAVEGACIÓN / PÁGINA ────────────────────────────────── */}
          <Item label="Guardar página como..." onClick={() => exec({ type: 'page:save' })} />
          <Item label="Imprimir..." onClick={() => exec({ type: 'page:print' })} />

          <Sep />

          {/* ── INSPECCIONAR ──────────────────────────────────────────────── */}
          <Item
            label="Inspeccionar elemento"
            onClick={() => exec({ type: 'devtools:inspect', wcvX: menu.wcvX, wcvY: menu.wcvY })}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
