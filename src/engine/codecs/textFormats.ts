/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Shared Pure Text-Format Encoders (`@engine/codecs/textFormats`).
 *
 * Single source of truth for RFC-4180 CSV cell escaping and RFC-5545 iCalendar text/alarm
 * encoding, consumed by both `@features/*` modules and the Alpha 2 domain facades so the two
 * code paths can never drift. Zero domain terms, zero DOM dependencies.
 */

import { sanitizeCsvFormulaCell, sanitizePlainText } from '../primitives/sanitization';

/** UTF-8 Byte Order Mark so spreadsheet apps decode UTF-8 characters properly. */
export const CSV_UTF8_BOM = '\uFEFF';

/** Default per-cell character cap preserved from the Alpha 2 CSV exporter. */
export const DEFAULT_CSV_CELL_MAX_LENGTH = 20_000;

/**
 * Escapes a single CSV cell per RFC 4180 with formula-injection and control-character protection,
 * keeping at most `maxLength` characters of the raw value.
 */
export function escapeCsvCellWithLimit(value: unknown, maxLength: number): string {
  const safe = sanitizeCsvFormulaCell(sanitizePlainText(String(value ?? ''), maxLength));
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Single-argument escaper using the default cap; safe to pass directly to `Array.prototype.map`.
 */
export function escapeCsvCell(value: unknown): string {
  return escapeCsvCellWithLimit(value, DEFAULT_CSV_CELL_MAX_LENGTH);
}

/** Escapes RFC 5545 text values (backslashes, newlines, semicolons, commas). */
export function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Formats an RFC 5545 `VALARM` `TRIGGER` duration for `minutesBefore` >= 0. */
export function formatIcsAlarmTrigger(minutesBefore: number): string {
  const safeMinutes = Math.max(0, Math.round(Number(minutesBefore) || 0));
  if (safeMinutes === 0) return 'PT0S';
  if (safeMinutes % 1440 === 0) return `-P${safeMinutes / 1440}D`;
  if (safeMinutes % 60 === 0) return `-PT${safeMinutes / 60}H`;
  return `-PT${safeMinutes}M`;
}
