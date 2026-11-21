/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Manual Service Worker Update Governor (`auto` / `notify` / `pinned`),
 * Uncached `version.json` / `status.json` Upgrade Gate & controllerchange Single-Reload Handshake.
 *
 * Replaces blind `autoUpdate` reloads so cached PWA updates never swap chunks under
 * an open editing modal, never install revoked releases, and respect pinned hold policies.
 */

import { useEffect, useState } from 'react';
import { CURRENT_BACKUP_SCHEMA_VERSION } from '../core/backupVault';
import {
  CURRENT_APP_VERSION,
  evaluateUpgradeGate,
  parseStatusManifestJson,
  parseVersionManifestJson,
  StatusManifest,
  UpgradeGateDecision,
  VersionManifest,
} from '../core/upgradeGate';
import { markCleanSessionExit } from './crashLogger';
import {
  getAdjustedNowIsoUtc,
  getEffectiveOnlineStatus,
  recordServerDateHeaderSkew,
} from './storageProtection';

export type PwaUpdatePolicy = 'auto' | 'notify' | 'pinned';

const PWA_UPDATE_POLICY_KEY = 'pedigree_pwa_update_policy_v1';

export interface PwaUpdateState {
  updateAvailable: boolean;
  offlineReady: boolean;
  applying: boolean;
  dismissed: boolean;
  policy: PwaUpdatePolicy;
  checking: boolean;
  lastCheckedAtIso: string | null;
  remoteVersion: VersionManifest | null;
  remoteStatus: StatusManifest | null;
  gateDecision: UpgradeGateDecision | null;
  preUpgradeBackupVerified: boolean;
}

type RegisterSwFn = (options?: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
}) => (reloadPage?: boolean) => Promise<void>;

function readPersistedUpdatePolicy(): PwaUpdatePolicy {
  try {
    if (typeof localStorage === 'undefined') return 'auto';
    const raw = localStorage.getItem(PWA_UPDATE_POLICY_KEY);
    if (raw === 'auto' || raw === 'notify' || raw === 'pinned') {
      return raw;
    }
  } catch {
    // Ignore restricted storage access
  }
  return 'auto';
}

const listeners = new Set<() => void>();

let currentState: PwaUpdateState = {
  updateAvailable: false,
  offlineReady: false,
  applying: false,
  dismissed: false,
  policy: readPersistedUpdatePolicy(),
  checking: false,
  lastCheckedAtIso: null,
  remoteVersion: null,
  remoteStatus: null,
  gateDecision: null,
  preUpgradeBackupVerified: false,
};

let triggerSwUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null;
let waitingRegistration: ServiceWorkerRegistration | null = null;
let controllerChangeAttached = false;
let refreshing = false;
let initialized = false;
let teardownLifecycleListeners: (() => void) | null = null;

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

export function getPwaUpdatePolicy(): PwaUpdatePolicy {
  return currentState.policy;
}

export function setPwaUpdatePolicy(policy: PwaUpdatePolicy): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PWA_UPDATE_POLICY_KEY, policy);
    }
  } catch {
    // Ignore storage restriction
  }
  setState({
    policy,
    dismissed: policy === 'pinned' ? currentState.dismissed : false,
  });
}

export function markPreUpgradeBackupVerified(verified: boolean): void {
  const nextDecision =
    currentState.remoteVersion || currentState.remoteStatus
      ? evaluateUpgradeGate({
          currentAppVersion: CURRENT_APP_VERSION,
          currentSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
          remoteVersion: currentState.remoteVersion,
          remoteStatus: currentState.remoteStatus,
          backupVerifiedForTarget: verified,
        })
      : currentState.gateDecision;

  setState({
    preUpgradeBackupVerified: verified,
    gateDecision: nextDecision,
  });
}

export function resetPwaUpdateManagerForTests(): void {
  if (teardownLifecycleListeners) {
    teardownLifecycleListeners();
    teardownLifecycleListeners = null;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PWA_UPDATE_POLICY_KEY);
    }
  } catch {
    // Ignore
  }
  currentState = {
    updateAvailable: false,
    offlineReady: false,
    applying: false,
    dismissed: false,
    policy: 'auto',
    checking: false,
    lastCheckedAtIso: null,
    remoteVersion: null,
    remoteStatus: null,
    gateDecision: null,
    preUpgradeBackupVerified: false,
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
      markCleanSessionExit();
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

async function fetchJsonNoStore(
  url: string,
  fetchFn: typeof fetch
): Promise<unknown | null> {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetchFn(`${url}${sep}_ts=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
    });
    const dateHdr = res.headers?.get?.('date');
    if (dateHdr) {
      recordServerDateHeaderSkew(dateHdr);
    }
    if (!res.ok) return null;
    const contentType = res.headers?.get?.('content-type') || '';
    if (contentType && !/json|text\/plain/i.test(contentType)) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchUpgradeGateDecision(options?: {
  fetchImpl?: typeof fetch;
  currentAppVersion?: string;
  currentSchemaVersion?: number;
}): Promise<UpgradeGateDecision | null> {
  const fetchFn =
    options?.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetchFn) return null;

  const [rawVersion, rawStatus] = await Promise.all([
    fetchJsonNoStore('./version.json', fetchFn),
    fetchJsonNoStore('./status.json', fetchFn),
  ]);

  const remoteVersion = parseVersionManifestJson(rawVersion);
  const remoteStatus = parseStatusManifestJson(rawStatus);

  if (!remoteVersion && !remoteStatus) {
    return currentState.gateDecision;
  }

  const decision = evaluateUpgradeGate({
    currentAppVersion: options?.currentAppVersion ?? CURRENT_APP_VERSION,
    currentSchemaVersion: options?.currentSchemaVersion ?? CURRENT_BACKUP_SCHEMA_VERSION,
    remoteVersion,
    remoteStatus,
    backupVerifiedForTarget: currentState.preUpgradeBackupVerified,
  });

  setState({
    remoteVersion: remoteVersion ?? currentState.remoteVersion,
    remoteStatus: remoteStatus ?? currentState.remoteStatus,
    gateDecision: decision,
    lastCheckedAtIso: getAdjustedNowIsoUtc(),
  });

  return decision;
}

export async function checkForPwaUpdateNow(options?: {
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<'checked' | 'pinned' | 'offline' | 'blocked' | 'unavailable'> {
  if (currentState.policy === 'pinned' && !options?.force) {
    return 'pinned';
  }
  if (!getEffectiveOnlineStatus()) {
    return 'offline';
  }

  setState({ checking: true });
  try {
    const decision = await fetchUpgradeGateDecision({ fetchImpl: options?.fetchImpl });
    if (decision && (decision.status === 'blocked_revoked' || decision.status === 'blocked_paused')) {
      return 'blocked';
    }
    if (waitingRegistration && typeof waitingRegistration.update === 'function') {
      await waitingRegistration.update();
      return 'checked';
    }
    return decision ? 'checked' : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    setState({ checking: false, lastCheckedAtIso: getAdjustedNowIsoUtc() });
  }
}

export function initPwaUpdater(registerSWImpl: RegisterSwFn): void {
  if (initialized) return;
  initialized = true;

  attachControllerChangeReloadGuard();

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (currentState.policy !== 'auto') return;
      if (!getEffectiveOnlineStatus()) return;
      void checkForPwaUpdateNow();
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    teardownLifecycleListeners = () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }

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

        if (currentState.policy === 'auto' && getEffectiveOnlineStatus()) {
          void checkForPwaUpdateNow();
        }
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

export async function applyPwaUpdateNow(options?: {
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  if (currentState.applying) return false;
  if (currentState.policy === 'pinned') return false;
  setState({ applying: true });

  try {
    const preflightDecision = getEffectiveOnlineStatus() || options?.fetchImpl
      ? await fetchUpgradeGateDecision({ fetchImpl: options?.fetchImpl })
      : currentState.gateDecision;

    if (preflightDecision && !preflightDecision.canProceedWithDirectSwSwap) {
      setState({ applying: false, gateDecision: preflightDecision });
      return false;
    }

    if (triggerSwUpdate) {
      await triggerSwUpdate(true);
      return true;
    }
    if (waitingRegistration?.waiting) {
      waitingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return true;
    }
    setState({ applying: false });
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
  setPolicy: (policy: PwaUpdatePolicy) => void;
  checkNow: (force?: boolean) => Promise<'checked' | 'pinned' | 'offline' | 'blocked' | 'unavailable'>;
  markBackupVerified: (verified: boolean) => void;
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
    applyUpdate: () => applyPwaUpdateNow(),
    dismissUpdate: dismissPwaUpdateBanner,
    setPolicy: setPwaUpdatePolicy,
    checkNow: (force?: boolean) => checkForPwaUpdateNow({ force }),
    markBackupVerified: markPreUpgradeBackupVerified,
  };
}
