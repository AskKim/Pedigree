/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular Layer Architecture & Alpha 3 Scaffold Tests (`src/domain/__tests__/modularLayerArchitecture.test.ts`).
 *
 * Verifies:
 * - Path aliases (@engine/*, @features/*, @app/*) and interface definitions
 * - Storage adapter interface and platform bridge contracts
 * - iOS native bridge storage requirement contract
 * - Feature module isolation contract and application configuration layer
 * - Verification of ROADMAP.md and AGENTS.md compliance with governance requirements
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IStorageAdapter, StorageCapabilities } from '@engine/storage';
import type { IPlatformBridge, PlatformCapabilities } from '@engine/bridge';
import {
  assessGenericBrowserCompatibility,
  buildPrefixedTokenNames,
  buildQueryDeepLink,
  classifyGenericDeviceCapability,
  computeCollectionSetImpact,
  createGenericExporterRegistry,
  createGenericImporterRegistry,
  createGenericOutboxOperation,
  decodeGenericP2pSignalToken,
  encodeGenericP2pSignalToken,
  encodeQrMatrix,
  evaluateGenericWorkloadForTier,
  extractPdfDocumentPages,
  getGenericHeavyZipExportGate,
  parseQueryDeepLinkParams,
  renderQrSvg,
  resolveSemanticThemeCssVariables,
  tryExtractGenericEncryptedEnvelopeFromZip,
  wrapGenericEncryptedZip,
} from '@engine/primitives';
import type { IFeatureModule } from '@features';
import type { IAppConfiguration } from '@app';
import {
  buildPedigreeRecordDeepLink,
  decodePedigreeP2pSignal,
  encodePedigreeP2pSignal,
  extractPedigreeEncryptedEnvelopeFromZip,
  PEDIGREE_ENCRYPTED_ENVELOPE_FORMAT,
  renderPedigreeQrSvg,
  wrapPedigreeEncryptedZip,
} from '@app/pedigreeAppWiring';
import { BOOT_ENTRY_LOCK_CHECKSUMS } from '../improvementRegistry';

const ROOT_DIR = process.cwd();

describe('Alpha 3 Modular Scaffold & Three-Layer Architecture Contracts', () => {
  it('instantiates and validates a content-agnostic IStorageAdapter mock implementation', async () => {
    const memoryStore = new Map<string, Uint8Array | string>();

    const mockCapabilities: StorageCapabilities = {
      driver: 'memory',
      isPersistent: false,
      supportsBinary: true,
      supportsTransactions: true,
      supportsQuerying: false,
      supportsStreaming: false,
    };

    const mockStorageAdapter: IStorageAdapter = {
      name: 'test-memory-adapter',
      capabilities: mockCapabilities,
      async isSupported() {
        return true;
      },
      async initialize() {
        memoryStore.clear();
      },
      async getItem(key: string) {
        return memoryStore.get(key) ?? null;
      },
      async setItem(key: string, value: Uint8Array | string) {
        memoryStore.set(key, value);
      },
      async removeItem(key: string) {
        memoryStore.delete(key);
      },
      async clear() {
        memoryStore.clear();
      },
      async keys(filter) {
        let keys = Array.from(memoryStore.keys());
        if (filter?.prefix) {
          keys = keys.filter((k) => k.startsWith(filter.prefix!));
        }
        return keys;
      },
      async hasItem(key: string) {
        return memoryStore.has(key);
      },
      async getQuotaInfo() {
        return {
          bytesUsed: memoryStore.size * 64,
          bytesAvailable: 1024 * 1024 * 100,
        };
      },
    };

    expect(await mockStorageAdapter.isSupported()).toBe(true);
    await mockStorageAdapter.initialize();
    await mockStorageAdapter.setItem('config:theme', 'dark');
    expect(await mockStorageAdapter.getItem('config:theme')).toBe('dark');
    expect(await mockStorageAdapter.hasItem('config:theme')).toBe(true);
    expect(await mockStorageAdapter.keys({ prefix: 'config:' })).toEqual(['config:theme']);
    await mockStorageAdapter.removeItem('config:theme');
    expect(await mockStorageAdapter.getItem('config:theme')).toBeNull();
  });

  it('validates IPlatformBridge capability contract and iOS native storage routing requirement', async () => {
    const iosCapabilities: PlatformCapabilities = {
      shell: 'ios-wkwebview',
      hasNativeBridge: true,
      hasPersistentStorage: true,
      requiresIosStorageBridge: true,
      supportsOpfs: false,
      supportsIndexedDb: true,
      supportsWebSqlite: true,
      supportsWebWorkers: true,
      canPrintDirect: true,
      canShareBinary: true,
      canAccessFileSystem: false,
      hasHardwareBackNavigation: false,
      hasNfc: false,
    };

    const mockBridge: IPlatformBridge = {
      shellType: 'ios-wkwebview',
      async detectCapabilities() {
        return iosCapabilities;
      },
      getCapabilities() {
        return iosCapabilities;
      },
      async exportBinary() {
        return { ok: true, handledBy: 'native-ios' };
      },
      async printDocument() {
        return true;
      },
      registerBackHandler() {
        return () => {};
      },
      async invokeStorageBridge(op) {
        return { ok: true, data: { actionExecuted: op.action } };
      },
      logDiagnostic() {},
    };

    const caps = await mockBridge.detectCapabilities();
    expect(caps.shell).toBe('ios-wkwebview');
    expect(caps.requiresIosStorageBridge).toBe(true);
    expect(mockBridge.invokeStorageBridge).toBeDefined();

    const opResult = await mockBridge.invokeStorageBridge!({
      action: 'vaultSnapshot',
      key: 'test-backup',
    });
    expect(opResult.ok).toBe(true);
  });

  it('validates IFeatureModule interface and lifecycle contract', async () => {
    let initialized = false;

    const mockFeature: IFeatureModule<{ theme: string }, { ready: boolean }> = {
      metadata: {
        id: 'mock-sample-feature',
        name: 'Mock Sample Feature',
        version: '1.0.0',
        description: 'Test feature module ensuring no cross-feature coupling',
      },
      async initialize(context) {
        expect(context.config?.theme).toBe('emerald');
        initialized = true;
      },
      getStateSnapshot() {
        return { ready: initialized };
      },
    };

    expect(mockFeature.metadata.id).toBe('mock-sample-feature');
    await mockFeature.initialize({ config: { theme: 'emerald' } });
    expect(mockFeature.getStateSnapshot?.().ready).toBe(true);
  });

  it('validates IAppConfiguration application layer wiring interface', () => {
    const appConfig: IAppConfiguration = {
      metadata: {
        appId: 'community-pedigree',
        appName: 'Community Pedigree',
        appVersion: '0.1.0-alpha.3',
        description: 'Multi-species offline registry',
        copyrightNotice: 'Copyright (c) 2026',
        defaultLocale: 'en-US',
      },
      activeSpeciesId: 'rabbit',
      supportedSpecies: ['rabbit', 'goat', 'sheep', 'cavy'],
      terminology: {
        rabbit: {
          singularAnimal: 'Rabbit',
          pluralAnimal: 'Rabbits',
          sireLabel: 'Buck',
          damLabel: 'Doe',
          offspringGroupLabel: 'Litter',
          birthEventLabel: 'Kindling',
          identificationLabel: 'Tattoo',
        },
      },
      features: [
        { featureId: 'pedigree-tree', enabled: true },
        { featureId: 'breeding-planner', enabled: true },
      ],
    };

    expect(appConfig.metadata.appVersion).toBe('0.1.0-alpha.3');
    expect(appConfig.terminology.rabbit.sireLabel).toBe('Buck');
    expect(appConfig.features.length).toBe(2);
  });

  it('verifies ROADMAP.md contains all required sections and governance policies', () => {
    const roadmapPath = path.join(ROOT_DIR, 'ROADMAP.md');
    expect(fs.existsSync(roadmapPath)).toBe(true);
    const content = fs.readFileSync(roadmapPath, 'utf8');

    // Milestone status
    expect(content).toContain('Alpha 2');
    expect(content).toContain('Released');
    expect(content).toContain('Alpha 3');

    // Alpha 3 active goals
    expect(content.toLowerCase()).toContain('modularity');
    expect(content.toLowerCase()).toContain('shared animal profile contract');
    expect(content.toLowerCase()).toContain('csv');
    expect(content.toLowerCase()).toContain('scaffold');

    // Branching strategy & separate apps
    expect(content).toContain('ask-kim/pedigree');
    expect(content.toLowerCase()).toContain('dedicated branch');
    expect(content.toLowerCase()).toContain('separate repositories');

    // Framework extraction
    expect(content.toLowerCase()).toContain('framework extraction');

    // Explicit guardrails against unrequested rewrites
    expect(content).toMatch(/guardrail/i);
    expect(content).toMatch(/rewrite/i);
  });

  it('verifies AGENTS.md adheres to Title Case headings and core invariants', () => {
    const agentsPath = path.join(ROOT_DIR, 'AGENTS.md');
    expect(fs.existsSync(agentsPath)).toBe(true);
    const content = fs.readFileSync(agentsPath, 'utf8');

    // Required invariant strings for improvement registry
    expect(content).toContain('Never Convert PWA Away From React');
    expect(content).toContain('Core PWA MUST Always Stay in React');
    expect(content).toContain('NEVER recode the site in Kotlin');

    // Three layer boundary definitions
    expect(content.toLowerCase()).toContain('three-layer');
    expect(content).toContain('@engine/*');
    expect(content).toContain('@features/*');
    expect(content).toContain('@app/*');

    // iOS native bridge storage rule
    expect(content).toMatch(/iOS/i);
    expect(content.toLowerCase()).toContain('eviction');
    expect(content.toLowerCase()).toContain('native bridge');

    // Heading Title Case verification
    const headingLines = content.split('\n').filter((l) => /^#{1,4}\s/.test(l));
    expect(headingLines.length).toBeGreaterThan(5);

    // Verify acronyms are preserved uppercase in headings
    const acronymMatches = headingLines.filter((h) =>
      /PWA|SQLite|WASM|OPFS|NFC|APK|API|CSV|JSON|iOS/.test(h)
    );
    expect(acronymMatches.length).toBeGreaterThanOrEqual(2);
  });
});

function walkNonTestTsFiles(relDir: string): string[] {
  const absDir = path.join(ROOT_DIR, relDir);
  if (!fs.existsSync(absDir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const childRel = path.posix.join(relDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      results.push(...walkNonTestTsFiles(childRel));
    } else if (
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.test\.(ts|tsx)$/.test(entry.name)
    ) {
      results.push(childRel);
    }
  }
  return results.sort();
}

const DOMAIN_TERM_SCANNER_RE =
  /\b(pedigree|livestock|animal|rabbit|goat|sheep|cattle|herd|litter|tattoo|eartag|ear_tag|sire|dam|buck|doe|barn|kindling|kindled|breeder|breeding|fleece|wool)\b/i;

const EXTRACTABLE_CORE_FILES: readonly string[] = Array.from(
  new Set([
    'src/engine/index.ts',
    'src/engine/binaryEncoding.ts',
    'src/engine/codecs/archiveAndCsvUtils.ts',
    ...walkNonTestTsFiles('src/engine/primitives'),
    ...walkNonTestTsFiles('src/engine/codecs'),
    ...walkNonTestTsFiles('src/engine/sync'),
    ...walkNonTestTsFiles('src/engine/bridge'),
    ...walkNonTestTsFiles('src/engine/storage'),
  ])
).sort();

const PURE_ZERO_DOM_CORE_FILES: readonly string[] = Array.from(
  new Set([
    'src/engine/binaryEncoding.ts',
    'src/engine/codecs/archiveAndCsvUtils.ts',
    ...walkNonTestTsFiles('src/engine/primitives'),
    ...walkNonTestTsFiles('src/engine/codecs'),
    ...walkNonTestTsFiles('src/engine/sync'),
  ])
).sort();

const PURE_EXTRACTABLE_UI_UTILS: readonly string[] = walkNonTestTsFiles('src/utils');

describe('NEON Phases 1–2: Boot-Entry Lock, Inventory Coverage & Shared Primitive Boundaries', () => {
  it('enforces immutable boot-entry SHA-256 lock checksums for src/main.tsx, src/App.tsx, and index.html', () => {
    const lockedEntries = Object.entries(BOOT_ENTRY_LOCK_CHECKSUMS);
    expect(lockedEntries.length).toBeGreaterThanOrEqual(3);
    for (const [relPath, expectedSha256] of lockedEntries) {
      const absPath = path.join(ROOT_DIR, relPath);
      expect(fs.existsSync(absPath)).toBe(true);
      const actualSha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(absPath))
        .digest('hex');
      expect(actualSha256, `Boot-locked file ${relPath} was modified unexpectedly`).toBe(
        expectedSha256
      );
    }
  });

  it('verifies 100% non-test file coverage in EXTRACTION_INVENTORY.md across core, features, app, storage, and utils', () => {
    const inventoryText = fs.readFileSync(path.join(ROOT_DIR, 'EXTRACTION_INVENTORY.md'), 'utf8');
    expect(inventoryText).toContain('FLASH_HYGIENE_PLAN.md');

    const trackedDirs = ['src/engine', 'src/domain', 'src/features', 'src/app', 'src/storage', 'src/utils'];
    const allFiles = trackedDirs.flatMap((dir) => walkNonTestTsFiles(dir));
    expect(allFiles.length).toBeGreaterThanOrEqual(140);

    const missing: string[] = [];
    for (const relPath of allFiles) {
      const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const taggedLineRe = new RegExp(
        `\`${escaped}\`[^\\n]*(extractable-core|extractable-feature|extractable-ui-util|pedigree-domain)`
      );
      if (!taggedLineRe.test(inventoryText)) {
        missing.push(relPath);
      }
    }
    expect(missing).toEqual([]);
  });

  it('verifies zero /import/ references in src/ and scripts/ plus read-only config parity', () => {
    const codeFiles = [...walkNonTestTsFiles('src'), ...walkNonTestTsFiles('scripts')];
    const offending: string[] = [];
    for (const relPath of codeFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      if (/from\s+['"][^'"]*\/import\/|import\(\s*['"][^'"]*\/import\//.test(content)) {
        offending.push(relPath);
      }
    }
    expect(offending).toEqual([]);

    const tsconfig = fs.readFileSync(path.join(ROOT_DIR, 'tsconfig.json'), 'utf8');
    const viteConfig = fs.readFileSync(path.join(ROOT_DIR, 'vite.config.ts'), 'utf8');
    const vitestConfig = fs.readFileSync(path.join(ROOT_DIR, 'vitest.config.ts'), 'utf8');
    expect(tsconfig).toContain('"ES2018"');
    expect(tsconfig).toContain('"import"');
    expect(viteConfig).toContain('importFolderGuardPlugin');
    expect(viteConfig).toContain("'es2018'");
    expect(vitestConfig).toContain("'import/**'");
  });

  it('enforces zero domain terms across all extractable-core, extractable-feature, and pure UI utility files', () => {
    const featureFiles = walkNonTestTsFiles('src/features');
    const auditedFiles = [
      ...EXTRACTABLE_CORE_FILES,
      ...featureFiles,
      ...PURE_EXTRACTABLE_UI_UTILS,
    ];

    const violations: string[] = [];
    for (const relPath of auditedFiles) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      const match = content.match(DOMAIN_TERM_SCANNER_RE);
      if (match) {
        violations.push(`${relPath}: matched "${match[0]}"`);
      }
    }
    expect(violations).toEqual([]);

    const lazyRouteContent = fs.readFileSync(
      path.join(ROOT_DIR, 'src/utils/lazyRoute.tsx'),
      'utf8'
    );
    expect(lazyRouteContent).toContain('export function configureLazyRouteDefaults');
    expect(lazyRouteContent).not.toMatch(/saved (?:offline )?herd database/i);
    expect(lazyRouteContent).not.toContain('Back to All Species');
  });

  it('enforces strict import direction and zero DOM/Node built-ins in pure core primitives and features', () => {
    const importViolations: string[] = [];

    for (const relPath of EXTRACTABLE_CORE_FILES) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      if (
        /from\s+['"](?:@features|@app|\.\.\/(?:\.\.\/)?(?:features|app|components|hooks|storage))/.test(
          content
        )
      ) {
        importViolations.push(`${relPath}: forbidden upward/domain import`);
      }
      if (/from\s+['"]node:/.test(content)) {
        importViolations.push(`${relPath}: forbidden Node built-in import`);
      }
    }

    for (const relPath of PURE_ZERO_DOM_CORE_FILES) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      if (/\b(?:window|document)\./.test(content)) {
        importViolations.push(`${relPath}: forbidden DOM access in pure core module`);
      }
    }

    const featureFiles = walkNonTestTsFiles('src/features');
    for (const relPath of featureFiles) {
      const parts = relPath.split('/');
      const currentFeature = parts.length >= 4 ? parts[2] : null;
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      if (/from\s+['"](?:@app|\.\.\/(?:\.\.\/)?(?:app|components|hooks|storage))/.test(content)) {
        importViolations.push(`${relPath}: forbidden @app/UI/legacy-storage import in feature`);
      }
      const featureImportRe = /from\s+['"]@features\/([^/'"]+)/g;
      let m: RegExpExecArray | null;
      while ((m = featureImportRe.exec(content)) !== null) {
        if (currentFeature && m[1] !== currentFeature) {
          importViolations.push(`${relPath}: forbidden cross-feature import @features/${m[1]}`);
        }
      }
      const relativeSiblingRe = /from\s+['"]\.\.\/([^/'"]+)/g;
      while ((m = relativeSiblingRe.exec(content)) !== null) {
        if (
          currentFeature &&
          m[1] !== currentFeature &&
          m[1] !== 'featureModule.interface' &&
          m[1] !== 'featureModule.interface.ts'
        ) {
          importViolations.push(`${relPath}: forbidden relative cross-feature import ../${m[1]}`);
        }
      }
    }

    // Extractable UI utilities (`src/utils/*`) must not import from legacy `src/storage/*`, `@app/*`, `@features/*`, components, hooks, or domain `src/domain/*`
    for (const relPath of PURE_EXTRACTABLE_UI_UTILS) {
      const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
      if (
        /from\s+['"](?:@app|@features|\.\.\/(?:storage|app|features|components|hooks|native))/.test(
          content
        )
      ) {
        importViolations.push(`${relPath}: forbidden storage/app/feature/UI import in extractable util`);
      }
      const coreImportRe = /from\s+['"](?:@engine|\.\.\/core)\/([^'"]+)['"]/g;
      let cm: RegExpExecArray | null;
      while ((cm = coreImportRe.exec(content)) !== null) {
        const sub = cm[1];
        const allowed =
          sub === 'primitives' ||
          sub.startsWith('primitives/') ||
          sub === 'bridge' ||
          sub.startsWith('bridge/') ||
          sub === 'storage' ||
          sub.startsWith('storage/') ||
          sub === 'binaryEncoding' ||
          sub === 'binaryEncoding.ts';
        if (!allowed) {
          importViolations.push(`${relPath}: forbidden domain core import "${sub}" in extractable util`);
        }
      }
    }

    // Components, utils, and storage must not bypass IPlatformBridge with concrete pedigreeBridge imports
    const decoupledBridgeDirs = ['src/components', 'src/utils', 'src/storage'];
    for (const dir of decoupledBridgeDirs) {
      for (const relPath of walkNonTestTsFiles(dir)) {
        const content = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
        if (/from\s+['"][^'"]*native\/pedigreeBridge['"]/.test(content)) {
          importViolations.push(`${relPath}: forbidden concrete pedigreeBridge import (use IPlatformBridge)`);
        }
      }
    }

    expect(importViolations).toEqual([]);
  });

  it('enforces zero circular dependencies across core, features, app, utils, and storage', () => {
    const dirs = ['src/domain', 'src/features', 'src/app', 'src/utils', 'src/storage'];
    const files = dirs.flatMap((d) => walkNonTestTsFiles(d)).map((rel) => path.join(ROOT_DIR, rel));
    const adj = new Map<string, string[]>();

    for (const absFile of files) {
      const content = fs.readFileSync(absFile, 'utf8');
      const deps: string[] = [];
      const re = /(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s+['"]([^'"]+)['"]/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(content)) !== null) {
        const spec = match[1];
        let target: string | null = null;
        if (spec.startsWith('@engine/')) target = path.join(ROOT_DIR, 'src/domain', spec.slice(6));
        else if (spec === '@engine') target = path.join(ROOT_DIR, 'src/domain/index');
        else if (spec.startsWith('@features/')) target = path.join(ROOT_DIR, 'src/features', spec.slice(10));
        else if (spec === '@features') target = path.join(ROOT_DIR, 'src/features/index');
        else if (spec.startsWith('@app/')) target = path.join(ROOT_DIR, 'src/app', spec.slice(5));
        else if (spec === '@app') target = path.join(ROOT_DIR, 'src/app/index');
        else if (spec.startsWith('.')) target = path.resolve(path.dirname(absFile), spec);

        if (target) {
          for (const cand of [
            target,
            `${target}.ts`,
            `${target}.tsx`,
            path.join(target, 'index.ts'),
            path.join(target, 'index.tsx'),
          ]) {
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
              deps.push(cand);
              break;
            }
          }
        }
      }
      adj.set(absFile, deps);
    }

    const state = new Map<string, 1 | 2>();
    const stack: string[] = [];
    const cycles: string[] = [];

    const dfs = (node: string) => {
      state.set(node, 1);
      stack.push(node);
      for (const next of adj.get(node) ?? []) {
        if (state.get(next) === 1) {
          const idx = stack.indexOf(next);
          const cycle = stack
            .slice(idx)
            .concat(next)
            .map((p) => path.relative(ROOT_DIR, p).replace(/\\/g, '/'));
          cycles.push(cycle.join(' -> '));
        } else if (!state.get(next) && adj.has(next)) {
          dfs(next);
        }
      }
      stack.pop();
      state.set(node, 2);
    };

    for (const file of files) {
      if (!state.get(file)) dfs(file);
    }

    expect(cycles).toEqual([]);
  });

  it('exercises pure @engine/primitives engines and @app/pedigreeAppWiring factories cleanly', () => {
    // 1. QR matrix + SVG + deep link round-trip
    const matrix = encodeQrMatrix('https://example.org/?id=123');
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    const svg = renderQrSvg('https://example.org/?id=123', { ariaLabel: 'Generic QR' });
    expect(svg).toContain('<svg');
    const url = buildQueryDeepLink('https://example.org/app#frag', [
      ['view', 'detail'],
      ['id', 'rec-42'],
    ]);
    expect(url).toBe('https://example.org/app?view=detail&id=rec-42');
    const parsedParams = parseQueryDeepLinkParams(url.split('?')[1]);
    expect(parsedParams.get('id')).toBe('rec-42');

    // 2. Semantic theme color tokens
    const tokens = buildPrefixedTokenNames('--app');
    const vars = resolveSemanticThemeCssVariables('light', undefined, { tokenNames: tokens });
    expect(vars[tokens.primary]).toMatch(/^#[0-9A-Fa-f]{6}$/);

    // 3. Generic sync outbox + P2P signal token + collection set impact
    const op = createGenericOutboxOperation({
      entityType: 'record',
      entityUuid: 'rec-1',
      deviceId: 'dev-a',
      logicalCounter: 1,
      fieldName: 'title',
      newValue: 'Sample',
    });
    expect(op.entity_type).toBe('record');
    const token = encodeGenericP2pSignalToken(
      { v: 1, type: 'offer', deviceId: 'dev-a', sdp: 'v=0', createdAtIso: '2026-11-24T00:00:00Z' },
      'CORE-P2P:'
    );
    const decoded = decodeGenericP2pSignalToken(token, 'CORE-P2P:');
    expect(decoded.deviceId).toBe('dev-a');
    const impact = computeCollectionSetImpact(['a', 'b'], ['b', 'c']);
    expect(impact).toEqual({
      incomingCount: 2,
      currentCount: 2,
      newIncomingCount: 1,
      matchedExistingCount: 1,
      currentOnlyCount: 1,
      netDelta: 0,
    });

    // 4. Generic exporter & importer registries
    const exporterReg = createGenericExporterRegistry<
      { payload: string },
      {
        readonly id: string;
        readonly name: string;
        readonly formatExtension: string;
        readonly category: string;
        readonly targetPlatform: string;
        readonly scopeMode: string;
        readonly description: string;
        readonly compatibilityNote: string;
        readonly status: 'ready';
        exportPayload: (context: { payload: string }) => {
          exporterId: string;
          filename: string;
          mimeType: string;
          content: string;
          recordCount: number;
          summary: string;
          warnings: string[];
        };
      }
    >([
      {
        id: 'json-export',
        name: 'JSON Export',
        formatExtension: '.json',
        category: 'portable',
        targetPlatform: 'Universal',
        scopeMode: 'all',
        description: 'Generic JSON export',
        compatibilityNote: 'Standard RFC 8259 JSON',
        status: 'ready',
        exportPayload: (ctx) => ({
          exporterId: 'json-export',
          filename: 'out.json',
          mimeType: 'application/json',
          content: ctx.payload,
          recordCount: 1,
          summary: 'ok',
          warnings: [],
        }),
      },
    ]);
    expect(exporterReg.run('json-export', { payload: '{}' }).filename).toBe('out.json');

    const importerReg = createGenericImporterRegistry([
      {
        id: 'txt-import',
        name: 'Text Import',
      },
    ]);
    expect(importerReg.importers.length).toBe(1);
    expect(importerReg.getById('txt-import').id).toBe('txt-import');

    // 5. Generic device capability & heavy ZIP gate
    const assessment = classifyGenericDeviceCapability({
      deviceMemoryGb: 1,
      hardwareConcurrency: 2,
      jsHeapLimitBytes: 256 * 1024 * 1024,
      usedHeapBytes: null,
      userAgent: 'Mozilla/5.0 (Linux; Android 9; Mobile) Chrome/90.0',
      maxTouchPoints: 5,
      coarsePointer: true,
      screenWidthPx: 360,
      screenHeightPx: 640,
      devicePixelRatio: 2,
    });
    expect(assessment.tier).toBe(1);
    const workload = evaluateGenericWorkloadForTier(5000, assessment);
    expect(workload.status).toBe('over_limit');
    const compat = assessGenericBrowserCompatibility(
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 9; Mobile) Chrome/90.0',
        promiseSupported: true,
        indexedDbSupported: true,
        wasmSupported: false,
        moduleWorkerSupported: false,
        opfsSupported: false,
        directoryPickerSupported: false,
        persistStorageSupported: false,
        clipboardWriteSupported: false,
        webShareFilesSupported: false,
        webpEncodeSupported: false,
        createImageBitmapSupported: false,
      },
      assessment.tier
    );
    const gate = getGenericHeavyZipExportGate(assessment, compat);
    expect(gate.requiresConfirmation).toBe(true);

    // 6. Pure PDF document extractor sanity check
    const emptyPdfRes = extractPdfDocumentPages(new Uint8Array([0, 1, 2, 3]));
    expect(emptyPdfRes.ok).toBe(false);

    // 7. Encrypted ZIP wrap & extract + Pedigree app wiring
    const sampleEnvelope = {
      format: PEDIGREE_ENCRYPTED_ENVELOPE_FORMAT,
      cipher: 'AES-256-GCM' as const,
      kdf: 'PBKDF2-SHA256' as const,
      iterations: 100_000,
      saltBase64: 'c2FsdA==',
      ivBase64: 'aXY=',
      payloadKind: 'backup-json',
      originalFileName: 'backup.json',
      createdAtIso: '2026-11-24T00:00:00Z',
      ciphertextBase64: 'Y2lwaGVy',
    };
    const genericZip = wrapGenericEncryptedZip({ envelope: sampleEnvelope });
    expect(
      tryExtractGenericEncryptedEnvelopeFromZip(genericZip, {
        expectedFormat: PEDIGREE_ENCRYPTED_ENVELOPE_FORMAT,
      })?.ciphertextBase64
    ).toBe('Y2lwaGVy');

    const pedigreeZip = wrapPedigreeEncryptedZip(sampleEnvelope);
    expect(extractPedigreeEncryptedEnvelopeFromZip(pedigreeZip)?.format).toBe(
      PEDIGREE_ENCRYPTED_ENVELOPE_FORMAT
    );

    const p2pTok = encodePedigreeP2pSignal({
      v: 1,
      type: 'answer',
      deviceId: 'barn-tablet',
      sdp: 'v=0',
      createdAtIso: '2026-11-24T00:00:00Z',
    });
    expect(decodePedigreeP2pSignal(p2pTok).deviceId).toBe('barn-tablet');
    expect(
      buildPedigreeRecordDeepLink({
        baseUrl: 'https://askkim.github.io/Pedigree/',
        animalId: 'a-1',
        species: 'Rabbit',
      })
    ).toContain('animal=a-1');
    expect(renderPedigreeQrSvg('https://askkim.github.io/Pedigree/')).toContain(
      'Community Pedigree QR code'
    );
  });

  it('routes createPedigreeDomainStorageAdapter through NativeBridgeStorageAdapter on ios-wkwebview', async () => {
    const { createPedigreeDomainStorageAdapter } = await import('@app/pedigreeAppWiring');
    const iosCaps: PlatformCapabilities = {
      shell: 'ios-wkwebview',
      hasNativeBridge: true,
      hasPersistentStorage: true,
      requiresIosStorageBridge: true,
      supportsOpfs: false,
      supportsIndexedDb: true,
      supportsWebSqlite: true,
      supportsWebWorkers: true,
      canPrintDirect: true,
      canShareBinary: true,
      canAccessFileSystem: false,
      hasHardwareBackNavigation: false,
      hasNfc: false,
    };
    const iosBridge: IPlatformBridge = {
      shellType: 'ios-wkwebview',
      async detectCapabilities() {
        return iosCaps;
      },
      getCapabilities() {
        return iosCaps;
      },
      async exportBinary() {
        return { ok: true, handledBy: 'native-ios' };
      },
      async printDocument() {
        return true;
      },
      registerBackHandler() {
        return () => {};
      },
      async invokeStorageBridge() {
        return { ok: true, data: null };
      },
      logDiagnostic() {},
    };
    const domainAdapter = createPedigreeDomainStorageAdapter({ bridge: iosBridge });
    expect(domainAdapter.engineName).toContain('native-bridge(ios-wkwebview)');
  });
});

