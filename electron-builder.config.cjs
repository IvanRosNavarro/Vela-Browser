// Configuración de electron-builder.
// Se carga como CJS para poder leer process.env en build time.
// El repositorio destino del publish se controla con GITHUB_REPO=owner/repo.
// Si no está, usa un fallback razonable (que debería actualizarse cuando se
// hace fork del proyecto).

const DEFAULT_REPO = 'IvanRosNavarro/Vela-Browser';
const repoSlug = process.env.GITHUB_REPO || DEFAULT_REPO;
const slashIndex = repoSlug.indexOf('/');
if (slashIndex <= 0 || slashIndex === repoSlug.length - 1) {
  throw new Error(
    `GITHUB_REPO debe tener formato "owner/repo". Recibido: "${repoSlug}"`,
  );
}
const owner = repoSlug.slice(0, slashIndex);
const repo = repoSlug.slice(slashIndex + 1);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.vela.browser',
  productName: 'Vela',
  copyright: 'Copyright (C) 2026 Vela Browser contributors. Licensed under GPL-3.0-only.',

  directories: {
    output: 'release/${version}',
    buildResources: 'build',
  },

  // Copia los iconos al directorio de recursos del paquete para que
  // process.resourcesPath/build/icon.* sea válido en tiempo de ejecución.
  extraResources: [
    { from: 'build', to: 'build', filter: ['icon.ico', 'icon.icns', 'icon.png'] },
  ],

  // Importante: arrancar con '**/*' y restar lo que no queremos en lugar de
  // listar paths positivos. Si solo se listan paths positivos, electron-builder
  // sustituye sus defaults y deja FUERA todos los node_modules — eso fue el
  // bug que rompió el asar de v0.0.1.
  files: [
    '**/*',
    '!**/*.{md,ts,tsx,map}',
    '!**/node_modules/**/*.{md,ts,tsx,map}',
    '!**/node_modules/**/test/**',
    '!**/node_modules/**/tests/**',
    '!**/node_modules/**/.bin/**',
    '!**/node_modules/**/{CHANGELOG.md,README.md,LICENSE.md}',
    '!packages/*/src/**',
    '!packages/*/tsconfig*.json',
    '!packages/*/vite.config.*',
    '!packages/*/postcss.config.*',
    '!packages/*/tailwind.config.*',
    '!packages/renderer/index.html',
    '!packages/shared/**',
    '!extensions/**',
    '!release/**',
    '!docs/**',
    '!build/**',
    '!.github/**',
    '!.claude/**',
    '!**/tsconfig*.json',
    '!**/.editorconfig',
    '!**/.nvmrc',
    '!**/CLAUDE.md',
    '!**/FASE_ACTUAL.md',
    '!**/electron-builder.config.cjs',
    '!**/pnpm-lock.yaml',
    '!**/pnpm-workspace.yaml',
  ],

  asar: true,

  asarUnpack: [
    '**/node_modules/electron-chrome-extensions/**',
  ],

  mac: {
    target: [
      { target: 'dmg', arch: ['x64', 'arm64'] },
    ],
    category: 'public.app-category.productivity',
    // Para firma y notarización: ver docs/distribution/macos-signing.md
    // Activar cuando se tenga Apple Developer Program (~€99/año).
    identity: process.env.APPLE_IDENTITY || null,
    hardenedRuntime: !!process.env.APPLE_IDENTITY,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    ...(process.env.APPLE_TEAM_ID
      ? { notarize: { teamId: process.env.APPLE_TEAM_ID } }
      : {}),
  },

  win: {
    target: [
      { target: 'nsis', arch: ['x64', 'arm64'] },
    ],
    artifactName: '${productName}-Setup-${version}-${arch}.${ext}',
    // Para firma Authenticode: ver docs/distribution/windows-signing.md
    // Activar cuando se tenga certificado OV/EV Code Signing.
    ...(process.env.WIN_CERT_PATH
      ? {
        certificateFile: process.env.WIN_CERT_PATH,
        certificatePassword: process.env.WIN_CERT_PASSWORD,
        signingHashAlgorithms: ['sha256'],
      }
      : {}),
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    deleteAppDataOnUninstall: false,
  },

  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Network',
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },

  publish: {
    provider: 'github',
    owner,
    repo,
    releaseType: 'release',
  },
};
