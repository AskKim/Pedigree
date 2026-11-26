/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Hybrid Origin Private File System (OPFS) Browser Adapter (`src/storage/opfsStorage.ts`).
 *
 * Implements:
 * - Strict feature detection (`isOpfsSupported()`) & isolated `/tmp`, `/backups`, `/archives` namespaces
 * - Deterministic `.close()` in `try / finally` for every writable handle
 * - Automatic `QuotaExceededError` recovery by purging `/tmp` and retrying once
 * - Boot-time orphan `/tmp` sweep
 * - Unified OPFS Backup Vault (`/backups`) with retention caps (6 monthly, 3 pre-upgrade, recovery dumps)
 * - Archived Herds Cohort Storage (`/archives`) with `.archive.zip` bundles & manifest index
 * - Prior-use eviction sentinel & wiped-storage detection
 * - Idle background Export Canary (`requestIdleCallback` caller, `visibilityState`-guarded)
 * - Raw IndexedDB / SQLite migration failure dump to OPFS `/backups/recovery-pre-reset-*.json`
 */

import { hasNonTestingBarnData } from '../domain/backupStatus';
import {
  APP_SCHEMA_BUILD_TAG,
  ArchivedHerdIndexEntry,
  buildEmptyFallbackSettings,
  buildExportCanaryProbe,
  CURRENT_BACKUP_SCHEMA_VERSION,
  deserializeVaultBackupPayload,
  extractArchiveIndexMetadataOnly,
  extractVaultJsonTextFromPayload,
  isZipMagicBytes,
  MigratedBackupResult,
  serializeCompressedVaultBackupZip,
  serializeVaultBackupEnvelope,
  sha256HexPure,
  unpackArchivedAnimalBundle,
  UnpackedArchivedHerdBundle,
  VaultBackupKind,
  VaultBackupMetadata,
  verifyExportCanaryRoundTrip,
} from '../domain/backupVault';
import { getTierStoragePolicy, TierStoragePolicy } from '../domain/deviceCapability';
import { BarnDatabaseSnapshot, BarnSettings, generateUuid, nowIsoUtc } from '../domain/models';
import { isSampleTestingId } from '../domain/sampleData';
import { logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import { pushBackupPayloadToSyncFolder } from './localSyncChannels';
import {
  getActiveOpfsHandleCount,
  getActiveTempFiles,
  getOpfsSubdir,
  isOpfsSupported,
  listDirEntries,
  markTempOpfsFileActive,
  OpfsCloseableHandle,
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsNamespace,
  OpfsSyncAccessHandle,
  OpfsWritableStream,
  probeOpfsRuntime,
  purgeOpfsTmp,
  readOpfsFileBytes,
  readOpfsFileText,
  readTempOpfsFileAsBlob,
  registerOpfsDiagnosticLogger,
  releaseActiveOpfsHandles,
  removeOpfsEntrySafe,
  removeTempOpfsFile,
  resetOpfsProbesForTests,
  safeAwaitOpfsClose,
  safeAwaitOpfsFlush,
  safeAwaitOpfsGetSize,
  safeAwaitOpfsTruncate,
  setOpfsRootResolverForTest,
  StreamedOpfsTempFileResult,
  sweepOrphanedOpfsTmpOnBoot,
  unmarkTempOpfsFileActive,
  writeFileToOpfsDir,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
} from './opfsTempStream';
import {
  getSafeIndexedDb,
  getSafeLocalStorage,
  registerIndexedDbOpfsDumper,
  trackActiveIdbConnection,
  trackActiveIdbTransaction,
} from './storageProbes';
import { isQuotaExceededError, listRollingSnapshotBackups } from './storageProtection';

registerOpfsDiagnosticLogger((ev) => {
  logDiagnosticEvent(ev);
});

export {
  getActiveOpfsHandleCount,
  getActiveTempFiles,
  getOpfsSubdir,
  isOpfsSupported,
  markTempOpfsFileActive,
  probeOpfsRuntime,
  purgeOpfsTmp,
  readTempOpfsFileAsBlob,
  releaseActiveOpfsHandles,
  removeTempOpfsFile,
  resetOpfsProbesForTests,
  safeAwaitOpfsClose,
  safeAwaitOpfsFlush,
  safeAwaitOpfsGetSize,
  safeAwaitOpfsTruncate,
  setOpfsRootResolverForTest,
  sweepOrphanedOpfsTmpOnBoot,
  unmarkTempOpfsFileActive,
  writeTempOpfsFile,
  writeTempOpfsFileStreamed,
};
export type {
  OpfsCloseableHandle,
  OpfsDirectoryHandle,
  OpfsFileHandle,
  OpfsNamespace,
  OpfsSyncAccessHandle,
  OpfsWritableStream,
  StreamedOpfsTempFileResult,
};

export interface PriorUseSentinel {
  barnName: string;
  animalCount: number;
  nonTestingCount: number;
  lastSeenIso: string;
}

export interface WipedStorageRecoveryContext {
  detected: boolean;
  reason:
    | 'sentinel'
    | 'opfs_backups'
    | 'opfs_archives'
    | 'rolling_backups'
    | 'corrupted_sqlite'
    | 'none';
  sentinel: PriorUseSentinel | null;
  latestOpfsBackup: VaultBackupMetadata | null;
  opfsBackupsCount: number;
  opfsArchivesCount: number;
  rollingBackupsCount?: number;
  corruptionError?: string | null;
}

export const MAX_MONTHLY_OPFS_BACKUPS = 6;
export const MAX_PRE_UPGRADE_OPFS_BACKUPS = 3;
export const MAX_PRE_RESET_OPFS_BACKUPS = 8;
export const MAX_MANUAL_OPFS_BACKUPS = 12;
export const MAX_RECOVERY_DUMP_OPFS_BACKUPS = 4;
export const MONTHLY_BACKUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const EXPORT_CANARY_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const CANARY_FAILURE_COOLDOWN_MS = 60 * 60 * 1000;

const PRIOR_USE_SENTINEL_KEY = 'pedigree.priorUseSentinel.v1';
const CANARY_LAST_RUN_KEY = 'pedigree.opfsCanaryLastRunMs.v1';
const CANARY_LAST_FAIL_KEY = 'pedigree.opfsCanaryLastFailMs.v1';
const OPFS_PRUNE_WARNING_KEY = 'pedigree.opfsPruneWarning.v1';
const VAULT_INDEX_FILE = 'vault-index.json';
const ARCHIVES_INDEX_FILE = 'archives-index.json';
const CANARY_PROBE_FILE = 'canary-probe.json';

export interface OpfsPruneSyncWarning {
  count: number;
  lastFileName: string;
  kind: VaultBackupKind;
  reason: 'not_configured' | 'permission_required' | 'write_failed' | 'unsupported';
  retained?: boolean;
  timestampIso: string;
  message: string;
}

export function readOpfsPruneSyncWarning(): OpfsPruneSyncWarning | null {
  const ls = getSafeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(OPFS_PRUNE_WARNING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OpfsPruneSyncWarning>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.lastFileName !== 'string') {
      return null;
    }
    const reason =
      parsed.reason === 'permission_required' ||
      parsed.reason === 'write_failed' ||
      parsed.reason === 'unsupported'
        ? parsed.reason
        : 'not_configured';
    return {
      count: Number(parsed.count) || 1,
      lastFileName: parsed.lastFileName,
      kind: (parsed.kind as VaultBackupKind) || 'manual',
      reason,
      retained:
        typeof parsed.retained === 'boolean'
          ? parsed.retained
          : reason === 'permission_required' || reason === 'write_failed',
      timestampIso: String(parsed.timestampIso || ''),
      message: String(parsed.message || ''),
    };
  } catch {
    return null;
  }
}

export function clearOpfsPruneSyncWarning(): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(OPFS_PRUNE_WARNING_KEY);
  } catch {
    // Ignore
  }
}

function recordOpfsPruneSyncWarning(
  newCount: number,
  lastItem: VaultBackupMetadata,
  reason: OpfsPruneSyncWarning['reason'],
  options?: { retained?: boolean }
): void {
  if (newCount <= 0) return;
  const retained =
    options?.retained ?? (reason === 'permission_required' || reason === 'write_failed');
  const existing = readOpfsPruneSyncWarning();
  const totalCount =
    existing && existing.reason === reason ? (existing.count || 0) + newCount : newCount;
  const reasonNote =
    reason === 'permission_required'
      ? 'Connected Backup Sync folder needs re-authorization'
      : reason === 'write_failed'
      ? 'Backup Sync folder write failed'
      : reason === 'unsupported'
      ? 'This browser cannot persist folder sync handles automatically'
      : 'No Backup Sync folder is connected';
  const next: OpfsPruneSyncWarning = {
    count: totalCount,
    lastFileName: lastItem.fileName,
    kind: lastItem.kind,
    reason,
    retained,
    timestampIso: nowIsoUtc(),
    message: retained
      ? `${totalCount} expiring local backup(s) could not offload (${reasonNote}) and were retained locally until sync succeeds. Re-authorize your Backup Sync folder or export a manual backup.`
      : `${totalCount} aging local backup(s) rolled off storage without an off-device sync copy (${reasonNote}). Connect a sync folder or download a manual backup.`,
  };
  const ls = getSafeLocalStorage();
  if (ls) {
    try {
      ls.setItem(OPFS_PRUNE_WARNING_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal
    }
  }
  logDiagnosticEvent({
    level: 'warn',
    category: 'storage',
    message: retained
      ? `Retained ${newCount} expiring OPFS backup(s) locally after Backup Sync offload failed (${reason}): ${lastItem.fileName}`
      : `Pruned ${newCount} expiring OPFS backup(s) without sync offload (${reason}): ${lastItem.fileName}`,
  });
}

const opfsNamespaceQueues = new Map<OpfsNamespace, Promise<void>>();

function withOpfsNamespaceLock<T>(
  namespace: OpfsNamespace,
  task: () => Promise<T>
): Promise<T> {
  const prev = opfsNamespaceQueues.get(namespace) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(task);
  const settled = run.then(
    () => undefined,
    () => undefined
  );
  opfsNamespaceQueues.set(namespace, settled);
  return run.finally(() => {
    if (opfsNamespaceQueues.get(namespace) === settled) {
      opfsNamespaceQueues.delete(namespace);
    }
  });
}

function measureUtf8ByteLength(text: string): number {
  if (typeof Blob !== 'undefined') {
    return new Blob([text]).size;
  }
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength;
  }
  return text.length;
}

function compactStamp(iso: string): string {
  return iso.replace(/[-:T.Z]/g, '').slice(0, 15);
}

// ---------------------------------------------------------------------------
// 2. OPFS Backup Vault (`/backups`) + Retention Pruning
// ---------------------------------------------------------------------------

function buildVaultFileName(
  kind: VaultBackupKind,
  createdAtIso: string,
  compressed = false
): string {
  const stamp = compactStamp(createdAtIso);
  const shortId = generateUuid().slice(0, 6);
  const ext = compressed ? '.vault.zip' : '.json';
  if (kind === 'monthly') {
    const ym = createdAtIso.slice(0, 7);
    return `monthly-${ym}-${stamp}-${shortId}${ext}`;
  }
  if (kind === 'pre_upgrade') {
    return `pre-upgrade-${stamp}-${shortId}${ext}`;
  }
  if (kind === 'pre_reset') {
    return `pre-reset-${stamp}-${shortId}${ext}`;
  }
  if (kind === 'recovery_dump') {
    return `recovery-pre-reset-${stamp}-${shortId}${ext}`;
  }
  return `manual-vault-${stamp}-${shortId}${ext}`;
}

function resolveEffectiveStoragePolicy(
  override?: Partial<TierStoragePolicy>
): TierStoragePolicy {
  const base = getTierStoragePolicy(detectCurrentDeviceCapability().tier);
  return override ? { ...base, ...override } : base;
}

async function readVaultIndex(backupsDir: OpfsDirectoryHandle): Promise<VaultBackupMetadata[]> {
  const indexText = await readOpfsFileText(backupsDir, VAULT_INDEX_FILE);
  if (indexText) {
    try {
      const parsed = JSON.parse(indexText);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is VaultBackupMetadata =>
            Boolean(item && typeof item === 'object' && typeof item.key === 'string' && typeof item.fileName === 'string')
        );
      }
    } catch {
      // Rebuild below if corrupted
    }
  }

  // Self-heal vault index by scanning `/backups/*.json` and `/backups/*.vault.zip` files safely
  const rebuilt: VaultBackupMetadata[] = [];
  const entries = await listDirEntries(backupsDir);
  for (const entry of entries) {
    if (
      entry.handle.kind === 'directory' ||
      entry.name === VAULT_INDEX_FILE ||
      (!entry.name.endsWith('.json') && !entry.name.endsWith('.zip'))
    ) {
      continue;
    }
    try {
      const bytes = await readOpfsFileBytes(backupsDir, entry.name);
      if (!bytes || bytes.byteLength === 0) continue;
      const isCompressed = entry.name.endsWith('.zip') || isZipMagicBytes(bytes);
      const text = extractVaultJsonTextFromPayload(bytes, entry.name);
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const snap: Record<string, unknown> =
        parsed.snapshot && typeof parsed.snapshot === 'object' && !Array.isArray(parsed.snapshot)
          ? (parsed.snapshot as Record<string, unknown>)
          : parsed;
      const snapSettings =
        snap.settings && typeof snap.settings === 'object' && !Array.isArray(snap.settings)
          ? (snap.settings as Record<string, unknown>)
          : null;
      const animalCount = Array.isArray(snap.animals) ? snap.animals.length : 0;
      const photoCount = Array.isArray(snap.animalPhotos) ? snap.animalPhotos.length : 0;
      const speciesCount = Array.isArray(snap.speciesProfiles) ? snap.speciesProfiles.length : 0;
      const kind: VaultBackupKind =
        parsed.vaultKind === 'monthly' ||
        parsed.vaultKind === 'pre_upgrade' ||
        parsed.vaultKind === 'manual' ||
        parsed.vaultKind === 'pre_reset' ||
        parsed.vaultKind === 'recovery_dump'
          ? parsed.vaultKind
          : entry.name.startsWith('recovery-')
          ? 'recovery_dump'
          : entry.name.startsWith('monthly-')
          ? 'monthly'
          : entry.name.startsWith('pre-upgrade-')
          ? 'pre_upgrade'
          : entry.name.startsWith('pre-reset-')
          ? 'pre_reset'
          : 'manual';

      rebuilt.push({
        key: entry.name,
        fileName: entry.name,
        kind,
        schemaVersion: Number(parsed._schemaVersion) || CURRENT_BACKUP_SCHEMA_VERSION,
        createdAtIso: String(parsed.createdAtIso || parsed.exportedAtIsoUtc || nowIsoUtc()),
        createdByAppVersion: String(parsed.createdByAppVersion || APP_SCHEMA_BUILD_TAG),
        barnName: String(snapSettings?.barnName || 'My Barn'),
        animalCount,
        photoCount,
        speciesCount,
        byteSize: bytes.byteLength,
        checksumSha256: String(parsed.checksumSha256 || sha256HexPure(text)),
        source: 'opfs',
        note: typeof parsed.note === 'string' ? parsed.note : undefined,
        compressed: isCompressed,
      });
    } catch {
      // Skip malformed entry safely
    }
  }
  rebuilt.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  if (rebuilt.length > 0) {
    try {
      await writeFileToOpfsDir(backupsDir, VAULT_INDEX_FILE, JSON.stringify(rebuilt, null, 2));
    } catch {
      // Non-fatal
    }
  }
  return rebuilt;
}

async function writeVaultIndex(
  backupsDir: OpfsDirectoryHandle,
  items: VaultBackupMetadata[]
): Promise<void> {
  const sorted = [...items].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  await writeFileToOpfsDir(backupsDir, VAULT_INDEX_FILE, JSON.stringify(sorted, null, 2));
}

export type PrePruneOffloadHandler = (
  item: VaultBackupMetadata,
  bytes: Uint8Array | null
) => Promise<{
  ok: boolean;
  skippedReason?: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed';
}>;

async function enforceVaultRetention(
  backupsDir: OpfsDirectoryHandle,
  items: VaultBackupMetadata[],
  policy: TierStoragePolicy = resolveEffectiveStoragePolicy(),
  beforePrune?: PrePruneOffloadHandler
): Promise<VaultBackupMetadata[]> {
  const byKindCap: Record<VaultBackupKind, number> = {
    monthly: policy.monthlyCap,
    pre_upgrade: policy.preUpgradeCap,
    pre_reset: policy.preResetCap,
    manual: policy.manualCap,
    recovery_dump: policy.recoveryDumpCap,
  };

  const keepSet = new Set<string>();
  const deleteItems: VaultBackupMetadata[] = [];

  const grouped = new Map<VaultBackupKind, VaultBackupMetadata[]>();
  for (const item of items) {
    const arr = grouped.get(item.kind) || [];
    arr.push(item);
    grouped.set(item.kind, arr);
  }

  for (const [kind, list] of grouped.entries()) {
    list.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    const cap = byKindCap[kind];
    list.forEach((item, idx) => {
      if (idx < cap) {
        keepSet.add(item.key);
      } else {
        deleteItems.push(item);
      }
    });
  }

  if (deleteItems.length > 0) {
    let prunedUnbackedCount = 0;
    let lastPrunedItem: VaultBackupMetadata | null = null;
    let lastPrunedReason: OpfsPruneSyncWarning['reason'] = 'not_configured';

    let retainedCount = 0;
    let lastRetainedItem: VaultBackupMetadata | null = null;
    let lastRetainedReason: OpfsPruneSyncWarning['reason'] = 'permission_required';

    for (const item of deleteItems) {
      const payloadBytes = await readOpfsFileBytes(backupsDir, item.fileName);
      const offloadResult = beforePrune
        ? await beforePrune(item, payloadBytes)
        : payloadBytes
        ? await pushBackupPayloadToSyncFolder(item.fileName, payloadBytes)
        : { ok: false, skippedReason: 'write_failed' as const };

      if (!offloadResult.ok) {
        const reason = offloadResult.skippedReason || 'not_configured';
        if (
          payloadBytes &&
          (reason === 'permission_required' || reason === 'write_failed')
        ) {
          // Retain expiring local OPFS backup when a configured sync folder fails temporarily
          keepSet.add(item.key);
          retainedCount++;
          lastRetainedItem = item;
          lastRetainedReason = reason;
          continue;
        }
        prunedUnbackedCount++;
        lastPrunedItem = item;
        lastPrunedReason = reason;
      } else {
        logDiagnosticEvent({
          level: 'info',
          category: 'storage',
          message: `Synced expiring OPFS backup "${item.fileName}" to Backup Sync Folder before local prune`,
        });
      }

      await removeOpfsEntrySafe(backupsDir, item.fileName);
    }

    if (retainedCount > 0 && lastRetainedItem) {
      recordOpfsPruneSyncWarning(retainedCount, lastRetainedItem, lastRetainedReason, {
        retained: true,
      });
    } else if (prunedUnbackedCount > 0 && lastPrunedItem) {
      recordOpfsPruneSyncWarning(prunedUnbackedCount, lastPrunedItem, lastPrunedReason, {
        retained: false,
      });
    }
  }

  return items
    .filter((i) => keepSet.has(i.key))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

export async function flushOpfsBackupsToSyncFolder(options?: {
  policyOverride?: Partial<TierStoragePolicy>;
}): Promise<{
  pushed: number;
  failed: number;
  skippedReason?: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed';
}> {
  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', false);
    if (!backupsDir) return { pushed: 0, failed: 0 };
    const items = await readVaultIndex(backupsDir);
    let pushed = 0;
    let failed = 0;
    let lastReason: 'unsupported' | 'not_configured' | 'permission_required' | 'write_failed' | undefined;
    const pushedKeys = new Set<string>();

    for (const item of items) {
      const bytes = await readOpfsFileBytes(backupsDir, item.fileName);
      if (!bytes) continue;
      const res = await pushBackupPayloadToSyncFolder(item.fileName, bytes);
      if (res.ok) {
        pushed++;
        pushedKeys.add(item.key);
      } else {
        failed++;
        lastReason = res.skippedReason;
        if (
          res.skippedReason === 'unsupported' ||
          res.skippedReason === 'not_configured' ||
          res.skippedReason === 'permission_required'
        ) {
          break;
        }
      }
    }
    if (pushed > 0 && failed === 0) {
      clearOpfsPruneSyncWarning();
      const policy = resolveEffectiveStoragePolicy(options?.policyOverride);
      const nextList = await enforceVaultRetention(
        backupsDir,
        items,
        policy,
        async (item) =>
          pushedKeys.has(item.key)
            ? { ok: true }
            : { ok: false, skippedReason: 'write_failed' }
      );
      if (nextList.length !== items.length) {
        await writeVaultIndex(backupsDir, nextList);
      }
    }
    return { pushed, failed, skippedReason: lastReason };
  });
}

export async function saveOpfsVaultBackup(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    note?: string;
    appVersion?: string;
    policyOverride?: Partial<TierStoragePolicy>;
    beforePrune?: PrePruneOffloadHandler;
  }
): Promise<VaultBackupMetadata | null> {
  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', true);
    if (!backupsDir) return null;

    const policy = resolveEffectiveStoragePolicy(options.policyOverride);
    const createdAtIso = nowIsoUtc();
    const compressed = policy.compressVaultBackups;
    const fileName = buildVaultFileName(options.kind, createdAtIso, compressed);

    let envelopeCreatedBy = options.appVersion || APP_SCHEMA_BUILD_TAG;
    let schemaVersion = CURRENT_BACKUP_SCHEMA_VERSION;
    let checksumSha256 = '';
    let envelopeNote: string | undefined;
    let byteSize = 0;

    if (compressed) {
      const { envelope, zipBytes } = serializeCompressedVaultBackupZip(snapshot, {
        kind: options.kind,
        createdAtIso,
        createdByAppVersion: envelopeCreatedBy,
        note: options.note,
      });
      await writeFileToOpfsDir(backupsDir, fileName, zipBytes);
      envelopeCreatedBy = envelope.createdByAppVersion;
      schemaVersion = envelope._schemaVersion;
      checksumSha256 = envelope.checksumSha256;
      envelopeNote = envelope.note;
      byteSize = zipBytes.byteLength;
    } else {
      const { envelope, jsonText } = serializeVaultBackupEnvelope(snapshot, {
        kind: options.kind,
        createdAtIso,
        createdByAppVersion: envelopeCreatedBy,
        note: options.note,
      });
      await writeFileToOpfsDir(backupsDir, fileName, jsonText);
      envelopeCreatedBy = envelope.createdByAppVersion;
      schemaVersion = envelope._schemaVersion;
      checksumSha256 = envelope.checksumSha256;
      envelopeNote = envelope.note;
      byteSize = measureUtf8ByteLength(jsonText);
    }

    const meta: VaultBackupMetadata = {
      key: fileName,
      fileName,
      kind: options.kind,
      schemaVersion,
      createdAtIso,
      createdByAppVersion: envelopeCreatedBy,
      barnName: snapshot.settings.barnName || 'My Barn',
      animalCount: snapshot.animals.length,
      photoCount: (snapshot.animalPhotos ?? []).length,
      speciesCount: snapshot.speciesProfiles.length,
      byteSize,
      checksumSha256,
      source: 'opfs',
      note: envelopeNote,
      compressed,
    };

    const existing = await readVaultIndex(backupsDir);
    const nextList = await enforceVaultRetention(
      backupsDir,
      [meta, ...existing.filter((i) => i.key !== meta.key)],
      policy,
      options.beforePrune
    );
    await writeVaultIndex(backupsDir, nextList);
    return meta;
  });
}

export async function listOpfsVaultBackups(): Promise<VaultBackupMetadata[]> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return [];
  try {
    const items = await readVaultIndex(backupsDir);
    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Could not list OPFS /backups vault entries safely',
      error: err,
    });
    return [];
  }
}

export async function loadOpfsVaultBackup(
  key: string,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): Promise<{ meta: VaultBackupMetadata | null; migrated: MigratedBackupResult } | null> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return null;

  const items = await readVaultIndex(backupsDir);
  const meta = items.find((i) => i.key === key || i.fileName === key) || null;
  const targetFile = meta?.fileName || key;

  const bytes = await readOpfsFileBytes(backupsDir, targetFile);
  if (!bytes || bytes.byteLength === 0) return null;

  try {
    const migrated = deserializeVaultBackupPayload(bytes, fallbackSettings, targetFile);
    return { meta, migrated };
  } catch (err) {
    logDiagnosticEvent({
      level: 'error',
      category: 'storage',
      message: `OPFS vault backup "${targetFile}" failed structural validation or migration`,
      error: err,
    });
    throw err;
  }
}

export async function readOpfsVaultBackupRawJson(key: string): Promise<string | null> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return null;
  const items = await readVaultIndex(backupsDir);
  const meta = items.find((i) => i.key === key || i.fileName === key);
  const fileName = meta?.fileName || key;
  const bytes = await readOpfsFileBytes(backupsDir, fileName);
  if (!bytes || bytes.byteLength === 0) return null;
  return extractVaultJsonTextFromPayload(bytes, fileName);
}

export async function readOpfsVaultBackupBlob(
  key: string
): Promise<{ fileName: string; blob: Blob } | null> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return null;
  const items = await readVaultIndex(backupsDir);
  const meta = items.find((i) => i.key === key || i.fileName === key);
  const fileName = meta?.fileName || key;
  try {
    const fh = await backupsDir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return { fileName, blob: file };
  } catch {
    return null;
  }
}

export async function deleteOpfsVaultBackup(key: string): Promise<boolean> {
  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', false);
    if (!backupsDir) return false;
    const items = await readVaultIndex(backupsDir);
    const target = items.find((i) => i.key === key || i.fileName === key);
    const removed = await removeOpfsEntrySafe(backupsDir, target?.fileName || key);
    const remaining = items.filter((i) => i.key !== key && i.fileName !== key);
    await writeVaultIndex(backupsDir, remaining);
    return removed;
  });
}

export async function shouldCreateMonthlyOpfsBackup(nowMs: number = Date.now()): Promise<boolean> {
  if (!isOpfsSupported()) return false;
  const items = await listOpfsVaultBackups();
  const monthly = items.filter((i) => i.kind === 'monthly');
  if (monthly.length === 0) return true;
  monthly.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  const newestMs = Date.parse(monthly[0].createdAtIso);
  if (Number.isNaN(newestMs)) return true;
  return nowMs - newestMs >= MONTHLY_BACKUP_INTERVAL_MS;
}

// ---------------------------------------------------------------------------
// 3. OPFS Archived Herds (`/archives`)
// ---------------------------------------------------------------------------

async function readArchivesIndex(
  archivesDir: OpfsDirectoryHandle
): Promise<ArchivedHerdIndexEntry[]> {
  const text = await readOpfsFileText(archivesDir, ARCHIVES_INDEX_FILE);
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is ArchivedHerdIndexEntry =>
            Boolean(item && typeof item === 'object' && typeof item.archiveKey === 'string')
        );
      }
    } catch {
      // Rebuild below if index JSON corrupted
    }
  }

  const rebuilt: ArchivedHerdIndexEntry[] = [];
  const entries = await listDirEntries(archivesDir);
  for (const entry of entries) {
    if (
      entry.handle.kind === 'directory' ||
      entry.name === ARCHIVES_INDEX_FILE ||
      !entry.name.endsWith('.archive.zip')
    ) {
      continue;
    }
    try {
      const bytes = await readOpfsFileBytes(archivesDir, entry.name);
      if (!bytes) continue;
      const meta = extractArchiveIndexMetadataOnly(bytes, entry.name);
      rebuilt.push(meta);
    } catch {
      // Skip malformed entry safely
    }
  }
  rebuilt.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  if (rebuilt.length > 0) {
    try {
      await writeFileToOpfsDir(archivesDir, ARCHIVES_INDEX_FILE, JSON.stringify(rebuilt, null, 2));
    } catch {
      // Ignore index write failure
    }
  }
  return rebuilt;
}

async function writeArchivesIndex(
  archivesDir: OpfsDirectoryHandle,
  items: ArchivedHerdIndexEntry[]
): Promise<void> {
  const sorted = [...items].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  await writeFileToOpfsDir(archivesDir, ARCHIVES_INDEX_FILE, JSON.stringify(sorted, null, 2));
}

export async function saveOpfsHerdArchive(
  indexEntry: ArchivedHerdIndexEntry,
  zipBytes: Uint8Array
): Promise<ArchivedHerdIndexEntry | null> {
  return withOpfsNamespaceLock('archives', async () => {
    const archivesDir = await getOpfsSubdir('archives', true);
    if (!archivesDir) return null;

    await writeFileToOpfsDir(archivesDir, indexEntry.fileName, zipBytes);
    const existing = await readArchivesIndex(archivesDir);
    const next = [indexEntry, ...existing.filter((e) => e.archiveKey !== indexEntry.archiveKey)];
    await writeArchivesIndex(archivesDir, next);
    return indexEntry;
  });
}

export async function listOpfsHerdArchives(): Promise<ArchivedHerdIndexEntry[]> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return [];
  try {
    const items = await readArchivesIndex(archivesDir);
    return items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Could not list OPFS /archives entries safely',
      error: err,
    });
    return [];
  }
}

export async function loadOpfsHerdArchive(
  archiveKey: string,
  fallbackSettings: BarnSettings = buildEmptyFallbackSettings()
): Promise<{
  indexEntry: ArchivedHerdIndexEntry | null;
  unpacked: UnpackedArchivedHerdBundle;
  zipBytes: Uint8Array;
} | null> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return null;

  const items = await readArchivesIndex(archivesDir);
  const entry = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey) || null;
  const targetFile = entry?.fileName || `${archiveKey}.archive.zip`;

  const bytes = await readOpfsFileBytes(archivesDir, targetFile);
  if (!bytes) return null;

  const unpacked = unpackArchivedAnimalBundle(bytes, fallbackSettings);
  return { indexEntry: entry, unpacked, zipBytes: bytes };
}

export async function readOpfsHerdArchiveRawBytes(archiveKey: string): Promise<{
  fileName: string;
  bytes: Uint8Array;
} | null> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return null;
  const items = await readArchivesIndex(archivesDir);
  const entry = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey);
  const fileName = entry?.fileName || `${archiveKey}.archive.zip`;
  const bytes = await readOpfsFileBytes(archivesDir, fileName);
  if (!bytes) return null;
  return { fileName, bytes };
}

export async function readOpfsHerdArchiveBlob(archiveKey: string): Promise<{
  fileName: string;
  blob: Blob;
} | null> {
  const archivesDir = await getOpfsSubdir('archives', false);
  if (!archivesDir) return null;
  const items = await readArchivesIndex(archivesDir);
  const entry = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey);
  const fileName = entry?.fileName || `${archiveKey}.archive.zip`;
  try {
    const fh = await archivesDir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return { fileName, blob: file };
  } catch {
    return null;
  }
}

export async function deleteOpfsHerdArchive(archiveKey: string): Promise<boolean> {
  return withOpfsNamespaceLock('archives', async () => {
    const archivesDir = await getOpfsSubdir('archives', false);
    if (!archivesDir) return false;
    const items = await readArchivesIndex(archivesDir);
    const target = items.find((i) => i.archiveKey === archiveKey || i.fileName === archiveKey);
    const removed = await removeOpfsEntrySafe(
      archivesDir,
      target?.fileName || `${archiveKey}.archive.zip`
    );
    const next = items.filter((i) => i.archiveKey !== archiveKey && i.fileName !== archiveKey);
    await writeArchivesIndex(archivesDir, next);
    return removed;
  });
}

// ---------------------------------------------------------------------------
// 4. Prior-Use Eviction Sentinel & Wiped Browser Storage Detection
// ---------------------------------------------------------------------------

export function readPriorUseSentinel(): PriorUseSentinel | null {
  const ls = getSafeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PRIOR_USE_SENTINEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PriorUseSentinel>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      barnName: String(parsed.barnName || 'My Barn'),
      animalCount: Number(parsed.animalCount) || 0,
      nonTestingCount: Number(parsed.nonTestingCount) || 0,
      lastSeenIso: String(parsed.lastSeenIso || ''),
    };
  } catch {
    return null;
  }
}

export function markPriorUseSentinelFromSnapshot(snapshot: BarnDatabaseSnapshot): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  const nonTestingCount = snapshot.animals.filter((a) => !isSampleTestingId(a.id)).length;
  const hasReal = hasNonTestingBarnData(snapshot) || Boolean(snapshot.settings.barnNameOnboarded);
  if (!hasReal && !readPriorUseSentinel()) {
    return;
  }
  try {
    const next: PriorUseSentinel = {
      barnName: snapshot.settings.barnName || 'My Barn',
      animalCount: snapshot.animals.length,
      nonTestingCount,
      lastSeenIso: nowIsoUtc(),
    };
    ls.setItem(PRIOR_USE_SENTINEL_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage quota failures
  }
}

export function clearPriorUseSentinel(): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    ls.removeItem(PRIOR_USE_SENTINEL_KEY);
  } catch {
    // Ignore
  }
}

export async function detectReturningUserWipedStorage(): Promise<WipedStorageRecoveryContext> {
  const sentinel = readPriorUseSentinel();
  const [backups, archives, rollingBackups] = await Promise.all([
    listOpfsVaultBackups().catch(() => [] as VaultBackupMetadata[]),
    listOpfsHerdArchives().catch(() => [] as ArchivedHerdIndexEntry[]),
    listRollingSnapshotBackups().catch(() => []),
  ]);
  const nonEmptyRolling = rollingBackups.filter(
    (item) => item.animalCount > 0 || item.speciesCount > 0
  );

  const latestOpfsBackup = backups.length > 0 ? backups[0] : null;
  if (backups.length > 0) {
    return {
      detected: true,
      reason: 'opfs_backups',
      sentinel,
      latestOpfsBackup,
      opfsBackupsCount: backups.length,
      opfsArchivesCount: archives.length,
      rollingBackupsCount: nonEmptyRolling.length,
    };
  }
  if (archives.length > 0) {
    return {
      detected: true,
      reason: 'opfs_archives',
      sentinel,
      latestOpfsBackup: null,
      opfsBackupsCount: 0,
      opfsArchivesCount: archives.length,
      rollingBackupsCount: nonEmptyRolling.length,
    };
  }
  if (nonEmptyRolling.length > 0) {
    return {
      detected: true,
      reason: 'rolling_backups',
      sentinel,
      latestOpfsBackup: null,
      opfsBackupsCount: 0,
      opfsArchivesCount: 0,
      rollingBackupsCount: nonEmptyRolling.length,
    };
  }
  if (sentinel && (sentinel.nonTestingCount > 0 || sentinel.animalCount > 0)) {
    return {
      detected: true,
      reason: 'sentinel',
      sentinel,
      latestOpfsBackup: null,
      opfsBackupsCount: 0,
      opfsArchivesCount: 0,
      rollingBackupsCount: 0,
    };
  }
  return {
    detected: false,
    reason: 'none',
    sentinel: null,
    latestOpfsBackup: null,
    opfsBackupsCount: 0,
    opfsArchivesCount: 0,
    rollingBackupsCount: 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Idle Background Export Canary (`/tmp/canary-probe.json`)
// ---------------------------------------------------------------------------

export function shouldRunExportCanary(nowMs: number = Date.now()): boolean {
  if (!isOpfsSupported()) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  const ls = getSafeLocalStorage();
  if (!ls) return true;
  try {
    const failRaw = ls.getItem(CANARY_LAST_FAIL_KEY);
    if (failRaw) {
      const failMs = Number(failRaw);
      if (Number.isFinite(failMs) && failMs > 0 && nowMs - failMs < CANARY_FAILURE_COOLDOWN_MS) {
        return false;
      }
    }
    const raw = ls.getItem(CANARY_LAST_RUN_KEY);
    if (!raw) return true;
    const prevMs = Number(raw);
    if (!Number.isFinite(prevMs) || prevMs <= 0) return true;
    return nowMs - prevMs >= EXPORT_CANARY_INTERVAL_MS;
  } catch {
    return true;
  }
}

function recordCanaryFailureTimestamp(): void {
  const ls = getSafeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(CANARY_LAST_FAIL_KEY, String(Date.now()));
  } catch {
    // Non-fatal
  }
}

export async function runOpfsExportCanary(
  snapshot: BarnDatabaseSnapshot
): Promise<{ ok: boolean; skipped?: boolean; skippedHeavyZip?: boolean; reason?: string }> {
  if (!isOpfsSupported()) {
    return { ok: true, skipped: true };
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return { ok: true, skipped: true };
  }

  const policy = resolveEffectiveStoragePolicy();
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) {
    return { ok: true, skipped: true };
  }

  // Keep canary strictly to a lightweight metadata JSON probe (never compress heavy ZIP payloads
  // during background canary checks when policy.skipHeavyCanaryZip is active on Tier 1).
  const probe = buildExportCanaryProbe(snapshot);
  const serialized = JSON.stringify(probe);
  markTempOpfsFileActive(CANARY_PROBE_FILE);
  try {
    await writeFileToOpfsDir(tmpDir, CANARY_PROBE_FILE, serialized);
    const readBack = await readOpfsFileText(tmpDir, CANARY_PROBE_FILE);
    if (!readBack) {
      recordCanaryFailureTimestamp();
      return {
        ok: false,
        skippedHeavyZip: policy.skipHeavyCanaryZip,
        reason: 'OPFS canary probe could not be read back after writing.',
      };
    }
    const verified = verifyExportCanaryRoundTrip(probe, readBack);
    if (!verified.ok) {
      recordCanaryFailureTimestamp();
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Export canary verification failed: ${verified.reason || 'unknown mismatch'}`,
      });
      return { ok: false, skippedHeavyZip: policy.skipHeavyCanaryZip, reason: verified.reason };
    }

    const ls = getSafeLocalStorage();
    if (ls) {
      try {
        ls.setItem(CANARY_LAST_RUN_KEY, String(Date.now()));
        ls.removeItem(CANARY_LAST_FAIL_KEY);
      } catch {
        // Non-fatal
      }
    }
    return { ok: true, skippedHeavyZip: policy.skipHeavyCanaryZip };
  } catch (err) {
    recordCanaryFailureTimestamp();
    const reason = err instanceof Error ? err.message : 'OPFS canary probe write error';
    logDiagnosticEvent({
      level: 'warn',
      category: isQuotaExceededError(err) ? 'memory' : 'storage',
      message: `Export canary failed: ${reason}`,
      error: err,
    });
    return { ok: false, reason };
  } finally {
    unmarkTempOpfsFileActive(CANARY_PROBE_FILE);
    await removeOpfsEntrySafe(tmpDir, CANARY_PROBE_FILE);
  }
}

// ---------------------------------------------------------------------------
// 6. IndexedDB `VersionError` / Migration Failure Rescue Dump
// ---------------------------------------------------------------------------

const MAX_RAW_DUMP_BINARY_BYTES = 16 * 1024 * 1024;

function uint8ToBase64Compact(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...slice);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

function sanitizeDumpBinaryField(val: unknown): unknown {
  if (val instanceof ArrayBuffer) {
    const view = new Uint8Array(val);
    return view.byteLength > MAX_RAW_DUMP_BINARY_BYTES
      ? { __binaryType: 'ArrayBuffer', byteLength: view.byteLength, omitted: true }
      : { __binaryType: 'ArrayBuffer', byteLength: view.byteLength, base64: uint8ToBase64Compact(view) };
  }
  if (ArrayBuffer.isView(val)) {
    const view = new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    const ctorName = val.constructor?.name || 'TypedArray';
    return view.byteLength > MAX_RAW_DUMP_BINARY_BYTES
      ? { __binaryType: ctorName, byteLength: view.byteLength, omitted: true }
      : { __binaryType: ctorName, byteLength: view.byteLength, base64: uint8ToBase64Compact(view) };
  }
  return val;
}

function sanitizeRawStoresForDump(
  stores: Record<string, unknown[]> | undefined
): Record<string, unknown[]> {
  if (!stores) return {};
  const cleaned: Record<string, unknown[]> = {};
  for (const [storeName, rows] of Object.entries(stores)) {
    if (!Array.isArray(rows)) continue;
    cleaned[storeName] = rows.map((row) => {
      if (row instanceof ArrayBuffer || ArrayBuffer.isView(row)) {
        return sanitizeDumpBinaryField(row);
      }
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        const nextRow: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
          nextRow[k] = sanitizeDumpBinaryField(v);
        }
        return nextRow;
      }
      return row;
    });
  }
  return cleaned;
}

/**
 * Dumps salvaged snapshot or raw IndexedDB object stores to OPFS `/backups/recovery-pre-reset-*.json`
 * when a schema migration or IndexedDB `VersionError` aborts before attempting any reset.
 */
export async function dumpRawRecordsToOpfsRecoveryBackup(params: {
  sourceDbName: string;
  reason: string;
  stores?: Record<string, unknown[]>;
  salvagedSnapshot?: BarnDatabaseSnapshot | null;
}): Promise<VaultBackupMetadata | null> {
  if (params.salvagedSnapshot) {
    try {
      return await saveOpfsVaultBackup(params.salvagedSnapshot, {
        kind: 'recovery_dump',
        note: `Auto-dumped before reset (${params.sourceDbName}): ${params.reason}`,
      });
    } catch {
      // Fall through to raw dump below
    }
  }

  return withOpfsNamespaceLock('backups', async () => {
    const backupsDir = await getOpfsSubdir('backups', true);
    if (!backupsDir) return null;

    const createdAtIso = nowIsoUtc();
    const stamp = compactStamp(createdAtIso);
    const fileName = `recovery-pre-reset-${stamp}-${generateUuid().slice(0, 6)}.json`;
    const payload = {
      format: 'community-pedigree-raw-recovery-dump',
      _schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      vaultKind: 'recovery_dump' as VaultBackupKind,
      sourceDbName: params.sourceDbName,
      reason: params.reason,
      createdAtIso,
      createdByAppVersion: APP_SCHEMA_BUILD_TAG,
      stores: sanitizeRawStoresForDump(params.stores),
    };
    const jsonText = JSON.stringify(payload);

    try {
      await writeFileToOpfsDir(backupsDir, fileName, jsonText);
      const meta: VaultBackupMetadata = {
        key: fileName,
        fileName,
        kind: 'recovery_dump',
        schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
        createdAtIso,
        createdByAppVersion: APP_SCHEMA_BUILD_TAG,
        barnName: 'Raw Store Dump',
        animalCount: 0,
        photoCount: 0,
        speciesCount: 0,
        byteSize: measureUtf8ByteLength(jsonText),
        checksumSha256: sha256HexPure(jsonText),
        source: 'opfs',
        note: `Raw IndexedDB dump (${params.sourceDbName}): ${params.reason}`,
        compressed: false,
      };
      const existing = await readVaultIndex(backupsDir);
      const nextList = await enforceVaultRetention(backupsDir, [
        meta,
        ...existing.filter((i) => i.key !== meta.key),
      ]);
      await writeVaultIndex(backupsDir, nextList);
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Saved raw IndexedDB recovery dump "${fileName}" to OPFS /backups before reset (${params.reason})`,
      });
      return meta;
    } catch (err) {
      logDiagnosticEvent({
        level: 'error',
        category: 'storage',
        message: `Failed writing OPFS recovery dump for "${params.sourceDbName}"`,
        error: err,
      });
      return null;
    }
  });
}

/**
 * Attempts a version-less `indexedDB.open(dbName)` (opening at whatever disk version exists)
 * to extract surviving object store contents into OPFS `/backups/recovery-pre-reset-*.json`
 * when a `VersionError` or `onupgradeneeded` failure happens.
 */
export async function dumpIndexedDbDatabaseToOpfs(
  dbName: string,
  reason: string
): Promise<VaultBackupMetadata | null> {
  const idb = getSafeIndexedDb();
  if (!idb) return null;

  let rescuedDb: IDBDatabase | null = null;
  let untrackDb: (() => void) | null = null;
  try {
    rescuedDb = await new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Rescue IndexedDB open timed out'));
      }, 4000);
      try {
        const req = idb.open(dbName);
        req.onsuccess = () => {
          if (settled) {
            try {
              req.result.close();
            } catch {
              // Ignore
            }
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(req.result);
        };
        req.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(req.error || new Error('Rescue IndexedDB open failed'));
        };
      } catch (openErr) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(openErr);
        }
      }
    });

    untrackDb = trackActiveIdbConnection(rescuedDb);
    const storeNames = Array.from(rescuedDb.objectStoreNames);
    const dumpedStores: Record<string, unknown[]> = {};
    let salvagedSnapshot: BarnDatabaseSnapshot | null = null;

    if (storeNames.length > 0) {
      await new Promise<void>((resolve) => {
        try {
          const tx = rescuedDb!.transaction(storeNames, 'readonly');
          const untrackTx = trackActiveIdbTransaction(tx);
          let pending = storeNames.length;
          for (const storeName of storeNames) {
            const store = tx.objectStore(storeName);
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const rows = Array.isArray(getAllReq.result) ? getAllReq.result : [];
              dumpedStores[storeName] = rows;
              for (const row of rows) {
                if (
                  row &&
                  typeof row === 'object' &&
                  Array.isArray((row as BarnDatabaseSnapshot).animals) &&
                  Array.isArray((row as BarnDatabaseSnapshot).speciesProfiles)
                ) {
                  salvagedSnapshot = row as BarnDatabaseSnapshot;
                } else if (
                  row &&
                  typeof row === 'object' &&
                  (row as { snapshot?: BarnDatabaseSnapshot }).snapshot &&
                  Array.isArray((row as { snapshot: BarnDatabaseSnapshot }).snapshot.animals)
                ) {
                  salvagedSnapshot = (row as { snapshot: BarnDatabaseSnapshot }).snapshot;
                }
              }
              pending--;
              if (pending === 0) {
                untrackTx();
                resolve();
              }
            };
            getAllReq.onerror = () => {
              pending--;
              if (pending === 0) {
                untrackTx();
                resolve();
              }
            };
          }
          tx.oncomplete = () => {
            untrackTx();
            resolve();
          };
          tx.onerror = () => {
            untrackTx();
            resolve();
          };
          tx.onabort = () => {
            untrackTx();
            resolve();
          };
        } catch {
          resolve();
        }
      });
    }

    return await dumpRawRecordsToOpfsRecoveryBackup({
      sourceDbName: dbName,
      reason,
      stores: dumpedStores,
      salvagedSnapshot,
    });
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: `Could not salvage object stores from "${dbName}" before reset`,
      error: err,
    });
    return null;
  } finally {
    untrackDb?.();
    if (rescuedDb) {
      try {
        rescuedDb.close();
      } catch {
        // Ignore
      }
    }
  }
}

export function isVersionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string };
  return e.name === 'VersionError' || /version/i.test(String(e.message || ''));
}

export interface OpfsNamespaceEntryInfo {
  name: string;
  kind: 'file' | 'directory';
  byteSize: number;
}

export interface OpfsNamespaceSummary {
  namespace: OpfsNamespace;
  exists: boolean;
  fileCount: number;
  totalBytes: number;
  entries: OpfsNamespaceEntryInfo[];
}

export interface OpfsNamespacesInspectionReport {
  supported: boolean;
  inspectedAtIso: string;
  totalFiles: number;
  totalBytes: number;
  namespaces: OpfsNamespaceSummary[];
}

/**
 * Inspects `/tmp`, `/backups`, and `/archives` OPFS namespaces read-only, reporting per-file
 * byte footprints without modifying handles or locks.
 */
export async function inspectOpfsNamespaces(): Promise<OpfsNamespacesInspectionReport> {
  const inspectedAtIso = nowIsoUtc();
  if (!isOpfsSupported()) {
    return {
      supported: false,
      inspectedAtIso,
      totalFiles: 0,
      totalBytes: 0,
      namespaces: (['tmp', 'backups', 'archives'] as OpfsNamespace[]).map((ns) => ({
        namespace: ns,
        exists: false,
        fileCount: 0,
        totalBytes: 0,
        entries: [],
      })),
    };
  }

  const targetNamespaces: OpfsNamespace[] = ['tmp', 'backups', 'archives'];
  const namespaces: OpfsNamespaceSummary[] = [];
  let totalFiles = 0;
  let totalBytes = 0;

  for (const ns of targetNamespaces) {
    const dir = await getOpfsSubdir(ns, false);
    if (!dir) {
      namespaces.push({
        namespace: ns,
        exists: false,
        fileCount: 0,
        totalBytes: 0,
        entries: [],
      });
      continue;
    }

    const rawEntries = await listDirEntries(dir).catch(() => []);
    const entries: OpfsNamespaceEntryInfo[] = [];
    let nsBytes = 0;
    let nsFileCount = 0;

    for (const item of rawEntries) {
      const kind = item.handle.kind === 'directory' ? 'directory' : 'file';
      let byteSize = 0;
      if (kind === 'file') {
        nsFileCount += 1;
        try {
          const file = await (item.handle as OpfsFileHandle).getFile();
          byteSize = Number(file.size) || 0;
        } catch {
          byteSize = 0;
        }
      }
      nsBytes += byteSize;
      entries.push({
        name: item.name,
        kind,
        byteSize,
      });
    }

    entries.sort((a, b) => b.byteSize - a.byteSize || a.name.localeCompare(b.name));
    totalFiles += nsFileCount;
    totalBytes += nsBytes;
    namespaces.push({
      namespace: ns,
      exists: true,
      fileCount: nsFileCount,
      totalBytes: nsBytes,
      entries,
    });
  }

  return {
    supported: true,
    inspectedAtIso,
    totalFiles,
    totalBytes,
    namespaces,
  };
}

registerIndexedDbOpfsDumper((dbName, reason) => dumpIndexedDbDatabaseToOpfs(dbName, reason));
