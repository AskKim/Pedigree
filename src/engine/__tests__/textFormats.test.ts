/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  CSV_UTF8_BOM,
  escapeCsvCell,
  escapeCsvCellWithLimit,
  escapeIcsText,
  formatIcsAlarmTrigger,
} from '../codecs/textFormats';

describe('Engine textFormats codecs', () => {
  it('exports UTF-8 BOM and escapes RFC-4180 CSV cells with formula protection', () => {
    expect(CSV_UTF8_BOM).toBe('\uFEFF');
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
  });

  it('is safe to pass escapeCsvCell directly to Array.prototype.map', () => {
    const row = ['alpha', 'beta', 'gamma', 'delta'];
    expect(row.map(escapeCsvCell)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('honors explicit maxLength via escapeCsvCellWithLimit', () => {
    expect(escapeCsvCellWithLimit('abcdefghij', 4)).toBe('abcd');
  });

  it('escapes RFC-5545 iCalendar text and formats VALARM triggers', () => {
    expect(escapeIcsText('Line1\r\nLine2; a,b\\c')).toBe('Line1\\nLine2\\; a\\,b\\\\c');
    expect(formatIcsAlarmTrigger(0)).toBe('PT0S');
    expect(formatIcsAlarmTrigger(15)).toBe('-PT15M');
    expect(formatIcsAlarmTrigger(120)).toBe('-PT2H');
    expect(formatIcsAlarmTrigger(2880)).toBe('-P2D');
  });
});
