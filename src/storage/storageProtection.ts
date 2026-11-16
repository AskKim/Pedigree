/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Storage Protection, Quota Guardrails, Rolling Local Backups, & PWA Install State.
 */

import { useCallback, useEffect, useState } from 'react';
import { BarnDatabaseSnapshot, nowIsoUtc } from '../core/models';

const ROLLING_IDB_NAME = 'community_pedigree_rolling_backups';
const ROLLING_STORE_NAME = 'snapshots';
const MAX_ROLLING_BACKUPS = 3;

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
    const req = indexedDB.open(ROLLING_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ROLLING_STORE_NAME)) {
        db.createObjectStore(ROLLING_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRollingSnapshotBackup(snapshot: BarnDatabaseSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const serialized = JSON.stringify(snapshot);
    const entry: StoredRollingBackup = {
      key: `rolling-${Date.now()}`,
      savedAtIso: nowIsoUtc(),
      animalCount: snapshot.animals.length,
      photoCount: (snapshot.animalPhotos ?? []).length,
      speciesCount: snapshot.speciesProfiles.length,
      byteSize: serialized.length,
      snapshot,
    };
    const db = await openRollingIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ROLLING_STORE_NAME, 'readwrite');
      const store = tx.objectStore(ROLLING_STORE_NAME);
      store.put(entry);
      const getAllReq = store.getAll();
      getAllReq.onsuccess = () => {
        const all = (getAllReq.result as StoredRollingBackup[]).sort((a, b) =>
          b.savedAtIso.localeCompare(a.savedAtIso)
        );
        for (let i = MAX_ROLLING_BACKUPS; i < all.length; i++) {
          store.delete(all[i].key);
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
  } catch {
    // Non-fatal: never block primary DB save on rolling backup error
  }
}

export async function listRollingSnapshotBackups(): Promise<RollingBackupMeta[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openRollingIdb();
    return await new Promise<RollingBackupMeta[]>((resolve, reject) => {
      const tx = db.transaction(ROLLING_STORE_NAME, 'readonly');
      const req = tx.objectStore(ROLLING_STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        const items = (req.result as StoredRollingBackup[])
          .sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso))
          .map(({ key, savedAtIso, animalCount, photoCount, speciesCount, byteSize, snapshot: snap }) => ({
            key,
            savedAtIso,
            animalCount,
            photoCount: typeof photoCount === 'number' ? photoCount : (snap?.animalPhotos ?? []).length,
            speciesCount,
            byteSize,
          }));
        resolve(items);
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
        resolve(rec?.snapshot ?? null);
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
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(isStandalonePwa);
  const [isIos] = useState<boolean>(isIosBrowser);

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const onMqChange = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq.addEventListener('change', onMqChange);

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
      mq.removeEventListener('change', onMqChange);
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
