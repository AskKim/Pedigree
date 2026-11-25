/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Content-Agnostic Offline PDF Vector Text & Embedded JPEG Page Extractor
 * (`@engine/primitives/pdfDocumentExtractor.ts`).
 *
 * Zero DOM, zero Node built-ins, zero domain terminology.
 */

import { inflateSync, unzlibSync } from 'fflate';
import { sanitizePlainText } from './sanitization';

export const MAX_PDF_SCAN_BYTES = 40 * 1024 * 1024;
export const MAX_PDF_SCAN_PAGES = 6;
const MAX_PDF_STREAM_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;

export interface PdfExtractedTextWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PdfExtractedPage {
  pageIndex: number;
  kind: 'vector_text' | 'raster_jpeg';
  width: number;
  height: number;
  rawText?: string;
  words?: PdfExtractedTextWord[];
  jpegBytes?: Uint8Array;
}

export interface PdfExtractionResult {
  ok: boolean;
  pages: PdfExtractedPage[];
  isEncrypted: boolean;
  warnings: string[];
  errorMessage?: string;
}

export interface PdfExtractionOptions {
  maxBytes?: number;
  maxPages?: number;
  encryptedErrorMessage?: string;
}

function bytesToLatin1(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
    out += String.fromCharCode(...slice);
  }
  return out;
}

function latin1ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function tryDecompressFlate(rawStream: Uint8Array): Uint8Array | null {
  if (rawStream.byteLength === 0 || rawStream.byteLength > MAX_PDF_STREAM_UNCOMPRESSED_BYTES) {
    return null;
  }
  try {
    const out = unzlibSync(rawStream);
    if (out.byteLength <= MAX_PDF_STREAM_UNCOMPRESSED_BYTES) return out;
    return null;
  } catch {
    try {
      const out = inflateSync(rawStream);
      if (out.byteLength <= MAX_PDF_STREAM_UNCOMPRESSED_BYTES) return out;
      return null;
    } catch {
      return null;
    }
  }
}

function unescapePdfLiteralString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    i++;
    if (i >= raw.length) break;
    const esc = raw[i];
    if (esc === 'n') out += '\n';
    else if (esc === 'r') out += '\r';
    else if (esc === 't') out += '\t';
    else if (esc === 'b') out += '\b';
    else if (esc === 'f') out += '\f';
    else if (esc === '(' || esc === ')' || esc === '\\') out += esc;
    else if (esc === '\r') {
      if (raw[i + 1] === '\n') i++;
    } else if (esc === '\n') {
      // Line continuation
    } else if (esc >= '0' && esc <= '7') {
      let oct = esc;
      for (let k = 0; k < 2 && i + 1 < raw.length; k++) {
        const next = raw[i + 1];
        if (next >= '0' && next <= '7') {
          oct += next;
          i++;
        } else {
          break;
        }
      }
      const code = parseInt(oct, 8);
      if (Number.isFinite(code) && code >= 32) {
        out += String.fromCharCode(code);
      }
    } else {
      out += esc;
    }
  }
  return out;
}

function decodePdfHexString(hexRaw: string): string {
  const clean = hexRaw.replace(/[^0-9a-fA-F]/g, '');
  if (!clean) return '';
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < padded.length; i += 2) {
    bytes[i / 2] = parseInt(padded.slice(i, i + 2), 16) & 0xff;
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let text = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      const code = (bytes[i] << 8) | bytes[i + 1];
      if (code >= 32) text += String.fromCharCode(code);
    }
    return text;
  }
  let ascii = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b !== 127) ascii += String.fromCharCode(b);
  }
  return ascii;
}

interface RawTextPlacement {
  text: string;
  x: number;
  yPdf: number;
  fontSize: number;
}

function extractTextPlacementsFromContentStream(streamText: string): RawTextPlacement[] {
  const placements: RawTextPlacement[] = [];
  const btRegex = /\bBT\b([\s\S]*?)\bET\b/g;
  let btMatch: RegExpExecArray | null;

  while ((btMatch = btRegex.exec(streamText)) !== null) {
    const block = btMatch[1];
    let x = 0;
    let y = 0;
    let leading = 12;
    let fontSize = 10;

    let i = 0;
    const numStack: number[] = [];
    const strStack: string[] = [];

    const readLiteral = (): string => {
      i++;
      let depth = 1;
      let buf = '';
      while (i < block.length && depth > 0) {
        const c = block[i];
        if (c === '\\') {
          buf += c;
          if (i + 1 < block.length) {
            buf += block[i + 1];
            i += 2;
          } else {
            i++;
          }
          continue;
        }
        if (c === '(') {
          depth++;
          buf += c;
        } else if (c === ')') {
          depth--;
          if (depth > 0) buf += c;
        } else {
          buf += c;
        }
        i++;
      }
      return unescapePdfLiteralString(buf);
    };

    const readHex = (): string => {
      i++;
      let buf = '';
      while (i < block.length && block[i] !== '>') {
        buf += block[i];
        i++;
      }
      if (block[i] === '>') i++;
      return decodePdfHexString(buf);
    };

    const pushText = (txt: string) => {
      const cleaned = sanitizePlainText(txt, 500).replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      placements.push({
        text: cleaned,
        x,
        yPdf: y,
        fontSize: Math.max(6, Math.min(48, fontSize)),
      });
    };

    while (i < block.length) {
      const ch = block[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '%') {
        while (i < block.length && block[i] !== '\n' && block[i] !== '\r') i++;
        continue;
      }
      if (ch === '(') {
        strStack.push(readLiteral());
        continue;
      }
      if (ch === '<') {
        if (block[i + 1] === '<') {
          i += 2;
          continue;
        }
        strStack.push(readHex());
        continue;
      }
      if (ch === '[') {
        i++;
        let combined = '';
        while (i < block.length && block[i] !== ']') {
          if (block[i] === '(') {
            combined += readLiteral();
          } else if (block[i] === '<') {
            combined += readHex();
          } else if (block[i] === '-' || (block[i] >= '0' && block[i] <= '9')) {
            let numStr = '';
            while (i < block.length && /[0-9.+-]/.test(block[i])) {
              numStr += block[i];
              i++;
            }
            const kerning = Number(numStr);
            if (Number.isFinite(kerning) && kerning < -180 && combined && !combined.endsWith(' ')) {
              combined += ' ';
            }
          } else {
            i++;
          }
        }
        if (block[i] === ']') i++;
        strStack.push(combined);
        continue;
      }

      if (ch === '/' || ch === '>' || ch === ']') {
        i++;
        while (i < block.length && !/[\s()<>[\]{}/%]/.test(block[i])) i++;
        continue;
      }

      if (ch === '-' || ch === '+' || ch === '.' || (ch >= '0' && ch <= '9')) {
        let numTok = '';
        while (i < block.length && /[0-9.+-]/.test(block[i])) {
          numTok += block[i];
          i++;
        }
        const n = Number(numTok);
        if (Number.isFinite(n)) {
          numStack.push(n);
        }
        continue;
      }

      let op = '';
      while (i < block.length && !/[\s()<>[\]{}/%]/.test(block[i])) {
        op += block[i];
        i++;
      }

      if (op === 'Tf') {
        if (numStack.length >= 1) {
          fontSize = Math.abs(numStack[numStack.length - 1]) || 10;
        }
        numStack.length = 0;
      } else if (op === 'Tm') {
        if (numStack.length >= 6) {
          x = numStack[numStack.length - 2];
          y = numStack[numStack.length - 1];
        }
        numStack.length = 0;
      } else if (op === 'Td') {
        if (numStack.length >= 2) {
          x += numStack[numStack.length - 2];
          y += numStack[numStack.length - 1];
        }
        numStack.length = 0;
      } else if (op === 'TD') {
        if (numStack.length >= 2) {
          const tx = numStack[numStack.length - 2];
          const ty = numStack[numStack.length - 1];
          leading = -ty;
          x += tx;
          y += ty;
        }
        numStack.length = 0;
      } else if (op === 'TL') {
        if (numStack.length >= 1) leading = numStack[numStack.length - 1];
        numStack.length = 0;
      } else if (op === 'T*') {
        y -= leading;
        numStack.length = 0;
      } else if (op === 'Tj' || op === 'TJ') {
        const txt = strStack.pop();
        if (txt) pushText(txt);
        strStack.length = 0;
      } else if (op === "'") {
        y -= leading;
        const txt = strStack.pop();
        if (txt) pushText(txt);
        strStack.length = 0;
      } else if (op === '"') {
        y -= leading;
        const txt = strStack.pop();
        if (txt) pushText(txt);
        strStack.length = 0;
        numStack.length = 0;
      } else {
        numStack.length = 0;
        strStack.length = 0;
      }
    }
  }

  return placements;
}

interface ParsedPdfObjectStream {
  objId: number;
  dictText: string;
  rawStreamBytes: Uint8Array;
}

function parsePdfObjectsAndMediaBoxes(latin1: string): {
  streams: ParsedPdfObjectStream[];
  objectDictsById: Map<number, string>;
  pageBounds: Array<{ width: number; height: number; contentObjIds: number[] }>;
  isEncrypted: boolean;
} {
  const isEncrypted = /\/Encrypt\b/.test(latin1.slice(0, Math.min(latin1.length, 200_000)));
  const objectDictsById = new Map<number, string>();
  const streams: ParsedPdfObjectStream[] = [];
  const pageBounds: Array<{ width: number; height: number; contentObjIds: number[] }> = [];

  const objRegex = /(?:^|\r|\n)\s*(\d+)\s+\d+\s+obj\b/g;
  let objMatch: RegExpExecArray | null;

  while ((objMatch = objRegex.exec(latin1)) !== null) {
    const objId = Number(objMatch[1]);
    const bodyStart = objMatch.index + objMatch[0].length;
    const endObjIdx = latin1.indexOf('endobj', bodyStart);
    if (endObjIdx < 0) continue;

    const body = latin1.slice(bodyStart, endObjIdx);
    const streamKwIdx = body.search(/>>\s*stream\r?\n/);

    if (streamKwIdx >= 0) {
      const dictText = body.slice(0, streamKwIdx + 2);
      objectDictsById.set(objId, dictText);

      const streamMarkerMatch = />>\s*stream\r?\n/.exec(body.slice(streamKwIdx));
      if (streamMarkerMatch) {
        const dataStart = streamKwIdx + streamMarkerMatch[0].length;
        let dataEnd = body.lastIndexOf('endstream');
        if (dataEnd > dataStart) {
          if (body[dataEnd - 1] === '\n') dataEnd--;
          if (body[dataEnd - 1] === '\r') dataEnd--;
          streams.push({
            objId,
            dictText,
            rawStreamBytes: latin1ToBytes(body.slice(dataStart, dataEnd)),
          });
        }
      }
    } else {
      objectDictsById.set(objId, body);
      if (/\/Type\s*\/Page\b(?!s)/.test(body)) {
        let width = 792;
        let height = 612;
        const mbMatch = /\/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/.exec(
          body
        );
        if (mbMatch) {
          const w = Math.abs(Number(mbMatch[3]) - Number(mbMatch[1]));
          const h = Math.abs(Number(mbMatch[4]) - Number(mbMatch[2]));
          if (Number.isFinite(w) && w > 50 && Number.isFinite(h) && h > 50) {
            width = w;
            height = h;
          }
        }
        const contentObjIds: number[] = [];
        const arrMatch = /\/Contents\s*\[([^\]]+)\]/.exec(body);
        if (arrMatch) {
          const refRe = /(\d+)\s+\d+\s+R/g;
          let rMatch: RegExpExecArray | null;
          while ((rMatch = refRe.exec(arrMatch[1])) !== null) {
            contentObjIds.push(Number(rMatch[1]));
          }
        } else {
          const singleMatch = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(body);
          if (singleMatch) {
            contentObjIds.push(Number(singleMatch[1]));
          }
        }
        pageBounds.push({ width, height, contentObjIds });
      }
    }

    objRegex.lastIndex = endObjIdx + 6;
  }

  return { streams, objectDictsById, pageBounds, isEncrypted };
}

function buildTextPageFromPlacements(
  pageIndex: number,
  width: number,
  height: number,
  placements: RawTextPlacement[]
): PdfExtractedPage | null {
  if (placements.length === 0) return null;
  const maxY = Math.max(height, ...placements.map((p) => p.yPdf + p.fontSize + 8));
  const maxX = Math.max(
    width,
    ...placements.map((p) => p.x + p.text.length * (p.fontSize * 0.55) + 8)
  );

  const words: PdfExtractedTextWord[] = [];
  for (const p of placements) {
    const yTop = Math.max(0, maxY - p.yPdf - p.fontSize);
    const yBot = yTop + p.fontSize * 1.15;
    const charW = Math.max(3.5, p.fontSize * 0.48);
    const parts = p.text.split(/\s+/).filter(Boolean);
    let cursorX = p.x;
    for (const part of parts) {
      const w = part.length * charW;
      words.push({
        text: part,
        x0: Math.max(0, cursorX),
        y0: yTop,
        x1: Math.max(cursorX + 4, cursorX + w),
        y1: yBot,
      });
      cursorX += w + charW;
    }
  }

  const sorted = [...placements].sort((a, b) => {
    const dy = b.yPdf - a.yPdf;
    if (Math.abs(dy) > 4) return dy;
    return a.x - b.x;
  });

  const lineBuckets: RawTextPlacement[][] = [];
  for (const item of sorted) {
    const lastBucket = lineBuckets[lineBuckets.length - 1];
    if (lastBucket && Math.abs(lastBucket[0].yPdf - item.yPdf) <= 4.5) {
      lastBucket.push(item);
    } else {
      lineBuckets.push([item]);
    }
  }

  const rawText = lineBuckets
    .map((bucket) =>
      bucket
        .sort((a, b) => a.x - b.x)
        .map((b) => b.text)
        .join(' ')
    )
    .join('\n');

  return {
    pageIndex,
    kind: 'vector_text',
    width: Math.round(maxX),
    height: Math.round(maxY),
    rawText,
    words,
  };
}

function trimJpegMarkers(bytes: Uint8Array): Uint8Array | null {
  let start = -1;
  for (let i = 0; i + 1 < Math.min(bytes.length, 64); i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  let end = bytes.length;
  for (let i = bytes.length - 2; i > start + 2; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      end = i + 2;
      break;
    }
  }
  const sliced = bytes.subarray(start, end);
  return sliced.byteLength >= 1024 ? sliced : null;
}

/**
 * Extracts searchable vector text streams (with coordinates) and/or embedded scanned JPEG
 * page images from any PDF binary (`Uint8Array`) 100% offline.
 */
export function extractPdfDocumentPages(
  pdfBytes: Uint8Array,
  options?: PdfExtractionOptions
): PdfExtractionResult {
  const maxBytes = options?.maxBytes ?? MAX_PDF_SCAN_BYTES;
  const maxPages = options?.maxPages ?? MAX_PDF_SCAN_PAGES;

  if (pdfBytes.byteLength === 0) {
    return {
      ok: false,
      pages: [],
      isEncrypted: false,
      warnings: [],
      errorMessage: 'Selected PDF file is empty (0 bytes).',
    };
  }
  if (pdfBytes.byteLength > maxBytes) {
    return {
      ok: false,
      pages: [],
      isEncrypted: false,
      warnings: [],
      errorMessage: `PDF exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB mobile scan limit. Scan or export individual pages as JPG/PNG images instead.`,
    };
  }

  const headText = bytesToLatin1(pdfBytes.subarray(0, Math.min(1024, pdfBytes.byteLength)));
  if (!headText.includes('%PDF-')) {
    return {
      ok: false,
      pages: [],
      isEncrypted: false,
      warnings: [],
      errorMessage: 'File does not start with a valid %PDF header.',
    };
  }

  const latin1 = bytesToLatin1(pdfBytes);
  const { streams, pageBounds, isEncrypted } = parsePdfObjectsAndMediaBoxes(latin1);

  if (isEncrypted) {
    return {
      ok: false,
      pages: [],
      isEncrypted: true,
      warnings: [],
      errorMessage:
        options?.encryptedErrorMessage ||
        'This PDF is password-protected or encrypted. Export or screenshot the page as a JPG/PNG image and scan it here.',
    };
  }

  const warnings: string[] = [];
  const streamById = new Map<number, ParsedPdfObjectStream>();
  const jpegPages: PdfExtractedPage[] = [];

  for (const st of streams) {
    streamById.set(st.objId, st);

    const isImage = /\/Subtype\s*\/Image\b/.test(st.dictText);
    const hasDct = /\/DCTDecode\b/.test(st.dictText);
    if (isImage && hasDct && jpegPages.length < maxPages) {
      const widthMatch = /\/Width\s+(\d+)/.exec(st.dictText);
      const heightMatch = /\/Height\s+(\d+)/.exec(st.dictText);
      const w = Number(widthMatch?.[1] || 0);
      const h = Number(heightMatch?.[1] || 0);
      const isTinyAsset = (w > 0 && w < 180) || (h > 0 && h < 180);
      if (!isTinyAsset) {
        const cleanJpeg = trimJpegMarkers(st.rawStreamBytes);
        if (cleanJpeg) {
          jpegPages.push({
            pageIndex: jpegPages.length,
            kind: 'raster_jpeg',
            width: w || 1200,
            height: h || 900,
            jpegBytes: cleanJpeg,
          });
        }
      }
    }
  }

  const textPages: PdfExtractedPage[] = [];
  if (pageBounds.length > 0) {
    for (let pIdx = 0; pIdx < Math.min(pageBounds.length, maxPages); pIdx++) {
      const pb = pageBounds[pIdx];
      const placements: RawTextPlacement[] = [];
      for (const contentId of pb.contentObjIds) {
        const st = streamById.get(contentId);
        if (!st) continue;
        const decodedBytes = /\/FlateDecode\b/.test(st.dictText)
          ? tryDecompressFlate(st.rawStreamBytes)
          : st.rawStreamBytes;
        if (!decodedBytes) continue;
        const contentText = bytesToLatin1(decodedBytes);
        placements.push(...extractTextPlacementsFromContentStream(contentText));
      }
      const textPage = buildTextPageFromPlacements(pIdx, pb.width, pb.height, placements);
      if (textPage && (textPage.rawText || '').length >= 24) {
        textPages.push(textPage);
      }
    }
  } else {
    const placements: RawTextPlacement[] = [];
    for (const st of streams) {
      if (/\/Subtype\s*\/Image\b/.test(st.dictText)) continue;
      const decodedBytes = /\/FlateDecode\b/.test(st.dictText)
        ? tryDecompressFlate(st.rawStreamBytes)
        : st.rawStreamBytes;
      if (!decodedBytes) continue;
      const contentText = bytesToLatin1(decodedBytes);
      if (contentText.includes('BT') && contentText.includes('ET')) {
        placements.push(...extractTextPlacementsFromContentStream(contentText));
      }
    }
    const textPage = buildTextPageFromPlacements(0, 792, 612, placements);
    if (textPage && (textPage.rawText || '').length >= 24) {
      textPages.push(textPage);
    }
  }

  if (pageBounds.length > maxPages) {
    warnings.push(
      `PDF has ${pageBounds.length} pages; scanned the first ${maxPages} pages to protect mobile memory.`
    );
  }

  if (textPages.length > 0) {
    return {
      ok: true,
      pages: textPages,
      isEncrypted: false,
      warnings,
    };
  }

  if (jpegPages.length > 0) {
    return {
      ok: true,
      pages: jpegPages,
      isEncrypted: false,
      warnings,
    };
  }

  return {
    ok: false,
    pages: [],
    isEncrypted: false,
    warnings,
    errorMessage:
      'No searchable text or embedded JPEG page scans were found in this PDF (it may use CCITT/JBIG2 fax compression or vector outlines). Take a screenshot or export the page as JPG/PNG and scan it here.',
  };
}
