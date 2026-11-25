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
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnJournalEntry,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ClientContact,
  FeedAllocation,
  FeedBatch,
  JudgeAssignment,
  JudgeClubContact,
  JudgeExpense,
  LedgerEntry,
  MileageLog,
  ProcessingLog,
  ShowEvent,
  SpeciesProfile,
  WaitlistEntry,
  WoolHarvest,
  YouthProjectBook,
} from '../domain/models';
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

  /** Loads the full-resolution base64 `tagPhotoDataUrl` for a single feed batch on demand. */
  loadFeedBatchTagPhotoDataUrl?(batchId: string): Promise<string | null>;

  /** Loads full-resolution `tagPhotoDataUrl` strings for specific feed batch IDs (or all if omitted). */
  loadFeedBatchTagPhotoDataUrlsBatch?(batchIds?: string[]): Promise<Record<string, string>>;

  /** Loads the full-resolution base64 `receiptPhotoDataUrl` for a single ledger entry on demand. */
  loadLedgerEntryReceiptPhotoDataUrl?(entryId: string): Promise<string | null>;

  /** Loads full-resolution `receiptPhotoDataUrl` strings for specific ledger entry IDs (or all if omitted). */
  loadLedgerEntryReceiptPhotoDataUrlsBatch?(entryIds?: string[]): Promise<Record<string, string>>;

  /** Queries a bounded BFS pedigree neighborhood (up to `maxDepth` ancestor generations) directly from SQLite. */
  queryPedigreeNeighborhood?(rootIds: string[], maxDepth: number): Promise<Animal[]>;

  /** Checks which animal IDs have at least one recorded sire/dam or offloaded archive in SQLite. */
  queryPedigreeBranchAncestorsExist?(animalIds: string[]): Promise<Record<string, boolean>>;

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

  /** Upserts or deletes CareLog entries (single or transactional batch). */
  saveCareLog(log: CareLog): Promise<void>;
  saveCareLogsBatch?(logs: CareLog[]): Promise<void>;
  deleteCareLog(id: string): Promise<void>;

  /** Upserts or deletes a ShowEvent. */
  saveShow(show: ShowEvent): Promise<void>;
  deleteShow(id: string): Promise<void>;

  /** Upserts or deletes FeedBatch inventory lots and FeedAllocation usage entries. */
  saveFeedBatch(batch: FeedBatch): Promise<void>;
  saveFeedBatchesBatch(batches: FeedBatch[]): Promise<void>;
  deleteFeedBatch(id: string): Promise<void>;
  saveFeedAllocation(allocation: FeedAllocation): Promise<void>;
  deleteFeedAllocation(id: string): Promise<void>;

  /** Upserts or deletes Economic LedgerEntry records (single or batch). */
  saveLedgerEntry(entry: LedgerEntry): Promise<void>;
  saveLedgerEntriesBatch(entries: LedgerEntry[]): Promise<void>;
  deleteLedgerEntry(id: string): Promise<void>;

  /** Upserts or deletes Meat & Pelt ProcessingLog records (single or batch). */
  saveProcessingLog(log: ProcessingLog): Promise<void>;
  saveProcessingLogsBatch(logs: ProcessingLog[]): Promise<void>;
  deleteProcessingLog(id: string): Promise<void>;

  /** Upserts or deletes 4-H / FFA YouthProjectBook records (single or batch). */
  saveYouthProjectBook(project: YouthProjectBook): Promise<void>;
  saveYouthProjectBooksBatch(projects: YouthProjectBook[]): Promise<void>;
  deleteYouthProjectBook(id: string): Promise<void>;

  /** Upserts or deletes ClientContact CRM records (single or batch). */
  saveClientContact(client: ClientContact): Promise<void>;
  saveClientContactsBatch(clients: ClientContact[]): Promise<void>;
  deleteClientContact(id: string): Promise<void>;

  /** Upserts or deletes buyer WaitlistEntry records (single or batch). */
  saveWaitlistEntry(entry: WaitlistEntry): Promise<void>;
  saveWaitlistEntriesBatch(entries: WaitlistEntry[]): Promise<void>;
  deleteWaitlistEntry(id: string): Promise<void>;

  /** Upserts or deletes AnimalReservation records (single or batch). */
  saveAnimalReservation(reservation: AnimalReservation): Promise<void>;
  saveAnimalReservationsBatch(reservations: AnimalReservation[]): Promise<void>;
  deleteAnimalReservation(id: string): Promise<void>;

  /** Upserts or deletes WoolHarvest fiber & IAGARB records (single or batch). */
  saveWoolHarvest(harvest: WoolHarvest): Promise<void>;
  saveWoolHarvestsBatch(harvests: WoolHarvest[]): Promise<void>;
  deleteWoolHarvest(id: string): Promise<void>;

  /** Upserts or deletes MileageLog tax travel records (single or batch). */
  saveMileageLog(log: MileageLog): Promise<void>;
  saveMileageLogsBatch(logs: MileageLog[]): Promise<void>;
  deleteMileageLog(id: string): Promise<void>;

  /** Upserts or deletes BarnJournalEntry personal diary records (single or batch). */
  saveJournalEntry(entry: BarnJournalEntry): Promise<void>;
  saveJournalEntriesBatch(entries: BarnJournalEntry[]): Promise<void>;
  deleteJournalEntry(id: string): Promise<void>;

  /** Upserts or deletes JudgeClubContact records (single or batch). */
  saveJudgeClub(club: JudgeClubContact): Promise<void>;
  saveJudgeClubsBatch(clubs: JudgeClubContact[]): Promise<void>;
  deleteJudgeClub(id: string): Promise<void>;

  /** Upserts or deletes JudgeAssignment show judging engagements (single or batch). */
  saveJudgeAssignment(assignment: JudgeAssignment): Promise<void>;
  saveJudgeAssignmentsBatch(assignments: JudgeAssignment[]): Promise<void>;
  deleteJudgeAssignment(id: string): Promise<void>;

  /** Upserts or deletes JudgeExpense travel/judging expense records (single or batch). */
  saveJudgeExpense(expense: JudgeExpense): Promise<void>;
  saveJudgeExpensesBatch(expenses: JudgeExpense[]): Promise<void>;
  deleteJudgeExpense(id: string): Promise<void>;

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

  /** Returns true when restricted browser storage forced an in-memory ephemeral session. */
  isEphemeralMode?(): boolean;
}
