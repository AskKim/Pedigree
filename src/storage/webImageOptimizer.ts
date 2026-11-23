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

import { dataUrlToBinary } from '../core/binaryEncoding';
import {
  calculateSavingsPercent,
  capCanvasDevicePixelRatio,
  clampCanvasDimensionsToAreaCeiling,
  computeScaledDimensions,
  estimateDataUrlByteLength,
  getCanvasAreaCeiling,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import { StagedImportedPhoto } from '../core/importers/importerTypes';
import { isFileReaderSupported, readBlobAsArrayBuffer } from '../utils/es2018Shims';
import {
  isSvgImageInput,
  MAX_IMAGE_PIXEL_DIMENSION,
  MAX_IMAGE_TOTAL_PIXELS,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { AnimalPhoto, nowIsoUtc } from '../core/models';
import { logDiagnosticEvent } from './crashLogger';
import {
  detectCurrentDeviceCapability,
  probeWebpEncodeSupport,
} from './deviceCapabilityDetector';

export type ReleasableCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Releases canvas GPU/RAM backing memory promptly in `finally` blocks across Safari/WebKit/Chromium.
 */
export function releaseCanvas(canvas: ReleasableCanvas | null | undefined): void {
  if (!canvas) return;
  try {
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (ctx && typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, 1, 1);
    }
  } catch {
    // Ignore context/clear errors during teardown
  } finally {
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // Ignore detached/readonly canvas teardown errors
    }
  }
}

/**
 * Verifies both `OffscreenCanvas` global presence and a live 2D context before worker canvas usage.
 */
export function probeOffscreenCanvas2dSupport(): boolean {
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }
  let probe: OffscreenCanvas | null = null;
  try {
    probe = new OffscreenCanvas(1, 1);
    const ctx = probe.getContext('2d');
    return ctx !== null;
  } catch {
    return false;
  } finally {
    releaseCanvas(probe);
  }
}

export function isConstrainedCanvasTier(): boolean {
  return detectCurrentDeviceCapability().shouldApplyLowMemoryHandling;
}

export function getEffectiveCanvasDevicePixelRatio(
  isConstrained: boolean = isConstrainedCanvasTier()
): number {
  const rawDpr =
    typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
      ? window.devicePixelRatio || 1
      : 1;
  return capCanvasDevicePixelRatio(rawDpr, isConstrained);
}

export function enforceCanvasDimensions(
  width: number,
  height: number,
  isConstrained: boolean = isConstrainedCanvasTier()
): { width: number; height: number; wasClamped: boolean } {
  return clampCanvasDimensionsToAreaCeiling(
    width,
    height,
    getCanvasAreaCeiling(isConstrained)
  );
}

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
    const releaseImageObjectUrl = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = '';
      } catch {
        // Ignore readonly src teardown
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width || 1,
        height: img.naturalHeight || img.height || 1,
        cleanup: releaseImageObjectUrl,
      });
    };
    img.onerror = () => {
      releaseImageObjectUrl();
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

function renderToMainThreadCanvasDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  isConstrained: boolean
): { dataUrl: string; mimeType: string } {
  const safeDims = enforceCanvasDimensions(targetWidth, targetHeight, isConstrained);
  const canvas = document.createElement('canvas');
  let jpegCanvas: HTMLCanvasElement | null = null;
  try {
    canvas.width = safeDims.width;
    canvas.height = safeDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D Canvas context unavailable for image optimization.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, safeDims.width, safeDims.height);

    // Prefer modern WebP (supports alpha transparency + ~35% smaller than JPEG at equal visual clarity)
    if (probeWebpEncodeSupport()) {
      const webpUrl = canvas.toDataURL('image/webp', quality);
      if (webpUrl.startsWith('data:image/webp')) {
        return { dataUrl: webpUrl, mimeType: 'image/webp' };
      }
    }

    // Fallback to JPEG if browser lacks WebP canvas encoding: composite over warm neutral card fill first
    jpegCanvas = document.createElement('canvas');
    jpegCanvas.width = safeDims.width;
    jpegCanvas.height = safeDims.height;
    const jCtx = jpegCanvas.getContext('2d');
    if (!jCtx) {
      throw new Error('2D Canvas JPEG fallback context unavailable.');
    }
    jCtx.fillStyle = '#F7F2E7';
    jCtx.fillRect(0, 0, safeDims.width, safeDims.height);
    jCtx.drawImage(canvas, 0, 0);
    const jpegUrl = jpegCanvas.toDataURL('image/jpeg', quality);
    return { dataUrl: jpegUrl, mimeType: 'image/jpeg' };
  } finally {
    releaseCanvas(canvas);
    releaseCanvas(jpegCanvas);
  }
}

async function renderToOffscreenWorkerDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  isConstrained: boolean
): Promise<{ dataUrl: string; mimeType: string }> {
  const safeDims = enforceCanvasDimensions(targetWidth, targetHeight, isConstrained);
  const canvas = new OffscreenCanvas(safeDims.width, safeDims.height);
  let jpegCanvas: OffscreenCanvas | null = null;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('OffscreenCanvas 2D context unavailable for worker image optimization.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, safeDims.width, safeDims.height);

    if (typeof canvas.convertToBlob === 'function') {
      try {
        const webpBlob = await canvas.convertToBlob({ type: 'image/webp', quality });
        if (webpBlob.type === 'image/webp') {
          return { dataUrl: await blobToDataUrl(webpBlob), mimeType: 'image/webp' };
        }
      } catch {
        // Fall through to JPEG OffscreenCanvas encode
      }

      jpegCanvas = new OffscreenCanvas(safeDims.width, safeDims.height);
      const jCtx = jpegCanvas.getContext('2d');
      if (!jCtx) {
        throw new Error('OffscreenCanvas 2D JPEG fallback context unavailable.');
      }
      jCtx.fillStyle = '#F7F2E7';
      jCtx.fillRect(0, 0, safeDims.width, safeDims.height);
      jCtx.drawImage(canvas, 0, 0);
      const jpegBlob = await jpegCanvas.convertToBlob({ type: 'image/jpeg', quality });
      return { dataUrl: await blobToDataUrl(jpegBlob), mimeType: 'image/jpeg' };
    }

    throw new Error('OffscreenCanvas.convertToBlob unavailable.');
  } finally {
    releaseCanvas(canvas);
    releaseCanvas(jpegCanvas);
  }
}

async function renderToDataUrl(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  isConstrained: boolean
): Promise<{ dataUrl: string; mimeType: string }> {
  if (typeof document !== 'undefined') {
    return renderToMainThreadCanvasDataUrl(
      source,
      targetWidth,
      targetHeight,
      quality,
      isConstrained
    );
  }
  if (probeOffscreenCanvas2dSupport()) {
    return renderToOffscreenWorkerDataUrl(
      source,
      targetWidth,
      targetHeight,
      quality,
      isConstrained
    );
  }
  throw new Error(
    'Neither document 2D canvas nor OffscreenCanvas 2D context is available for image optimization.'
  );
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (isFileReaderSupported()) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Failed reading image blob.'));
        reader.onabort = () => reject(new Error('Image blob read aborted.'));
        reader.readAsDataURL(blob);
      });
    } catch {
      // Fall through to ArrayBuffer + base64 conversion when FileReader is blocked (e.g. Lockdown Mode)
    }
  }

  const buffer = await readBlobAsArrayBuffer(blob);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : '';
  const mime = blob.type || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
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
  const headBytes = new Uint8Array(await readBlobAsArrayBuffer(blob.slice(0, 512)));
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
    const isConstrained = isConstrainedCanvasTier();
    const maxCanvasAreaPx = getCanvasAreaCeiling(isConstrained);
    let activePreset = preset;
    let mainDims = computeScaledDimensions(
      decoded.width,
      decoded.height,
      activePreset.maxDimension,
      maxCanvasAreaPx
    );
    let mainEncoded: { dataUrl: string; mimeType: string };
    try {
      mainEncoded = await renderToDataUrl(
        decoded.source,
        mainDims.width,
        mainDims.height,
        activePreset.quality,
        isConstrained
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
          activePreset.maxDimension,
          maxCanvasAreaPx
        );
        mainEncoded = await renderToDataUrl(
          decoded.source,
          mainDims.width,
          mainDims.height,
          activePreset.quality,
          isConstrained
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
      activePreset.thumbnailDimension,
      maxCanvasAreaPx
    );
    const thumbEncoded = await renderToDataUrl(
      decoded.source,
      thumbDims.width,
      thumbDims.height,
      activePreset.thumbnailQuality,
      isConstrained
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
 * Optimizes all `StagedImportedPhoto` items from any platform importer in tier-aware
 * non-blocking batches (1 on Tier 1–2 low-memory devices, 2 on Tier 3, 4 on Tiers 4–5),
 * producing ready-to-save `AnimalPhoto` entities with deterministic IDs.
 */
export async function optimizeStagedImporterPhotos(
  staged: StagedImportedPhoto[],
  presetId?: ImageOptimizationPresetId,
  onProgress?: (progress: BatchImportPhotoProgress) => void,
  options?: { concurrency?: number }
): Promise<BatchImportPhotoResult> {
  const ts = nowIsoUtc();
  const photos: AnimalPhoto[] = [];
  const failedFiles: string[] = [];
  let totalOriginalBytes = 0;
  let totalStoredBytes = 0;

  const detectedTier = detectCurrentDeviceCapability().tier;
  // Default sequential (1) to avoid concurrent decoded-bitmap memory spikes across devices
  const requestedConcurrency = options?.concurrency ?? 1;
  const CHUNK_SIZE =
    detectedTier <= 2 ? 1 : Math.max(1, Math.min(4, Math.round(requestedConcurrency)));
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

/**
 * Re-optimizes an existing stored `AnimalPhoto` record down to `targetPresetId`.
 * Honors Never-Inflate protection so photos that are already compact remain untouched.
 */
export async function reoptimizeAnimalPhotoRecord(
  photo: AnimalPhoto,
  targetPresetId?: ImageOptimizationPresetId
): Promise<{
  updated: boolean;
  reclaimedBytes: number;
  photo: AnimalPhoto;
}> {
  if (!photo.dataUrl) {
    return { updated: false, reclaimedBytes: 0, photo };
  }
  const binary = dataUrlToBinary(photo.dataUrl, photo.mimeType || 'image/webp');
  if (!binary || binary.bytes.byteLength === 0) {
    return { updated: false, reclaimedBytes: 0, photo };
  }
  const opt = await optimizeImageBytes(
    binary.bytes,
    photo.originalFileName || `${photo.id}.webp`,
    binary.mimeType,
    targetPresetId
  );
  const beforeBytes = Math.max(photo.storedBytes || 0, binary.bytes.byteLength);
  if (opt.storedBytes >= beforeBytes) {
    return { updated: false, reclaimedBytes: 0, photo };
  }
  const reclaimedBytes = Math.max(0, beforeBytes - opt.storedBytes);
  const nextPhoto: AnimalPhoto = {
    ...photo,
    mimeType: opt.mimeType,
    width: opt.width,
    height: opt.height,
    storedBytes: opt.storedBytes,
    thumbnailDataUrl: opt.thumbnailDataUrl || photo.thumbnailDataUrl,
    dataUrl: opt.dataUrl,
    _rev: (photo._rev ?? 0) + 1,
    updatedAt: nowIsoUtc(),
  };
  return { updated: true, reclaimedBytes, photo: nextPhoto };
}
