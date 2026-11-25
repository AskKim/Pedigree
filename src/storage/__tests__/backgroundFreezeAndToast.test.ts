/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BackgroundPausedError,
  clearPausedBackgroundJob,
  getPausedBackgroundJobs,
  notifyBackgroundTransition,
  registerFreezeLifecycleListener,
  registerPausedBackgroundJob,
  resetBackgroundFreezeCoordinatorForTests,
} from '../backgroundFreezeCoordinator';
import {
  clearEmergencySessionTrace,
  DiagnosticLogEntry,
  emitAsyncErrorToast,
  getActiveAsyncErrorToasts,
  handleUnhandledRejectionReason,
  inspectPreviousSessionUncleanExit,
  logDiagnosticEvent,
  markCleanSessionExit,
  normalizeStoredDiagnosticEntry,
  readEmergencySessionTrace,
  resetAsyncErrorToastsForTests,
  shouldIgnoreConsoleDiagnosticMessage,
  writeEmergencySessionTraceSync,
} from '../crashLogger';
import { syncWithPickedDirectory } from '../localSyncChannels';

function createMemoryStorage(options?: { failSetItem?: boolean }): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      if (options?.failSetItem) {
        const err = new Error('Simulated QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, value);
    },
  };
}

function makeFakeEntry(i: number, override?: Partial<DiagnosticLogEntry>): DiagnosticLogEntry {
  return {
    id: `entry-${i}`,
    timestampIso: '2026-04-01T12:00:00.000Z',
    timestampMs: 1_775_044_800_000 + i,
    sessionId: 'sess-test',
    level: 'error',
    category: 'storage',
    route: 'herd',
    message: `Storage failure #${i}`,
    ...override,
  };
}

describe('Mobile Background Freeze Coordinator, Emergency Session Trace & Async Error Toasts', () => {
  afterEach(() => {
    resetAsyncErrorToastsForTests();
    resetBackgroundFreezeCoordinatorForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('bounds sessionStorage emergency traces to 5 sanitized entries and scrubs base64 URIs', () => {
    const sessionMock = createMemoryStorage();
    const hugeBase64 = `data:image/jpeg;base64,${'A'.repeat(160)}`;

    for (let i = 1; i <= 7; i++) {
      const ok = writeEmergencySessionTraceSync(
        makeFakeEntry(i, {
          message: `Crash ${i} with payload ${hugeBase64}`,
          stack: `Error: Crash ${i}\n${hugeBase64}\n${'x'.repeat(300)}`,
        }),
        sessionMock
      );
      expect(ok).toBe(true);
    }

    const traces = readEmergencySessionTrace(sessionMock);
    expect(traces).toHaveLength(5);
    expect(traces.map((t) => t.id)).toEqual([
      'entry-3',
      'entry-4',
      'entry-5',
      'entry-6',
      'entry-7',
    ]);
    for (const item of traces) {
      expect(item.message).toContain('[image-data-uri omitted]');
      expect(item.message).not.toContain('AAAAAAAAAAAA');
      expect((item.stack || '').length).toBeLessThanOrEqual(260);
    }

    clearEmergencySessionTrace(sessionMock);
    expect(readEmergencySessionTrace(sessionMock)).toHaveLength(0);
  });

  it('falls back to sessionStorage emergency trace when localStorage throws QuotaExceededError during write', () => {
    const failingLocal = createMemoryStorage({ failSetItem: true });
    const emergencySession = createMemoryStorage();
    vi.stubGlobal('localStorage', failingLocal);
    vi.stubGlobal('sessionStorage', emergencySession);

    const quotaErr = new Error('QuotaExceededError: storage full');
    quotaErr.name = 'QuotaExceededError';
    handleUnhandledRejectionReason(quotaErr);

    const emergencyEntries = readEmergencySessionTrace(emergencySession);
    expect(emergencyEntries.length).toBeGreaterThanOrEqual(1);
    expect(emergencyEntries[emergencyEntries.length - 1]?.message).toContain('QuotaExceeded');

    const toasts = getActiveAsyncErrorToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.severity).toBe('error');
    expect(toasts[0]?.sticky).toBe(true);
    expect(toasts[0]?.title).toContain('Device Storage Full');
  });

  it('deduplicates repeated async error toasts, auto-dismisses minor warnings after 9s, and skips AbortError', () => {
    vi.useFakeTimers();

    // AbortError user cancel never surfaces a noisy error toast
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    handleUnhandledRejectionReason(abortErr);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);

    // Clean BackgroundPausedError emits non-sticky warning auto-dismissing at 9s
    handleUnhandledRejectionReason(new BackgroundPausedError('Folder Sync'));
    // Second identical pause inside 4.5s dedupe window is collapsed
    handleUnhandledRejectionReason(new BackgroundPausedError('Folder Sync'));
    expect(getActiveAsyncErrorToasts()).toHaveLength(1);
    expect(getActiveAsyncErrorToasts()[0]?.sticky).toBe(false);
    expect(getActiveAsyncErrorToasts()[0]?.severity).toBe('warning');

    vi.advanceTimersByTime(8999);
    expect(getActiveAsyncErrorToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);

    // Caps active stack at 2 and prefers dropping non-sticky notices over sticky errors
    emitAsyncErrorToast({
      title: 'Critical Write Fault',
      detail: 'Could not save litter record',
      severity: 'error',
      sticky: true,
    });
    emitAsyncErrorToast({
      title: 'Minor Notice A',
      detail: 'Transient pause',
      severity: 'warning',
      sticky: false,
    });
    emitAsyncErrorToast({
      title: 'Minor Notice B',
      detail: 'Second warning triggers eviction',
      severity: 'warning',
      sticky: false,
    });

    const active = getActiveAsyncErrorToasts();
    expect(active).toHaveLength(2);
    expect(active.some((t) => t.title === 'Critical Write Fault')).toBe(true);
    expect(active.some((t) => t.title === 'Minor Notice B')).toBe(true);
  });

  it('auto-resumes minor paused background jobs on visible, while keeping severity jobs sticky until user tap', () => {
    const onHidden = vi.fn();
    const onVisible = vi.fn();
    const unsub = registerFreezeLifecycleListener({ id: 'test-sub', onHidden, onVisible });

    const autoResumeSpy = vi.fn();
    const stickySeveritySpy = vi.fn();

    registerPausedBackgroundJob({
      taskId: 'clean-sync',
      label: 'Folder Sync',
      pausedAtMs: Date.now(),
      severity: 'minor',
      resumeHandler: autoResumeSpy,
    });
    registerPausedBackgroundJob({
      taskId: 'perm-lost-sync',
      label: 'Vault Sync',
      pausedAtMs: Date.now(),
      severity: 'severity',
      severityReason: 'Permission prompt required',
      resumeHandler: stickySeveritySpy,
    });

    notifyBackgroundTransition('hidden');
    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(autoResumeSpy).not.toHaveBeenCalled();

    notifyBackgroundTransition('visible');
    expect(onVisible).toHaveBeenCalledTimes(1);
    // Ergonomic auto-resume runs immediately for clean minor pauses
    expect(autoResumeSpy).toHaveBeenCalledTimes(1);
    // Severity issue stays paused until user explicitly taps Resume
    expect(stickySeveritySpy).not.toHaveBeenCalled();
    expect(getPausedBackgroundJobs().map((j) => j.taskId)).toEqual(['perm-lost-sync']);

    clearPausedBackgroundJob('perm-lost-sync');
    unsub();
  });

  it('cooperatively checkpoints & throws BackgroundPausedError when visibilityState turns hidden mid-folder-sync', async () => {
    const docState = { visibilityState: 'visible' as 'visible' | 'hidden' };
    const writtenFiles: Record<string, string> = {};

    const peerDeltaJson = JSON.stringify({
      format: 'community-pedigree-delta-v1',
      device_id: 'peer-barn-2',
      exported_at: '2026-04-01T12:00:00.000Z',
      operations: [
        {
          op_id: 'op-peer-1',
          entity_type: 'animal',
          entity_uuid: 'anim-1',
          device_id: 'peer-barn-2',
          timestamp: '2026-04-01T12:00:00.000Z',
          logical_counter: 1,
          field_name: 'weightGrams',
          new_value: 2450,
        },
      ],
    });

    const fakeEntries: Array<[string, any]> = [
      [
        'delta_peer-barn-2.json',
        {
          kind: 'file',
          async getFile() {
            // Simulate user locking phone screen after first peer file finishes reading
            docState.visibilityState = 'hidden';
            return {
              name: 'delta_peer-barn-2.json',
              size: peerDeltaJson.length,
              async text() {
                return peerDeltaJson;
              },
            };
          },
        },
      ],
      [
        'delta_peer-barn-3.json',
        {
          kind: 'file',
          async getFile() {
            throw new Error('Should have paused before reading second peer file');
          },
        },
      ],
    ];

    // Mock IDB so we verify incoming ops + checkpoint write and deterministic db.close() on commit/abort
    const putRecords: Record<string, any[]> = {
      sync_handles: [],
      sync_outbox: [],
      sync_checkpoints: [],
    };
    let syncOpenCount = 0;
    let syncCloseCount = 0;
    vi.stubGlobal('indexedDB', {
      open(dbName: string) {
        const isSyncDb = dbName === 'community_pedigree_sync_v1';
        if (isSyncDb) syncOpenCount++;
        const req: any = { result: null, error: null };
        queueMicrotask(() => {
          const fakeDb = {
            close() {
              if (isSyncDb) syncCloseCount++;
            },
            transaction(storeName: string) {
              const tx: any = {
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                  return {
                    put(val: any) {
                      putRecords[storeName]?.push(val);
                      queueMicrotask(() => tx.oncomplete?.());
                      return {};
                    },
                  };
                },
              };
              return tx;
            },
          };
          req.result = fakeDb;
          req.onsuccess?.();
        });
        return req;
      },
    });

    const dirHandle = {
      name: 'Barn Sync Folder',
      async *entries() {
        for (const pair of fakeEntries) {
          yield pair;
        }
      },
      async getFileHandle(filename: string) {
        return {
          async createWritable() {
            let content = '';
            return {
              async write(data: string) {
                content += data;
              },
              async close() {
                writtenFiles[filename] = content;
              },
            };
          },
        };
      },
    };

    await expect(
      syncWithPickedDirectory({
        deviceId: 'dev-main',
        localOperations: [],
        masterBackupJson: '{}',
        dirHandleOverride: dirHandle,
        visibilityDoc: docState,
      })
    ).rejects.toBeInstanceOf(BackgroundPausedError);

    // Master/local delta files should NOT have been partially overwritten while hidden
    expect(writtenFiles['delta_dev-main.json']).toBeUndefined();
    expect(writtenFiles['pedigree_master_backup.json']).toBeUndefined();

    // Parsed incoming peer op & checkpoint were saved safely before throw, and IDB handles closed
    expect(putRecords.sync_outbox).toHaveLength(1);
    expect(putRecords.sync_outbox[0]?.op_id).toBe('op-peer-1');
    expect(putRecords.sync_checkpoints).toHaveLength(1);
    expect(putRecords.sync_checkpoints[0]?.incomingOpsQueued).toBe(1);
    expect(syncOpenCount).toBe(3);
    expect(syncCloseCount).toBe(syncOpenCount);
  });

  it('closes IndexedDB handle deterministically even when a write transaction aborts mid-batch', async () => {
    let syncOpenCount = 0;
    let syncCloseCount = 0;
    vi.stubGlobal('indexedDB', {
      open(dbName: string) {
        const isSyncDb = dbName === 'community_pedigree_sync_v1';
        if (isSyncDb) syncOpenCount++;
        const req: any = { result: null, error: null };
        queueMicrotask(() => {
          const fakeDb = {
            close() {
              if (isSyncDb) syncCloseCount++;
            },
            transaction() {
              const tx: any = {
                error: new Error('Transaction aborted by OS freeze'),
                oncomplete: null,
                onerror: null,
                onabort: null,
                objectStore() {
                  return {
                    put() {
                      queueMicrotask(() => tx.onabort?.());
                      return {};
                    },
                  };
                },
              };
              return tx;
            },
          };
          req.result = fakeDb;
          req.onsuccess?.();
        });
        return req;
      },
    });

    const dirHandle = {
      name: 'Abort Test Folder',
      async *entries() {
        // Trigger immediate pause without extra files
      },
      async getFileHandle() {
        throw new Error('Should not write files while hidden');
      },
    };

    await expect(
      syncWithPickedDirectory({
        deviceId: 'dev-main',
        localOperations: [],
        masterBackupJson: '{}',
        dirHandleOverride: dirHandle,
        visibilityDoc: { visibilityState: 'hidden' },
      })
    ).rejects.toBeInstanceOf(BackgroundPausedError);

    expect(syncOpenCount).toBe(2);
    expect(syncCloseCount).toBe(syncOpenCount);
  });

  it('ignores Vite dev-proxy WebSocket console noise while preserving real errors', () => {
    expect(
      shouldIgnoreConsoleDiagnosticMessage(
        '[vite] failed to connect to websocket.\nyour current setup:\n  (browser) example.com/ <--[HTTP]--> localhost:3000/'
      )
    ).toBe(true);
    expect(shouldIgnoreConsoleDiagnosticMessage('[vite] server connection lost. Polling for restart...')).toBe(
      true
    );
    expect(shouldIgnoreConsoleDiagnosticMessage('[vite] connecting...')).toBe(true);

    expect(shouldIgnoreConsoleDiagnosticMessage('[vite] Internal Server Error\nSyntaxError')).toBe(false);
    expect(shouldIgnoreConsoleDiagnosticMessage('Failed writing local database to IndexedDB')).toBe(false);
  });

  it('normalizes legacy stored Vite WebSocket noise and low-heap lifecycle exits out of Memory Alerts', () => {
    const viteWsEntry = makeFakeEntry(10, {
      category: 'console',
      level: 'error',
      message: '[vite] failed to connect to websocket.\nyour current setup: ...',
    });
    expect(normalizeStoredDiagnosticEntry(viteWsEntry)).toBeNull();

    const lowHeapLegacyExit = makeFakeEntry(11, {
      category: 'memory',
      level: 'warn',
      message:
        'Previous session (sess-mwmc32si-cu0lt) terminated unexpectedly without clean pagehide (last active 2026-11-18T16:29:41.842Z, route "home", JS heap 6.8%). Possible mobile OS tab kill / out-of-memory reload.',
      details: JSON.stringify({
        previousSessionId: 'sess-mwmc32si-cu0lt',
        lastRoute: 'home',
        lastHeapPercent: 6.8,
        lastHeapBytes: 68_000_000,
        downtimeMs: 10_370,
      }),
    });
    const normalizedLow = normalizeStoredDiagnosticEntry(lowHeapLegacyExit);
    expect(normalizedLow?.category).toBe('lifecycle');
    expect(normalizedLow?.level).toBe('warn');

    const highHeapExit = makeFakeEntry(12, {
      category: 'memory',
      level: 'error',
      message:
        'Previous session (sess-oom-999) terminated unexpectedly without clean pagehide (last active 2026-11-18T16:29:41.842Z, route "home", JS heap 84.2%). Possible mobile OS tab kill / out-of-memory reload.',
      details: JSON.stringify({
        previousSessionId: 'sess-oom-999',
        lastHeapPercent: 84.2,
      }),
    });
    const normalizedHigh = normalizeStoredDiagnosticEntry(highHeapExit);
    expect(normalizedHigh?.category).toBe('memory');
    expect(normalizedHigh?.level).toBe('error');
  });

  it('keeps lifecycle warnings in lifecycle category and classifies only genuine high-heap exits or OOM faults as memory', () => {
    const localMock = createMemoryStorage();
    vi.stubGlobal('localStorage', localMock);

    // 1. Explicit lifecycle category is never hijacked to memory by descriptive text
    const lifecycleEntry = logDiagnosticEvent({
      level: 'warn',
      category: 'lifecycle',
      message: 'Session suspended without out-of-memory indicator',
    });
    expect(lifecycleEntry?.category).toBe('lifecycle');

    // 2. Real storage/runtime memory faults still elevate to memory
    const oomEntry = logDiagnosticEvent({
      level: 'error',
      category: 'storage',
      message: 'Array buffer allocation failed',
      error: new RangeError('Out of memory'),
    });
    expect(oomEntry?.category).toBe('memory');

    // 3. Low-heap (6.8%) unclean exit logs as lifecycle warn (not Memory Alert)
    localMock.setItem(
      'pedigree_session_heartbeat_v1',
      JSON.stringify({
        sessionId: 'sess-prev-low-heap',
        active: true,
        startedAtMs: Date.now() - 20_000,
        lastAliveMs: Date.now() - 10_000,
        lastRoute: 'home',
        lastHeapPercent: 6.8,
        lastHeapBytes: 68_000_000,
      })
    );
    const lowExitLog = inspectPreviousSessionUncleanExit();
    expect(lowExitLog?.category).toBe('lifecycle');
    expect(lowExitLog?.level).toBe('warn');
    expect(lowExitLog?.message).not.toContain('out-of-memory');

    // 4. High-heap (82.5%) unclean exit logs as memory error
    localMock.setItem(
      'pedigree_session_heartbeat_v1',
      JSON.stringify({
        sessionId: 'sess-prev-high-heap',
        active: true,
        startedAtMs: Date.now() - 20_000,
        lastAliveMs: Date.now() - 10_000,
        lastRoute: 'pedigree',
        lastHeapPercent: 82.5,
        lastHeapBytes: 825_000_000,
      })
    );
    const highExitLog = inspectPreviousSessionUncleanExit();
    expect(highExitLog?.category).toBe('memory');
    expect(highExitLog?.level).toBe('error');

    // 5. markCleanSessionExit clears active flag cleanly so no warning fires
    markCleanSessionExit();
    expect(inspectPreviousSessionUncleanExit()).toBeNull();
  });
});
