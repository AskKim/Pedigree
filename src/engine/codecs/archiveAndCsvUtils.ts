/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Multi-ZIP Unpacker, RFC-4180 CSV/TSV Parser & Unit Normalizers.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Uses `fflate` (pure JS `Uint8Array` unzip) and standard `TextDecoder` with zero browser DOM
 * dependencies so multi-ZIP imports run identically on Web and React Native / Expo.
 */

import {
  isSafeRecordKey,
  MAX_CSV_ROWS,
  MAX_CSV_TEXT_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES,
  safeUnzipArchive,
  sanitizePlainText,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from '@engine/primitives/sanitization';
import type { RawArchiveInput, VirtualArchiveEntry } from '@engine/primitives/genericRegistries';

const TEXT_EXTENSIONS = new Set([
  'csv',
  'tsv',
  'txt',
  'json',
  'xml',
  'htm',
  'html',
  'ped',
]);

const IMPORTABLE_IMAGE_MIMES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
};

const MEDIA_OR_BINARY_EXTENSIONS = new Set([
  ...Object.keys(IMPORTABLE_IMAGE_MIMES),
  'tif',
  'tiff',
  'dng',
  'raw',
  'svg',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'sqlite',
  'sqlite3',
  'db',
  'mp4',
  'mov',
]);

function getExtension(path: string): string {
  const clean = path.split('?')[0];
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === clean.length - 1) return '';
  return clean.slice(dotIdx + 1).toLowerCase();
}

function getBaseName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function isSystemJunkPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.endsWith('/')) return true;
  if (normalized.includes('__MACOSX/')) return true;
  const base = getBaseName(normalized);
  if (!base || base === '.DS_Store' || base.startsWith('._')) return true;
  return false;
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function detectUnbommedUtf16(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const sampleLen = Math.min(bytes.length, 512);
  if (sampleLen < 6) return null;
  let evenNulls = 0;
  let oddNulls = 0;
  let evenPrintable = 0;
  let oddPrintable = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = bytes[i];
    if (i % 2 === 0) {
      if (b === 0) evenNulls++;
      else if (b >= 0x20 && b <= 0x7e) evenPrintable++;
    } else {
      if (b === 0) oddNulls++;
      else if (b >= 0x20 && b <= 0x7e) oddPrintable++;
    }
  }
  const pairs = sampleLen / 2;
  if (oddNulls >= pairs * 0.6 && evenPrintable >= pairs * 0.5 && evenNulls < pairs * 0.1) {
    return 'utf-16le';
  }
  if (evenNulls >= pairs * 0.6 && oddPrintable >= pairs * 0.5 && oddNulls < pairs * 0.1) {
    return 'utf-16be';
  }
  return null;
}

/**
 * Decodes raw file bytes cleanly across UTF-8 (with or without BOM), UTF-16LE/BE (BOM or heuristic),
 * and legacy Windows-1252 / Latin-1 exports from desktop spreadsheet programs (e.g. Excel CSV).
 */
export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) return '';

  // UTF-8 BOM: EF BB BF
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return stripBom(new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(3)));
  }

  // UTF-16LE BOM: FF FE
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    try {
      return stripBom(new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2)));
    } catch {
      // Fall through
    }
  }

  // UTF-16BE BOM: FE FF
  if (bytes.byteLength >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    try {
      return stripBom(new TextDecoder('utf-16be', { fatal: false }).decode(bytes.subarray(2)));
    } catch {
      // Manual byte-swap fallback to utf-16le if runtime lacks utf-16be
      const aligned = bytes.subarray(2, bytes.byteLength - ((bytes.byteLength - 2) % 2));
      const swapped = new Uint8Array(aligned.length);
      for (let i = 0; i < aligned.length; i += 2) {
        swapped[i] = aligned[i + 1];
        swapped[i + 1] = aligned[i];
      }
      return stripBom(new TextDecoder('utf-16le', { fatal: false }).decode(swapped));
    }
  }

  // Un-BOMmed UTF-16 heuristic
  const utf16Hint = detectUnbommedUtf16(bytes);
  if (utf16Hint) {
    try {
      return stripBom(new TextDecoder(utf16Hint, { fatal: false }).decode(bytes));
    } catch {
      if (utf16Hint === 'utf-16be') {
        const len = bytes.byteLength - (bytes.byteLength % 2);
        const swapped = new Uint8Array(len);
        for (let i = 0; i < len; i += 2) {
          swapped[i] = bytes[i + 1];
          swapped[i + 1] = bytes[i];
        }
        return stripBom(new TextDecoder('utf-16le', { fatal: false }).decode(swapped));
      }
    }
  }

  // Strict UTF-8 first, falling back to Windows-1252 when invalid multibyte sequences appear
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    try {
      return stripBom(new TextDecoder('windows-1252', { fatal: false }).decode(bytes));
    } catch {
      return stripBom(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
    }
  }
}

function hasBinaryMagicHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength >= 4) {
    // PDF: %PDF
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return true;
    }
    // PNG: 89 50 4E 47
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return true;
    }
    // ZIP/XLSX/DOCX: PK 03 04
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return true;
    }
    // OLE2 (.xls / .doc): D0 CF 11 E0
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
      return true;
    }
  }
  // SQLite 3
  if (
    bytes.byteLength >= 16 &&
    bytes[0] === 0x53 &&
    bytes[1] === 0x51 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x69
  ) {
    return true;
  }
  return false;
}

function looksMostlyText(bytes: Uint8Array): boolean {
  if (bytes.byteLength === 0) return true;
  if (hasBinaryMagicHeader(bytes)) return false;

  // UTF-16 BOM or alternating NUL UTF-16 pattern
  if (
    bytes.byteLength >= 2 &&
    ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
  ) {
    return true;
  }
  if (detectUnbommedUtf16(bytes)) return true;

  const sampleLen = Math.min(bytes.length, 512);
  let controlCount = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = bytes[i];
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      controlCount++;
    }
  }
  return controlCount / sampleLen < 0.05;
}

/**
 * Unpacks one, two, or N uploaded `.zip` archives (including nested `.zip` archives if present)
 * alongside standalone `.csv`/`.json`/`.htm` files into a flat list of `VirtualArchiveEntry` items.
 * Binary photos/documents are flagged as `isMediaOrBinary: true` without wasting memory decoding them.
 */
export function extractVirtualEntries(
  inputs: RawArchiveInput[],
  maxDepth = 2
): VirtualArchiveEntry[] {
  const entries: VirtualArchiveEntry[] = [];
  let cumulativeEntries = 0;
  let cumulativeBytes = 0;

  const processBuffer = (archiveName: string, entryPath: string, bytes: Uint8Array, depth: number) => {
    if (isSystemJunkPath(entryPath)) return;
    cumulativeEntries++;
    if (cumulativeEntries > MAX_ZIP_ENTRY_COUNT) {
      throw new Error(
        `Import archives contain more than ${MAX_ZIP_ENTRY_COUNT.toLocaleString()} files and were rejected to protect memory.`
      );
    }

    const ext = getExtension(entryPath);
    const baseName = getBaseName(entryPath);

    // Unpack ZIP archives (and nested ZIPs up to maxDepth)
    if (ext === 'zip' && depth <= maxDepth) {
      const remainingBytes = Math.max(1024, MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES - cumulativeBytes);
      const unzipped = safeUnzipArchive(bytes, {
        archiveName: entryPath || archiveName,
        maxArchiveBytes: MAX_ZIP_ARCHIVE_BYTES,
        maxEntries: MAX_ZIP_ENTRY_COUNT - cumulativeEntries + 1,
        maxEntryBytes: MAX_ZIP_ENTRY_BYTES,
        maxTotalUncompressedBytes: remainingBytes,
      });
      for (const [innerPath, innerBytes] of Object.entries(unzipped)) {
        processBuffer(archiveName, innerPath, innerBytes, depth + 1);
      }
      return;
    }

    cumulativeBytes += bytes.byteLength;
    if (cumulativeBytes > MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES) {
      throw new Error(
        `Total extracted import data exceeded the rational ${Math.round(MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES / (1024 * 1024))} MB limit.`
      );
    }

    if (MEDIA_OR_BINARY_EXTENSIONS.has(ext) || hasBinaryMagicHeader(bytes)) {
      const mimeHint = IMPORTABLE_IMAGE_MIMES[ext];
      entries.push({
        archiveName,
        entryPath,
        baseName,
        extension: ext,
        sizeBytes: bytes.byteLength,
        imageBytes: mimeHint ? bytes : undefined,
        mimeHint,
        isMediaOrBinary: true,
      });
      return;
    }

    if (TEXT_EXTENSIONS.has(ext) || looksMostlyText(bytes)) {
      const textLimitCheck = validateUploadFileSize(
        entryPath || archiveName,
        bytes.byteLength,
        MAX_CSV_TEXT_BYTES,
        'a tabular text / JSON import file'
      );
      if (!textLimitCheck.ok) {
        throw new Error(textLimitCheck.error);
      }
      entries.push({
        archiveName,
        entryPath,
        baseName,
        extension: ext || 'txt',
        sizeBytes: bytes.byteLength,
        textContent: decodeTextBytes(bytes),
        isMediaOrBinary: false,
      });
      return;
    }

    entries.push({
      archiveName,
      entryPath,
      baseName,
      extension: ext,
      sizeBytes: bytes.byteLength,
      isMediaOrBinary: true,
    });
  };

  for (const input of inputs) {
    processBuffer(input.fileName, input.fileName, input.bytes, 0);
  }

  return entries;
}

export interface ParsedDelimitedTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/**
 * Detects whether the sample text uses `,`, `;`, `\t`, or `|`, inspecting the first few lines
 * so a single-line title preamble doesn't skew delimiter detection.
 */
function detectDelimiter(sampleText: string): string {
  const lines = sampleText.split('\n').slice(0, 6);
  const scoreLine = (line: string) => {
    let inQuotes = false;
    let commas = 0;
    let semis = 0;
    let tabs = 0;
    let pipes = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes) {
        if (ch === ',') commas++;
        else if (ch === ';') semis++;
        else if (ch === '\t') tabs++;
        else if (ch === '|') pipes++;
      }
    }
    return { commas, semis, tabs, pipes };
  };

  // Prefer first line containing multiple delimiter candidates (skipping single-cell title lines)
  let best = { commas: 0, semis: 0, tabs: 0, pipes: 0 };
  for (const line of lines) {
    if (!line.trim()) continue;
    const s = scoreLine(line);
    if (s.tabs + s.semis + s.pipes + s.commas >= 2) {
      best = s;
      break;
    }
    if (s.tabs + s.semis + s.pipes + s.commas > best.tabs + best.semis + best.pipes + best.commas) {
      best = s;
    }
  }

  const { commas, semis, tabs, pipes } = best;
  if (tabs > commas && tabs >= semis && tabs >= pipes) return '\t';
  if (pipes > commas && pipes >= semis && pipes >= tabs) return '|';
  if (semis > commas && semis >= tabs) return ';';
  return ',';
}

/**
 * Single-pass RFC-4180 compliant CSV / TSV / pipe parser supporting quoted multi-line notes,
 * escaped `""`, optional Excel `sep=,` first line, title preamble skipping, prototype-key defense,
 * and EOF row-limit enforcement.
 */
export function parseDelimitedTable(rawText: string): ParsedDelimitedTable {
  if (rawText.length > MAX_CSV_TEXT_BYTES) {
    throw new Error(
      `Text table exceeds the rational ${Math.round(MAX_CSV_TEXT_BYTES / (1024 * 1024))} MB limit and was rejected.`
    );
  }
  let text = stripBom(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };

  let forcedDelimiter: string | null = null;
  if (/^sep=.\n/i.test(text)) {
    forcedDelimiter = text[4];
    text = text.slice(6);
  }

  const delimiter = forcedDelimiter || detectDelimiter(text.slice(0, 4096));

  let headers: string[] | null = null;
  let preambleCandidate: string[] | null = null;
  let preambleCheckCount = 0;
  const rows: Array<Record<string, string>> = [];

  const finalizeHeaders = (cells: string[]): string[] => {
    const seenCounts = new Map<string, number>();
    return cells.map((h, idx) => {
      const clean = sanitizeSingleLineText(h, 200) || `column_${idx + 1}`;
      const base = isSafeRecordKey(clean) ? clean : `column_${idx + 1}`;
      const count = seenCounts.get(base) || 0;
      seenCounts.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    });
  };

  const pushRowObject = (hdrs: string[], values: string[]) => {
    if (rows.length >= MAX_CSV_ROWS) {
      throw new Error(
        `Spreadsheet table exceeds the ${MAX_CSV_ROWS.toLocaleString()}-row safety limit.`
      );
    }
    const obj: Record<string, string> = Object.create(null);
    let hasValue = false;
    for (let c = 0; c < hdrs.length; c++) {
      const key = hdrs[c];
      if (!isSafeRecordKey(key)) continue;
      const val = sanitizePlainText(values[c] ?? '', 20_000).trim();
      if (val !== '') hasValue = true;
      obj[key] = val;
    }
    if (hasValue) rows.push(obj);
  };

  const commitParsedRow = (rowCells: string[]) => {
    if (!rowCells.some((cell) => cell.length > 0)) return;

    if (!headers) {
      const nonEmptyCount = rowCells.filter((c) => c.length > 0).length;
      // If line 1 looks like a single-cell report title ("Quarterly Export - 2025"), hold it briefly
      // to see if one of the next 3 rows is the actual multi-column header line.
      if (!preambleCandidate && nonEmptyCount === 1 && rowCells.length === 1 && preambleCheckCount < 3) {
        preambleCandidate = rowCells;
        preambleCheckCount++;
        return;
      }
      if (preambleCandidate) {
        if (nonEmptyCount >= 2) {
          headers = finalizeHeaders(rowCells);
          preambleCandidate = null;
          return;
        }
        if (preambleCheckCount < 3) {
          preambleCandidate = rowCells;
          preambleCheckCount++;
          return;
        }
        headers = finalizeHeaders(preambleCandidate);
        preambleCandidate = null;
        pushRowObject(headers, rowCells);
        return;
      }
      headers = finalizeHeaders(rowCells);
      return;
    }

    pushRowObject(headers, rowCells);
  };

  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (ch === '\n') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        commitParsedRow(currentRow);
        currentRow = [];
      } else {
        currentCell += ch;
      }
    }
  }
  currentRow.push(currentCell.trim());
  commitParsedRow(currentRow);

  if (!headers) {
    if (preambleCandidate) {
      return { headers: finalizeHeaders(preambleCandidate), rows: [] };
    }
    return { headers: [], rows: [] };
  }

  return { headers, rows };
}

/**
 * Normalizes a column header for resilient matching (`"Primary Tag #"` -> `"primarytag"`).
 */
export function normalizeColumnKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/#/g, 'number')
    .replace(/[^a-z0-9]+/g, '');
}

function validateAndFormatYmd(year: number, month: number, day: number): string {
  if (year < 1850 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return '';
  }
  const verify = new Date(Date.UTC(year, month - 1, day));
  if (
    verify.getUTCFullYear() === year &&
    verify.getUTCMonth() === month - 1 &&
    verify.getUTCDate() === day
  ) {
    return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

/**
 * Normalizes diverse date strings (`YYYY-MM-DD`, `MM/DD/YYYY`, `DD.MM.YYYY`, `M/D/YY`,
 * `DD-MMM-YYYY`, Excel serial dates like `45123`, ISO-8601) into canonical `YYYY-MM-DD`
 * (or `""` if empty/invalid).
 */
export function normalizeFlexibleDateIso(raw: string | undefined): string {
  const s = (raw || '').trim();
  if (!s) return '';

  // Already YYYY-MM-DD or ISO-8601 timestamp (validate real calendar month/day!)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    return validateAndFormatYmd(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // Excel serial date numbers (days since 1899-12-30, typical record dates 1954..2099 => ~20000..73050)
  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 10000 && serial <= 80000) {
      const d = new Date(Date.UTC(1899, 11, 30 + serial));
      return validateAndFormatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  // Slash, dash, or dot numeric dates: M/D/YYYY, M/D/YY, DD.MM.YYYY, YYYY/M/D, YYYY.M.D
  const numericMatch = s.match(/^(\d{1,4})[/. -](\d{1,2})[/. -](\d{1,4})(?:\s.*)?$/);
  if (numericMatch) {
    const [, p1, p2, p3] = numericMatch;
    if (/^\d{4}$/.test(p1)) {
      const formatted = validateAndFormatYmd(Number(p1), Number(p2), Number(p3));
      if (formatted) return formatted;
    }
    if (/^\d{2,4}$/.test(p3)) {
      let year = Number(p3);
      if (p3.length === 2) {
        year += year > 40 ? 1900 : 2000;
      }
      let month = Number(p1);
      let day = Number(p2);
      // Dot-notation (DD.MM.YYYY) defaults European day-first unless middle > 12; slash defaults US unless first > 12
      const isDotStyle = s.includes('.');
      if (isDotStyle && day <= 12 && month <= 31 && Number(p2) <= 12 && Number(p1) > 12) {
        const tmp = month;
        month = day;
        day = tmp;
      } else if (isDotStyle && Number(p2) <= 12 && Number(p1) <= 12 && p3.length === 4) {
        const tmp = month;
        month = day;
        day = tmp;
      } else if (month > 12 && day <= 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }
      const formatted = validateAndFormatYmd(year, month, day);
      if (formatted) return formatted;
    }
  }

  // Named month dates like "14 Nov 2025" or "Nov 14, 2025"
  const parsedMs = Date.parse(s);
  if (!Number.isNaN(parsedMs)) {
    const d = new Date(parsedMs);
    const hasExplicitTz = /(?:GMT|UTC|Z|[+-]\d{2}:?\d{2})\s*$/i.test(s);
    const yyyy = hasExplicitTz ? d.getUTCFullYear() : d.getFullYear();
    if (yyyy >= 1850 && yyyy <= 2100) {
      const mm = (hasExplicitTz ? d.getUTCMonth() : d.getMonth()) + 1;
      const dd = hasExplicitTz ? d.getUTCDate() : d.getDate();
      return validateAndFormatYmd(yyyy, mm, dd);
    }
  }

  return '';
}

/**
 * Parses weights like `"8.5"`, `"8#"`, `"8 lbs 4 oz"`, `"42 kg"`, `"3850 g"` + optional unit column into integer grams.
 */
export function parseFlexibleWeightToGrams(
  rawWeight: string | undefined,
  rawUnit?: string
): number {
  const s = (rawWeight || '').trim().toLowerCase();
  if (!s) return 0;

  // Check compound "8 lb 4 oz" or "8 lbs. 4 oz."
  const lbOz = s.match(
    /(\d+(?:\.\d+)?)\s*(?:lb\.?|lbs\.?|pound|pounds|#)\s*(\d+(?:\.\d+)?)\s*(?:oz\.?|ounce|ounces)/
  );
  if (lbOz) {
    const lbs = Number(lbOz[1]);
    const oz = Number(lbOz[2]);
    if (Number.isFinite(lbs) && Number.isFinite(oz) && lbs >= 0 && oz >= 0) {
      return Math.round((lbs + oz / 16) * 453.59237);
    }
  }

  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return 0;
  const val = Number(numMatch[0]);
  if (!Number.isFinite(val) || val <= 0) return 0;

  const unitHint = `${s} ${(rawUnit || '').toLowerCase()}`;
  if (/\bkg\b|kilogram/.test(unitHint)) {
    return Math.round(val * 1000);
  }
  if (/\b(?:g|gm|gram|grams|gramme|grammes)\b/.test(unitHint) && !/\bkg/.test(unitHint)) {
    return Math.round(val);
  }
  if (/\b(?:oz|ounce|ounces)\b/.test(unitHint) && !/\b(?:lb|lbs)\b/.test(unitHint)) {
    return Math.round(val * 28.3495231);
  }
  // Default US imperial convention is pounds (`lbs` / `#`) unless explicitly metric
  return Math.round(val * 453.59237);
}

