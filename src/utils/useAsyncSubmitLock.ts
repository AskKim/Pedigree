/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Synchronous + React Rapid-Tap / Double-Submit Race Guard (`src/utils/useAsyncSubmitLock.ts`).
 *
 * Guarantees:
 * - Immediate synchronous `ref` gating blocks <16ms same-frame double-taps before React re-renders.
 * - Guaranteed `try/finally` release so rejected async saves never strand a button disabled.
 * - Optional short post-settle cooldown prevents bounce double-submissions on inline forms.
 * - `useAsyncKeyedLock` isolates concurrent actions per record/row ID for silent inline toggles.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncLockController {
  isLocked: () => boolean;
  isDisposed: () => boolean;
  run: <T>(fn: () => Promise<T> | T) => Promise<{ skipped: boolean; value?: T }>;
  dispose: () => void;
}

export function createAsyncLockController(options?: {
  postSettleCooldownMs?: number;
  onLockChange?: (locked: boolean) => void;
}): AsyncLockController {
  let locked = false;
  let disposed = false;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  const cooldownMs = Math.max(0, options?.postSettleCooldownMs ?? 0);

  const setLocked = (next: boolean) => {
    if (locked === next) return;
    locked = next;
    if (!disposed) {
      options?.onLockChange?.(next);
    }
  };

  return {
    isLocked: () => locked,
    isDisposed: () => disposed,
    async run<T>(fn: () => Promise<T> | T): Promise<{ skipped: boolean; value?: T }> {
      if (locked || disposed) {
        return { skipped: true };
      }
      if (cooldownTimer !== null) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
      setLocked(true);
      try {
        const value = await fn();
        return { skipped: false, value };
      } finally {
        if (disposed) {
          locked = false;
        } else if (cooldownMs > 0) {
          cooldownTimer = setTimeout(() => {
            cooldownTimer = null;
            setLocked(false);
          }, cooldownMs);
        } else {
          setLocked(false);
        }
      }
    },
    dispose() {
      disposed = true;
      locked = false;
      if (cooldownTimer !== null) {
        clearTimeout(cooldownTimer);
        cooldownTimer = null;
      }
    },
  };
}

export interface AsyncKeyedLockController {
  isLocked: (key: string) => boolean;
  isDisposed: () => boolean;
  getLockedKeys: () => string[];
  run: <T>(key: string, fn: () => Promise<T> | T) => Promise<{ skipped: boolean; value?: T }>;
  dispose: () => void;
}

export function createAsyncKeyedLockController(options?: {
  onKeysChange?: (keys: string[]) => void;
}): AsyncKeyedLockController {
  const lockedKeys = new Set<string>();
  let disposed = false;

  const notify = () => {
    if (!disposed) {
      options?.onKeysChange?.(Array.from(lockedKeys));
    }
  };

  return {
    isLocked: (key: string) => lockedKeys.has(key),
    isDisposed: () => disposed,
    getLockedKeys: () => Array.from(lockedKeys),
    async run<T>(
      key: string,
      fn: () => Promise<T> | T
    ): Promise<{ skipped: boolean; value?: T }> {
      if (!key || disposed || lockedKeys.has(key)) {
        return { skipped: true };
      }
      lockedKeys.add(key);
      notify();
      try {
        const value = await fn();
        return { skipped: false, value };
      } finally {
        lockedKeys.delete(key);
        notify();
      }
    },
    dispose() {
      disposed = true;
      lockedKeys.clear();
    },
  };
}

export function useAsyncSubmitLock(options?: { postSettleCooldownMs?: number }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cooldownMs = options?.postSettleCooldownMs ?? 0;
  const cooldownMsRef = useRef(cooldownMs);
  cooldownMsRef.current = cooldownMs;

  const controllerRef = useRef<AsyncLockController | null>(null);
  if (!controllerRef.current || controllerRef.current.isDisposed()) {
    controllerRef.current = createAsyncLockController({
      postSettleCooldownMs: cooldownMsRef.current,
      onLockChange: (next) => setIsSubmitting(next),
    });
  }

  useEffect(() => {
    let controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      controller = createAsyncLockController({
        postSettleCooldownMs: cooldownMsRef.current,
        onLockChange: (next) => setIsSubmitting(next),
      });
      controllerRef.current = controller;
    }
    setIsSubmitting(controller.isLocked());
    return () => {
      controller.dispose();
    };
  }, []);

  const runLocked = useCallback(async <T>(fn: () => Promise<T> | T) => {
    const controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      return { skipped: true };
    }
    return controller.run(fn);
  }, []);

  const isLockedNow = useCallback(() => controllerRef.current?.isLocked() ?? false, []);

  return {
    isSubmitting,
    isLockedNow,
    runLocked,
  };
}

export function useAsyncKeyedLock() {
  const [lockedKeys, setLockedKeys] = useState<string[]>([]);

  const controllerRef = useRef<AsyncKeyedLockController | null>(null);
  if (!controllerRef.current || controllerRef.current.isDisposed()) {
    controllerRef.current = createAsyncKeyedLockController({
      onKeysChange: (keys) => setLockedKeys(keys),
    });
  }

  useEffect(() => {
    let controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      controller = createAsyncKeyedLockController({
        onKeysChange: (keys) => setLockedKeys(keys),
      });
      controllerRef.current = controller;
    }
    const currentKeys = controller.getLockedKeys();
    setLockedKeys((prev) =>
      prev.length === currentKeys.length && prev.every((k, i) => k === currentKeys[i])
        ? prev
        : currentKeys
    );
    return () => {
      controller.dispose();
    };
  }, []);

  const runKeyLocked = useCallback(async <T>(key: string, fn: () => Promise<T> | T) => {
    const controller = controllerRef.current;
    if (!controller || controller.isDisposed()) {
      return { skipped: true };
    }
    return controller.run(key, fn);
  }, []);

  const isKeyLocked = useCallback(
    (key: string) =>
      lockedKeys.indexOf(key) !== -1 || (controllerRef.current?.isLocked(key) ?? false),
    [lockedKeys]
  );

  return {
    lockedKeys,
    hasAnyLocked: lockedKeys.length > 0,
    isKeyLocked,
    runKeyLocked,
  };
}
