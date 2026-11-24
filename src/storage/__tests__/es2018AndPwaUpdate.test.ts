import { describe, expect, it, vi } from 'vitest';
import {
  ensureEs2018Globals,
  readBlobAsArrayBuffer,
  readBlobAsText,
} from '../../utils/es2018Shims';
import {
  applyPwaUpdateNow,
  attachControllerChangeReloadGuard,
  checkForPwaUpdateNow,
  getPwaUpdateState,
  initPwaUpdater,
  markPreUpgradeBackupVerified,
  resetPwaUpdateManagerForTests,
  setPwaUpdatePolicy,
} from '../pwaUpdateManager';
import {
  getConnectivitySnapshot,
  getEffectiveOnlineStatus,
  probeNetworkConnectivity,
  resetConnectivityStateForTests,
  setManualOfflineMode,
} from '../storageProtection';

describe('ES2018 runtime shims (es2018Shims)', () => {
  it('polyfills globalThis, Promise.allSettled, and Object.fromEntries only when missing', async () => {
    const fakePromise: any = function FakePromise(this: any) {};
    fakePromise.all = Promise.all.bind(Promise);
    fakePromise.resolve = Promise.resolve.bind(Promise);

    const fakeObject: any = {};
    const mockHost: Record<string, any> = {
      Promise: fakePromise,
      Object: fakeObject,
    };

    ensureEs2018Globals(mockHost);

    expect(mockHost.globalThis).toBe(mockHost);
    expect(typeof fakePromise.allSettled).toBe('function');
    expect(typeof fakeObject.fromEntries).toBe('function');

    const settled = await fakePromise.allSettled([
      Promise.resolve('ok'),
      Promise.reject(new Error('fail')),
    ]);
    expect(settled[0]).toEqual({ status: 'fulfilled', value: 'ok' });
    expect(settled[1].status).toBe('rejected');

    expect(
      fakeObject.fromEntries([
        ['a', 1],
        ['b', 'two'],
      ])
    ).toEqual({ a: 1, b: 'two' });
  });

  it('installs non-enumerable Array.prototype.flat and flatMap shims when absent (Android 8 Chromium 61–68)', () => {
    const fakeArrayProto: Record<string, unknown> = {};
    const FakeArray = function () {};
    FakeArray.prototype = fakeArrayProto;

    const mockHost: Record<string, unknown> = {
      Array: FakeArray,
    };

    ensureEs2018Globals(mockHost);

    expect(typeof fakeArrayProto.flat).toBe('function');
    expect(typeof fakeArrayProto.flatMap).toBe('function');

    const flatFn = fakeArrayProto.flat as (depth?: number) => unknown[];
    const flatMapFn = fakeArrayProto.flatMap as (
      cb: (v: unknown, idx: number, arr: unknown[]) => unknown
    ) => unknown[];

    const nested = [1, [2, [3, 4]], 5];
    expect(flatFn.call(nested)).toEqual([1, 2, [3, 4], 5]);
    expect(flatFn.call(nested, 2)).toEqual([1, 2, 3, 4, 5]);

    const items = [1, 2, 3];
    expect(flatMapFn.call(items, (x) => [Number(x) * 2])).toEqual([2, 4, 6]);
    expect(flatMapFn.call(items, (x) => (Number(x) === 2 ? [20, 21] : Number(x)))).toEqual([1, 20, 21, 3]);
  });

  it('installs non-enumerable Blob.prototype.arrayBuffer/text and String.prototype.trimStart/trimEnd shims and reads via FileReader when native methods are absent', async () => {
    function FakeBlob(this: any, bytes: number[]) {
      this._bytes = bytes;
    }
    const fakeStringProto: Record<string, any> = {};
    const FakeString: any = function () {};
    FakeString.prototype = fakeStringProto;

    const mockHost: Record<string, any> = {
      Promise,
      Object: { fromEntries: Object.fromEntries },
      Blob: FakeBlob,
      String: FakeString,
    };

    ensureEs2018Globals(mockHost);

    expect(typeof FakeBlob.prototype.arrayBuffer).toBe('function');
    expect(typeof FakeBlob.prototype.text).toBe('function');
    expect(Object.keys(FakeBlob.prototype)).not.toContain('arrayBuffer');
    expect(Object.keys(FakeBlob.prototype)).not.toContain('text');
    expect(typeof fakeStringProto.trimStart).toBe('function');
    expect(typeof fakeStringProto.trimEnd).toBe('function');
    expect(fakeStringProto.trimStart.call('  \nhello ')).toBe('hello ');
    expect(fakeStringProto.trimEnd.call(' hello\t  ')).toBe(' hello');

    // Mock ES2018 FileReader (no Blob.prototype.arrayBuffer or .text natively)
    class MockFileReader {
      public result: ArrayBuffer | string | null = null;
      public error: Error | null = null;
      public onload: (() => void) | null = null;
      public onerror: (() => void) | null = null;
      public onabort: (() => void) | null = null;

      readAsArrayBuffer(blob: any) {
        const bytes: number[] = blob._bytes || [];
        this.result = new Uint8Array(bytes).buffer;
        queueMicrotask(() => this.onload?.());
      }

      readAsText(blob: any) {
        const bytes: number[] = blob._bytes || [];
        this.result = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('FileReader', MockFileReader);
    try {
      const legacyBlob = new (FakeBlob as any)([72, 105, 33]); // "Hi!"
      const buf = await readBlobAsArrayBuffer(legacyBlob);
      expect(Array.from(new Uint8Array(buf))).toEqual([72, 105, 33]);

      const txt = await readBlobAsText(legacyBlob);
      expect(txt).toBe('Hi!');

      // Also verify the shimmed prototype methods delegate without recursion
      const protoBuf = await legacyBlob.arrayBuffer();
      const protoTxt = await legacyBlob.text();
      expect(Array.from(new Uint8Array(protoBuf))).toEqual([72, 105, 33]);
      expect(protoTxt).toBe('Hi!');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('prefers native blob.text()/arrayBuffer() over FileReader and degrades cleanly if FileReader throws SecurityError', async () => {
    const fileReaderSpy = vi.fn(function () {
      throw new DOMException('FileReader blocked', 'SecurityError');
    });
    vi.stubGlobal('FileReader', fileReaderSpy);
    try {
      const nativeBlob = new Blob(['Hello Pedigree'], { type: 'text/plain' });
      expect(await readBlobAsText(nativeBlob)).toBe('Hello Pedigree');
      expect(new TextDecoder().decode(await readBlobAsArrayBuffer(nativeBlob))).toBe(
        'Hello Pedigree'
      );
      expect(fileReaderSpy).not.toHaveBeenCalled();

      // Legacy blob without .text()/.arrayBuffer() when FileReader is blocked -> Response fallback
      const rawBytes = new TextEncoder().encode('ResponseFallback');
      const noMethodBlob = {
        size: rawBytes.byteLength,
        type: 'text/plain',
        slice() {
          return new Blob([rawBytes]);
        },
      } as unknown as Blob;
      const origResponse = globalThis.Response;
      vi.stubGlobal(
        'Response',
        class FakeResponse {
          constructor(private readonly body: unknown) {}
          async arrayBuffer() {
            void this.body;
            return rawBytes.buffer.slice(0);
          }
          async text() {
            return 'ResponseFallback';
          }
        }
      );
      try {
        expect(await readBlobAsText(noMethodBlob)).toBe('ResponseFallback');
        expect(new TextDecoder().decode(await readBlobAsArrayBuffer(noMethodBlob))).toBe(
          'ResponseFallback'
        );
      } finally {
        vi.stubGlobal('Response', origResponse);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('pwaUpdateManager (manual prompt gate & controllerchange handshake)', () => {
  it('surfaces waiting update, triggers reload handler once on controllerchange, and invokes update callback', async () => {
    resetPwaUpdateManagerForTests();

    const listeners: Record<string, Array<() => void>> = {};
    const mockSwContainer = {
      addEventListener(event: string, fn: () => void) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      },
    };
    const reloadSpy = vi.fn();
    attachControllerChangeReloadGuard(mockSwContainer, reloadSpy);

    const updateSpy = vi.fn(async () => {});
    initPwaUpdater((opts) => {
      opts?.onNeedRefresh?.();
      return updateSpy;
    });

    expect(getPwaUpdateState().updateAvailable).toBe(true);

    const applied = await applyPwaUpdateNow();
    expect(applied).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(true);

    // Firing controllerchange multiple times must reload at most once (`refreshing` guard)
    for (const cb of listeners['controllerchange'] || []) {
      cb();
      cb();
    }
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    resetPwaUpdateManagerForTests();
  });

  it('respects pinned policy and blocks SW swap on revoked versions or unverified schema jumps', async () => {
    resetPwaUpdateManagerForTests();
    resetConnectivityStateForTests();

    const updateSpy = vi.fn(async () => {});
    initPwaUpdater((opts) => {
      opts?.onNeedRefresh?.();
      return updateSpy;
    });

    // Pinned policy blocks automatic check & manual apply
    setPwaUpdatePolicy('pinned');
    expect(await checkForPwaUpdateNow()).toBe('pinned');
    expect(await applyPwaUpdateNow()).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();

    // Unpin back to notify, test Upgrade Gate revoked release block
    setPwaUpdatePolicy('notify');
    const revokedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status.json')) {
        return new Response(
          JSON.stringify({ allowUpdates: true, revokedVersions: ['0.9.9-recalled'] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          appVersion: '0.9.9-recalled',
          schemaVersion: 6,
          minDirectUpgradeSchema: 4,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    expect(await applyPwaUpdateNow({ fetchImpl: revokedFetch })).toBe(false);
    expect(getPwaUpdateState().gateDecision?.status).toBe('blocked_revoked');
    expect(updateSpy).not.toHaveBeenCalled();

    // Test schemaDelta >= 2 requiring pre-upgrade backup verification before apply succeeds
    const schemaJumpFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('status.json')) {
        return new Response(JSON.stringify({ allowUpdates: true, revokedVersions: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ appVersion: '0.5.0', schemaVersion: 8, minDirectUpgradeSchema: 4 }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    expect(await applyPwaUpdateNow({ fetchImpl: schemaJumpFetch })).toBe(false);
    expect(getPwaUpdateState().gateDecision?.status).toBe('requires_verified_backup');
    expect(updateSpy).not.toHaveBeenCalled();

    markPreUpgradeBackupVerified(true);
    expect(await applyPwaUpdateNow({ fetchImpl: schemaJumpFetch })).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(true);

    resetPwaUpdateManagerForTests();
    resetConnectivityStateForTests();
  });
});

describe('storageProtection — manual offline toggle & captive-portal connectivity probe', () => {
  it('switches effective online state immediately and detects captive HTML vs valid JSON manifests', async () => {
    resetConnectivityStateForTests();

    setManualOfflineMode(true);
    expect(getEffectiveOnlineStatus()).toBe(false);
    expect(getConnectivitySnapshot().reason).toBe('manual_offline');

    const skippedProbe = await probeNetworkConnectivity({
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(skippedProbe.reason).toBe('manual_offline');

    setManualOfflineMode(false);
    // Captive Wi-Fi returns HTTP 200 text/html instead of JSON
    const captiveHtmlFetch = vi.fn(async () => {
      return new Response('<html><body>Wi-Fi Login</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }) as unknown as typeof fetch;

    const captiveSnap = await probeNetworkConnectivity({ fetchImpl: captiveHtmlFetch });
    expect(captiveSnap.probeStatus).toBe('unreachable');
    expect(captiveSnap.reason).toBe('captive_or_unreachable');
    expect(captiveSnap.isEffectivelyOnline).toBe(false);

    // Valid live version.json clears captive failure and captures Date clock skew
    const liveJsonFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ appVersion: '0.1.0-alpha.2' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          date: new Date(Date.now() + 60_000).toUTCString(),
        },
      });
    }) as unknown as typeof fetch;

    const liveSnap = await probeNetworkConnectivity({ fetchImpl: liveJsonFetch });
    expect(liveSnap.probeStatus).toBe('reachable');
    expect(liveSnap.isEffectivelyOnline).toBe(true);
    expect(typeof liveSnap.clockSkewMs).toBe('number');

    resetConnectivityStateForTests();
  });
});

describe('deviceCapabilityDetector — browser feature signal probing', () => {
  it('safely detects missing or throwing optional browser APIs without crashing', async () => {
    const { detectCurrentBrowserCompatibility, readBrowserFeatureSignals } = await import(
      '../deviceCapabilityDetector'
    );
    const { classifyDeviceCapability } = await import('../../core/deviceCapability');

    const originalWindow = globalThis.window;
    const originalNav = globalThis.navigator;
    const originalWasm = globalThis.WebAssembly;
    const originalWorker = globalThis.Worker;

    try {
      const restrictedWindow: Record<string, unknown> = {
        get indexedDB() {
          throw new Error('SecurityError: indexedDB blocked');
        },
      };
      Object.defineProperty(globalThis, 'window', {
        value: restrictedWindow,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        },
        configurable: true,
      });
      Object.defineProperty(globalThis, 'WebAssembly', {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        configurable: true,
      });

      const signals = readBrowserFeatureSignals();
      expect(signals.indexedDbSupported).toBe(false);
      expect(signals.wasmSupported).toBe(false);
      expect(signals.moduleWorkerSupported).toBe(false);
      expect(signals.opfsSupported).toBe(false);
      expect(signals.directoryPickerSupported).toBe(false);
      expect(signals.persistStorageSupported).toBe(false);
      expect(signals.clipboardWriteSupported).toBe(false);
      expect(signals.webShareFilesSupported).toBe(false);

      const assessment = classifyDeviceCapability({
        deviceMemoryGb: null,
        hardwareConcurrency: 4,
        jsHeapLimitBytes: null,
        usedHeapBytes: null,
        userAgent: signals.userAgent,
        maxTouchPoints: 5,
        coarsePointer: true,
        screenWidthPx: 390,
        screenHeightPx: 844,
        devicePixelRatio: 3,
      });
      const compat = detectCurrentBrowserCompatibility(assessment);
      expect(compat.wasmFallbackActive).toBe(true);
      expect(compat.isOutdatedBrowser).toBe(true);
      expect(compat.shouldConfirmHeavyZipExport).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
      Object.defineProperty(globalThis, 'WebAssembly', { value: originalWasm, configurable: true });
      Object.defineProperty(globalThis, 'Worker', { value: originalWorker, configurable: true });
    }
  });
});

