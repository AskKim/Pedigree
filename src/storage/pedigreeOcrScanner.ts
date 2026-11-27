/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline Paper Pedigree OCR & Scanned PDF Processing Pipeline
 * (`src/storage/pedigreeOcrScanner.ts`).
 *
 * Strategy:
 * 1. Accepts snapped photos (JPG/PNG/WebP/HEIC/etc.) or PDF files (digital/vector
 *    exports OR image-only scanned PDFs).
 * 2. Validates file size and blocks SVG/XML payloads before decoding.
 * 3. For PDFs: extracts searchable vector text operators (`BT...ET` + word coordinates)
 *    or embedded scanned JPEG pages completely offline via `extractPedigreePdfPages`.
 * 4. For images & raster PDF pages: decodes with EXIF orientation, renders a
 *    contrast-boosted grayscale `<canvas>`, tries native `TextDetector` first, then
 *    lazy-loads `tesseract.js` in a bounded worker (`{ text: true, blocks: true }`)
 *    with strict `try/finally` worker & bitmap cleanup.
 * 5. Produces editable 15-slot 3-generation drafts via `parsePedigreeOcrResult` and
 *    fails softly offline (`status: 'offline_manual'`) so breeders can always view
 *    the scan preview and enter/correct pedigree fields manually.
 */

import {
  createEmptyPedigreeOcrSlots,
  OcrWordBox,
  parsePedigreeOcrResult,
  PedigreeOcrParseResult,
} from '../domain/importers/pedigreeOcrParser';
import {
  extractPedigreePdfPages,
  MAX_PDF_SCAN_BYTES,
} from '../domain/importers/pdfScanExtractor';
import {
  isSvgImageInput,
  MAX_PHOTO_UPLOAD_BYTES,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from '../domain/inputSanitization';
import { WeightUnit } from '../domain/models';
import { readBlobAsArrayBuffer } from '../utils/es2018Shims';
import {
  buildContrastGrayscaleCanvas,
  decodeBlobToCanvasSource,
  releaseCanvas,
} from '../utils/canvasUtils';

export type PedigreeScanStatus =
  | 'detected'
  | 'partial'
  | 'no_text_found'
  | 'offline_manual'
  | 'pdf_unsupported'
  | 'invalid_file';

export type PedigreeScanEngine =
  | 'pdf-vector-text'
  | 'native-text-detector'
  | 'tesseract-js'
  | 'none';

export interface ScannedPedigreePageResult {
  pageIndex: number;
  sourceLabel: string;
  engine: PedigreeScanEngine;
  confidence: number;
  rawText: string;
  imageWidth: number;
  imageHeight: number;
  parseResult: PedigreeOcrParseResult;
  previewBlob: Blob | null;
  attachablePhoto?: {
    fileName: string;
    mimeHint: string;
    bytes: Uint8Array;
  };
}

export interface PedigreeScanSessionResult {
  status: PedigreeScanStatus;
  sourceFileName: string;
  isPdf: boolean;
  pages: ScannedPedigreePageResult[];
  recommendedPageIndex: number;
  warnings: string[];
  errorMessage?: string;
}

interface NativeBoundingBox {
  x?: number;
  y?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

interface NativeDetectedTextBlock {
  rawValue?: string;
  boundingBox?: NativeBoundingBox;
}

interface NativeTextDetectorInstance {
  detect(image: ImageBitmapSource): Promise<NativeDetectedTextBlock[]>;
}

interface NativeTextDetectorConstructor {
  new (): NativeTextDetectorInstance;
}

interface WindowWithTextDetector extends Window {
  TextDetector?: NativeTextDetectorConstructor;
}

const OCR_MAX_DIMENSION_STANDARD_PX = 2400;
const OCR_MAX_DIMENSION_CONSTRAINED_PX = 1800;
const OCR_WORKER_TIMEOUT_MS = 25_000;

function hasPdfMagicHeader(prefixBytes: Uint8Array): boolean {
  const limit = Math.min(prefixBytes.length, 64);
  let head = '';
  for (let i = 0; i < limit; i++) {
    head += String.fromCharCode(prefixBytes[i]);
  }
  return head.includes('%PDF-');
}



async function tryNativeTextDetectorBoxes(canvas: HTMLCanvasElement): Promise<{
  rawText: string;
  words: OcrWordBox[];
}> {
  if (typeof window === 'undefined') {
    return { rawText: '', words: [] };
  }
  const win = window as WindowWithTextDetector;
  const DetectorCtor = win.TextDetector;
  if (typeof DetectorCtor !== 'function') {
    return { rawText: '', words: [] };
  }

  try {
    const detector = new DetectorCtor();
    const blocks = await detector.detect(canvas);
    const words: OcrWordBox[] = [];
    const lines: string[] = [];

    for (const block of blocks) {
      const text = typeof block.rawValue === 'string' ? block.rawValue.trim() : '';
      if (!text) continue;
      lines.push(text);

      const box = block.boundingBox;
      const x0 = Number(box?.x ?? box?.left ?? 0) || 0;
      const y0 = Number(box?.y ?? box?.top ?? 0) || 0;
      const bw = Math.max(8, Number(box?.width ?? 60) || 60);
      const bh = Math.max(8, Number(box?.height ?? 14) || 14);

      const subLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const lineStepY = bh / Math.max(1, subLines.length);

      subLines.forEach((lineText, lineIdx) => {
        const tokens = lineText.trim().split(/\s+/).filter(Boolean);
        const totalChars = Math.max(1, tokens.reduce((acc, t) => acc + t.length, 0) + tokens.length - 1);
        let charOffset = 0;
        const lineY0 = y0 + lineIdx * lineStepY;
        const lineY1 = lineY0 + lineStepY;

        for (const tok of tokens) {
          const wx0 = x0 + (charOffset / totalChars) * bw;
          const wx1 = x0 + ((charOffset + tok.length) / totalChars) * bw;
          words.push({
            text: tok,
            x0: wx0,
            y0: lineY0,
            x1: Math.max(wx0 + 4, wx1),
            y1: lineY1,
            confidence: 86,
          });
          charOffset += tok.length + 1;
        }
      });
    }

    return {
      rawText: lines.join('\n'),
      words,
    };
  } catch {
    return { rawText: '', words: [] };
  }
}

async function runTesseractBoxesWithTimeout(
  canvas: HTMLCanvasElement,
  onProgress?: (stageLabel: string, progressPct?: number) => void
): Promise<{ rawText: string; words: OcrWordBox[]; confidence: number }> {
  const { createWorker } = await import('tesseract.js');
  const workerHolder: { instance: Awaited<ReturnType<typeof createWorker>> | null } = {
    instance: null,
  };
  let timer: ReturnType<typeof setTimeout> | null = null;

  const workPromise = (async () => {
    onProgress?.('Starting local OCR engine...', 22);
    const createdWorker = await createWorker('eng', 1, {
      logger: (msg) => {
        if (msg.status === 'recognizing text' && typeof msg.progress === 'number') {
          onProgress?.('Scanning pedigree layout & ancestors...', Math.round(32 + msg.progress * 58));
        }
      },
    });
    workerHolder.instance = createdWorker;

    const res = await createdWorker.recognize(canvas, undefined, {
      text: true,
      blocks: true,
    });

    const words: OcrWordBox[] = [];
    const blocks = res.data?.blocks ?? [];
    for (const blk of blocks) {
      for (const para of blk.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const w of line.words ?? []) {
            const clean = w.text.trim();
            if (!clean) continue;
            words.push({
              text: clean,
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
              confidence: Math.round(w.confidence || 0),
            });
          }
        }
      }
    }

    return {
      rawText: typeof res.data?.text === 'string' ? res.data.text : '',
      words,
      confidence:
        typeof res.data?.confidence === 'number' && Number.isFinite(res.data.confidence)
          ? Math.max(0, Math.min(100, Math.round(res.data.confidence)))
          : 0,
    };
  })();

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Pedigree OCR timed out after 25s. Review or type slots manually.'));
    }, OCR_WORKER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (workerHolder.instance) {
      try {
        await workerHolder.instance.terminate();
      } catch {
        // Ignore worker termination cleanup error
      }
    }
  }
}

async function scanRasterBlobForPedigree(params: {
  blob: Blob;
  rawBytes: Uint8Array;
  fileName: string;
  mimeHint: string;
  pageIndex: number;
  sourceLabel: string;
  fallbackSpecies: string;
  preferredUnit: WeightUnit;
  maxDimensionPx: number;
  onProgress?: (stageLabel: string, progressPct?: number) => void;
}): Promise<{
  pageResult: ScannedPedigreePageResult;
  offlineErrored: boolean;
  offlineReason?: string;
}> {
  const decoded = await decodeBlobToCanvasSource(params.blob, {
    buildError: () => new Error('Could not decode pedigree scan image in this browser.'),
  });
  let canvas: HTMLCanvasElement | null = null;
  let engine: PedigreeScanEngine = 'none';
  let rawText = '';
  let words: OcrWordBox[] = [];
  let confidence = 0;
  let offlineErrored = false;
  let offlineReason: string | undefined;

  try {
    canvas = buildContrastGrayscaleCanvas(
      decoded.source,
      decoded.width,
      decoded.height,
      {
        maxDimensionPx: params.maxDimensionPx,
        contrast: 1.32,
        contextErrorMessage: '2D Canvas context is unavailable for pedigree OCR.',
      }
    );
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const nativeRes = await tryNativeTextDetectorBoxes(canvas);
    const nativeParsedPreview = nativeRes.rawText.trim().length >= 30
      ? parsePedigreeOcrResult(
          {
            pageIndex: params.pageIndex,
            sourceFileName: params.fileName,
            rawText: nativeRes.rawText,
            imageWidth: canvasWidth,
            imageHeight: canvasHeight,
            words: nativeRes.words,
            confidence: 86,
            engine: 'native-text-detector',
          },
          { fallbackSpecies: params.fallbackSpecies, preferredUnit: params.preferredUnit }
        )
      : null;

    if (nativeParsedPreview && nativeParsedPreview.populatedSlotCount >= 3) {
      rawText = nativeRes.rawText;
      words = nativeRes.words;
      confidence = 86;
      engine = 'native-text-detector';
    } else {
      try {
        const tessRes = await runTesseractBoxesWithTimeout(canvas, params.onProgress);
        rawText = tessRes.rawText;
        words = tessRes.words;
        confidence = tessRes.confidence;
        engine = 'tesseract-js';

        if (!rawText.trim() && nativeRes.rawText.trim()) {
          rawText = nativeRes.rawText;
          words = nativeRes.words;
          confidence = 72;
          engine = 'native-text-detector';
        }
      } catch (err) {
        if (nativeRes.rawText.trim()) {
          rawText = nativeRes.rawText;
          words = nativeRes.words;
          confidence = 68;
          engine = 'native-text-detector';
        } else {
          offlineErrored = true;
          const msg = err instanceof Error ? err.message : 'OCR unavailable';
          offlineReason = msg;
        }
      }
    }

    const parseResult = parsePedigreeOcrResult(
      {
        pageIndex: params.pageIndex,
        sourceFileName: params.fileName,
        rawText,
        imageWidth: canvasWidth,
        imageHeight: canvasHeight,
        words,
        confidence,
        engine,
      },
      {
        fallbackSpecies: params.fallbackSpecies,
        preferredUnit: params.preferredUnit,
      }
    );

    return {
      pageResult: {
        pageIndex: params.pageIndex,
        sourceLabel: params.sourceLabel,
        engine,
        confidence,
        rawText: parseResult.sanitizedRawText,
        imageWidth: canvasWidth,
        imageHeight: canvasHeight,
        parseResult,
        previewBlob: params.blob,
        attachablePhoto: {
          fileName: params.fileName,
          mimeHint: params.mimeHint,
          bytes: params.rawBytes,
        },
      },
      offlineErrored,
      offlineReason,
    };
  } finally {
    releaseCanvas(canvas);
    canvas = null;
    decoded.cleanup();
  }
}

/**
 * Scans a paper pedigree photo (camera / JPG / PNG / WebP) or PDF (vector or scanned JPEG pages)
 * completely offline and returns editable 15-slot 3-generation drafts ready for review.
 */
export async function scanPedigreeDocumentFile(
  file: File,
  options?: {
    fallbackSpecies?: string;
    preferredUnit?: WeightUnit;
    constrainedDevice?: boolean;
    onProgress?: (stageLabel: string, progressPct?: number) => void;
  }
): Promise<PedigreeScanSessionResult> {
  const safeName = sanitizeSingleLineText(file.name || 'pedigree-scan', 160) || 'pedigree-scan';
  const fallbackSpecies = options?.fallbackSpecies || 'Rabbit';
  const preferredUnit = options?.preferredUnit ?? 'lbs_oz';
  const maxDim = options?.constrainedDevice
    ? OCR_MAX_DIMENSION_CONSTRAINED_PX
    : OCR_MAX_DIMENSION_STANDARD_PX;

  const isPdfName = safeName.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  const sizeCheck = validateUploadFileSize(
    safeName,
    file.size,
    isPdfName ? MAX_PDF_SCAN_BYTES : MAX_PHOTO_UPLOAD_BYTES,
    isPdfName ? 'a pedigree PDF scan' : 'a pedigree photo'
  );
  if (!sizeCheck.ok) {
    return {
      status: 'invalid_file',
      sourceFileName: safeName,
      isPdf: isPdfName,
      pages: [],
      recommendedPageIndex: 0,
      warnings: [],
      errorMessage: sizeCheck.error,
    };
  }

  options?.onProgress?.('Reading pedigree document...', 8);
  const rawBuffer = await readBlobAsArrayBuffer(file);
  const rawBytes = new Uint8Array(rawBuffer);

  if (isSvgImageInput(file.type, safeName, rawBytes.subarray(0, 512))) {
    return {
      status: 'invalid_file',
      sourceFileName: safeName,
      isPdf: false,
      pages: [],
      recommendedPageIndex: 0,
      warnings: [],
      errorMessage:
        'SVG vector files are blocked for security. Upload a JPG, PNG, WebP photo, or PDF document.',
    };
  }

  const looksPdf = isPdfName || hasPdfMagicHeader(rawBytes);

  if (looksPdf) {
    options?.onProgress?.('Inspecting PDF pages offline...', 18);
    const pdfRes = extractPedigreePdfPages(rawBytes);

    if (!pdfRes.ok || pdfRes.pages.length === 0) {
      return {
        status: 'pdf_unsupported',
        sourceFileName: safeName,
        isPdf: true,
        pages: [
          {
            pageIndex: 0,
            sourceLabel: 'Manual 3-Generation Entry',
            engine: 'none',
            confidence: 0,
            rawText: '',
            imageWidth: 0,
            imageHeight: 0,
            parseResult: {
              slots: createEmptyPedigreeOcrSlots(''),
              detectedSpecies: fallbackSpecies,
              detectedBreed: '',
              sanitizedRawText: '',
              layoutMode: 'manual_empty',
              populatedSlotCount: 0,
              warnings: pdfRes.warnings,
            },
            previewBlob: null,
          },
        ],
        recommendedPageIndex: 0,
        warnings: pdfRes.warnings,
        errorMessage:
          pdfRes.errorMessage ||
          'Could not extract text or scanned images from this PDF. Take a photo or screenshot as JPG/PNG instead.',
      };
    }

    const scannedPages: ScannedPedigreePageResult[] = [];
    const warnings = [...pdfRes.warnings];
    let anyOfflineError = false;
    let firstOfflineReason: string | undefined;

    for (let i = 0; i < pdfRes.pages.length; i++) {
      const page = pdfRes.pages[i];
      if (page.kind === 'vector_text') {
        const words: OcrWordBox[] = (page.words ?? []).map((w) => ({
          text: w.text,
          x0: w.x0,
          y0: w.y0,
          x1: w.x1,
          y1: w.y1,
          confidence: 98,
        }));
        const parsed = parsePedigreeOcrResult(
          {
            pageIndex: page.pageIndex,
            sourceFileName: safeName,
            rawText: page.rawText || '',
            imageWidth: page.width,
            imageHeight: page.height,
            words,
            confidence: 98,
            engine: 'pdf-vector-text',
          },
          { fallbackSpecies, preferredUnit }
        );
        scannedPages.push({
          pageIndex: page.pageIndex,
          sourceLabel: `PDF Page ${page.pageIndex + 1} (Searchable Text)`,
          engine: 'pdf-vector-text',
          confidence: 98,
          rawText: parsed.sanitizedRawText,
          imageWidth: page.width,
          imageHeight: page.height,
          parseResult: parsed,
          previewBlob: null,
        });
      } else if (page.jpegBytes && page.jpegBytes.byteLength > 0) {
        options?.onProgress?.(
          `Running local OCR on PDF page ${i + 1} of ${pdfRes.pages.length}...`,
          Math.round(20 + (i / Math.max(1, pdfRes.pages.length)) * 70)
        );
        const pageJpegCopy = new Uint8Array(page.jpegBytes);
        const jpegBlob = new Blob([pageJpegCopy], { type: 'image/jpeg' });
        const scanned = await scanRasterBlobForPedigree({
          blob: jpegBlob,
          rawBytes: pageJpegCopy,
          fileName: `${safeName.replace(/\.pdf$/i, '')}-page-${page.pageIndex + 1}.jpg`,
          mimeHint: 'image/jpeg',
          pageIndex: page.pageIndex,
          sourceLabel: `PDF Page ${page.pageIndex + 1} (Scanned Image)`,
          fallbackSpecies,
          preferredUnit,
          maxDimensionPx: maxDim,
          onProgress: options?.onProgress,
        });
        scannedPages.push(scanned.pageResult);
        if (scanned.offlineErrored) {
          anyOfflineError = true;
          firstOfflineReason = firstOfflineReason || scanned.offlineReason;
        }
      }
    }

    let bestIdx = 0;
    let bestCount = -1;
    scannedPages.forEach((p, idx) => {
      if (p.parseResult.populatedSlotCount > bestCount) {
        bestCount = p.parseResult.populatedSlotCount;
        bestIdx = idx;
      }
    });

    if (anyOfflineError && bestCount <= 0) {
      warnings.push(
        `Offline OCR language pack uncached (${firstOfflineReason || 'unavailable'}). Scanned page image is shown so you can enter pedigree slots manually.`
      );
    }

    options?.onProgress?.('Done', 100);
    const bestPop = scannedPages[bestIdx]?.parseResult.populatedSlotCount ?? 0;
    const status: PedigreeScanStatus =
      bestPop >= 3
        ? 'detected'
        : bestPop > 0
          ? 'partial'
          : anyOfflineError
            ? 'offline_manual'
            : 'no_text_found';

    return {
      status,
      sourceFileName: safeName,
      isPdf: true,
      pages: scannedPages,
      recommendedPageIndex: bestIdx,
      warnings,
    };
  }

  // Standard raster photo (camera / JPG / PNG / WebP / HEIC)
  options?.onProgress?.('Decoding full-resolution pedigree photo...', 14);
  const mimeHint = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  const scanned = await scanRasterBlobForPedigree({
    blob: file,
    rawBytes,
    fileName: safeName,
    mimeHint,
    pageIndex: 0,
    sourceLabel: 'Scanned Pedigree Photo',
    fallbackSpecies,
    preferredUnit,
    maxDimensionPx: maxDim,
    onProgress: options?.onProgress,
  });

  const warnings = [...scanned.pageResult.parseResult.warnings];
  const pop = scanned.pageResult.parseResult.populatedSlotCount;
  let status: PedigreeScanStatus = 'no_text_found';
  if (pop >= 3) {
    status = 'detected';
  } else if (pop > 0) {
    status = 'partial';
  } else if (scanned.offlineErrored) {
    status = 'offline_manual';
    const isOffline =
      (typeof navigator !== 'undefined' && navigator.onLine === false) ||
      /fetch|network|failed|load|import|traineddata|timeout/i.test(scanned.offlineReason || '');
    warnings.unshift(
      isOffline
        ? 'Offline or OCR language pack uncached — photo preview is ready below so you can type or verify pedigree slots manually.'
        : `Local OCR could not initialize (${scanned.offlineReason || 'unavailable'}). Photo preview is ready for manual slot entry.`
    );
  }

  options?.onProgress?.('Done', 100);
  return {
    status,
    sourceFileName: safeName,
    isPdf: false,
    pages: [scanned.pageResult],
    recommendedPageIndex: 0,
    warnings,
  };
}
