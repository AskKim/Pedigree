import { describe, expect, it, vi } from 'vitest';
import { ensureEs2018Globals } from '../../utils/es2018Shims';
import {
  applyPwaUpdateNow,
  attachControllerChangeReloadGuard,
  getPwaUpdateState,
  initPwaUpdater,
  resetPwaUpdateManagerForTests,
} from '../pwaUpdateManager';

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
});
