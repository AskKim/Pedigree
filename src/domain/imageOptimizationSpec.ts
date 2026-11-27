/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Image Optimization Policy & Dimension Math (`src/domain/imageOptimizationSpec.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`, `canvas`) dependencies.
 * Shared identically by:
 * - Web / PWA (`src/storage/webImageOptimizer.ts` via Canvas/WebP/JPEG)
 * - React Native / Expo (`expo-image-manipulator` via `SaveFormat.WEBP` / `SaveFormat.JPEG`)
 * - Direct user uploads on an animal's page AND batch archives from any External Platform Importer.
 */

export type ImageOptimizationPresetId = 'compact' | 'balanced' | 'high_detail';

export interface ImageOptimizationPreset {
  id: ImageOptimizationPresetId;
  label: string;
  shortBadge: string;
  description: string;
  maxDimension: number;
  quality: number;
  thumbnailDimension: number;
  thumbnailQuality: number;
  typicalSizeHint: string;
}

export const IMAGE_OPTIMIZATION_PRESETS: Record<
  ImageOptimizationPresetId,
  ImageOptimizationPreset
> = {
  compact: {
    id: 'compact',
    label: 'Compact Barn · 960px',
    shortBadge: '960px · Max Space Savings',
    description:
      'Best for large 200+ animal herds and cloud-folder sync on slow rural connections.',
    maxDimension: 960,
    quality: 0.72,
    thumbnailDimension: 224,
    thumbnailQuality: 0.68,
    typicalSizeHint: '~45–85 KB / photo',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced HD · 1280px (Recommended)',
    shortBadge: '1280px · Crisp & Lean',
    description:
      'Retains sharp coat color, conformation, and ear-tattoo clarity while cutting smartphone photo size by ~95%.',
    maxDimension: 1280,
    quality: 0.8,
    thumbnailDimension: 256,
    thumbnailQuality: 0.74,
    typicalSizeHint: '~85–150 KB / photo',
  },
  high_detail: {
    id: 'high_detail',
    label: 'Show & Tattoo Detail · 1600px',
    shortBadge: '1600px · High Detail',
    description:
      'Higher pixel ceiling for zooming into fine ear tattoos, fiber crimp, or show table portraits.',
    maxDimension: 1600,
    quality: 0.85,
    thumbnailDimension: 288,
    thumbnailQuality: 0.78,
    typicalSizeHint: '~145–240 KB / photo',
  },
};

export const DEFAULT_IMAGE_OPTIMIZATION_PRESET: ImageOptimizationPresetId = 'balanced';

/** Hard single-canvas backing store area ceiling (16M px) to avoid WebKit/mobile OOM crashes. */
export const MAX_CANVAS_AREA_PX = 16_000_000;
/** Tighter single-canvas area ceiling (3M px) for Low-Memory / constrained tier devices. */
export const MAX_CONSTRAINED_CANVAS_AREA_PX = 3_000_000;

export function getCanvasAreaCeiling(isConstrained: boolean): number {
  return isConstrained ? MAX_CONSTRAINED_CANVAS_AREA_PX : MAX_CANVAS_AREA_PX;
}

/**
 * Proportionally clamps canvas dimensions so `width * height <= maxAreaPx` (never returning < 1px).
 */
export function clampCanvasDimensionsToAreaCeiling(
  width: number,
  height: number,
  maxAreaPx: number = MAX_CANVAS_AREA_PX
): { width: number; height: number; wasClamped: boolean } {
  const safeW = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1;
  const safeH = Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1;
  const ceiling = Number.isFinite(maxAreaPx)
    ? Math.max(1, Math.floor(maxAreaPx))
    : MAX_CANVAS_AREA_PX;

  if (safeW * safeH <= ceiling) {
    return { width: safeW, height: safeH, wasClamped: false };
  }

  const scale = Math.sqrt(ceiling / (safeW * safeH));
  let outW = Math.max(1, Math.floor(safeW * scale));
  let outH = Math.max(1, Math.floor(safeH * scale));
  while (outW * outH > ceiling && (outW > 1 || outH > 1)) {
    if (outW >= outH && outW > 1) {
      outW -= 1;
    } else if (outH > 1) {
      outH -= 1;
    } else {
      break;
    }
  }
  return { width: outW, height: outH, wasClamped: true };
}

/**
 * Caps canvas backing-store DPR at `Math.min(2, dpr || 1)`, or `1` in Low-Memory / constrained mode.
 */
export function capCanvasDevicePixelRatio(
  rawDevicePixelRatio: number | null | undefined,
  isConstrained: boolean
): number {
  if (isConstrained) return 1;
  const dpr =
    typeof rawDevicePixelRatio === 'number' &&
    Number.isFinite(rawDevicePixelRatio) &&
    rawDevicePixelRatio > 0
      ? rawDevicePixelRatio
      : 1;
  return Math.min(2, dpr);
}

export function resolveImageOptimizationPreset(
  presetId?: string | null
): ImageOptimizationPreset {
  if (presetId === 'compact' || presetId === 'balanced' || presetId === 'high_detail') {
    return IMAGE_OPTIMIZATION_PRESETS[presetId];
  }
  return IMAGE_OPTIMIZATION_PRESETS[DEFAULT_IMAGE_OPTIMIZATION_PRESET];
}

/**
 * Computes proportional output dimensions capped to `maxDimension` on the longest edge
 * and clamped to `maxAreaPx` total canvas pixels. Never upscales images that are smaller.
 */
export function computeScaledDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  maxAreaPx: number = MAX_CANVAS_AREA_PX
): { width: number; height: number; wasResized: boolean } {
  const safeW = Number.isFinite(sourceWidth) ? Math.max(1, Math.round(sourceWidth)) : 1;
  const safeH = Number.isFinite(sourceHeight) ? Math.max(1, Math.round(sourceHeight)) : 1;
  const longest = Math.max(safeW, safeH);

  let targetW = safeW;
  let targetH = safeH;
  let wasResized = false;

  if (longest > maxDimension) {
    const scale = maxDimension / longest;
    targetW = Math.max(1, Math.round(safeW * scale));
    targetH = Math.max(1, Math.round(safeH * scale));
    wasResized = true;
  }

  const clamped = clampCanvasDimensionsToAreaCeiling(targetW, targetH, maxAreaPx);
  return {
    width: clamped.width,
    height: clamped.height,
    wasResized: wasResized || clamped.wasClamped,
  };
}

/**
 * Estimates actual binary payload bytes stored inside a `data:image/...;base64,...` URI.
 */
export function estimateDataUrlByteLength(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const base64Len = dataUrl.length - commaIdx - 1;
  return Math.max(0, Math.floor((base64Len * 3) / 4));
}

/**
 * Pure percentage space saved (`0` to `99`). Returns `0` if stored >= original.
 */
export function calculateSavingsPercent(originalBytes: number, storedBytes: number): number {
  if (!originalBytes || originalBytes <= 0 || storedBytes >= originalBytes) return 0;
  return Math.min(99, Math.max(0, Math.round(((originalBytes - storedBytes) / originalBytes) * 100)));
}

/**
 * Pure human-readable byte formatter (`118.4 KB`, `4.12 MB`).
 */
export function formatByteSizePure(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface OptimizedImagePayload {
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
  savingsPercent: number;
  thumbnailDataUrl: string;
  dataUrl: string;
}
