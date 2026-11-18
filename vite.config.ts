import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildPromptsCatalogManifest } from './src/core/promptsCatalog';

async function scanPromptsFolderOnDisk(rootDir: string) {
  const promptsDir = path.resolve(rootDir, 'prompts');
  const filesByPath: Record<string, string> = {};
  try {
    const entries = await fs.readdir(promptsDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map(async (entry) => {
          const fullPath = path.join(promptsDir, entry.name);
          const content = await fs.readFile(fullPath, 'utf8');
          filesByPath[`prompts/${entry.name}`] = content;
        })
    );
  } catch {
    // Return empty manifest if /prompts/ directory is temporarily missing
  }
  return buildPromptsCatalogManifest(filesByPath, new Date().toISOString(), true);
}

function promptsDirectoryPlugin(): Plugin {
  const rootDir = import.meta.dirname;
  return {
    name: 'prompts-directory-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (!url.endsWith('/prompts-manifest.json')) {
          next();
          return;
        }
        void scanPromptsFolderOnDisk(rootDir)
          .then((manifest) => {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, max-age=0');
            res.end(JSON.stringify(manifest));
          })
          .catch((err) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: err instanceof Error ? err.message : 'Failed to scan /prompts/ directory.',
              })
            );
          });
      });
    },
    async generateBundle() {
      const manifest = await scanPromptsFolderOnDisk(rootDir);
      this.emitFile({
        type: 'asset',
        fileName: 'prompts-manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}

function devServiceWorkerCleanupPlugin(): Plugin {
  const selfDestructSw = `
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clientsList = await self.clients.matchAll({ type: 'window' });
    for (const client of clientsList) {
      client.postMessage({ type: 'DEV_SW_UNREGISTERED' });
    }
  })());
});
`;
  return {
    name: 'dev-sw-cleanup',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (url.endsWith('/dev-sw.js') || url.endsWith('/sw.js')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(selfDestructSw);
          return;
        }
        if (url.endsWith('/version.json') || url.endsWith('/status.json')) {
          res.setHeader('Cache-Control', 'no-store, max-age=0');
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  // Hardcoded '/' keeps AI Studio from prompting for VITE_BASE_PATH (IMP-008).
  // GitHub Pages subpath builds run via Bun in .github/workflows/deploy-pages.yml passing `--base=...` on CLI.
  const basePath = '/';

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      devServiceWorkerCleanupPlugin(),
      promptsDirectoryPlugin(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: './',
          name: 'Community Pedigree',
          short_name: 'Pedigree',
          description:
            '100% Free Offline-First Multi-Species Livestock Registry, Pedigree & Barn Chore Manager.',
          theme_color: '#141814',
          background_color: '#141814',
          display: 'standalone',
          orientation: 'any',
          scope: './',
          start_url: './',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /\/version\.json$/, /\/status\.json$/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 16,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        'fflate',
        'sql.js',
      ],
    },
    build: {
      target: ['es2018', 'chrome68', 'safari12', 'firefox63', 'edge79'],
      cssTarget: ['chrome68', 'safari12', 'firefox63', 'edge79'],
    },
    worker: {
      format: 'es' as const,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR, WebSocket server, and file watching are hardcoded disabled to prevent preview flickering,
      // mobile iframe reload loops, and AI Studio env-var prompts (production/Pages builds are unaffected).
      hmr: false,
      ws: false as const,
      watch: null,
    },
  };
});
