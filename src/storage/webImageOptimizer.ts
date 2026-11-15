/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Web / PWA Image Compression & Thumbnail Pipeline (`src/storage/webImageOptimizer.ts`).
 *
 * Optimizes both:
 * 1. Direct end-user photos added on an animal's page or editor modal (`File` / `Blob`)
 * 2. Incoming binary images extracted from any External Platform Importer (`Uint8Array`)
 *
 * Strategy:
 * - Honors smartphone EXIF orientation (`imageOrientation: 'from-image'`) and strips bloated camera EXIF/GPS tags.
 * - Proportional downscale to preset ceiling (`960px` / `1280px` / `1600px`) with high-quality bicubic smoothing; never upscales small photos.
 * - Encodes to modern `image/webp` (typically 93%–97% smaller than raw 12MP phone JPEGs while retaining crisp coat/tattoo detail), with automatic `image/jpeg` fallback.
 * - Generates a dedicated ~256px `thumbnailDataUrl` (~8–14 KB) so herd lists and multi-photo strips scroll at 60fps.
 * - Never-Inflate Guard: if an imported photo is already web-safe (`jpeg`/`webp`), fits within target bounds, and is smaller than the re-encoded output, keeps the smaller original payload.
 *
 * On React Native / Expo, swap in `expo-image-manipulator` implementing the same `OptimizedImagePayload` output.
 */

import {
  calculateSavingsPercent,
  computeScaledDimensions,
  estimateDataUrlByteLength,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import { StagedImportedPhoto } from '../core/importers/importerTypes';
import { AnimalPhoto, nowIsoUtc } from '../core/models';

interface DecodedCanvasSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeBlobToCanvasSource(blob: Blob): Promise<DecodedCanvasSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement loader
    }
  }

  return new Promise<DecodedCanvasSource>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unsupported or unreadable image format.'));
    };
    img.src = objectUrl;
  });
}

function renderToDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number
): { dataUrl: string; mimeType: string } {
  const canvas = document.createElement('canvas');
  let jpegCanvas: HTMLCanvasElement | null = null;
  try {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D Canvas context unavailable for image optimization.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    // Prefer modern WebP (supports alpha transparency + ~35% smaller than JPEG at equal visual clarity)
    const webpUrl = canvas.toDataURL('image/webp', quality);
    if (webpUrl.startsWith('data:image/webp')) {
      return { dataUrl: webpUrl, mimeType: 'image/webp' };
    }

    // Fallback to JPEG if browser lacks WebP canvas encoding: composite over warm neutral card fill first
    jpegCanvas = document.createElement('canvas');
    jpegCanvas.width = targetWidth;
    jpegCanvas.height = targetHeight;
    const jCtx = jpegCanvas.getContext('2d')!;
    jCtx.fillStyle = '#F7F2E7';
    jCtx.fillRect(0, 0, targetWidth, targetHeight);
    jCtx.drawImage(canvas, 0, 0);
    const jpegUrl = jpegCanvas.toDataURL('image/jpeg', quality);
    return { dataUrl: jpegUrl, mimeType: 'image/jpeg' };
  } finally {
    // Release GPU/RAM canvas backing buffers immediately instead of waiting for GC
    canvas.width = 0;
    canvas.height = 0;
    if (jpegCanvas) {
      jpegCanvas.width = 0;
      jpegCanvas.height = 0;
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed reading image blob.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Optimizes a browser `Blob` or `File` into a compact full-view `dataUrl` + tiny `thumbnailDataUrl`.
 */
export async function optimizeImageBlob(
  blob: Blob,
  originalFileName: string,
  presetId?: ImageOptimizationPresetId
): Promise<OptimizedImagePayload> {
  const preset = resolveImageOptimizationPreset(presetId);
  const originalBytes = blob.size;
  const decoded = await decodeBlobToCanvasSource(blob);

  try {
    const mainDims = computeScaledDimensions(
      decoded.width,
      decoded.height,
      preset.maxDimension
    );
    let mainEncoded = renderToDataUrl(
      decoded.source,
      mainDims.width,
      mainDims.height,
      preset.quality
    );
    let storedBytes = estimateDataUrlByteLength(mainEncoded.dataUrl);

    // Never-Inflate Guard: if input was already a compact JPEG/WebP within target dimensions
    // and smaller than re-encoded output, keep the smaller original bytes!
    const isAlreadyCompactWebFormat =
      blob.type === 'image/jpeg' || blob.type === 'image/webp';
    if (
      !mainDims.wasResized &&
      isAlreadyCompactWebFormat &&
      originalBytes > 0 &&
      originalBytes < storedBytes
    ) {
      const passthroughUrl = await blobToDataUrl(blob);
      mainEncoded = { dataUrl: passthroughUrl, mimeType: blob.type };
      storedBytes = originalBytes;
    }

    const thumbDims = computeScaledDimensions(
      decoded.width,
      decoded.height,
      preset.thumbnailDimension
    );
    const thumbEncoded = renderToDataUrl(
      decoded.source,
      thumbDims.width,
      thumbDims.height,
      preset.thumbnailQuality
    );

    return {
      originalFileName,
      mimeType: mainEncoded.mimeType,
      width: mainDims.width,
      height: mainDims.height,
      originalBytes,
      storedBytes,
      savingsPercent: calculateSavingsPercent(originalBytes, storedBytes),
      thumbnailDataUrl:
        estimateDataUrlByteLength(thumbEncoded.dataUrl) < storedBytes
          ? thumbEncoded.dataUrl
          : mainEncoded.dataUrl,
      dataUrl: mainEncoded.dataUrl,
    };
  } finally {
    decoded.cleanup();
  }
}

/**
 * Convenience wrapper for `<input type="file">` uploads on an animal's page.
 */
export async function optimizeImageFile(
  file: File,
  presetId?: ImageOptimizationPresetId
): Promise<OptimizedImagePayload> {
  return optimizeImageBlob(file, file.name, presetId);
}

/**
 * Optimizes raw `Uint8Array` image bytes extracted from any External Platform Importer (e.g. HerdBoss `.ZIP`).
 */
export async function optimizeImageBytes(
  bytes: Uint8Array,
  originalFileName: string,
  mimeHint = 'image/jpeg',
  presetId?: ImageOptimizationPresetId
): Promise<OptimizedImagePayload> {
  // Reuse the underlying ArrayBuffer directly when un-sliced, otherwise slice only the needed range
  const bufferSlice =
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer;
  const blob = new Blob([bufferSlice], { type: mimeHint || 'image/jpeg' });
  return optimizeImageBlob(blob, originalFileName, presetId);
}

export interface BatchImportPhotoProgress {
  completed: number;
  total: number;
  savedBytesSoFar: number;
}

export interface BatchImportPhotoResult {
  photos: AnimalPhoto[];
  totalOriginalBytes: number;
  totalStoredBytes: number;
  failedFiles: string[];
}

/**
 * Optimizes all `StagedImportedPhoto` items from any platform importer in non-blocking batches of 4,
 * producing ready-to-save `AnimalPhoto` entities with deterministic IDs.
 */
export async function optimizeStagedImporterPhotos(
  staged: StagedImportedPhoto[],
  presetId?: ImageOptimizationPresetId,
  onProgress?: (progress: BatchImportPhotoProgress) => void
): Promise<BatchImportPhotoResult> {
  const ts = nowIsoUtc();
  const photos: AnimalPhoto[] = [];
  const failedFiles: string[] = [];
  let totalOriginalBytes = 0;
  let totalStoredBytes = 0;

  const CHUNK_SIZE = 4;
  for (let i = 0; i < staged.length; i += CHUNK_SIZE) {
    const slice = staged.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.all(
      slice.map(async (item) => {
        try {
          const opt = await optimizeImageBytes(
            item.bytes,
            item.originalFileName,
            item.mimeHint,
            presetId
          );
          const record: AnimalPhoto = {
            id: item.id,
            species: item.species,
            animalId: item.animalId,
            isPrimary: item.isPrimary,
            sortOrder: item.sortOrder,
            caption: item.caption,
            originalFileName: opt.originalFileName,
            mimeType: opt.mimeType,
            width: opt.width,
            height: opt.height,
            originalBytes: opt.originalBytes,
            storedBytes: opt.storedBytes,
            thumbnailDataUrl: opt.thumbnailDataUrl,
            dataUrl: opt.dataUrl,
            createdAt: ts,
            updatedAt: ts,
          };
          return { ok: true as const, record };
        } catch {
          return { ok: false as const, fileName: item.entryPath };
        }
      })
    );

    for (const res of chunkResults) {
      if (res.ok) {
        photos.push(res.record);
        totalOriginalBytes += res.record.originalBytes;
        totalStoredBytes += res.record.storedBytes;
      } else {
        failedFiles.push(res.fileName);
      }
    }

    if (onProgress) {
      onProgress({
        completed: Math.min(staged.length, i + slice.length),
        total: staged.length,
        savedBytesSoFar: Math.max(0, totalOriginalBytes - totalStoredBytes),
      });
    }

    // Yield to browser paint loop so progress bar stays responsive on large 100+ photo archives
    await new Promise((r) => setTimeout(r, 0));
  }

  // Ensure each animal still has a primary photo if its intended #0 photo failed to decode
  const grouped = new Map<string, AnimalPhoto[]>();
  for (const p of photos) {
    const arr = grouped.get(p.animalId) || [];
    arr.push(p);
    grouped.set(p.animalId, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
    if (!arr.some((p) => p.isPrimary) && arr.length > 0) {
      arr[0].isPrimary = true;
    }
  }

  return {
    photos,
    totalOriginalBytes,
    totalStoredBytes,
    failedFiles,
  };
}
