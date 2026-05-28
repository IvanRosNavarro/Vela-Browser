import { useEffect, useState } from 'react';
import { useNotificationsStore } from '../../../stores/notificationsStore';
import type { StoredNotificationItem, NotificationPermissionItem } from '@vela/shared';
import { toast } from '../../../stores/toastStore';

const PANEL_WIDTH = 320;
const COLLAPSED_WIDTH = 40;

type Tab = 'notifications' | 'permissions';

// ─── Icons ──────────────────────────────────────────────────────────────────

function IconBell() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconChevronRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'ahora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  return new Date(timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function hostname(origin: string): string {
  try { return new URL(origin).hostname; } catch { return origin; }
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--vela-fg-muted)',
        borderRadius: 4,
        padding: 0,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.07))'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--vela-fg)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--vela-fg-muted)'; }}
    >
      {children}
    </button>
  );
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({ item, onMarkRead, onDelete }: {
  item: StoredNotificationItem;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        padding: '9px 12px',
        borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.06))',
        background: item.read ? 'transparent' : 'rgba(91,142,244,0.05)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 10.5, color: 'var(--vela-fg-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hostname(item.origin)}
          {item.source === 'push' && (
            <span style={{ marginLeft: 5, fontSize: 9, color: 'var(--vela-accent)', fontWeight: 700, letterSpacing: '0.04em' }}>PUSH</span>
          )}
        </span>
        <span style={{ fontSize: 10, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>{timeAgo(item.timestamp)}</span>
        <button
          type="button"
          title="Eliminar"
          onClick={() => onDelete(item.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vela-fg-muted)', padding: '1px 2px', lineHeight: 1, opacity: 0.6, flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
        >
          <IconX />
        </button>
      </div>
      <div
        role={item.read ? undefined : 'button'}
        onClick={() => { if (!item.read) onMarkRead(item.id); }}
        style={{
          fontSize: 12,
          fontWeight: item.read ? 400 : 600,
          color: 'var(--vela-fg)',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          cursor: item.read ? 'default' : 'pointer',
        }}
      >
        {item.title}
      </div>
      {item.body && (
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {item.body}
        </div>
      )}
    </div>
  );
}

// ─── Permission row ───────────────────────────────────────────────────────────

function PermissionRow({ item }: { item: NotificationPermissionItem }) {
  const grantPermission = useNotificationsStore((s) => s.grantPermission);
  const setPermissionState = useNotificationsStore((s) => s.setPermissionState);

  const handleRevoke = () => {
    void window.api.notifications.revokePermission({ origin: item.origin });
    setPermissionState(item.origin, 'revoked');
  };

  const handleAllow = () => {
    void grantPermission(item.origin);
    toast(`Permiso concedido. Recarga la página para activarlo.`, 'success');
  };

  const granted = item.state === 'granted';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.06))',
    }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: granted ? 'var(--vela-success, #4caf7d)' : 'var(--vela-fg-muted, #8c93a3)', opacity: granted ? 1 : 0.5 }} />
      <span style={{ flex: 1, fontSize: 12, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {hostname(item.origin)}
      </span>
      {granted ? (
        <>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--vela-success, #4caf7d)', flexShrink: 0 }}>Activo</span>
          <button
            type="button"
            title="Revocar permiso"
            onClick={handleRevoke}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vela-fg-muted)', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', opacity: 0.6 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
          >
            <IconX />
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 10, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>Denegado</span>
          <button
            type="button"
            title="Permitir"
            onClick={handleAllow}
            style={{
              background: 'none',
              border: '1px solid rgba(91,142,244,0.45)',
              borderRadius: 4,
              cursor: 'pointer',
              color: 'var(--vela-accent, #5b8ef4)',
              fontSize: 10,
              padding: '2px 7px',
              flexShrink: 0,
            }}
          >
            Permitir
          </button>
        </>
      )}
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '7px 10px',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--vela-accent, #5b8ef4)' : '2px solid transparent',
        cursor: 'pointer',
        color: active ? 'var(--vela-fg)' : 'var(--vela-fg-muted)',
        fontSize: 12,
        fontWeight: active ? 500 : 400,
        lineHeight: 1,
        transition: 'color 120ms, border-color 120ms',
        flexShrink: 0,
      }}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          background: active ? 'var(--vela-accent, #5b8ef4)' : 'var(--vela-fg-muted, #8c93a3)',
          color: '#fff',
          borderRadius: 8,
          padding: '1px 4px',
          lineHeight: 1.4,
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
      {label}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotificationCenter() {
  const [activeTab, setActiveTab] = useState<Tab>('notifications');
  const [collapsed, setCollapsed] = useState(false);

  const panelOpen = useNotificationsStore((s) => s.panelOpen);
  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const permissions = useNotificationsStore((s) => s.permissions);
  const closePanel = useNotificationsStore((s) => s.closePanel);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const deleteNotification = useNotificationsStore((s) => s.deleteNotification);
  const clearAll = useNotificationsStore((s) => s.clearAll);

  // Reset collapsed when panel is closed externally
  useEffect(() => {
    if (!panelOpen) setCollapsed(false);
  }, [panelOpen]);

  // Escape key closes panel
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [panelOpen, closePanel]);

  const handleCollapse = () => {
    setCollapsed(true);
    void window.api.layout.setNotificationPanelWidth({ width: COLLAPSED_WIDTH });
  };

  const handleExpand = (tab?: Tab) => {
    if (tab) setActiveTab(tab);
    setCollapsed(false);
    void window.api.layout.setNotificationPanelWidth({ width: PANEL_WIDTH });
  };

  const sorted = [...notifications].sort((a, b) => b.timestamp - a.timestamp);

  const containerStyle: React.CSSProperties = {
    flexShrink: 0,
    overflow: 'hidden',
    transition: 'width 180ms ease',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--vela-bg-surface, #1c1f26)',
    borderLeft: panelOpen ? '1px solid var(--vela-border, rgba(255,255,255,0.09))' : 'none',
    width: panelOpen ? (collapsed ? COLLAPSED_WIDTH : PANEL_WIDTH) : 0,
    minWidth: 0,
  };

  // ── Collapsed strip ──
  if (panelOpen && collapsed) {
    return (
      <div style={containerStyle}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '8px 0',
          width: '100%',
          height: '100%',
        }}>
          {/* Expand button */}
          <IconBtn title="Expandir" onClick={() => handleExpand()}>
            <IconChevronLeft />
          </IconBtn>

          <div style={{ width: 28, height: 1, background: 'var(--vela-border, rgba(255,255,255,0.07))' }} />

          {/* Bell: opens notifications tab */}
          <button
            type="button"
            title="Notificaciones"
            onClick={() => handleExpand('notifications')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vela-fg-muted)',
              padding: '4px 0',
              borderRadius: 5,
              width: '100%',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.07))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <IconBell />
            {unreadCount > 0 && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                background: 'var(--vela-accent, #5b8ef4)',
                color: '#fff',
                borderRadius: 8,
                padding: '1px 4px',
                lineHeight: 1.4,
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Shield: opens permissions tab */}
          <button
            type="button"
            title="Permisos"
            onClick={() => handleExpand('permissions')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vela-fg-muted)',
              padding: '4px 0',
              borderRadius: 5,
              width: '100%',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.07))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <IconShield />
            {permissions.length > 0 && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                background: 'var(--vela-fg-muted, #8c93a3)',
                color: '#fff',
                borderRadius: 8,
                padding: '1px 4px',
                lineHeight: 1.4,
              }}>
                {permissions.length > 99 ? '99+' : permissions.length}
              </span>
            )}
          </button>

          <div style={{ flex: 1 }} />
          <IconBtn title="Cerrar" onClick={closePanel}>
            <IconX />
          </IconBtn>
        </div>
      </div>
    );
  }

  // ── Full panel ──
  return (
    <div style={containerStyle}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
        flexShrink: 0,
        paddingRight: 6,
      }}>
        <TabBtn
          active={activeTab === 'notifications'}
          onClick={() => setActiveTab('notifications')}
          icon={<IconBell />}
          label="Notificaciones"
          badge={unreadCount}
        />
        <TabBtn
          active={activeTab === 'permissions'}
          onClick={() => setActiveTab('permissions')}
          icon={<IconShield />}
          label="Permisos"
          badge={permissions.length}
        />
        <div style={{ flex: 1 }} />
        <IconBtn title="Colapsar" onClick={handleCollapse}>
          <IconChevronRight />
        </IconBtn>
        <IconBtn title="Cerrar" onClick={closePanel}>
          <IconX />
        </IconBtn>
      </div>

      {/* Action bar (contextual per tab) */}
      {activeTab === 'notifications' && notifications.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 2,
          padding: '4px 8px',
          borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.06))',
          flexShrink: 0,
        }}>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead()}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--vela-fg-muted)', padding: '3px 6px',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
            >
              <IconCheck /> Marcar leídas
            </button>
          )}
          <button
            type="button"
            onClick={() => void clearAll()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: 'var(--vela-fg-muted)', padding: '3px 6px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <IconX /> Limpiar todo
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 'notifications' ? (
          sorted.length === 0
            ? <EmptyState label="Sin notificaciones" />
            : sorted.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                onMarkRead={(id) => void markRead(id)}
                onDelete={(id) => void deleteNotification(id)}
              />
            ))
        ) : (
          permissions.length === 0
            ? <EmptyState label="Sin permisos configurados" />
            : permissions.map((p) => (
              <PermissionRow key={p.origin} item={p} />
            ))
        )}
      </div>
    </div>
  );
}
