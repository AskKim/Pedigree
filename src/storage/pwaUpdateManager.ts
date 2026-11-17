/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Manual Service Worker Update Gate & controllerchange Single-Reload Handshake.
 *
 * Replaces blind `autoUpdate` reloads so cached PWA updates never swap chunks under
 * an open editing modal or trigger multi-tab reload races.
 */

import { useEffect, useState } from 'react';

export interface PwaUpdateState {
  updateAvailable: boolean;
  offlineReady: boolean;
  applying: boolean;
  dismissed: boolean;
}

type RegisterSwFn = (options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

const listeners = new Set<() => void>();

let currentState: PwaUpdateState = {
  updateAvailable: false,
  offlineReady: false,
  applying: false,
  dismissed: false,
};

let triggerSwUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let waitingRegistration: ServiceWorkerRegistration | null = null;
let controllerChangeAttached = false;
let refreshing = false;
let initialized = false;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setState(patch: Partial<PwaUpdateState>): void {
  currentState = { ...currentState, ...patch };
  notify();
}

export function getPwaUpdateState(): PwaUpdateState {
  return currentState;
}

export function resetPwaUpdateManagerForTests(): void {
  currentState = {
    updateAvailable: false,
    offlineReady: false,
    applying: false,
    dismissed: false,
  };
  triggerSwUpdate = null;
  waitingRegistration = null;
  controllerChangeAttached = false;
  refreshing = false;
  initialized = false;
  listeners.clear();
}

export function attachControllerChangeReloadGuard(
  swContainer: { addEventListener: (event: 'controllerchange', fn: () => void) => void } | undefined =
    typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined,
  reloadFn: () => void = () => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  }
): void {
  if (!swContainer || controllerChangeAttached) return;
  controllerChangeAttached = true;
  swContainer.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    reloadFn();
  });
}

export function initPwaUpdater(registerSWImpl: RegisterSwFn): void {
  if (initialized) return;
  initialized = true;

  attachControllerChangeReloadGuard();

  try {
    triggerSwUpdate = registerSWImpl({
      immediate: true,
      onNeedRefresh() {
        setState({ updateAvailable: true, dismissed: false });
      },
      onOfflineReady() {
        setState({ offlineReady: true });
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        waitingRegistration = registration;
        if (registration.waiting) {
          setState({ updateAvailable: true, dismissed: false });
        }
        registration.addEventListener?.('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker?.controller) {
              setState({ updateAvailable: true, dismissed: false });
            }
          });
        });
      },
    });
  } catch {
    // Non-fatal in restricted/private environments without Service Worker support
  }
}

export function dismissPwaUpdateBanner(): void {
  setState({ dismissed: true });
}

export function hasBlockingModalOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[role="dialog"]'));
}

export async function applyPwaUpdateNow(): Promise<boolean> {
  if (currentState.applying) return false;
  setState({ applying: true });

  try {
    if (triggerSwUpdate) {
      await triggerSwUpdate(true);
      return true;
    }
    if (waitingRegistration?.waiting) {
      waitingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    }
    return false;
  } catch {
    setState({ applying: false });
    return false;
  }
}

export function usePwaUpdateStatus(): {
  state: PwaUpdateState;
  applyUpdate: () => Promise<boolean>;
  dismissUpdate: () => void;
} {
  const [state, setLocalState] = useState<PwaUpdateState>(currentState);

  useEffect(() => {
    const sync = () => setLocalState(currentState);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  return {
    state,
    applyUpdate: applyPwaUpdateNow,
    dismissUpdate: dismissPwaUpdateBanner,
  };
}
