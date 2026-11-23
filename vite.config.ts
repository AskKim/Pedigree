import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs/promises';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { buildPromptsCatalogManifest } from './src/core/promptsCatalog.ts';

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

function stripDevSourceMapTrailer(text: string): string {
  let out = text;
  const inlineJsIdx = out.lastIndexOf('//# sourceMappingURL=data:');
  if (inlineJsIdx !== -1) {
    out = out.slice(0, inlineJsIdx).trimEnd();
  }
  const inlineCssIdx = out.lastIndexOf('/*# sourceMappingURL=data:');
  if (inlineCssIdx !== -1) {
    out = out.slice(0, inlineCssIdx).trimEnd();
  }
  const extMapIdx = out.lastIndexOf('//# sourceMappingURL=');
  if (extMapIdx !== -1 && out.indexOf('\n', extMapIdx) === -1) {
    out = out.slice(0, extMapIdx).trimEnd();
  }
  return out;
}

function devInlineSourcemapStripPlugin(): Plugin {
  return {
    name: 'dev-inline-sourcemap-strip',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const origEnd = res.end.bind(res);
        // Strip 9+ MB of base64 inline sourcemaps in dev preview so mobile Chrome iframes stay well under renderer RAM limits.
        res.end = function patchedEnd(
          this: typeof res,
          chunk?: unknown,
          encoding?: unknown,
          cb?: unknown
        ) {
          const contentType = String(res.getHeader('content-type') || '');
          const isJsOrCss =
            contentType.includes('javascript') || contentType.includes('text/css');
          if (isJsOrCss && (typeof chunk === 'string' || Buffer.isBuffer(chunk))) {
            const rawText = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            if (rawText.includes('sourceMappingURL=')) {
              const stripped = stripDevSourceMapTrailer(rawText);
              const byteLen = Buffer.byteLength(stripped, 'utf8');
              if (!res.headersSent) {
                res.setHeader('Content-Length', String(byteLen));
              }
              if (typeof encoding === 'function') {
                return origEnd(stripped, encoding as () => void);
              }
              if (typeof cb === 'function') {
                return origEnd(stripped, (encoding as BufferEncoding) || 'utf8', cb as () => void);
              }
              return origEnd(stripped, 'utf8');
            }
          }
          if (typeof encoding === 'function') {
            return origEnd(chunk as string | Buffer, encoding as () => void);
          }
          if (typeof cb === 'function') {
            return origEnd(
              chunk as string | Buffer,
              encoding as BufferEncoding,
              cb as () => void
            );
          }
          if (encoding !== undefined) {
            return origEnd(chunk as string | Buffer, encoding as BufferEncoding);
          }
          return origEnd(chunk as string | Buffer);
        } as typeof res.end;
        next();
      });
    },
  };
}

function devLucideDirectImportPlugin(): Plugin {
  const rootDir = import.meta.dirname;
  let iconMapPromise: Promise<Map<string, string>> | null = null;

  async function loadLucideIconMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    try {
      const barrelPath = path.resolve(
        rootDir,
        'node_modules/lucide-react/dist/esm/lucide-react.js'
      );
      const barrel = await fs.readFile(barrelPath, 'utf8');
      const lineRe = /export\s*\{([^}]+)\}\s*from\s*['"]\.\/icons\/([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = lineRe.exec(barrel)) !== null) {
        const specBlock = match[1];
        const iconFile = match[2];
        const parts = specBlock.split(',');
        for (const part of parts) {
          const aliasMatch = part.trim().match(/^default\s+as\s+([A-Za-z0-9_$]+)$/);
          if (aliasMatch) {
            map.set(aliasMatch[1], `lucide-react/dist/esm/icons/${iconFile}`);
          }
        }
      }
    } catch {
      // Fallback gracefully to barrel import if lucide-react ESM layout changes
    }
    return map;
  }

  return {
    name: 'dev-lucide-direct-import',
    apply: 'serve',
    enforce: 'pre',
    async transform(code, id) {
      if (id.includes('node_modules') || !code.includes('lucide-react')) {
        return null;
      }
      if (!/\.(?:[cm]?tsx?|[cm]?jsx?)(?:\?.*)?$/.test(id)) {
        return null;
      }
      if (!iconMapPromise) {
        iconMapPromise = loadLucideIconMap();
      }
      const iconMap = await iconMapPromise;
      if (iconMap.size === 0) return null;

      let changed = false;
      const rewritten = code.replace(
        /import\s*(type\s+)?\{([^}]+)\}\s*from\s*['"]lucide-react['"]\s*;?/g,
        (fullMatch, isTypeOnly: string | undefined, specifiersBlock: string) => {
          if (isTypeOnly) return fullMatch;
          const directLines: string[] = [];
          const fallbackSpecifiers: string[] = [];

          for (const rawSpec of specifiersBlock.split(',')) {
            const spec = rawSpec.trim();
            if (!spec) continue;
            if (/^type\s+/.test(spec)) {
              fallbackSpecifiers.push(spec);
              continue;
            }
            const asMatch = spec.match(/^([A-Za-z0-9_$]+)(?:\s+as\s+([A-Za-z0-9_$]+))?$/);
            if (!asMatch) {
              fallbackSpecifiers.push(spec);
              continue;
            }
            const importedName = asMatch[1];
            const localName = asMatch[2] || importedName;
            const directPath = iconMap.get(importedName);
            if (directPath) {
              directLines.push(`import ${localName} from '${directPath}';`);
            } else {
              fallbackSpecifiers.push(spec);
            }
          }

          if (directLines.length === 0) return fullMatch;
          changed = true;
          if (fallbackSpecifiers.length > 0) {
            directLines.push(`import { ${fallbackSpecifiers.join(', ')} } from 'lucide-react';`);
          }
          return directLines.join('\n');
        }
      );

      return changed ? { code: rewritten, map: null } : null;
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

function importFolderGuardPlugin(): Plugin {
  const importRoot = path.resolve(import.meta.dirname, 'import') + path.sep;
  return {
    name: 'import-folder-isolation-guard',
    resolveId(source, importer) {
      if (
        source.startsWith('/import/') ||
        source === '/import' ||
        source.startsWith('@/import/')
      ) {
        throw new Error(
          `Blocked import from protected /import/ folder ("${source}"). Reading is allowed, but executing or bundling /import/ requires explicit confirmation.`
        );
      }
      if (importer && source.startsWith('.')) {
        const resolved = path.resolve(path.dirname(importer), source);
        if (resolved.startsWith(importRoot)) {
          throw new Error(
            `Blocked import from protected /import/ folder ("${source}"). Reading is allowed, but executing or bundling /import/ requires explicit confirmation.`
          );
        }
      }
      return null;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || '';
        if (url === '/import' || url.startsWith('/import/')) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Forbidden: /import/ is read-only and cannot be served or executed without confirmation.');
          return;
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
      devLucideDirectImportPlugin(),
      devInlineSourcemapStripPlugin(),
      react(),
      tailwindcss(),
      importFolderGuardPlugin(),
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
          lang: 'en-US',
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
      entries: ['index.html'],
      exclude: ['lucide-react'],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-dev-runtime',
        'react/jsx-runtime',
        'fflate',
        'sql.js',
        'tesseract.js',
      ],
    },
    build: {
      target: ['es2018', 'chrome68', 'safari12', 'firefox63', 'edge79'],
      cssTarget: ['chrome68', 'safari12', 'firefox63', 'edge79'],
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-icons',
                test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-sql',
                test: /[\\/]node_modules[\\/]sql\.js[\\/]/,
                priority: 20,
              },
              {
                name: 'vendor-zip',
                test: /[\\/]node_modules[\\/]fflate[\\/]/,
                priority: 15,
              },
              {
                name: 'storage-sqlite',
                test: /[\\/]src[\\/]storage[\\/](webSqliteAdapter|opfsStorage|opfsTempStream)\.ts$/,
                includeDependenciesRecursively: false,
                priority: 14,
              },
              {
                name: 'storage-sync',
                test: /[\\/]src[\\/]storage[\\/](localSyncChannels|cloudAppFolderSync|passphraseCrypto)\.ts$/,
                includeDependenciesRecursively: false,
                priority: 13,
              },
              {
                name: 'core-backups',
                test: /[\\/]src[\\/]core[\\/](syncAndExports|backupVault)\.ts$/,
                includeDependenciesRecursively: false,
                priority: 12,
              },
              {
                name: 'core-domain',
                test: /[\\/]src[\\/]core[\\/](models|sampleData|geneticsEngine|pedigreeCalculator|dataHealthCheck)\.ts$/,
                includeDependenciesRecursively: false,
                priority: 11,
              },
              {
                name: 'improvement-registry',
                test: /[\\/]src[\\/]core[\\/]improvementRegistry\.ts$/,
                includeDependenciesRecursively: false,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    worker: {
      format: 'es' as const,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'import', 'import/**'],
      },
      // HMR, WebSocket server, and file watching are hardcoded disabled to prevent preview flickering,
      // mobile iframe reload loops, and AI Studio env-var prompts (production/Pages builds are unaffected).
      hmr: false,
      ws: false as const,
      watch: null,
    },
  };
});
