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
  const feedBatches = snapshot.feedBatches ?? [];
  const ledgerEntries = snapshot.ledgerEntries ?? [];

  const needsPhotoStrip = photos.some((p) => Boolean(p.dataUrl));
  const needsFeedStrip = feedBatches.some((f) => Boolean(f.tagPhotoDataUrl));
  const needsLedgerStrip = ledgerEntries.some((le) => Boolean(le.receiptPhotoDataUrl));

  if (!needsPhotoStrip && !needsFeedStrip && !needsLedgerStrip) {
    return snapshot;
  }
  return {
    ...snapshot,
    ...(needsPhotoStrip
      ? {
          animalPhotos: photos.map((p) => ({
            ...p,
            thumbnailDataUrl: p.thumbnailDataUrl || p.dataUrl || '',
            dataUrl: '',
          })),
        }
      : {}),
    ...(needsFeedStrip
      ? {
          feedBatches: feedBatches.map((f) =>
            f.tagPhotoDataUrl
              ? {
                  ...f,
                  tagPhotoThumbnailDataUrl: f.tagPhotoThumbnailDataUrl || f.tagPhotoDataUrl,
                  tagPhotoDataUrl: undefined,
                }
              : f
          ),
        }
      : {}),
    ...(needsLedgerStrip
      ? {
          ledgerEntries: ledgerEntries.map((le) =>
            le.receiptPhotoDataUrl
              ? {
                  ...le,
                  receiptPhotoThumbnailDataUrl:
                    le.receiptPhotoThumbnailDataUrl || le.receiptPhotoDataUrl,
                  receiptPhotoDataUrl: undefined,
                }
              : le
          ),
        }
      : {}),
  };
}

export const DEFAULT_PHOTO_HYDRATION_BATCH_SIZE = 12;
export const CONSTRAINED_PHOTO_HYDRATION_BATCH_SIZE = 4;

/**
 * Safely revokes a `blob:` object URL when it is no longer needed. Ignores `data:`/`https:` strings.
 */
export function revokeBlobUrlIfNeeded(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) return;
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore already-revoked or invalid object URL errors
    }
  }
}

export async function hydrateSnapshotWithPhotoDataUrls(
  snapshot: BarnDatabaseSnapshot,
  fetchBatch: (photoIds: string[]) => Promise<Record<string, string>>,
  filterSpecies?: string,
  cache?: BoundedPhotoDataCache,
  options?: {
    batchSize?: number;
    isConstrained?: boolean;
    fetchFeedTagBatch?: (batchIds: string[]) => Promise<Record<string, string>>;
    fetchLedgerReceiptBatch?: (entryIds: string[]) => Promise<Record<string, string>>;
  }
): Promise<BarnDatabaseSnapshot> {
  const defaultBatch = options?.isConstrained
    ? CONSTRAINED_PHOTO_HYDRATION_BATCH_SIZE
    : DEFAULT_PHOTO_HYDRATION_BATCH_SIZE;
  const batchSize = Math.max(1, Math.floor(options?.batchSize ?? defaultBatch));

  const photos = snapshot.animalPhotos ?? [];
  let nextPhotos = photos;
  let photosUpdated = false;

  if (photos.length > 0) {
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
          isSameSpecies(photo.species, filterSpecies) ||
          Boolean(speciesAnimalIds?.has(photo.animalId));
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

    if (missingIds.length > 0 || cachedById.size > 0) {
      const fetched: Record<string, string> = {};
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const chunk = missingIds.slice(i, i + batchSize);
        const chunkResult = await fetchBatch(chunk);
        for (const id of chunk) {
          const val = chunkResult[id];
          if (val) {
            fetched[id] = val;
          }
        }
      }

      nextPhotos = photos.map((p) => {
        if (p.dataUrl) return p;
        const resolved = fetched[p.id] || cachedById.get(p.id);
        if (!resolved) return p;
        photosUpdated = true;
        return {
          ...p,
          dataUrl: resolved,
          thumbnailDataUrl: p.thumbnailDataUrl || resolved,
        };
      });
    }
  }

  let nextFeedBatches = snapshot.feedBatches;
  let feedUpdated = false;
  if (options?.fetchFeedTagBatch && (snapshot.feedBatches ?? []).length > 0) {
    const feedList = snapshot.feedBatches ?? [];
    const missingFeedIds: string[] = [];
    const cachedFeed = new Map<string, string>();
    for (const f of feedList) {
      if (filterSpecies && !isSameSpecies(f.species, filterSpecies)) continue;
      if (f.tagPhotoDataUrl || !f.tagPhotoThumbnailDataUrl || f.tagPhotoPurgedAtIso) continue;
      const cacheKey = `feed-tag:${f.id}`;
      const hit = cache?.get(cacheKey);
      if (hit) {
        cachedFeed.set(f.id, hit);
      } else {
        missingFeedIds.push(f.id);
      }
    }
    if (missingFeedIds.length > 0 || cachedFeed.size > 0) {
      const fetchedFeed: Record<string, string> = {};
      for (let i = 0; i < missingFeedIds.length; i += batchSize) {
        const chunk = missingFeedIds.slice(i, i + batchSize);
        const chunkResult = await options.fetchFeedTagBatch(chunk);
        for (const id of chunk) {
          const val = chunkResult[id];
          if (val) {
            fetchedFeed[id] = val;
            cache?.set(`feed-tag:${id}`, val);
          }
        }
      }
      nextFeedBatches = feedList.map((f) => {
        if (f.tagPhotoDataUrl) return f;
        const resolved = fetchedFeed[f.id] || cachedFeed.get(f.id);
        if (!resolved) return f;
        feedUpdated = true;
        return {
          ...f,
          tagPhotoDataUrl: resolved,
          tagPhotoThumbnailDataUrl: f.tagPhotoThumbnailDataUrl || resolved,
        };
      });
    }
  }

  let nextLedgerEntries = snapshot.ledgerEntries;
  let ledgerUpdated = false;
  if (options?.fetchLedgerReceiptBatch && (snapshot.ledgerEntries ?? []).length > 0) {
    const ledgerList = snapshot.ledgerEntries ?? [];
    const missingLedgerIds: string[] = [];
    const cachedLedger = new Map<string, string>();
    for (const le of ledgerList) {
      if (filterSpecies && !isSameSpecies(le.species, filterSpecies)) continue;
      if (le.receiptPhotoDataUrl || !le.receiptPhotoThumbnailDataUrl) continue;
      const cacheKey = `ledger-receipt:${le.id}`;
      const hit = cache?.get(cacheKey);
      if (hit) {
        cachedLedger.set(le.id, hit);
      } else {
        missingLedgerIds.push(le.id);
      }
    }
    if (missingLedgerIds.length > 0 || cachedLedger.size > 0) {
      const fetchedLedger: Record<string, string> = {};
      for (let i = 0; i < missingLedgerIds.length; i += batchSize) {
        const chunk = missingLedgerIds.slice(i, i + batchSize);
        const chunkResult = await options.fetchLedgerReceiptBatch(chunk);
        for (const id of chunk) {
          const val = chunkResult[id];
          if (val) {
            fetchedLedger[id] = val;
            cache?.set(`ledger-receipt:${id}`, val);
          }
        }
      }
      nextLedgerEntries = ledgerList.map((le) => {
        if (le.receiptPhotoDataUrl) return le;
        const resolved = fetchedLedger[le.id] || cachedLedger.get(le.id);
        if (!resolved) return le;
        ledgerUpdated = true;
        return {
          ...le,
          receiptPhotoDataUrl: resolved,
          receiptPhotoThumbnailDataUrl: le.receiptPhotoThumbnailDataUrl || resolved,
        };
      });
    }
  }

  if (!photosUpdated && !feedUpdated && !ledgerUpdated) {
    return snapshot;
  }

  return {
    ...snapshot,
    ...(photosUpdated ? { animalPhotos: nextPhotos } : {}),
    ...(feedUpdated ? { feedBatches: nextFeedBatches } : {}),
    ...(ledgerUpdated ? { ledgerEntries: nextLedgerEntries } : {}),
  };
}
