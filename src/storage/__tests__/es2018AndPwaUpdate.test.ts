import { describe, expect, it, vi } from 'vitest';
import { ensureEs2018Globals } from '../../utils/es2018Shims';
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
      return new Response(JSON.stringify({ appVersion: '0.1.0-prealpha.1' }), {
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
