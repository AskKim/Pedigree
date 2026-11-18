/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hookRuntime = vi.hoisted(() => {
  interface HookHarnessState {
    cursor: number;
    effectCursor: number;
    states: unknown[];
    refs: Array<{ current: unknown }>;
    callbacks: Array<{ fn: unknown; deps: unknown[] | undefined }>;
    effects: Array<{
      create: () => void | (() => void);
      deps?: unknown[];
      cleanup?: () => void;
    }>;
  }

  const runtime: HookHarnessState = {
    cursor: 0,
    effectCursor: 0,
    states: [],
    refs: [],
    callbacks: [],
    effects: [],
  };

  return {
    runtime,
    reset() {
      runtime.cursor = 0;
      runtime.effectCursor = 0;
      runtime.states = [];
      runtime.refs = [];
      runtime.callbacks = [];
      runtime.effects = [];
    },
    beginRender() {
      runtime.cursor = 0;
      runtime.effectCursor = 0;
    },
    mountEffects() {
      for (const eff of runtime.effects) {
        const cleanup = eff.create();
        eff.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
    },
    cleanupEffects() {
      for (const eff of runtime.effects) {
        eff.cleanup?.();
        eff.cleanup = undefined;
      }
    },
  };
});

vi.mock('react', () => ({
  useState<T>(initial: T | (() => T)) {
    const idx = hookRuntime.runtime.cursor++;
    if (!(idx in hookRuntime.runtime.states)) {
      hookRuntime.runtime.states[idx] =
        typeof initial === 'function' ? (initial as () => T)() : initial;
    }
    const setState = (next: T | ((prev: T) => T)) => {
      const prev = hookRuntime.runtime.states[idx] as T;
      hookRuntime.runtime.states[idx] =
        typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    };
    return [hookRuntime.runtime.states[idx] as T, setState] as const;
  },
  useRef<T>(initial: T) {
    const idx = hookRuntime.runtime.cursor++;
    if (!(idx in hookRuntime.runtime.refs)) {
      hookRuntime.runtime.refs[idx] = { current: initial };
    }
    return hookRuntime.runtime.refs[idx] as { current: T };
  },
  useCallback<T extends Function>(fn: T, deps: unknown[]) {
    const idx = hookRuntime.runtime.cursor++;
    const existing = hookRuntime.runtime.callbacks[idx];
    if (
      !existing ||
      !existing.deps ||
      existing.deps.length !== deps.length ||
      deps.some((d, i) => !Object.is(d, existing.deps![i]))
    ) {
      hookRuntime.runtime.callbacks[idx] = { fn, deps };
    }
    return hookRuntime.runtime.callbacks[idx].fn as T;
  },
  useEffect(create: () => void | (() => void), deps?: unknown[]) {
    const idx = hookRuntime.runtime.effectCursor++;
    const existing = hookRuntime.runtime.effects[idx];
    if (!existing) {
      hookRuntime.runtime.effects[idx] = { create, deps };
    } else {
      existing.create = create;
      existing.deps = deps;
    }
  },
}));

import { useAsyncKeyedLock, useAsyncSubmitLock } from '../useAsyncSubmitLock';

function mountWithStrictMode<T>(renderHook: () => T): {
  current: () => T;
  rerender: () => T;
  cleanup: () => void;
  remount: () => void;
} {
  let latest: T;
  const render = () => {
    hookRuntime.beginRender();
    latest = renderHook();
    return latest;
  };

  // React.StrictMode double-renders and double-invokes effects (mount -> cleanup -> mount)
  render();
  render();
  hookRuntime.mountEffects();
  hookRuntime.cleanupEffects();
  hookRuntime.mountEffects();

  return {
    current: () => latest,
    rerender: render,
    cleanup: () => hookRuntime.cleanupEffects(),
    remount: () => hookRuntime.mountEffects(),
  };
}

describe('useAsyncSubmitLock & useAsyncKeyedLock — StrictMode and Activity remount resilience', () => {
  beforeEach(() => {
    hookRuntime.reset();
  });

  it('useAsyncSubmitLock does not wedge after React.StrictMode double effect invocation', async () => {
    const harness = mountWithStrictMode(() =>
      useAsyncSubmitLock({ postSettleCooldownMs: 0 })
    );

    const action = vi.fn(async () => 'saved-record');
    const result = await harness.current().runLocked(action);

    expect(result).toEqual({ skipped: false, value: 'saved-record' });
    expect(action).toHaveBeenCalledTimes(1);
    expect(harness.current().isLockedNow()).toBe(false);

    harness.cleanup();
    // Calling after unmount remains safely skipped
    expect(await harness.current().runLocked(action)).toEqual({ skipped: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('useAsyncSubmitLock resets stale lock state across <Activity> hide/show even if an old task settles while hidden', async () => {
    const harness = mountWithStrictMode(() => useAsyncSubmitLock());

    let resolveInFlight!: () => void;
    const inFlightGate = new Promise<void>((resolve) => {
      resolveInFlight = resolve;
    });

    const slowTask = harness.current().runLocked(async () => {
      await inFlightGate;
      return 'stale-finish';
    });

    expect(harness.current().isLockedNow()).toBe(true);
    harness.rerender();
    expect(harness.current().isSubmitting).toBe(true);

    // Simulate <Activity mode="hidden"> cleanup while slowTask is still in flight
    harness.cleanup();
    // Simulate <Activity mode="visible"> remount WITHOUT re-rendering first
    harness.remount();
    harness.rerender();

    expect(harness.current().isSubmitting).toBe(false);
    expect(harness.current().isLockedNow()).toBe(false);

    // Resolving old task must not interfere with the newly remounted controller
    let resolveFresh!: () => void;
    const freshGate = new Promise<void>((resolve) => {
      resolveFresh = resolve;
    });
    const freshAction = vi.fn(async () => {
      await freshGate;
      return 'fresh-save';
    });
    const freshPromise = harness.current().runLocked(freshAction);
    expect(harness.current().isLockedNow()).toBe(true);

    resolveInFlight();
    expect(await slowTask).toEqual({ skipped: false, value: 'stale-finish' });
    // Newly remounted controller is STILL locked until freshPromise resolves
    expect(harness.current().isLockedNow()).toBe(true);

    resolveFresh();
    expect(await freshPromise).toEqual({ skipped: false, value: 'fresh-save' });
    expect(harness.current().isLockedNow()).toBe(false);
    expect(freshAction).toHaveBeenCalledTimes(1);
  });

  it('useAsyncKeyedLock does not wedge after React.StrictMode remount and clears stale keys across <Activity> hide/show', async () => {
    const harness = mountWithStrictMode(() => useAsyncKeyedLock());

    // Works immediately after StrictMode double-effect cycle
    const first = await harness.current().runKeyLocked('row-1', async () => 'done-1');
    expect(first).toEqual({ skipped: false, value: 'done-1' });

    // Start an in-flight keyed action, then simulate <Activity> hide -> remount -> settle old task
    let resolveKey!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveKey = resolve;
    });
    const inFlight = harness.current().runKeyLocked('row-2', async () => {
      await gate;
      return 'stale-key';
    });

    expect(harness.current().isKeyLocked('row-2')).toBe(true);
    harness.rerender();
    expect(harness.current().lockedKeys).toEqual(['row-2']);

    harness.cleanup();
    harness.remount();
    harness.rerender();

    expect(harness.current().lockedKeys).toEqual([]);
    expect(harness.current().isKeyLocked('row-2')).toBe(false);

    // Row 2 is immediately actionable again on re-show, isolated from old disposed controller
    const retry = await harness.current().runKeyLocked('row-2', async () => 'fresh-key');
    expect(retry).toEqual({ skipped: false, value: 'fresh-key' });

    resolveKey();
    expect(await inFlight).toEqual({ skipped: false, value: 'stale-key' });
    expect(harness.current().lockedKeys).toEqual([]);
  });
});
