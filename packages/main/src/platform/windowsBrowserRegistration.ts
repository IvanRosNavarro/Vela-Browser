import { spawnSync } from 'node:child_process';

function regAdd(key: string, valueName: string | null, data: string): void {
  const args = ['add', key, '/f', '/t', 'REG_SZ'];
  if (valueName === null) {
    args.push('/ve');
  } else {
    args.push('/v', valueName);
  }
  args.push('/d', data);
  spawnSync('reg', args, { stdio: 'ignore', windowsHide: true });
}

/**
 * Registra Vela en el Registro de Windows con la estructura Capabilities +
 * RegisteredApplications que Windows 11 necesita para mostrar la app en
 * Configuración → Aplicaciones → Aplicaciones predeterminadas.
 *
 * app.setAsDefaultProtocolClient() solo escribe UserChoice, que Windows 11
 * ya no acepta de forma programática. Esta función escribe las claves que
 * hacen que la app aparezca como opción seleccionable por el usuario.
 *
 * Se llama en cada arranque para que la ruta del ejecutable esté siempre
 * actualizada (cambia entre versiones y rutas de instalación).
 */
export function registerWindowsCapabilities(): void {
  if (process.platform !== 'win32') return;

  const exePath = process.execPath;
  const commandValue = `"${exePath}" "%1"`;
  const iconValue = `${exePath},0`;

  // ProgID para URLs (http / https / ftp)
  regAdd('HKCU\\Software\\Classes\\VelaBrowserURL', null, 'Vela Browser URL');
  regAdd('HKCU\\Software\\Classes\\VelaBrowserURL', 'URL Protocol', '');
  regAdd('HKCU\\Software\\Classes\\VelaBrowserURL\\DefaultIcon', null, iconValue);
  regAdd('HKCU\\Software\\Classes\\VelaBrowserURL\\shell\\open\\command', null, commandValue);

  // ProgID para archivos HTML
  regAdd('HKCU\\Software\\Classes\\VelaBrowserHTML', null, 'Vela HTML Document');
  regAdd('HKCU\\Software\\Classes\\VelaBrowserHTML\\DefaultIcon', null, iconValue);
  regAdd('HKCU\\Software\\Classes\\VelaBrowserHTML\\shell\\open\\command', null, commandValue);

  // Capabilities — bloque que Windows 11 lee para construir la lista de "Aplicaciones predeterminadas"
  regAdd('HKCU\\Software\\Vela\\Capabilities', 'ApplicationName', 'Vela');
  regAdd(
    'HKCU\\Software\\Vela\\Capabilities',
    'ApplicationDescription',
    'Navegador web con énfasis en privacidad y organización',
  );
  regAdd('HKCU\\Software\\Vela\\Capabilities\\URLAssociations', 'http', 'VelaBrowserURL');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\URLAssociations', 'https', 'VelaBrowserURL');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\URLAssociations', 'ftp', 'VelaBrowserURL');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\FileAssociations', '.htm', 'VelaBrowserHTML');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\FileAssociations', '.html', 'VelaBrowserHTML');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\FileAssociations', '.shtml', 'VelaBrowserHTML');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\FileAssociations', '.xhtml', 'VelaBrowserHTML');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\FileAssociations', '.svg', 'VelaBrowserHTML');
  regAdd('HKCU\\Software\\Vela\\Capabilities\\FileAssociations', '.webp', 'VelaBrowserHTML');

  // Punto de entrada — sin esto Windows 11 no muestra la app en "Aplicaciones predeterminadas"
  regAdd('HKCU\\Software\\RegisteredApplications', 'Vela', 'Software\\Vela\\Capabilities');
}
