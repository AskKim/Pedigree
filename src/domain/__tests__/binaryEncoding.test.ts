/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  base64ToBytesPure,
  binaryToDataUrl,
  bytesToBase64Pure,
  bytesToUtf8String,
  dataUrlToBinary,
  utf8StringToBytes,
} from '../../engine/binaryEncoding';

describe('binaryEncoding — pure RFC 3629 UTF-8 & base64 helpers', () => {
  const sampleStrings = [
    '',
    'Hello Pedigree 123!',
    'Café naïve résumé — 100% offline',
    '日本語テスト / 兎の血統書',
    '🐇🐐🐑 Barn #42 — Ω≈100%',
  ];

  it('round-trips UTF-8 strings with native TextEncoder/TextDecoder', () => {
    for (const s of sampleStrings) {
      const bytes = utf8StringToBytes(s);
      expect(bytesToUtf8String(bytes)).toBe(s);
    }
  });

  it('round-trips UTF-8 strings identically via pure RFC 3629 fallback without TextEncoder/TextDecoder', () => {
    const origEncoder = globalThis.TextEncoder;
    const origDecoder = globalThis.TextDecoder;
    try {
      // Simulate environments without TextEncoder/TextDecoder
      (globalThis as unknown as Record<string, unknown>).TextEncoder = undefined;
      (globalThis as unknown as Record<string, unknown>).TextDecoder = undefined;

      for (const s of sampleStrings) {
        const expected = new origEncoder().encode(s);
        const fallbackEncoded = utf8StringToBytes(s);
        expect(Array.from(fallbackEncoded)).toEqual(Array.from(expected));
        expect(bytesToUtf8String(fallbackEncoded)).toBe(s);
      }

      // Invalid standalone continuation byte decodes to replacement character U+FFFD
      expect(bytesToUtf8String(new Uint8Array([0x80]))).toBe('\ufffd');
    } finally {
      (globalThis as unknown as Record<string, unknown>).TextEncoder = origEncoder;
      (globalThis as unknown as Record<string, unknown>).TextDecoder = origDecoder;
    }
  });

  it('round-trips base64 and safe raster data URLs while blocking SVG smuggling', () => {
    const raw = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    const b64 = bytesToBase64Pure(raw);
    expect(Array.from(base64ToBytesPure(b64))).toEqual(Array.from(raw));

    const safeUrl = binaryToDataUrl('image/svg+xml', raw);
    expect(safeUrl.startsWith('data:image/webp;base64,')).toBe(true);
    const parsed = dataUrlToBinary(safeUrl);
    expect(parsed?.mimeType).toBe('image/webp');
    expect(Array.from(parsed?.bytes ?? [])).toEqual(Array.from(raw));
  });
});
