import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

export class PreviewStore {
  constructor(private readonly profileId: string) {}

  private getPreviewsDir(): string {
    return path.join(app.getPath('userData'), 'profiles', this.profileId, 'previews');
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.getPreviewsDir(), { recursive: true });
  }

  getPath(tabId: string): string {
    return path.join(this.getPreviewsDir(), `${tabId}.webp`);
  }

  async save(tabId: string, buffer: Buffer): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.getPath(tabId), buffer);
  }

  async get(tabId: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.getPath(tabId));
    } catch {
      return null;
    }
  }

  async exists(tabId: string): Promise<boolean> {
    try {
      await fs.access(this.getPath(tabId));
      return true;
    } catch {
      return false;
    }
  }

  async delete(tabId: string): Promise<void> {
    try {
      await fs.unlink(this.getPath(tabId));
    } catch {
      // Si no existe, ignorar silenciosamente.
    }
  }

  async deleteAll(): Promise<void> {
    await fs.rm(this.getPreviewsDir(), { recursive: true, force: true });
  }

  async listOrphans(activeTabs: string[]): Promise<string[]> {
    try {
      const files = await fs.readdir(this.getPreviewsDir());
      const activeSet = new Set(activeTabs);
      return files
        .filter((f) => f.endsWith('.webp'))
        .map((f) => f.replace('.webp', ''))
        .filter((id) => !activeSet.has(id));
    } catch {
      return [];
    }
  }
}
