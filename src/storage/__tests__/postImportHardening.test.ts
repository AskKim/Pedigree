/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Regression & Hardening Tests for Post-Import Stability, Bootability, Loading Speed & Memory (IMP-052).
 */

import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { type BindParams } from 'sql.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sql.js/dist/sql-wasm.wasm?url', () => ({
  default: path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
}));

import {
  base64ToBytesPure,
  binaryToDataUrl,
  bytesToBase64Pure,
  bytesToUtf8String,
  dataUrlToBinary,
  utf8StringToBytes,
} from '../../core/binaryEncoding';
import { getOpenDialogCount, subscribeOpenDialogCount } from '../../utils/useAccessibleDialog';
import {
  OPFS_SCRATCHPAD_THRESHOLD_BYTES,
  shareTextFileOrDownload,
  shouldBypassOpfsForIosGesture,
} from '../../utils/webFileActions';
import { applySchemaMigrations, readSqliteUserVersion } from '../webSqliteAdapter';

const ORIGINAL_WINDOW = globalThis.window;
const ORIGINAL_NAVIGATOR = globalThis.navigator;
const ORIGINAL_DOCUMENT = globalThis.document;

function restoreGlobals() {
  Object.defineProperty(globalThis, 'window', {
    value: ORIGINAL_WINDOW,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: ORIGINAL_NAVIGATOR,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: ORIGINAL_DOCUMENT,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  restoreGlobals();
  vi.restoreAllMocks();
});

describe('IMP-052 — Atomic version-gated SQLite migrations', () => {
  it('skips all DDL work on steady-state v6 databases and runs only missing ALTER columns on legacy v0 tables', async () => {
    const SQL = await initSqlJs({
      locateFile: () => path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
      useOldExtensionFunctions: false,
    });

    // 1. Fresh DB migrates cleanly to schema v6 with zero throwing ALTER statements
    const db = new SQL.Database();
    try {
      expect(readSqliteUserVersion(db)).toBe(0);
      const runSpy = vi.spyOn(db, 'run');
      const migrated = applySchemaMigrations(db);
      expect(migrated).toBe(true);
      expect(readSqliteUserVersion(db)).toBeGreaterThanOrEqual(6);

      // On fresh DB, PEDIGREE_SQLITE_SCHEMA already defines every column, so zero ALTER statements should fire
      const alterCallsFresh = runSpy.mock.calls.filter(([sql]) =>
        String(sql).trim().startsWith('ALTER TABLE')
      );
      expect(alterCallsFresh).toHaveLength(0);

      // 2. Steady-state v6 boot returns false immediately with ZERO db.run calls
      runSpy.mockClear();
      const secondPass = applySchemaMigrations(db);
      expect(secondPass).toBe(false);
      expect(runSpy).not.toHaveBeenCalled();
    } finally {
      db.close();
    }

    // 3. Legacy v0 table missing start_date_iso receives ONLY the missing ALTER TABLE inside a transaction
    const legacyDb = new SQL.Database();
    try {
      legacyDb.run(`
        CREATE TABLE barn_tasks (
          id TEXT PRIMARY KEY,
          species TEXT NOT NULL DEFAULT 'Rabbit',
          title TEXT NOT NULL,
          due_date_iso TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'Care',
          priority TEXT NOT NULL DEFAULT 'Normal',
          completed INTEGER NOT NULL DEFAULT 0,
          notes TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT ''
        );
      `);
      const legacyRunSpy = vi.spyOn(legacyDb, 'run');
      expect(applySchemaMigrations(legacyDb)).toBe(true);
      expect(readSqliteUserVersion(legacyDb)).toBeGreaterThanOrEqual(6);

      const alterCallsLegacy = legacyRunSpy.mock.calls
        .map(([sql]) => String(sql))
        .filter((sql) => sql.trim().startsWith('ALTER TABLE'));
      expect(alterCallsLegacy).toEqual([
        "ALTER TABLE barn_tasks ADD COLUMN start_date_iso TEXT NOT NULL DEFAULT '';",
      ]);
      const beginCalls = legacyRunSpy.mock.calls.filter(([sql]) =>
        String(sql).includes('BEGIN TRANSACTION')
      );
      const commitCalls = legacyRunSpy.mock.calls.filter(([sql]) =>
        String(sql).includes('COMMIT')
      );
      expect(beginCalls.length).toBe(1);
      expect(commitCalls.length).toBe(1);
    } finally {
      legacyDb.close();
    }
  });

  it('rolls back atomically when a migration step throws mid-transaction', async () => {
    const SQL = await initSqlJs({
      locateFile: () => path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm'),
      useOldExtensionFunctions: false,
    });
    const db = new SQL.Database();
    try {
      const origRun = db.run.bind(db);
      let injectedFailure = false;
      vi.spyOn(db, 'run').mockImplementation((sql: string, params?: BindParams) => {
        if (!injectedFailure && String(sql).includes('PRAGMA user_version =')) {
          injectedFailure = true;
          throw new Error('Simulated disk error mid-migration');
        }
        return origRun(sql, params);
      });

      expect(() => applySchemaMigrations(db)).toThrow(/Simulated disk error/);
      expect(readSqliteUserVersion(db)).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe('IMP-052 — iOS standalone PWA gesture-safe export & share bypass', () => {
  it('bypasses OPFS /tmp staging for <512 KB payloads on installed iOS PWAs so navigator.share keeps user activation', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const getDirectoryMock = vi.fn().mockRejectedValue(new Error('OPFS should not be touched for small iOS share'));

    const mockNavigator = {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
      platform: 'iPhone',
      maxTouchPoints: 5,
      standalone: true,
      share: shareMock,
      canShare: () => true,
      storage: { getDirectory: getDirectoryMock },
    };

    Object.defineProperty(globalThis, 'window', {
      value: {
        navigator: mockNavigator,
        matchMedia: (q: string) => ({ matches: q.includes('standalone') }),
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: mockNavigator,
      configurable: true,
      writable: true,
    });

    expect(shouldBypassOpfsForIosGesture('small payload')).toBe(true);
    expect(shouldBypassOpfsForIosGesture(new Uint8Array(OPFS_SCRATCHPAD_THRESHOLD_BYTES + 1024))).toBe(false);

    const outcome = await shareTextFileOrDownload({
      filename: 'pedigree-card.htm',
      content: '<html><body>Pedigree</body></html>',
      mimeType: 'text/html',
      title: 'Pedigree Card',
    });

    expect(outcome).toBe('shared');
    expect(shareMock).toHaveBeenCalledTimes(1);
    expect(getDirectoryMock).not.toHaveBeenCalled();
  });

  it('keeps OPFS staging active on non-iOS browsers', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia: () => ({ matches: false }) },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0',
        platform: 'Linux x86_64',
        maxTouchPoints: 0,
      },
      configurable: true,
      writable: true,
    });

    expect(shouldBypassOpfsForIosGesture('small payload')).toBe(false);
  });
});

describe('IMP-052 — Pure binaryEncoding helpers, dialog counter, and index.html bootability', () => {
  it('round-trips UTF-8, base64, and raster data URLs with zero DOM or fflate dependencies', () => {
    const sample = 'Copper Creek Barn — Doe #42 🐇';
    const bytes = utf8StringToBytes(sample);
    expect(bytesToUtf8String(bytes)).toBe(sample);

    const b64 = bytesToBase64Pure(bytes);
    expect(bytesToUtf8String(base64ToBytesPure(b64))).toBe(sample);

    const dataUrl = binaryToDataUrl('image/png', new Uint8Array([137, 80, 78, 71]));
    const parsed = dataUrlToBinary(dataUrl);
    expect(parsed?.mimeType).toBe('image/png');
    expect(Array.from(parsed?.bytes ?? [])).toEqual([137, 80, 78, 71]);
  });

  it('notifies subscribers immediately with current open dialog count and unsubscribes cleanly', () => {
    const seen: number[] = [];
    const unsubscribe = subscribeOpenDialogCount((count) => seen.push(count));
    expect(getOpenDialogCount()).toBe(0);
    expect(seen).toEqual([0]);
    unsubscribe();
  });

  it('keeps indexedDB advisory in index.html preflight and loads Google Fonts asynchronously', () => {
    const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('indexedDbAvailable');
    expect(html).not.toMatch(/missingCritical\.push\(['"]IndexedDB['"]\)/);
    expect(html).toContain('media="print"');
    expect(html).toContain("this.media='all'");
    expect(fs.existsSync(path.resolve(process.cwd(), '.env.example'))).toBe(true);
  });
});
