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
  sanitizeSafeRasterImageDataUrl,
  validateSqliteFileHeader,
} from '../core/inputSanitization';
import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ClientContact,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  FeedAllocation,
  FeedAllocationTargetType,
  FeedBatch,
  LedgerEntry,
  normalizeAnimalStatus,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeClientKind,
  normalizeCurrencyCode,
  normalizeFeedPurgeWindowDays,
  normalizeHousingUnitType,
  normalizeIgnoredConflicts,
  normalizeLedgerCategory,
  normalizeLedgerEntryType,
  normalizeLitterWeightMilestones,
  normalizeOwnershipType,
  normalizePeltGrade,
  normalizePreferredContactMethod,
  normalizeProcessingStatus,
  normalizeReservationStatus,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeTargetWeightCurve,
  normalizeUltrasoundResult,
  normalizeWaitlistIntent,
  normalizeWaitlistStatus,
  normalizeWeightUnit,
  normalizeWoolHarvestMethod,
  normalizeYouthOrgType,
  normalizeYouthProjectFeedLogs,
  nowIsoUtc,
  ProcessingLog,
  ShowEvent,
  SpeciesProfile,
  WaitlistEntry,
  WoolHarvest,
  YouthProjectBook,
} from '../core/models';
import { normalizeIagarbScorecard } from '../core/woolFiber';
import { buildFullPredefinedSampleSnapshot } from '../core/sampleData';
import { reconcileCarrierTraitLists } from '../core/carrierGenetics';
import { getTierStoragePolicy } from '../core/deviceCapability';
import { buildEmptyShellSnapshot } from '../core/backupVault';
import {
  mergeEnteredAnimalIdsWithResults,
  normalizeShowResults,
} from '../core/showResults';
import { sanitizeSpeciesMemo } from '../core/speciesMemo';
import { isMemoryLikeError, logDiagnosticEvent } from './crashLogger';
import { detectCurrentDeviceCapability } from './deviceCapabilityDetector';
import {
  getCurrentTabId,
  publishCrossTabDbCommit,
  withCrossTabLock,
} from './localSyncChannels';
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
  getAdjustedNowIsoUtc,
  isQuotaExceededError,
  listRollingSnapshotBackups,
  loadRollingSnapshotBackup,
  saveRollingSnapshotBackup,
} from './storageProtection';

const IDB_DB_NAME = 'community_pedigree_local_db';
const IDB_STORE_NAME = 'sqlite_files';
const IDB_PRIMARY_KEY = 'pedigree_master.sqlite';
const IDB_FALLBACK_SNAPSHOT_KEY = 'pedigree_fallback_json';
export const IDB_WRITE_EPOCH_KEY = 'pedigree_write_epoch';
export const DB_WRITE_LOCK_NAME = 'community_pedigree_db_write_v1';
const SQLITE_SCHEMA_VERSION = 6;

type SqlJsInitConfig = NonNullable<Parameters<typeof initSqlJs>[0]> & {
  useOldExtensionFunctions: boolean;
};

function createSqlJsInitConfig(): SqlJsInitConfig {
  return {
    locateFile: () => sqlWasmUrl,
    useOldExtensionFunctions: false,
  };
}

export interface PersistedWriteEpochMeta {
  epoch: number;
  writerTabId: string;
  updatedAtIso: string;
}

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
    breed_overrides_json TEXT NOT NULL DEFAULT '[]',
    target_weight_curve_json TEXT NOT NULL DEFAULT '[]',
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
    unit_type TEXT NOT NULL DEFAULT '',
    feed_lot_name TEXT NOT NULL DEFAULT '',
    feed_stock_remaining REAL NOT NULL DEFAULT 0,
    feed_stock_unit TEXT NOT NULL DEFAULT '',
    daily_ration_note TEXT NOT NULL DEFAULT '',
    feed_low_threshold REAL NOT NULL DEFAULT 0,
    maintenance_interval_days INTEGER NOT NULL DEFAULT 0,
    maintenance_task_label TEXT NOT NULL DEFAULT '',
    last_maintenance_date_iso TEXT NOT NULL DEFAULT '',
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
    litter_weight_milestones_json TEXT NOT NULL DEFAULT '[]',
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
    results_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS feed_batches (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    brand TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL,
    lot_number TEXT NOT NULL DEFAULT '',
    mill_code TEXT NOT NULL DEFAULT '',
    manufacture_date_iso TEXT NOT NULL DEFAULT '',
    purchase_date_iso TEXT NOT NULL,
    bag_count REAL NOT NULL DEFAULT 0,
    bag_weight_value REAL NOT NULL DEFAULT 0,
    bag_weight_unit TEXT NOT NULL DEFAULT 'lbs',
    total_quantity REAL NOT NULL DEFAULT 0,
    remaining_quantity REAL NOT NULL DEFAULT 0,
    low_stock_threshold REAL NOT NULL DEFAULT 0,
    total_cost_cents INTEGER NOT NULL DEFAULT 0,
    supplier_name TEXT NOT NULL DEFAULT '',
    protein_percent REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    tag_photo_data_url TEXT NOT NULL DEFAULT '',
    tag_photo_thumbnail_data_url TEXT NOT NULL DEFAULT '',
    tag_photo_mime_type TEXT NOT NULL DEFAULT '',
    tag_photo_bytes INTEGER NOT NULL DEFAULT 0,
    tag_photo_captured_date_iso TEXT NOT NULL DEFAULT '',
    tag_photo_purged_at_iso TEXT NOT NULL DEFAULT '',
    tag_photo_bytes_reclaimed INTEGER NOT NULL DEFAULT 0,
    ocr_raw_text TEXT NOT NULL DEFAULT '',
    ocr_confidence REAL NOT NULL DEFAULT 0,
    ocr_manual_override INTEGER NOT NULL DEFAULT 0,
    recall_flagged INTEGER NOT NULL DEFAULT 0,
    recall_note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feed_batches_species ON feed_batches(species);
  CREATE INDEX IF NOT EXISTS idx_feed_batches_lot ON feed_batches(lot_number);

  CREATE TABLE IF NOT EXISTS feed_allocations (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    feed_batch_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL DEFAULT '',
    target_label TEXT NOT NULL DEFAULT '',
    date_iso TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'lbs',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feed_allocations_batch ON feed_allocations(feed_batch_id);

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    date_iso TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    vendor_or_party TEXT NOT NULL DEFAULT '',
    linked_animal_id TEXT NOT NULL DEFAULT '',
    linked_breeding_id TEXT NOT NULL DEFAULT '',
    linked_feed_batch_id TEXT NOT NULL DEFAULT '',
    linked_project_id TEXT NOT NULL DEFAULT '',
    receipt_photo_data_url TEXT NOT NULL DEFAULT '',
    receipt_photo_thumbnail_data_url TEXT NOT NULL DEFAULT '',
    receipt_photo_mime_type TEXT NOT NULL DEFAULT '',
    receipt_photo_bytes INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_ledger_entries_species ON ledger_entries(species);
  CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(date_iso);

  CREATE TABLE IF NOT EXISTS processing_logs (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    title TEXT NOT NULL,
    linked_animal_id TEXT NOT NULL DEFAULT '',
    linked_breeding_id TEXT NOT NULL DEFAULT '',
    scheduled_date_iso TEXT NOT NULL DEFAULT '',
    harvest_date_iso TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Processed',
    animal_count INTEGER NOT NULL DEFAULT 1,
    live_weight_grams INTEGER NOT NULL DEFAULT 0,
    dressed_weight_grams INTEGER NOT NULL DEFAULT 0,
    dress_out_percent REAL NOT NULL DEFAULT 0,
    pelt_count INTEGER NOT NULL DEFAULT 0,
    pelt_grade TEXT NOT NULL DEFAULT '',
    pelt_color_notes TEXT NOT NULL DEFAULT '',
    processing_cost_cents INTEGER NOT NULL DEFAULT 0,
    meat_value_cents INTEGER NOT NULL DEFAULT 0,
    pelt_value_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_processing_logs_species ON processing_logs(species);

  CREATE TABLE IF NOT EXISTS youth_project_books (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '4-H',
    project_title TEXT NOT NULL,
    member_name TEXT NOT NULL DEFAULT '',
    club_or_chapter TEXT NOT NULL DEFAULT '',
    leader_or_advisor TEXT NOT NULL DEFAULT '',
    project_year TEXT NOT NULL DEFAULT '',
    start_date_iso TEXT NOT NULL DEFAULT '',
    end_date_iso TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    linked_animal_ids_json TEXT NOT NULL DEFAULT '[]',
    linked_breeding_ids_json TEXT NOT NULL DEFAULT '[]',
    starting_inventory_value_cents INTEGER NOT NULL DEFAULT 0,
    ending_inventory_value_cents INTEGER NOT NULL DEFAULT 0,
    feed_logs_json TEXT NOT NULL DEFAULT '[]',
    goals_and_reflection TEXT NOT NULL DEFAULT '',
    show_and_community_notes TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_youth_project_books_species ON youth_project_books(species);

  CREATE TABLE IF NOT EXISTS client_contacts (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    full_name TEXT NOT NULL,
    ranch_or_herd_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    preferred_contact TEXT NOT NULL DEFAULT 'sms',
    client_kind TEXT NOT NULL DEFAULT 'pet_buyer',
    city_state TEXT NOT NULL DEFAULT '',
    shipping_address TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_client_contacts_species ON client_contacts(species);

  CREATE TABLE IF NOT EXISTS waitlist_entries (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    priority_rank INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'Active',
    intent TEXT NOT NULL DEFAULT 'Show / Breeding',
    desired_breed TEXT NOT NULL DEFAULT '',
    desired_variety TEXT NOT NULL DEFAULT '',
    preferred_sex TEXT NOT NULL DEFAULT 'Any',
    preferred_breeding_id TEXT NOT NULL DEFAULT '',
    requested_by_date_iso TEXT NOT NULL DEFAULT '',
    inquiry_date_iso TEXT NOT NULL DEFAULT '',
    follow_up_date_iso TEXT NOT NULL DEFAULT '',
    last_contacted_date_iso TEXT NOT NULL DEFAULT '',
    max_budget_cents INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_waitlist_entries_species ON waitlist_entries(species);

  CREATE TABLE IF NOT EXISTS animal_reservations (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    agreement_number TEXT NOT NULL DEFAULT '',
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL DEFAULT '',
    waitlist_entry_id TEXT NOT NULL DEFAULT '',
    animal_id TEXT NOT NULL DEFAULT '',
    breeding_id TEXT NOT NULL DEFAULT '',
    pick_order INTEGER NOT NULL DEFAULT 0,
    item_label TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Pending Deposit',
    reserved_date_iso TEXT NOT NULL DEFAULT '',
    hold_expires_date_iso TEXT NOT NULL DEFAULT '',
    total_price_cents INTEGER NOT NULL DEFAULT 0,
    deposit_required_cents INTEGER NOT NULL DEFAULT 0,
    deposit_paid_cents INTEGER NOT NULL DEFAULT 0,
    deposit_due_date_iso TEXT NOT NULL DEFAULT '',
    deposit_paid_date_iso TEXT NOT NULL DEFAULT '',
    pickup_scheduled_date_iso TEXT NOT NULL DEFAULT '',
    completed_date_iso TEXT NOT NULL DEFAULT '',
    balance_reminder_date_iso TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL DEFAULT '',
    ledger_entry_id TEXT NOT NULL DEFAULT '',
    terms_summary TEXT NOT NULL DEFAULT '',
    health_guarantee_notes TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_animal_reservations_species ON animal_reservations(species);

  CREATE TABLE IF NOT EXISTS wool_harvests (
    id TEXT PRIMARY KEY NOT NULL,
    species TEXT NOT NULL,
    animal_id TEXT NOT NULL,
    harvest_date_iso TEXT NOT NULL,
    shearing_interval_days INTEGER NOT NULL DEFAULT 0,
    prime_weight_grams INTEGER NOT NULL DEFAULT 0,
    grade_weight_grams INTEGER NOT NULL DEFAULT 0,
    harvest_method TEXT NOT NULL DEFAULT 'Sheared',
    staple_length_mm REAL NOT NULL DEFAULT 0,
    iagarb_score_json TEXT NOT NULL DEFAULT '{}',
    witnessed_by TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_wool_harvests_species ON wool_harvests(species);
  CREATE INDEX IF NOT EXISTS idx_wool_harvests_animal ON wool_harvests(animal_id);
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
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const req = tx.objectStore(IDB_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
      tx.onabort = () =>
        reject(tx.error || new Error('IndexedDB read transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  return idbSetAtomic([{ key, value }]);
}

async function idbSetAtomic(
  entries: Array<{ key: string; value: unknown }>
): Promise<void> {
  if (entries.length === 0) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      for (const entry of entries) {
        store.put(entry.value, entry.key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || new Error('IndexedDB write transaction aborted.'));
    });
  } catch (err) {
    if (isQuotaExceededError(err)) {
      throw new Error(
        'Browser storage quota reached (QuotaExceededError). Export a backup and clear older photos or install to Home Screen to elevate storage.'
      );
    }
    throw err;
  } finally {
    db?.close();
  }
}

async function idbDelete(key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openIdb();
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
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
    "ALTER TABLE species_profiles ADD COLUMN breed_overrides_json TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE species_profiles ADD COLUMN target_weight_curve_json TEXT NOT NULL DEFAULT '[]';",
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
    "ALTER TABLE breedings ADD COLUMN litter_weight_milestones_json TEXT NOT NULL DEFAULT '[]';",
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
    "ALTER TABLE cages ADD COLUMN unit_type TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN feed_lot_name TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE cages ADD COLUMN feed_stock_remaining REAL NOT NULL DEFAULT 0;',
    "ALTER TABLE cages ADD COLUMN feed_stock_unit TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN daily_ration_note TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE cages ADD COLUMN feed_low_threshold REAL NOT NULL DEFAULT 0;',
    'ALTER TABLE cages ADD COLUMN maintenance_interval_days INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE cages ADD COLUMN maintenance_task_label TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE cages ADD COLUMN last_maintenance_date_iso TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE shows ADD COLUMN results_json TEXT NOT NULL DEFAULT '[]';",
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
  private loadedEpoch = 0;

  constructor(private readonly tabId: string = getCurrentTabId()) {}

  get engineName(): string {
    return this.db ? 'Local SQLite (WASM + IndexedDB)' : 'Local IndexedDB Store';
  }

  getWipedRecoveryContext(): WipedStorageRecoveryContext | null {
    return this.wipedRecoveryContext;
  }

  getLoadedEpoch(): number {
    return this.loadedEpoch;
  }

  private async readPersistedWriteEpoch(): Promise<PersistedWriteEpochMeta> {
    try {
      const meta = await idbGet<Partial<PersistedWriteEpochMeta>>(IDB_WRITE_EPOCH_KEY);
      const epoch = Number(meta?.epoch);
      if (meta && Number.isFinite(epoch) && epoch > 0) {
        return {
          epoch,
          writerTabId: typeof meta.writerTabId === 'string' ? meta.writerTabId : '',
          updatedAtIso: typeof meta.updatedAtIso === 'string' ? meta.updatedAtIso : '',
        };
      }
    } catch {
      // Ignore read failure; treat as epoch 0
    }
    return { epoch: 0, writerTabId: '', updatedAtIso: '' };
  }

  /**
   * Reloads `this.db` or `this.fallbackSnapshot` from IndexedDB if another tab has committed
   * a higher write epoch. MUST only be called while holding `DB_WRITE_LOCK_NAME` (or during
   * initialization under lock).
   */
  private async syncFromPersistedStorageIfStaleLocked(): Promise<boolean> {
    const persisted = await this.readPersistedWriteEpoch();
    if (persisted.epoch <= this.loadedEpoch) {
      return false;
    }

    if (this.SQL) {
      const savedBytes = await idbGet<Uint8Array>(IDB_PRIMARY_KEY).catch(() => undefined);
      if (savedBytes && savedBytes.byteLength > 0) {
        const headerCheck = validateSqliteFileHeader(savedBytes, IDB_PRIMARY_KEY);
        if (headerCheck.ok) {
          const reloadedDb = new this.SQL.Database(savedBytes);
          if (readSqliteUserVersion(reloadedDb) < SQLITE_SCHEMA_VERSION) {
            applySchemaMigrations(reloadedDb);
          }
          if (this.db) {
            try {
              this.db.close();
            } catch {
              // Ignore close error on superseded DB
            }
          }
          this.db = reloadedDb;
          this.fallbackSnapshot = null;
          this.loadedEpoch = persisted.epoch;
          return true;
        }
      }
    }

    const savedFallback = await idbGet<BarnDatabaseSnapshot>(IDB_FALLBACK_SNAPSHOT_KEY).catch(
      () => undefined
    );
    if (
      savedFallback &&
      typeof savedFallback === 'object' &&
      Array.isArray(savedFallback.animals) &&
      Array.isArray(savedFallback.speciesProfiles)
    ) {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close error
        }
        this.db = null;
      }
      this.fallbackSnapshot = savedFallback;
      this.loadedEpoch = persisted.epoch;
      return true;
    }

    this.loadedEpoch = persisted.epoch;
    return false;
  }

  async syncFromPersistedStorageIfStale(): Promise<boolean> {
    const persisted = await this.readPersistedWriteEpoch();
    if (persisted.epoch <= this.loadedEpoch) {
      return false;
    }
    return withCrossTabLock(DB_WRITE_LOCK_NAME, () => this.syncFromPersistedStorageIfStaleLocked());
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

  private async tryRestoreIntoFreshSqliteDbLocked(snapshot: BarnDatabaseSnapshot): Promise<boolean> {
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
      await this.replaceSnapshotLocked(snapshot, 'restoreFreshSqliteDb');
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
    return withCrossTabLock(DB_WRITE_LOCK_NAME, () => this.initializeLocked(options));
  }

  private async initializeLocked(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
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
      this.SQL = await initSqlJs(createSqlJsInitConfig());

      const [savedBytes, epochMeta] = await Promise.all([
        idbGet<Uint8Array>(IDB_PRIMARY_KEY),
        this.readPersistedWriteEpoch(),
      ]);
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
        this.loadedEpoch = epochMeta.epoch;

        // Automated pre-upgrade OPFS snapshot before migrating older schema versions
        const prevSchemaVer = readSqliteUserVersion(this.db);
        if (prevSchemaVer < SQLITE_SCHEMA_VERSION) {
          try {
            const preSnap = this.loadSnapshotUnlocked();
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
            salvagedSnapshot = this.loadSnapshotUnlocked();
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

        const snap = this.loadSnapshotUnlocked(options);
        if (snap.speciesProfiles.length === 0 && snap.animals.length === 0) {
          const recovered = await this.findRecoveredBackupSnapshot();
          if (recovered) {
            await this.replaceSnapshotLocked(recovered.snapshot, 'initializeRecoverEmptySqlite');
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
          await this.replaceSnapshotLocked(seeded, 'initializeSeedEmptySqlite');
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
          await this.replaceSnapshotLocked(recovered.snapshot, 'initializeRecoverMissingSqlite');
          logDiagnosticEvent({
            level: 'warn',
            category: 'storage',
            message: `Corrective action: Restored ${recovered.snapshot.animals.length} animals from ${recovered.source} when primary SQLite blob was missing`,
          });
          return finalizeSnapshot(recovered.snapshot);
        }
        const wipedShell = await tryDetectWipedStorage();
        if (wipedShell) {
          this.loadedEpoch = epochMeta.epoch;
          return wipedShell;
        }
        const seeded = buildFullPredefinedSampleSnapshot();
        await this.replaceSnapshotLocked(seeded, 'initializeFreshSeed');
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
        const rebuiltSqlite = await this.tryRestoreIntoFreshSqliteDbLocked(recovered.snapshot);
        if (!rebuiltSqlite) {
          this.fallbackSnapshot = recovered.snapshot;
          this.loadedEpoch = (await this.readPersistedWriteEpoch()).epoch;
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
        this.loadedEpoch = (await this.readPersistedWriteEpoch()).epoch;
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
        await this.persistToDiskLocked(seeded, 'initializeFallbackSeed');
      } catch {
        // Keep in-memory fallback even if quota is full
      }
      return finalizeSnapshot(seeded);
    }
  }

  private async persistToDiskLocked(
    preloadedSnapshot?: BarnDatabaseSnapshot,
    reason?: string
  ): Promise<void> {
    const persisted = await this.readPersistedWriteEpoch();
    const nextEpoch = Math.max(persisted.epoch, this.loadedEpoch) + 1;
    const epochMeta: PersistedWriteEpochMeta = {
      epoch: nextEpoch,
      writerTabId: this.tabId,
      updatedAtIso: getAdjustedNowIsoUtc(),
    };

    try {
      if (this.db) {
        const bytes = this.db.export();
        await idbSetAtomic([
          { key: IDB_PRIMARY_KEY, value: bytes },
          { key: IDB_WRITE_EPOCH_KEY, value: epochMeta },
        ]);
      } else if (this.fallbackSnapshot) {
        await idbSetAtomic([
          { key: IDB_FALLBACK_SNAPSHOT_KEY, value: this.fallbackSnapshot },
          { key: IDB_WRITE_EPOCH_KEY, value: epochMeta },
        ]);
      }
      this.loadedEpoch = nextEpoch;
      publishCrossTabDbCommit({
        epoch: nextEpoch,
        writerTabId: this.tabId,
        reason,
      });
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
          : this.loadSnapshotUnlocked({ lightweightPhotos: policy.dehydrateMirrorPhotos });
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

  private queryObjectsFromDb(db: Database, sql: string): Record<string, any>[] {
    const stmt = db.prepare(sql);
    const rows: Record<string, any>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  private queryObjects(sql: string): Record<string, any>[] {
    if (!this.db) return [];
    return this.queryObjectsFromDb(this.db, sql);
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

  private loadSnapshotUnlocked(options?: SnapshotLoadOptions): BarnDatabaseSnapshot {
    if (!this.db) {
      const base = this.fallbackSnapshot ?? buildFullPredefinedSampleSnapshot();
      return options?.lightweightPhotos ? stripPhotoDataUrlsFromSnapshot(base) : base;
    }
    return this.readSnapshotFromDatabase(this.db, options);
  }

  async loadSnapshot(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    const persisted = await this.readPersistedWriteEpoch();
    if (persisted.epoch > this.loadedEpoch) {
      return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
        await this.syncFromPersistedStorageIfStaleLocked();
        return this.loadSnapshotUnlocked(options);
      });
    }
    return this.loadSnapshotUnlocked(options);
  }

  private readSnapshotFromDatabase(
    db: Database,
    options?: SnapshotLoadOptions
  ): BarnDatabaseSnapshot {
    const runQuery = (sql: string) => this.queryObjectsFromDb(db, sql);

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

    const settingsRows = runQuery('SELECT * FROM barn_settings LIMIT 1');
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
          breederLogoDataUrl:
            typeof extraSettings.breederLogoDataUrl === 'string'
              ? sanitizeSafeRasterImageDataUrl(extraSettings.breederLogoDataUrl) || undefined
              : undefined,
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
          feedTagPurgeWindowDays: normalizeFeedPurgeWindowDays(
            extraSettings.feedTagPurgeWindowDays,
            60
          ),
          updatedAt: String(sRow.updated_at || getAdjustedNowIsoUtc()),
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
          feedTagPurgeWindowDays: 60,
          updatedAt: getAdjustedNowIsoUtc(),
        };

    const speciesProfiles: SpeciesProfile[] = runQuery(
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
        breedOverrides: normalizeBreedScheduleOverrides(
          safeArray(
            this.safeParseJson(
              r.breed_overrides_json || '[]',
              [],
              `species_profiles(${String(r.name)}).breed_overrides_json`
            )
          )
        ),
        targetWeightCurve: normalizeTargetWeightCurve(
          safeArray(
            this.safeParseJson(
              r.target_weight_curve_json || '[]',
              [],
              `species_profiles(${String(r.name)}).target_weight_curve_json`
            )
          )
        ),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const animals: Animal[] = runQuery('SELECT * FROM animals ORDER BY name ASC').map((r) =>
      this.mapAnimalRow(r, finiteNonNeg, safeArray)
    );

    const photoQuerySql = options?.lightweightPhotos
      ? `SELECT id, species, animal_id, is_primary, sort_order, caption, original_file_name, mime_type,
                width, height, original_bytes, stored_bytes,
                CASE WHEN length(thumbnail_data_url) > 0 THEN thumbnail_data_url ELSE data_url END AS thumbnail_data_url,
                '' AS data_url, created_at, updated_at
         FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC`
      : 'SELECT * FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC';

    const animalPhotos: AnimalPhoto[] = runQuery(photoQuerySql).map((r) => ({
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

    const cages: CageLocation[] = runQuery('SELECT * FROM cages ORDER BY label ASC').map((r) => {
      const unitType = normalizeHousingUnitType(r.unit_type);
      const feedLotName = r.feed_lot_name ? String(r.feed_lot_name) : '';
      const feedStockRemaining = finiteNonNeg(r.feed_stock_remaining, 0);
      const feedStockUnit = r.feed_stock_unit ? String(r.feed_stock_unit) : '';
      const dailyRationNote = r.daily_ration_note ? String(r.daily_ration_note) : '';
      const feedLowThreshold = finiteNonNeg(r.feed_low_threshold, 0);
      const maintenanceIntervalDays = Math.round(finiteNonNeg(r.maintenance_interval_days, 0));
      const maintenanceTaskLabel = r.maintenance_task_label ? String(r.maintenance_task_label) : '';
      const lastMaintenanceDateIso = r.last_maintenance_date_iso
        ? String(r.last_maintenance_date_iso)
        : '';
      return {
        id: String(r.id),
        species: String(r.species),
        label: String(r.label),
        section: String(r.section),
        capacity: Math.max(1, finiteNonNeg(r.capacity, 1)),
        notes: String(r.notes),
        ...(unitType ? { unitType } : {}),
        ...(feedLotName ? { feedLotName } : {}),
        ...(feedStockRemaining > 0 ? { feedStockRemaining } : {}),
        ...(feedStockUnit ? { feedStockUnit } : {}),
        ...(dailyRationNote ? { dailyRationNote } : {}),
        ...(feedLowThreshold > 0 ? { feedLowThreshold } : {}),
        ...(maintenanceIntervalDays > 0 ? { maintenanceIntervalDays } : {}),
        ...(maintenanceTaskLabel ? { maintenanceTaskLabel } : {}),
        ...(lastMaintenanceDateIso ? { lastMaintenanceDateIso } : {}),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const breedings: BreedingRecord[] = runQuery(
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
      litterWeightMilestones: normalizeLitterWeightMilestones(
        safeArray(
          this.safeParseJson(
            r.litter_weight_milestones_json || '[]',
            [],
            `breedings(${String(r.id)}).litter_weight_milestones_json`
          )
        )
      ),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const tasks: BarnTask[] = runQuery(
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

    const careLogs: CareLog[] = runQuery(
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

    const shows: ShowEvent[] = runQuery(
      'SELECT * FROM shows ORDER BY event_date_iso ASC'
    ).map((r) => {
      const parsedEnteredIds = safeArray<string>(
        this.safeParseJson<string[]>(
          r.entered_animal_ids_json || '[]',
          [],
          `shows(${String(r.name || r.id)}).entered_animal_ids_json`
        )
      );
      const parsedResults = normalizeShowResults(
        this.safeParseJson<unknown[]>(
          r.results_json || '[]',
          [],
          `shows(${String(r.name || r.id)}).results_json`
        ),
        { dropEmpty: false }
      );
      return {
        id: String(r.id),
        species: String(r.species),
        name: String(r.name),
        location: String(r.location),
        sanctioningBody: String(r.sanctioning_body),
        eventDateIso: String(r.event_date_iso),
        entryDeadlineIso: String(r.entry_deadline_iso),
        enteredAnimalIds: mergeEnteredAnimalIdsWithResults(parsedEnteredIds, parsedResults),
        results: parsedResults.length > 0 ? parsedResults : undefined,
        notes: String(r.notes),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const safeTableQuery = (tableName: string, sql: string): Record<string, any>[] => {
      try {
        const existsStmt = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1"
        );
        let exists = false;
        try {
          existsStmt.bind([tableName]);
          exists = existsStmt.step();
        } finally {
          existsStmt.free();
        }
        return exists ? runQuery(sql) : [];
      } catch {
        return [];
      }
    };

    const feedBatches: FeedBatch[] = safeTableQuery(
      'feed_batches',
      'SELECT * FROM feed_batches ORDER BY purchase_date_iso DESC, created_at DESC'
    ).map((r) => {
      const totalCostRaw = finiteNonNeg(r.total_cost_cents, 0);
      const proteinRaw = finiteNonNeg(r.protein_percent, 0);
      const tagPhotoDataUrl = r.tag_photo_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.tag_photo_data_url)) || undefined
        : undefined;
      const tagPhotoThumbnailDataUrl = r.tag_photo_thumbnail_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.tag_photo_thumbnail_data_url)) || tagPhotoDataUrl
        : tagPhotoDataUrl;
      const tagPhotoBytes = finiteNonNeg(r.tag_photo_bytes, 0);
      const tagPhotoBytesReclaimed = finiteNonNeg(r.tag_photo_bytes_reclaimed, 0);
      const ocrConf = finiteNonNeg(r.ocr_confidence, 0);
      return {
        id: String(r.id),
        species: String(r.species),
        brand: String(r.brand || ''),
        productName: String(r.product_name),
        lotNumber: String(r.lot_number || ''),
        millCode: String(r.mill_code || ''),
        manufactureDateIso: String(r.manufacture_date_iso || ''),
        purchaseDateIso: String(r.purchase_date_iso),
        bagCount: finiteNonNeg(r.bag_count, 0),
        bagWeightValue: finiteNonNeg(r.bag_weight_value, 0),
        bagWeightUnit: String(r.bag_weight_unit || 'lbs'),
        totalQuantity: finiteNonNeg(r.total_quantity, 0),
        remainingQuantity: finiteNonNeg(r.remaining_quantity, 0),
        lowStockThreshold: finiteNonNeg(r.low_stock_threshold, 0),
        ...(totalCostRaw > 0 ? { totalCostCents: Math.round(totalCostRaw) } : {}),
        supplierName: String(r.supplier_name || ''),
        ...(proteinRaw > 0 ? { proteinPercent: proteinRaw } : {}),
        notes: String(r.notes || ''),
        ...(tagPhotoDataUrl ? { tagPhotoDataUrl } : {}),
        ...(tagPhotoThumbnailDataUrl ? { tagPhotoThumbnailDataUrl } : {}),
        ...(r.tag_photo_mime_type ? { tagPhotoMimeType: String(r.tag_photo_mime_type) } : {}),
        ...(tagPhotoBytes > 0 ? { tagPhotoBytes } : {}),
        ...(r.tag_photo_captured_date_iso
          ? { tagPhotoCapturedDateIso: String(r.tag_photo_captured_date_iso) }
          : {}),
        ...(r.tag_photo_purged_at_iso
          ? { tagPhotoPurgedAtIso: String(r.tag_photo_purged_at_iso) }
          : {}),
        ...(tagPhotoBytesReclaimed > 0 ? { tagPhotoBytesReclaimed } : {}),
        ...(r.ocr_raw_text ? { ocrRawText: String(r.ocr_raw_text) } : {}),
        ...(ocrConf > 0 ? { ocrConfidence: ocrConf } : {}),
        ...(Number(r.ocr_manual_override) === 1 ? { ocrManualOverride: true } : {}),
        ...(Number(r.recall_flagged) === 1 ? { recallFlagged: true } : {}),
        ...(r.recall_note ? { recallNote: String(r.recall_note) } : {}),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const feedAllocations: FeedAllocation[] = safeTableQuery(
      'feed_allocations',
      'SELECT * FROM feed_allocations ORDER BY date_iso DESC, created_at DESC'
    ).map((r) => {
      const tType = String(r.target_type || 'general');
      const targetType: FeedAllocationTargetType =
        tType === 'cage' || tType === 'litter' || tType === 'animal' ? tType : 'general';
      return {
        id: String(r.id),
        species: String(r.species),
        feedBatchId: String(r.feed_batch_id),
        targetType,
        targetId: String(r.target_id || ''),
        targetLabel: String(r.target_label || ''),
        dateIso: String(r.date_iso),
        quantity: finiteNonNeg(r.quantity, 0),
        unit: String(r.unit || 'lbs'),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const ledgerEntries: LedgerEntry[] = safeTableQuery(
      'ledger_entries',
      'SELECT * FROM ledger_entries ORDER BY date_iso DESC, created_at DESC'
    ).map((r) => {
      const receiptPhotoDataUrl = r.receipt_photo_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.receipt_photo_data_url)) || undefined
        : undefined;
      const receiptPhotoThumbnailDataUrl = r.receipt_photo_thumbnail_data_url
        ? sanitizeSafeRasterImageDataUrl(String(r.receipt_photo_thumbnail_data_url)) ||
          receiptPhotoDataUrl
        : receiptPhotoDataUrl;
      const receiptPhotoBytes = finiteNonNeg(r.receipt_photo_bytes, 0);
      return {
        id: String(r.id),
        species: String(r.species),
        dateIso: String(r.date_iso || ''),
        entryType: normalizeLedgerEntryType(r.entry_type, 'expense'),
        category: normalizeLedgerCategory(r.category, 'other'),
        amountCents: Math.round(finiteNonNeg(r.amount_cents, 0)),
        title: String(r.title || ''),
        vendorOrParty: String(r.vendor_or_party || ''),
        ...(r.linked_animal_id ? { linkedAnimalId: String(r.linked_animal_id) } : {}),
        ...(r.linked_breeding_id ? { linkedBreedingId: String(r.linked_breeding_id) } : {}),
        ...(r.linked_feed_batch_id ? { linkedFeedBatchId: String(r.linked_feed_batch_id) } : {}),
        ...(r.linked_project_id ? { linkedProjectId: String(r.linked_project_id) } : {}),
        ...(receiptPhotoDataUrl ? { receiptPhotoDataUrl } : {}),
        ...(receiptPhotoThumbnailDataUrl ? { receiptPhotoThumbnailDataUrl } : {}),
        ...(r.receipt_photo_mime_type
          ? { receiptPhotoMimeType: String(r.receipt_photo_mime_type) }
          : {}),
        ...(receiptPhotoBytes > 0 ? { receiptPhotoBytes } : {}),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const processingLogs: ProcessingLog[] = safeTableQuery(
      'processing_logs',
      'SELECT * FROM processing_logs ORDER BY harvest_date_iso DESC, scheduled_date_iso DESC, created_at DESC'
    ).map((r) => {
      const dressPctRaw = finiteNonNeg(r.dress_out_percent, 0);
      const procCostRaw = Math.round(finiteNonNeg(r.processing_cost_cents, 0));
      const meatValRaw = Math.round(finiteNonNeg(r.meat_value_cents, 0));
      const peltValRaw = Math.round(finiteNonNeg(r.pelt_value_cents, 0));
      return {
        id: String(r.id),
        species: String(r.species),
        title: String(r.title || ''),
        ...(r.linked_animal_id ? { linkedAnimalId: String(r.linked_animal_id) } : {}),
        ...(r.linked_breeding_id ? { linkedBreedingId: String(r.linked_breeding_id) } : {}),
        scheduledDateIso: String(r.scheduled_date_iso || ''),
        harvestDateIso: String(r.harvest_date_iso || ''),
        status: normalizeProcessingStatus(r.status, 'Processed'),
        animalCount: Math.max(1, Math.round(finiteNonNeg(r.animal_count, 1))),
        liveWeightGrams: Math.round(finiteNonNeg(r.live_weight_grams, 0)),
        dressedWeightGrams: Math.round(finiteNonNeg(r.dressed_weight_grams, 0)),
        ...(dressPctRaw > 0 ? { dressOutPercent: dressPctRaw } : {}),
        peltCount: Math.round(finiteNonNeg(r.pelt_count, 0)),
        peltGrade: normalizePeltGrade(r.pelt_grade),
        peltColorNotes: String(r.pelt_color_notes || ''),
        ...(procCostRaw > 0 ? { processingCostCents: procCostRaw } : {}),
        ...(meatValRaw > 0 ? { meatValueCents: meatValRaw } : {}),
        ...(peltValRaw > 0 ? { peltValueCents: peltValRaw } : {}),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const youthProjectBooks: YouthProjectBook[] = safeTableQuery(
      'youth_project_books',
      'SELECT * FROM youth_project_books ORDER BY project_year DESC, start_date_iso DESC, created_at DESC'
    ).map((r) => {
      const linkedAnimalIds = safeArray<string>(
        this.safeParseJson<string[]>(
          r.linked_animal_ids_json || '[]',
          [],
          `youth_project_books(${String(r.id)}).linked_animal_ids_json`
        )
      );
      const linkedBreedingIds = safeArray<string>(
        this.safeParseJson<string[]>(
          r.linked_breeding_ids_json || '[]',
          [],
          `youth_project_books(${String(r.id)}).linked_breeding_ids_json`
        )
      );
      const feedLogs = normalizeYouthProjectFeedLogs(
        this.safeParseJson<unknown[]>(
          r.feed_logs_json || '[]',
          [],
          `youth_project_books(${String(r.id)}).feed_logs_json`
        )
      );
      return {
        id: String(r.id),
        species: String(r.species),
        organization: normalizeYouthOrgType(r.organization, '4-H'),
        projectTitle: String(r.project_title || ''),
        memberName: String(r.member_name || ''),
        clubOrChapter: String(r.club_or_chapter || ''),
        leaderOrAdvisor: String(r.leader_or_advisor || ''),
        projectYear: String(r.project_year || ''),
        startDateIso: String(r.start_date_iso || ''),
        endDateIso: String(r.end_date_iso || ''),
        status: String(r.status) === 'Completed' ? 'Completed' : 'Active',
        linkedAnimalIds,
        linkedBreedingIds,
        startingInventoryValueCents: Math.round(
          finiteNonNeg(r.starting_inventory_value_cents, 0)
        ),
        endingInventoryValueCents: Math.round(
          finiteNonNeg(r.ending_inventory_value_cents, 0)
        ),
        feedLogs,
        goalsAndReflection: String(r.goals_and_reflection || ''),
        showAndCommunityNotes: String(r.show_and_community_notes || ''),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const clientContacts: ClientContact[] = safeTableQuery(
      'client_contacts',
      'SELECT * FROM client_contacts ORDER BY full_name ASC, created_at DESC'
    ).map((r) => {
      const tags = safeArray<string>(
        this.safeParseJson<string[]>(
          r.tags_json || '[]',
          [],
          `client_contacts(${String(r.id)}).tags_json`
        )
      )
        .filter((t) => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim());
      return {
        id: String(r.id),
        species: String(r.species),
        fullName: String(r.full_name || ''),
        ranchOrHerdName: String(r.ranch_or_herd_name || ''),
        email: String(r.email || ''),
        phone: String(r.phone || ''),
        preferredContact: normalizePreferredContactMethod(r.preferred_contact, 'sms'),
        clientKind: normalizeClientKind(r.client_kind, 'pet_buyer'),
        cityState: String(r.city_state || ''),
        shippingAddress: String(r.shipping_address || ''),
        tags,
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const waitlistEntries: WaitlistEntry[] = safeTableQuery(
      'waitlist_entries',
      'SELECT * FROM waitlist_entries ORDER BY priority_rank ASC, inquiry_date_iso ASC, created_at ASC'
    ).map((r) => {
      const rawSex = String(r.preferred_sex || 'Any');
      const preferredSex: WaitlistEntry['preferredSex'] =
        rawSex === 'Male' || rawSex === 'Female' ? rawSex : 'Any';
      const maxBudgetRaw = Math.round(finiteNonNeg(r.max_budget_cents, 0));
      return {
        id: String(r.id),
        species: String(r.species),
        clientId: String(r.client_id || ''),
        clientName: String(r.client_name || ''),
        priorityRank: Math.max(1, Math.round(finiteNonNeg(r.priority_rank, 1))),
        status: normalizeWaitlistStatus(r.status, 'Active'),
        intent: normalizeWaitlistIntent(r.intent, 'Show / Breeding'),
        desiredBreed: String(r.desired_breed || ''),
        desiredVariety: String(r.desired_variety || ''),
        preferredSex,
        ...(r.preferred_breeding_id
          ? { preferredBreedingId: String(r.preferred_breeding_id) }
          : {}),
        requestedByDateIso: String(r.requested_by_date_iso || ''),
        inquiryDateIso: String(r.inquiry_date_iso || ''),
        followUpDateIso: String(r.follow_up_date_iso || ''),
        lastContactedDateIso: String(r.last_contacted_date_iso || ''),
        ...(maxBudgetRaw > 0 ? { maxBudgetCents: maxBudgetRaw } : {}),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    const animalReservations: AnimalReservation[] = safeTableQuery(
      'animal_reservations',
      'SELECT * FROM animal_reservations ORDER BY reserved_date_iso DESC, created_at DESC'
    ).map((r) => {
      const pickOrderRaw = Math.round(finiteNonNeg(r.pick_order, 0));
      return {
        id: String(r.id),
        species: String(r.species),
        agreementNumber: String(r.agreement_number || ''),
        clientId: String(r.client_id || ''),
        clientName: String(r.client_name || ''),
        ...(r.waitlist_entry_id ? { waitlistEntryId: String(r.waitlist_entry_id) } : {}),
        ...(r.animal_id ? { animalId: String(r.animal_id) } : {}),
        ...(r.breeding_id ? { breedingId: String(r.breeding_id) } : {}),
        ...(pickOrderRaw > 0 ? { pickOrder: pickOrderRaw } : {}),
        itemLabel: String(r.item_label || ''),
        status: normalizeReservationStatus(r.status, 'Pending Deposit'),
        reservedDateIso: String(r.reserved_date_iso || ''),
        holdExpiresDateIso: String(r.hold_expires_date_iso || ''),
        totalPriceCents: Math.round(finiteNonNeg(r.total_price_cents, 0)),
        depositRequiredCents: Math.round(finiteNonNeg(r.deposit_required_cents, 0)),
        depositPaidCents: Math.round(finiteNonNeg(r.deposit_paid_cents, 0)),
        depositDueDateIso: String(r.deposit_due_date_iso || ''),
        depositPaidDateIso: String(r.deposit_paid_date_iso || ''),
        pickupScheduledDateIso: String(r.pickup_scheduled_date_iso || ''),
        completedDateIso: String(r.completed_date_iso || ''),
        balanceReminderDateIso: String(r.balance_reminder_date_iso || ''),
        paymentMethod: String(r.payment_method || ''),
        ...(r.ledger_entry_id ? { ledgerEntryId: String(r.ledger_entry_id) } : {}),
        termsSummary: String(r.terms_summary || ''),
        healthGuaranteeNotes: String(r.health_guarantee_notes || ''),
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

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
      feedBatches,
      feedAllocations,
      ledgerEntries,
      processingLogs,
      youthProjectBooks,
      clientContacts,
      waitlistEntries,
      animalReservations,
      woolHarvests: safeTableQuery(
        'wool_harvests',
        'SELECT * FROM wool_harvests ORDER BY harvest_date_iso DESC, created_at DESC'
      ).map((r): WoolHarvest => {
        const intervalRaw = Math.round(finiteNonNeg(r.shearing_interval_days, 0));
        const stapleRaw = finiteNonNeg(r.staple_length_mm, 0);
        const rawScoreJson = r.iagarb_score_json
          ? this.safeParseJson<Record<string, unknown> | null>(
              r.iagarb_score_json,
              null,
              `wool_harvests(${String(r.id)}).iagarb_score_json`
            )
          : null;
        const iagarbScore =
          rawScoreJson && Object.keys(rawScoreJson).length > 0
            ? normalizeIagarbScorecard(rawScoreJson)
            : undefined;
        return {
          id: String(r.id),
          species: String(r.species),
          animalId: String(r.animal_id || ''),
          harvestDateIso: String(r.harvest_date_iso || ''),
          ...(intervalRaw > 0 ? { shearingIntervalDays: intervalRaw } : {}),
          primeWeightGrams: Math.round(finiteNonNeg(r.prime_weight_grams, 0)),
          gradeWeightGrams: Math.round(finiteNonNeg(r.grade_weight_grams, 0)),
          harvestMethod: normalizeWoolHarvestMethod(r.harvest_method, 'Shear'),
          ...(stapleRaw > 0 ? { stapleLengthMm: stapleRaw } : {}),
          ...(iagarbScore ? { iagarbScore } : {}),
          witnessedBy: String(r.witnessed_by || ''),
          notes: String(r.notes || ''),
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        };
      }),
    };
  }

  async loadAnimalPhotoDataUrl(photoId: string): Promise<string | null> {
    if (!photoId) return null;
    await this.syncFromPersistedStorageIfStale();
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
    await this.syncFromPersistedStorageIfStale();

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

  private mapAnimalRow(
    r: Record<string, any>,
    finiteNonNeg?: (raw: unknown, fallback?: number) => number,
    safeArray?: <T>(val: unknown) => T[]
  ): Animal {
    const sanitizeNonNeg =
      finiteNonNeg ??
      ((raw: unknown, fallback = 0): number => {
        if (raw === null || raw === undefined || raw === '') return fallback;
        const num = Number(raw);
        return Number.isFinite(num) && num >= 0 ? num : fallback;
      });
    const toSafeArray =
      safeArray ?? (<T>(val: unknown): T[] => (Array.isArray(val) ? (val as T[]) : []));

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
    const rawSex = String(r.sex || 'Unknown');
    const sex: Animal['sex'] =
      rawSex === 'Male' || rawSex === 'Female' ? rawSex : 'Unknown';
    const status: Animal['status'] = normalizeAnimalStatus(r.status);

    return {
      id: String(r.id),
      tattoo: String(r.tattoo),
      name: String(r.name),
      species: String(r.species),
      breed: String(r.breed),
      variety: String(r.variety),
      sex,
      status,
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
      weightGrams: sanitizeNonNeg(r.weight_grams, 0),
      genotype: toSafeArray(
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
      legsCount: sanitizeNonNeg(r.legs_count, 0),
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
      salePriceCents: sanitizeNonNeg(r.sale_price_cents, 0),
      purchaseCostCents: sanitizeNonNeg(r.purchase_cost_cents, 0),
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

  async queryPedigreeNeighborhood(rootIds: string[], maxDepth: number): Promise<Animal[]> {
    const cleanRoots = Array.from(new Set(rootIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (cleanRoots.length === 0) return [];
    const boundedDepth = Math.min(8, Math.max(0, Math.floor(maxDepth)));
    await this.syncFromPersistedStorageIfStale();

    const MAX_RECORDS = 512;
    const collected: Animal[] = [];
    const visited = new Set<string>();
    let frontier = cleanRoots;

    if (!this.db) {
      const byId = new Map<string, Animal>();
      for (const a of this.fallbackSnapshot?.animals ?? []) {
        byId.set(a.id, a);
      }
      for (let depth = 0; depth <= boundedDepth && frontier.length > 0 && collected.length < MAX_RECORDS; depth++) {
        const nextFrontier: string[] = [];
        for (const id of frontier) {
          if (visited.has(id) || collected.length >= MAX_RECORDS) continue;
          visited.add(id);
          const found = byId.get(id);
          if (!found) continue;
          collected.push(found);
          if (depth < boundedDepth) {
            if (found.sireId && !visited.has(found.sireId)) nextFrontier.push(found.sireId);
            if (found.damId && !visited.has(found.damId)) nextFrontier.push(found.damId);
          }
        }
        frontier = nextFrontier;
      }
      return collected;
    }

    for (let depth = 0; depth <= boundedDepth && frontier.length > 0 && collected.length < MAX_RECORDS; depth++) {
      const batchToFetch: string[] = [];
      for (const id of frontier) {
        if (!visited.has(id)) {
          visited.add(id);
          batchToFetch.push(id);
        }
      }
      if (batchToFetch.length === 0) break;

      const nextFrontier: string[] = [];
      for (let i = 0; i < batchToFetch.length; i += 64) {
        if (collected.length >= MAX_RECORDS) break;
        const chunk = batchToFetch.slice(i, i + 64);
        const placeholders = chunk.map(() => '?').join(', ');
        const stmt = this.db.prepare(
          `SELECT * FROM animals WHERE id IN (${placeholders})`
        );
        try {
          stmt.bind(chunk);
          while (stmt.step()) {
            if (collected.length >= MAX_RECORDS) break;
            const animal = this.mapAnimalRow(stmt.getAsObject());
            collected.push(animal);
            if (depth < boundedDepth) {
              if (animal.sireId && !visited.has(animal.sireId)) nextFrontier.push(animal.sireId);
              if (animal.damId && !visited.has(animal.damId)) nextFrontier.push(animal.damId);
            }
          }
        } finally {
          stmt.free();
        }
      }
      frontier = nextFrontier;
    }

    return collected;
  }

  async queryPedigreeBranchAncestorsExist(
    animalIds: string[]
  ): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    const cleanIds = Array.from(new Set(animalIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (cleanIds.length === 0) return out;
    await this.syncFromPersistedStorageIfStale();

    if (!this.db) {
      const byId = new Map<string, Animal>();
      for (const a of this.fallbackSnapshot?.animals ?? []) {
        byId.set(a.id, a);
      }
      for (const id of cleanIds) {
        const a = byId.get(id);
        if (!a) {
          out[id] = false;
          continue;
        }
        out[id] = Boolean(
          (a.sireId && byId.has(a.sireId)) ||
            (a.damId && byId.has(a.damId)) ||
            a.offloadedArchiveKey
        );
      }
      return out;
    }

    const parentRefs: Array<{ id: string; sireId: string; damId: string; archivedKey: string }> = [];
    const candidateParentIds = new Set<string>();

    for (let i = 0; i < cleanIds.length; i += 64) {
      const chunk = cleanIds.slice(i, i + 64);
      const placeholders = chunk.map(() => '?').join(', ');
      const stmt = this.db.prepare(
        `SELECT id, sire_id, dam_id, offloaded_archive_key FROM animals WHERE id IN (${placeholders})`
      );
      try {
        stmt.bind(chunk);
        while (stmt.step()) {
          const r = stmt.getAsObject() as {
            id?: unknown;
            sire_id?: unknown;
            dam_id?: unknown;
            offloaded_archive_key?: unknown;
          };
          const id = String(r.id || '');
          const sireId = String(r.sire_id || '');
          const damId = String(r.dam_id || '');
          const archivedKey = String(r.offloaded_archive_key || '');
          if (id) {
            parentRefs.push({ id, sireId, damId, archivedKey });
            if (sireId) candidateParentIds.add(sireId);
            if (damId) candidateParentIds.add(damId);
          }
        }
      } finally {
        stmt.free();
      }
    }

    const existingParents = new Set<string>();
    const parentIdArr = Array.from(candidateParentIds);
    for (let i = 0; i < parentIdArr.length; i += 64) {
      const chunk = parentIdArr.slice(i, i + 64);
      const placeholders = chunk.map(() => '?').join(', ');
      const stmt = this.db.prepare(
        `SELECT id FROM animals WHERE id IN (${placeholders})`
      );
      try {
        stmt.bind(chunk);
        while (stmt.step()) {
          const r = stmt.getAsObject() as { id?: unknown };
          const pid = String(r.id || '');
          if (pid) existingParents.add(pid);
        }
      } finally {
        stmt.free();
      }
    }

    for (const ref of parentRefs) {
      out[ref.id] = Boolean(
        (ref.sireId && existingParents.has(ref.sireId)) ||
          (ref.damId && existingParents.has(ref.damId)) ||
          ref.archivedKey
      );
    }
    return out;
  }

  async replaceSnapshot(snapshot: BarnDatabaseSnapshot): Promise<void> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, () =>
      this.replaceSnapshotLocked(snapshot, 'replaceSnapshot')
    );
  }

  private async replaceSnapshotLocked(
    snapshot: BarnDatabaseSnapshot,
    reason = 'replaceSnapshot'
  ): Promise<void> {
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
      await this.persistToDiskLocked(nextSnap, reason);
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
      this.db.run('DELETE FROM feed_batches;');
      this.db.run('DELETE FROM feed_allocations;');
      this.db.run('DELETE FROM ledger_entries;');
      this.db.run('DELETE FROM processing_logs;');
      this.db.run('DELETE FROM youth_project_books;');
      this.db.run('DELETE FROM client_contacts;');
      this.db.run('DELETE FROM waitlist_entries;');
      this.db.run('DELETE FROM animal_reservations;');
      this.db.run('DELETE FROM wool_harvests;');

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
      for (const fb of snapshot.feedBatches ?? []) this.upsertFeedBatchRow(fb);
      for (const fa of snapshot.feedAllocations ?? []) this.upsertFeedAllocationRow(fa);
      for (const le of snapshot.ledgerEntries ?? []) this.upsertLedgerEntryRow(le);
      for (const pl of snapshot.processingLogs ?? []) this.upsertProcessingLogRow(pl);
      for (const yp of snapshot.youthProjectBooks ?? []) this.upsertYouthProjectBookRow(yp);
      for (const cc of snapshot.clientContacts ?? []) this.upsertClientContactRow(cc);
      for (const wl of snapshot.waitlistEntries ?? []) this.upsertWaitlistEntryRow(wl);
      for (const ar of snapshot.animalReservations ?? []) this.upsertAnimalReservationRow(ar);
      for (const wh of snapshot.woolHarvests ?? []) this.upsertWoolHarvestRow(wh);

      this.db.run('COMMIT;');
    } catch (e) {
      try {
        this.db.run('ROLLBACK;');
      } catch {
        // Ignore rollback error so root exception surfaces cleanly
      }
      throw e;
    }

    await this.persistToDiskLocked(hasDehydratedPhoto ? undefined : snapshot, reason);
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
      breederLogoDataUrl: s.breederLogoDataUrl
        ? sanitizeSafeRasterImageDataUrl(s.breederLogoDataUrl) || undefined
        : undefined,
      calendarSync: s.calendarSync ? normalizeCalendarSyncSettings(s.calendarSync) : undefined,
      lastBackupMeta: s.lastBackupMeta ?? undefined,
      backupReminderSnoozedUntilMs: s.backupReminderSnoozedUntilMs ?? undefined,
      autoOffloadRetiredToOpfs: Boolean(s.autoOffloadRetiredToOpfs),
      feedTagPurgeWindowDays: normalizeFeedPurgeWindowDays(s.feedTagPurgeWindowDays, 60),
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
       (id, name, sort_order, default_animal_prefix, preferred_unit, memo_text, memo_updated_at, gestation_days, rebreed_days_after_birth, wean_days_after_birth, maturity_days, birth_event_label, male_label, female_label, offspring_label, example_breeds_json, milestones_json, breed_overrides_json, target_weight_curve_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(normalizeBreedScheduleOverrides(sp.breedOverrides)),
        JSON.stringify(normalizeTargetWeightCurve(sp.targetWeightCurve)),
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
       (id, species, label, section, capacity, notes, unit_type, feed_lot_name, feed_stock_remaining, feed_stock_unit, daily_ration_note, feed_low_threshold, maintenance_interval_days, maintenance_task_label, last_maintenance_date_iso, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.species,
        c.label,
        c.section,
        c.capacity,
        c.notes,
        c.unitType || '',
        c.feedLotName || '',
        Number.isFinite(Number(c.feedStockRemaining)) && Number(c.feedStockRemaining) > 0
          ? Number(c.feedStockRemaining)
          : 0,
        c.feedStockUnit || '',
        c.dailyRationNote || '',
        Number.isFinite(Number(c.feedLowThreshold)) && Number(c.feedLowThreshold) > 0
          ? Number(c.feedLowThreshold)
          : 0,
        Number.isFinite(Number(c.maintenanceIntervalDays)) && Number(c.maintenanceIntervalDays) > 0
          ? Math.round(Number(c.maintenanceIntervalDays))
          : 0,
        c.maintenanceTaskLabel || '',
        c.lastMaintenanceDateIso || '',
        c.createdAt,
        c.updatedAt,
      ]
    );
  }

  private upsertBreedingRow(b: BreedingRecord): void {
    this.db?.run(
      `INSERT OR REPLACE INTO breedings
       (id, species, sire_id, dam_id, sire_name, dam_name, bred_date_iso, expected_due_date_iso, actual_birth_date_iso, projected_coi_percent, live_count, stillborn_count, fostered_count, weaned_count, offspring_created, status, service_fee_cents, service_fee_direction, ultrasound_date_iso, ultrasound_result, ultrasound_fetal_count, ultrasound_projected_due_iso, litter_weight_milestones_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        JSON.stringify(normalizeLitterWeightMilestones(b.litterWeightMilestones)),
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
    const cleanResults = normalizeShowResults(s.results ?? [], { dropEmpty: false });
    const syncedEnteredIds = mergeEnteredAnimalIdsWithResults(s.enteredAnimalIds ?? [], cleanResults);
    this.db?.run(
      `INSERT OR REPLACE INTO shows
       (id, species, name, location, sanctioning_body, event_date_iso, entry_deadline_iso, entered_animal_ids_json, results_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.species,
        s.name,
        s.location,
        s.sanctioningBody,
        s.eventDateIso,
        s.entryDeadlineIso,
        JSON.stringify(syncedEnteredIds),
        JSON.stringify(cleanResults),
        s.notes,
        s.createdAt,
        s.updatedAt,
      ]
    );
  }

  private upsertFeedBatchRow(f: FeedBatch): void {
    const safePhoto = f.tagPhotoDataUrl
      ? sanitizeSafeRasterImageDataUrl(f.tagPhotoDataUrl) || ''
      : '';
    const safeThumb = f.tagPhotoThumbnailDataUrl
      ? sanitizeSafeRasterImageDataUrl(f.tagPhotoThumbnailDataUrl) || safePhoto
      : safePhoto;
    this.db?.run(
      `INSERT OR REPLACE INTO feed_batches
       (id, species, brand, product_name, lot_number, mill_code, manufacture_date_iso, purchase_date_iso, bag_count, bag_weight_value, bag_weight_unit, total_quantity, remaining_quantity, low_stock_threshold, total_cost_cents, supplier_name, protein_percent, notes, tag_photo_data_url, tag_photo_thumbnail_data_url, tag_photo_mime_type, tag_photo_bytes, tag_photo_captured_date_iso, tag_photo_purged_at_iso, tag_photo_bytes_reclaimed, ocr_raw_text, ocr_confidence, ocr_manual_override, recall_flagged, recall_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.id,
        f.species,
        f.brand || '',
        f.productName,
        f.lotNumber || '',
        f.millCode || '',
        f.manufactureDateIso || '',
        f.purchaseDateIso,
        Number.isFinite(Number(f.bagCount)) && Number(f.bagCount) >= 0 ? Number(f.bagCount) : 0,
        Number.isFinite(Number(f.bagWeightValue)) && Number(f.bagWeightValue) >= 0 ? Number(f.bagWeightValue) : 0,
        f.bagWeightUnit || 'lbs',
        Number.isFinite(Number(f.totalQuantity)) && Number(f.totalQuantity) >= 0 ? Number(f.totalQuantity) : 0,
        Number.isFinite(Number(f.remainingQuantity)) && Number(f.remainingQuantity) >= 0 ? Number(f.remainingQuantity) : 0,
        Number.isFinite(Number(f.lowStockThreshold)) && Number(f.lowStockThreshold) >= 0 ? Number(f.lowStockThreshold) : 0,
        f.totalCostCents && f.totalCostCents > 0 ? Math.round(f.totalCostCents) : 0,
        f.supplierName || '',
        f.proteinPercent && f.proteinPercent > 0 ? Number(f.proteinPercent) : 0,
        f.notes || '',
        safePhoto,
        safeThumb,
        f.tagPhotoMimeType || '',
        f.tagPhotoBytes && f.tagPhotoBytes > 0 ? Math.round(f.tagPhotoBytes) : 0,
        f.tagPhotoCapturedDateIso || '',
        f.tagPhotoPurgedAtIso || '',
        f.tagPhotoBytesReclaimed && f.tagPhotoBytesReclaimed > 0 ? Math.round(f.tagPhotoBytesReclaimed) : 0,
        f.ocrRawText || '',
        f.ocrConfidence && f.ocrConfidence > 0 ? Number(f.ocrConfidence) : 0,
        f.ocrManualOverride ? 1 : 0,
        f.recallFlagged ? 1 : 0,
        f.recallNote || '',
        f.createdAt,
        f.updatedAt,
      ]
    );
  }

  private upsertFeedAllocationRow(fa: FeedAllocation): void {
    this.db?.run(
      `INSERT OR REPLACE INTO feed_allocations
       (id, species, feed_batch_id, target_type, target_id, target_label, date_iso, quantity, unit, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fa.id,
        fa.species,
        fa.feedBatchId,
        fa.targetType,
        fa.targetId || '',
        fa.targetLabel || '',
        fa.dateIso,
        Number.isFinite(Number(fa.quantity)) && Number(fa.quantity) >= 0 ? Number(fa.quantity) : 0,
        fa.unit || 'lbs',
        fa.notes || '',
        fa.createdAt,
        fa.updatedAt,
      ]
    );
  }

  private upsertLedgerEntryRow(le: LedgerEntry): void {
    const safePhoto = le.receiptPhotoDataUrl
      ? sanitizeSafeRasterImageDataUrl(le.receiptPhotoDataUrl) || ''
      : '';
    const safeThumb = le.receiptPhotoThumbnailDataUrl
      ? sanitizeSafeRasterImageDataUrl(le.receiptPhotoThumbnailDataUrl) || safePhoto
      : safePhoto;
    this.db?.run(
      `INSERT OR REPLACE INTO ledger_entries
       (id, species, date_iso, entry_type, category, amount_cents, title, vendor_or_party, linked_animal_id, linked_breeding_id, linked_feed_batch_id, linked_project_id, receipt_photo_data_url, receipt_photo_thumbnail_data_url, receipt_photo_mime_type, receipt_photo_bytes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        le.id,
        le.species,
        le.dateIso || '',
        normalizeLedgerEntryType(le.entryType, 'expense'),
        normalizeLedgerCategory(le.category, 'other'),
        Number.isFinite(Number(le.amountCents)) && Number(le.amountCents) >= 0
          ? Math.round(Number(le.amountCents))
          : 0,
        le.title || '',
        le.vendorOrParty || '',
        le.linkedAnimalId || '',
        le.linkedBreedingId || '',
        le.linkedFeedBatchId || '',
        le.linkedProjectId || '',
        safePhoto,
        safeThumb,
        le.receiptPhotoMimeType || '',
        le.receiptPhotoBytes && le.receiptPhotoBytes > 0 ? Math.round(le.receiptPhotoBytes) : 0,
        le.notes || '',
        le.createdAt,
        le.updatedAt,
      ]
    );
  }

  private upsertProcessingLogRow(pl: ProcessingLog): void {
    this.db?.run(
      `INSERT OR REPLACE INTO processing_logs
       (id, species, title, linked_animal_id, linked_breeding_id, scheduled_date_iso, harvest_date_iso, status, animal_count, live_weight_grams, dressed_weight_grams, dress_out_percent, pelt_count, pelt_grade, pelt_color_notes, processing_cost_cents, meat_value_cents, pelt_value_cents, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pl.id,
        pl.species,
        pl.title || '',
        pl.linkedAnimalId || '',
        pl.linkedBreedingId || '',
        pl.scheduledDateIso || '',
        pl.harvestDateIso || '',
        normalizeProcessingStatus(pl.status, 'Processed'),
        Number.isFinite(Number(pl.animalCount)) && Number(pl.animalCount) >= 1
          ? Math.round(Number(pl.animalCount))
          : 1,
        Number.isFinite(Number(pl.liveWeightGrams)) && Number(pl.liveWeightGrams) >= 0
          ? Math.round(Number(pl.liveWeightGrams))
          : 0,
        Number.isFinite(Number(pl.dressedWeightGrams)) && Number(pl.dressedWeightGrams) >= 0
          ? Math.round(Number(pl.dressedWeightGrams))
          : 0,
        typeof pl.dressOutPercent === 'number' && Number.isFinite(pl.dressOutPercent) && pl.dressOutPercent > 0
          ? pl.dressOutPercent
          : 0,
        Number.isFinite(Number(pl.peltCount)) && Number(pl.peltCount) >= 0
          ? Math.round(Number(pl.peltCount))
          : 0,
        normalizePeltGrade(pl.peltGrade),
        pl.peltColorNotes || '',
        pl.processingCostCents && pl.processingCostCents > 0 ? Math.round(pl.processingCostCents) : 0,
        pl.meatValueCents && pl.meatValueCents > 0 ? Math.round(pl.meatValueCents) : 0,
        pl.peltValueCents && pl.peltValueCents > 0 ? Math.round(pl.peltValueCents) : 0,
        pl.notes || '',
        pl.createdAt,
        pl.updatedAt,
      ]
    );
  }

  private upsertYouthProjectBookRow(yp: YouthProjectBook): void {
    this.db?.run(
      `INSERT OR REPLACE INTO youth_project_books
       (id, species, organization, project_title, member_name, club_or_chapter, leader_or_advisor, project_year, start_date_iso, end_date_iso, status, linked_animal_ids_json, linked_breeding_ids_json, starting_inventory_value_cents, ending_inventory_value_cents, feed_logs_json, goals_and_reflection, show_and_community_notes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        yp.id,
        yp.species,
        normalizeYouthOrgType(yp.organization, '4-H'),
        yp.projectTitle || '',
        yp.memberName || '',
        yp.clubOrChapter || '',
        yp.leaderOrAdvisor || '',
        yp.projectYear || '',
        yp.startDateIso || '',
        yp.endDateIso || '',
        yp.status === 'Completed' ? 'Completed' : 'Active',
        JSON.stringify(Array.isArray(yp.linkedAnimalIds) ? yp.linkedAnimalIds : []),
        JSON.stringify(Array.isArray(yp.linkedBreedingIds) ? yp.linkedBreedingIds : []),
        Number.isFinite(Number(yp.startingInventoryValueCents)) &&
        Number(yp.startingInventoryValueCents) >= 0
          ? Math.round(Number(yp.startingInventoryValueCents))
          : 0,
        Number.isFinite(Number(yp.endingInventoryValueCents)) &&
        Number(yp.endingInventoryValueCents) >= 0
          ? Math.round(Number(yp.endingInventoryValueCents))
          : 0,
        JSON.stringify(normalizeYouthProjectFeedLogs(yp.feedLogs)),
        yp.goalsAndReflection || '',
        yp.showAndCommunityNotes || '',
        yp.notes || '',
        yp.createdAt,
        yp.updatedAt,
      ]
    );
  }

  private upsertClientContactRow(cc: ClientContact): void {
    this.db?.run(
      `INSERT OR REPLACE INTO client_contacts
       (id, species, full_name, ranch_or_herd_name, email, phone, preferred_contact, client_kind, city_state, shipping_address, tags_json, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cc.id,
        cc.species,
        cc.fullName || '',
        cc.ranchOrHerdName || '',
        cc.email || '',
        cc.phone || '',
        normalizePreferredContactMethod(cc.preferredContact, 'sms'),
        normalizeClientKind(cc.clientKind, 'pet_buyer'),
        cc.cityState || '',
        cc.shippingAddress || '',
        JSON.stringify(Array.isArray(cc.tags) ? cc.tags : []),
        cc.notes || '',
        cc.createdAt,
        cc.updatedAt,
      ]
    );
  }

  private upsertWaitlistEntryRow(wl: WaitlistEntry): void {
    const cleanSex =
      wl.preferredSex === 'Male' || wl.preferredSex === 'Female' ? wl.preferredSex : 'Any';
    this.db?.run(
      `INSERT OR REPLACE INTO waitlist_entries
       (id, species, client_id, client_name, priority_rank, status, intent, desired_breed, desired_variety, preferred_sex, preferred_breeding_id, requested_by_date_iso, inquiry_date_iso, follow_up_date_iso, last_contacted_date_iso, max_budget_cents, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wl.id,
        wl.species,
        wl.clientId || '',
        wl.clientName || '',
        Number.isFinite(Number(wl.priorityRank)) && Number(wl.priorityRank) >= 1
          ? Math.round(Number(wl.priorityRank))
          : 1,
        normalizeWaitlistStatus(wl.status, 'Active'),
        normalizeWaitlistIntent(wl.intent, 'Show / Breeding'),
        wl.desiredBreed || '',
        wl.desiredVariety || '',
        cleanSex,
        wl.preferredBreedingId || '',
        wl.requestedByDateIso || '',
        wl.inquiryDateIso || '',
        wl.followUpDateIso || '',
        wl.lastContactedDateIso || '',
        wl.maxBudgetCents && wl.maxBudgetCents > 0 ? Math.round(wl.maxBudgetCents) : 0,
        wl.notes || '',
        wl.createdAt,
        wl.updatedAt,
      ]
    );
  }

  private upsertAnimalReservationRow(ar: AnimalReservation): void {
    this.db?.run(
      `INSERT OR REPLACE INTO animal_reservations
       (id, species, agreement_number, client_id, client_name, waitlist_entry_id, animal_id, breeding_id, pick_order, item_label, status, reserved_date_iso, hold_expires_date_iso, total_price_cents, deposit_required_cents, deposit_paid_cents, deposit_due_date_iso, deposit_paid_date_iso, pickup_scheduled_date_iso, completed_date_iso, balance_reminder_date_iso, payment_method, ledger_entry_id, terms_summary, health_guarantee_notes, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ar.id,
        ar.species,
        ar.agreementNumber || '',
        ar.clientId || '',
        ar.clientName || '',
        ar.waitlistEntryId || '',
        ar.animalId || '',
        ar.breedingId || '',
        ar.pickOrder && ar.pickOrder > 0 ? Math.round(ar.pickOrder) : 0,
        ar.itemLabel || '',
        normalizeReservationStatus(ar.status, 'Pending Deposit'),
        ar.reservedDateIso || '',
        ar.holdExpiresDateIso || '',
        Number.isFinite(Number(ar.totalPriceCents)) && Number(ar.totalPriceCents) >= 0
          ? Math.round(Number(ar.totalPriceCents))
          : 0,
        Number.isFinite(Number(ar.depositRequiredCents)) && Number(ar.depositRequiredCents) >= 0
          ? Math.round(Number(ar.depositRequiredCents))
          : 0,
        Number.isFinite(Number(ar.depositPaidCents)) && Number(ar.depositPaidCents) >= 0
          ? Math.round(Number(ar.depositPaidCents))
          : 0,
        ar.depositDueDateIso || '',
        ar.depositPaidDateIso || '',
        ar.pickupScheduledDateIso || '',
        ar.completedDateIso || '',
        ar.balanceReminderDateIso || '',
        ar.paymentMethod || '',
        ar.ledgerEntryId || '',
        ar.termsSummary || '',
        ar.healthGuaranteeNotes || '',
        ar.notes || '',
        ar.createdAt,
        ar.updatedAt,
      ]
    );
  }

  private upsertWoolHarvestRow(wh: WoolHarvest): void {
    const interval =
      typeof wh.shearingIntervalDays === 'number' &&
      Number.isFinite(wh.shearingIntervalDays) &&
      wh.shearingIntervalDays > 0
        ? Math.round(wh.shearingIntervalDays)
        : 0;
    const staple =
      typeof wh.stapleLengthMm === 'number' &&
      Number.isFinite(wh.stapleLengthMm) &&
      wh.stapleLengthMm > 0
        ? wh.stapleLengthMm
        : 0;
    const scoreJson = wh.iagarbScore
      ? JSON.stringify(normalizeIagarbScorecard(wh.iagarbScore))
      : '{}';
    this.db?.run(
      `INSERT OR REPLACE INTO wool_harvests
       (id, species, animal_id, harvest_date_iso, shearing_interval_days, prime_weight_grams, grade_weight_grams, harvest_method, staple_length_mm, iagarb_score_json, witnessed_by, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wh.id,
        wh.species,
        wh.animalId || '',
        wh.harvestDateIso || '',
        interval,
        Number.isFinite(Number(wh.primeWeightGrams)) && Number(wh.primeWeightGrams) >= 0
          ? Math.round(Number(wh.primeWeightGrams))
          : 0,
        Number.isFinite(Number(wh.gradeWeightGrams)) && Number(wh.gradeWeightGrams) >= 0
          ? Math.round(Number(wh.gradeWeightGrams))
          : 0,
        normalizeWoolHarvestMethod(wh.harvestMethod, 'Shear'),
        staple,
        scoreJson,
        wh.witnessedBy || '',
        wh.notes || '',
        wh.createdAt,
        wh.updatedAt,
      ]
    );
  }

  private async withLockedWrite(reason: string, mutate: () => void): Promise<void> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
      await this.syncFromPersistedStorageIfStaleLocked();
      mutate();
      await this.persistToDiskLocked(undefined, reason);
    });
  }

  async saveSettings(settings: BarnSettings): Promise<void> {
    await this.withLockedWrite('saveSettings', () => {
      if (this.db) {
        this.upsertSettingsRow(settings);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.settings = settings;
      }
    });
  }

  async saveSpeciesProfile(profile: SpeciesProfile): Promise<void> {
    await this.withLockedWrite('saveSpeciesProfile', () => {
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
    });
  }

  async saveSpeciesProfilesBatch(profiles: SpeciesProfile[]): Promise<void> {
    if (profiles.length === 0) return;
    await this.withLockedWrite('saveSpeciesProfilesBatch', () => {
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
    });
  }

  async deleteSpeciesProfile(id: string): Promise<void> {
    await this.withLockedWrite('deleteSpeciesProfile', () => {
      if (this.db) {
        this.db.run('DELETE FROM species_profiles WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.speciesProfiles = this.fallbackSnapshot.speciesProfiles.filter(
          (p) => p.id !== id
        );
      }
    });
  }

  async saveAnimal(animal: Animal): Promise<void> {
    await this.withLockedWrite('saveAnimal', () => {
      if (this.db) {
        this.upsertAnimalRow(animal);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.animals.findIndex((a) => a.id === animal.id);
        if (idx >= 0) this.fallbackSnapshot.animals[idx] = animal;
        else this.fallbackSnapshot.animals.push(animal);
      }
    });
  }

  async saveAnimalsBatch(animals: Animal[]): Promise<void> {
    if (animals.length === 0) return;
    await this.withLockedWrite('saveAnimalsBatch', () => {
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
    });
  }

  async deleteAnimal(id: string): Promise<void> {
    await this.withLockedWrite('deleteAnimal', () => {
      if (this.db) {
        this.db.run('DELETE FROM animals WHERE id = ?', [id]);
        this.db.run('DELETE FROM animal_photos WHERE animal_id = ?', [id]);
        this.db.run('DELETE FROM care_logs WHERE animal_id = ?', [id]);
        this.db.run('DELETE FROM wool_harvests WHERE animal_id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animals = this.fallbackSnapshot.animals.filter((a) => a.id !== id);
        this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
          (p) => p.animalId !== id
        );
        this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter(
          (l) => l.animalId !== id
        );
        this.fallbackSnapshot.woolHarvests = (this.fallbackSnapshot.woolHarvests || []).filter(
          (w) => w.animalId !== id
        );
      }
    });
  }

  async deleteAnimalsBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await this.withLockedWrite('deleteAnimalsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const id of ids) {
            this.db.run('DELETE FROM animals WHERE id = ?', [id]);
            this.db.run('DELETE FROM animal_photos WHERE animal_id = ?', [id]);
            this.db.run('DELETE FROM care_logs WHERE animal_id = ?', [id]);
            this.db.run('DELETE FROM wool_harvests WHERE animal_id = ?', [id]);
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
        this.fallbackSnapshot.woolHarvests = (this.fallbackSnapshot.woolHarvests || []).filter(
          (w) => !idSet.has(w.animalId)
        );
      }
    });
  }

  async saveAnimalPhoto(photo: AnimalPhoto): Promise<void> {
    await this.withLockedWrite('saveAnimalPhoto', () => {
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
    });
  }

  async saveAnimalPhotosBatch(photos: AnimalPhoto[]): Promise<void> {
    if (photos.length === 0) return;
    await this.withLockedWrite('saveAnimalPhotosBatch', () => {
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
    });
  }

  async deleteAnimalPhoto(id: string): Promise<void> {
    await this.withLockedWrite('deleteAnimalPhoto', () => {
      if (this.db) {
        this.db.run('DELETE FROM animal_photos WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animalPhotos = (this.fallbackSnapshot.animalPhotos || []).filter(
          (p) => p.id !== id
        );
      }
    });
  }

  async saveCage(cage: CageLocation): Promise<void> {
    await this.withLockedWrite('saveCage', () => {
      if (this.db) {
        this.upsertCageRow(cage);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.cages.findIndex((c) => c.id === cage.id);
        if (idx >= 0) this.fallbackSnapshot.cages[idx] = cage;
        else this.fallbackSnapshot.cages.push(cage);
      }
    });
  }

  async deleteCage(id: string): Promise<void> {
    await this.withLockedWrite('deleteCage', () => {
      if (this.db) {
        this.db.run('DELETE FROM cages WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.cages = this.fallbackSnapshot.cages.filter((c) => c.id !== id);
      }
    });
  }

  async saveBreeding(breeding: BreedingRecord): Promise<void> {
    await this.withLockedWrite('saveBreeding', () => {
      if (this.db) {
        this.upsertBreedingRow(breeding);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.breedings.findIndex((b) => b.id === breeding.id);
        if (idx >= 0) this.fallbackSnapshot.breedings[idx] = breeding;
        else this.fallbackSnapshot.breedings.push(breeding);
      }
    });
  }

  async deleteBreeding(id: string): Promise<void> {
    await this.withLockedWrite('deleteBreeding', () => {
      if (this.db) {
        this.db.run('DELETE FROM breedings WHERE id = ?', [id]);
        this.db.run('DELETE FROM barn_tasks WHERE linked_breeding_id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.breedings = this.fallbackSnapshot.breedings.filter((b) => b.id !== id);
        this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter(
          (t) => t.linkedBreedingId !== id
        );
      }
    });
  }

  async saveTask(task: BarnTask): Promise<void> {
    await this.withLockedWrite('saveTask', () => {
      if (this.db) {
        this.upsertTaskRow(task);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.tasks.findIndex((t) => t.id === task.id);
        if (idx >= 0) this.fallbackSnapshot.tasks[idx] = task;
        else this.fallbackSnapshot.tasks.push(task);
      }
    });
  }

  async saveTasksBatch(tasks: BarnTask[]): Promise<void> {
    if (tasks.length === 0) return;
    await this.withLockedWrite('saveTasksBatch', () => {
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
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.withLockedWrite('deleteTask', () => {
      if (this.db) {
        this.db.run('DELETE FROM barn_tasks WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.tasks = this.fallbackSnapshot.tasks.filter((t) => t.id !== id);
      }
    });
  }

  async deleteTasksBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    await this.withLockedWrite('deleteTasksBatch', () => {
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
    });
  }

  async saveCareLog(log: CareLog): Promise<void> {
    await this.withLockedWrite('saveCareLog', () => {
      if (this.db) {
        this.upsertCareLogRow(log);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.careLogs.findIndex((l) => l.id === log.id);
        if (idx >= 0) this.fallbackSnapshot.careLogs[idx] = log;
        else this.fallbackSnapshot.careLogs.push(log);
      }
    });
  }

  async saveCareLogsBatch(logs: CareLog[]): Promise<void> {
    if (logs.length === 0) return;
    await this.withLockedWrite('saveCareLogsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const log of logs) this.upsertCareLogRow(log);
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
        for (const log of logs) {
          const idx = this.fallbackSnapshot.careLogs.findIndex((l) => l.id === log.id);
          if (idx >= 0) this.fallbackSnapshot.careLogs[idx] = log;
          else this.fallbackSnapshot.careLogs.push(log);
        }
      }
    });
  }

  async deleteCareLog(id: string): Promise<void> {
    await this.withLockedWrite('deleteCareLog', () => {
      if (this.db) {
        this.db.run('DELETE FROM care_logs WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.careLogs = this.fallbackSnapshot.careLogs.filter((l) => l.id !== id);
      }
    });
  }

  async saveShow(show: ShowEvent): Promise<void> {
    await this.withLockedWrite('saveShow', () => {
      if (this.db) {
        this.upsertShowRow(show);
      } else if (this.fallbackSnapshot) {
        const idx = this.fallbackSnapshot.shows.findIndex((s) => s.id === show.id);
        if (idx >= 0) this.fallbackSnapshot.shows[idx] = show;
        else this.fallbackSnapshot.shows.push(show);
      }
    });
  }

  async deleteShow(id: string): Promise<void> {
    await this.withLockedWrite('deleteShow', () => {
      if (this.db) {
        this.db.run('DELETE FROM shows WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.shows = this.fallbackSnapshot.shows.filter((s) => s.id !== id);
      }
    });
  }

  async saveFeedBatch(batch: FeedBatch): Promise<void> {
    await this.withLockedWrite('saveFeedBatch', () => {
      if (this.db) {
        this.upsertFeedBatchRow(batch);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.feedBatches ?? [];
        const idx = list.findIndex((f) => f.id === batch.id);
        if (idx >= 0) list[idx] = batch;
        else list.push(batch);
        this.fallbackSnapshot.feedBatches = list;
      }
    });
  }

  async saveFeedBatchesBatch(batches: FeedBatch[]): Promise<void> {
    if (batches.length === 0) return;
    await this.withLockedWrite('saveFeedBatchesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const b of batches) this.upsertFeedBatchRow(b);
          this.db.run('COMMIT;');
        } catch (e) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw e;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.feedBatches ?? [];
        for (const b of batches) {
          const idx = list.findIndex((x) => x.id === b.id);
          if (idx >= 0) list[idx] = b;
          else list.push(b);
        }
        this.fallbackSnapshot.feedBatches = list;
      }
    });
  }

  async deleteFeedBatch(id: string): Promise<void> {
    await this.withLockedWrite('deleteFeedBatch', () => {
      if (this.db) {
        this.db.run('DELETE FROM feed_batches WHERE id = ?', [id]);
        this.db.run('DELETE FROM feed_allocations WHERE feed_batch_id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.feedBatches = (this.fallbackSnapshot.feedBatches ?? []).filter(
          (f) => f.id !== id
        );
        this.fallbackSnapshot.feedAllocations = (this.fallbackSnapshot.feedAllocations ?? []).filter(
          (fa) => fa.feedBatchId !== id
        );
      }
    });
  }

  async saveFeedAllocation(allocation: FeedAllocation): Promise<void> {
    await this.withLockedWrite('saveFeedAllocation', () => {
      if (this.db) {
        this.upsertFeedAllocationRow(allocation);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.feedAllocations ?? [];
        const idx = list.findIndex((a) => a.id === allocation.id);
        if (idx >= 0) list[idx] = allocation;
        else list.push(allocation);
        this.fallbackSnapshot.feedAllocations = list;
      }
    });
  }

  async deleteFeedAllocation(id: string): Promise<void> {
    await this.withLockedWrite('deleteFeedAllocation', () => {
      if (this.db) {
        this.db.run('DELETE FROM feed_allocations WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.feedAllocations = (this.fallbackSnapshot.feedAllocations ?? []).filter(
          (fa) => fa.id !== id
        );
      }
    });
  }

  async saveLedgerEntry(entry: LedgerEntry): Promise<void> {
    await this.withLockedWrite('saveLedgerEntry', () => {
      if (this.db) {
        this.upsertLedgerEntryRow(entry);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.ledgerEntries ?? [];
        const idx = list.findIndex((x) => x.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        this.fallbackSnapshot.ledgerEntries = list;
      }
    });
  }

  async saveLedgerEntriesBatch(entries: LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.withLockedWrite('saveLedgerEntriesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const e of entries) this.upsertLedgerEntryRow(e);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.ledgerEntries ?? [];
        for (const e of entries) {
          const idx = list.findIndex((x) => x.id === e.id);
          if (idx >= 0) list[idx] = e;
          else list.push(e);
        }
        this.fallbackSnapshot.ledgerEntries = list;
      }
    });
  }

  async deleteLedgerEntry(id: string): Promise<void> {
    await this.withLockedWrite('deleteLedgerEntry', () => {
      if (this.db) {
        this.db.run('DELETE FROM ledger_entries WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.ledgerEntries = (this.fallbackSnapshot.ledgerEntries ?? []).filter(
          (x) => x.id !== id
        );
      }
    });
  }

  async saveProcessingLog(log: ProcessingLog): Promise<void> {
    await this.withLockedWrite('saveProcessingLog', () => {
      if (this.db) {
        this.upsertProcessingLogRow(log);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.processingLogs ?? [];
        const idx = list.findIndex((x) => x.id === log.id);
        if (idx >= 0) list[idx] = log;
        else list.push(log);
        this.fallbackSnapshot.processingLogs = list;
      }
    });
  }

  async saveProcessingLogsBatch(logs: ProcessingLog[]): Promise<void> {
    if (logs.length === 0) return;
    await this.withLockedWrite('saveProcessingLogsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const l of logs) this.upsertProcessingLogRow(l);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.processingLogs ?? [];
        for (const l of logs) {
          const idx = list.findIndex((x) => x.id === l.id);
          if (idx >= 0) list[idx] = l;
          else list.push(l);
        }
        this.fallbackSnapshot.processingLogs = list;
      }
    });
  }

  async deleteProcessingLog(id: string): Promise<void> {
    await this.withLockedWrite('deleteProcessingLog', () => {
      if (this.db) {
        this.db.run('DELETE FROM processing_logs WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.processingLogs = (this.fallbackSnapshot.processingLogs ?? []).filter(
          (x) => x.id !== id
        );
      }
    });
  }

  async saveYouthProjectBook(project: YouthProjectBook): Promise<void> {
    await this.withLockedWrite('saveYouthProjectBook', () => {
      if (this.db) {
        this.upsertYouthProjectBookRow(project);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.youthProjectBooks ?? [];
        const idx = list.findIndex((x) => x.id === project.id);
        if (idx >= 0) list[idx] = project;
        else list.push(project);
        this.fallbackSnapshot.youthProjectBooks = list;
      }
    });
  }

  async saveYouthProjectBooksBatch(projects: YouthProjectBook[]): Promise<void> {
    if (projects.length === 0) return;
    await this.withLockedWrite('saveYouthProjectBooksBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const yp of projects) this.upsertYouthProjectBookRow(yp);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.youthProjectBooks ?? [];
        for (const yp of projects) {
          const idx = list.findIndex((x) => x.id === yp.id);
          if (idx >= 0) list[idx] = yp;
          else list.push(yp);
        }
        this.fallbackSnapshot.youthProjectBooks = list;
      }
    });
  }

  async deleteYouthProjectBook(id: string): Promise<void> {
    await this.withLockedWrite('deleteYouthProjectBook', () => {
      if (this.db) {
        this.db.run('DELETE FROM youth_project_books WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.youthProjectBooks = (
          this.fallbackSnapshot.youthProjectBooks ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveClientContact(client: ClientContact): Promise<void> {
    await this.withLockedWrite('saveClientContact', () => {
      if (this.db) {
        this.upsertClientContactRow(client);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.clientContacts ?? [];
        const idx = list.findIndex((x) => x.id === client.id);
        if (idx >= 0) list[idx] = client;
        else list.push(client);
        this.fallbackSnapshot.clientContacts = list;
      }
    });
  }

  async saveClientContactsBatch(clients: ClientContact[]): Promise<void> {
    if (clients.length === 0) return;
    await this.withLockedWrite('saveClientContactsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const cc of clients) this.upsertClientContactRow(cc);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.clientContacts ?? [];
        for (const cc of clients) {
          const idx = list.findIndex((x) => x.id === cc.id);
          if (idx >= 0) list[idx] = cc;
          else list.push(cc);
        }
        this.fallbackSnapshot.clientContacts = list;
      }
    });
  }

  async deleteClientContact(id: string): Promise<void> {
    await this.withLockedWrite('deleteClientContact', () => {
      if (this.db) {
        this.db.run('DELETE FROM client_contacts WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.clientContacts = (
          this.fallbackSnapshot.clientContacts ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveWaitlistEntry(entry: WaitlistEntry): Promise<void> {
    await this.withLockedWrite('saveWaitlistEntry', () => {
      if (this.db) {
        this.upsertWaitlistEntryRow(entry);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.waitlistEntries ?? [];
        const idx = list.findIndex((x) => x.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        this.fallbackSnapshot.waitlistEntries = list;
      }
    });
  }

  async saveWaitlistEntriesBatch(entries: WaitlistEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.withLockedWrite('saveWaitlistEntriesBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const wl of entries) this.upsertWaitlistEntryRow(wl);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.waitlistEntries ?? [];
        for (const wl of entries) {
          const idx = list.findIndex((x) => x.id === wl.id);
          if (idx >= 0) list[idx] = wl;
          else list.push(wl);
        }
        this.fallbackSnapshot.waitlistEntries = list;
      }
    });
  }

  async deleteWaitlistEntry(id: string): Promise<void> {
    await this.withLockedWrite('deleteWaitlistEntry', () => {
      if (this.db) {
        this.db.run('DELETE FROM waitlist_entries WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.waitlistEntries = (
          this.fallbackSnapshot.waitlistEntries ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveAnimalReservation(reservation: AnimalReservation): Promise<void> {
    await this.withLockedWrite('saveAnimalReservation', () => {
      if (this.db) {
        this.upsertAnimalReservationRow(reservation);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.animalReservations ?? [];
        const idx = list.findIndex((x) => x.id === reservation.id);
        if (idx >= 0) list[idx] = reservation;
        else list.push(reservation);
        this.fallbackSnapshot.animalReservations = list;
      }
    });
  }

  async saveAnimalReservationsBatch(reservations: AnimalReservation[]): Promise<void> {
    if (reservations.length === 0) return;
    await this.withLockedWrite('saveAnimalReservationsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const ar of reservations) this.upsertAnimalReservationRow(ar);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.animalReservations ?? [];
        for (const ar of reservations) {
          const idx = list.findIndex((x) => x.id === ar.id);
          if (idx >= 0) list[idx] = ar;
          else list.push(ar);
        }
        this.fallbackSnapshot.animalReservations = list;
      }
    });
  }

  async deleteAnimalReservation(id: string): Promise<void> {
    await this.withLockedWrite('deleteAnimalReservation', () => {
      if (this.db) {
        this.db.run('DELETE FROM animal_reservations WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.animalReservations = (
          this.fallbackSnapshot.animalReservations ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async saveWoolHarvest(harvest: WoolHarvest): Promise<void> {
    await this.withLockedWrite('saveWoolHarvest', () => {
      if (this.db) {
        this.upsertWoolHarvestRow(harvest);
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.woolHarvests ?? [];
        const idx = list.findIndex((x) => x.id === harvest.id);
        if (idx >= 0) list[idx] = harvest;
        else list.push(harvest);
        this.fallbackSnapshot.woolHarvests = list;
      }
    });
  }

  async saveWoolHarvestsBatch(harvests: WoolHarvest[]): Promise<void> {
    if (harvests.length === 0) return;
    await this.withLockedWrite('saveWoolHarvestsBatch', () => {
      if (this.db) {
        this.db.run('BEGIN TRANSACTION;');
        try {
          for (const wh of harvests) this.upsertWoolHarvestRow(wh);
          this.db.run('COMMIT;');
        } catch (err) {
          try {
            this.db.run('ROLLBACK;');
          } catch {
            // Ignore rollback error
          }
          throw err;
        }
      } else if (this.fallbackSnapshot) {
        const list = this.fallbackSnapshot.woolHarvests ?? [];
        for (const wh of harvests) {
          const idx = list.findIndex((x) => x.id === wh.id);
          if (idx >= 0) list[idx] = wh;
          else list.push(wh);
        }
        this.fallbackSnapshot.woolHarvests = list;
      }
    });
  }

  async deleteWoolHarvest(id: string): Promise<void> {
    await this.withLockedWrite('deleteWoolHarvest', () => {
      if (this.db) {
        this.db.run('DELETE FROM wool_harvests WHERE id = ?', [id]);
      } else if (this.fallbackSnapshot) {
        this.fallbackSnapshot.woolHarvests = (
          this.fallbackSnapshot.woolHarvests ?? []
        ).filter((x) => x.id !== id);
      }
    });
  }

  async exportRawSqliteBytes(): Promise<Uint8Array | null> {
    await this.syncFromPersistedStorageIfStale();
    if (!this.db) return null;
    return this.db.export();
  }

  async inspectRawSqliteBytes(
    bytes: Uint8Array,
    options?: SnapshotLoadOptions
  ): Promise<BarnDatabaseSnapshot> {
    const headerCheck = validateSqliteFileHeader(bytes);
    if (!headerCheck.ok) {
      throw new Error(headerCheck.error);
    }
    if (!this.SQL) {
      this.SQL = await initSqlJs(createSqlJsInitConfig());
    }
    if (!this.SQL) {
      throw new Error('SQLite WebAssembly engine is not available in this browser.');
    }
    const tempDb = new this.SQL.Database(bytes);
    try {
      applySchemaMigrations(tempDb);
      return this.readSnapshotFromDatabase(tempDb, options);
    } finally {
      try {
        tempDb.close();
      } catch {
        // Ignore close error on inspection database
      }
    }
  }

  async importRawSqliteBytes(
    bytes: Uint8Array,
    options?: SnapshotLoadOptions
  ): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
      if (!this.SQL) {
        this.SQL = await initSqlJs(createSqlJsInitConfig());
      }
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
        try {
          this.db.close();
        } catch {
          // Ignore close error on superseded DB
        }
      }
      this.db = importedDb;
      this.fallbackSnapshot = null;
      await this.persistToDiskLocked(undefined, 'importRawSqliteBytes');
      return this.loadSnapshotUnlocked(options);
    });
  }

  async resetConnection(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
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
      this.loadedEpoch = 0;
      try {
        await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
      } catch {
        // Ignore fallback delete failure
      }
      return this.initializeLocked(options);
    });
  }

  async rebuildCleanDatabase(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot> {
    return withCrossTabLock(DB_WRITE_LOCK_NAME, async () => {
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
      this.loadedEpoch = 0;
      await idbDelete(IDB_PRIMARY_KEY);
      await idbDelete(IDB_FALLBACK_SNAPSHOT_KEY);
      return this.initializeLocked({ ...options, allowSeedFresh: options?.allowSeedFresh ?? true });
    });
  }
}
