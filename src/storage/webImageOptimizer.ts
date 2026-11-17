/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
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
import {
  isSvgImageInput,
  MAX_IMAGE_PIXEL_DIMENSION,
  MAX_IMAGE_TOTAL_PIXELS,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { AnimalPhoto, nowIsoUtc } from '../core/models';
import { logDiagnosticEvent } from './crashLogger';

interface DecodedCanvasSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

async function decodeBlobToCanvasSource(
  blob: Blob,
  originalFileName = ''
): Promise<DecodedCanvasSource> {
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
      const isHeic =
        /heic|heif/i.test(blob.type || '') || /\.(heic|heif)$/i.test(originalFileName);
      reject(
        new Error(
          isHeic
            ? `Cannot decode iPhone HEIC/HEIF photo "${originalFileName || 'image'}" in this browser. Change iPhone Camera Format to "Most Compatible" (JPEG) or export as JPG/PNG first.`
            : `Unsupported or unreadable image format${originalFileName ? ` (${originalFileName})` : ''}. Try JPG, PNG, or WebP.`
        )
      );
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
    const jCtx = jpegCanvas.getContext('2d');
    if (!jCtx) {
      throw new Error('2D Canvas JPEG fallback context unavailable.');
    }
    jCtx.fillStyle = '#F7F2E7';
    jCtx.fillRect(0, 0, targetWidth, targetHeight);
    jCtx.drawImage(canvas, 0, 0);
    const jpegUrl = jpegCanvas.toDataURL('image/jpeg', quality);
    return { dataUrl: jpegUrl, mimeType: 'image/jpeg' };
  } finally {
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
  const sizeCheck = validateUploadFileSize(
    originalFileName || 'photo',
    blob.size,
    MAX_PHOTO_UPLOAD_BYTES,
    'a photo upload'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }
  const headBytes = new Uint8Array(await blob.slice(0, 512).arrayBuffer());
  if (isSvgImageInput(blob.type, originalFileName, headBytes)) {
    throw new Error(
      `SVG image "${originalFileName || 'image.svg'}" cannot be imported as a raster animal photo. Please upload a JPG, PNG, WebP, or GIF image.`
    );
  }

  const preset = resolveImageOptimizationPreset(presetId);
  const originalBytes = blob.size;
  const decoded = await decodeBlobToCanvasSource(blob, originalFileName);

  try {
    if (
      !Number.isFinite(decoded.width) ||
      !Number.isFinite(decoded.height) ||
      decoded.width <= 0 ||
      decoded.height <= 0 ||
      decoded.width > MAX_IMAGE_PIXEL_DIMENSION ||
      decoded.height > MAX_IMAGE_PIXEL_DIMENSION ||
      decoded.width * decoded.height > MAX_IMAGE_TOTAL_PIXELS
    ) {
      throw new Error(
        `Image "${originalFileName || 'photo'}" (${decoded.width}x${decoded.height} px) exceeds the safe pixel resolution limit (${MAX_IMAGE_PIXEL_DIMENSION.toLocaleString()}px / 100 MP).`
      );
    }
    let activePreset = preset;
    let mainDims = computeScaledDimensions(
      decoded.width,
      decoded.height,
      activePreset.maxDimension
    );
    let mainEncoded: { dataUrl: string; mimeType: string };
    try {
      mainEncoded = renderToDataUrl(
        decoded.source,
        mainDims.width,
        mainDims.height,
        activePreset.quality
      );
    } catch (renderErr) {
      // Automatic low-memory self-recovery: step down to Compact (960px) before failing
      if (activePreset.maxDimension > 960) {
        logDiagnosticEvent({
          level: 'warn',
          category: 'media',
          message: `Corrective action: Image canvas encode for "${originalFileName || 'photo'}" fell back to Compact 960px preset`,
          error: renderErr,
        });
        activePreset = resolveImageOptimizationPreset('compact');
        mainDims = computeScaledDimensions(
          decoded.width,
          decoded.height,
          activePreset.maxDimension
        );
        mainEncoded = renderToDataUrl(
          decoded.source,
          mainDims.width,
          mainDims.height,
          activePreset.quality
        );
      } else {
        throw renderErr;
      }
    }
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
      activePreset.thumbnailDimension
    );
    const thumbEncoded = renderToDataUrl(
      decoded.source,
      thumbDims.width,
      thumbDims.height,
      activePreset.thumbnailQuality
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
  // Create a clean ArrayBuffer copy slice for Blob compatibility across strict TypeScript DOM libs
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeHint || 'image/jpeg' });
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
