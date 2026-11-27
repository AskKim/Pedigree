/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Binary / Base64 / UTF-8 / Data-URL Encoding Helpers
 * (`src/engine/binaryEncoding.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) and zero `fflate`
 * dependencies so image optimizers and crypto helpers never pull ZIP archive code
 * into the initial startup bundle.
 */

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  table.fill(255);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Encodes a UTF-8 JavaScript string into bytes using `TextEncoder` when available,
 * with a pure RFC 3629 UTF-8 fallback (zero deprecated Annex B globals).
 */
export function utf8StringToBytes(text: string): Uint8Array {
  if (typeof TextEncoder === 'function') {
    return new TextEncoder().encode(text);
  }
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Decodes UTF-8 bytes into a JavaScript string using `TextDecoder` when available,
 * with a pure RFC 3629 UTF-8 fallback (zero deprecated Annex B globals).
 */
export function bytesToUtf8String(bytes: Uint8Array): string {
  if (typeof TextDecoder === 'function') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  const chars: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 <= 0x7f) {
      chars.push(String.fromCharCode(b0));
    } else if ((b0 & 0xe0) === 0xc0 && i < bytes.length) {
      const b1 = bytes[i++];
      const cp = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      chars.push(cp >= 0x80 ? String.fromCharCode(cp) : '\ufffd');
    } else if ((b0 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
      chars.push(cp >= 0x800 ? String.fromCharCode(cp) : '\ufffd');
    } else if ((b0 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b1 = bytes[i++];
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const cp =
        ((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      if (cp >= 0x10000 && cp <= 0x10ffff) {
        const offset = cp - 0x10000;
        chars.push(String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)));
      } else {
        chars.push('\ufffd');
      }
    } else {
      chars.push('\ufffd');
    }
  }
  return chars.join('');
}

/**
 * Pure TypeScript `Uint8Array` -> base64 string encoder (zero DOM `btoa` / Latin-1 limits).
 */
export function bytesToBase64Pure(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const chunks: string[] = [];
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < len;
    const hasB2 = i + 2 < len;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;

    const triplet = (b0 << 16) | (b1 << 8) | b2;
    chunks.push(
      BASE64_ALPHABET[(triplet >> 18) & 0x3f] +
        BASE64_ALPHABET[(triplet >> 12) & 0x3f] +
        (hasB1 ? BASE64_ALPHABET[(triplet >> 6) & 0x3f] : '=') +
        (hasB2 ? BASE64_ALPHABET[triplet & 0x3f] : '=')
    );
  }
  return chunks.join('');
}

/**
 * Pure TypeScript base64 string -> `Uint8Array` decoder.
 */
export function base64ToBytesPure(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.max(0, Math.floor((clean.length * 3) / 4) - pad);
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_LOOKUP[clean.charCodeAt(i)] ?? 0;
    const c1 = BASE64_LOOKUP[clean.charCodeAt(i + 1)] ?? 0;
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_LOOKUP[clean.charCodeAt(i + 2)] ?? 0;
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_LOOKUP[clean.charCodeAt(i + 3)] ?? 0;

    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triplet & 0xff;
  }
  return out;
}

/**
 * Extracts raw binary bytes and MIME type from a `data:image/...;base64,...` URI.
 */
export function dataUrlToBinary(
  dataUrl: string,
  fallbackMime = 'image/webp'
): { mimeType: string; bytes: Uint8Array } | null {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || fallbackMime;
  const payload = dataUrl.slice(commaIdx + 1);
  if (!header.includes(';base64')) {
    try {
      return { mimeType, bytes: utf8StringToBytes(decodeURIComponent(payload)) };
    } catch {
      return null;
    }
  }
  return { mimeType, bytes: base64ToBytesPure(payload) };
}

/**
 * Converts binary image bytes + MIME type back into a safe `data:image/...;base64,...` URI.
 * Blocks `image/svg+xml` payloads to avoid embedded script smuggling.
 */
export function binaryToDataUrl(mimeType: string, bytes: Uint8Array): string {
  const normalizedMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const isAllowedRaster =
    /^image\/(webp|jpeg|jpg|png|gif|avif|bmp)$/i.test(normalizedMime);
  const safeMime = isAllowedRaster ? normalizedMime : 'image/webp';
  return `data:${safeMime};base64,${bytesToBase64Pure(bytes)}`;
}
