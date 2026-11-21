/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pre-Compression Feed Tag OCR & Biosecurity Image Capture Pipeline (`src/storage/feedTagOcr.ts`).
 *
 * Strategy:
 * 1. Decodes the full-resolution feed tag / receipt image BEFORE compression.
 * 2. Renders an EXIF-oriented, contrast-boosted grayscale canvas (capped safely at 2200px)
 *    so faded mill inkjet stamps remain readable to OCR without crashing mobile memory.
 * 3. Attempts Chromium/Android native `TextDetector` first (zero-network, instant),
 *    then lazy-loads `tesseract.js` in a bounded worker with `try/finally` termination.
 * 4. Fails softly offline (`status: 'offline_manual'`) so breeders can always inspect the photo
 *    and enter or override the stamped lot number manually.
 * 5. Compresses the stored tag image via `optimizeImageBlob(..., 'compact')` afterwards.
 */

import {
  extractFeedTagDetailsFromOcrText,
  FeedTagOcrParseResult,
} from '../core/feedInventory';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import { todayDateIso } from '../core/models';
import { optimizeImageBlob } from './webImageOptimizer';

export type FeedTagOcrStatus =
  | 'detected'
  | 'no_lot_found'
  | 'offline_manual'
  | 'ocr_failed';

export interface FeedTagCaptureResult {
  status: FeedTagOcrStatus;
  engine: 'native-text-detector' | 'tesseract-js' | 'none';
  rawText: string;
  confidence: number;
  parsed: FeedTagOcrParseResult;
  optimizedImage: OptimizedImagePayload;
  capturedDateIso: string;
  warningMessage?: string;
}

interface NativeDetectedTextBlock {
  rawValue?: string;
}

interface NativeTextDetectorConstructor {
  new (): {
    detect(image: ImageBitmapSource): Promise<NativeDetectedTextBlock[]>;
  };
}

const OCR_MAX_DIMENSION_PX = 2200;
const OCR_WORKER_TIMEOUT_MS = 18_000;

async function decodeRawImageForOcr(
  file: Blob
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
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
      reject(new Error('Could not decode image file for feed tag OCR.'));
    };
    img.src = objectUrl;
  });
}

function buildContrastOcrCanvas(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): HTMLCanvasElement {
  const longest = Math.max(srcWidth, srcHeight, 1);
  const scale = longest > OCR_MAX_DIMENSION_PX ? OCR_MAX_DIMENSION_PX / longest : 1;
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D Canvas context unavailable for feed tag OCR.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

  // Convert to grayscale and boost contrast slightly to lift faded mill dot-matrix stamps
  try {
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;
    const contrast = 1.38;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const stretched = Math.max(0, Math.min(255, (lum - 128) * contrast + 128));
      data[i] = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Non-fatal if browser restricts getImageData
  }

  return canvas;
}

async function tryNativeTextDetector(canvas: HTMLCanvasElement): Promise<string> {
  const win = typeof window !== 'undefined' ? (window as unknown as { TextDetector?: NativeTextDetectorConstructor }) : undefined;
  const DetectorCtor = win?.TextDetector;
  if (typeof DetectorCtor !== 'function') return '';
  try {
    const detector = new DetectorCtor();
    const blocks = await detector.detect(canvas);
    return blocks
      .map((b) => (typeof b.rawValue === 'string' ? b.rawValue.trim() : ''))
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

async function runTesseractWorkerWithTimeout(
  canvas: HTMLCanvasElement,
  onProgress?: (stageLabel: string, progressPct?: number) => void
): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const workPromise = (async () => {
    onProgress?.('Loading local OCR recognizer...', 20);
    worker = await createWorker('eng', 1, {
      logger: (msg) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          onProgress?.('Reading stamped lot numbers...', Math.round(35 + msg.progress * 55));
        }
      },
    });
    const res = await worker.recognize(canvas);
    return {
      text: typeof res.data?.text === 'string' ? res.data.text : '',
      confidence:
        typeof res.data?.confidence === 'number' && Number.isFinite(res.data.confidence)
          ? Math.max(0, Math.min(100, Math.round(res.data.confidence)))
          : 0,
    };
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Feed tag OCR timed out. Enter or adjust the stamped lot code manually.'));
    }, OCR_WORKER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) {
      try {
        await (worker as { terminate: () => Promise<unknown> }).terminate();
      } catch {
        // Ignore worker cleanup errors
      }
    }
  }
}

/**
 * Captures a feed bag tag / receipt photo, executes pre-compression OCR to index mill lot codes,
 * and compresses the stored photo afterwards so heavy phone photos never bloat local SQLite.
 */
export async function captureFeedTagWithPreCompressionOcr(
  file: File,
  onProgress?: (stageLabel: string, progressPct?: number) => void
): Promise<FeedTagCaptureResult> {
  onProgress?.('Decoding full-resolution tag image...', 10);

  let rawText = '';
  let confidence = 0;
  let engine: FeedTagCaptureResult['engine'] = 'none';
  let warningMessage: string | undefined;
  let ocrErroredOffline = false;

  const decoded = await decodeRawImageForOcr(file);
  let ocrCanvas: HTMLCanvasElement | null = null;

  try {
    ocrCanvas = buildContrastOcrCanvas(decoded.source, decoded.width, decoded.height);

    // 1. Fast zero-network native TextDetector if available
    const nativeText = await tryNativeTextDetector(ocrCanvas);
    const nativeParsed = nativeText ? extractFeedTagDetailsFromOcrText(nativeText) : null;
    if (nativeText && nativeParsed && nativeParsed.bestLotNumber) {
      rawText = nativeText;
      confidence = 85;
      engine = 'native-text-detector';
    } else {
      // 2. Fallback to lazy tesseract.js OCR on the pre-compressed high-contrast canvas
      try {
        const tessRes = await runTesseractWorkerWithTimeout(ocrCanvas, onProgress);
        rawText = tessRes.text || nativeText;
        confidence = tessRes.confidence;
        engine = 'tesseract-js';
      } catch (err) {
        if (nativeText) {
          rawText = nativeText;
          confidence = 60;
          engine = 'native-text-detector';
        } else {
          ocrErroredOffline = true;
          const msg = err instanceof Error ? err.message : 'OCR unavailable';
          const looksOffline =
            (typeof navigator !== 'undefined' && navigator.onLine === false) ||
            /fetch|network|failed|load|import|traineddata|timeout/i.test(msg);
          warningMessage = looksOffline
            ? 'Offline or OCR language pack uncached — tag photo was saved cleanly. Enter the lot number manually.'
            : `OCR could not read stamp (${msg}). Tag photo saved cleanly; enter lot number manually.`;
        }
      }
    }
  } finally {
    if (ocrCanvas) {
      ocrCanvas.width = 0;
      ocrCanvas.height = 0;
      ocrCanvas = null;
    }
    decoded.cleanup();
  }

  onProgress?.('Compressing tag image for compact local storage...', 92);
  const optimizedImage = await optimizeImageBlob(
    file,
    file.name || 'feed-tag.jpg',
    'compact'
  );
  const parsed = extractFeedTagDetailsFromOcrText(rawText);

  let status: FeedTagOcrStatus = 'no_lot_found';
  if (parsed.bestLotNumber) {
    status = 'detected';
  } else if (ocrErroredOffline) {
    status = 'offline_manual';
  } else if (!rawText.trim()) {
    status = 'no_lot_found';
    warningMessage =
      warningMessage ||
      'No readable text detected on tag stamp (faded ink or glare). Confirm lot number manually.';
  } else {
    warningMessage =
      'Text was scanned, but no clear mill lot code matched automatically — select a token or type manually.';
  }

  onProgress?.('Done', 100);

  return {
    status,
    engine,
    rawText: parsed.sanitizedRawText,
    confidence,
    parsed,
    optimizedImage,
    capturedDateIso: todayDateIso(),
    warningMessage,
  };
}
