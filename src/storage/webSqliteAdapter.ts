/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Unencrypted Local SQLite Browser Adapter (`sql.js` WebAssembly + IndexedDB Persistence).
 *
 * Uses standard relational SQLite tables identical to what `expo-sqlite` executes on
 * native Android and iOS, and saves the unencrypted `.sqlite` binary file inside the
 * browser's local IndexedDB so users have 100% offline persistence AND 1-click access
 * to download or import the raw `.sqlite` file for Google Drive / OneDrive / SyncThing.
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  validateSqliteFileHeader,
} from '../core/inputSanitization';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  normalizeCalendarSyncSettings,
  normalizeCurrencyCode,
  normalizeIgnoredConflicts,
  normalizeOwnershipType,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeUltrasoundResult,
  normalizeWeightUnit,
  nowIsoUtc,
  ShowEvent,
  SpeciesProfile,
} from '../core/models';
import { buildFullPredefinedSampleSnapshot } from '../core/sampleData';
import { reconcileCarrierTraitLists } from '../core/carrierGenetics';
import { getTierStoragePolicy } from '../core/deviceCapability';
import { buildEmptyShellSnapshot } from '../core/backupVault';
import { sanitizeSpeciesMemo } from '../core/speciesMemo';
import { isMemoryLikeError, logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import {
  detectReturningUserWipedStorage,
  dumpIndexedDbDatabaseToOpfs,
  dumpRawRecordsToOpfsRecoveryBackup,
  isVersionError,
  markPriorUseSentinelFromSnapshot,
  saveOpfsVaultBackup,
  WipedStorageRecoveryContext,
} from './opfsStorage';
import { stripPhotoDataUrlsFromSnapshot } from './photoHydration';
import { SnapshotLoadOptions, StorageAdapter } from './storageAdapter';
import {
  isQuotaExceededError,
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
  saveRollingSnapshotBackup,
} from './storageProtection';

const IDB_DB_NAME = 'community_pedigree_local_db';
const IDB_STORE_NAME = 'sqlite_files';
const IDB_PRIMARY_KEY = 'pedigree_master.sqlite';
const IDB_FALLBACK_SNAPSHOT_KEY = 'pedigree_fallback_json';
const SQLITE_SCHEMA_VERSION = 2;

/**
 * Canonical SQLite DDL shared 1:1 with future `expo-sqlite` native adapter.
 */
export const PEDIGREE_SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS barn_settings (
    id TEXT PRIMARY KEY NOT NULL,
    barn_name TEXT NOT NULL,
    breeder_name TEXT NOT NULL,
    preferred_unit TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'USD',
    default_species TEXT NOT NULL,
    pinned_landing_species TEXT NOT NULL,
    default_generations INTEGER NOT NULL,
    theme_mode TEXT NOT NULL,
    custom_colors_json TEXT NOT NULL DEFAULT '{}',
    image_optimization_preset TEXT NOT NULL DEFAULT 'balanced',
    extra_settings_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS species_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    default_animal_prefix TEXT NOT NULL DEFAULT '',
    preferred_unit TEXT NOT NULL DEFAULT '',
    memo_text TEXT NOT NULL DEFAULT '',
    memo_updated_at TEXT NOT NULL DEFAULT '',
    gestation_days INTEGER NOT NULL,
    rebreed_days_after_birth INTEGER NOT NULL,
    wean_days_after_birth INTEGER NOT NULL,
    maturity_days INTEGER NOT NULL DEFAULT 0,
    birth_event_label TEXT NOT NULL,
    male_label TEXT NOT NULL,
    female_label TEXT NOT NULL,
    offspring_label TEXT NOT NULL,
    example_breeds_json TEXT NOT NULL,
    milestones_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS animals (
    id TEXT PRIMARY KEY NOT NULL,
    tattoo TEXT NOT NULL,
    name TEXT NOT NULL,
    species TEXT NOT NULL,
    breed TEXT NOT NULL,
    variety TEXT NOT NULL,
    sex TEXT NOT NULL,
    status TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    needs_attention INTEGER NOT NULL DEFAULT 0,
    ignored_conflicts_json TEXT NOT NULL DEFAULT '[]',
    birth_date_iso TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    genotype_json TEXT NOT NULL,
    genotype_raw TEXT NOT NULL,
    rufus_level TEXT NOT NULL DEFAULT '',
    suspected_carrier_of_json TEXT NOT NULL DEFAULT '[]',
    confirmed_carrier_of_json TEXT NOT NULL DEFAULT '[]',
    cleared_carrier_of_json TEXT NOT NULL DEFAULT '[]',
    registration_number TEXT NOT NULL,
    grand_champion_number TEXT NOT NULL,
    legs_count INTEGER NOT NULL,
    cage_location TEXT NOT NULL,
    breeder_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    ownership_type TEXT NOT NULL DEFAULT 'Owned',
    culled INTEGER NOT NULL DEFAULT 0,
    cull_date_iso TEXT NOT NULL DEFAULT '',
    cull_reason TEXT NOT NULL DEFAULT '',
    deceased_date_iso TEXT NOT NULL DEFAULT '',
    death_cause TEXT NOT NULL DEFAULT '',
    sold_date_iso TEXT NOT NULL DEFAULT '',
    sale_price_cents INTEGER NOT NULL DEFAULT 0,
    purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
    buyer_name TEXT NOT NULL DEFAULT '',
    sire_id TEXT NOT NULL,
    dam_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    offloaded_archive_key TEXT NOT NULL DEFAULT '',
    offloaded_at_iso TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS animal_photos (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    animal_id TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    caption TEXT NOT NULL,
    original_file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    original_bytes INTEGER NOT NULL,
    stored_bytes INTEGER NOT NULL,
    thumbnail_data_url TEXT NOT NULL,
    data_url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_animal_photos_animal_id ON animal_photos(animal_id);

  CREATE TABLE IF NOT EXISTS cages (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    label TEXT NOT NULL,
    section TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS breedings (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    sire_id TEXT NOT NULL,
    dam_id TEXT NOT NULL,
    sire_name TEXT NOT NULL,
    dam_name TEXT NOT NULL,
    bred_date_iso TEXT NOT NULL,
    expected_due_date_iso TEXT NOT NULL,
    actual_birth_date_iso TEXT NOT NULL,
    projected_coi_percent REAL NOT NULL,
    live_count INTEGER NOT NULL,
    stillborn_count INTEGER NOT NULL,
    fostered_count INTEGER NOT NULL,
    weaned_count INTEGER NOT NULL,
    offspring_created INTEGER NOT NULL,
    status TEXT NOT NULL,
    service_fee_cents INTEGER NOT NULL DEFAULT 0,
    service_fee_direction TEXT NOT NULL DEFAULT 'none',
    ultrasound_date_iso TEXT NOT NULL DEFAULT '',
    ultrasound_result TEXT NOT NULL DEFAULT '',
    ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0,
    ultrasound_projected_due_iso TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS barn_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    due_date_iso TEXT NOT NULL,
    linked_animal_id TEXT NOT NULL,
    linked_animal_name TEXT NOT NULL,
    linked_breeding_id TEXT NOT NULL,
    completed INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS care_logs (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    animal_id TEXT NOT NULL,
    date_iso TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    show_leg_earned INTEGER NOT NULL,
    medication_name TEXT NOT NULL DEFAULT '',
    dosage TEXT NOT NULL DEFAULT '',
    administration_route TEXT NOT NULL DEFAULT '',
    withdrawal_days INTEGER NOT NULL DEFAULT 0,
    withdrawal_clear_date_iso TEXT NOT NULL DEFAULT '',
    body_condition_score REAL NOT NULL DEFAULT 0,
    famacha_score INTEGER NOT NULL DEFAULT 0,
    fecal_egg_count INTEGER NOT NULL DEFAULT 0,
    ultrasound_result TEXT NOT NULL DEFAULT '',
    ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shows (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    sanctioning_body TEXT NOT NULL,
    event_date_iso TEXT NOT NULL,
    entry_deadline_iso TEXT NOT NULL,
    entered_animal_ids_json TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const IDB_OPEN_TIMEOUT_MS = 8000;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    let settled = false;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cb();
    };
    const timer = setTimeout(() => {
      finish(() => {
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message:
            'Corrective action: Primary IndexedDB open timed out after 8s — falling back to non-destructive recovery',
        });
        reject(new Error('Timed out opening local IndexedDB storage.'));
      });
    }, IDB_OPEN_TIMEOUT_MS);

    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
            db.createObjectStore(IDB_STORE_NAME);
          }
        } catch (upgradeErr) {
          void dumpIndexedDbDatabaseToOpfs(
            IDB_DB_NAME,
            'Primary IndexedDB schema upgrade failed'
          ).catch(() => {});
          finish(() => reject(upgradeErr));
        }
      };
      req.onblocked = () => {
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message:
            'Corrective action: Primary IndexedDB connection blocked by another tab or worker',
        });
      };
      req.onsuccess = () => finish(() => resolve(req.result));
      req.onerror = () => {
        const err = req.error || new Error('IndexedDB open failed.');
        if (isVersionError(err)) {
          void dumpIndexedDbDatabaseToOpfs(
            IDB_DB_NAME,
            'Primary IndexedDB VersionError on open'
          ).catch(() => {});
        }
        finish(() => reject(err));
      };
    } catch (err) {
      finish(() => reject(err));
    }
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const req = tx.objectStore(IDB_STORE_NAME).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result as T | undefined);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(value, key);
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
    if (isQuotaExceededError(err)) {
      throw new Error(
        'Browser storage quota reached (QuotaExceededError). Export a backup and clear older photos or install to Home Screen to elevate storage.'
      );
    }
    throw err;
  }
}

async function idbDelete(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openIdb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    tx.objectStore(IDB_STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

/**
 * Purges stale PWA CacheStorage assets, Service Worker registrations, and fallback snapshot caches
 * without deleting the user's primary IndexedDB herd database or diagnostic logs.
 */
export async function purgeStaleBrowserCaches(): Promise<{
  cachesCleared: number;
  serviceWorkersUnregistered: number;
}> {
  let cachesCleared = 0;
  let serviceWorkersUnregistered = 0;

  try {
    await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
  } catch {
    // Ignore IDB fallback delete failure
  }

  if (typeof caches !== 'undefined') {
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const deleted = await caches.delete(name);
        if (deleted) cachesCleared++;
      }
    } catch {
      // Ignore CacheStorage error
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        const unregistered = await reg.unregister();
        if (unregistered) serviceWorkersUnregistered++;
      }
    } catch {
      // Ignore ServiceWorker unregister failure
    }
  }

  return { cachesCleared, serviceWorkersUnregistered };
}

function applySchemaMigrations(db: Database): void {
  db.run(PEDIGREE_SQLITE_SCHEMA);
  const alterStatements = [
    "ALTER TABLE barn_settings ADD COLUMN custom_colors_json TEXT NOT NULL DEFAULT '{}';",
    "ALTER TABLE barn_settings ADD COLUMN image_optimization_preset TEXT NOT NULL DEFAULT 'balanced';",
    "ALTER TABLE barn_settings ADD COLUMN extra_settings_json TEXT NOT NULL DEFAULT '{}';",
    "ALTER TABLE barn_settings ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD';",
    'ALTER TABLE species_profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE species_profiles ADD COLUMN default_animal_prefix TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN preferred_unit TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN memo_text TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN memo_updated_at TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE species_profiles ADD COLUMN maturity_days INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE animals ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE animals ADD COLUMN needs_attention INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN ignored_conflicts_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN suspected_carrier_of_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN confirmed_carrier_of_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN cleared_carrier_of_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE animals ADD COLUMN rufus_level TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN ownership_type TEXT NOT NULL DEFAULT 'Owned';",
    'ALTER TABLE animals ADD COLUMN culled INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN cull_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN cull_reason TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN deceased_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN death_cause TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN sold_date_iso TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE animals ADD COLUMN sale_price_cents INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE animals ADD COLUMN purchase_cost_cents INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN buyer_name TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE breedings ADD COLUMN service_fee_cents INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE breedings ADD COLUMN service_fee_direction TEXT NOT NULL DEFAULT 'none';",
    "ALTER TABLE breedings ADD COLUMN ultrasound_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE breedings ADD COLUMN ultrasound_result TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE breedings ADD COLUMN ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE breedings ADD COLUMN ultrasound_projected_due_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE care_logs ADD COLUMN medication_name TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE care_logs ADD COLUMN dosage TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE care_logs ADD COLUMN administration_route TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE care_logs ADD COLUMN withdrawal_days INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE care_logs ADD COLUMN withdrawal_clear_date_iso TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE care_logs ADD COLUMN body_condition_score REAL NOT NULL DEFAULT 0;',
    'ALTER TABLE care_logs ADD COLUMN famacha_score INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE care_logs ADD COLUMN fecal_egg_count INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE care_logs ADD COLUMN ultrasound_result TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE care_logs ADD COLUMN ultrasound_fetal_count INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE animals ADD COLUMN offloaded_archive_key TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE animals ADD COLUMN offloaded_at_iso TEXT NOT NULL DEFAULT '';",
  ];
  for (const stmt of alterStatements) {
    try {
      db.run(stmt);
    } catch {
      // Column already exists
    }
  }
  db.run(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION};`);
}

function readSqliteUserVersion(db: Database): number {
  try {
    const stmt = db.prepare('PRAGMA user_version;');
    try {
      if (stmt.step()) {
        const row = stmt.getAsObject() as { user_version?: unknown };
        const val = Number(row.user_version);
        return Number.isFinite(val) ? val : 0;
      }
    } finally {
      stmt.free();
    }
  } catch {
    // Ignore PRAGMA query failure
  }
  return 0;
}

export class WebSqliteAdapter implements StorageAdapter {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private fallbackSnapshot: BarnDatabaseSnapshot | null = null;
  private lastRollingSaveMs = 0;
  private wipedRecoveryContext: WipedStorageRecoveryContext | null = null;

  get engineName(): string {
    return this.db ? 'Local SQLite (WASM + IndexedDB)' : 'Local IndexedDB Store';
  }

  getWipedRecoveryContext(): WipedStorageRecoveryContext | null {
    return this.wipedRecoveryContext;
  }

  private async findRecoveredBackupSnapshot(): Promise<{
    snapshot: BarnDatabaseSnapshot;
    source: string;
  } | null> {
    const saved = await idbGet<BarnDatabaseSnapshot>(IDB_FALLBACK_SNAPSHOT_KEY).catch(() => undefined);
    if (
      saved &&
      typeof saved === 'object' &&
      Array.isArray(saved.animals) &&
      Array.isArray(saved.speciesProfiles) &&
      (saved.animals.length > 0 || saved.speciesProfiles.length > 0)
    ) {
      return {
        snapshot: saved,
        source: 'IndexedDB JSON fallback mirror',
      };
    }

    try {
      const rollingList = await listRollingSnapshotBackups();
      for (const item of rollingList) {
        const recovered = await loadRollingSnapshotBackup(item.key);
        if (
          recovered &&
          (recovered.animals.length > 0 || recovered.speciesProfiles.length > 0)
        ) {
          return {
            snapshot: recovered,
            source: `rolling backup "${item.key}" (${item.savedAtIso})`,
          };
        }
      }
    } catch (rollingErr) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: 'Rolling backup scan failed while attempting non-destructive DB recovery',
        error: rollingErr,
      });
    }
    return null;
  }

  private async tryRestoreIntoFreshSqliteDb(snapshot: BarnDatabaseSnapshot): Promise<boolean> {
    if (!this.SQL) return false;
    try {
      const freshDb = new this.SQL.Database();
      applySchemaMigrations(freshDb);
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close failure on previous handle
        }
      }
      this.db = freshDb;
      this.fallbackSnapshot = null;
      await this.replaceSnapshot(snapshot);
      return true;
    } catch (rebuildErr) {
      this.db = null;
      this.fallbackSnapshot = snapshot;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message:
          'Corrective action: Fresh SQLite rebuild failed during recovery — continuing safely in IndexedDB JSON mode',
        error: rebuildErr,
      });
      return false;
    }
  }

  async initialize(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    this.wipedRecoveryContext = null;
    const finalizeSnapshot = (snap: BarnDatabaseSnapshot): BarnDatabaseSnapshot =>
      options?.lightweightPhotos ? stripPhotoDataUrlsFromSnapshot(snap) : snap;

    const tryDetectWipedStorage = async (): Promise<BarnDatabaseSnapshot | null> => {
      if (options?.allowSeedFresh) return null;
      const wiped = await detectReturningUserWipedStorage().catch(() => null);
      if (wiped && wiped.detected) {
        this.wipedRecoveryContext = wiped;
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: `Paused auto-seed: detected prior-use evidence (${wiped.reason}) while primary IndexedDB appeared empty`,
        });
        return finalizeSnapshot(buildEmptyShellSnapshot());
      }
      return null;
    };

    try {
      this.SQL = await initSqlJs({
        locateFile: () => sqlWasmUrl,
      });

      const savedBytes = await idbGet<Uint8Array>(IDB_PRIMARY_KEY);
      if (savedBytes && savedBytes.byteLength > 0) {
        const headerCheck = validateSqliteFileHeader(savedBytes, IDB_PRIMARY_KEY);
        if (!headerCheck.ok) {
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message: `Corrective action: Rejected corrupted primary SQLite header (${headerCheck.error}) — triggering non-destructive recovery`,
          });
          throw new Error(headerCheck.error);
        }
        this.db = new this.SQL.Database(savedBytes);

        // Automated pre-upgrade OPFS snapshot before migrating older schema versions
        const prevSchemaVer = readSqliteUserVersion(this.db);
        if (prevSchemaVer < SQLITE_SCHEMA_VERSION) {
          try {
            const preSnap = await this.loadSnapshot();
            if (preSnap.animals.length > 0) {
              await saveOpfsVaultBackup(preSnap, {
                kind: 'pre_upgrade',
                note: `Automatic pre-upgrade snapshot (SQLite schema v${prevSchemaVer} → v${SQLITE_SCHEMA_VERSION})`,
              });
            }
          } catch {
            // Non-blocking pre-upgrade snapshot
          }
        }

        try {
          applySchemaMigrations(this.db);
        } catch (migErr) {
          let salvagedSnapshot: BarnDatabaseSnapshot | null = null;
          const rawStores: Record<string, unknown[]> = {};
          try {
            salvagedSnapshot = await this.loadSnapshot();
          } catch {
            try {
              rawStores.animals = this.queryObjects('SELECT * FROM animals');
              rawStores.species_profiles = this.queryObjects('SELECT * FROM species_profiles');
            } catch {
              // Ignore raw salvage query errors
            }
          }
          await dumpRawRecordsToOpfsRecoveryBackup({
            sourceDbName: IDB_DB_NAME,
            reason: migErr instanceof Error ? migErr.message : 'SQLite schema migration failure',
            stores: rawStores,
            salvagedSnapshot,
          }).catch(() => {});
          throw migErr;
        }

        const snap = await this.loadSnapshot(options);
        if (snap.speciesProfiles.length === 0 && snap.animals.length === 0) {
          const recovered = await this.findRecoveredBackupSnapshot();
          if (recovered) {
            await this.replaceSnapshot(recovered.snapshot);
            logDiagnosticEvent({
              level: 'warn',
              category: 'storage',
              message: `Corrective action: Recovered ${recovered.snapshot.animals.length} animals from ${recovered.source} after empty SQLite database`,
            });
            return finalizeSnapshot(recovered.snapshot);
          }
          const wipedShell = await tryDetectWipedStorage();
          if (wipedShell) {
            return wipedShell;
          }
          const seeded = buildFullPredefinedSampleSnapshot();
          await this.replaceSnapshot(seeded);
          logDiagnosticEvent({
            level: 'info',
            category: 'storage',
            message: `Corrective action: Empty SQLite store with no backups initialized with starter sample data (${seeded.animals.length} animals)`,
          });
          return finalizeSnapshot(seeded);
        }
        return snap;
      } else {
        const recovered = await this.findRecoveredBackupSnapshot();
        this.db = new this.SQL.Database();
        applySchemaMigrations(this.db);
        if (recovered) {
          await this.replaceSnapshot(recovered.snapshot);
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message: `Corrective action: Restored ${recovered.snapshot.animals.length} animals from ${recovered.source} when primary SQLite blob was missing`,
          });
          return finalizeSnapshot(recovered.snapshot);
        }
        const wipedShell = await tryDetectWipedStorage();
        if (wipedShell) {
          return wipedShell;
        }
        const seeded = buildFullPredefinedSampleSnapshot();
        await this.replaceSnapshot(seeded);
        return finalizeSnapshot(seeded);
      }
    } catch (err) {
      console.warn('WASM SQLite fallback to IndexedDB JSON / Rolling Snapshot:', err);
      logDiagnosticEvent({
        level: 'error',
        category: isMemoryLikeError(err) ? 'memory' : 'storage',
        message: 'Primary SQLite load failed — attempting non-destructive recovery from fallback/rolling backup',
        error: err,
      });

      if (isVersionError(err)) {
        await dumpIndexedDbDatabaseToOpfs(IDB_DB_NAME, 'Primary SQLite IndexedDB VersionError').catch(
          () => {}
        );
      }

      const recovered = await this.findRecoveredBackupSnapshot();
      if (recovered) {
        const rebuiltSqlite = await this.tryRestoreIntoFreshSqliteDb(recovered.snapshot);
        if (!rebuiltSqlite) {
          this.fallbackSnapshot = recovered.snapshot;
        }
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: `Corrective action: Auto-recovered ${recovered.snapshot.animals.length} animals from ${recovered.source}${rebuiltSqlite ? ' and rebuilt clean SQLite DB' : ''}`,
        });
        return finalizeSnapshot(recovered.snapshot);
      }

      const wipedShell = await tryDetectWipedStorage();
      if (wipedShell) {
        return wipedShell;
      }

      const seeded = buildFullPredefinedSampleSnapshot();
      this.fallbackSnapshot = seeded;
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Primary & fallback stores unavailable — initialized clean starter snapshot (${seeded.animals.length} sample animals)`,
      });
      try {
        await idbSet(IDB_FALLBACK_SNAPSHOT_KEY, seeded);
      } catch {
        // Keep in-memory fallback even if quota is full
      }
      return finalizeSnapshot(seeded);
    }
  }

  private async persistToDisk(preloadedSnapshot?: BarnDatabaseSnapshot): Promise<void> {
    try {
      if (this.db) {
        const bytes = this.db.export();
        await idbSet(IDB_PRIMARY_KEY, bytes);
      } else if (this.fallbackSnapshot) {
        await idbSet(IDB_FALLBACK_SNAPSHOT_KEY, this.fallbackSnapshot);
      }
    } catch (err) {
      logDiagnosticEvent({
        level: 'error',
        category: isMemoryLikeError(err) ? 'memory' : 'storage',
        message: isQuotaExceededError(err)
          ? 'IndexedDB storage quota exceeded while saving database'
          : 'Failed writing local database to IndexedDB',
        error: err,
      });
      throw err;
    }

    // Periodically capture rolling snapshot backup + JSON fallback mirror (at most every 15s)
    const nowMs = Date.now();
    if (nowMs - this.lastRollingSaveMs > 15_000) {
      this.lastRollingSaveMs = nowMs;
      try {
        const policy = getTierStoragePolicy(detectCurrentDeviceCapability().tier);
        const snap = preloadedSnapshot
          ? policy.dehydrateMirrorPhotos
            ? stripPhotoDataUrlsFromSnapshot(preloadedSnapshot)
            : preloadedSnapshot
          : await this.loadSnapshot({ lightweightPhotos: policy.dehydrateMirrorPhotos });
        markPriorUseSentinelFromSnapshot(snap);
        void saveRollingSnapshotBackup(snap, {
          maxRollingBackups: policy.rollingIdbCap,
          dehydratePhotos: policy.dehydrateMirrorPhotos,
        }).catch(() => {});
        if (this.db) {
          void idbSet(IDB_FALLBACK_SNAPSHOT_KEY, snap).catch(() => {});
        }
      } catch {
        // Non-fatal background mirror error
      }
    }
  }

  private queryObjects(sql: string): Record<string, any>[] {
    if (!this.db) return [];
    const stmt = this.db.prepare(sql);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  private safeParseJson<T>(raw: unknown, fallback: T, contextLabel: string): T {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      const parsed = JSON.parse(String(raw));
      return parsed === null || parsed === undefined ? fallback : (parsed as T);
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Auto-recovered malformed JSON in ${contextLabel} using safe default`,
        error: err,
      });
      return fallback;
    }
  }

  async loadSnapshot(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    if (!this.db) {
      const base = this.fallbackSnapshot ?? buildFullPredefinedSampleSnapshot();
      return options?.lightweightPhotos ? stripPhotoDataUrlsFromSnapshot(base) : base;
    }

    let sanitizedNumericCount = 0;
    const finiteNum = (raw: unknown, fallback: number): number => {
      if (raw === null || raw === undefined || raw === '') return fallback;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        sanitizedNumericCount++;
        return fallback;
      }
      return num;
    };
    const finiteNonNeg = (raw: unknown, fallback = 0): number => {
      const n = finiteNum(raw, fallback);
      if (n < 0) {
        sanitizedNumericCount++;
        return fallback;
      }
      return n;
    };
    const safeArray = <T>(val: unknown): T[] => (Array.isArray(val) ? (val as T[]) : []);

    const settingsRows = this.queryObjects('SELECT * FROM barn_settings LIMIT 1');
    const sRow = settingsRows[0];
    const extraSettings = sRow?.extra_settings_json
      ? this.safeParseJson<Record<string, any>>(
          sRow.extra_settings_json,
          {},
          'barn_settings.extra_settings_json'
        )
      : {};
    const rawGen = Number(sRow?.default_generations);
    const parsedGen: 3 | 4 | 5 | 6 =
      rawGen === 4 || rawGen === 5 || rawGen === 6 ? rawGen : 3;

    const settings: BarnSettings = sRow
      ? {
          id: String(sRow.id),
          barnName: String(sRow.barn_name),
          breederName: String(sRow.breeder_name),
          preferredUnit: normalizeWeightUnit(sRow.preferred_unit, 'lbs_oz'),
          currencyCode: normalizeCurrencyCode(sRow.currency_code, 'USD'),
          defaultSpecies: String(sRow.default_species || 'Rabbit'),
          pinnedLandingSpecies: String(sRow.pinned_landing_species ?? ''),
          defaultGenerations: parsedGen,
          themeMode: sRow.theme_mode === 'dark' ? 'dark' : 'light',
          customColors: sRow.custom_colors_json
            ? this.safeParseJson(
                sRow.custom_colors_json,
                undefined,
                'barn_settings.custom_colors_json'
              )
            : undefined,
          imageOptimizationPreset:
            sRow.image_optimization_preset === 'compact' ||
            sRow.image_optimization_preset === 'balanced' ||
            sRow.image_optimization_preset === 'high_detail'
              ? sRow.image_optimization_preset
              : 'balanced',
          showHomeSummaryGrid:
            typeof extraSettings.showHomeSummaryGrid === 'boolean'
              ? extraSettings.showHomeSummaryGrid
              : true,
          barnNameOnboarded:
            typeof extraSettings.barnNameOnboarded === 'boolean'
              ? extraSettings.barnNameOnboarded
              : false,
          ignoredTaskIds: safeArray<string>(extraSettings.ignoredTaskIds),
          dismissedTaskGroupKeys:
            extraSettings.dismissedTaskGroupKeys &&
            typeof extraSettings.dismissedTaskGroupKeys === 'object'
              ? extraSettings.dismissedTaskGroupKeys
              : {},
          dismissedMemoAlertSignatures:
            extraSettings.dismissedMemoAlertSignatures &&
            typeof extraSettings.dismissedMemoAlertSignatures === 'object'
              ? extraSettings.dismissedMemoAlertSignatures
              : {},
          speciesHubBlockOrder:
            extraSettings.speciesHubBlockOrder &&
            typeof extraSettings.speciesHubBlockOrder === 'object'
              ? extraSettings.speciesHubBlockOrder
              : {},
          includePhotoOnPedigree: Boolean(extraSettings.includePhotoOnPedigree),
          calendarSync: normalizeCalendarSyncSettings(extraSettings.calendarSync),
          lastBackupMeta:
            extraSettings.lastBackupMeta && typeof extraSettings.lastBackupMeta === 'object'
              ? extraSettings.lastBackupMeta
              : undefined,
          backupReminderSnoozedUntilMs:
            typeof extraSettings.backupReminderSnoozedUntilMs === 'number' &&
            Number.isFinite(extraSettings.backupReminderSnoozedUntilMs)
              ? extraSettings.backupReminderSnoozedUntilMs
              : undefined,
          autoOffloadRetiredToOpfs: Boolean(extraSettings.autoOffloadRetiredToOpfs),
          updatedAt: String(sRow.updated_at || nowIsoUtc()),
        }
      : {
          id: 'barn_settings',
          barnName: 'Copper Creek Barn',
          breederName: '',
          preferredUnit: 'lbs_oz',
          currencyCode: 'USD',
          defaultSpecies: 'Rabbit',
          pinnedLandingSpecies: '',
          defaultGenerations: 3,
          themeMode: 'dark',
          imageOptimizationPreset: 'balanced',
          showHomeSummaryGrid: true,
          barnNameOnboarded: false,
          ignoredTaskIds: [],
          dismissedTaskGroupKeys: {},
          dismissedMemoAlertSignatures: {},
          speciesHubBlockOrder: {},
          includePhotoOnPedigree: false,
          calendarSync: { ...DEFAULT_CALENDAR_SYNC_SETTINGS },
          autoOffloadRetiredToOpfs: false,
          updatedAt: nowIsoUtc(),
        };

    const speciesProfiles: SpeciesProfile[] = this.queryObjects(
      'SELECT * FROM species_profiles ORDER BY sort_order ASC, name ASC'
    ).map((r, idx) => {
      const maturity = finiteNonNeg(r.maturity_days, 0);
      return {
        id: String(r.id),
        name: String(r.name),
        sortOrder: finiteNum(r.sort_order, idx),
        defaultAnimalPrefix: String(r.default_animal_prefix || ''),
        preferredUnit:
          r.preferred_unit === 'lbs_oz' ||
          r.preferred_unit === 'lbs' ||
          r.preferred_unit === 'grams' ||
          r.preferred_unit === 'kg'
            ? r.preferred_unit
            : undefined,
        memoText: sanitizeSpeciesMemo(r.memo_text ?? ''),
        memoUpdatedAt: String(r.memo_updated_at || ''),
        gestationDays: finiteNonNeg(r.gestation_days, 31),
        rebreedDaysAfterBirth: finiteNonNeg(r.rebreed_days_after_birth, 28),
        weanDaysAfterBirth: finiteNonNeg(r.wean_days_after_birth, 42),
        maturityDays: maturity > 0 ? maturity : undefined,
        birthEventLabel: String(r.birth_event_label),
        maleLabel: String(r.male_label),
        femaleLabel: String(r.female_label),
        offspringLabel: String(r.offspring_label),
        exampleBreeds: safeArray<string>(
          this.safeParseJson<string[]>(
            r.example_breeds_json || '[]',
            [],
            `species_profiles(${String(r.name)}).example_breeds_json`
          )
        ),
        milestones: safeArray(
          this.safeParseJson(
            r.milestones_json || '[]',
            [],
            `species_profiles(${String(r.name)}).milestones_json`
          )
        ),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const animals: Animal[] = this.queryObjects('SELECT * FROM animals ORDER BY name ASC').map(
      (r) => {
        const animalLabel = String(r.name || r.id || 'unknown');
        const suspectedRaw = this.safeParseJson<unknown>(
          r.suspected_carrier_of_json || '[]',
          [],
          `animals(${animalLabel}).suspected_carrier_of_json`
        );
        const confirmedRaw = this.safeParseJson<unknown>(
          r.confirmed_carrier_of_json || '[]',
          [],
          `animals(${animalLabel}).confirmed_carrier_of_json`
        );
        const clearedRaw = this.safeParseJson<unknown>(
          r.cleared_carrier_of_json || '[]',
          [],
          `animals(${animalLabel}).cleared_carrier_of_json`
        );
        const carriers = reconcileCarrierTraitLists(suspectedRaw, confirmedRaw, clearedRaw);
        return {
          id: String(r.id),
          tattoo: String(r.tattoo),
          name: String(r.name),
          species: String(r.species),
          breed: String(r.breed),
          variety: String(r.variety),
          sex: (r.sex as any) || 'Unknown',
          status: (r.status as any) || 'Active',
          archived: Number(r.archived) === 1,
          needsAttention: Number(r.needs_attention) === 1,
          ignoredConflicts: normalizeIgnoredConflicts(
            this.safeParseJson(
              r.ignored_conflicts_json || '[]',
              [],
              `animals(${animalLabel}).ignored_conflicts_json`
            )
          ),
          birthDateIso: String(r.birth_date_iso),
          weightGrams: finiteNonNeg(r.weight_grams, 0),
          genotype: safeArray(
            this.safeParseJson(
              r.genotype_json || '[]',
              [],
              `animals(${animalLabel}).genotype_json`
            )
          ),
          genotypeRaw: String(r.genotype_raw),
          rufusLevel: normalizeRufusLevel(r.rufus_level),
          suspectedCarrierOf: carriers.suspectedCarrierOf,
          confirmedCarrierOf: carriers.confirmedCarrierOf,
          clearedCarrierOf: carriers.clearedCarrierOf,
          registrationNumber: String(r.registration_number),
          grandChampionNumber: String(r.grand_champion_number),
          legsCount: finiteNonNeg(r.legs_count, 0),
          cageLocation: String(r.cage_location),
          breederName: String(r.breeder_name),
          ownerName: String(r.owner_name),
          ownershipType: normalizeOwnershipType(r.ownership_type, 'Owned'),
          culled: Number(r.culled) === 1,
          cullDateIso: String(r.cull_date_iso || ''),
          cullReason: String(r.cull_reason || ''),
          deceasedDateIso: String(r.deceased_date_iso || ''),
          deathCause: String(r.death_cause || ''),
          soldDateIso: String(r.sold_date_iso || ''),
          salePriceCents: finiteNonNeg(r.sale_price_cents, 0),
          purchaseCostCents: finiteNonNeg(r.purchase_cost_cents, 0),
          buyerName: String(r.buyer_name || ''),
          sireId: String(r.sire_id),
          damId: String(r.dam_id),
          notes: String(r.notes),
          offloadedArchiveKey: r.offloaded_archive_key ? String(r.offloaded_archive_key) : undefined,
          offloadedAtIso: r.offloaded_at_iso ? String(r.offloaded_at_iso) : undefined,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        };
      }
    );

    const photoQuerySql = options?.lightweightPhotos
      ? `SELECT id, species, animal_id, is_primary, sort_order, caption, original_file_name, mime_type,
                width, height, original_bytes, stored_bytes,
                CASE WHEN length(thumbnail_data_url) > 0 THEN thumbnail_data_url ELSE data_url END AS thumbnail_data_url,
                '' AS data_url, created_at, updated_at
         FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC`
      : 'SELECT * FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC';

    const animalPhotos: AnimalPhoto[] = this.queryObjects(photoQuerySql).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      animalId: String(r.animal_id),
      isPrimary: Number(r.is_primary) === 1,
      sortOrder: finiteNum(r.sort_order, 0),
      caption: String(r.caption || ''),
      originalFileName: String(r.original_file_name || ''),
      mimeType: String(r.mime_type || 'image/webp'),
      width: finiteNonNeg(r.width, 0),
      height: finiteNonNeg(r.height, 0),
      originalBytes: finiteNonNeg(r.original_bytes, 0),
      storedBytes: finiteNonNeg(r.stored_bytes, 0),
      thumbnailDataUrl: String(r.thumbnail_data_url || r.data_url || ''),
      dataUrl: options?.lightweightPhotos ? '' : String(r.data_url || ''),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const cages: CageLocation[] = this.queryObjects('SELECT * FROM cages ORDER BY label ASC').map(
      (r) => ({
        id: String(r.id),
        species: String(r.species),
        label: String(r.label),
        section: String(r.section),
        capacity: Math.max(1, finiteNonNeg(r.capacity, 1)),
        notes: String(r.notes),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })
    );

    const breedings: BreedingRecord[] = this.queryObjects(
      'SELECT * FROM breedings ORDER BY bred_date_iso DESC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      sireId: String(r.sire_id),
      damId: String(r.dam_id),
      sireName: String(r.sire_name),
      damName: String(r.dam_name),
      bredDateIso: String(r.bred_date_iso),
      expectedDueDateIso: String(r.expected_due_date_iso),
      actualBirthDateIso: String(r.actual_birth_date_iso),
      projectedCoiPercent: finiteNonNeg(r.projected_coi_percent, 0),
      liveCount: finiteNonNeg(r.live_count, 0),
      stillbornCount: finiteNonNeg(r.stillborn_count, 0),
      fosteredCount: finiteNonNeg(r.fostered_count, 0),
      weanedCount: finiteNonNeg(r.weaned_count, 0),
      offspringCreated: Number(r.offspring_created) === 1,
      status: (r.status as any) || 'Bred',
      serviceFeeCents: finiteNonNeg(r.service_fee_cents, 0),
      serviceFeeDirection: normalizeServiceFeeDirection(r.service_fee_direction),
      ultrasoundDateIso: String(r.ultrasound_date_iso || ''),
      ultrasoundResult: normalizeUltrasoundResult(r.ultrasound_result),
      ultrasoundFetalCount: finiteNonNeg(r.ultrasound_fetal_count, 0),
      ultrasoundProjectedDueIso: String(r.ultrasound_projected_due_iso || ''),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const tasks: BarnTask[] = this.queryObjects(
      'SELECT * FROM barn_tasks ORDER BY completed ASC, due_date_iso ASC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      title: String(r.title),
      category: (r.category as any) || 'Care',
      priority: (r.priority as any) || 'Normal',
      dueDateIso: String(r.due_date_iso),
      linkedAnimalId: String(r.linked_animal_id),
      linkedAnimalName: String(r.linked_animal_name),
      linkedBreedingId: String(r.linked_breeding_id),
      completed: Number(r.completed) === 1,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const careLogs: CareLog[] = this.queryObjects(
      'SELECT * FROM care_logs ORDER BY date_iso DESC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      animalId: String(r.animal_id),
      dateIso: String(r.date_iso),
      type: (r.type as any) || 'Weight Check',
      title: String(r.title),
      weightGrams: finiteNonNeg(r.weight_grams, 0),
      showLegEarned: Number(r.show_leg_earned) === 1,
      medicationName: String(r.medication_name || ''),
      dosage: String(r.dosage || ''),
      administrationRoute: String(r.administration_route || ''),
      withdrawalDays: finiteNonNeg(r.withdrawal_days, 0),
      withdrawalClearDateIso: String(r.withdrawal_clear_date_iso || ''),
      bodyConditionScore: finiteNonNeg(r.body_condition_score, 0),
      famachaScore: finiteNonNeg(r.famacha_score, 0),
      fecalEggCount: finiteNonNeg(r.fecal_egg_count, 0),
      ultrasoundResult: normalizeUltrasoundResult(r.ultrasound_result),
      ultrasoundFetalCount: finiteNonNeg(r.ultrasound_fetal_count, 0),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const shows: ShowEvent[] = this.queryObjects(
      'SELECT * FROM shows ORDER BY event_date_iso ASC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      name: String(r.name),
      location: String(r.location),
      sanctioningBody: String(r.sanctioning_body),
      eventDateIso: String(r.event_date_iso),
      entryDeadlineIso: String(r.entry_deadline_iso),
      enteredAnimalIds: safeArray<string>(
        this.safeParseJson<string[]>(
          r.entered_animal_ids_json || '[]',
          [],
          `shows(${String(r.name || r.id)}).entered_animal_ids_json`
        )
      ),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    if (sanitizedNumericCount > 0) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'storage',
        message: `Corrective action: Sanitized ${sanitizedNumericCount} non-finite or negative SQLite numeric field(s) during loadSnapshot`,
      });
    }

    return {
      settings,
      speciesProfiles,
      animals,
      animalPhotos,
      cages,
      breedings,
      tasks,
      careLogs,
      shows,
    };
  }

  async loadAnimalPhotoDataUrl(photoId: string): Promise<string | null> {
    if (!photoId) return null;
    if (!this.db) {
      const found = (this.fallbackSnapshot?.animalPhotos ?? []).find((p) => p.id === photoId);
      return found?.dataUrl || found?.thumbnailDataUrl || null;
    }
    const stmt = this.db.prepare('SELECT data_url, thumbnail_data_url FROM animal_photos WHERE id = ? LIMIT 1');
    try {
      stmt.bind([photoId]);
      if (!stmt.step()) return null;
      const row = stmt.getAsObject() as { data_url?: unknown; thumbnail_data_url?: unknown };
      const resolved = String(row.data_url || row.thumbnail_data_url || '');
      return resolved || null;
    } finally {
      stmt.free();
    }
  }

  async loadAnimalPhotoDataUrlsBatch(photoIds?: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (photoIds && photoIds.length === 0) return out;

    if (!this.db) {
      const wanted = photoIds ? new Set(photoIds) : null;
      for (const p of this.fallbackSnapshot?.animalPhotos ?? []) {
        if (wanted && !wanted.has(p.id)) continue;
        const val = p.dataUrl || p.thumbnailDataUrl || '';
        if (val) out[p.id] = val;
      }
      return out;
    }

    if (!photoIds) {
      const rows = this.queryObjects('SELECT id, data_url, thumbnail_data_url FROM animal_photos');
      for (const r of rows) {
        const id = String(r.id || '');
        const val = String(r.data_url || r.thumbnail_data_url || '');
        if (id && val) out[id] = val;
      }
      return out;
    }

    // Query in chunks of 200 to stay comfortably within SQLite parameter limits
    for (let i = 0; i < photoIds.length; i += 200) {
      const chunk = photoIds.slice(i, i + 200);
      const placeholders = chunk.map(() => '?').join(', ');
      const stmt = this.db.prepare(
        `SELECT id, data_url, thumbnail_data_url FROM animal_photos WHERE id IN (${placeholders})`
      );
      try {
        stmt.bind(chunk);
        while (stmt.step()) {
          const r = stmt.getAsObject() as { id?: unknown; data_url?: unknown; thumbnail_data_url?: unknown };
          const id = String(r.id || '');
          const val = String(r.data_url || r.thumbnail_data_url || '');
          if (id && val) out[id] = val;
        }
      } finally {
        stmt.free();
      }
    }
    return out;
  }

  async replaceSnapshot(snapshot: BarnDatabaseSnapshot): Promise<void> {
    if (!this.db) {
      const existingById = new Map<string, string>();
      for (const prev of this.fallbackSnapshot?.animalPhotos ?? []) {
        if (prev.dataUrl) existingById.set(prev.id, prev.dataUrl);
      }
      const nextPhotos = (snapshot.animalPhotos ?? []).map((p) =>
        p.dataUrl ? p : { ...p, dataUrl: existingById.get(p.id) || p.thumbnailDataUrl || '' }
      );
      const nextSnap: BarnDatabaseSnapshot = { ...snapshot, animalPhotos: nextPhotos };
      this.fallbackSnapshot = nextSnap;
      await this.persistToDisk(nextSnap);
      return;
    }

    const existingPhotoDataUrls = new Map<string, string>();
    const hasDehydratedPhoto = (snapshot.animalPhotos ?? []).some((p) => !p.dataUrl);
    if (hasDehydratedPhoto) {
      for (const row of this.queryObjects('SELECT id, data_url FROM animal_photos')) {
        const id = String(row.id || '');
        const dataUrl = String(row.data_url || '');
        if (id && dataUrl) existingPhotoDataUrls.set(id, dataUrl);
      }
    }

    this.db.run('BEGIN TRANSACTION;');
    try {
      this.db.run('DELETE FROM barn_settings;');
      this.db.run('DELETE FROM species_profiles;');
      this.db.run('DELETE FROM animals;');
      this.db.run('DELETE FROM animal_photos;');
      this.db.run('DELETE FROM cages;');
      this.db.run('DELETE FROM breedings;');
      this.db.run('DELETE FROM barn_tasks;');
      this.db.run('DELETE FROM care_logs;');
      this.db.run('DELETE FROM shows;');

      this.upsertSettingsRow(snapshot.settings);
      for (const sp of snapshot.speciesProfiles) this.upsertSpeciesRow(sp);
      for (const a of snapshot.animals) this.upsertAnimalRow(a);
      for (const p of snapshot.animalPhotos ?? []) {
        const preservedDataUrl = p.dataUrl || existingPhotoDataUrls.get(p.id) || '';
        this.upsertAnimalPhotoRow(
          preservedDataUrl === p.dataUrl ? p : { ...p, dataUrl: preservedDataUrl }
        );
      }
      for (const c of snapshot.cages) this.upsertCageRow(c);
      for (const b of snapshot.breedings) this.upsertBreedingRow(b);
      for (const t of snapshot.tasks) this.upsertTaskRow(t);
      for (const l of snapshot.careLogs) this.upsertCareLogRow(l);
      for (const s of snapshot.shows) this.upsertShowRow(s);

      this.db.run('COMMIT;');
    } catch (e) {
      try {
        this.db.run('ROLLBACK;');
      } catch {
        // Ignore rollback error so root exception surfaces cleanly
      }
      throw e;
    }

    await this.persistToDisk(hasDehydratedPhoto ? undefined : snapshot);
  }

  private upsertSettingsRow(s: BarnSettings): void {
    const extraJson = JSON.stringify({
      showHomeSummaryGrid: s.showHomeSummaryGrid ?? true,
      barnNameOnboarded: s.barnNameOnboarded ?? false,
      ignoredTaskIds: s.ignoredTaskIds ?? [],
      dismissedTaskGroupKeys: s.dismissedTaskGroupKeys ?? {},
      dismissedMemoAlertSignatures: s.dismissedMemoAlertSignatures ?? {},
      speciesHubBlockOrder: s.speciesHubBlockOrder ?? {},
      includePhotoOnPedigree: s.includePhotoOnPedigree ?? false,
      calendarSync: s.calendarSync ? normalizeCalendarSyncSettings(s.calendarSync) : undefined,
      lastBackupMeta: s.lastBackupMeta ?? undefined,
      backupReminderSnoozedUntilMs: s.backupReminderSnoozedUntilMs ?? undefined,
      autoOffloadRetiredToOpfs: Boolean(s.autoOffloadRetiredToOpfs),
    });
    this.db?.run(
      `INSERT OR REPLACE INTO barn_settings
       (id, barn_name, breeder_name, preferred_unit, currency_code, default_species, pinned_landing_species, default_generations, theme_mode, custom_colors_json, image_optimization_preset, extra_settings_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id || 'barn_settings',
        s.barnName,
        s.breederName,
        s.preferredUnit,
        normalizeCurrencyCode(s.currencyCode, 'USD'),
        s.defaultSpecies,
        s.pinnedLandingSpecies,
        s.defaultGenerations,
        s.themeMode,
        JSON.stringify(s.customColors || {}),
        s.imageOptimizationPreset || 'balanced',
        extraJson,
        s.updatedAt,
      ]
    );
  }

  private upsertSpeciesRow(sp: SpeciesProfile): void {
    this.db?.run(
      `INSERT OR REPLACE INTO species_profiles
       (id, name, sort_order, default_animal_prefix, preferred_unit, memo_text, memo_updated_at, gestation_days, rebreed_days_after_birth, wean_days_after_birth, maturity_days, birth_event_label, male_label, female_label, offspring_label, example_breeds_json, milestones_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sp.id,
        sp.name,
        sp.sortOrder ?? 0,
        sp.defaultAnimalPrefix || '',
        sp.preferredUnit || '',
        sanitizeSpeciesMemo(sp.memoText ?? ''),
        String(sp.memoUpdatedAt || ''),
        sp.gestationDays,
        sp.rebreedDaysAfterBirth,
        sp.weanDaysAfterBirth,
        sp.maturityDays && sp.maturityDays > 0 ? Math.round(sp.maturityDays) : 0,
        sp.birthEventLabel,
        sp.maleLabel,
        sp.femaleLabel,
        sp.offspringLabel,
        JSON.stringify(sp.exampleBreeds),
        JSON.stringify(sp.milestones),
        sp.createdAt,
        sp.updatedAt,
      ]
    );
  }

  private upsertAnimalRow(a: Animal): void {
    const carriers = reconcileCarrierTraitLists(
      a.suspectedCarrierOf,
      a.confirmedCarrierOf,
      a.clearedCarrierOf
    );
    this.db?.run(
      `INSERT OR REPLACE INTO animals
       (id, tattoo, name, species, breed, variety, sex, status, archived, needs_attention, ignored_conflicts_json, birth_date_iso, weight_grams, genotype_json, genotype_raw, rufus_level, suspected_carrier_of_json, confirmed_carrier_of_json, cleared_carrier_of_json, registration_number, grand_champion_number, legs_count, cage_location, breeder_name, owner_name, ownership_type, culled, cull_date_iso, cull_reason, deceased_date_iso, death_cause, sold_date_iso, sale_price_cents, purchase_cost_cents, buyer_name, sire_id, dam_id, notes, offloaded_archive_key, offloaded_at_iso, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id,
        a.tattoo,
        a.name,
        a.species,
        a.breed,
        a.variety,
        a.sex,
        a.status,
        a.archived ? 1 : 0,
        a.needsAttention ? 1 : 0,
        JSON.stringify(normalizeIgnoredConflicts(a.ignoredConflicts)),
        a.birthDateIso,
        a.weightGrams,
        JSON.stringify(a.genotype),
        a.genotypeRaw,
        normalizeRufusLevel(a.rufusLevel),
        JSON.stringify(carriers.suspectedCarrierOf),
        JSON.stringify(carriers.confirmedCarrierOf),
        JSON.stringify(carriers.clearedCarrierOf),
        a.registrationNumber,
        a.grandChampionNumber,
        a.legsCount,
        a.cageLocation,
        a.breederName,
        a.ownerName,
        normalizeOwnershipType(a.ownershipType, 'Owned'),
        a.culled ? 1 : 0,
        a.cullDateIso || '',
        a.cullReason || '',
        a.deceasedDateIso || '',
        a.deathCause || '',
        a.soldDateIso || '',
        a.salePriceCents && a.salePriceCents > 0 ? Math.round(a.salePriceCents) : 0,
        a.purchaseCostCents && a.purchaseCostCents > 0 ? Math.round(a.purchaseCostCents) : 0,
        a.buyerName || '',
        a.sireId,
        a.damId,
        a.notes,
        a.offloadedArchiveKey || '',
        a.offloadedAtIso || '',
        a.createdAt,
        a.updatedAt,
      ]
    );
  }

  private upsertAnimalPhotoRow(p: AnimalPhoto): void {
    let resolvedDataUrl = p.dataUrl;
    if (!resolvedDataUrl && this.db) {
      const stmt = this.db.prepare('SELECT data_url FROM animal_photos WHERE id = ? LIMIT 1');
      try {
        stmt.bind([p.id]);
        if (stmt.step()) {
          const existing = stmt.getAsObject() as { data_url?: unknown };
          resolvedDataUrl = String(existing.data_url || '');
        }
      } finally {
        stmt.free();
      }
    }
    this.db?.run(
      `INSERT OR REPLACE INTO animal_photos
       (id, species, animal_id, is_primary, sort_order, caption, original_file_name, mime_type, width, height, original_bytes, stored_bytes, thumbnail_data_url, data_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.species,
        p.animalId,
        p.isPrimary ? 1 : 0,
        p.sortOrder,
        p.caption,
        p.originalFileName,
        p.mimeType,
        p.width,
        p.height,
        p.originalBytes,
        p.storedBytes,
        p.thumbnailDataUrl,
        resolvedDataUrl,
        p.createdAt,
        p.updatedAt,
      ]
    );
  }

  private upsertCageRow(c: CageLocation): void {
    this.db?.run(
      `INSERT OR REPLACE INTO cages
       (id, species, label, section, capacity, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.species, c.label, c.section, c.capacity, c.notes, c.createdAt, c.updatedAt]
    );
  }

  private upsertBreedingRow(b: BreedingRecord): void {
    this.db?.run(
      `INSERT OR REPLACE INTO breedings
       (id, species, sire_id, dam_id, sire_name, dam_name, bred_date_iso, expected_due_date_iso, actual_birth_date_iso, projected_coi_percent, live_count, stillborn_count, fostered_count, weaned_count, offspring_created, status, service_fee_cents, service_fee_direction, ultrasound_date_iso, ultrasound_result, ultrasound_fetal_count, ultrasound_projected_due_iso, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.id,
        b.species,
        b.sireId,
        b.damId,
        b.sireName,
        b.damName,
        b.bredDateIso,
        b.expectedDueDateIso,
        b.actualBirthDateIso,
        b.projectedCoiPercent,
        b.liveCount,
        b.stillbornCount,
        b.fosteredCount,
        b.weanedCount,
        b.offspringCreated ? 1 : 0,
        b.status,
        b.serviceFeeCents && b.serviceFeeCents > 0 ? Math.round(b.serviceFeeCents) : 0,
        normalizeServiceFeeDirection(b.serviceFeeDirection),
        b.ultrasoundDateIso || '',
        normalizeUltrasoundResult(b.ultrasoundResult),
        b.ultrasoundFetalCount && b.ultrasoundFetalCount > 0
          ? Math.round(b.ultrasoundFetalCount)
          : 0,
        b.ultrasoundProjectedDueIso || '',
        b.notes,
        b.createdAt,
        b.updatedAt,
      ]
    );
  }

  private upsertTaskRow(t: BarnTask): void {
    this.db?.run(
      `INSERT OR REPLACE INTO barn_tasks
       (id, species, title, category, priority, due_date_iso, linked_animal_id, linked_animal_name, linked_breeding_id, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.species,
        t.title,
        t.category,
        t.priority,
        t.dueDateIso,
        t.linkedAnimalId,
        t.linkedAnimalName,
        t.linkedBreedingId,
        t.completed ? 1 : 0,
        t.createdAt,
        t.updatedAt,
      ]
    );
  }

  private upsertCareLogRow(l: CareLog): void {
    this.db?.run(
      `INSERT OR REPLACE INTO care_logs
       (id, species, animal_id, date_iso, type, title, weight_grams, show_leg_earned, medication_name, dosage, administration_route, withdrawal_days, withdrawal_clear_date_iso, body_condition_score, famacha_score, fecal_egg_count, ultrasound_result, ultrasound_fetal_count, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.id,
        l.species,
        l.animalId,
        l.dateIso,
        l.type,
        l.title,
        l.weightGrams,
        l.showLegEarned ? 1 : 0,
        l.medicationName || '',
        l.dosage || '',
        l.administrationRoute || '',
        l.withdrawalDays && l.withdrawalDays > 0 ? Math.round(l.withdrawalDays) : 0,
        l.withdrawalClearDateIso || '',
        l.bodyConditionScore && l.bodyConditionScore > 0 ? Number(l.bodyConditionScore) : 0,
        l.famachaScore && l.famachaScore > 0 ? Math.round(l.famachaScore) : 0,
        l.fecalEggCount && l.fecalEggCount > 0 ? Math.round(l.fecalEggCount) : 0,
        normalizeUltrasoundResult(l.ultrasoundResult),
        l.ultrasoundFetalCount && l.ultrasoundFetalCount > 0
          ? Math.round(l.ultrasoundFetalCount)
          : 0,
        l.notes,
        l.createdAt,
        l.updatedAt,
      ]
    );
  }

  private upsertShowRow(s: ShowEvent): void {
    this.db?.run(
      `INSERT OR REPLACE INTO shows
       (id, species, name, location, sanctioning_body, event_date_iso, entry_deadline_iso, entered_animal_ids_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.species,
        s.name,
        s.location,
        s.sanctioningBody,
        s.eventDateIso,
        s.entryDeadlineIso,
        JSON.stringify(s.enteredAnimalIds),
        s.notes,
        s.createdAt,
        s.updatedAt,
      ]
    );
  }

  async saveSettings(settings: BarnSettings): Promise<void> {
    if (this.db) {
      this.upsertSettingsRow(settings);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.settings = settings;
    }
    await this.persistToDisk();
  }

  async saveSpeciesProfile(profile: SpeciesProfile): Promise<void> {
    if (this.db) {
      this.upsertSpeciesRow(profile);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.speciesProfiles.findIndex((p) => p.id === profile.id);
      if (idx >= 0) this.fallbackSnapshot.speciesProfiles[idx] = profile;
      else this.fallbackSnapshot.speciesProfiles.push(profile);
      this.fallbackSnapshot.speciesProfiles.sort(
        (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
      );
    }
    await this.persistToDisk();
  }

  async saveSpeciesProfilesBatch(profiles: SpeciesProfile[]): Promise<void> {
    if (profiles.length === 0) return;
    if (this.db) {
      this.db.run('BEGIN TRANSACTION;');
      try {
        for (const sp of profiles) this.upsertSpeciesRow(sp);
        this.db.run('COMMIT;');
      } catch (e) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Ignore rollback error so root exception surfaces cleanly
        }
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      for (const sp of profiles) {
        const idx = this.fallbackSnapshot.speciesProfiles.findIndex((p) => p.id === sp.id);
        if (idx >= 0) this.fallbackSnapshot.speciesProfiles[idx] = sp;
        else this.fallbackSnapshot.speciesProfiles.push(sp);
      }
      this.fallbackSnapshot.speciesProfiles.sort(
        (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
      );
    }
    await this.persistToDisk();
  }

  async deleteSpeciesProfile(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM species_profiles WHERE id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.speciesProfiles = this.fallbackSnapshot.speciesProfiles.filter(
        (p) => p.id !== id
      );
    }
    await this.persistToDisk();
  }

  async saveAnimal(animal: Animal): Promise<void> {
    if (this.db) {
      this.upsertAnimalRow(animal);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.animals.findIndex((a) => a.id === animal.id);
      if (idx >= 0) this.fallbackSnapshot.animals[idx] = animal;
      else this.fallbackSnapshot.animals.push(animal);
    }
    await this.persistToDisk();
  }

  async saveAnimalsBatch(animals: Animal[]): Promise<void> {
    if (animals.length === 0) return;
    if (this.db) {
      this.db.run('BEGIN TRANSACTION;');
      try {
        for (const a of animals) this.upsertAnimalRow(a);
        this.db.run('COMMIT;');
      } catch (e) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Ignore rollback error so root exception surfaces cleanly
        }
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      for (const a of animals) {
        const idx = this.fallbackSnapshot.animals.findIndex((x) => x.id === a.id);
        if (idx >= 0) this.fallbackSnapshot.animals[idx] = a;
        else this.fallbackSnapshot.animals.push(a);
      }
    }
    await this.persistToDisk();
  }

  async deleteAnimal(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM animals WHERE id = ?', [id]);
      this.db.run('DELETE FROM animal_photos WHERE animal_id = ?', [id]);
      this.db.run('DELETE FROM care_logs WHERE animal_id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.animals = this.fallbackSnapshot.animals.filter((a) => a.id !== id);
      this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
        (p) => p.animalId !== id
      );
      this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter(
        (l) => l.animalId !== id
      );
    }
    await this.persistToDisk();
  }

  async deleteAnimalsBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    if (this.db) {
      this.db.run('BEGIN TRANSACTION;');
      try {
        for (const id of ids) {
          this.db.run('DELETE FROM animals WHERE id = ?', [id]);
          this.db.run('DELETE FROM animal_photos WHERE animal_id = ?', [id]);
          this.db.run('DELETE FROM care_logs WHERE animal_id = ?', [id]);
        }
        this.db.run('COMMIT;');
      } catch (e) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Ignore rollback error so root exception surfaces cleanly
        }
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.animals = this.fallbackSnapshot.animals.filter((a) => !idSet.has(a.id));
      this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
        (p) => !idSet.has(p.animalId)
      );
      this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter(
        (l) => !idSet.has(l.animalId)
      );
    }
    await this.persistToDisk();
  }

  async saveAnimalPhoto(photo: AnimalPhoto): Promise<void> {
    if (this.db) {
      this.upsertAnimalPhotoRow(photo);
    } else if (this.fallbackSnapshot) {
      const list = this.fallbackSnapshot.animalPhotos || [];
      const idx = list.findIndex((p) => p.id === photo.id);
      const preserved =
        !photo.dataUrl && idx >= 0 ? { ...photo, dataUrl: list[idx].dataUrl } : photo;
      if (idx >= 0) list[idx] = preserved;
      else list.push(preserved);
      this.fallbackSnapshot.animalPhotos = list;
    }
    await this.persistToDisk();
  }

  async saveAnimalPhotosBatch(photos: AnimalPhoto[]): Promise<void> {
    if (photos.length === 0) return;
    if (this.db) {
      this.db.run('BEGIN TRANSACTION;');
      try {
        for (const p of photos) this.upsertAnimalPhotoRow(p);
        this.db.run('COMMIT;');
      } catch (e) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Ignore rollback error so root exception surfaces cleanly
        }
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      const list = this.fallbackSnapshot.animalPhotos || [];
      for (const p of photos) {
        const idx = list.findIndex((x) => x.id === p.id);
        const preserved =
          !p.dataUrl && idx >= 0 ? { ...p, dataUrl: list[idx].dataUrl } : p;
        if (idx >= 0) list[idx] = preserved;
        else list.push(preserved);
      }
      this.fallbackSnapshot.animalPhotos = list;
    }
    await this.persistToDisk();
  }

  async deleteAnimalPhoto(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM animal_photos WHERE id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
        (p) => p.id !== id
      );
    }
    await this.persistToDisk();
  }

  async saveCage(cage: CageLocation): Promise<void> {
    if (this.db) {
      this.upsertCageRow(cage);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.cages.findIndex((c) => c.id === cage.id);
      if (idx >= 0) this.fallbackSnapshot.cages[idx] = cage;
      else this.fallbackSnapshot.cages.push(cage);
    }
    await this.persistToDisk();
  }

  async deleteCage(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM cages WHERE id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.cages = this.fallbackSnapshot.cages.filter((c) => c.id !== id);
    }
    await this.persistToDisk();
  }

  async saveBreeding(breeding: BreedingRecord): Promise<void> {
    if (this.db) {
      this.upsertBreedingRow(breeding);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.breedings.findIndex((b) => b.id === breeding.id);
      if (idx >= 0) this.fallbackSnapshot.breedings[idx] = breeding;
      else this.fallbackSnapshot.breedings.push(breeding);
    }
    await this.persistToDisk();
  }

  async deleteBreeding(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM breedings WHERE id = ?', [id]);
      this.db.run('DELETE FROM barn_tasks WHERE linked_breeding_id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.breedings = this.fallbackSnapshot.breedings.filter((b) => b.id !== id);
      this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter(
        (t) => t.linkedBreedingId !== id
      );
    }
    await this.persistToDisk();
  }

  async saveTask(task: BarnTask): Promise<void> {
    if (this.db) {
      this.upsertTaskRow(task);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) this.fallbackSnapshot.tasks[idx] = task;
      else this.fallbackSnapshot.tasks.push(task);
    }
    await this.persistToDisk();
  }

  async saveTasksBatch(tasks: BarnTask[]): Promise<void> {
    if (tasks.length === 0) return;
    if (this.db) {
      this.db.run('BEGIN TRANSACTION;');
      try {
        for (const t of tasks) this.upsertTaskRow(t);
        this.db.run('COMMIT;');
      } catch (e) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Ignore rollback error so root exception surfaces cleanly
        }
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      for (const t of tasks) {
        const idx = this.fallbackSnapshot.tasks.findIndex((x) => x.id === t.id);
        if (idx >= 0) this.fallbackSnapshot.tasks[idx] = t;
        else this.fallbackSnapshot.tasks.push(t);
      }
    }
    await this.persistToDisk();
  }

  async deleteTask(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM barn_tasks WHERE id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter((t) => t.id !== id);
    }
    await this.persistToDisk();
  }

  async deleteTasksBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    if (this.db) {
      this.db.run('BEGIN TRANSACTION;');
      try {
        for (const id of ids) {
          this.db.run('DELETE FROM barn_tasks WHERE id = ?', [id]);
        }
        this.db.run('COMMIT;');
      } catch (e) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Ignore rollback error so root exception surfaces cleanly
        }
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter((t) => !idSet.has(t.id));
    }
    await this.persistToDisk();
  }

  async saveCareLog(log: CareLog): Promise<void> {
    if (this.db) {
      this.upsertCareLogRow(log);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.careLogs.findIndex((l) => l.id === log.id);
      if (idx >= 0) this.fallbackSnapshot.careLogs[idx] = log;
      else this.fallbackSnapshot.careLogs.push(log);
    }
    await this.persistToDisk();
  }

  async deleteCareLog(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM care_logs WHERE id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter((l) => l.id !== id);
    }
    await this.persistToDisk();
  }

  async saveShow(show: ShowEvent): Promise<void> {
    if (this.db) {
      this.upsertShowRow(show);
    } else if (this.fallbackSnapshot) {
      const idx = this.fallbackSnapshot.shows.findIndex((s) => s.id === show.id);
      if (idx >= 0) this.fallbackSnapshot.shows[idx] = show;
      else this.fallbackSnapshot.shows.push(show);
    }
    await this.persistToDisk();
  }

  async deleteShow(id: string): Promise<void> {
    if (this.db) {
      this.db.run('DELETE FROM shows WHERE id = ?', [id]);
    } else if (this.fallbackSnapshot) {
      this.fallbackSnapshot.shows = this.fallbackSnapshot.shows.filter((s) => s.id !== id);
    }
    await this.persistToDisk();
  }

  async exportRawSqliteBytes(): Promise<Uint8Array | null> {
    if (!this.db) return null;
    return this.db.export();
  }

  async importRawSqliteBytes(
    bytes: Uint8Array,
    options?: SnapshotLoadOptions
  ): Promise<BarnDatabaseSnapshot> {
    if (!this.SQL) {
      throw new Error('SQLite WebAssembly engine is not available in this browser.');
    }
    const headerCheck = validateSqliteFileHeader(bytes);
    if (!headerCheck.ok) {
      throw new Error(headerCheck.error);
    }
    const importedDb = new this.SQL.Database(bytes);
    applySchemaMigrations(importedDb);
    if (this.db) {
      this.db.close();
    }
    this.db = importedDb;
    await this.persistToDisk();
    return this.loadSnapshot(options);
  }

  async resetConnection(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close error on already-closed WASM DB
      }
      this.db = null;
    }
    this.SQL = null;
    this.fallbackSnapshot = null;
    try {
      await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
    } catch {
      // Ignore fallback delete failure
    }
    return this.initialize(options);
  }

  async rebuildCleanDatabase(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close error
      }
      this.db = null;
    }
    this.SQL = null;
    this.fallbackSnapshot = null;
    await idbDelete(IDB_PRIMARY_KEY);
    await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
    return this.initialize({ ...options, allowSeedFresh: options?.allowSeedFresh ?? true });
  }
}
