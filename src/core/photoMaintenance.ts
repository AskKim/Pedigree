/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Photo Storage Footprint Analyzer & Orphan/Full-Res Pruner (`src/core/photoMaintenance.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`, `<canvas>`)
 * or Node APIs so photo storage auditing runs identically across Web PWA and React Native / Expo.
 */

import {
  estimateDataUrlByteLength,
  ImageOptimizationPresetId,
  resolveImageOptimizationPreset,
} from './imageOptimizationSpec';
import { AnimalPhoto, BarnDatabaseSnapshot, nowIsoUtc } from './models';

export const OVERSIZED_PHOTO_BYTES_THRESHOLD = 450 * 1024; // 450 KB stored photo threshold
export const FULL_RES_PRUNABLE_MIN_BYTES = 20 * 1024; // >20 KB full payload worth pruning down to thumbnail

export interface SpeciesPhotoFootprint {
  species: string;
  photoCount: number;
  storedBytes: number;
  thumbnailBytes: number;
  orphanCount: number;
  oversizedCount: number;
  fullResPrunableCount: number;
}

export interface PhotoStorageFootprintReport {
  analyzedAtIso: string;
  activePresetId: ImageOptimizationPresetId;
  activePresetMaxDimension: number;
  totalPhotoCount: number;
  totalStoredBytes: number;
  totalThumbnailBytes: number;
  orphanPhotoIds: string[];
  orphanBytes: number;
  oversizedPhotoIds: string[];
  oversizedBytes: number;
  fullResPrunableIds: string[];
  estimatedReclaimableFullResBytes: number;
  speciesBreakdown: SpeciesPhotoFootprint[];
}

function resolvePhotoStoredBytes(photo: AnimalPhoto): number {
  if (photo.dataUrl) {
    return Math.max(photo.storedBytes || 0, estimateDataUrlByteLength(photo.dataUrl));
  }
  return Math.max(0, Number(photo.storedBytes) || 0);
}

function resolvePhotoThumbnailBytes(photo: AnimalPhoto): number {
  return photo.thumbnailDataUrl ? estimateDataUrlByteLength(photo.thumbnailDataUrl) : 0;
}

/**
 * Pure footprint analyzer inspecting per-species photo byte usage, orphan attachments
 * referencing deleted/missing animals, oversized photos exceeding the active preset
 * dimensions or size threshold, and full-res payloads that can be compacted cleanly to thumbnails.
 */
export function analyzePhotoStorageFootprintPure(
  snapshot: BarnDatabaseSnapshot,
  activePresetId?: ImageOptimizationPresetId
): PhotoStorageFootprintReport {
  const preset = resolveImageOptimizationPreset(
    activePresetId ?? snapshot.settings.imageOptimizationPreset
  );
  const animalIds = new Set(snapshot.animals.map((a) => a.id));
  const photos = snapshot.animalPhotos ?? [];

  const orphanPhotoIds: string[] = [];
  const oversizedPhotoIds: string[] = [];
  const fullResPrunableIds: string[] = [];
  let totalStoredBytes = 0;
  let totalThumbnailBytes = 0;
  let orphanBytes = 0;
  let oversizedBytes = 0;
  let estimatedReclaimableFullResBytes = 0;

  const bySpecies = new Map<string, SpeciesPhotoFootprint>();

  for (const photo of photos) {
    const storedBytes = resolvePhotoStoredBytes(photo);
    const thumbBytes = resolvePhotoThumbnailBytes(photo);
    const isOrphan = !photo.animalId || !animalIds.has(photo.animalId);
    const exceedsDimension =
      (photo.width > preset.maxDimension || photo.height > preset.maxDimension) &&
      storedBytes > FULL_RES_PRUNABLE_MIN_BYTES;
    const isOversized = !isOrphan && (exceedsDimension || storedBytes > OVERSIZED_PHOTO_BYTES_THRESHOLD);

    const hasDistinctThumbnail =
      Boolean(photo.thumbnailDataUrl) &&
      photo.thumbnailDataUrl !== photo.dataUrl &&
      thumbBytes > 0 &&
      storedBytes > Math.max(FULL_RES_PRUNABLE_MIN_BYTES, thumbBytes + 8 * 1024);

    totalStoredBytes += storedBytes;
    totalThumbnailBytes += thumbBytes;

    if (isOrphan) {
      orphanPhotoIds.push(photo.id);
      orphanBytes += storedBytes;
    }
    if (isOversized) {
      oversizedPhotoIds.push(photo.id);
      oversizedBytes += storedBytes;
    }
    if (!isOrphan && hasDistinctThumbnail) {
      fullResPrunableIds.push(photo.id);
      estimatedReclaimableFullResBytes += Math.max(0, storedBytes - thumbBytes);
    }

    const spName = (photo.species || 'Unspecified').trim() || 'Unspecified';
    const spKey = spName.toLowerCase();
    const bucket = bySpecies.get(spKey) || {
      species: spName,
      photoCount: 0,
      storedBytes: 0,
      thumbnailBytes: 0,
      orphanCount: 0,
      oversizedCount: 0,
      fullResPrunableCount: 0,
    };
    bucket.photoCount += 1;
    bucket.storedBytes += storedBytes;
    bucket.thumbnailBytes += thumbBytes;
    if (isOrphan) bucket.orphanCount += 1;
    if (isOversized) bucket.oversizedCount += 1;
    if (!isOrphan && hasDistinctThumbnail) bucket.fullResPrunableCount += 1;
    bySpecies.set(spKey, bucket);
  }

  const speciesBreakdown = Array.from(bySpecies.values()).sort(
    (a, b) => b.storedBytes - a.storedBytes || a.species.localeCompare(b.species)
  );

  return {
    analyzedAtIso: nowIsoUtc(),
    activePresetId: preset.id,
    activePresetMaxDimension: preset.maxDimension,
    totalPhotoCount: photos.length,
    totalStoredBytes,
    totalThumbnailBytes,
    orphanPhotoIds,
    orphanBytes,
    oversizedPhotoIds,
    oversizedBytes,
    fullResPrunableIds,
    estimatedReclaimableFullResBytes,
    speciesBreakdown,
  };
}

/**
 * Removes orphan `AnimalPhoto` records whose `animalId` no longer exists in `snapshot.animals`.
 */
export function removeOrphanPhotosFromSnapshotPure(snapshot: BarnDatabaseSnapshot): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedPhotoIds: string[];
  removedCount: number;
  reclaimedBytes: number;
} {
  const animalIds = new Set(snapshot.animals.map((a) => a.id));
  const kept: AnimalPhoto[] = [];
  const removedPhotoIds: string[] = [];
  let reclaimedBytes = 0;

  for (const photo of snapshot.animalPhotos ?? []) {
    if (!photo.animalId || !animalIds.has(photo.animalId)) {
      removedPhotoIds.push(photo.id);
      reclaimedBytes += resolvePhotoStoredBytes(photo);
    } else {
      kept.push(photo);
    }
  }

  if (removedPhotoIds.length === 0) {
    return {
      nextSnapshot: snapshot,
      removedPhotoIds: [],
      removedCount: 0,
      reclaimedBytes: 0,
    };
  }

  return {
    nextSnapshot: {
      ...snapshot,
      animalPhotos: kept,
    },
    removedPhotoIds,
    removedCount: removedPhotoIds.length,
    reclaimedBytes,
  };
}

/**
 * Replaces redundant heavy full-resolution `dataUrl` image payloads with their already-generated
 * `thumbnailDataUrl` previews so herd/pedigree thumbnails and metadata remain intact while freeing quota.
 */
export function pruneFullResPayloadsFromSnapshotPure(
  snapshot: BarnDatabaseSnapshot,
  targetPhotoIds?: string[],
  timestampIso?: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  prunedCount: number;
  reclaimedBytes: number;
  updatedPhotos: AnimalPhoto[];
} {
  const allowSet = targetPhotoIds ? new Set(targetPhotoIds) : null;
  const ts = timestampIso || nowIsoUtc();
  let prunedCount = 0;
  let reclaimedBytes = 0;
  const updatedPhotos: AnimalPhoto[] = [];

  const nextPhotos = (snapshot.animalPhotos ?? []).map((photo) => {
    if (allowSet && !allowSet.has(photo.id)) return photo;
    if (!photo.thumbnailDataUrl || photo.thumbnailDataUrl === photo.dataUrl) {
      return photo;
    }
    const prevBytes = resolvePhotoStoredBytes(photo);
    const thumbBytes = resolvePhotoThumbnailBytes(photo);
    if (thumbBytes <= 0 || prevBytes <= Math.max(FULL_RES_PRUNABLE_MIN_BYTES, thumbBytes + 8 * 1024)) {
      return photo;
    }
    const nextPhoto: AnimalPhoto = {
      ...photo,
      dataUrl: photo.thumbnailDataUrl,
      storedBytes: thumbBytes,
      _rev: (photo._rev ?? 0) + 1,
      updatedAt: ts,
    };
    prunedCount += 1;
    reclaimedBytes += Math.max(0, prevBytes - thumbBytes);
    updatedPhotos.push(nextPhoto);
    return nextPhoto;
  });

  if (prunedCount === 0) {
    return {
      nextSnapshot: snapshot,
      prunedCount: 0,
      reclaimedBytes: 0,
      updatedPhotos: [],
    };
  }

  return {
    nextSnapshot: {
      ...snapshot,
      animalPhotos: nextPhotos,
    },
    prunedCount,
    reclaimedBytes,
    updatedPhotos,
  };
}
