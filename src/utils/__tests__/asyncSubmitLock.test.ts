/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createAsyncKeyedLockController,
  createAsyncLockController,
} from '../useAsyncSubmitLock';

describe('createAsyncLockController & createAsyncKeyedLockController — double-submit guards', () => {
  it('blocks synchronous same-frame double-taps and executes the action exactly once', async () => {
    const states: boolean[] = [];
    const controller = createAsyncLockController({
      onLockChange: (locked) => states.push(locked),
    });

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const spy = vi.fn(async () => {
      await firstGate;
      return 'saved-id-1';
    });

    // Two taps 0ms apart (before any React re-render could disable a button)
    const p1 = controller.run(spy);
    const p2 = controller.run(spy);
    expect(controller.isLocked()).toBe(true);

    const secondResult = await p2;
    expect(secondResult).toEqual({ skipped: true });
    expect(spy).toHaveBeenCalledTimes(1);

    releaseFirst();
    const firstResult = await p1;
    expect(firstResult).toEqual({ skipped: false, value: 'saved-id-1' });
    expect(controller.isLocked()).toBe(false);
    expect(states).toEqual([true, false]);

    // Subsequent intentional tap after settle runs normally
    const p3 = await controller.run(() => 'saved-id-2');
    expect(p3).toEqual({ skipped: false, value: 'saved-id-2' });
    expect(spy).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('always releases the lock in finally when the async save rejects', async () => {
    const states: boolean[] = [];
    const controller = createAsyncLockController({
      onLockChange: (locked) => states.push(locked),
    });

    await expect(
      controller.run(async () => {
        throw new Error('QuotaExceededError');
      })
    ).rejects.toThrow('QuotaExceededError');

    expect(controller.isLocked()).toBe(false);
    expect(states).toEqual([true, false]);

    // Confirm recovery tap works immediately after error
    const retry = await controller.run(async () => 'recovered');
    expect(retry).toEqual({ skipped: false, value: 'recovered' });
    controller.dispose();
  });

  it('enforces post-settle cooldown cleanly and stops emitting after dispose()', async () => {
    vi.useFakeTimers();
    try {
      const states: boolean[] = [];
      const controller = createAsyncLockController({
        postSettleCooldownMs: 250,
        onLockChange: (locked) => states.push(locked),
      });

      const res = await controller.run(async () => 42);
      expect(res).toEqual({ skipped: false, value: 42 });
      expect(controller.isLocked()).toBe(true);

      // Bounce tap during cooldown is rejected cleanly
      const bounce = await controller.run(async () => 99);
      expect(bounce).toEqual({ skipped: true });

      vi.advanceTimersByTime(249);
      expect(controller.isLocked()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(controller.isLocked()).toBe(false);
      expect(states).toEqual([true, false]);

      // Disposal cancels any pending state notifications
      expect(controller.isDisposed()).toBe(false);
      await controller.run(async () => 'before-unmount');
      controller.dispose();
      expect(controller.isDisposed()).toBe(true);
      vi.advanceTimersByTime(500);
      expect(states).toEqual([true, false, true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('isolates concurrent inline quick actions per key and never deadlocks unrelated rows', async () => {
    const keyUpdates: string[][] = [];
    const keyed = createAsyncKeyedLockController({
      onKeysChange: (keys) => keyUpdates.push(keys),
    });

    let resolveRowA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      resolveRowA = resolve;
    });

    const rowASpy = vi.fn(async () => {
      await gateA;
      return 'row-a-done';
    });
    const rowBSpy = vi.fn(async () => 'row-b-done');

    const pA1 = keyed.run('task-a', rowASpy);
    const pA2 = keyed.run('task-a', rowASpy);
    const pB = keyed.run('task-b', rowBSpy);

    expect(keyed.isLocked('task-a')).toBe(true);
    expect(await pA2).toEqual({ skipped: true });
    expect(await pB).toEqual({ skipped: false, value: 'row-b-done' });
    expect(rowASpy).toHaveBeenCalledTimes(1);
    expect(rowBSpy).toHaveBeenCalledTimes(1);

    resolveRowA();
    expect(await pA1).toEqual({ skipped: false, value: 'row-a-done' });
    expect(keyed.isLocked('task-a')).toBe(false);
    expect(keyed.getLockedKeys()).toEqual([]);
    expect(keyUpdates.length).toBeGreaterThanOrEqual(4);
    expect(keyed.isDisposed()).toBe(false);
    keyed.dispose();
    expect(keyed.isDisposed()).toBe(true);
  });
});
