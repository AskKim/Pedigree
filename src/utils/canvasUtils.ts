/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Browser Canvas Memory & Dimension Utilities (`src/utils/canvasUtils.ts`).
 *
 * Keeps offscreen `<canvas>` / `OffscreenCanvas` teardown and safe area clamping
 * completely decoupled from domain storage or device-tier stores.
 */

export type ReleasableCanvas = HTMLCanvasElement | OffscreenCanvas;

export const DEFAULT_STANDARD_CANVAS_AREA_CEILING = 4_096 * 4_096;
export const DEFAULT_CONSTRAINED_CANVAS_AREA_CEILING = 2_048 * 2_048;

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
      // Ignore dimension reset errors
    }
  }
}

/**
 * Clamps canvas pixel dimensions proportionally so total pixel area stays within
 * the provided ceiling (preventing iOS/WebKit silent canvas allocation failures).
 */
export function clampCanvasDimensions(
  width: number,
  height: number,
  maxAreaPixels: number = DEFAULT_STANDARD_CANVAS_AREA_CEILING
): { width: number; height: number; wasClamped: boolean } {
  const safeW = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const safeH = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const ceiling = Math.max(1, Math.floor(maxAreaPixels));
  const area = safeW * safeH;
  if (area <= ceiling) {
    return { width: safeW, height: safeH, wasClamped: false };
  }
  const scale = Math.sqrt(ceiling / area);
  return {
    width: Math.max(1, Math.floor(safeW * scale)),
    height: Math.max(1, Math.floor(safeH * scale)),
    wasClamped: true,
  };
}

export interface DecodedCanvasSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

export interface DecodeBlobCanvasOptions {
  buildError?: () => Error;
}

/**
 * Decodes an image Blob via `createImageBitmap` (with `HTMLImageElement` + `ObjectURL` fallback)
 * and returns a deterministic `cleanup()` handle that closes bitmaps or revokes object URLs.
 */
export async function decodeBlobToCanvasSource(
  blob: Blob,
  options?: DecodeBlobCanvasOptions
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
      // Fall back to HTMLImageElement loader
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
      reject(
        options?.buildError
          ? options.buildError()
          : new Error('Could not decode image in this browser.')
      );
    };
    img.src = objectUrl;
  });
}

export interface ContrastGrayscaleCanvasOptions {
  maxDimensionPx: number;
  maxAreaPixels?: number;
  contrast?: number;
  contextErrorMessage?: string;
}

/**
 * Renders a decoded image source onto a bounded, high-contrast grayscale `<canvas>` for OCR,
 * releasing the canvas automatically if a 2D context cannot be acquired.
 */
export function buildContrastGrayscaleCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number,
  options: ContrastGrayscaleCanvasOptions
): HTMLCanvasElement {
  const longest = Math.max(srcWidth, srcHeight, 1);
  const scale = longest > options.maxDimensionPx ? options.maxDimensionPx / longest : 1;
  const safeDims = clampCanvasDimensions(
    Math.max(1, Math.round(srcWidth * scale)),
    Math.max(1, Math.round(srcHeight * scale)),
    options.maxAreaPixels ?? DEFAULT_STANDARD_CANVAS_AREA_CEILING
  );
  const targetWidth = safeDims.width;
  const targetHeight = safeDims.height;

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    releaseCanvas(canvas);
    throw new Error(options.contextErrorMessage ?? '2D Canvas context is unavailable.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  try {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;
    const contrast = options.contrast ?? 1.32;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const stretched = Math.max(0, Math.min(255, (lum - 128) * contrast + 128));
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Non-fatal if canvas pixel access is blocked
  }

  return canvas;
}

