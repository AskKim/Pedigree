/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Bounded LRU Full-Resolution Photo Cache & On-Demand Snapshot Hydration Helpers.
 *
 * Keeps only lightweight `thumbnailDataUrl` previews inside the long-lived React
 * snapshot state while fetching full-resolution base64 `dataUrl` payloads from SQLite
 * on demand for galleries, lightboxes, formal pedigree prints, binders, and backups.
 */

import { AnimalPhoto, BarnDatabaseSnapshot, isSameSpecies } from '../core/models';

export class BoundedPhotoDataCache {
  private maxEntries: number;
  private maxBytes: number;
  private totalBytes = 0;
  private entries = new Map<string, string>();

  constructor(maxEntries = 16, maxBytes = Number.POSITIVE_INFINITY) {
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
    this.maxBytes =
      Number.isFinite(maxBytes) && maxBytes > 0
        ? Math.floor(maxBytes)
        : Number.POSITIVE_INFINITY;
  }

  private evictToLimits(): void {
    while (
      this.entries.size > this.maxEntries ||
      (this.entries.size > 0 && this.totalBytes > this.maxBytes)
    ) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.totalBytes = Math.max(0, this.totalBytes - oldest[1].length);
    }
  }

  get(photoId: string): string | undefined {
    const hit = this.entries.get(photoId);
    if (hit === undefined) return undefined;
    // Refresh LRU recency
    this.entries.delete(photoId);
    this.entries.set(photoId, hit);
    return hit;
  }

  set(photoId: string, dataUrl: string): void {
    if (!photoId || !dataUrl) return;
    const prev = this.entries.get(photoId);
    if (prev !== undefined) {
      this.totalBytes = Math.max(0, this.totalBytes - prev.length);
      this.entries.delete(photoId);
    }
    this.entries.set(photoId, dataUrl);
    this.totalBytes += dataUrl.length;
    this.evictToLimits();
  }

  delete(photoId: string): void {
    const prev = this.entries.get(photoId);
    if (prev !== undefined) {
      this.totalBytes = Math.max(0, this.totalBytes - prev.length);
      this.entries.delete(photoId);
    }
  }

  clear(): void {
    this.entries.clear();
    this.totalBytes = 0;
  }

  resize(nextMaxEntries: number, nextMaxBytes?: number): void {
    this.maxEntries = Math.max(1, Math.floor(nextMaxEntries));
    if (nextMaxBytes !== undefined) {
      this.maxBytes =
        Number.isFinite(nextMaxBytes) && nextMaxBytes > 0
          ? Math.floor(nextMaxBytes)
          : Number.POSITIVE_INFINITY;
    }
    this.evictToLimits();
  }

  trimTo(maxEntries: number, maxBytes?: number): void {
    const prevEntries = this.maxEntries;
    const prevBytes = this.maxBytes;
    this.maxEntries = Math.max(0, Math.floor(maxEntries));
    if (maxBytes !== undefined) {
      this.maxBytes = Number.isFinite(maxBytes) && maxBytes >= 0 ? Math.floor(maxBytes) : prevBytes;
    }
    this.evictToLimits();
    this.maxEntries = prevEntries;
    this.maxBytes = prevBytes;
  }

  size(): number {
    return this.entries.size;
  }

  byteSize(): number {
    return this.totalBytes;
  }
}

export function stripPhotoDataUrlsFromSnapshot(
  snapshot: BarnDatabaseSnapshot
): BarnDatabaseSnapshot {
  const photos = snapshot.animalPhotos ?? [];
  if (photos.length === 0 || photos.every((p) => !p.dataUrl)) {
    return snapshot;
  }
  return {
    ...snapshot,
    animalPhotos: photos.map((p) => ({
      ...p,
      thumbnailDataUrl: p.thumbnailDataUrl || p.dataUrl || '',
      dataUrl: '',
    })),
  };
}

export async function hydrateSnapshotWithPhotoDataUrls(
  snapshot: BarnDatabaseSnapshot,
  fetchBatch: (photoIds: string[]) => Promise<Record<string, string>>,
  filterSpecies?: string,
  cache?: BoundedPhotoDataCache
): Promise<BarnDatabaseSnapshot> {
  const photos = snapshot.animalPhotos ?? [];
  if (photos.length === 0) return snapshot;

  const missingIds: string[] = [];
  const cachedById = new Map<string, string>();
  const speciesAnimalIds = filterSpecies
    ? new Set(
        snapshot.animals
          .filter((a) => isSameSpecies(a.species, filterSpecies))
          .map((a) => a.id)
      )
    : null;

  for (const photo of photos) {
    if (filterSpecies) {
      const belongs =
        isSameSpecies(photo.species, filterSpecies) || Boolean(speciesAnimalIds?.has(photo.animalId));
      if (!belongs) continue;
    }
    if (photo.dataUrl) continue;
    const fromCache = cache?.get(photo.id);
    if (fromCache) {
      cachedById.set(photo.id, fromCache);
    } else {
      missingIds.push(photo.id);
    }
  }

  if (missingIds.length === 0 && cachedById.size === 0) {
    return snapshot;
  }

  const fetched = missingIds.length > 0 ? await fetchBatch(missingIds) : {};
  const nextPhotos: AnimalPhoto[] = photos.map((p) => {
    if (p.dataUrl) return p;
    const resolved = fetched[p.id] || cachedById.get(p.id);
    if (!resolved) return p;
    return {
      ...p,
      dataUrl: resolved,
      thumbnailDataUrl: p.thumbnailDataUrl || resolved,
    };
  });

  return {
    ...snapshot,
    animalPhotos: nextPhotos,
  };
}
