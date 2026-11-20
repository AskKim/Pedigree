/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Storage Protection, Quota Guardrails, Rolling Local Backups, & PWA Install State.
 */

import { useCallback, useEffect, useState } from 'react';
import { getTierStoragePolicy } from '../core/deviceCapability';
import {
  BarnDatabaseSnapshot,
  getCoreClockSkewMs,
  nowEpochMs,
  nowIsoUtc,
  setCoreClockSkewMs,
} from '../core/models';
import {
  DiagnosticQuotaOperationKind,
  evaluateStorageQuotaForOperation,
  StorageQuotaEvaluationResult,
} from '../core/techyStuffGuardrails';
import { logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import { NativeContainerInfo, pedigreeBridge } from '../native/pedigreeBridge';
import { isOpfsSupported } from './opfsTempStream';
import { stripPhotoDataUrlsFromSnapshot } from './photoHydration';

const ROLLING_IDB_NAME = 'community_pedigree_rolling_backups';
const ROLLING_STORE_NAME = 'snapshots';
const MAX_ROLLING_BACKUPS = 3;
const ROLLING_IDB_TIMEOUT_MS = 7000;

function estimateSnapshotByteSize(snapshot: BarnDatabaseSnapshot): number {
  let bytes = 512;
  bytes += (snapshot.speciesProfiles?.length || 0) * 480;
  bytes += (snapshot.animals?.length || 0) * 650;
  bytes += (snapshot.cages?.length || 0) * 200;
  bytes += (snapshot.breedings?.length || 0) * 350;
  bytes += (snapshot.tasks?.length || 0) * 240;
  bytes += (snapshot.careLogs?.length || 0) * 300;
  bytes += (snapshot.shows?.length || 0) * 280;
  for (const photo of snapshot.animalPhotos ?? []) {
    const estimatedDataUrlBytes =
      photo.dataUrl?.length || (photo.storedBytes ? Math.ceil(photo.storedBytes * 1.37) : 0);
    bytes += 220 + estimatedDataUrlBytes + (photo.thumbnailDataUrl?.length || 0);
  }
  return bytes;
}

export interface StorageProtectionStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  checkedAtIso: string;
  isNativeWrapper: boolean;
  nativeContainerInfo: NativeContainerInfo | null;
}

export interface RollingBackupMeta {
  key: string;
  savedAtIso: string;
  animalCount: number;
  photoCount: number;
  speciesCount: number;
  byteSize: number;
}

interface StoredRollingBackup extends RollingBackupMeta {
  snapshot: BarnDatabaseSnapshot;
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    (typeof e.message === 'string' && /quota/i.test(e.message))
  );
}

export async function requestPersistentStorage(): Promise<StorageProtectionStatus> {
  const checkedAtIso = getAdjustedNowIsoUtc();
  const isNativeWrapper = pedigreeBridge.isNativeWrapper();
  const nativeInfoPromise = isNativeWrapper
    ? pedigreeBridge.getNativeContainerInfo(400)
    : Promise.resolve(null);

  if (typeof navigator === 'undefined' || !navigator.storage) {
    const nativeContainerInfo = await nativeInfoPromise;
    return {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      checkedAtIso,
      isNativeWrapper,
      nativeContainerInfo,
    };
  }

  // Never spoof navigator.storage.persisted() — Android WebView returns false honestly.
  let persisted = false;
  try {
    if (navigator.storage.persisted) {
      persisted = await navigator.storage.persisted();
    }
    if (!persisted && navigator.storage.persist) {
      persisted = await navigator.storage.persist();
    }
  } catch {
    persisted = false;
  }

  let usageBytes = 0;
  let quotaBytes = 0;
  try {
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usageBytes = Number(est.usage) || 0;
      quotaBytes = Number(est.quota) || 0;
    }
  } catch {
    // Ignore estimate failure
  }

  const nativeContainerInfo = await nativeInfoPromise;
  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;

  return {
    supported: true,
    persisted,
    usageBytes,
    quotaBytes,
    percentUsed,
    checkedAtIso,
    isNativeWrapper,
    nativeContainerInfo,
  };
}

export async function checkStorageStatus(): Promise<StorageProtectionStatus> {
  const checkedAtIso = getAdjustedNowIsoUtc();
  const isNativeWrapper = pedigreeBridge.isNativeWrapper();
  const nativeInfoPromise = isNativeWrapper
    ? pedigreeBridge.getNativeContainerInfo(400)
    : Promise.resolve(null);

  if (typeof navigator === 'undefined' || !navigator.storage) {
    const nativeContainerInfo = await nativeInfoPromise;
    return {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      checkedAtIso,
      isNativeWrapper,
      nativeContainerInfo,
    };
  }
  let persisted = false;
  let usageBytes = 0;
  let quotaBytes = 0;
  try {
    if (navigator.storage.persisted) {
      persisted = await navigator.storage.persisted();
    }
    if (navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      usageBytes = Number(est.usage) || 0;
      quotaBytes = Number(est.quota) || 0;
    }
  } catch {
    // Ignore
  }
  const nativeContainerInfo = await nativeInfoPromise;
  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;
  return {
    supported: true,
    persisted,
    usageBytes,
    quotaBytes,
    percentUsed,
    checkedAtIso,
    isNativeWrapper,
    nativeContainerInfo,
  };
}

function openRollingIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Rolling backup IndexedDB open timed out after ${ROLLING_IDB_TIMEOUT_MS}ms — bypassing rolling backup`,
      });
      reject(new Error('Rolling backup IndexedDB open timeout'));
    }, ROLLING_IDB_TIMEOUT_MS);

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err ?? 'Rolling IndexedDB error')));
    };

    try {
      const req = indexedDB.open(ROLLING_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(ROLLING_STORE_NAME)) {
            db.createObjectStore(ROLLING_STORE_NAME, { keyPath: 'key' });
          }
        } catch (upgradeErr) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(
                ROLLING_IDB_NAME,
                'Rolling backup IndexedDB schema upgrade failed'
              )
            )
            .catch(() => {});
          finishReject(upgradeErr);
        }
      };
      req.onblocked = () => {
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: 'Corrective action: Rolling backup IndexedDB upgrade blocked by another tab — continuing without blocking UI',
        });
      };
      req.onsuccess = () => {
        if (settled) {
          try {
            req.result.close();
          } catch {
            // Ignore close failure
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      };
      req.onerror = () => {
        const err = req.error;
        if (err && (err.name === 'VersionError' || /version/i.test(String(err.message || '')))) {
          void import('./opfsStorage')
            .then((m) =>
              m.dumpIndexedDbDatabaseToOpfs(
                ROLLING_IDB_NAME,
                'Rolling backup IndexedDB VersionError'
              )
            )
            .catch(() => {});
        }
        finishReject(err);
      };
    } catch (err) {
      finishReject(err);
    }
  });
}

export async function saveRollingSnapshotBackup(
  snapshot: BarnDatabaseSnapshot,
  options?: {
    maxRollingBackups?: number;
    dehydratePhotos?: boolean;
  }
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const policy = getTierStoragePolicy(detectCurrentDeviceCapability().tier);
    const maxRollingCap = Math.max(
      1,
      options?.maxRollingBackups ?? policy.rollingIdbCap ?? MAX_ROLLING_BACKUPS
    );
    const shouldDehydrate = options?.dehydratePhotos ?? policy.dehydrateMirrorPhotos;
    const targetSnapshot = shouldDehydrate
      ? stripPhotoDataUrlsFromSnapshot(snapshot)
      : snapshot;

    const entry: StoredRollingBackup = {
      key: `rolling-${getAdjustedNowMs()}`,
      savedAtIso: getAdjustedNowIsoUtc(),
      animalCount: targetSnapshot.animals.length,
      photoCount: (targetSnapshot.animalPhotos ?? []).length,
      speciesCount: targetSnapshot.speciesProfiles.length,
      byteSize: estimateSnapshotByteSize(targetSnapshot),
      snapshot: targetSnapshot,
    };
    const db = await openRollingIdb();
    const closeDb = () => {
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readwrite');
        const store = tx.objectStore(ROLLING_STORE_NAME);
        store.put(entry);

        const metas: Array<{ key: string; savedAtIso: string }> = [];
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            const val = cursor.value as Partial<StoredRollingBackup> | undefined;
            if (val?.key) {
              metas.push({
                key: val.key,
                savedAtIso: typeof val.savedAtIso === 'string' ? val.savedAtIso : '',
              });
            }
            cursor.continue();
          } else {
            metas.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
            for (let i = maxRollingCap; i < metas.length; i++) {
              store.delete(metas[i].key);
            }
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Rolling backup write aborted'));
      });
    } finally {
      closeDb();
    }
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: isQuotaExceededError(err) ? 'memory' : 'storage',
      message: 'Corrective action: Skipped rolling snapshot backup write so primary save remains unaffected',
      error: err,
    });
  }
}

export async function listRollingSnapshotBackups(): Promise<RollingBackupMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openRollingIdb();
    try {
      return await new Promise<RollingBackupMeta[]>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readonly');
        const store = tx.objectStore(ROLLING_STORE_NAME);
        const items: RollingBackupMeta[] = [];
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const rec = cursor.value as Partial<StoredRollingBackup> | undefined;
            if (rec && typeof rec.key === 'string') {
              items.push({
                key: rec.key,
                savedAtIso: typeof rec.savedAtIso === 'string' ? rec.savedAtIso : '',
                animalCount: Number(rec.animalCount) || 0,
                photoCount:
                  typeof rec.photoCount === 'number'
                    ? rec.photoCount
                    : Array.isArray(rec.snapshot?.animalPhotos)
                    ? rec.snapshot.animalPhotos.length
                    : 0,
                speciesCount: Number(rec.speciesCount) || 0,
                byteSize: Number(rec.byteSize) || 0,
              });
            }
            cursor.continue();
          } else {
            items.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
            resolve(items);
          }
        };
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error || new Error('Rolling backup list aborted'));
      });
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    }
  } catch {
    return [];
  }
}

export async function loadRollingSnapshotBackup(
  key: string
): Promise<BarnDatabaseSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openRollingIdb();
    try {
      return await new Promise<BarnDatabaseSnapshot | null>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readonly');
        const req = tx.objectStore(ROLLING_STORE_NAME).get(key);
        req.onsuccess = () => {
          const rec = req.result as StoredRollingBackup | undefined;
          const snap = rec?.snapshot;
          if (
            !snap ||
            typeof snap !== 'object' ||
            !snap.settings ||
            !Array.isArray(snap.animals) ||
            !Array.isArray(snap.speciesProfiles)
          ) {
            resolve(null);
            return;
          }
          resolve(snap);
        };
        req.onerror = () => reject(req.error);
        tx.onabort = () => reject(tx.error || new Error('Rolling backup load aborted'));
      });
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    }
  } catch {
    return null;
  }
}

export async function deleteRollingSnapshotBackup(key: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openRollingIdb();
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const tx = db.transaction(ROLLING_STORE_NAME, 'readwrite');
        tx.objectStore(ROLLING_STORE_NAME).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Rolling backup delete aborted'));
      });
    } finally {
      try {
        db.close();
      } catch {
        // Ignore close failure
      }
    }
  } catch {
    return false;
  }
}

// Manual Offline Mode Toggle & Timed Connectivity Probe
const MANUAL_OFFLINE_STORAGE_KEY = 'pedigree_manual_offline_v1';
const CLOCK_SKEW_STORAGE_KEY = 'pedigree_clock_skew_ms_v1';
export const CLOCK_DRIFT_WARNING_THRESHOLD_MS = 5 * 60_000; // 5 minutes

export type ConnectivityReason =
  | 'online'
  | 'manual_offline'
  | 'navigator_offline'
  | 'captive_or_unreachable';

export interface ConnectivityStatusSnapshot {
  navigatorOnline: boolean;
  manualOffline: boolean;
  probeStatus: 'idle' | 'probing' | 'reachable' | 'unreachable';
  probeDetail: string;
  lastProbeAtIso: string | null;
  clockSkewMs: number | null;
  clockDriftWarning: boolean;
  isEffectivelyOnline: boolean;
  reason: ConnectivityReason;
}

function readPersistedManualOffline(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(MANUAL_OFFLINE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function readPersistedClockSkewMs(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CLOCK_SKEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let manualOfflineState: boolean = readPersistedManualOffline();
let probeStatusState: ConnectivityStatusSnapshot['probeStatus'] = 'idle';
let probeDetailState = '';
let lastProbeAtIsoState: string | null = null;
let clockSkewMsState: number | null = readPersistedClockSkewMs();
setCoreClockSkewMs(clockSkewMsState);
const connectivityListeners = new Set<() => void>();
let browserConnectivityHooksAttached = false;

function computeConnectivityReason(
  navigatorOnline: boolean,
  manualOffline: boolean,
  probeStatus: ConnectivityStatusSnapshot['probeStatus']
): ConnectivityReason {
  if (manualOffline) return 'manual_offline';
  if (!navigatorOnline) return 'navigator_offline';
  if (probeStatus === 'unreachable') return 'captive_or_unreachable';
  return 'online';
}

export function getRecordedClockSkewMs(): number | null {
  return clockSkewMsState;
}

export function getAdjustedNowMs(): number {
  const skew = clockSkewMsState;
  if (skew === null || !Number.isFinite(skew)) return Date.now();
  return nowEpochMs();
}

export function getAdjustedNowIsoUtc(): string {
  if (clockSkewMsState !== getCoreClockSkewMs()) {
    setCoreClockSkewMs(clockSkewMsState);
  }
  return nowIsoUtc();
}

export function formatClockSkewHuman(skewMs: number | null | undefined): string {
  if (skewMs === null || skewMs === undefined || !Number.isFinite(skewMs)) {
    return '0 min';
  }
  const absMins = Math.round(Math.abs(skewMs) / 60_000);
  const direction = skewMs > 0 ? 'behind server time' : 'ahead of server time';
  if (absMins >= 120) {
    const hours = (absMins / 60).toFixed(1).replace(/\.0$/, '');
    return `${hours} hr ${direction}`;
  }
  return `${Math.max(1, absMins)} min ${direction}`;
}

export function recordServerDateHeaderSkew(
  dateHeader: string | null | undefined,
  localNowMs: number = Date.now()
): number | null {
  if (!dateHeader || typeof dateHeader !== 'string') return null;
  const parsedServerMs = Date.parse(dateHeader);
  if (!Number.isFinite(parsedServerMs) || parsedServerMs <= 0) return null;
  const skewMs = parsedServerMs - localNowMs;
  clockSkewMsState = skewMs;
  setCoreClockSkewMs(skewMs);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CLOCK_SKEW_STORAGE_KEY, String(Math.round(skewMs)));
    }
  } catch {
    // Non-fatal in private browsing
  }
  notifyConnectivityListeners();
  return skewMs;
}

export function getConnectivitySnapshot(): ConnectivityStatusSnapshot {
  const navigatorOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  const reason = computeConnectivityReason(navigatorOnline, manualOfflineState, probeStatusState);
  const clockDriftWarning =
    clockSkewMsState !== null &&
    Number.isFinite(clockSkewMsState) &&
    Math.abs(clockSkewMsState) >= CLOCK_DRIFT_WARNING_THRESHOLD_MS;
  return {
    navigatorOnline,
    manualOffline: manualOfflineState,
    probeStatus: probeStatusState,
    probeDetail: probeDetailState,
    lastProbeAtIso: lastProbeAtIsoState,
    clockSkewMs: clockSkewMsState,
    clockDriftWarning,
    isEffectivelyOnline: reason === 'online',
    reason,
  };
}

function notifyConnectivityListeners(): void {
  for (const listener of connectivityListeners) {
    listener();
  }
}

export function isManualOfflineMode(): boolean {
  return manualOfflineState;
}

export function getEffectiveOnlineStatus(): boolean {
  return getConnectivitySnapshot().isEffectivelyOnline;
}

export function setManualOfflineMode(enabled: boolean): void {
  manualOfflineState = Boolean(enabled);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MANUAL_OFFLINE_STORAGE_KEY, manualOfflineState ? 'true' : 'false');
    }
  } catch {
    // Non-fatal in private browsing
  }
  if (manualOfflineState) {
    probeDetailState = 'Manual App Offline Mode active — network actions held locally.';
  } else if (probeStatusState === 'unreachable') {
    probeStatusState = 'idle';
    probeDetailState = '';
  }
  notifyConnectivityListeners();
}

export function resetConnectivityStateForTests(): void {
  manualOfflineState = false;
  probeStatusState = 'idle';
  probeDetailState = '';
  lastProbeAtIsoState = null;
  clockSkewMsState = null;
  setCoreClockSkewMs(0);
  connectivityListeners.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(MANUAL_OFFLINE_STORAGE_KEY);
      localStorage.removeItem(CLOCK_SKEW_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export async function probeNetworkConnectivity(options?: {
  timeoutMs?: number;
  probeUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<ConnectivityStatusSnapshot> {
  const snapBefore = getConnectivitySnapshot();
  if (snapBefore.manualOffline) {
    probeStatusState = 'idle';
    probeDetailState = 'Skipped probe: Manual App Offline Mode is enabled.';
    notifyConnectivityListeners();
    return getConnectivitySnapshot();
  }
  if (!snapBefore.navigatorOnline) {
    probeStatusState = 'unreachable';
    probeDetailState = 'Browser reports no network interface connection.';
    lastProbeAtIsoState = getAdjustedNowIsoUtc();
    notifyConnectivityListeners();
    return getConnectivitySnapshot();
  }

  const fetchFn = options?.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!fetchFn) {
    probeStatusState = 'unreachable';
    probeDetailState = 'Fetch API unavailable to probe connectivity.';
    notifyConnectivityListeners();
    return getConnectivitySnapshot();
  }

  probeStatusState = 'probing';
  probeDetailState = 'Checking live reachability...';
  notifyConnectivityListeners();

  const timeoutMs = Math.max(500, options?.timeoutMs ?? 3500);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const baseProbeUrl = options?.probeUrl || './version.json';
    const sep = baseProbeUrl.includes('?') ? '&' : '?';
    const res = await fetchFn(`${baseProbeUrl}${sep}_probe=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller?.signal,
    });

    const dateHdr = res.headers?.get?.('date');
    if (dateHdr) {
      recordServerDateHeaderSkew(dateHdr);
    }

    if (!res.ok) {
      probeStatusState = 'unreachable';
      probeDetailState = `Probe returned HTTP ${res.status} (offline or captive Wi-Fi portal).`;
    } else {
      const contentType = res.headers?.get?.('content-type') || '';
      if (contentType && !/json|text\/plain/i.test(contentType)) {
        probeStatusState = 'unreachable';
        probeDetailState = 'Unexpected captive portal or proxy response instead of app manifest.';
      } else {
        await res.json();
        probeStatusState = 'reachable';
        probeDetailState = 'Live app manifest reachable.';
      }
    }
  } catch (err) {
    probeStatusState = 'unreachable';
    const isAbort = err instanceof Error && err.name === 'AbortError';
    probeDetailState = isAbort
      ? `Connectivity probe timed out after ${timeoutMs}ms (captive Wi-Fi or dead zone).`
      : 'Network unreachable during connectivity probe — holding edits locally.';
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
    lastProbeAtIsoState = getAdjustedNowIsoUtc();
    notifyConnectivityListeners();
  }

  return getConnectivitySnapshot();
}

export function useConnectivityStatus(): ConnectivityStatusSnapshot & {
  setManualOffline: (enabled: boolean) => void;
  probeNow: (options?: { timeoutMs?: number }) => Promise<ConnectivityStatusSnapshot>;
} {
  const [snap, setSnap] = useState<ConnectivityStatusSnapshot>(getConnectivitySnapshot);

  useEffect(() => {
    const sync = () => setSnap(getConnectivitySnapshot());
    connectivityListeners.add(sync);

    if (!browserConnectivityHooksAttached && typeof window !== 'undefined') {
      browserConnectivityHooksAttached = true;
      const handleBrowserOnline = () => {
        if (probeStatusState === 'unreachable') {
          probeStatusState = 'idle';
          probeDetailState = '';
        }
        notifyConnectivityListeners();
      };
      const handleBrowserOffline = () => {
        notifyConnectivityListeners();
      };
      window.addEventListener('online', handleBrowserOnline);
      window.addEventListener('offline', handleBrowserOffline);
    }

    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();

    return () => {
      connectivityListeners.delete(sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const probeNow = useCallback(
    (opts?: { timeoutMs?: number }) => probeNetworkConnectivity(opts),
    []
  );

  return {
    ...snap,
    setManualOffline: setManualOfflineMode,
    probeNow,
  };
}

export function useOnlineStatus(): boolean {
  return useConnectivityStatus().isEffectivelyOnline;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hasMsStream =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { MSStream?: unknown }).MSStream);
  const isTraditionalIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !hasMsStream;
  const isIpadOsDesktopUa =
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;
  return isTraditionalIos || isIpadOsDesktopUa;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const legacyStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  if (legacyStandalone) return true;
  try {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(display-mode: standalone)').matches;
    }
  } catch {
    // Ignore unsupported matchMedia in legacy WebViews
  }
  return false;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(isStandalonePwa);
  const [isIos] = useState<boolean>(isIosBrowser);

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    const onMqChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    let usingLegacyListener = false;

    try {
      if (typeof window.matchMedia === 'function') {
        mq = window.matchMedia('(display-mode: standalone)');
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', onMqChange);
        } else if (typeof mq.addListener === 'function') {
          mq.addListener(onMqChange);
          usingLegacyListener = true;
          logDiagnosticEvent({
            level: 'info',
            category: 'runtime',
            message: 'Corrective action: Used legacy MediaQueryList.addListener fallback for standalone PWA detection',
          });
        }
      }
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message: 'Corrective action: matchMedia listener unavailable in this browser — continuing without display-mode listener',
        error: err,
      });
      mq = null;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      try {
        if (mq) {
          if (!usingLegacyListener && typeof mq.removeEventListener === 'function') {
            mq.removeEventListener('change', onMqChange);
          } else if (typeof mq.removeListener === 'function') {
            mq.removeListener(onMqChange);
          }
        }
      } catch {
        // Ignore cleanup failure
      }
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstalled(true);
    }
    return outcome;
  }, [deferredPrompt]);

  return {
    canPromptInstall: !pedigreeBridge.isNativeWrapper() && Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isIos,
    promptInstall,
  };
}

export interface DiagnosticQuotaPreflightResult extends StorageQuotaEvaluationResult {
  statusSnapshot: StorageProtectionStatus;
}

/**
 * Checks OPFS availability and IndexedDB/StorageManager quota headroom before running
 * heavy diagnostic ZIP dumps, photo re-optimization, or cache clearing / DB rebuilds.
 */
export async function verifyStorageQuotaForDiagnosticAction(options: {
  operation: DiagnosticQuotaOperationKind;
  operationLabel: string;
  estimatedRequiredBytes: number;
  requiresOpfsPreferred?: boolean;
}): Promise<DiagnosticQuotaPreflightResult> {
  const statusSnapshot = await checkStorageStatus();
  const opfsSupported = isOpfsSupported();
  const evalResult = evaluateStorageQuotaForOperation({
    operation: options.operation,
    operationLabel: options.operationLabel,
    estimatedRequiredBytes: options.estimatedRequiredBytes,
    storageStatus: statusSnapshot,
    opfsSupported,
    requiresOpfsPreferred: options.requiresOpfsPreferred,
  });

  if (evalResult.level !== 'ok') {
    logDiagnosticEvent({
      level: evalResult.level === 'blocked' ? 'error' : 'warn',
      category: 'storage',
      message: `${evalResult.headline}: ${evalResult.detail}`,
    });
  }

  return {
    ...evalResult,
    statusSnapshot,
  };
}

