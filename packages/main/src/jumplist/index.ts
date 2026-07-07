import path from 'node:path';
import { app } from 'electron';
import type { Profile } from '@vela/shared';

function getFantasmaIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'fantasma.ico')
    : path.join(__dirname, '..', '..', '..', 'build', 'fantasma.ico');
}

export function buildJumpList(profiles: Profile[]): void {
  if (process.platform !== 'win32') return;

  const exe = process.execPath;

  const task = (title: string, description: string, args: string, iconPath?: string) => ({
    type: 'task' as const,
    title,
    description,
    program: exe,
    args,
    iconPath: iconPath ?? exe,
    iconIndex: 0,
  });

  const categories = [];

  if (profiles.length > 1) {
    categories.push({
      type: 'custom' as const,
      name: 'Perfiles',
      items: profiles.slice(0, 10).map((p) =>
        task(
          p.icon ? `${p.icon}  ${p.name}` : p.name,
          `Abrir Vela con el perfil ${p.name}`,
          `--profile=${p.id}`,
        )
      ),
    });
  }

  categories.push({
    type: 'tasks' as const,
    items: [
      task('Nueva pestaña', 'Abrir una nueva pestaña en Vela', '--new-tab'),
      task('Nueva ventana', 'Abrir una nueva ventana', '--new-window'),
      { type: 'separator' as const },
      task('Nueva ventana fantasma', 'Abrir una ventana fantasma', '--private-window', getFantasmaIconPath()),
    ],
  });

  app.setJumpList(categories);
}

/**
 * Windows invoca `Vela.exe "%1"` cuando está registrado como navegador
 * predeterminado (ver registerWindowsCapabilities), sustituyendo `%1` por la
 * URL sobre la que el usuario hizo doble clic (enlace en otra app, .html,
 * etc.). Ese argumento llega suelto en argv, sin flag que lo identifique.
 */
function extractUrlArg(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue;
    try {
      const parsed = new URL(arg);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return arg;
    } catch {
      // no es una URL (p.ej. la ruta del script de entrada en dev)
    }
  }
  return null;
}

export function parseJumpListArgs(argv: string[]): {
  profileId: string | undefined;
  newTab: boolean;
  newWindow: boolean;
  privateWindow: boolean;
  url: string | null;
} {
  const profileArg = argv.find((a) => a.startsWith('--profile='));
  return {
    profileId: profileArg?.split('=')[1],
    newTab: argv.includes('--new-tab'),
    newWindow: argv.includes('--new-window'),
    privateWindow: argv.includes('--private-window'),
    url: extractUrlArg(argv),
  };
}
