import type { DatabaseSync } from 'node:sqlite';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  windowId: string;
  profileId: string;
  workspaceId: string | null;
  bounds: WindowBounds;
  isPrimary: boolean;
  createdAt: number;
  updatedAt: number;
}

interface WindowStateRow {
  window_id: string;
  profile_id: string;
  workspace_id: string | null;
  bounds: string;
  is_primary: number;
  created_at: number;
  updated_at: number;
}

function rowToState(row: WindowStateRow): WindowState {
  let bounds: WindowBounds = { x: 0, y: 0, width: 1280, height: 800 };
  try {
    const parsed = JSON.parse(row.bounds) as Partial<WindowBounds>;
    if (parsed && typeof parsed === 'object') {
      bounds = {
        x: typeof parsed.x === 'number' ? parsed.x : 0,
        y: typeof parsed.y === 'number' ? parsed.y : 0,
        width: typeof parsed.width === 'number' ? parsed.width : 1280,
        height: typeof parsed.height === 'number' ? parsed.height : 800,
      };
    }
  } catch {
    // keep defaults
  }
  return {
    windowId: row.window_id,
    profileId: row.profile_id,
    workspaceId: row.workspace_id,
    bounds,
    isPrimary: row.is_primary === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class WindowStateRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(windowId: string): WindowState | null {
    const row = this.db
      .prepare('SELECT * FROM window_state WHERE window_id = ?')
      .get(windowId) as WindowStateRow | undefined;
    return row ? rowToState(row) : null;
  }

  getByProfile(profileId: string): WindowState[] {
    const rows = this.db
      .prepare('SELECT * FROM window_state WHERE profile_id = ? ORDER BY created_at ASC')
      .all(profileId) as WindowStateRow[];
    return rows.map(rowToState);
  }

  getPrimary(profileId: string): WindowState | null {
    const row = this.db
      .prepare('SELECT * FROM window_state WHERE profile_id = ? AND is_primary = 1')
      .get(profileId) as WindowStateRow | undefined;
    return row ? rowToState(row) : null;
  }

  upsert(data: WindowState): void {
    this.db
      .prepare(
        `INSERT INTO window_state
           (window_id, profile_id, workspace_id, bounds, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(window_id) DO UPDATE SET
           profile_id   = excluded.profile_id,
           workspace_id = excluded.workspace_id,
           bounds       = excluded.bounds,
           is_primary   = excluded.is_primary,
           updated_at   = excluded.updated_at`,
      )
      .run(
        data.windowId,
        data.profileId,
        data.workspaceId ?? null,
        JSON.stringify(data.bounds),
        data.isPrimary ? 1 : 0,
        data.createdAt,
        data.updatedAt,
      );
  }

  updateWorkspace(windowId: string, workspaceId: string | null): void {
    this.db
      .prepare(
        'UPDATE window_state SET workspace_id = ?, updated_at = ? WHERE window_id = ?',
      )
      .run(workspaceId ?? null, Date.now(), windowId);
  }

  updateBounds(windowId: string, bounds: WindowBounds): void {
    this.db
      .prepare(
        'UPDATE window_state SET bounds = ?, updated_at = ? WHERE window_id = ?',
      )
      .run(JSON.stringify(bounds), Date.now(), windowId);
  }

  delete(windowId: string): void {
    this.db.prepare('DELETE FROM window_state WHERE window_id = ?').run(windowId);
  }

  setPrimary(windowId: string, profileId: string): void {
    // Desmarcar todas las ventanas del perfil y marcar solo la indicada.
    this.db.prepare('UPDATE window_state SET is_primary = 0 WHERE profile_id = ?').run(profileId);
    this.db
      .prepare('UPDATE window_state SET is_primary = 1, updated_at = ? WHERE window_id = ?')
      .run(Date.now(), windowId);
  }
}
