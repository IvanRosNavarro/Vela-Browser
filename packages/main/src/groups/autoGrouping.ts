import type { AutoGroupRule, TabNode } from '@vela/shared';
import { positionsAtEnd } from '../lib/tree';
import type {
  AutoGroupRuleRepository,
  TreeNodeRepository,
} from '../storage/repositories';
import type { Logger } from '../logger';

export interface AutoGroupingDeps {
  rules: AutoGroupRuleRepository;
  nodes: TreeNodeRepository;
}

/**
 * Decide si una regla coincide con la URL/título de una tab.
 *
 * - `domain`: matching por host. Soporta prefijo `*.` para incluir
 *   subdominios. Comparación case-insensitive.
 * - `regex`: aplica `new RegExp(pattern, 'i')` sobre la URL completa.
 * - `title-contains`: substring case-insensitive sobre `originalTitle`.
 */
export function evaluateRule(rule: AutoGroupRule, tab: TabNode): boolean {
  if (!rule.enabled) return false;
  if (rule.matchType === 'domain') {
    let host: string;
    try {
      host = new URL(tab.url).host.toLowerCase();
    } catch {
      return false;
    }
    const pattern = rule.pattern.trim().toLowerCase();
    if (pattern.length === 0) return false;
    if (pattern.startsWith('*.')) {
      const bare = pattern.slice(2);
      return host === bare || host.endsWith(`.${bare}`);
    }
    return host === pattern;
  }
  if (rule.matchType === 'regex') {
    try {
      return new RegExp(rule.pattern, 'i').test(tab.url);
    } catch {
      return false;
    }
  }
  // title-contains
  const title = (tab.originalTitle ?? '').toLowerCase();
  return title.includes(rule.pattern.toLowerCase());
}

/**
 * Aplica las reglas del workspace de la tab si:
 * - la tab existe y es kind=tab,
 * - vive en raíz (parentId === null), porque si el usuario ya la ha
 *   metido en algún sitio, respetamos su decisión,
 * - no está pinned.
 *
 * La primera regla habilitada que coincide gana (orden por priority asc).
 * Devuelve el nodo movido o null si no se hizo nada.
 */
export function applyRulesToTab(
  tabId: string,
  deps: AutoGroupingDeps,
  logger?: Logger,
): TabNode | null {
  const node = deps.nodes.getById(tabId);
  if (!node || node.kind !== 'tab') return null;
  if (node.parentId !== null) return null;
  if (node.pinned) return null;

  const rules = deps.rules.list(node.workspaceId);
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!evaluateRule(rule, node)) continue;

    // Validar destino vivo. Si la carpeta destino se borró por carrera,
    // saltamos en silencio en vez de petar.
    const target = deps.nodes.getById(rule.targetFolderId);
    if (!target || target.kind !== 'folder') {
      logger?.warn(
        `[auto-group] regla ${rule.id}: target ${rule.targetFolderId} ya no existe`,
      );
      continue;
    }
    if (target.workspaceId !== node.workspaceId) {
      logger?.warn(
        `[auto-group] regla ${rule.id}: target en otro workspace (${target.workspaceId})`,
      );
      continue;
    }

    // Posición = al final de los hijos del folder destino.
    const siblings = deps.nodes.getByWorkspace(node.workspaceId);
    const lastSibling = siblings
      .filter((n) => n.parentId === target.id)
      .reduce<string | null>(
        (acc, n) => (acc === null || n.position > acc ? n.position : acc),
        null,
      );
    const newPosition = positionsAtEnd(lastSibling);

    const moved = deps.nodes.move(tabId, target.id, newPosition);
    logger?.info(
      `[auto-group] tab ${tabId} (${node.url}) movida a folder ${target.id} por regla ${rule.id}`,
    );
    return moved.node.kind === 'tab' ? moved.node : null;
  }

  return null;
}
