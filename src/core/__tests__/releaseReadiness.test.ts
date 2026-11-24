/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Release-readiness regression tests (`IMP-053`):
 * - Cross-file version sync (`package.json`, `public/version.json`, `upgradeGate.ts`, Android Gradle, Fastlane)
 * - Calendar-safe `Date.UTC` Excel serial date conversion
 * - Background freeze idle Web Worker termination (without interrupting active jobs)
 * - Master System Prompt governance & clean crash-era plan removal
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeFlexibleDateIso } from '../importers/archiveAndCsvUtils';
import {
  CURRENT_APP_VERSION,
  parseStatusManifestJson,
  parseVersionManifestJson,
} from '../upgradeGate';
import {
  notifyBackgroundTransition,
  notifyPageHide,
  resetBackgroundFreezeCoordinatorForTests,
} from '../../storage/backgroundFreezeCoordinator';
import {
  buildSupportBundleZipOffThread,
  resetArchiveWorkerForTests,
  terminateIdleArchiveWorker,
} from '../../storage/offThreadWorkerClient';
import { executeIdbWriteWithQuotaRecovery } from '../../storage/webSqliteAdapter';

const ROOT_DIR = process.cwd();

describe('IMP-053 release readiness — version sync, calendar math, worker freeze & prompt governance', () => {
  afterEach(() => {
    resetArchiveWorkerForTests();
    resetBackgroundFreezeCoordinatorForTests();
    vi.unstubAllGlobals();
  });

  it('keeps v0.1.0-alpha.2 synchronized across package.json, version.json, upgradeGate, Android Gradle & Fastlane', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')) as {
      version: string;
    };
    const versionJsonRaw = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, 'public/version.json'), 'utf8')
    ) as unknown;
    const statusJsonRaw = JSON.parse(
      fs.readFileSync(path.join(ROOT_DIR, 'public/status.json'), 'utf8')
    ) as unknown;
    const gradleSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'android-wrapper/app/build.gradle.kts'),
      'utf8'
    );
    const fastlaneChangelog = fs.readFileSync(
      path.join(ROOT_DIR, 'fastlane/metadata/android/en-US/changelogs/1.txt'),
      'utf8'
    );

    const parsedVersion = parseVersionManifestJson(versionJsonRaw);
    const parsedStatus = parseStatusManifestJson(statusJsonRaw);

    expect(parsedVersion).not.toBeNull();
    expect(parsedStatus).not.toBeNull();
    expect(parsedStatus?.allowUpdates).toBe(true);

    const gradleVersionMatch = gradleSrc.match(/versionName\s*=\s*"([^"]+)"/);
    expect(gradleVersionMatch?.[1]).toBe(pkg.version);
    expect(parsedVersion?.appVersion).toBe(pkg.version);
    expect(CURRENT_APP_VERSION).toBe(pkg.version);
    expect(pkg.version).toBe('0.1.0-alpha.2');
    expect(fastlaneChangelog).toContain(`v${pkg.version}`);
    expect(fastlaneChangelog.length).toBeLessThanOrEqual(500);
    expect((parsedVersion?.releaseNotes || '').length).toBeGreaterThan(20);
    expect((parsedVersion?.releaseNotes || '').length).toBeLessThanOrEqual(280);
  });

  it('decodes Excel serial dates cleanly via Date.UTC calendar arithmetic across leap years', () => {
    expect(normalizeFlexibleDateIso('45351')).toBe('2024-02-29');
    expect(normalizeFlexibleDateIso('45658')).toBe('2025-01-01');
    expect(normalizeFlexibleDateIso('46348.75')).toBe('2026-11-22');
  });

  it('terminates an idle archive Web Worker immediately on background hide / pagehide without killing in-flight jobs', async () => {
    const terminateSpy = vi.fn();
    const postedMessages: Array<{ id: string }> = [];
    let workerInstance: {
      onmessage: ((ev: { data: unknown }) => void) | null;
      onerror: ((ev: unknown) => void) | null;
      postMessage: (msg: { id: string }) => void;
      terminate: () => void;
    } | null = null;

    class MockWorker {
      onmessage: ((ev: { data: unknown }) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      constructor() {
        workerInstance = this;
      }
      postMessage(msg: { id: string }) {
        postedMessages.push(msg);
      }
      terminate() {
        terminateSpy();
      }
    }

    vi.stubGlobal('Worker', MockWorker);

    const pendingPromise = buildSupportBundleZipOffThread({
      entries: [],
      includeData: false,
      includePhotos: false,
      summary: {
        totalEntries: 0,
        errorCount: 0,
        memoryWarningCount: 0,
        crashCount: 0,
        oldestEntryIso: null,
        newestEntryIso: null,
        currentMemory: {
          usedHeapBytes: null,
          totalHeapBytes: null,
          heapLimitBytes: null,
          heapPercent: null,
          deviceMemoryGb: null,
        },
        config: {
          verboseEnabled: false,
          retentionDays: 7,
          supportEmail: 'support@example.invalid',
        },
        sessionId: 'test-session',
        userAgent: 'vitest',
        platformInfo: 'node',
      },
    });

    expect(workerInstance).not.toBeNull();
    const firstMsg = postedMessages[0];
    expect(firstMsg?.id).toBeTruthy();

    // While a job is active, background hide must NOT kill the worker mid-flight
    notifyBackgroundTransition('hidden');
    expect(terminateSpy).not.toHaveBeenCalled();
    expect(terminateIdleArchiveWorker()).toBe(false);

    // Resolve the job cleanly
    workerInstance!.onmessage?.({
      data: {
        id: firstMsg.id,
        ok: true,
        result: {
          bytes: new Uint8Array([80, 75, 5, 6]),
          filename: 'support.zip',
          logCount: 0,
          includedData: false,
          includedPhotos: false,
          animalCount: 0,
          photoCount: 0,
        },
      },
    });
    await pendingPromise;

    // Now that the worker is idle, pagehide terminates it immediately
    notifyPageHide();
    expect(terminateSpy).toHaveBeenCalledTimes(1);
    expect(terminateIdleArchiveWorker()).toBe(false);
  });

  it('enforces Master Prompt plan deletion & improvement logging rules and keeps crash-era plans removed', () => {
    const masterPrompt = fs.readFileSync(
      path.join(ROOT_DIR, 'prompts/master_system_prompt.md'),
      'utf8'
    );
    expect(masterPrompt).toContain('DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true');
    expect(masterPrompt).toContain('Plan Lifecycle (Delete on Wrap-Up)');
    expect(masterPrompt).toContain(
      'Mandatory Improvement Logging (`IMPROVEMENTS.md` & `src/core/improvementRegistry.ts`)'
    );

    const removedCrashPlans = [
      'docs/archive/post-import-hardening-plan.md',
      'docs/archive/import-implementation-plan.md',
      'docs/archive/harden-canvas-photo-ios-exports.md',
      'docs/archive/reduce-eager-heap-weight.md',
      'docs/archive/import-working-diff.md',
      'docs/archive/unlogged-import-prompts.md',
    ];
    for (const relPath of removedCrashPlans) {
      expect(fs.existsSync(path.join(ROOT_DIR, relPath))).toBe(false);
    }
    // AI Studio export dumps stay safely outside public/
    expect(fs.existsSync(path.join(ROOT_DIR, 'public/assets/aistudio'))).toBe(false);
  });

  it('IMP-062: purges caches and retries once on IndexedDB QuotaExceededError, surfacing friendly error on persistent quota exhaustion', async () => {
    const quotaErr = Object.assign(new Error('The quota has been exceeded.'), {
      name: 'QuotaExceededError',
    });

    let attempts = 0;
    const purgeSpy = vi.fn(async () => {});
    const recovered = await executeIdbWriteWithQuotaRecovery(async () => {
      attempts += 1;
      if (attempts === 1) throw quotaErr;
    }, purgeSpy);
    expect(recovered.retriedAfterQuotaPurge).toBe(true);
    expect(attempts).toBe(2);
    expect(purgeSpy).toHaveBeenCalledTimes(1);

    const purgeSpy2 = vi.fn(async () => {});
    await expect(
      executeIdbWriteWithQuotaRecovery(async () => {
        throw quotaErr;
      }, purgeSpy2)
    ).rejects.toThrow(/QuotaExceededError/);
    expect(purgeSpy2).toHaveBeenCalledTimes(1);

    const purgeSpy3 = vi.fn(async () => {});
    await expect(
      executeIdbWriteWithQuotaRecovery(async () => {
        throw new Error('Transient disk lock');
      }, purgeSpy3)
    ).rejects.toThrow('Transient disk lock');
    expect(purgeSpy3).not.toHaveBeenCalled();
  });

  it('IMP-062: keeps NODE_ENV=production scoped off npm install in build-android-apk.yml and disables cache on status.json in Android wrapper', () => {
    const apkWorkflow = fs.readFileSync(
      path.join(ROOT_DIR, '.github/workflows/build-android-apk.yml'),
      'utf8'
    );
    const installStepStart = apkWorkflow.indexOf('Install PWA dependencies');
    const buildStepStart = apkWorkflow.indexOf('Build production PWA bundle');
    expect(installStepStart).toBeGreaterThan(-1);
    expect(buildStepStart).toBeGreaterThan(installStepStart);
    const installStepBlock = apkWorkflow.slice(installStepStart, buildStepStart);
    const buildStepBlock = apkWorkflow.slice(buildStepStart, buildStepStart + 300);
    expect(installStepBlock).not.toContain('NODE_ENV: production');
    expect(buildStepBlock).toContain('NODE_ENV: production');

    const assetHandler = fs.readFileSync(
      path.join(
        ROOT_DIR,
        'android-wrapper/app/src/main/java/org/askkim/pedigree/wrapper/PedigreeAssetPathHandler.kt'
      ),
      'utf8'
    );
    expect(assetHandler).toContain('resolvedPath == "status.json"');
  });
});
