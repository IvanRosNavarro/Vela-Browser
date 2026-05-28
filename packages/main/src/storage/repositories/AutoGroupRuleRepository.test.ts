import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '../../test/createTestDb';
import { AutoGroupRuleRepository } from './AutoGroupRuleRepository';
import { TreeNodeRepository } from './TreeNodeRepository';

const WS = 'default';

describe('AutoGroupRuleRepository', () => {
  let db: DatabaseSync;
  let rules: AutoGroupRuleRepository;
  let nodes: TreeNodeRepository;
  let folderId: string;

  beforeEach(() => {
    db = createTestDb();
    rules = new AutoGroupRuleRepository(db);
    nodes = new TreeNodeRepository(db);
    folderId = nodes.createFolder({
      workspaceId: WS,
      parentId: null,
      name: 'Código',
    }).id;
  });

  it('crea reglas con prioridad incremental y las lista en orden', () => {
    const r1 = rules.create({
      workspaceId: WS,
      pattern: 'github.com',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    const r2 = rules.create({
      workspaceId: WS,
      pattern: 'gitlab.com',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    expect(r1.priority).toBe(0);
    expect(r2.priority).toBe(1);
    const list = rules.list(WS);
    expect(list.map((r) => r.id)).toEqual([r1.id, r2.id]);
  });

  it('rechaza target_folder_id que no es folder', () => {
    const tab = nodes.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://x.example',
    });
    expect(() =>
      rules.create({
        workspaceId: WS,
        pattern: 'x',
        matchType: 'domain',
        targetFolderId: tab.id,
      }),
    ).toThrow();
  });

  it('rechaza patrón regex inválido', () => {
    expect(() =>
      rules.create({
        workspaceId: WS,
        pattern: '[unclosed',
        matchType: 'regex',
        targetFolderId: folderId,
      }),
    ).toThrow();
  });

  it('reorderPriority reasigna las prioridades según el orden recibido', () => {
    const r1 = rules.create({
      workspaceId: WS,
      pattern: 'a',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    const r2 = rules.create({
      workspaceId: WS,
      pattern: 'b',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    const r3 = rules.create({
      workspaceId: WS,
      pattern: 'c',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    const reordered = rules.reorderPriority(WS, [r3.id, r1.id, r2.id]);
    expect(reordered.map((r) => r.id)).toEqual([r3.id, r1.id, r2.id]);
    expect(reordered.map((r) => r.priority)).toEqual([0, 1, 2]);
  });

  it('reorderPriority falla si la lista está incompleta', () => {
    const r1 = rules.create({
      workspaceId: WS,
      pattern: 'a',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    rules.create({
      workspaceId: WS,
      pattern: 'b',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    expect(() => rules.reorderPriority(WS, [r1.id])).toThrow();
  });

  it('borrar el folder destino borra la regla en cascada', () => {
    const r = rules.create({
      workspaceId: WS,
      pattern: 'x',
      matchType: 'domain',
      targetFolderId: folderId,
    });
    nodes.delete(folderId, 'subtree');
    expect(rules.getById(r.id)).toBeNull();
  });
});
