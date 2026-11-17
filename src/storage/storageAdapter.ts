/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pluggable Cross-Platform Storage Adapter Interface.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * All UI screens and hooks communicate exclusively with `StorageAdapter`.
 * - On Web / PWA: Implemented by `WebSqliteAdapter` (`sql.js` WASM SQLite persisted in IndexedDB).
 * - On Android / iOS (Expo): Swap in `ExpoSqliteAdapter` (`expo-sqlite`) using the exact same SQL schema.
 */

import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ShowEvent,
  SpeciesProfile,
} from '../core/models';
import type { WipedStorageRecoveryContext } from './opfsStorage';

export interface SnapshotLoadOptions {
  /**
   * When true, omits heavy full-resolution `dataUrl` image payloads from the returned
   * snapshot (retaining `thumbnailDataUrl` previews and `storedBytes`) so list/grid views
   * stay lightweight in JS memory. Full-resolution images are loaded on demand.
   */
  lightweightPhotos?: boolean;
  /**
   * When true, allows initializing/seeding starter sample data even if returning-user
   * evidence (prior-use sentinel or OPFS backups) exists.
   */
  allowSeedFresh?: boolean;
}

export interface StorageAdapter {
  /** Human-readable description of the active local storage engine (e.g., `"SQLite WASM + IndexedDB"`). */
  readonly engineName: string;

  /** Initializes tables and seeds starter multi-species sample data on first launch if empty. */
  initialize(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Reads the complete current database snapshot from local storage. */
  loadSnapshot(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Loads the full-resolution base64 `dataUrl` for a single photo on demand. */
  loadAnimalPhotoDataUrl?(photoId: string): Promise<string | null>;

  /** Loads full-resolution `dataUrl` strings for specific photo IDs (or all photos if omitted). */
  loadAnimalPhotoDataUrlsBatch?(photoIds?: string[]): Promise<Record<string, string>>;

  /** Replaces the entire local database with a new snapshot (used for Backup Import / Merge / Seed). */
  replaceSnapshot(snapshot: BarnDatabaseSnapshot): Promise<void>;

  /** Persists global BarnSettings. */
  saveSettings(settings: BarnSettings): Promise<void>;

  /** Upserts or deletes a SpeciesProfile (or batch-updates card sort order). */
  saveSpeciesProfile(profile: SpeciesProfile): Promise<void>;
  saveSpeciesProfilesBatch(profiles: SpeciesProfile[]): Promise<void>;
  deleteSpeciesProfile(id: string): Promise<void>;

  /** Upserts or deletes Animal records (single or batch; deleting cascades photos & care logs). */
  saveAnimal(animal: Animal): Promise<void>;
  saveAnimalsBatch(animals: Animal[]): Promise<void>;
  deleteAnimal(id: string): Promise<void>;
  deleteAnimalsBatch(ids: string[]): Promise<void>;

  /** Upserts or deletes optimized AnimalPhoto records (single or batch). */
  saveAnimalPhoto(photo: AnimalPhoto): Promise<void>;
  saveAnimalPhotosBatch(photos: AnimalPhoto[]): Promise<void>;
  deleteAnimalPhoto(id: string): Promise<void>;

  /** Upserts or deletes a CageLocation record. */
  saveCage(cage: CageLocation): Promise<void>;
  deleteCage(id: string): Promise<void>;

  /** Upserts or deletes a BreedingRecord. */
  saveBreeding(breeding: BreedingRecord): Promise<void>;
  deleteBreeding(id: string): Promise<void>;

  /** Upserts or deletes BarnTask records (single or batch for Master Task List cascading). */
  saveTask(task: BarnTask): Promise<void>;
  saveTasksBatch(tasks: BarnTask[]): Promise<void>;
  deleteTask(id: string): Promise<void>;
  deleteTasksBatch(ids: string[]): Promise<void>;

  /** Upserts or deletes a CareLog entry. */
  saveCareLog(log: CareLog): Promise<void>;
  deleteCareLog(id: string): Promise<void>;

  /** Upserts or deletes a ShowEvent. */
  saveShow(show: ShowEvent): Promise<void>;
  deleteShow(id: string): Promise<void>;

  /** Exports the raw unencrypted `.sqlite` binary database file (when running SQLite engine). */
  exportRawSqliteBytes(): Promise<Uint8Array | null>;

  /** Inspects a `.sqlite` binary database without modifying or closing the active local database. */
  inspectRawSqliteBytes?(bytes: Uint8Array, options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Imports a raw unencrypted `.sqlite` binary database file and persists it locally. */
  importRawSqliteBytes(bytes: Uint8Array, options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Closes and cleanly re-opens the local database connection without losing saved records. */
  resetConnection?(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Purges and rebuilds a corrupted primary IndexedDB/SQLite store cleanly from starter schema. */
  rebuildCleanDatabase?(options?: SnapshotLoadOptions): Promise<BarnDatabaseSnapshot>;

  /** Checks persisted storage epoch and reloads internal state if another tab wrote newer changes. */
  syncFromPersistedStorageIfStale?(): Promise<boolean>;

  /** Returns detected wiped-storage recovery state when IndexedDB appeared wiped for a returning user. */
  getWipedRecoveryContext?(): WipedStorageRecoveryContext | null;
}
