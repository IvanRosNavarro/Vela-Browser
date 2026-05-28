import path from 'node:path';
import { app } from 'electron';

export function getAppIconPath(): string {
  const iconFile =
    process.platform === 'win32' ? 'icon.ico' :
    process.platform === 'darwin' ? 'icon.icns' :
    'icon.png';

  return app.isPackaged
    ? path.join(process.resourcesPath, 'build', iconFile)
    : path.join(__dirname, '..', '..', '..', 'build', iconFile);
}
