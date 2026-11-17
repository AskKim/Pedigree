/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Storage Protection, Quota Guardrails, Rolling Local Backups, & PWA Install State.
 */

import { useCallback, useEffect, useState } from 'react';
import { BarnDatabaseSnapshot, nowIsoUtc } from '../core/models';
import { logDiagnosticEvent } from './crashLogger';

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
  const checkedAtIso = nowIsoUtc();
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      checkedAtIso,
    };
  }

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

  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;

  return {
    supported: true,
    persisted,
    usageBytes,
    quotaBytes,
    percentUsed,
    checkedAtIso,
  };
}

export async function checkStorageStatus(): Promise<StorageProtectionStatus> {
  const checkedAtIso = nowIsoUtc();
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return {
      supported: false,
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      checkedAtIso,
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
  const percentUsed =
    quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10) : 0;
  return {
    supported: true,
    persisted,
    usageBytes,
    quotaBytes,
    percentUsed,
    checkedAtIso,
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

export async function saveRollingSnapshotBackup(snapshot: BarnDatabaseSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const entry: StoredRollingBackup = {
      key: `rolling-${Date.now()}`,
      savedAtIso: nowIsoUtc(),
      animalCount: snapshot.animals.length,
      photoCount: (snapshot.animalPhotos ?? []).length,
      speciesCount: snapshot.speciesProfiles.length,
      byteSize: estimateSnapshotByteSize(snapshot),
      snapshot,
    };
    const db = await openRollingIdb();
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
          for (let i = MAX_ROLLING_BACKUPS; i < metas.length; i++) {
            store.delete(metas[i].key);
          }
        }
      };

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
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
          db.close();
          items.sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso));
          resolve(items);
        }
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
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
    return await new Promise<BarnDatabaseSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(ROLLING_STORE_NAME, 'readonly');
      const req = tx.objectStore(ROLLING_STORE_NAME).get(key);
      req.onsuccess = () => {
        db.close();
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
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteRollingSnapshotBackup(key: string): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const db = await openRollingIdb();
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(ROLLING_STORE_NAME, 'readwrite');
      tx.objectStore(ROLLING_STORE_NAME).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    return false;
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
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
    canPromptInstall: Boolean(deferredPrompt) && !isInstalled,
    isInstalled,
    isIos,
    promptInstall,
  };
}
