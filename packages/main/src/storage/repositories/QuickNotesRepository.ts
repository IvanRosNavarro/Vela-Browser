import type { DatabaseSync } from 'node:sqlite';

export interface QuickNote {
  workspaceId: string;
  content: string;
  updatedAt: number;
  ydocState?: string | null;
}

interface QuickNoteRow {
  workspace_id: string;
  content: string;
  updated_at: number;
  ydoc_state: string | null;
}

function rowToNote(row: QuickNoteRow): QuickNote {
  return {
    workspaceId: row.workspace_id,
    content: row.content,
    updatedAt: row.updated_at,
    ydocState: row.ydoc_state ?? null,
  };
}

export class QuickNotesRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(workspaceId: string): QuickNote | null {
    const row = this.db
      .prepare('SELECT workspace_id, content, updated_at, ydoc_state FROM quick_notes WHERE workspace_id = ?')
      .get(workspaceId) as QuickNoteRow | undefined;
    return row ? rowToNote(row) : null;
  }

  upsert(workspaceId: string, content: string): void {
    this.db
      .prepare(
        `INSERT INTO quick_notes (workspace_id, content, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           content    = excluded.content,
           updated_at = excluded.updated_at`,
      )
      .run(workspaceId, content, Date.now());
  }

  upsertWithYdoc(workspaceId: string, content: string, ydocState: string): void {
    this.db
      .prepare(
        `INSERT INTO quick_notes (workspace_id, content, updated_at, ydoc_state)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           content    = excluded.content,
           updated_at = excluded.updated_at,
           ydoc_state = excluded.ydoc_state`,
      )
      .run(workspaceId, content, Date.now(), ydocState);
  }

  delete(workspaceId: string): void {
    this.db
      .prepare('DELETE FROM quick_notes WHERE workspace_id = ?')
      .run(workspaceId);
  }
}
