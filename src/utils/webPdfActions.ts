/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser Raster-to-JPEG & Offline `.PDF` Download Adapter (`src/utils/webPdfActions.ts`).
 *
 * Converts locally stored WebP/PNG/JPEG raster data URLs into clean baseline JPEG bytes
 * on an offscreen `<canvas>` (with immediate memory cleanup) and dispatches pure PDF bytes
 * for 100% offline download without external PDF libraries or network calls.
 */

import { sanitizeSafeRasterImageDataUrl } from '@engine/primitives';
import { clampCanvasDimensions, releaseCanvas } from './canvasUtils';
import { downloadBinaryFile } from './webFileActions';

export interface PdfRasterImageData {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export type PdfDocumentBuilder<TParams> = (params: TParams) => Uint8Array;

function base64DataUrlToBytes(dataUrl: string): Uint8Array | null {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const header = dataUrl.slice(0, commaIdx).toLowerCase();
  if (!header.includes(';base64')) return null;
  const base64 = dataUrl.slice(commaIdx + 1);
  if (!base64) return null;
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Decodes any safe raster `dataUrl` (`image/webp`, `image/png`, `image/jpeg`) via an
 * offscreen canvas over a crisp white `#FFFFFF` background and encodes baseline JPEG bytes
 * ready for PDF `/DCTDecode` embedding. Returns `undefined` gracefully on decode failure.
 */
export async function rasterDataUrlToPdfJpeg(
  rawDataUrl: string | undefined,
  maxDimension = 420
): Promise<PdfRasterImageData | undefined> {
  const safeUrl = sanitizeSafeRasterImageDataUrl(rawDataUrl);
  if (!safeUrl || typeof document === 'undefined' || typeof Image === 'undefined') {
    return undefined;
  }

  return new Promise<PdfRasterImageData | undefined>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const clearImageRef = () => {
      img.onload = null;
      img.onerror = null;
      try {
        img.src = '';
      } catch {
        // Ignore readonly src teardown
      }
    };
    img.onload = () => {
      const srcW = img.naturalWidth || img.width || 0;
      const srcH = img.naturalHeight || img.height || 0;
      if (srcW <= 0 || srcH <= 0) {
        clearImageRef();
        resolve(undefined);
        return;
      }
      const scale = Math.min(1, maxDimension / Math.max(srcW, srcH));
      const safeDims = clampCanvasDimensions(
        Math.max(1, Math.round(srcW * scale)),
        Math.max(1, Math.round(srcH * scale))
      );
      const targetW = safeDims.width;
      const targetH = safeDims.height;

      const canvas = document.createElement('canvas');
      try {
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(undefined);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.88);
        const bytes = base64DataUrlToBytes(jpegUrl);
        if (!bytes || bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
          resolve(undefined);
          return;
        }
        resolve({ bytes, width: targetW, height: targetH });
      } catch {
        resolve(undefined);
      } finally {
        releaseCanvas(canvas);
        clearImageRef();
      }
    };
    img.onerror = () => {
      clearImageRef();
      resolve(undefined);
    };
    img.src = safeUrl;
  });
}

export async function buildAndDownloadPdfDocument<TParams>(
  pdfFilename: string,
  params: TParams,
  buildBytes: PdfDocumentBuilder<TParams>
): Promise<void> {
  const pdfBytes = buildBytes(params);
  const safeFilename = pdfFilename.toLowerCase().endsWith('.pdf')
    ? pdfFilename
    : `${pdfFilename.replace(/\.html?$/i, '')}.pdf`;

  await downloadBinaryFile(safeFilename, pdfBytes, 'application/pdf');
}
