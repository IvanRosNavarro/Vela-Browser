import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootPkg = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };
const APP_VERSION = rootPkg.version;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  // Las páginas internas (vela://) usan rutas absolutas para sus assets en
  // prod; el shell (BrowserWindow) usa './' porque se carga con loadFile.
  // El protocol handler sirve las páginas internas directamente, así que
  // pueden usar '/' como base igual que un servidor web normal.
  base: './',
  build: {
    target: 'chrome120',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        shell: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'src/pages/settings/index.html'),
        newtab: resolve(__dirname, 'src/pages/newtab/index.html'),
        about: resolve(__dirname, 'src/pages/about/index.html'),
        reader: resolve(__dirname, 'src/pages/reader/index.html'),
        extensions: resolve(__dirname, 'src/pages/extensions/index.html'),
        filepicker: resolve(__dirname, 'src/pages/filepicker/index.html'),
        glance: resolve(__dirname, 'src/pages/glance/index.html'),
        'media-popup': resolve(__dirname, 'src/pages/media-popup/index.html'),
        history: resolve(__dirname, 'src/pages/history/index.html'),
        cookiepanel: resolve(__dirname, 'src/pages/cookiepanel/index.html'),
        favorites: resolve(__dirname, 'src/pages/favorites/index.html'),
        anchors: resolve(__dirname, 'src/pages/anchors/index.html'),
        'adblocker-panel': resolve(__dirname, 'src/pages/adblocker-panel/index.html'),
        'vault-save-modal': resolve(__dirname, 'src/pages/vault-save-modal/index.html'),
        'vault-autofill-modal': resolve(__dirname, 'src/pages/vault-autofill-modal/index.html'),
        passwords: resolve(__dirname, 'src/pages/passwords/index.html'),
        scripts: resolve(__dirname, 'src/pages/scripts/index.html'),
        'security-popup': resolve(__dirname, 'src/pages/security-popup/index.html'),
        'notification-permission': resolve(__dirname, 'src/pages/notification-permission/index.html'),
        'media-permission-popup': resolve(__dirname, 'src/pages/media-permission-popup/index.html'),
        'devmode-popup': resolve(__dirname, 'src/pages/devmode-popup/index.html'),
        'devtools-eyedropper': resolve(__dirname, 'src/pages/devtools-eyedropper/index.html'),
        'suggestions-popup': resolve(__dirname, 'src/pages/suggestions-popup/index.html'),
        'sidebar-floating': resolve(__dirname, 'src/pages/sidebar-floating/index.html'),
        'vela-menu': resolve(__dirname, 'src/pages/vela-menu/index.html'),
        downloads: resolve(__dirname, 'src/pages/downloads/index.html'),
        'download-popup': resolve(__dirname, 'src/pages/download-popup/index.html'),
        'workspace-dropdown': resolve(__dirname, 'src/pages/workspace-dropdown/index.html'),
        'profile-dropdown': resolve(__dirname, 'src/pages/profile-dropdown/index.html'),
        'add-node-menu': resolve(__dirname, 'src/pages/add-node-menu/index.html'),
        'tab-preview': resolve(__dirname, 'src/pages/tab-preview/index.html'),
        'folder-view': resolve(__dirname, 'src/pages/folder-view/index.html'),
        'tools-cluster': resolve(__dirname, 'src/pages/tools-cluster/index.html'),
        'status-cluster': resolve(__dirname, 'src/pages/status-cluster/index.html'),
        'find-bar': resolve(__dirname, 'src/pages/find-bar/index.html'),
        'cert-error': resolve(__dirname, 'src/pages/cert-error/index.html'),
        'translate-result': resolve(__dirname, 'src/pages/translate-result/index.html'),
        'translate-confirm': resolve(__dirname, 'src/pages/translate-confirm/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@vela/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
