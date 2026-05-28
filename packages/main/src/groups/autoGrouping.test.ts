import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { TabNode } from '@vela/shared';
import { createTestDb } from '../test/createTestDb';
import {
  AutoGroupRuleRepository,
  TreeNodeRepository,
} from '../storage/repositories';
import { applyRulesToTab, evaluateRule } from './autoGrouping';

const WS = 'default';

function makeTab(overrides: Partial<TabNode> = {}): TabNode {
  return {
    id: 'tab-x',
    workspaceId: WS,
    parentId: null,
    kind: 'tab',
    position: 'a0',
    name: null,
    color: null,
    icon: null,
    url: 'https://github.com/anthropics/claude-code',
    originalTitle: 'Claude Code on GitHub',
    favicon: null,
    pinned: false,
    pinnedUrl: null,
    anchored: false,
    anchoredUrl: null,
    discarded: false,
    collapsed: false,
    lastActiveAt: null,
    isSecure: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('evaluateRule', () => {
  it('domain coincide con el host exacto, case insensitive', () => {
    const tab = makeTab({ url: 'https://GitHub.com/foo' });
    expect(
      evaluateRule(
        {
          id: 'r',
          workspaceId: WS,
          pattern: 'github.com',
          matchType: 'domain',
          targetFolderId: 'f',
          priority: 0,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        tab,
      ),
    ).toBe(true);
  });

  it('domain con prefijo *. coincide con subdominios', () => {
    const tab = makeTab({ url: 'https://api.example.com/v1' });
    expect(
      evaluateRule(
        {
          id: 'r',
          workspaceId: WS,
          pattern: '*.example.com',
          matchType: 'domain',
          targetFolderId: 'f',
          priority: 0,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        tab,
      ),
    ).toBe(true);
  });

  it('regex se evalúa case insensitive sobre la URL', () => {
    const tab = makeTab({ url: 'https://docs.python.org/3/' });
    expect(
      evaluateRule(
        {
          id: 'r',
          workspaceId: WS,
          pattern: '^https://docs\\.',
          matchType: 'regex',
          targetFolderId: 'f',
          priority: 0,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        tab,
      ),
    ).toBe(true);
  });

  it('title-contains busca substring en originalTitle, case insensitive', () => {
    const tab = makeTab({ originalTitle: 'API DOCS — Reference' });
    expect(
      evaluateRule(
        {
          id: 'r',
          workspaceId: WS,
          pattern: 'docs',
          matchType: 'title-contains',
          targetFolderId: 'f',
          priority: 0,
          enabled: true,
          createdAt: 0,
          updatedAt: 0,
        },
        tab,
      ),
    ).toBe(true);
  });

  it('regla deshabilitada nunca coincide', () => {
    const tab = makeTab();
    expect(
      evaluateRule(
        {
          id: 'r',
          workspaceId: WS,
          pattern: 'github.com',
          matchType: 'domain',
          targetFolderId: 'f',
          priority: 0,
          enabled: false,
          createdAt: 0,
          updatedAt: 0,
        },
        tab,
      ),
    ).toBe(false);
  });
});

describe('applyRulesToTab', () => {
  let db: DatabaseSync;
  let nodes: TreeNodeRepository;
  let rules: AutoGroupRuleRepository;
  let codeFolderId: string;
  let docsFolderId: string;

  beforeEach(() => {
    db = createTestDb();
    nodes = new TreeNodeRepository(db);
    rules = new AutoGroupRuleRepository(db);
    codeFolderId = nodes.createFolder({
      workspaceId: WS,
      parentId: null,
      name: 'Código',
    }).id;
    docsFolderId = nodes.createFolder({
      workspaceId: WS,
      parentId: null,
      name: 'Docs',
    }).id;
  });

  it('mueve la tab a la carpeta de la primera regla habilitada que coincide', () => {
    rules.create({
      workspaceId: WS,
      pattern: 'github.com',
      matchType: 'domain',
      targetFolderId: codeFolderId,
    });
    const tab = nodes.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://github.com/x/y',
    });
    const moved = applyRulesToTab(tab.id, { rules, nodes });
    expect(moved?.parentId).toBe(codeFolderId);
  });

  it('respeta la decisión del usuario: si parentId !== null no aplica', () => {
    rules.create({
      workspaceId: WS,
      pattern: 'github.com',
      matchType: 'domain',
      targetFolderId: codeFolderId,
    });
    const tab = nodes.createTab({
      workspaceId: WS,
      parentId: docsFolderId,
      url: 'https://github.com/x/y',
    });
    expect(applyRulesToTab(tab.id, { rules, nodes })).toBeNull();
    expect(nodes.getById(tab.id)?.parentId).toBe(docsFolderId);
  });

  it('no aplica a tabs pinned', () => {
    rules.create({
      workspaceId: WS,
      pattern: 'github.com',
      matchType: 'domain',
      targetFolderId: codeFolderId,
    });
    const tab = nodes.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://github.com/x/y',
      pinned: true,
    });
    expect(applyRulesToTab(tab.id, { rules, nodes })).toBeNull();
  });

  it('orden por priority: la regla con priority menor gana', () => {
    // Creamos primero la de docs (priority 0) para que gane sobre la de código (priority 1).
    rules.create({
      workspaceId: WS,
      pattern: 'docs',
      matchType: 'title-contains',
      targetFolderId: docsFolderId,
    });
    rules.create({
      workspaceId: WS,
      pattern: 'github.com',
      matchType: 'domain',
      targetFolderId: codeFolderId,
    });
    const tab = nodes.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://github.com/anthropics/docs',
      originalTitle: 'docs',
    });
    const moved = applyRulesToTab(tab.id, { rules, nodes });
    expect(moved?.parentId).toBe(docsFolderId);
  });
});
