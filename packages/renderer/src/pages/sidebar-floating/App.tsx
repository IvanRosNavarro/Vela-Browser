import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { generateKeyBetween } from 'fractional-indexing';
import { Plus, Settings } from 'lucide-react';
import type { MenuItemSpec, Profile, Workspace } from '@vela/shared';
import type { TabNode, TreeNode } from '@vela/shared';
import { isFolderLike, isFolderTab, IPC_EVENTS } from '@vela/shared';
import { showContextMenu } from '../../lib/contextMenu';

const _params = new URLSearchParams(window.location.search);
const parentWindowId = Number(_params.get('windowId') ?? '0');

const ROW_H = 32;
const INDENT = 10;

const PALETTE: Array<{ id: string; label: string; color: string | null }> = [
  { id: 'none', label: '(sin color)', color: null },
  { id: 'blue', label: 'Azul', color: '#7d8cff' },
  { id: 'teal', label: 'Turquesa', color: '#5cd2c2' },
  { id: 'amber', label: 'Ámbar', color: '#f6c177' },
  { id: 'rose', label: 'Rosa', color: '#ed8796' },
  { id: 'green', label: 'Verde', color: '#a6e3a1' },
  { id: 'lavender', label: 'Lavanda', color: '#cba6f7' },
  { id: 'red', label: 'Rojo', color: '#f38ba8' },
];

const ICONS = ['📁', '📚', '🛠', '🎨', '🧪', '📊', '🌐', '⭐'];

// ── DnD helpers ───────────────────────────────────────────────────────────────

interface ActiveDrop {
  draggedId: string;
  targetId: string;
  zone: 'before' | 'after' | 'inside';
  invalid: boolean;
}

function encDrop(nodeId: string, zone: string): string {
  return `${nodeId}::${zone}`;
}

function decDrop(raw: string): { nodeId: string; zone: string } | null {
  const idx = raw.lastIndexOf('::');
  if (idx === -1) return null;
  const zone = raw.slice(idx + 2);
  if (zone !== 'before' && zone !== 'after' && zone !== 'inside') return null;
  return { nodeId: raw.slice(0, idx), zone };
}

function isDescendantOf(ancestorId: string, nodeId: string, byId: Map<string, TreeNode>): boolean {
  let cur = byId.get(nodeId);
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    cur = byId.get(cur.parentId);
  }
  return false;
}

function siblingsAt(nodes: TreeNode[], parentId: string | null, excludeId: string): TreeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId && n.id !== excludeId)
    .sort((a, b) => (a.position < b.position ? -1 : 1));
}

function resolveTreeDropPosition(
  draggedId: string,
  target: { nodeId: string; zone: string },
  nodes: TreeNode[],
): { newParentId: string | null; newPosition: string } | null {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const targetNode = byId.get(target.nodeId);
  if (!targetNode) return null;

  if (target.zone === 'inside') {
    if (!isFolderLike(targetNode)) return null;
    const children = siblingsAt(nodes, targetNode.id, draggedId);
    const last = children[children.length - 1] ?? null;
    return { newParentId: targetNode.id, newPosition: generateKeyBetween(last?.position ?? null, null) };
  }

  const newParentId = targetNode.parentId;
  const siblings = siblingsAt(nodes, newParentId, draggedId);
  const targetIndex = siblings.findIndex((n) => n.id === targetNode.id);
  if (targetIndex === -1) {
    const last = siblings[siblings.length - 1] ?? null;
    return { newParentId, newPosition: generateKeyBetween(last?.position ?? null, null) };
  }
  const targetSibling = siblings[targetIndex]!;
  if (target.zone === 'before') {
    const prev = siblings[targetIndex - 1] ?? null;
    return { newParentId, newPosition: generateKeyBetween(prev?.position ?? null, targetSibling.position) };
  }
  const next = siblings[targetIndex + 1] ?? null;
  return { newParentId, newPosition: generateKeyBetween(targetSibling.position, next?.position ?? null) };
}

// ── Badge genérico ────────────────────────────────────────────────────────────
function Badge({
  icon, name, color, size, round,
}: { icon?: string | null; name: string; color?: string | null; size: number; round?: boolean }) {
  const bg = color ?? 'var(--vela-accent, #5b8ef4)';
  if (icon) {
    return (
      <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.65, flexShrink: 0 }}>
        {icon}
      </span>
    );
  }
  return (
    <span style={{
      width: size, height: size, borderRadius: round ? '50%' : 4,
      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.48, fontWeight: 700, color: '#fff', flexShrink: 0, userSelect: 'none',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

// ── Favicon ───────────────────────────────────────────────────────────────────
function Favicon({ src, name }: { src: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span style={{
        width: 16, height: 16, flexShrink: 0, borderRadius: 3,
        background: 'var(--vela-bg-elevated, #22252e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, color: 'var(--vela-fg-muted)',
      }}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img src={src} alt="" width={16} height={16}
      style={{ borderRadius: 2, objectFit: 'contain', flexShrink: 0 }}
      onError={() => setErr(true)}
    />
  );
}

// ── Favicon20 para cajas de solo icono ────────────────────────────────────────
function Favicon20({ node }: { node: TabNode }) {
  const [err, setErr] = useState(false);
  const src = node.url?.startsWith('vela://') ? null : (node.favicon ?? null);
  const name = node.name ?? node.originalTitle ?? node.url;
  const char = (name || node.url).charAt(0).toUpperCase() || '·';
  if (!src || err) {
    return (
      <span style={{
        width: 20, height: 20, flexShrink: 0, borderRadius: 3,
        background: 'var(--vela-bg-elevated, #22252e)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'var(--vela-fg-muted)',
      }}>{char}</span>
    );
  }
  return (
    <img src={src} alt="" width={20} height={20}
      style={{ borderRadius: 3, objectFit: 'contain', flexShrink: 0 }}
      onError={() => setErr(true)}
    />
  );
}

// ── Separador ─────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: 'var(--vela-border, rgba(255,255,255,0.08))', margin: '2px 0' }} />;
}

// ── FloatAnchorItem ───────────────────────────────────────────────────────────
interface FloatAnchorItemProps {
  node: TabNode;
  dragTarget: { zone: 'before' | 'after' } | null;
  onActivate: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function FloatAnchorItem({ node, dragTarget, onActivate, onContextMenu }: FloatAnchorItemProps) {
  const [hovered, setHovered] = useState(false);
  const hasDrift = node.anchoredUrl !== null && node.url !== node.anchoredUrl;
  const title = node.name ?? node.originalTitle ?? node.url;

  const drag = useDraggable({ id: node.id, data: { kind: 'float-anchor', anchorId: node.id } });
  const before = useDroppable({ id: `anchor-before-${node.id}`, data: { anchorId: node.id, zone: 'before' as const } });
  const after = useDroppable({ id: `anchor-after-${node.id}`, data: { anchorId: node.id, zone: 'after' as const } });

  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      role="button"
      tabIndex={0}
      title={title}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') onActivate(); }}
      style={{
        position: 'relative', width: 32, height: 32, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, cursor: 'default',
        background: hovered ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.06))' : undefined,
        opacity: drag.isDragging ? 0.4 : 1,
        ...transformStyle,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' }} aria-hidden />
      <div ref={after.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' }} aria-hidden />
      <Favicon20 node={node} />
      {hasDrift && (
        <span aria-hidden style={{ position: 'absolute', bottom: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: 'var(--vela-warning, #f59e0b)', border: '1px solid var(--vela-bg-sidebar)' }} />
      )}
      {dragTarget?.zone === 'before' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, left: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line, #5b8ef4)' }} />
      )}
      {dragTarget?.zone === 'after' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, right: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line, #5b8ef4)' }} />
      )}
    </div>
  );
}

// ── FloatPinnedItem ───────────────────────────────────────────────────────────
interface FloatPinnedItemProps {
  node: TabNode;
  activeDrop: ActiveDrop | null;
  onActivate: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function FloatPinnedItem({ node, activeDrop, onActivate, onContextMenu }: FloatPinnedItemProps) {
  const [hovered, setHovered] = useState(false);
  const hasDrift = node.pinnedUrl !== null && node.url !== node.pinnedUrl;
  const title = node.name ?? node.originalTitle ?? node.url;

  const drag = useDraggable({ id: node.id, data: { kind: node.kind, parentId: node.parentId, workspaceId: node.workspaceId } });
  const before = useDroppable({ id: encDrop(node.id, 'before'), data: { nodeId: node.id, zone: 'before', parentId: node.parentId } });
  const after = useDroppable({ id: encDrop(node.id, 'after'), data: { nodeId: node.id, zone: 'after', parentId: node.parentId } });

  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  const dropZone = activeDrop?.targetId === node.id && !activeDrop.invalid ? activeDrop.zone : null;

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      role="button"
      tabIndex={0}
      title={title}
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') onActivate(); }}
      style={{
        position: 'relative', width: 32, height: 32, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, cursor: 'default',
        background: hovered ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.06))' : undefined,
        opacity: drag.isDragging ? 0.4 : 1,
        ...transformStyle,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' }} aria-hidden />
      <div ref={after.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' }} aria-hidden />
      <Favicon20 node={node} />
      {hasDrift && (
        <span aria-hidden style={{ position: 'absolute', bottom: 3, right: 3, width: 5, height: 5, borderRadius: '50%', background: 'var(--vela-warning, #f59e0b)', border: '1px solid var(--vela-bg-sidebar)' }} />
      )}
      {dropZone === 'before' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, left: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line, #5b8ef4)' }} />
      )}
      {dropZone === 'after' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, right: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line, #5b8ef4)' }} />
      )}
    </div>
  );
}

// ── FloatTabRow ───────────────────────────────────────────────────────────────
interface FloatTabRowProps {
  node: TabNode;
  depth: number;
  activeDrop: ActiveDrop | null;
  onActivate: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function FloatTabRow({ node, depth, activeDrop, onActivate, onContextMenu }: FloatTabRowProps) {
  const [hovered, setHovered] = useState(false);
  const title = node.name ?? node.originalTitle ?? node.url;
  const faviconSrc = node.url?.startsWith('vela://') ? null : (node.favicon ?? null);

  const drag = useDraggable({ id: node.id, data: { kind: node.kind, parentId: node.parentId, workspaceId: node.workspaceId } });
  const before = useDroppable({ id: encDrop(node.id, 'before'), data: { nodeId: node.id, zone: 'before', parentId: node.parentId } });
  const after = useDroppable({ id: encDrop(node.id, 'after'), data: { nodeId: node.id, zone: 'after', parentId: node.parentId } });

  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  const dropZone = activeDrop?.targetId === node.id && !activeDrop.invalid ? activeDrop.zone : null;

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      role="button"
      tabIndex={0}
      style={{
        position: 'relative',
        height: ROW_H,
        display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: depth * INDENT + 6,
        paddingRight: 6,
        margin: '1px 4px',
        borderRadius: 5,
        background: hovered ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.06))' : 'transparent',
        cursor: 'pointer',
        opacity: drag.isDragging ? 0.4 : 1,
        ...transformStyle,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onActivate}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); e.stopPropagation(); void window.api.tab.close({ id: node.id }); } }}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') onActivate(); }}
    >
      {/* Drop zones: top half = before, bottom half = after */}
      <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', pointerEvents: 'none' }} aria-hidden />
      <div ref={after.setNodeRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', pointerEvents: 'none' }} aria-hidden />

      <Favicon src={faviconSrc} name={title} />
      <span style={{
        flex: 1, overflow: 'hidden', whiteSpace: 'nowrap',
        fontSize: 13, color: 'var(--vela-fg, #e6e8ee)',
        maskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
      }}>
        {title}
      </span>

      {dropZone === 'before' && (
        <div aria-hidden style={{ position: 'absolute', left: 6, right: 6, top: -1, height: 2, background: 'var(--vela-drop-line, #5b8ef4)', borderRadius: 2, pointerEvents: 'none' }} />
      )}
      {dropZone === 'after' && (
        <div aria-hidden style={{ position: 'absolute', left: 6, right: 6, bottom: -1, height: 2, background: 'var(--vela-drop-line, #5b8ef4)', borderRadius: 2, pointerEvents: 'none' }} />
      )}
    </div>
  );
}

// ── FloatFolderRow ────────────────────────────────────────────────────────────
interface FloatFolderRowProps {
  node: TreeNode;
  depth: number;
  collapsed: boolean;
  activeDrop: ActiveDrop | null;
  onToggleCollapse: () => void;
  onActivate: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

function FloatFolderRow({ node, depth, collapsed, activeDrop, onToggleCollapse, onActivate, onContextMenu, children }: FloatFolderRowProps) {
  const [hovered, setHovered] = useState(false);
  const markerColor = node.color ?? 'var(--vela-folder-marker-default, #7d8cff)';
  const name = node.name ?? 'Carpeta';

  const drag = useDraggable({ id: node.id, data: { kind: node.kind, parentId: node.parentId, workspaceId: node.workspaceId } });
  const before = useDroppable({ id: encDrop(node.id, 'before'), data: { nodeId: node.id, zone: 'before', parentId: node.parentId } });
  const after = useDroppable({ id: encDrop(node.id, 'after'), data: { nodeId: node.id, zone: 'after', parentId: node.parentId } });
  const inside = useDroppable({ id: encDrop(node.id, 'inside'), data: { nodeId: node.id, zone: 'inside', parentId: node.parentId } });

  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  const dropZone = activeDrop?.targetId === node.id && !activeDrop.invalid ? activeDrop.zone : null;

  return (
    <div style={{ opacity: drag.isDragging ? 0.4 : 1 }}>
      <div
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        style={{
          position: 'relative',
          height: ROW_H,
          display: 'flex', alignItems: 'center',
          paddingLeft: depth * INDENT + 6,
          paddingRight: 6,
          cursor: 'default',
          userSelect: 'none',
          background: dropZone === 'inside'
            ? 'var(--vela-drop-bg, rgba(91,142,244,0.12))'
            : hovered ? 'var(--vela-bg-folder-hover, rgba(255,255,255,0.04))' : undefined,
          outline: dropZone === 'inside' ? '2px solid var(--vela-drop-line, #5b8ef4)' : undefined,
          outlineOffset: -2,
          borderRadius: dropZone === 'inside' ? 5 : undefined,
          ...transformStyle,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (isFolderTab(node)) onActivate(); }}
        onAuxClick={(e) => { if (e.button === 1 && isFolderTab(node)) { e.preventDefault(); e.stopPropagation(); void window.api.tab.close({ id: node.id }); } }}
        onContextMenu={onContextMenu}
      >
        {/* Drop zones: top 25% = before, bottom 25% = after, middle 50% = inside */}
        <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '25%', pointerEvents: 'none' }} aria-hidden />
        <div ref={after.setNodeRef} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%', pointerEvents: 'none' }} aria-hidden />
        <div ref={inside.setNodeRef} style={{ position: 'absolute', top: '25%', bottom: '25%', left: 0, right: 0, pointerEvents: 'none' }} aria-hidden />

        {/* Marker de color */}
        <span aria-hidden style={{ width: 'var(--vela-folder-marker-w, 3px)', height: '70%', borderRadius: 2, background: markerColor, flexShrink: 0, marginRight: 6 }} />

        {/* Botón colapsar */}
        <button
          type="button"
          aria-label={collapsed ? 'Expandir' : 'Colapsar'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
          style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2, border: 'none', background: 'transparent', color: 'var(--vela-fg-muted, #8c93a3)', fontSize: 9, cursor: 'pointer', flexShrink: 0 }}
        >
          {collapsed ? '▶' : '▼'}
        </button>

        {/* Icono */}
        <span aria-hidden style={{ width: 16, height: 16, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--vela-fg-muted, #8c93a3)', marginLeft: 4, flexShrink: 0 }}>
          {node.icon ?? '📁'}
        </span>

        {/* Nombre */}
        <span style={{
          marginLeft: 8, flex: 1, overflow: 'hidden', whiteSpace: 'nowrap',
          fontSize: 13, fontWeight: 500, color: 'var(--vela-fg, #e6e8ee)',
          maskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
        }}>
          {name}
        </span>

        {/* Drop indicators */}
        {dropZone === 'before' && (
          <div aria-hidden style={{ position: 'absolute', left: 6, right: 6, top: -1, height: 2, background: 'var(--vela-drop-line, #5b8ef4)', borderRadius: 2, pointerEvents: 'none' }} />
        )}
        {dropZone === 'after' && (
          <div aria-hidden style={{ position: 'absolute', left: 6, right: 6, bottom: -1, height: 2, background: 'var(--vela-drop-line, #5b8ef4)', borderRadius: 2, pointerEvents: 'none' }} />
        )}
      </div>
      {children}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profileCount, setProfileCount] = useState(1);
  const [localCollapsed, setLocalCollapsed] = useState<Map<string, boolean>>(new Map());
  const [anchorDragTarget, setAnchorDragTarget] = useState<{ id: string; zone: 'before' | 'after' } | null>(null);
  const [activeDrop, setActiveDrop] = useState<ActiveDrop | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const wsBtnRef = useRef<HTMLButtonElement>(null);
  const profileBtnRef = useRef<HTMLButtonElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const anchorSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const mainSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const loadTabs = useCallback(async (wsId: string): Promise<void> => {
    const res = await window.api.tree.getByWorkspace({ workspaceId: wsId });
    if (res.ok) setNodes(res.data);
  }, []);

  useEffect(() => {
    void (async () => {
      const [wsListRes, wsActiveRes, profileListRes, profileActiveRes] = await Promise.all([
        window.api.workspaces.list(),
        window.api.workspaces.getActive(),
        window.api.profile.list(),
        window.api.profile.getActive(),
      ]);
      if (wsListRes.ok) setWorkspaces(wsListRes.data);
      if (wsActiveRes.ok && wsActiveRes.data?.id) {
        setActiveWsId(wsActiveRes.data.id);
        await loadTabs(wsActiveRes.data.id);
      }
      if (profileListRes.ok && profileActiveRes.ok && profileActiveRes.data?.profileId) {
        const found = profileListRes.data.find((p) => p.id === profileActiveRes.data.profileId) ?? null;
        setActiveProfile(found);
        setProfileCount(profileListRes.data.length);
      }
    })();
  }, [loadTabs]);

  useEffect(() => {
    const offTree = window.api.on(IPC_EVENTS.TREE_CHANGED, ({ workspaceId }) => {
      if (workspaceId === activeWsId) void loadTabs(workspaceId);
    });
    const offWsChanged = window.api.on(IPC_EVENTS.WINDOW_WORKSPACE_CHANGED, ({ workspaceId }) => {
      if (!workspaceId) return;
      setActiveWsId(workspaceId);
      void loadTabs(workspaceId);
    });
    return () => { offTree(); offWsChanged(); };
  }, [activeWsId, loadTabs]);

  const handleOpenWorkspaceDrop = useCallback((): void => {
    if (!wsBtnRef.current || !parentWindowId) return;
    const rect = wsBtnRef.current.getBoundingClientRect();
    void window.api.workspaceDrop.open({
      windowId: parentWindowId,
      anchorRect: { left: rect.left, bottom: rect.bottom },
      workspaceCount: workspaces.length,
    });
  }, [workspaces.length]);

  const handleOpenProfileDrop = useCallback((): void => {
    if (!profileBtnRef.current || !parentWindowId) return;
    const rect = profileBtnRef.current.getBoundingClientRect();
    void window.api.profileDrop.open({
      windowId: parentWindowId,
      anchorRect: { left: rect.left, top: rect.top },
      profileCount,
    });
  }, [profileCount]);

  const handleActivateTab = useCallback(async (tabId: string): Promise<void> => {
    await window.api.tab.activate({ id: tabId });
    window.close();
  }, []);

  const handleAddNode = useCallback((): void => {
    if (!addBtnRef.current || !activeWsId || !parentWindowId) return;
    const rect = addBtnRef.current.getBoundingClientRect();
    void window.api.addNodeMenu.open({
      windowId: parentWindowId,
      anchorRect: { left: rect.left, bottom: rect.bottom },
      workspaceId: activeWsId,
      parentId: null,
      itemCount: window.api.init.isBlindedWindow ? 2 : 4,
    });
  }, [activeWsId]);

  const handleOpenSettings = useCallback(async (): Promise<void> => {
    await window.api.window.openUrlInNewTab({ url: 'vela://settings', activate: true });
    window.close();
  }, []);

  // ── Colapsar ─────────────────────────────────────────────────────────────────
  function isCollapsed(node: TreeNode): boolean {
    const local = localCollapsed.get(node.id);
    return local !== undefined ? local : node.collapsed;
  }

  function handleToggleCollapse(node: TreeNode) {
    setLocalCollapsed((prev) => {
      const next = new Map(prev);
      next.set(node.id, !isCollapsed(node));
      return next;
    });
  }

  function setCollapseRecursive(rootNode: TreeNode, collapsed: boolean) {
    setLocalCollapsed((prev) => {
      const next = new Map(prev);
      next.set(rootNode.id, collapsed);
      const stack = [rootNode.id];
      while (stack.length > 0) {
        const id = stack.pop()!;
        for (const n of nodes) {
          if (n.parentId === id && isFolderLike(n)) {
            next.set(n.id, collapsed);
            stack.push(n.id);
          }
        }
      }
      return next;
    });
  }

  // ── Helpers de tab ────────────────────────────────────────────────────────────
  async function moveTabToWorkspaceRoot(tabNode: TabNode): Promise<void> {
    const rootLevel = nodes.filter((n) => n.parentId === null);
    const lastPos = rootLevel.length > 0
      ? rootLevel.reduce((max, n) => (n.position > max ? n.position : max), rootLevel[0]!.position)
      : null;
    await window.api.node.move({
      id: tabNode.id,
      newParentId: null,
      newPosition: generateKeyBetween(lastPos, null),
    });
  }

  async function addTabToNewFolder(node: TabNode | TreeNode): Promise<void> {
    const siblings = nodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => (a.position < b.position ? -1 : 1));
    const nodeIdx = siblings.findIndex((n) => n.id === node.id);
    const nextSibling = siblings[nodeIdx + 1];
    const folderPosition = generateKeyBetween(node.position, nextSibling?.position ?? null);

    const folderRes = await window.api.node.createFolderTab({
      workspaceId: node.workspaceId,
      parentId: node.parentId,
      name: 'Nueva carpeta',
      position: folderPosition,
    });
    if (!folderRes.ok) return;

    await window.api.node.move({
      id: node.id,
      newParentId: folderRes.data.id,
      newPosition: generateKeyBetween(null, null),
    });
  }

  // ── Menú contextual de TAB (igual que TabRow.tsx) ─────────────────────────
  function makeTabContextMenu(node: TabNode) {
    return async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const whitelistRes = await window.api.discard.getWhitelistStatus({ tabId: node.id });
      const isPermanentlyWhitelisted = whitelistRes.ok ? whitelistRes.data.permanent : false;

      const isAnchor = node.anchored ?? false;
      const otherWorkspaces = workspaces.filter((w) => w.id !== node.workspaceId);

      const moveSubmenu: MenuItemSpec[] =
        otherWorkspaces.length === 0
          ? [{ type: 'normal', id: 'noop:no-ws', label: '(solo hay un workspace)', enabled: false }]
          : otherWorkspaces.map((w) => ({ type: 'normal' as const, id: `move-to-workspace:${w.id}`, label: w.name }));

      const discardSection: MenuItemSpec[] = node.discarded
        ? [
            { type: 'separator' },
            { type: 'normal', id: 'restore-tab', label: 'Reactivar esta pestaña' },
            { type: 'normal', id: 'restore-workspace', label: 'Reactivar todas las pestañas del workspace' },
          ]
        : [
            { type: 'separator' },
            { type: 'normal', id: 'discard-tab', label: 'Suspender esta pestaña' },
            ...(node.parentId ? [{ type: 'normal' as const, id: 'discard-folder', label: 'Suspender todas las pestañas de esta carpeta' }] : []),
            { type: 'normal', id: 'discard-workspace', label: 'Suspender todas las pestañas del workspace' },
            {
              type: 'normal',
              id: 'toggle-permanent-whitelist',
              label: isPermanentlyWhitelisted ? '✓ Mantener siempre activa' : 'Mantener siempre activa',
            },
          ];

      const items: MenuItemSpec[] = [
        { type: 'normal', id: 'rename', label: 'Renombrar' },
        { type: 'normal', id: 'close', label: 'Cerrar' },
        { type: 'normal', id: 'close-others', label: 'Cerrar otras (este nivel)' },
        { type: 'normal', id: 'close-all', label: 'Cerrar todas' },
        { type: 'separator' },
        ...(!node.pinned ? [{ type: 'normal' as const, id: 'pin', label: 'Estibar Carga' }] : []),
        ...(node.pinned ? [{ type: 'normal' as const, id: 'unpin', label: 'Desestibar Carga' }] : []),
        ...(node.pinned && node.pinnedUrl && node.url !== node.pinnedUrl ? [
          { type: 'normal' as const, id: 'restore-pinned', label: 'Reestablecer Carga' },
          { type: 'normal' as const, id: 'replace-pinned', label: 'Reemplazar Carga' },
        ] : []),
        {
          type: 'normal',
          id: isAnchor ? 'remove-anchor' : 'add-anchor',
          label: isAnchor ? 'Levar Ancla' : 'Anclar Ancla',
          enabled: node.url.startsWith('http://') || node.url.startsWith('https://'),
        },
        ...(isAnchor && node.anchoredUrl && node.url !== node.anchoredUrl ? [
          { type: 'normal' as const, id: 'restore-anchor', label: 'Reestablecer Ancla' },
          { type: 'normal' as const, id: 'replace-anchor', label: 'Reemplazar Ancla' },
        ] : []),
        { type: 'normal', id: 'add-to-folder', label: 'Añadir a carpeta' },
        { type: 'submenu', label: 'Mover a workspace', submenu: moveSubmenu },
        { type: 'separator' },
        { type: 'normal', id: 'duplicate', label: 'Duplicar' },
        {
          type: 'normal',
          id: 'open-secure',
          label: 'Abrir en pestaña fantasma',
          enabled: node.url.startsWith('http://') || node.url.startsWith('https://'),
        },
        { type: 'normal', id: 'delete', label: 'Eliminar' },
        ...discardSection,
      ];

      const moveHandlers: Record<string, () => void> = {};
      for (const w of otherWorkspaces) {
        moveHandlers[`move-to-workspace:${w.id}`] = async () => {
          const res = await window.api.tree.getByWorkspace({ workspaceId: w.id });
          const targetRoots = res.ok ? res.data.filter((n) => n.parentId === null) : [];
          const lastPos = targetRoots.length > 0
            ? targetRoots.reduce((max, n) => (n.position > max ? n.position : max), targetRoots[0]!.position)
            : null;
          void window.api.node.move({ id: node.id, newParentId: null, newPosition: generateKeyBetween(lastPos, null), newWorkspaceId: w.id });
        };
      }

      void showContextMenu(items, {
        rename: async () => {
          await window.api.tab.activate({ id: node.id });
          window.close();
        },
        close: () => void window.api.tab.close({ id: node.id }),
        'close-others': () => {
          for (const n of nodes) {
            if (n.kind === 'tab' && n.parentId === node.parentId && n.id !== node.id) {
              void window.api.tab.close({ id: n.id });
            }
          }
        },
        'close-all': () => {
          for (const n of nodes) {
            if (n.kind === 'tab') void window.api.tab.close({ id: n.id });
          }
        },
        pin: async () => {
          if (node.parentId !== null) await moveTabToWorkspaceRoot(node);
          await window.api.tab.pin({ id: node.id });
        },
        unpin: () => void window.api.tab.unpin({ id: node.id }),
        'restore-pinned': () => void window.api.tab.restorePinnedUrl({ id: node.id }),
        'replace-pinned': () => void window.api.tab.replacePinnedUrl({ id: node.id }),
        'add-anchor': async () => {
          if (node.parentId !== null) await moveTabToWorkspaceRoot(node);
          await window.api.tab.anchor({ id: node.id });
        },
        'remove-anchor': () => void window.api.tab.unanchor({ id: node.id }),
        'restore-anchor': () => void window.api.tab.restoreAnchoredUrl({ id: node.id }),
        'replace-anchor': () => void window.api.tab.replaceAnchoredUrl({ id: node.id }),
        'add-to-folder': () => void addTabToNewFolder(node),
        duplicate: () => void window.api.window.openUrlInNewTab({ url: node.url, parentId: node.parentId }),
        'open-secure': () => void window.api.tab.createSecure({ url: node.url }),
        delete: () => void window.api.node.delete({ id: node.id }),
        'discard-tab': () => void window.api.discard.discardTab({ tabId: node.id }),
        'discard-folder': () => { if (node.parentId) void window.api.discard.discardFolder({ folderId: node.parentId }); },
        'discard-workspace': () => void window.api.discard.discardWorkspace({ workspaceId: node.workspaceId }),
        'restore-tab': () => void window.api.discard.restoreTab({ tabId: node.id }),
        'restore-workspace': () => void window.api.discard.restoreWorkspace({ workspaceId: node.workspaceId }),
        'toggle-permanent-whitelist': () => void window.api.discard.togglePermanentWhitelist({ tabId: node.id }),
        ...moveHandlers,
      });
    };
  }

  // ── Menú contextual de CARPETA ────────────────────────────────────────────
  function makeFolderContextMenu(node: TreeNode) {
    return async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const whitelistRes = await window.api.discard.getWhitelistStatus({ tabId: node.id }).catch(() => null);
      const isFolderWhitelisted = whitelistRes?.ok ? whitelistRes.data.folder : false;

      const colorSubmenu: MenuItemSpec[] = PALETTE.map((p) => ({
        type: 'normal' as const,
        id: `color:${p.id}`,
        label: p.label,
      }));

      const iconSubmenu: MenuItemSpec[] = [
        ...ICONS.map((emoji, idx) => ({ type: 'normal' as const, id: `icon:${idx}`, label: emoji })),
        { type: 'separator' as const },
        { type: 'normal' as const, id: 'icon:clear', label: '(limpiar)' },
      ];

      const items: MenuItemSpec[] = [
        { type: 'normal', id: 'add-to-folder', label: 'Añadir a carpeta' },
        { type: 'submenu', label: 'Color', submenu: colorSubmenu },
        { type: 'submenu', label: 'Icono', submenu: iconSubmenu },
        { type: 'separator' },
        { type: 'normal', id: 'new-folder', label: 'Nueva carpeta dentro' },
        { type: 'normal', id: 'new-tab', label: 'Nueva pestaña dentro' },
        { type: 'separator' },
        { type: 'normal', id: 'collapse-all', label: 'Colapsar todo' },
        { type: 'normal', id: 'expand-all', label: 'Expandir todo' },
        { type: 'separator' },
        { type: 'normal', id: 'discard-folder', label: 'Suspender todas las pestañas de esta carpeta' },
        { type: 'normal', id: 'restore-folder', label: 'Reactivar todas las pestañas de esta carpeta' },
        {
          type: 'normal',
          id: 'toggle-folder-whitelist',
          label: isFolderWhitelisted ? '✓ No suspender pestañas de esta carpeta' : 'No suspender pestañas de esta carpeta',
        },
        { type: 'separator' },
        {
          type: 'submenu',
          label: 'Eliminar',
          submenu: [
            { type: 'normal', id: 'delete-promote', label: 'Solo la carpeta (promover hijos)' },
            { type: 'normal', id: 'delete-cascade', label: 'Carpeta y descendientes' },
          ],
        },
      ];

      const colorActions: Record<string, () => void> = {};
      for (const p of PALETTE) {
        colorActions[`color:${p.id}`] = () => void window.api.node.update({ id: node.id, color: p.color });
      }
      const iconActions: Record<string, () => void> = {};
      ICONS.forEach((emoji, idx) => {
        iconActions[`icon:${idx}`] = () => void window.api.node.update({ id: node.id, icon: emoji });
      });
      iconActions['icon:clear'] = () => void window.api.node.update({ id: node.id, icon: null });

      void showContextMenu(items, {
        'add-to-folder': () => void addTabToNewFolder(node),
        ...colorActions,
        ...iconActions,
        'new-folder': async () => {
          await window.api.node.createFolderTab({
            workspaceId: node.workspaceId,
            parentId: node.id,
            name: 'Carpeta',
          });
        },
        'new-tab': () => void window.api.window.openUrlInNewTab({ url: 'vela://newtab', parentId: node.id, activate: true }),
        'collapse-all': () => setCollapseRecursive(node, true),
        'expand-all': () => setCollapseRecursive(node, false),
        'discard-folder': () => void window.api.discard.discardFolder({ folderId: node.id }),
        'restore-folder': () => {
          for (const n of nodes) {
            if (n.parentId === node.id && n.kind === 'tab' && (n as TabNode).discarded) {
              void window.api.discard.restoreTab({ tabId: n.id });
            }
          }
        },
        'toggle-folder-whitelist': () => void window.api.discard.toggleFolderWhitelist({ folderId: node.id }),
        'delete-promote': () => void window.api.node.delete({ id: node.id, cascade: false }),
        'delete-cascade': () => void window.api.node.delete({ id: node.id, cascade: true }),
      });
    };
  }

  // ── DnD: Ancladas ────────────────────────────────────────────────────────────
  const anchoredTabs = nodes
    .filter((n): n is TabNode => n.kind === 'tab' && n.anchored)
    .sort((a, b) => (a.position < b.position ? -1 : 1));

  const handleAnchorDragOver = useCallback((e: DragOverEvent) => {
    if (!e.over) { setAnchorDragTarget(null); return; }
    const d = e.over.data.current as { anchorId?: string; zone?: 'before' | 'after' } | undefined;
    if (d?.anchorId && d.zone) setAnchorDragTarget({ id: d.anchorId, zone: d.zone });
    else setAnchorDragTarget(null);
  }, []);

  const handleAnchorDragEnd = useCallback((e: DragEndEvent) => {
    setAnchorDragTarget(null);
    if (!e.over) return;
    const draggedId = String(e.active.id);
    const overData = e.over.data.current as { anchorId?: string; zone?: 'before' | 'after' } | undefined;
    if (!overData?.anchorId || !overData.zone) return;
    if (draggedId === overData.anchorId) return;

    const sorted = [...anchoredTabs];
    const targetIdx = sorted.findIndex((n) => n.id === overData.anchorId);
    if (targetIdx === -1) return;
    const targetNode = sorted[targetIdx];
    if (!targetNode) return;

    const insertBefore = overData.zone === 'before';
    const prevPos = insertBefore ? (sorted[targetIdx - 1]?.position ?? null) : targetNode.position;
    const nextPos = insertBefore ? targetNode.position : (sorted[targetIdx + 1]?.position ?? null);
    void window.api.node.reorder({ id: draggedId, newPosition: generateKeyBetween(prevPos, nextPos) });
  }, [anchoredTabs]);

  // ── DnD: Main (Cargadas + Tree) ───────────────────────────────────────────
  const pinnedTabs = nodes
    .filter((n): n is TabNode => n.kind === 'tab' && n.pinned)
    .sort((a, b) => (a.position < b.position ? -1 : 1));

  const rootNodes = nodes
    .filter((n) => n.parentId === null && !(n.kind === 'tab' && ((n as TabNode).pinned || (n as TabNode).anchored)))
    .sort((a, b) => (a.position < b.position ? -1 : 1));

  const handleMainDragOver = useCallback((e: DragOverEvent) => {
    if (!e.over) { setActiveDrop(null); return; }
    const decoded = decDrop(String(e.over.id));
    if (!decoded) { setActiveDrop(null); return; }

    const draggedId = String(e.active.id);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const targetNode = byId.get(decoded.nodeId);

    let invalid = false;
    if (decoded.nodeId === draggedId) {
      invalid = true;
    } else if (decoded.zone === 'inside') {
      if (!targetNode || !isFolderLike(targetNode)) invalid = true;
      else if (isDescendantOf(draggedId, decoded.nodeId, byId)) invalid = true;
    } else {
      const newParentId = targetNode?.parentId ?? null;
      if (newParentId === draggedId) invalid = true;
      else if (newParentId !== null && isDescendantOf(draggedId, newParentId, byId)) invalid = true;
    }

    setActiveDrop({
      draggedId,
      targetId: decoded.nodeId,
      zone: decoded.zone as 'before' | 'after' | 'inside',
      invalid,
    });
  }, [nodes]);

  const handleMainDragEnd = useCallback((e: DragEndEvent) => {
    const drop = activeDrop;
    setActiveDrop(null);
    if (!drop || drop.invalid || !e.over) return;

    const draggedId = String(e.active.id);
    const dragged = nodes.find((n) => n.id === draggedId);
    if (!dragged) return;

    const targetNode = nodes.find((n) => n.id === drop.targetId) ?? null;
    const resolution = resolveTreeDropPosition(draggedId, { nodeId: drop.targetId, zone: drop.zone }, nodes);
    if (!resolution) return;

    const shouldPin =
      dragged.kind === 'tab' &&
      !(dragged as TabNode).pinned &&
      targetNode?.kind === 'tab' &&
      (targetNode as TabNode).pinned;

    const shouldUnpin =
      dragged.kind === 'tab' &&
      (dragged as TabNode).pinned &&
      !(targetNode?.kind === 'tab' && (targetNode as TabNode).pinned);

    const positionPromise =
      resolution.newParentId === dragged.parentId
        ? window.api.node.reorder({ id: draggedId, newPosition: resolution.newPosition })
        : window.api.node.move({ id: draggedId, newParentId: resolution.newParentId, newPosition: resolution.newPosition });

    if (shouldPin) {
      void positionPromise.then(() => window.api.tab.pin({ id: draggedId }));
    } else if (shouldUnpin) {
      void positionPromise.then(() => window.api.tab.unpin({ id: draggedId }));
    } else {
      void positionPromise;
    }
  }, [activeDrop, nodes]);

  // ── Árbol ─────────────────────────────────────────────────────────────────
  const activeWs = workspaces.find((ws) => ws.id === activeWsId) ?? null;

  function childrenOf(parentId: string): TreeNode[] {
    return nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => (a.position < b.position ? -1 : 1));
  }

  const sectionLabel = (text: string) => (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.07em',
      textTransform: 'uppercase', color: 'var(--vela-fg-muted, #8c93a3)',
      padding: '5px 12px 1px',
    }}>
      {text}
    </div>
  );

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    if (isFolderLike(node)) {
      const collapsed = isCollapsed(node);
      const children = childrenOf(node.id);
      return (
        <FloatFolderRow
          key={node.id}
          node={node}
          depth={depth}
          collapsed={collapsed}
          activeDrop={activeDrop}
          onToggleCollapse={() => handleToggleCollapse(node)}
          onActivate={() => void handleActivateTab(node.id)}
          onContextMenu={makeFolderContextMenu(node)}
        >
          {!collapsed && children.map((child) => renderNode(child, depth + 1))}
        </FloatFolderRow>
      );
    }
    return (
      <FloatTabRow
        key={node.id}
        node={node as TabNode}
        depth={depth}
        activeDrop={activeDrop}
        onActivate={() => void handleActivateTab(node.id)}
        onContextMenu={makeTabContextMenu(node as TabNode)}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        @keyframes velaSidebarSlideIn {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: var(--vela-border, rgba(255,255,255,0.12)); border-radius: 2px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', height: '100%',
          background: 'var(--vela-bg-sidebar, #1a1d24)',
          borderRadius: '0 10px 10px 0',
          boxShadow: '6px 0 32px rgba(0,0,0,0.5)',
          animation: 'velaSidebarSlideIn 200ms cubic-bezier(0.15, 0, 0, 1)',
        }}>

          {/* ── Ancladas: su propio DndContext ──────────────────────── */}
          {anchoredTabs.length > 0 && (
            <DndContext
              sensors={anchorSensors}
              collisionDetection={closestCenter}
              onDragOver={handleAnchorDragOver}
              onDragEnd={handleAnchorDragEnd}
              onDragCancel={() => setAnchorDragTarget(null)}
            >
              <div style={{
                flexShrink: 0,
                background: 'rgba(0,0,0,0.10)',
                borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.08))',
              }}>
                {sectionLabel('Ancladas')}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 8px 6px' }}>
                  {anchoredTabs.map((tab) => (
                    <FloatAnchorItem
                      key={tab.id}
                      node={tab}
                      dragTarget={anchorDragTarget?.id === tab.id ? { zone: anchorDragTarget.zone } : null}
                      onActivate={() => void handleActivateTab(tab.id)}
                      onContextMenu={makeTabContextMenu(tab)}
                    />
                  ))}
                </div>
              </div>
            </DndContext>
          )}

          {/* ── Workspace activo ─────────────────────────────────── */}
          <div style={{ flexShrink: 0, padding: '2px 4px 2px' }}>
            <button
              ref={wsBtnRef}
              type="button"
              title={activeWs?.name ?? 'Workspace'}
              onClick={handleOpenWorkspaceDrop}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '4px 8px',
                background: hovered === '__ws' ? 'var(--vela-hover, rgba(255,255,255,0.06))' : 'transparent',
                border: 'none', borderRadius: 5, cursor: 'pointer',
                minWidth: 0, textAlign: 'left', transition: 'background 80ms',
              }}
              onMouseEnter={() => setHovered('__ws')}
              onMouseLeave={() => setHovered(null)}
            >
              {activeWs
                ? <Badge icon={activeWs.icon} name={activeWs.name} color={activeWs.color} size={18} />
                : <span style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--vela-accent, #5b8ef4)', flexShrink: 0 }} />
              }
              <span style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontSize: 12.5, fontWeight: 600, color: 'var(--vela-fg, #e6e8ee)',
              }}>
                {activeWs?.name ?? '—'}
              </span>
              <span style={{ fontSize: 10, color: 'var(--vela-fg-muted, #8c93a3)', flexShrink: 0 }}>▾</span>
            </button>
          </div>

          <Divider />

          {/* ── Cargadas + Árbol: DndContext compartido ──────────── */}
          <DndContext
            sensors={mainSensors}
            collisionDetection={closestCenter}
            onDragOver={handleMainDragOver}
            onDragEnd={handleMainDragEnd}
            onDragCancel={() => setActiveDrop(null)}
          >
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 2 }}>
              {pinnedTabs.length > 0 && (
                <>
                  {sectionLabel('Cargadas')}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 8px 6px' }}>
                    {pinnedTabs.map((tab) => (
                      <FloatPinnedItem
                        key={tab.id}
                        node={tab}
                        activeDrop={activeDrop}
                        onActivate={() => void handleActivateTab(tab.id)}
                        onContextMenu={makeTabContextMenu(tab)}
                      />
                    ))}
                  </div>
                </>
              )}
              {rootNodes.length > 0 && (
                <>
                  {pinnedTabs.length > 0 && sectionLabel('Pestañas')}
                  {rootNodes.map((node) => renderNode(node, 0))}
                </>
              )}
              {nodes.length === 0 && (
                <div style={{ padding: '14px 12px', fontSize: 12, color: 'var(--vela-fg-muted, #8c93a3)', textAlign: 'center' }}>
                  Sin pestañas abiertas
                </div>
              )}
            </div>
          </DndContext>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid var(--vela-border, rgba(255,255,255,0.08))',
            padding: '6px 8px',
            display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <button
                ref={addBtnRef}
                type="button"
                title="Añadir pestaña o carpeta"
                aria-label="Añadir"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 6, border: 'none',
                  background: hovered === '__add' ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.06))' : 'transparent',
                  color: hovered === '__add' ? 'var(--vela-fg, #e6e8ee)' : 'var(--vela-fg-muted, #8c93a3)',
                  cursor: 'pointer', width: 28, height: 28, flexShrink: 0,
                  transition: 'background 80ms, color 80ms',
                }}
                onMouseEnter={() => setHovered('__add')}
                onMouseLeave={() => setHovered(null)}
                onClick={handleAddNode}
              >
                <Plus size={14} />
              </button>

              <button
                type="button"
                title="Ajustes (Ctrl+,)"
                aria-label="Abrir ajustes"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 6, border: 'none',
                  background: hovered === '__settings' ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.06))' : 'transparent',
                  color: hovered === '__settings' ? 'var(--vela-fg, #e6e8ee)' : 'var(--vela-fg-muted, #8c93a3)',
                  cursor: 'pointer', width: 28, height: 28, flexShrink: 0,
                  transition: 'background 80ms, color 80ms',
                }}
                onMouseEnter={() => setHovered('__settings')}
                onMouseLeave={() => setHovered(null)}
                onClick={() => void handleOpenSettings()}
              >
                <Settings size={14} />
              </button>
            </div>

            {activeProfile && (
              <button
                ref={profileBtnRef}
                type="button"
                title={activeProfile.name}
                onClick={handleOpenProfileDrop}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '4px 4px',
                  background: hovered === '__profile' ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.06))' : 'transparent',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  minWidth: 0, textAlign: 'left',
                  transition: 'background 80ms', opacity: 0.8,
                }}
                onMouseEnter={() => setHovered('__profile')}
                onMouseLeave={() => setHovered(null)}
              >
                <Badge icon={activeProfile.icon} name={activeProfile.name} color={activeProfile.color} size={18} round />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, color: 'var(--vela-fg-muted, #8c93a3)' }}>
                  {activeProfile.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--vela-fg-muted, #8c93a3)', flexShrink: 0 }}>▾</span>
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
