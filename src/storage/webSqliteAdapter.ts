/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
  nowIsoUtc,
  ShowEvent,
  SpeciesProfile,
} from '../core/models';
import { buildFullPredefinedSampleSnapshot } from '../core/sampleData';
import { sanitizeSpeciesMemo } from '../core/speciesMemo';
import { isMemoryLikeError, logDiagnosticEvent } from './crashLogger';
import { StorageAdapter } from './storageAdapter';
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

/**
 * Canonical SQLite DDL shared 1:1 with future `expo-sqlite` native adapter.
 */
export const PEDIGREE_SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS barn_settings (
    id TEXT PRIMARY KEY NOT NULL,
    barn_name TEXT NOT NULL,
    breeder_name TEXT NOT NULL,
    preferred_unit TEXT NOT NULL,
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
    memo_text TEXT NOT NULL DEFAULT '',
    memo_updated_at TEXT NOT NULL DEFAULT '',
    gestation_days INTEGER NOT NULL,
    rebreed_days_after_birth INTEGER NOT NULL,
    wean_days_after_birth INTEGER NOT NULL,
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
    birth_date_iso TEXT NOT NULL,
    weight_grams INTEGER NOT NULL,
    genotype_json TEXT NOT NULL,
    genotype_raw TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    grand_champion_number TEXT NOT NULL,
    legs_count INTEGER NOT NULL,
    cage_location TEXT NOT NULL,
    breeder_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    sire_id TEXT NOT NULL,
    dam_id TEXT NOT NULL,
    notes TEXT NOT NULL,
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

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
    'ALTER TABLE species_profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;',
    "ALTER TABLE species_profiles ADD COLUMN default_animal_prefix TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN memo_text TEXT NOT NULL DEFAULT '';",
    "ALTER TABLE species_profiles ADD COLUMN memo_updated_at TEXT NOT NULL DEFAULT '';",
    'ALTER TABLE animals ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;',
    'ALTER TABLE animals ADD COLUMN needs_attention INTEGER NOT NULL DEFAULT 0;',
  ];
  for (const stmt of alterStatements) {
    try {
      db.run(stmt);
    } catch {
      // Column already exists
    }
  }
}

export class WebSqliteAdapter implements StorageAdapter {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private fallbackSnapshot: BarnDatabaseSnapshot | null = null;
  private lastRollingSaveMs = 0;

  get engineName(): string {
    return this.db ? 'Local SQLite (WASM + IndexedDB)' : 'Local IndexedDB Store';
  }

  async initialize(): Promise<BarnDatabaseSnapshot> {
    try {
      this.SQL = await initSqlJs({
        locateFile: () => sqlWasmUrl,
        useOldExtensionFunctions: false,
      });

      const savedBytes = await idbGet<Uint8Array>(IDB_PRIMARY_KEY);
      if (savedBytes && savedBytes.byteLength > 0) {
        this.db = new this.SQL.Database(savedBytes);
        applySchemaMigrations(this.db);
        const snap = await this.loadSnapshot();
        if (snap.speciesProfiles.length === 0 && snap.animals.length === 0) {
          const seeded = buildFullPredefinedSampleSnapshot();
          await this.replaceSnapshot(seeded);
          return seeded;
        }
        return snap;
      } else {
        this.db = new this.SQL.Database();
        applySchemaMigrations(this.db);
        const seeded = buildFullPredefinedSampleSnapshot();
        await this.replaceSnapshot(seeded);
        return seeded;
      }
    } catch (err) {
      console.warn('WASM SQLite fallback to IndexedDB JSON / Rolling Snapshot:', err);
      logDiagnosticEvent({
        level: 'error',
        category: isMemoryLikeError(err) ? 'memory' : 'storage',
        message: 'Primary SQLite load failed — attempting non-destructive recovery from fallback/rolling backup',
        error: err,
      });

      const saved = await idbGet<BarnDatabaseSnapshot>(IDB_FALLBACK_SNAPSHOT_KEY).catch(
        () => undefined
      );
      if (saved && (saved.animals.length > 0 || saved.speciesProfiles.length > 0)) {
        this.fallbackSnapshot = saved;
        return saved;
      }

      // Recover from newest local rolling snapshot before ever resetting to starter data
      try {
        const rollingList = await listRollingSnapshotBackups();
        for (const item of rollingList) {
          const recovered = await loadRollingSnapshotBackup(item.key);
          if (recovered) {
            this.fallbackSnapshot = recovered;
            logDiagnosticEvent({
              level: 'warn',
              category: 'storage',
              message: `Auto-recovered ${recovered.animals.length} animals from rolling backup "${item.key}" (${item.savedAtIso})`,
            });
            return recovered;
          }
        }
      } catch {
        // Ignore rolling recovery error and fall through safely
      }

      const seeded = buildFullPredefinedSampleSnapshot();
      this.fallbackSnapshot = seeded;
      try {
        await idbSet(IDB_FALLBACK_SNAPSHOT_KEY, seeded);
      } catch {
        // Keep in-memory fallback even if quota is full
      }
      return seeded;
    }
  }

  private async persistToDisk(): Promise<void> {
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
      const snap = await this.loadSnapshot();
      void saveRollingSnapshotBackup(snap);
      if (this.db) {
        void idbSet(IDB_FALLBACK_SNAPSHOT_KEY, snap).catch(() => {});
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

  async loadSnapshot(): Promise<BarnDatabaseSnapshot> {
    if (!this.db) {
      return this.fallbackSnapshot ?? buildFullPredefinedSampleSnapshot();
    }

    const settingsRows = this.queryObjects('SELECT * FROM barn_settings LIMIT 1');
    const sRow = settingsRows[0];
    let extraSettings: Record<string, any> = {};
    try {
      if (sRow?.extra_settings_json) {
        extraSettings = JSON.parse(String(sRow.extra_settings_json)) || {};
      }
    } catch {
      extraSettings = {};
    }
    const rawGen = Number(sRow?.default_generations);
    const parsedGen: 3 | 4 | 5 | 6 =
      rawGen === 4 || rawGen === 5 || rawGen === 6 ? rawGen : 3;

    const settings: BarnSettings = sRow
      ? {
          id: String(sRow.id),
          barnName: String(sRow.barn_name),
          breederName: String(sRow.breeder_name),
          preferredUnit: (sRow.preferred_unit as any) || 'lbs_oz',
          defaultSpecies: String(sRow.default_species || 'Rabbit'),
          pinnedLandingSpecies: String(sRow.pinned_landing_species ?? ''),
          defaultGenerations: parsedGen,
          themeMode: sRow.theme_mode === 'dark' ? 'dark' : 'light',
          customColors: sRow.custom_colors_json
            ? JSON.parse(String(sRow.custom_colors_json))
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
          ignoredTaskIds: Array.isArray(extraSettings.ignoredTaskIds)
            ? extraSettings.ignoredTaskIds
            : [],
          dismissedTaskGroupKeys:
            extraSettings.dismissedTaskGroupKeys &&
            typeof extraSettings.dismissedTaskGroupKeys === 'object'
              ? extraSettings.dismissedTaskGroupKeys
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
            typeof extraSettings.backupReminderSnoozedUntilMs === 'number'
              ? extraSettings.backupReminderSnoozedUntilMs
              : undefined,
          updatedAt: String(sRow.updated_at || nowIsoUtc()),
        }
      : {
          id: 'barn_settings',
          barnName: 'Copper Creek Barn',
          breederName: '',
          preferredUnit: 'lbs_oz',
          defaultSpecies: 'Rabbit',
          pinnedLandingSpecies: '',
          defaultGenerations: 3,
          themeMode: 'dark',
          imageOptimizationPreset: 'balanced',
          showHomeSummaryGrid: true,
          barnNameOnboarded: false,
          ignoredTaskIds: [],
          dismissedTaskGroupKeys: {},
          speciesHubBlockOrder: {},
          includePhotoOnPedigree: false,
          calendarSync: { ...DEFAULT_CALENDAR_SYNC_SETTINGS },
          updatedAt: nowIsoUtc(),
        };

    const speciesProfiles: SpeciesProfile[] = this.queryObjects(
      'SELECT * FROM species_profiles ORDER BY sort_order ASC, name ASC'
    ).map((r, idx) => ({
      id: String(r.id),
      name: String(r.name),
      sortOrder: typeof r.sort_order === 'number' ? Number(r.sort_order) : idx,
      defaultAnimalPrefix: String(r.default_animal_prefix || ''),
      memoText: sanitizeSpeciesMemo(r.memo_text ?? ''),
      memoUpdatedAt: String(r.memo_updated_at || ''),
      gestationDays: Number(r.gestation_days),
      rebreedDaysAfterBirth: Number(r.rebreed_days_after_birth),
      weanDaysAfterBirth: Number(r.wean_days_after_birth),
      birthEventLabel: String(r.birth_event_label),
      maleLabel: String(r.male_label),
      femaleLabel: String(r.female_label),
      offspringLabel: String(r.offspring_label),
      exampleBreeds: JSON.parse(String(r.example_breeds_json || '[]')),
      milestones: JSON.parse(String(r.milestones_json || '[]')),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const animals: Animal[] = this.queryObjects('SELECT * FROM animals ORDER BY name ASC').map(
      (r) => ({
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
        birthDateIso: String(r.birth_date_iso),
        weightGrams: Number(r.weight_grams),
        genotype: JSON.parse(String(r.genotype_json || '[]')),
        genotypeRaw: String(r.genotype_raw),
        registrationNumber: String(r.registration_number),
        grandChampionNumber: String(r.grand_champion_number),
        legsCount: Number(r.legs_count),
        cageLocation: String(r.cage_location),
        breederName: String(r.breeder_name),
        ownerName: String(r.owner_name),
        sireId: String(r.sire_id),
        damId: String(r.dam_id),
        notes: String(r.notes),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      })
    );

    const animalPhotos: AnimalPhoto[] = this.queryObjects(
      'SELECT * FROM animal_photos ORDER BY is_primary DESC, sort_order ASC, created_at ASC'
    ).map((r) => ({
      id: String(r.id),
      species: String(r.species),
      animalId: String(r.animal_id),
      isPrimary: Number(r.is_primary) === 1,
      sortOrder: Number(r.sort_order) || 0,
      caption: String(r.caption || ''),
      originalFileName: String(r.original_file_name || ''),
      mimeType: String(r.mime_type || 'image/webp'),
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
      originalBytes: Number(r.original_bytes) || 0,
      storedBytes: Number(r.stored_bytes) || 0,
      thumbnailDataUrl: String(r.thumbnail_data_url || r.data_url || ''),
      dataUrl: String(r.data_url || ''),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

    const cages: CageLocation[] = this.queryObjects('SELECT * FROM cages ORDER BY label ASC').map(
      (r) => ({
        id: String(r.id),
        species: String(r.species),
        label: String(r.label),
        section: String(r.section),
        capacity: Number(r.capacity),
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
      projectedCoiPercent: Number(r.projected_coi_percent),
      liveCount: Number(r.live_count),
      stillbornCount: Number(r.stillborn_count),
      fosteredCount: Number(r.fostered_count),
      weanedCount: Number(r.weaned_count),
      offspringCreated: Number(r.offspring_created) === 1,
      status: (r.status as any) || 'Bred',
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
      weightGrams: Number(r.weight_grams),
      showLegEarned: Number(r.show_leg_earned) === 1,
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
      enteredAnimalIds: JSON.parse(String(r.entered_animal_ids_json || '[]')),
      notes: String(r.notes),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));

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

  async replaceSnapshot(snapshot: BarnDatabaseSnapshot): Promise<void> {
    if (!this.db) {
      this.fallbackSnapshot = snapshot;
      await this.persistToDisk();
      return;
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
      for (const p of snapshot.animalPhotos ?? []) this.upsertAnimalPhotoRow(p);
      for (const c of snapshot.cages) this.upsertCageRow(c);
      for (const b of snapshot.breedings) this.upsertBreedingRow(b);
      for (const t of snapshot.tasks) this.upsertTaskRow(t);
      for (const l of snapshot.careLogs) this.upsertCareLogRow(l);
      for (const s of snapshot.shows) this.upsertShowRow(s);

      this.db.run('COMMIT;');
    } catch (e) {
      this.db.run('ROLLBACK;');
      throw e;
    }

    await this.persistToDisk();
  }

  private upsertSettingsRow(s: BarnSettings): void {
    const extraJson = JSON.stringify({
      showHomeSummaryGrid: s.showHomeSummaryGrid ?? true,
      barnNameOnboarded: s.barnNameOnboarded ?? false,
      ignoredTaskIds: s.ignoredTaskIds ?? [],
      dismissedTaskGroupKeys: s.dismissedTaskGroupKeys ?? {},
      speciesHubBlockOrder: s.speciesHubBlockOrder ?? {},
      includePhotoOnPedigree: s.includePhotoOnPedigree ?? false,
      calendarSync: s.calendarSync ? normalizeCalendarSyncSettings(s.calendarSync) : undefined,
      lastBackupMeta: s.lastBackupMeta ?? undefined,
      backupReminderSnoozedUntilMs: s.backupReminderSnoozedUntilMs ?? undefined,
    });
    this.db?.run(
      `INSERT OR REPLACE INTO barn_settings
       (id, barn_name, breeder_name, preferred_unit, default_species, pinned_landing_species, default_generations, theme_mode, custom_colors_json, image_optimization_preset, extra_settings_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id || 'barn_settings',
        s.barnName,
        s.breederName,
        s.preferredUnit,
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
       (id, name, sort_order, default_animal_prefix, memo_text, memo_updated_at, gestation_days, rebreed_days_after_birth, wean_days_after_birth, birth_event_label, male_label, female_label, offspring_label, example_breeds_json, milestones_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sp.id,
        sp.name,
        sp.sortOrder ?? 0,
        sp.defaultAnimalPrefix || '',
        sanitizeSpeciesMemo(sp.memoText ?? ''),
        String(sp.memoUpdatedAt || ''),
        sp.gestationDays,
        sp.rebreedDaysAfterBirth,
        sp.weanDaysAfterBirth,
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
    this.db?.run(
      `INSERT OR REPLACE INTO animals
       (id, tattoo, name, species, breed, variety, sex, status, archived, needs_attention, birth_date_iso, weight_grams, genotype_json, genotype_raw, registration_number, grand_champion_number, legs_count, cage_location, breeder_name, owner_name, sire_id, dam_id, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        a.birthDateIso,
        a.weightGrams,
        JSON.stringify(a.genotype),
        a.genotypeRaw,
        a.registrationNumber,
        a.grandChampionNumber,
        a.legsCount,
        a.cageLocation,
        a.breederName,
        a.ownerName,
        a.sireId,
        a.damId,
        a.notes,
        a.createdAt,
        a.updatedAt,
      ]
    );
  }

  private upsertAnimalPhotoRow(p: AnimalPhoto): void {
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
        p.dataUrl,
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
       (id, species, sire_id, dam_id, sire_name, dam_name, bred_date_iso, expected_due_date_iso, actual_birth_date_iso, projected_coi_percent, live_count, stillborn_count, fostered_count, weaned_count, offspring_created, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
       (id, species, animal_id, date_iso, type, title, weight_grams, show_leg_earned, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.id,
        l.species,
        l.animalId,
        l.dateIso,
        l.type,
        l.title,
        l.weightGrams,
        l.showLegEarned ? 1 : 0,
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
        this.db.run('ROLLBACK;');
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
        this.db.run('ROLLBACK;');
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
        this.db.run('ROLLBACK;');
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
      if (idx >= 0) list[idx] = photo;
      else list.push(photo);
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
        this.db.run('ROLLBACK;');
        throw e;
      }
    } else if (this.fallbackSnapshot) {
      const list = this.fallbackSnapshot.animalPhotos || [];
      for (const p of photos) {
        const idx = list.findIndex((x) => x.id === p.id);
        if (idx >= 0) list[idx] = p;
        else list.push(p);
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
        this.db.run('ROLLBACK;');
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
        this.db.run('ROLLBACK;');
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

  async importRawSqliteBytes(bytes: Uint8Array): Promise<BarnDatabaseSnapshot> {
    if (!this.SQL) {
      throw new Error('SQLite WebAssembly engine is not available in this browser.');
    }
    const importedDb = new this.SQL.Database(bytes);
    applySchemaMigrations(importedDb);
    if (this.db) {
      this.db.close();
    }
    this.db = importedDb;
    await this.persistToDisk();
    return this.loadSnapshot();
  }

  async resetConnection(): Promise<BarnDatabaseSnapshot> {
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
    return this.initialize();
  }

  async rebuildCleanDatabase(): Promise<BarnDatabaseSnapshot> {
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
    return this.initialize();
  }
}
