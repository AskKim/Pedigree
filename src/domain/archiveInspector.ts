/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Pre-Restore Archive Inspector (`src/domain/archiveInspector.ts`).
 *
 * Dry-run parses backup `.ZIP`, `.JSON`, or decoded `.SQLITE` snapshots BEFORE committing
 * any database writes so breeders can verify exact species counts, photo byte sizes,
 * detected tattoo/sex conflicts, and replace-vs-merge impact first.
 */

import { analyzeBarnAnimalConflicts } from './animalConflicts';
import { ParsedBackupArchive } from './backupArchive';
import { CURRENT_BACKUP_SCHEMA_VERSION } from './backupVault';
import { analyzeBarnDataHealth } from './dataHealthCheck';
import { estimateDataUrlByteLength } from './imageOptimizationSpec';
import {
  BarnDatabaseSnapshot,
  isAnimalArchived,
  isSameSpecies,
} from './models';
import { computeCollectionSetImpact } from '@engine/primitives/genericSync';

export interface ArchiveSpeciesSummaryItem {
  species: string;
  animalCount: number;
  photoCount: number;
  photoBytes: number;
}

export interface PreRestoreArchiveInspection {
  fileName: string;
  sourceFormat: 'json' | 'zip' | 'sqlite';
  isPhotosOnly: boolean;
  encrypted: boolean;
  schemaVersion: number;
  barnName: string;
  updatedAtIso: string;
  animalCount: number;
  activeAnimalCount: number;
  archivedAnimalCount: number;
  breedingCount: number;
  taskCount: number;
  cageCount: number;
  careLogCount: number;
  showCount: number;
  feedBatchCount: number;
  feedAllocationCount: number;
  ledgerEntryCount: number;
  processingLogCount: number;
  youthProjectBookCount: number;
  photoCount: number;
  photoBytes: number;
  speciesBreakdown: ArchiveSpeciesSummaryItem[];
  duplicateTattooCount: number;
  parentSexMismatchCount: number;
  healthIssueCount: number;
  replaceImpact: {
    currentAnimalCount: number;
    currentPhotoCount: number;
    netAnimalDelta: number;
    currentAnimalsNotInIncoming: number;
  } | null;
  mergeImpact: {
    newAnimalsToAdd: number;
    existingAnimalsMatched: number;
    newPhotosToAdd: number;
    existingPhotosMatched: number;
  } | null;
}

function computePhotoPayloadBytes(
  photos: BarnDatabaseSnapshot['animalPhotos']
): number {
  let sum = 0;
  for (const p of photos ?? []) {
    sum +=
      p.storedBytes > 0
        ? p.storedBytes
        : p.dataUrl
        ? estimateDataUrlByteLength(p.dataUrl)
        : 0;
  }
  return sum;
}

export function inspectSnapshotBeforeRestorePure(
  incoming: BarnDatabaseSnapshot,
  current?: BarnDatabaseSnapshot | null,
  options?: {
    fileName?: string;
    sourceFormat?: 'json' | 'zip' | 'sqlite';
    schemaVersion?: number;
    encrypted?: boolean;
    defaultWorkspaceName?: string;
  }
): PreRestoreArchiveInspection {
  const photos = incoming.animalPhotos ?? [];
  const photoBytes = computePhotoPayloadBytes(photos);

  const speciesMap = new Map<string, ArchiveSpeciesSummaryItem>();
  const touchSpecies = (rawName: string | undefined): ArchiveSpeciesSummaryItem => {
    const clean = (rawName || 'Unspecified').trim() || 'Unspecified';
    const key = clean.toLowerCase();
    const existing = speciesMap.get(key);
    if (existing) return existing;
    const item: ArchiveSpeciesSummaryItem = {
      species: clean,
      animalCount: 0,
      photoCount: 0,
      photoBytes: 0,
    };
    speciesMap.set(key, item);
    return item;
  };

  for (const sp of incoming.speciesProfiles) {
    touchSpecies(sp.name);
  }
  let archivedAnimalCount = 0;
  for (const animal of incoming.animals) {
    const bucket = touchSpecies(animal.species);
    bucket.animalCount += 1;
    if (isAnimalArchived(animal)) archivedAnimalCount += 1;
  }
  for (const photo of photos) {
    const bucket = touchSpecies(photo.species);
    bucket.photoCount += 1;
    bucket.photoBytes +=
      photo.storedBytes > 0
        ? photo.storedBytes
        : photo.dataUrl
        ? estimateDataUrlByteLength(photo.dataUrl)
        : 0;
  }

  const speciesBreakdown = Array.from(speciesMap.values())
    .filter((item) => item.animalCount > 0 || item.photoCount > 0)
    .sort(
      (a, b) =>
        b.animalCount - a.animalCount ||
        b.photoCount - a.photoCount ||
        a.species.localeCompare(b.species)
    );

  const conflictMap = analyzeBarnAnimalConflicts(incoming.animals);
  let duplicateTattooCount = 0;
  let parentSexMismatchCount = 0;
  for (const summary of conflictMap.values()) {
    if (!summary.hasActiveConflict) continue;
    if (summary.activeKinds.includes('duplicate_tattoo')) duplicateTattooCount += 1;
    if (summary.activeKinds.includes('parent_sex_mismatch')) parentSexMismatchCount += 1;
  }

  const healthReport = analyzeBarnDataHealth(incoming);

  let replaceImpact: PreRestoreArchiveInspection['replaceImpact'] = null;
  let mergeImpact: PreRestoreArchiveInspection['mergeImpact'] = null;

  if (current) {
    const animalImpact = computeCollectionSetImpact(
      incoming.animals.map((a) => a.id),
      current.animals.map((a) => a.id)
    );
    const photoImpact = computeCollectionSetImpact(
      photos.map((p) => p.id),
      (current.animalPhotos ?? []).map((p) => p.id)
    );

    replaceImpact = {
      currentAnimalCount: current.animals.length,
      currentPhotoCount: (current.animalPhotos ?? []).length,
      netAnimalDelta: incoming.animals.length - current.animals.length,
      currentAnimalsNotInIncoming: animalImpact.currentOnlyCount,
    };

    mergeImpact = {
      newAnimalsToAdd: animalImpact.newIncomingCount,
      existingAnimalsMatched: animalImpact.matchedExistingCount,
      newPhotosToAdd: photoImpact.newIncomingCount,
      existingPhotosMatched: photoImpact.matchedExistingCount,
    };
  }

  return {
    fileName: options?.fileName || 'backup',
    sourceFormat: options?.sourceFormat || 'json',
    isPhotosOnly: false,
    encrypted: Boolean(options?.encrypted),
    schemaVersion: options?.schemaVersion ?? CURRENT_BACKUP_SCHEMA_VERSION,
    barnName: incoming.settings.barnName || options?.defaultWorkspaceName || 'Community Pedigree',
    updatedAtIso: incoming.settings.updatedAt || '',
    animalCount: incoming.animals.length,
    activeAnimalCount: Math.max(0, incoming.animals.length - archivedAnimalCount),
    archivedAnimalCount,
    breedingCount: incoming.breedings.length,
    taskCount: incoming.tasks.length,
    cageCount: incoming.cages.length,
    careLogCount: incoming.careLogs.length,
    showCount: incoming.shows.length,
    feedBatchCount: (incoming.feedBatches ?? []).length,
    feedAllocationCount: (incoming.feedAllocations ?? []).length,
    ledgerEntryCount: (incoming.ledgerEntries ?? []).length,
    processingLogCount: (incoming.processingLogs ?? []).length,
    youthProjectBookCount: (incoming.youthProjectBooks ?? []).length,
    photoCount: photos.length,
    photoBytes,
    speciesBreakdown,
    duplicateTattooCount,
    parentSexMismatchCount,
    healthIssueCount: healthReport.totalIssueCount,
    replaceImpact,
    mergeImpact,
  };
}

export function inspectParsedArchiveBeforeRestorePure(
  parsed: ParsedBackupArchive,
  current?: BarnDatabaseSnapshot | null,
  options?: {
    fileName?: string;
    encrypted?: boolean;
    defaultWorkspaceName?: string;
    defaultPhotosOnlyName?: string;
  }
): PreRestoreArchiveInspection {
  if (parsed.kind === 'full_snapshot') {
    return inspectSnapshotBeforeRestorePure(parsed.snapshot, current, {
      fileName: options?.fileName,
      sourceFormat: parsed.sourceFormat,
      encrypted: options?.encrypted,
      defaultWorkspaceName: options?.defaultWorkspaceName,
    });
  }

  const photos = parsed.photos;
  const photoBytes = computePhotoPayloadBytes(photos);
  const speciesMap = new Map<string, ArchiveSpeciesSummaryItem>();
  for (const photo of photos) {
    const clean = (photo.species || 'Unspecified').trim() || 'Unspecified';
    const key = clean.toLowerCase();
    const bucket = speciesMap.get(key) || {
      species: clean,
      animalCount: 0,
      photoCount: 0,
      photoBytes: 0,
    };
    bucket.photoCount += 1;
    bucket.photoBytes +=
      photo.storedBytes > 0
        ? photo.storedBytes
        : photo.dataUrl
        ? estimateDataUrlByteLength(photo.dataUrl)
        : 0;
    speciesMap.set(key, bucket);
  }

  const photoImpact = computeCollectionSetImpact(
    photos.map((p) => p.id),
    (current?.animalPhotos ?? []).map((p) => p.id)
  );
  let matchedByAnimal = 0;
  for (const photo of photos) {
    if (
      current?.animals.some(
        (a) =>
          a.id === photo.animalId ||
          isSameSpecies(a.species, photo.species)
      )
    ) {
      matchedByAnimal += 1;
    }
  }

  return {
    fileName: options?.fileName || 'photos.zip',
    sourceFormat: 'zip',
    isPhotosOnly: true,
    encrypted: Boolean(options?.encrypted),
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    barnName: current?.settings.barnName || options?.defaultPhotosOnlyName || 'Photos-Only Archive',
    updatedAtIso: '',
    animalCount: matchedByAnimal,
    activeAnimalCount: 0,
    archivedAnimalCount: 0,
    breedingCount: 0,
    taskCount: 0,
    cageCount: 0,
    careLogCount: 0,
    showCount: 0,
    feedBatchCount: 0,
    feedAllocationCount: 0,
    ledgerEntryCount: 0,
    processingLogCount: 0,
    youthProjectBookCount: 0,
    photoCount: photos.length,
    photoBytes,
    speciesBreakdown: Array.from(speciesMap.values()).sort(
      (a, b) => b.photoCount - a.photoCount || a.species.localeCompare(b.species)
    ),
    duplicateTattooCount: 0,
    parentSexMismatchCount: 0,
    healthIssueCount: 0,
    replaceImpact: null,
    mergeImpact: current
      ? {
          newAnimalsToAdd: 0,
          existingAnimalsMatched: 0,
          newPhotosToAdd: photoImpact.newIncomingCount,
          existingPhotosMatched: photoImpact.matchedExistingCount,
        }
      : null,
  };
}
