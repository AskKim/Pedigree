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

import { unzipSync } from 'fflate';
import { RawArchiveInput, VirtualArchiveEntry } from './importerTypes';

const TEXT_EXTENSIONS = new Set([
  'csv',
  'tsv',
  'txt',
  'json',
  'xml',
  'htm',
  'html',
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

function decodeUtf8(bytes: Uint8Array): string {
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(bytes);
  // Strip UTF-8 BOM if present
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function looksMostlyText(bytes: Uint8Array): boolean {
  const sampleLen = Math.min(bytes.length, 512);
  if (sampleLen === 0) return true;
  let nullBytes = 0;
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) nullBytes++;
  }
  return nullBytes === 0;
}

/**
 * Unpacks one, two, or N uploaded `.zip` archives (including nested `.zip` archives if present)
 * alongside standalone `.csv`/`.json` files into a flat list of `VirtualArchiveEntry` items.
 * Binary photos/documents are flagged as `isMediaOrBinary: true` without wasting memory decoding them.
 */
export function extractVirtualEntries(
  inputs: RawArchiveInput[],
  maxDepth = 2
): VirtualArchiveEntry[] {
  const entries: VirtualArchiveEntry[] = [];

  const processBuffer = (archiveName: string, entryPath: string, bytes: Uint8Array, depth: number) => {
    if (isSystemJunkPath(entryPath)) return;
    const ext = getExtension(entryPath);
    const baseName = getBaseName(entryPath);

    // Unpack ZIP archives (and nested ZIPs up to maxDepth)
    if (ext === 'zip' && depth <= maxDepth) {
      const unzipped = unzipSync(bytes);
      for (const [innerPath, innerBytes] of Object.entries(unzipped)) {
        processBuffer(archiveName, innerPath, innerBytes, depth + 1);
      }
      return;
    }

    if (MEDIA_OR_BINARY_EXTENSIONS.has(ext)) {
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
      entries.push({
        archiveName,
        entryPath,
        baseName,
        extension: ext || 'txt',
        sizeBytes: bytes.byteLength,
        textContent: decodeUtf8(bytes),
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
 * Detects whether the header line uses `,`, `;`, or `\t` (handles Excel `sep=,` directives too).
 */
function detectDelimiter(headerSample: string): string {
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (let i = 0; i < headerSample.length; i++) {
    const ch = headerSample[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === ',') commas++;
      else if (ch === ';') semis++;
      else if (ch === '\t') tabs++;
    }
  }
  if (tabs > commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

/**
 * RFC-4180 compliant CSV / TSV parser supporting quoted multi-line notes, escaped `""`,
 * optional Excel `sep=,` first line, and normalized key lookup.
 */
export function parseDelimitedTable(rawText: string): ParsedDelimitedTable {
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return { headers: [], rows: [] };

  let forcedDelimiter: string | null = null;
  if (/^sep=.\n/i.test(text)) {
    forcedDelimiter = text[4];
    text = text.slice(6);
  }

  const firstNewline = text.indexOf('\n');
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);
  const delimiter = forcedDelimiter || detectDelimiter(firstLine);

  const matrix: string[][] = [];
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
        if (currentRow.some((cell) => cell.length > 0)) {
          matrix.push(currentRow);
        }
        currentRow = [];
      } else {
        currentCell += ch;
      }
    }
  }
  currentRow.push(currentCell.trim());
  if (currentRow.some((cell) => cell.length > 0)) {
    matrix.push(currentRow);
  }

  if (matrix.length === 0) return { headers: [], rows: [] };

  const rawHeaders = matrix[0].map((h, idx) => h.trim() || `column_${idx + 1}`);
  const rows: Array<Record<string, string>> = [];

  for (let r = 1; r < matrix.length; r++) {
    const values = matrix[r];
    const obj: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < rawHeaders.length; c++) {
      const val = (values[c] ?? '').trim();
      if (val !== '') hasValue = true;
      obj[rawHeaders[c]] = val;
    }
    if (hasValue) rows.push(obj);
  }

  return { headers: rawHeaders, rows };
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

/**
 * Normalizes diverse date strings (`YYYY-MM-DD`, `MM/DD/YYYY`, `M/D/YY`, `DD-MMM-YYYY`, ISO-8601)
 * into canonical `YYYY-MM-DD` (or `""` if empty/invalid).
 */
export function normalizeFlexibleDateIso(raw: string | undefined): string {
  const s = (raw || '').trim();
  if (!s) return '';

  // Already YYYY-MM-DD or ISO-8601 timestamp
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Slash or dash US/International numeric dates: M/D/YYYY or M/D/YY or YYYY/M/D
  const slashParts = s.split(/[/-]/);
  if (slashParts.length === 3) {
    const [p1, p2, p3] = slashParts.map((x) => x.trim());
    if (/^\d{4}$/.test(p1) && /^\d{1,2}$/.test(p2) && /^\d{1,2}$/.test(p3)) {
      return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
    }
    if (/^\d{1,2}$/.test(p1) && /^\d{1,2}$/.test(p2) && /^\d{2,4}$/.test(p3)) {
      let year = Number(p3);
      if (p3.length === 2) {
        year += year > 40 ? 1900 : 2000;
      }
      let month = Number(p1);
      let day = Number(p2);
      // If first number > 12, it must be DD/MM/YYYY
      if (month > 12 && day <= 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const verify = new Date(Date.UTC(year, month - 1, day));
        if (
          verify.getUTCFullYear() === year &&
          verify.getUTCMonth() === month - 1 &&
          verify.getUTCDate() === day
        ) {
          return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
    }
  }

  // Named month dates like "14 Nov 2025" or "Nov 14, 2025"
  const parsedMs = Date.parse(s);
  if (!Number.isNaN(parsedMs)) {
    const d = new Date(parsedMs);
    const hasExplicitTz = /(?:GMT|UTC|Z|[+-]\d{2}:?\d{2})\s*$/i.test(s);
    const yyyy = hasExplicitTz ? d.getUTCFullYear() : d.getFullYear();
    if (yyyy >= 1950 && yyyy <= 2100) {
      const mm = String((hasExplicitTz ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, '0');
      const dd = String(hasExplicitTz ? d.getUTCDate() : d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return '';
}

/**
 * Parses weights like `"8.5"`, `"8 lbs 4 oz"`, `"42 kg"`, `"3850 g"` + optional unit column into integer grams.
 */
export function parseFlexibleWeightToGrams(
  rawWeight: string | undefined,
  rawUnit?: string
): number {
  const s = (rawWeight || '').trim().toLowerCase();
  if (!s) return 0;

  // Check compound "8 lb 4 oz"
  const lbOz = s.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound|pounds)\s*(\d+(?:\.\d+)?)\s*(?:oz|ounce)/);
  if (lbOz) {
    const lbs = Number(lbOz[1]) || 0;
    const oz = Number(lbOz[2]) || 0;
    return Math.round((lbs + oz / 16) * 453.59237);
  }

  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return 0;
  const val = Number(numMatch[0]);
  if (!Number.isFinite(val) || val <= 0) return 0;

  const unitHint = `${s} ${(rawUnit || '').toLowerCase()}`;
  if (/\bkg|kilogram/.test(unitHint)) {
    return Math.round(val * 1000);
  }
  if (/\b(?:g|gm|gram|grams)\b/.test(unitHint) && !/\bkg/.test(unitHint)) {
    return Math.round(val);
  }
  if (/\boz|ounce/.test(unitHint) && !/\blb/.test(unitHint)) {
    return Math.round(val * 28.3495231);
  }
  // Default livestock/US HerdBoss convention is pounds (`lbs`) unless explicitly metric
  return Math.round(val * 453.59237);
}
