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

import { hasNonTestingBarnData } from '../core/backupStatus';
import {
  APP_SCHEMA_BUILD_TAG,
  ArchivedHerdIndexEntry,
  buildEmptyFallbackSettings,
  buildExportCanaryProbe,
  CURRENT_BACKUP_SCHEMA_VERSION,
  migrateAndValidateBackupEnvelope,
  MigratedBackupResult,
  serializeVaultBackupEnvelope,
  sha256HexPure,
  unpackArchivedAnimalBundle,
  UnpackedArchivedHerdBundle,
  VaultBackupKind,
  VaultBackupMetadata,
  verifyExportCanaryRoundTrip,
} from '../core/backupVault';
import { BarnDatabaseSnapshot, BarnSettings, generateUuid, nowIsoUtc } from '../core/models';
import { isSampleTestingId } from '../core/sampleData';
import { logDiagnosticEvent } from './crashLogger';
import { isQuotaExceededError } from './storageProtection';

export type OpfsNamespace = 'tmp' | 'backups' | 'archives';

export interface OpfsWritableStream {
  write(data: string | Uint8Array | ArrayBuffer | Blob): Promise<void>;
  close(): Promise<void>;
}

export interface OpfsFileHandle {
  kind?: 'file';
  name: string;
  getFile(): Promise<File | Blob>;
  createWritable(): Promise<OpfsWritableStream>;
}

export interface OpfsDirectoryHandle {
  kind?: 'directory';
  name?: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries?: () => AsyncIterable<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
  values?: () => AsyncIterable<OpfsFileHandle | OpfsDirectoryHandle>;
}

export interface PriorUseSentinel {
  barnName: string;
  animalCount: number;
  nonTestingCount: number;
  lastSeenIso: string;
}

export interface WipedStorageRecoveryContext {
  detected: boolean;
  reason: 'sentinel' | 'opfs_backups' | 'opfs_archives' | 'none';
  sentinel: PriorUseSentinel | null;
  latestOpfsBackup: VaultBackupMetadata | null;
  opfsBackupsCount: number;
  opfsArchivesCount: number;
}

export const MAX_MONTHLY_OPFS_BACKUPS = 6;
export const MAX_PRE_UPGRADE_OPFS_BACKUPS = 3;
export const MAX_PRE_RESET_OPFS_BACKUPS = 8;
export const MONTHLY_BACKUP_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
export const EXPORT_CANARY_INTERVAL_MS = 12 * 60 * 60 * 1000;

const PRIOR_USE_SENTINEL_KEY = 'pedigree.priorUseSentinel.v1';
const CANARY_LAST_RUN_KEY = 'pedigree.opfsCanaryLastRunMs.v1';
const VAULT_INDEX_FILE = 'vault-index.json';
const ARCHIVES_INDEX_FILE = 'archives-index.json';
const CANARY_PROBE_FILE = 'canary-probe.json';

let testRootResolver: (() => Promise<OpfsDirectoryHandle | null>) | null = null;

/**
 * Allows deterministic unit tests to inject an in-memory OPFS root handle mock.
 * Pass `null` to restore native browser `navigator.storage.getDirectory()`.
 */
export function setOpfsRootResolverForTest(
  resolver: (() => Promise<OpfsDirectoryHandle | null>) | null
): void {
  testRootResolver = resolver;
}

export function isOpfsSupported(): boolean {
  if (testRootResolver) return true;
  if (typeof navigator === 'undefined') return false;
  const storage = navigator.storage as (StorageManager & { getDirectory?: unknown }) | undefined;
  return Boolean(storage && typeof storage.getDirectory === 'function');
}

async function getOpfsRoot(): Promise<OpfsDirectoryHandle | null> {
  if (testRootResolver) {
    return testRootResolver();
  }
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage as
    | (StorageManager & { getDirectory?: () => Promise<OpfsDirectoryHandle> })
    | undefined;
  if (!storage || typeof storage.getDirectory !== 'function') {
    return null;
  }
  try {
    return (await storage.getDirectory()) as unknown as OpfsDirectoryHandle;
  } catch (err) {
    logDiagnosticEvent({
      level: 'warn',
      category: 'storage',
      message: 'Could not open Origin Private File System root directory — using fallback storage',
      error: err,
    });
    return null;
  }
}

export async function getOpfsSubdir(
  namespace: OpfsNamespace,
  create = true
): Promise<OpfsDirectoryHandle | null> {
  const root = await getOpfsRoot();
  if (!root) return null;
  try {
    return await root.getDirectoryHandle(namespace, { create });
  } catch {
    return null;
  }
}

async function listDirEntries(
  dir: OpfsDirectoryHandle
): Promise<Array<{ name: string; handle: OpfsFileHandle | OpfsDirectoryHandle }>> {
  const results: Array<{ name: string; handle: OpfsFileHandle | OpfsDirectoryHandle }> = [];
  if (typeof dir.entries === 'function') {
    for await (const [name, handle] of dir.entries()) {
      results.push({ name, handle });
    }
    return results;
  }
  if (typeof dir.values === 'function') {
    for await (const handle of dir.values()) {
      if (handle && typeof handle.name === 'string') {
        results.push({ name: handle.name, handle });
      }
    }
  }
  return results;
}

async function readOpfsFileText(
  dir: OpfsDirectoryHandle,
  fileName: string
): Promise<string | null> {
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

async function readOpfsFileBytes(
  dir: OpfsDirectoryHandle,
  fileName: string
): Promise<Uint8Array | null> {
  try {
    const fh = await dir.getFileHandle(fileName, { create: false });
    const file = await fh.getFile();
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function removeOpfsEntrySafe(dir: OpfsDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.removeEntry(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes payload to a file inside `dir`, guaranteeing `writable.close()` inside `try / finally`.
 * If `QuotaExceededError` occurs, purges `/tmp` and retries the write once cleanly.
 */
async function writeFileToOpfsDir(
  dir: OpfsDirectoryHandle,
  fileName: string,
  data: string | Uint8Array | Blob
): Promise<void> {
  const runWrite = async () => {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const writable = await fh.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  };

  try {
    await runWrite();
  } catch (err) {
    if (isQuotaExceededError(err)) {
      const purged = await purgeOpfsTmp();
      logDiagnosticEvent({
        level: 'warn',
        category: 'memory',
        message: `Corrective action: QuotaExceededError during OPFS write "${fileName}" — purged ${purged.filesRemoved} /tmp file(s) and retrying once`,
        error: err,
      });
      await runWrite();
      return;
    }
    throw err;
  }
}

function compactStamp(iso: string): string {
  return iso.replace(/[-:T.Z]/g, '').slice(0, 15);
}

// ---------------------------------------------------------------------------
// 1. Ephemeral Export Scratchpad (`/tmp`) & Boot Orphan Sweep
// ---------------------------------------------------------------------------

export async function purgeOpfsTmp(): Promise<{ filesRemoved: number; bytesFreed: number }> {
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return { filesRemoved: 0, bytesFreed: 0 };

  let filesRemoved = 0;
  let bytesFreed = 0;
  try {
    const entries = await listDirEntries(tmpDir);
    for (const item of entries) {
      if (item.handle.kind === 'directory') continue;
      try {
        const file = await (item.handle as OpfsFileHandle).getFile();
        bytesFreed += Number(file.size) || 0;
      } catch {
        // Ignore size inspect failure
      }
      if (await removeOpfsEntrySafe(tmpDir, item.name)) {
        filesRemoved++;
      }
    }
  } catch {
    // Non-fatal purge failure
  }
  return { filesRemoved, bytesFreed };
}

export async function sweepOrphanedOpfsTmpOnBoot(): Promise<{
  filesRemoved: number;
  bytesFreed: number;
}> {
  const res = await purgeOpfsTmp();
  if (res.filesRemoved > 0) {
    logDiagnosticEvent({
      level: 'info',
      category: 'storage',
      message: `Corrective action: Boot orphan sweep removed ${res.filesRemoved} stale /tmp OPFS file(s) (${res.bytesFreed} bytes reclaimed)`,
    });
  }
  return res;
}

export async function writeTempOpfsFile(
  prefix: string,
  data: string | Uint8Array | Blob,
  extension = 'tmp'
): Promise<{ fileName: string } | null> {
  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) return null;
  const cleanPrefix = (prefix || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 32);
  const cleanExt = (extension || 'tmp').replace(/[^a-z0-9]/gi, '') || 'tmp';
  const fileName = `${cleanPrefix}-${Date.now().toString(36)}-${generateUuid().slice(0, 8)}.${cleanExt}`;
  await writeFileToOpfsDir(tmpDir, fileName, data);
  return { fileName };
}

export async function readTempOpfsFileAsBlob(fileName: string): Promise<Blob | null> {
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return null;
  try {
    const fh = await tmpDir.getFileHandle(fileName, { create: false });
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function removeTempOpfsFile(fileName: string): Promise<void> {
  const tmpDir = await getOpfsSubdir('tmp', false);
  if (!tmpDir) return;
  await removeOpfsEntrySafe(tmpDir, fileName);
}

// ---------------------------------------------------------------------------
// 2. OPFS Backup Vault (`/backups`) + Retention Pruning
// ---------------------------------------------------------------------------

function buildVaultFileName(kind: VaultBackupKind, createdAtIso: string): string {
  const stamp = compactStamp(createdAtIso);
  const shortId = generateUuid().slice(0, 6);
  if (kind === 'monthly') {
    const ym = createdAtIso.slice(0, 7);
    return `monthly-${ym}-${stamp}-${shortId}.json`;
  }
  if (kind === 'pre_upgrade') {
    return `pre-upgrade-${stamp}-${shortId}.json`;
  }
  if (kind === 'pre_reset') {
    return `pre-reset-${stamp}-${shortId}.json`;
  }
  if (kind === 'recovery_dump') {
    return `recovery-pre-reset-${stamp}-${shortId}.json`;
  }
  return `manual-vault-${stamp}-${shortId}.json`;
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

  // Self-heal vault index by scanning `/backups/*.json` files safely
  const rebuilt: VaultBackupMetadata[] = [];
  const entries = await listDirEntries(backupsDir);
  for (const entry of entries) {
    if (
      entry.handle.kind === 'directory' ||
      entry.name === VAULT_INDEX_FILE ||
      !entry.name.endsWith('.json')
    ) {
      continue;
    }
    try {
      const text = await readOpfsFileText(backupsDir, entry.name);
      if (!text) continue;
      const parsed = JSON.parse(text) as Record<string, any>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const snap = parsed.snapshot && typeof parsed.snapshot === 'object' ? parsed.snapshot : parsed;
      const animalCount = Array.isArray(snap?.animals) ? snap.animals.length : 0;
      const photoCount = Array.isArray(snap?.animalPhotos) ? snap.animalPhotos.length : 0;
      const speciesCount = Array.isArray(snap?.speciesProfiles) ? snap.speciesProfiles.length : 0;
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
        barnName: String(snap?.settings?.barnName || 'My Barn'),
        animalCount,
        photoCount,
        speciesCount,
        byteSize: text.length,
        checksumSha256: String(parsed.checksumSha256 || sha256HexPure(text)),
        source: 'opfs',
        note: typeof parsed.note === 'string' ? parsed.note : undefined,
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

async function enforceVaultRetention(
  backupsDir: OpfsDirectoryHandle,
  items: VaultBackupMetadata[]
): Promise<VaultBackupMetadata[]> {
  const byKindCap: Partial<Record<VaultBackupKind, number>> = {
    monthly: MAX_MONTHLY_OPFS_BACKUPS,
    pre_upgrade: MAX_PRE_UPGRADE_OPFS_BACKUPS,
    pre_reset: MAX_PRE_RESET_OPFS_BACKUPS,
  };

  const keepSet = new Set<string>();
  const deleteFiles: string[] = [];

  // Keep unlimited manual/recovery entries (up to reasonable cap on pre_reset/pre_upgrade/monthly)
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
      if (cap === undefined || idx < cap) {
        keepSet.add(item.key);
      } else {
        deleteFiles.push(item.fileName);
      }
    });
  }

  for (const fileName of deleteFiles) {
    await removeOpfsEntrySafe(backupsDir, fileName);
  }

  return items
    .filter((i) => keepSet.has(i.key))
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

export async function saveOpfsVaultBackup(
  snapshot: BarnDatabaseSnapshot,
  options: {
    kind: VaultBackupKind;
    note?: string;
    appVersion?: string;
  }
): Promise<VaultBackupMetadata | null> {
  const backupsDir = await getOpfsSubdir('backups', true);
  if (!backupsDir) return null;

  const createdAtIso = nowIsoUtc();
  const { envelope, jsonText } = serializeVaultBackupEnvelope(snapshot, {
    kind: options.kind,
    createdAtIso,
    createdByAppVersion: options.appVersion || APP_SCHEMA_BUILD_TAG,
    note: options.note,
  });

  const fileName = buildVaultFileName(options.kind, createdAtIso);
  await writeFileToOpfsDir(backupsDir, fileName, jsonText);

  const meta: VaultBackupMetadata = {
    key: fileName,
    fileName,
    kind: options.kind,
    schemaVersion: envelope._schemaVersion,
    createdAtIso,
    createdByAppVersion: envelope.createdByAppVersion,
    barnName: snapshot.settings.barnName || 'My Barn',
    animalCount: snapshot.animals.length,
    photoCount: (snapshot.animalPhotos ?? []).length,
    speciesCount: snapshot.speciesProfiles.length,
    byteSize: jsonText.length,
    checksumSha256: envelope.checksumSha256,
    source: 'opfs',
    note: envelope.note,
  };

  const existing = await readVaultIndex(backupsDir);
  const nextList = await enforceVaultRetention(backupsDir, [
    meta,
    ...existing.filter((i) => i.key !== meta.key),
  ]);
  await writeVaultIndex(backupsDir, nextList);
  return meta;
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

  const text = await readOpfsFileText(backupsDir, targetFile);
  if (!text) return null;

  try {
    const migrated = migrateAndValidateBackupEnvelope(text, fallbackSettings);
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
  return readOpfsFileText(backupsDir, meta?.fileName || key);
}

export async function deleteOpfsVaultBackup(key: string): Promise<boolean> {
  const backupsDir = await getOpfsSubdir('backups', false);
  if (!backupsDir) return false;
  const items = await readVaultIndex(backupsDir);
  const target = items.find((i) => i.key === key || i.fileName === key);
  const removed = await removeOpfsEntrySafe(backupsDir, target?.fileName || key);
  const remaining = items.filter((i) => i.key !== key && i.fileName !== key);
  await writeVaultIndex(backupsDir, remaining);
  return removed;
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
      const unpacked = unpackArchivedAnimalBundle(bytes);
      rebuilt.push({
        archiveKey: unpacked.archiveKey,
        fileName: entry.name,
        createdAtIso: unpacked.createdAtIso,
        schemaVersion: unpacked.schemaVersion,
        byteSize: bytes.byteLength,
        checksumSha256: unpacked.checksumSha256,
        speciesSummary: Array.from(new Set(unpacked.animals.map((a) => a.species).filter(Boolean))),
        animalCount: unpacked.animals.length,
        photoCount: unpacked.animalPhotos.length,
        careLogCount: unpacked.careLogs.length,
        animals: unpacked.animals.map((a) => ({
          id: a.id,
          name: a.name,
          tattoo: a.tattoo,
          species: a.species,
          breed: a.breed,
          variety: a.variety,
          sex: a.sex,
          status: a.status,
          birthDateIso: a.birthDateIso,
          soldDateIso: a.soldDateIso,
          deceasedDateIso: a.deceasedDateIso,
          buyerName: a.buyerName,
          deathCause: a.deathCause,
          hasPedigreeStubInDb: false,
        })),
      });
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
  const archivesDir = await getOpfsSubdir('archives', true);
  if (!archivesDir) return null;

  await writeFileToOpfsDir(archivesDir, indexEntry.fileName, zipBytes);
  const existing = await readArchivesIndex(archivesDir);
  const next = [indexEntry, ...existing.filter((e) => e.archiveKey !== indexEntry.archiveKey)];
  await writeArchivesIndex(archivesDir, next);
  return indexEntry;
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

export async function deleteOpfsHerdArchive(archiveKey: string): Promise<boolean> {
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
}

// ---------------------------------------------------------------------------
// 4. Prior-Use Eviction Sentinel & Wiped Browser Storage Detection
// ---------------------------------------------------------------------------

export function readPriorUseSentinel(): PriorUseSentinel | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PRIOR_USE_SENTINEL_KEY);
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
  if (typeof localStorage === 'undefined') return;
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
    localStorage.setItem(PRIOR_USE_SENTINEL_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage quota failures
  }
}

export function clearPriorUseSentinel(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(PRIOR_USE_SENTINEL_KEY);
  } catch {
    // Ignore
  }
}

export async function detectReturningUserWipedStorage(): Promise<WipedStorageRecoveryContext> {
  const sentinel = readPriorUseSentinel();
  const [backups, archives] = await Promise.all([
    listOpfsVaultBackups().catch(() => [] as VaultBackupMetadata[]),
    listOpfsHerdArchives().catch(() => [] as ArchivedHerdIndexEntry[]),
  ]);

  const latestOpfsBackup = backups.length > 0 ? backups[0] : null;
  if (backups.length > 0) {
    return {
      detected: true,
      reason: 'opfs_backups',
      sentinel,
      latestOpfsBackup,
      opfsBackupsCount: backups.length,
      opfsArchivesCount: archives.length,
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
    };
  }
  return {
    detected: false,
    reason: 'none',
    sentinel: null,
    latestOpfsBackup: null,
    opfsBackupsCount: 0,
    opfsArchivesCount: 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Idle Background Export Canary (`/tmp/canary-probe.json`)
// ---------------------------------------------------------------------------

export function shouldRunExportCanary(nowMs: number = Date.now()): boolean {
  if (!isOpfsSupported()) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  if (typeof localStorage === 'undefined') return true;
  try {
    const raw = localStorage.getItem(CANARY_LAST_RUN_KEY);
    if (!raw) return true;
    const prevMs = Number(raw);
    if (!Number.isFinite(prevMs) || prevMs <= 0) return true;
    return nowMs - prevMs >= EXPORT_CANARY_INTERVAL_MS;
  } catch {
    return true;
  }
}

export async function runOpfsExportCanary(
  snapshot: BarnDatabaseSnapshot
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  if (!isOpfsSupported()) {
    return { ok: true, skipped: true };
  }
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return { ok: true, skipped: true };
  }

  const tmpDir = await getOpfsSubdir('tmp', true);
  if (!tmpDir) {
    return { ok: true, skipped: true };
  }

  const probe = buildExportCanaryProbe(snapshot);
  const serialized = JSON.stringify(probe);
  try {
    await writeFileToOpfsDir(tmpDir, CANARY_PROBE_FILE, serialized);
    const readBack = await readOpfsFileText(tmpDir, CANARY_PROBE_FILE);
    if (!readBack) {
      return {
        ok: false,
        reason: 'OPFS canary probe could not be read back after writing.',
      };
    }
    const verified = verifyExportCanaryRoundTrip(probe, readBack);
    if (!verified.ok) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Export canary verification failed: ${verified.reason || 'unknown mismatch'}`,
      });
      return { ok: false, reason: verified.reason };
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CANARY_LAST_RUN_KEY, String(Date.now()));
      } catch {
        // Non-fatal
      }
    }
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'OPFS canary probe write error';
    logDiagnosticEvent({
      level: 'warn',
      category: isQuotaExceededError(err) ? 'memory' : 'storage',
      message: `Export canary failed: ${reason}`,
      error: err,
    });
    return { ok: false, reason };
  } finally {
    await removeOpfsEntrySafe(tmpDir, CANARY_PROBE_FILE);
  }
}

// ---------------------------------------------------------------------------
// 6. IndexedDB `VersionError` / Migration Failure Rescue Dump
// ---------------------------------------------------------------------------

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
    stores: params.stores ?? {},
  };
  const jsonText = JSON.stringify(payload, null, 2);

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
      byteSize: jsonText.length,
      checksumSha256: sha256HexPure(jsonText),
      source: 'opfs',
      note: `Raw IndexedDB dump (${params.sourceDbName}): ${params.reason}`,
    };
    const existing = await readVaultIndex(backupsDir);
    await writeVaultIndex(backupsDir, [meta, ...existing]);
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
  if (typeof indexedDB === 'undefined') return null;

  let rescuedDb: IDBDatabase | null = null;
  try {
    rescuedDb = await new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Rescue IndexedDB open timed out'));
      }, 4000);
      try {
        const req = indexedDB.open(dbName);
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

    const storeNames = Array.from(rescuedDb.objectStoreNames);
    const dumpedStores: Record<string, unknown[]> = {};
    let salvagedSnapshot: BarnDatabaseSnapshot | null = null;

    if (storeNames.length > 0) {
      await new Promise<void>((resolve) => {
        try {
          const tx = rescuedDb!.transaction(storeNames, 'readonly');
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
              if (pending === 0) resolve();
            };
            getAllReq.onerror = () => {
              pending--;
              if (pending === 0) resolve();
            };
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
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
