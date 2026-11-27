/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Content-Agnostic Text, HTML, URL, ZIP-Bomb, SQLite Header & CSV Formula Sanitization Primitives
 * (`@engine/primitives/sanitization.ts`).
 *
 * Zero DOM, zero Node built-ins, zero domain terminology.
 */

import { unzipSync } from 'fflate';

export const MAX_PHOTO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_PHOTO_BATCH_COUNT = 50;
export const MAX_IMAGE_PIXEL_DIMENSION = 16_384;
export const MAX_IMAGE_TOTAL_PIXELS = 100_000_000;

export const MAX_JSON_BACKUP_BYTES = 150 * 1024 * 1024;
export const MAX_DELTA_JSON_BYTES = 50 * 1024 * 1024;
export const MAX_DELTA_BATCH_FILES = 50;
export const MAX_DELTA_BATCH_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_DELTA_OPERATIONS = 100_000;

export const MAX_ZIP_ARCHIVE_BYTES = 250 * 1024 * 1024;
export const MAX_EXTERNAL_IMPORT_FILES = 20;
export const MAX_EXTERNAL_IMPORT_TOTAL_BYTES = 300 * 1024 * 1024;

export const MAX_ZIP_ENTRY_BYTES = 150 * 1024 * 1024;
export const MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES = 400 * 1024 * 1024;
export const MAX_ZIP_ENTRY_COUNT = 5_000;

export const MAX_CSV_TEXT_BYTES = 50 * 1024 * 1024;
export const MAX_CSV_ROWS = 200_000;
export const MAX_SQLITE_DB_BYTES = 250 * 1024 * 1024;

const SQLITE_HEADER_MAGIC = 'SQLite format 3\0';
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isSafeObjectKey(key: string): boolean {
  return Boolean(key) && !DANGEROUS_KEYS.has(key);
}

export function isSafeRecordKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && !DANGEROUS_KEYS.has(key);
}

export function formatReadableByteLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

export function stripControlChars(input: string, preserveNewlines = false): string {
  const value = String(input ?? '');
  if (preserveNewlines) {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  }
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ');
}

/**
 * Strips NUL bytes, unsafe C0/C1 control characters (preserving `\t`, `\n`, `\r`),
 * bidirectional overrides, and unpaired UTF-16 surrogates, while keeping valid emojis.
 */
export function sanitizePlainText(value: unknown, maxLen = 20_000): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  let out = '';

  for (let i = 0; i < raw.length && out.length < maxLen; i++) {
    const code = raw.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 1 < raw.length) {
        const low = raw.charCodeAt(i + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          if (out.length + 2 > maxLen) break;
          out += raw[i] + raw[i + 1];
          i++;
        }
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      continue;
    }
    if (code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      continue;
    }
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      continue;
    }

    out += raw[i];
  }

  return out;
}

export function sanitizeSingleLineText(value: unknown, maxLen = 500): string {
  return sanitizePlainText(value, maxLen)
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

export function validateUploadFileSize(
  fileName: string,
  byteSize: number,
  maxBytes: number,
  kindLabel: string
): { ok: true } | { ok: false; error: string } {
  const safeName = sanitizeSingleLineText(fileName || 'selected file', 180) || 'selected file';
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return {
      ok: false,
      error: `Could not read "${safeName}": invalid file size reported.`,
    };
  }
  if (byteSize === 0) {
    return {
      ok: false,
      error: `File "${safeName}" is empty (0 bytes) and cannot be imported.`,
    };
  }
  if (byteSize > maxBytes) {
    return {
      ok: false,
      error: `File "${safeName}" is ${formatReadableByteLimit(byteSize)}, which exceeds the rational ${formatReadableByteLimit(maxBytes)} limit for ${kindLabel}. Check that you selected the intended file.`,
    };
  }
  return { ok: true };
}

export function validateSqliteFileHeader(
  bytes: Uint8Array,
  fileName = 'database.sqlite'
): { ok: true } | { ok: false; error: string } {
  const safeName = sanitizeSingleLineText(fileName || 'database.sqlite', 180) || 'database.sqlite';
  const sizeCheck = validateUploadFileSize(
    safeName,
    bytes.byteLength,
    MAX_SQLITE_DB_BYTES,
    'a SQLite database'
  );
  if (!sizeCheck.ok) return sizeCheck;

  if (bytes.byteLength < 100) {
    return {
      ok: false,
      error: `File "${safeName}" is too small (${bytes.byteLength} bytes) to be a valid SQLite database.`,
    };
  }

  for (let i = 0; i < SQLITE_HEADER_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_HEADER_MAGIC.charCodeAt(i)) {
      return {
        ok: false,
        error: `File "${safeName}" does not have a valid SQLite 3 database header. Select a .sqlite or .db file exported by this app.`,
      };
    }
  }

  return { ok: true };
}

export interface SafeUnzipOptions {
  archiveName?: string;
  maxArchiveBytes?: number;
  maxEntries?: number;
  maxEntryBytes?: number;
  maxTotalUncompressedBytes?: number;
  entryFilter?: (entryPath: string) => boolean;
}

export function safeUnzipArchive(
  bytes: Uint8Array,
  options: SafeUnzipOptions = {}
): Record<string, Uint8Array> {
  const archiveName =
    sanitizeSingleLineText(options.archiveName || 'archive.zip', 180) || 'archive.zip';
  const maxArchiveBytes = options.maxArchiveBytes ?? MAX_ZIP_ARCHIVE_BYTES;
  const maxEntries = options.maxEntries ?? MAX_ZIP_ENTRY_COUNT;
  const maxEntryBytes = options.maxEntryBytes ?? MAX_ZIP_ENTRY_BYTES;
  const maxTotalUncompressedBytes =
    options.maxTotalUncompressedBytes ?? MAX_ZIP_UNCOMPRESSED_TOTAL_BYTES;
  const entryFilter = options.entryFilter;

  const sizeCheck = validateUploadFileSize(
    archiveName,
    bytes.byteLength,
    maxArchiveBytes,
    'a ZIP archive'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }

  let entryCount = 0;
  let declaredTotalBytes = 0;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter(file) {
        entryCount++;
        if (entryCount > maxEntries) {
          throw new Error(
            `ZIP archive "${archiveName}" contains more than ${maxEntries.toLocaleString()} entries and was rejected to prevent resource exhaustion.`
          );
        }
        const declaredSize = Number(file.originalSize) || 0;
        if (declaredSize > maxEntryBytes) {
          throw new Error(
            `Entry "${sanitizeSingleLineText(file.name, 120)}" inside "${archiveName}" expands to ${formatReadableByteLimit(declaredSize)}, exceeding the ${formatReadableByteLimit(maxEntryBytes)} per-file limit.`
          );
        }
        declaredTotalBytes += declaredSize;
        if (declaredTotalBytes > maxTotalUncompressedBytes) {
          throw new Error(
            `ZIP archive "${archiveName}" expands beyond the ${formatReadableByteLimit(maxTotalUncompressedBytes)} safety limit.`
          );
        }
        return entryFilter ? Boolean(entryFilter(file.name)) : true;
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('limit') || err.message.includes('entries'))
    ) {
      throw err;
    }
    throw new Error(
      `Could not open ZIP archive "${archiveName}". Ensure the file is a valid, uncorrupted .zip archive.`
    );
  }

  let actualTotalBytes = 0;
  const sanitizedMap: Record<string, Uint8Array> = Object.create(null);
  for (const [entryPath, entryBytes] of Object.entries(unzipped)) {
    if (!isSafeRecordKey(entryPath)) continue;
    if (entryBytes.byteLength > maxEntryBytes) {
      throw new Error(
        `Entry "${sanitizeSingleLineText(entryPath, 120)}" inside "${archiveName}" exceeds the ${formatReadableByteLimit(maxEntryBytes)} decompressed file limit.`
      );
    }
    actualTotalBytes += entryBytes.byteLength;
    if (actualTotalBytes > maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP archive "${archiveName}" decompressed to more than ${formatReadableByteLimit(maxTotalUncompressedBytes)} and was rejected.`
      );
    }
    sanitizedMap[entryPath] = entryBytes;
  }

  return sanitizedMap;
}

/**
 * Neutralizes spreadsheet formula injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`)
 * per OWASP CSV Injection guidelines while preserving purely negative numbers (`-12.5`).
 */
export function sanitizeCsvFormulaCell(rawText: string): string {
  const value = String(rawText ?? '');
  if (!value) return '';
  if (/^\s*-\d+(?:\.\d+)?\s*$/.test(value)) {
    return value;
  }
  const firstChar = value[0];
  const trimmedFirst = value.replace(/^\s+/, '')[0];
  if (
    firstChar === '=' ||
    firstChar === '+' ||
    firstChar === '-' ||
    firstChar === '@' ||
    firstChar === '\t' ||
    firstChar === '\r' ||
    trimmedFirst === '=' ||
    trimmedFirst === '+' ||
    trimmedFirst === '-' ||
    trimmedFirst === '@'
  ) {
    return `'${value}`;
  }
  return value;
}

export function escapeSafeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSvgImageInput(
  mimeOrDataUrl: string | undefined,
  fileName?: string,
  bytesPrefix?: Uint8Array
): boolean {
  if (mimeOrDataUrl && /svg/i.test(mimeOrDataUrl)) return true;
  if (fileName && /\.svgz?$/i.test(fileName.trim())) return true;
  if (bytesPrefix && bytesPrefix.length > 0) {
    const headLen = Math.min(bytesPrefix.length, 512);
    let head = '';
    for (let i = 0; i < headLen; i++) {
      const ch = bytesPrefix[i];
      if (ch === 0) break;
      head += String.fromCharCode(ch);
    }
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) return true;
  }
  return false;
}

export function sanitizeSafeRasterImageDataUrl(
  value: unknown,
  maxChars = 15_000_000
): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxChars) return '';
  const match = trimmed.match(
    /^data:image\/(png|jpe?g|pjpeg|webp|gif|avif|bmp);base64,([A-Za-z0-9+/=\s]+)$/i
  );
  if (!match) return '';
  const subtype = match[1].toLowerCase() === 'pjpeg' ? 'jpeg' : match[1].toLowerCase();
  const cleanPayload = match[2].replace(/\s+/g, '');
  if (!cleanPayload) return '';
  return `data:image/${subtype};base64,${cleanPayload}`;
}

export function sanitizeCssHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

export function sanitizeSafeExternalHttpUrl(raw: unknown, maxLen = 400): string {
  const clean = sanitizeSingleLineText(raw, maxLen);
  if (!clean) return '';
  if (/^(?:javascript|data|vbscript|file):/i.test(clean)) return '';
  const withScheme = /^https?:\/\//i.test(clean)
    ? clean
    : /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(clean)
    ? `https://${clean}`
    : '';
  if (!withScheme) return '';
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(withScheme)) return '';
  return withScheme;
}

export function sanitizePlainDictionary<T>(
  raw: unknown,
  coerceValue: (val: unknown) => T | undefined,
  maxEntries = 500
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= maxEntries) break;
    if (!isSafeRecordKey(k)) continue;
    const coerced = coerceValue(v);
    if (coerced !== undefined) {
      out[k] = coerced;
      count++;
    }
  }
  return out;
}

export function slugifySegment(value: string, fallback = 'export'): string {
  const clean = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}
