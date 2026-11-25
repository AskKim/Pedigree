/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Schema-Agnostic Delimited Table Parser & Value Normalizers (`@features/csv-importer/csvParser.ts`).
 */

import { bytesToUtf8String } from '@engine/binaryEncoding';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const DEFAULT_MAX_CSV_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_CSV_ROWS = 200_000;

export interface ParsedCsvTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

export function isSafeHeaderKey(key: string): boolean {
  return Boolean(key) && !DANGEROUS_KEYS.has(key);
}

export function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .replace(/#/g, 'number')
    .replace(/[^a-z0-9]+/g, '');
}

export function decodeCsvInput(input: string | Uint8Array): string {
  if (typeof input === 'string') {
    return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  }
  if (input.byteLength >= 3 && input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    return bytesToUtf8String(input.subarray(3));
  }
  const text = bytesToUtf8String(input);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(sample: string): string {
  const lines = sample.split('\n').slice(0, 6);
  let best = { commas: 0, semis: 0, tabs: 0, pipes: 0 };

  for (const line of lines) {
    if (!line.trim()) continue;
    let inQuotes = false;
    let commas = 0;
    let semis = 0;
    let tabs = 0;
    let pipes = 0;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === ',') commas += 1;
        else if (ch === ';') semis += 1;
        else if (ch === '\t') tabs += 1;
        else if (ch === '|') pipes += 1;
      }
    }
    if (tabs + semis + pipes + commas >= 2) {
      best = { commas, semis, tabs, pipes };
      break;
    }
    if (tabs + semis + pipes + commas > best.tabs + best.semis + best.pipes + best.commas) {
      best = { commas, semis, tabs, pipes };
    }
  }

  if (best.tabs > best.commas && best.tabs >= best.semis && best.tabs >= best.pipes) return '\t';
  if (best.pipes > best.commas && best.pipes >= best.semis && best.pipes >= best.tabs) return '|';
  if (best.semis > best.commas && best.semis >= best.tabs) return ';';
  return ',';
}

export function parseCsvTable(
  input: string | Uint8Array,
  limits: { maxBytes?: number; maxRows?: number } = {}
): ParsedCsvTable {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_CSV_BYTES;
  const maxRows = limits.maxRows ?? DEFAULT_MAX_CSV_ROWS;

  if (input instanceof Uint8Array && input.byteLength > maxBytes) {
    throw new Error(`CSV payload exceeds maximum byte limit (${maxBytes})`);
  }

  let text = decodeCsvInput(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (text.length > maxBytes) {
    throw new Error(`CSV text exceeds maximum byte limit (${maxBytes})`);
  }
  if (!text) return { headers: [], rows: [] };

  let forcedDelimiter: string | null = null;
  if (/^sep=.\n/i.test(text)) {
    forcedDelimiter = text[4];
    text = text.slice(6);
  }

  const delimiter = forcedDelimiter || detectDelimiter(text.slice(0, 4096));
  let headers: string[] | null = null;
  const rows: Array<Record<string, string>> = [];

  const finalizeHeaders = (cells: string[]): string[] => {
    const counts = new Map<string, number>();
    return cells.map((cell, idx) => {
      const clean = cell.replace(/[\r\n\t\u0000-\u001f]+/g, ' ').trim().slice(0, 200);
      const base = clean && isSafeHeaderKey(clean) ? clean : `column_${idx + 1}`;
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      return seen === 0 ? base : `${base} (${seen + 1})`;
    });
  };

  const commitRow = (cells: string[]) => {
    if (!cells.some((c) => c.length > 0)) return;
    if (!headers) {
      headers = finalizeHeaders(cells);
      return;
    }
    if (rows.length >= maxRows) {
      throw new Error(`CSV table exceeds maximum row limit (${maxRows})`);
    }
    const rowObj: Record<string, string> = Object.create(null);
    let hasNonEmpty = false;
    for (let i = 0; i < headers.length; i += 1) {
      const key = headers[i];
      if (!isSafeHeaderKey(key)) continue;
      const val = (cells[i] ?? '').replace(/\u0000/g, '').trim();
      if (val !== '') hasNonEmpty = true;
      rowObj[key] = val;
    }
    if (hasNonEmpty) {
      rows.push(rowObj);
    }
  };

  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n') {
      currentRow.push(currentCell.trim());
      currentCell = '';
      commitRow(currentRow);
      currentRow = [];
    } else {
      currentCell += ch;
    }
  }
  currentRow.push(currentCell.trim());
  commitRow(currentRow);

  return {
    headers: headers ?? [],
    rows,
  };
}

function formatUtcYmd(year: number, month: number, day: number): string {
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

export function normalizeDateStringIso(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    return formatUtcYmd(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  if (/^\d{5}(?:\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 10000 && serial <= 80000) {
      const d = new Date(Date.UTC(1899, 11, 30 + serial));
      return formatUtcYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
  }

  const numericMatch = s.match(/^(\d{1,4})[/. -](\d{1,2})[/. -](\d{1,4})(?:\s.*)?$/);
  if (numericMatch) {
    const [, p1, p2, p3] = numericMatch;
    if (/^\d{4}$/.test(p1)) {
      const formatted = formatUtcYmd(Number(p1), Number(p2), Number(p3));
      if (formatted) return formatted;
    }
    if (/^\d{2,4}$/.test(p3)) {
      let year = Number(p3);
      if (p3.length === 2) {
        year += year > 40 ? 1900 : 2000;
      }
      let month = Number(p1);
      let day = Number(p2);
      if (month > 12 && day <= 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }
      const formatted = formatUtcYmd(year, month, day);
      if (formatted) return formatted;
    }
  }

  const parsedMs = Date.parse(s);
  if (!Number.isNaN(parsedMs)) {
    const d = new Date(parsedMs);
    return formatUtcYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  return '';
}
