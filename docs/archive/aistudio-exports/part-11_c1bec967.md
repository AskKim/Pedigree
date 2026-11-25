# Codebase Export: AskKim/Pedigree (Part 11 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 13 (`src/core/qrCode.ts` -> `src/core/syncOutbox.ts`)
- **Index:** [index.md](./index.md)

---
## `src/core/qrCode.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript ISO/IEC 18004 QR Code Generator & Deep-Link Builder (`src/core/qrCode.ts`).
 *
 * Generates 100% offline, zero-dependency scannable QR codes (Versions 1–14, Byte mode,
 * EC Level M with automatic EC-L fallback for long URLs) as crisp single-path inline `<svg>`
 * strings suitable for 4"x2.25" thermal cage labels, 8-up US Letter cage card sheets,
 * and on-screen previews.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import { escapeSafeHtml } from './inputSanitization';
import type { Animal, CageLocation } from './models';

export type QrErrorCorrectionLevel = 'M' | 'L';

export interface QrMatrixResult {
  version: number;
  size: number;
  ecLevel: QrErrorCorrectionLevel;
  maskPattern: number;
  modules: boolean[][];
}

export interface QrSvgOptions {
  sizePx?: number;
  quietZone?: number;
  ariaLabel?: string;
  className?: string;
  ecLevel?: QrErrorCorrectionLevel;
  foreground?: string;
  background?: string;
}

export interface AppDeepLinkTarget {
  taskId: string;
  animalId: string;
  cageId: string;
  species: string;
  route: string;
  emergencyReset: boolean;
  hasDeepLink: boolean;
}

interface VersionEcSpec {
  version: number;
  totalCodewords: number;
  ecPerBlock: number;
  group1Blocks: number;
  group1Data: number;
  group2Blocks: number;
  group2Data: number;
}

// ISO/IEC 18004 Table 9 — Versions 1..14, Error Correction Level M (~15% recovery)
const VERSION_SPECS_M: readonly VersionEcSpec[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 10, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
  { version: 2, totalCodewords: 44, ecPerBlock: 16, group1Blocks: 1, group1Data: 28, group2Blocks: 0, group2Data: 0 },
  { version: 3, totalCodewords: 70, ecPerBlock: 26, group1Blocks: 1, group1Data: 44, group2Blocks: 0, group2Data: 0 },
  { version: 4, totalCodewords: 100, ecPerBlock: 18, group1Blocks: 2, group1Data: 32, group2Blocks: 0, group2Data: 0 },
  { version: 5, totalCodewords: 134, ecPerBlock: 24, group1Blocks: 2, group1Data: 43, group2Blocks: 0, group2Data: 0 },
  { version: 6, totalCodewords: 172, ecPerBlock: 16, group1Blocks: 4, group1Data: 27, group2Blocks: 0, group2Data: 0 },
  { version: 7, totalCodewords: 196, ecPerBlock: 18, group1Blocks: 4, group1Data: 31, group2Blocks: 0, group2Data: 0 },
  { version: 8, totalCodewords: 242, ecPerBlock: 22, group1Blocks: 2, group1Data: 38, group2Blocks: 2, group2Data: 39 },
  { version: 9, totalCodewords: 292, ecPerBlock: 22, group1Blocks: 3, group1Data: 36, group2Blocks: 2, group2Data: 37 },
  { version: 10, totalCodewords: 346, ecPerBlock: 26, group1Blocks: 4, group1Data: 43, group2Blocks: 1, group2Data: 44 },
  { version: 11, totalCodewords: 404, ecPerBlock: 30, group1Blocks: 1, group1Data: 50, group2Blocks: 4, group2Data: 51 },
  { version: 12, totalCodewords: 466, ecPerBlock: 22, group1Blocks: 6, group1Data: 36, group2Blocks: 2, group2Data: 37 },
  { version: 13, totalCodewords: 532, ecPerBlock: 22, group1Blocks: 8, group1Data: 37, group2Blocks: 1, group2Data: 38 },
  { version: 14, totalCodewords: 581, ecPerBlock: 24, group1Blocks: 4, group1Data: 40, group2Blocks: 5, group2Data: 41 },
];

// ISO/IEC 18004 Table 9 — Versions 1..14, Error Correction Level L (~7% recovery)
const VERSION_SPECS_L: readonly VersionEcSpec[] = [
  { version: 1, totalCodewords: 26, ecPerBlock: 7, group1Blocks: 1, group1Data: 19, group2Blocks: 0, group2Data: 0 },
  { version: 2, totalCodewords: 44, ecPerBlock: 10, group1Blocks: 1, group1Data: 34, group2Blocks: 0, group2Data: 0 },
  { version: 3, totalCodewords: 70, ecPerBlock: 15, group1Blocks: 1, group1Data: 55, group2Blocks: 0, group2Data: 0 },
  { version: 4, totalCodewords: 100, ecPerBlock: 20, group1Blocks: 1, group1Data: 80, group2Blocks: 0, group2Data: 0 },
  { version: 5, totalCodewords: 134, ecPerBlock: 26, group1Blocks: 1, group1Data: 108, group2Blocks: 0, group2Data: 0 },
  { version: 6, totalCodewords: 172, ecPerBlock: 18, group1Blocks: 2, group1Data: 68, group2Blocks: 0, group2Data: 0 },
  { version: 7, totalCodewords: 196, ecPerBlock: 20, group1Blocks: 2, group1Data: 78, group2Blocks: 0, group2Data: 0 },
  { version: 8, totalCodewords: 242, ecPerBlock: 24, group1Blocks: 2, group1Data: 97, group2Blocks: 0, group2Data: 0 },
  { version: 9, totalCodewords: 292, ecPerBlock: 30, group1Blocks: 2, group1Data: 116, group2Blocks: 0, group2Data: 0 },
  { version: 10, totalCodewords: 346, ecPerBlock: 18, group1Blocks: 2, group1Data: 68, group2Blocks: 2, group2Data: 69 },
  { version: 11, totalCodewords: 404, ecPerBlock: 20, group1Blocks: 4, group1Data: 81, group2Blocks: 0, group2Data: 0 },
  { version: 12, totalCodewords: 466, ecPerBlock: 24, group1Blocks: 2, group1Data: 92, group2Blocks: 2, group2Data: 93 },
  { version: 13, totalCodewords: 532, ecPerBlock: 26, group1Blocks: 4, group1Data: 107, group2Blocks: 0, group2Data: 0 },
  { version: 14, totalCodewords: 581, ecPerBlock: 30, group1Blocks: 3, group1Data: 115, group2Blocks: 1, group2Data: 116 },
];

// ISO/IEC 18004 Annex E — Alignment pattern center positions per version (1-indexed)
const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
];

function encodeUtf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input);
  }
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

/** GF(256) multiplication modulo primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D). */
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Computes the Reed-Solomon generator polynomial coefficients (excluding leading 1) of given degree. */
function computeRsGenerator(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Computes `ecCount` Reed-Solomon error correction bytes for a single data block. */
export function computeReedSolomonRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = computeRsGenerator(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecCount - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMultiply(gen[j], factor);
    }
    rem[ecCount - 1] = gfMultiply(gen[ecCount - 1], factor);
  }
  return rem;
}

function getSpecDataCapacityBytes(spec: VersionEcSpec): number {
  return spec.group1Blocks * spec.group1Data + spec.group2Blocks * spec.group2Data;
}

function selectVersionAndEc(
  payloadLength: number,
  preferredEc: QrErrorCorrectionLevel
): { spec: VersionEcSpec; ecLevel: QrErrorCorrectionLevel } {
  const candidates: Array<{ ecLevel: QrErrorCorrectionLevel; specs: readonly VersionEcSpec[] }> =
    preferredEc === 'L'
      ? [{ ecLevel: 'L', specs: VERSION_SPECS_L }]
      : [
          { ecLevel: 'M', specs: VERSION_SPECS_M },
          { ecLevel: 'L', specs: VERSION_SPECS_L },
        ];

  for (const group of candidates) {
    for (const spec of group.specs) {
      const charCountBits = spec.version <= 9 ? 8 : 16;
      const requiredBits = 4 + charCountBits + payloadLength * 8;
      const capacityBits = getSpecDataCapacityBytes(spec) * 8;
      if (requiredBits <= capacityBits) {
        return { spec, ecLevel: group.ecLevel };
      }
    }
  }
  throw new Error(
    `QR payload of ${payloadLength} bytes exceeds maximum supported Version 14 capacity.`
  );
}

function buildDataCodewords(payload: Uint8Array, spec: VersionEcSpec): Uint8Array {
  const capacityBytes = getSpecDataCapacityBytes(spec);
  const capacityBits = capacityBytes * 8;
  const bits: number[] = [];

  const pushBits = (value: number, bitLen: number) => {
    for (let i = bitLen - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  // Mode indicator: Byte mode = 0100
  pushBits(0b0100, 4);
  // Character count indicator
  pushBits(payload.length, spec.version <= 9 ? 8 : 16);
  // Byte payload
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) {
    bits.push(0);
  }
  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const bytes = new Uint8Array(capacityBytes);
  let byteIdx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i + b];
    }
    bytes[byteIdx++] = val;
  }

  // Pad remaining codewords with alternating 0xEC, 0x11
  let padToggle = false;
  while (byteIdx < capacityBytes) {
    bytes[byteIdx++] = padToggle ? 0x11 : 0xec;
    padToggle = !padToggle;
  }

  return bytes;
}

function interleaveBlocksWithEc(dataCodewords: Uint8Array, spec: VersionEcSpec): Uint8Array {
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < spec.group1Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + spec.group1Data);
    offset += spec.group1Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonRemainder(block, spec.ecPerBlock));
  }
  for (let i = 0; i < spec.group2Blocks; i++) {
    const block = dataCodewords.slice(offset, offset + spec.group2Data);
    offset += spec.group2Data;
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomonRemainder(block, spec.ecPerBlock));
  }

  const out = new Uint8Array(spec.totalCodewords);
  let outIdx = 0;
  const maxDataLen = Math.max(spec.group1Data, spec.group2Data);

  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < dataBlocks.length; b++) {
      if (i < dataBlocks[b].length) {
        out[outIdx++] = dataBlocks[b][i];
      }
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      out[outIdx++] = ecBlocks[b][i];
    }
  }

  return out;
}

function createBoolGrid(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array<boolean>(size).fill(false));
}

function drawFunctionPatterns(
  version: number,
  size: number
): { modules: boolean[][]; isFunction: boolean[][] } {
  const modules = createBoolGrid(size);
  const isFunction = createBoolGrid(size);

  const setFunctionModule = (r: number, c: number, isDark: boolean) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = isDark;
    isFunction[r][c] = true;
  };

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Three 7x7 Finder patterns + 1-module white separators
  const drawFinder = (centerR: number, centerC: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const r = centerR + dy;
        const c = centerC + dx;
        if (r >= 0 && r < size && c >= 0 && c < size) {
          setFunctionModule(r, c, dist !== 2 && dist !== 4);
        }
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(3, size - 4);
  drawFinder(size - 4, 3);

  // Alignment patterns (5x5)
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      // Skip corners overlapping the 3 finder patterns
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = centers[i];
      const cc = centers[j];
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunctionModule(cr + dy, cc + dx, dist !== 1);
        }
      }
    }
  }

  // Reserve Format Information modules (filled after mask selection)
  for (let i = 0; i <= 5; i++) {
    setFunctionModule(8, i, false);
    setFunctionModule(i, 8, false);
  }
  setFunctionModule(8, 7, false);
  setFunctionModule(8, 8, false);
  setFunctionModule(7, 8, false);
  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 1 - i, false);
  }
  for (let i = 0; i < 7; i++) {
    setFunctionModule(size - 1 - i, 8, false);
  }
  // Always-dark module at (4*V + 9, 8) = (size - 8, 8)
  setFunctionModule(size - 8, 8, true);

  // Version Information (18-bit Golay BCH code) for Version >= 7
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((versionBits >>> i) & 1) !== 0;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      setFunctionModule(b, a, bit);
      setFunctionModule(a, b, bit);
    }
  }

  return { modules, isFunction };
}

function placeDataCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: Uint8Array
): void {
  const size = modules.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    const upward = ((rightCol + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let dx = 0; dx < 2; dx++) {
        const col = rightCol - dx;
        if (!isFunction[row][col]) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark = ((codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          }
          modules[row][col] = dark;
          bitIdx += 1;
        }
      }
    }
  }
}

function shouldMaskFlip(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function writeFormatBits(
  modules: boolean[][],
  ecLevel: QrErrorCorrectionLevel,
  mask: number
): void {
  const size = modules.length;
  // Format EC indicator: L = 01, M = 00
  const ecBits = ecLevel === 'L' ? 0b01 : 0b00;
  const data = (ecBits << 3) | (mask & 0x7);
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bitAt = (idx: number) => ((bits >>> idx) & 1) !== 0;

  // Copy 1 (around top-left finder): bit 14 at (8,0) .. bit 0 at (0,8)
  for (let i = 0; i <= 5; i++) modules[8][i] = bitAt(14 - i);
  modules[8][7] = bitAt(8);
  modules[8][8] = bitAt(7);
  modules[7][8] = bitAt(6);
  for (let i = 0; i <= 5; i++) modules[5 - i][8] = bitAt(5 - i);

  // Copy 2 (bottom-left & top-right)
  for (let i = 0; i < 7; i++) modules[size - 1 - i][8] = bitAt(14 - i);
  for (let i = 0; i < 8; i++) modules[8][size - 8 + i] = bitAt(7 - i);
}

function computePenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

  // Rule 1: 5+ consecutive same-color modules in rows & columns
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }

  // Rule 2: 2x2 blocks of identical color
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const color = modules[r][c];
      if (
        color === modules[r][c + 1] &&
        color === modules[r + 1][c] &&
        color === modules[r + 1][c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 3: Finder-like 1:1:3:1:1 patterns bordered by 4 light modules
  const matchesFinderPattern = (seq: boolean[]): number => {
    let hits = 0;
    for (let i = 0; i <= seq.length - 11; i++) {
      const a =
        !seq[i] && !seq[i + 1] && !seq[i + 2] && !seq[i + 3] &&
        seq[i + 4] && !seq[i + 5] && seq[i + 6] && seq[i + 7] && seq[i + 8] && !seq[i + 9] && seq[i + 10];
      const b =
        seq[i] && !seq[i + 1] && seq[i + 2] && seq[i + 3] && seq[i + 4] && !seq[i + 5] && seq[i + 6] &&
        !seq[i + 7] && !seq[i + 8] && !seq[i + 9] && !seq[i + 10];
      if (a || b) hits += 1;
    }
    return hits * 40;
  };
  for (let r = 0; r < size; r++) {
    penalty += matchesFinderPattern(modules[r]);
  }
  for (let c = 0; c < size; c++) {
    const colArr: boolean[] = [];
    for (let r = 0; r < size; r++) colArr.push(modules[r][c]);
    penalty += matchesFinderPattern(colArr);
  }

  // Rule 4: Dark/light module ratio balance
  let darkCount = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) darkCount += 1;
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
}

/**
 * Encodes an arbitrary UTF-8 string (such as a local PWA deep link URL) into an
 * ISO/IEC 18004 QR code module matrix.
 */
export function encodeQrMatrix(
  text: string,
  preferredEc: QrErrorCorrectionLevel = 'M'
): QrMatrixResult {
  const payload = encodeUtf8Bytes(text);
  const { spec, ecLevel } = selectVersionAndEc(payload.length, preferredEc);
  const dataCodewords = buildDataCodewords(payload, spec);
  const finalCodewords = interleaveBlocksWithEc(dataCodewords, spec);
  const size = spec.version * 4 + 17;

  const { modules: baseModules, isFunction } = drawFunctionPatterns(spec.version, size);
  placeDataCodewords(baseModules, isFunction, finalCodewords);

  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((cell, c) => (!isFunction[r][c] && shouldMaskFlip(mask, r, c) ? !cell : cell))
    );
    writeFormatBits(candidate, ecLevel, mask);
    const penalty = computePenaltyScore(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = candidate;
    }
  }

  return {
    version: spec.version,
    size,
    ecLevel,
    maskPattern: bestMask,
    modules: bestModules,
  };
}

/**
 * Renders an ISO/IEC 18004 QR code as a crisp, print-safe single-path `<svg>` string.
 * Uses merged horizontal module runs to keep HTML/PDF size minimal.
 */
export function renderQrSvg(text: string, options?: QrSvgOptions): string {
  const cleanText = (text || '').trim();
  if (!cleanText) return '';

  const matrix = encodeQrMatrix(cleanText, options?.ecLevel ?? 'M');
  const quietZone = Math.max(2, Math.round(options?.quietZone ?? 4));
  const totalUnits = matrix.size + quietZone * 2;
  const sizePx = Math.max(32, Math.round(options?.sizePx ?? 96));
  const fg = options?.foreground ?? '#000000';
  const bg = options?.background ?? '#ffffff';
  const ariaLabel = escapeSafeHtml(options?.ariaLabel || 'Scannable QR code');
  const classAttr = options?.className ? ` class="${escapeSafeHtml(options.className)}"` : '';

  const pathSegments: string[] = [];
  for (let r = 0; r < matrix.size; r++) {
    const row = matrix.modules[r];
    let c = 0;
    while (c < matrix.size) {
      if (!row[c]) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < matrix.size && row[c]) {
        c += 1;
      }
      const runWidth = c - start;
      pathSegments.push(`M${start + quietZone} ${r + quietZone}h${runWidth}v1h-${runWidth}z`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalUnits} ${totalUnits}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" role="img" aria-label="${ariaLabel}"${classAttr}><rect width="${totalUnits}" height="${totalUnits}" fill="${escapeSafeHtml(bg)}"/><path d="${pathSegments.join('')}" fill="${escapeSafeHtml(fg)}"/></svg>`;
}

/**
 * Normalizes a base URL (`https://host/path`) by stripping query/hash fragments.
 */
export function normalizeAppBaseUrl(appBaseUrl: string | undefined): string {
  const clean = (appBaseUrl || '').trim().split(/[?#]/)[0];
  return clean;
}

/**
 * Builds a scannable local PWA deep link pointing straight to an animal's profile inside Herd.
 */
export function buildAnimalProfileDeepLink(
  appBaseUrl: string | undefined,
  animal: Pick<Animal, 'id' | 'species'>
): string {
  const base = normalizeAppBaseUrl(appBaseUrl);
  const id = (animal.id || '').trim();
  if (!base || !id) return '';
  const species = (animal.species || '').trim();
  const params = [`route=herd`];
  if (species) params.push(`species=${encodeURIComponent(species)}`);
  params.push(`animalId=${encodeURIComponent(id)}`);
  return `${base}?${params.join('&')}`;
}

/**
 * Builds a scannable local PWA deep link pointing straight to a cage/pen card on the Facility Board.
 */
export function buildCageBoardDeepLink(
  appBaseUrl: string | undefined,
  cage: Pick<CageLocation, 'id' | 'species'>
): string {
  const base = normalizeAppBaseUrl(appBaseUrl);
  const id = (cage.id || '').trim();
  if (!base || !id) return '';
  const species = (cage.species || '').trim();
  const params = [`route=dashboard`];
  if (species) params.push(`species=${encodeURIComponent(species)}`);
  params.push(`cageId=${encodeURIComponent(id)}`);
  return `${base}?${params.join('&')}`;
}

/**
 * Pure parser for startup deep-link URL query strings (`?route=herd&species=Rabbit&animalId=...`).
 */
export function parseAppDeepLinkParams(search: string | undefined | null): AppDeepLinkTarget {
  const raw = (search || '').trim().replace(/^\?/, '');
  const map = new Map<string, string>();
  if (raw) {
    for (const pair of raw.split('&')) {
      if (!pair) continue;
      const eqIdx = pair.indexOf('=');
      const rawKey = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
      const rawVal = eqIdx >= 0 ? pair.slice(eqIdx + 1) : '';
      try {
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' ')).trim();
        const val = decodeURIComponent(rawVal.replace(/\+/g, ' ')).trim();
        if (key && !map.has(key)) {
          map.set(key, val);
        }
      } catch {
        // Skip malformed percent-encoding gracefully
      }
    }
  }

  const taskId = map.get('taskId') || '';
  const animalId = map.get('animalId') || '';
  const cageId = map.get('cageId') || '';
  const species = map.get('species') || '';
  const route = map.get('route') || '';
  const emergencyReset = map.get('emergency_reset') === 'true';

  return {
    taskId,
    animalId,
    cageId,
    species,
    route,
    emergencyReset,
    hasDeepLink: Boolean(taskId || animalId || cageId || species || route),
  };
}
```

## `src/core/reportCatalog.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Planned Reports Catalog Builder.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or icon component dependencies.
 * Generates species-adapted report titles and descriptions strictly for species that have been
 * added to the user's barn (`speciesProfiles`), converting sex/age/birth/ID wording into
 * universal terms (`Male`, `Female`, `Non-Adults (Male & Female)`, ID labels, and configured birth events).
 */

import { getSpeciesIdentifierLabels, SpeciesProfile } from './models';

export type ReportIconKey =
  | 'calendar'
  | 'roster'
  | 'tag'
  | 'income'
  | 'weight'
  | 'breeding'
  | 'medicine'
  | 'health'
  | 'ultrasound'
  | 'alert'
  | 'offspring'
  | 'users'
  | 'ownership';

export interface ReportCatalogEntrySpec {
  id: string;
  title: string;
  category: string;
  description: string;
  scopeLabel: string;
  iconKey: ReportIconKey;
}

/**
 * Builds the planned report catalog for a single configured `SpeciesProfile`.
 * Removes hardcoded livestock/species jargon (`Herd`, `Kidding`, `Buck`, `Doe`, `Kid`, `FAMACHA`)
 * in favor of Male / Female / Non-Adults (Male & Female) and the added species' own identifiers.
 */
export function buildReportCatalogForSpecies(
  speciesProfile: SpeciesProfile
): ReportCatalogEntrySpec[] {
  const spName = speciesProfile.name;
  const spLower = spName.toLowerCase();
  const birthLabel = (speciesProfile.birthEventLabel || 'Birth').trim() || 'Birth';
  const birthLower = birthLabel.toLowerCase();
  const idLabels = getSpeciesIdentifierLabels(spName);
  const idLower = idLabels.shortLabel.toLowerCase();
  const scopeLabel = `${spName} Only`;

  return [
    {
      id: 'birth-calendar-marks',
      title: `${birthLabel} Calendar (By ID)`,
      category: 'Calendar',
      description: `Upcoming ${spLower} ${birthLower} schedule sorted by ${idLower}`,
      scopeLabel,
      iconKey: 'calendar',
    },
    {
      id: 'birth-calendar-ultrasounds',
      title: `${birthLabel} Calendar (Ultrasounds)`,
      category: 'Calendar',
      description: `Projected ${spLower} ${birthLower} dates paired with ultrasound confirmation notes`,
      scopeLabel,
      iconKey: 'calendar',
    },
    {
      id: 'roster-report',
      title: `${spName} Roster Report`,
      category: 'Inventory',
      description: `Full roster summary of active ${spLower} animals (adult & non-adult, male & female)`,
      scopeLabel,
      iconKey: 'roster',
    },
    {
      id: 'label-report',
      title: 'ID Tags & Housing Labels Report',
      category: 'Identification',
      description: `Printable ${spLower} housing cards, ${idLower} labels, and record stickers`,
      scopeLabel,
      iconKey: 'tag',
    },
    {
      id: 'male-income-report',
      title: 'Male Income Report',
      category: 'Financial',
      description: `Stud/service fees, sales, and revenue attributed to ${spLower} males`,
      scopeLabel,
      iconKey: 'income',
    },
    {
      id: 'female-income-report',
      title: 'Female Income Report',
      category: 'Financial',
      description: `Offspring sales and income generated by ${spLower} females`,
      scopeLabel,
      iconKey: 'income',
    },
    {
      id: 'unmarked-report',
      title: 'Unidentified / Missing ID Report',
      category: 'Identification',
      description: `${spName} records still awaiting ${idLower} or permanent registration numbers`,
      scopeLabel,
      iconKey: 'tag',
    },
    {
      id: 'weight-gain-report',
      title: 'Weight Gain Report',
      category: 'Growth',
      description: `${spName} weight check history and average daily gain progression`,
      scopeLabel,
      iconKey: 'weight',
    },
    {
      id: 'breeding-history-report',
      title: 'Breeding History Report',
      category: 'Breeding',
      description: `${spName} pairing outcomes, conception rates, and offspring counts over time`,
      scopeLabel,
      iconKey: 'breeding',
    },
    {
      id: 'litter-survival-performance-report',
      title: 'Litter Survival & Parent Performance Report',
      category: 'Breeding',
      description: `Live-birth survival, weaning survival, and 3w/6w/8w weight-gain milestones per ${spLower} female & male`,
      scopeLabel,
      iconKey: 'breeding',
    },
    {
      id: 'medicine-report',
      title: 'Medicine & Treatment Report',
      category: 'Health',
      description: `Treatments, dosages, withdrawal periods, and health care log entries for ${spName}`,
      scopeLabel,
      iconKey: 'medicine',
    },
    {
      id: 'health-score-report',
      title: 'Body Condition & Parasite Score Report',
      category: 'Health',
      description: `Body condition scores (BCS) and species parasite check scores where applicable for ${spName}`,
      scopeLabel,
      iconKey: 'health',
    },
    {
      id: 'ultrasound-report',
      title: 'Ultrasound & Pregnancy Scan Report',
      category: 'Breeding',
      description: `Pregnancy scan results, estimated offspring counts, and check dates for ${spName}`,
      scopeLabel,
      iconKey: 'ultrasound',
    },
    {
      id: 'death-report',
      title: 'Mortality / Loss Report',
      category: 'Losses',
      description: `${spName} mortality log with dates, ages (adult vs. non-adult), and recorded causes`,
      scopeLabel,
      iconKey: 'alert',
    },
    {
      id: 'sold-stock-report',
      title: `Sold ${spName} Report`,
      category: 'Sales',
      description: `Archived sale records, transfer dates, and buyer notes for ${spName}`,
      scopeLabel,
      iconKey: 'income',
    },
    {
      id: 'non-adult-report',
      title: 'Non-Adults (Male & Female) Report',
      category: 'Inventory',
      description: `Young ${spLower} stock separated by male and female, birth weights, and weaning status`,
      scopeLabel,
      iconKey: 'offspring',
    },
    {
      id: 'male-report',
      title: 'Male Report',
      category: 'Inventory',
      description: `Active and reference ${spLower} males (adult & non-adult filterable) with breeding and show summaries`,
      scopeLabel,
      iconKey: 'users',
    },
    {
      id: 'female-report',
      title: 'Female Report',
      category: 'Inventory',
      description: `Active and reference ${spLower} females (adult & non-adult filterable) with production summaries`,
      scopeLabel,
      iconKey: 'users',
    },
    {
      id: 'cull-report',
      title: 'Cull Decision Report',
      category: 'Management Decisions',
      description: `${spName} animals flagged for culling with reason notes and disposition status`,
      scopeLabel,
      iconKey: 'alert',
    },
    {
      id: 'id-mark-crossref-report',
      title: 'ID Cross-Reference Report',
      category: 'Identification',
      description: `Cross-reference of ${idLower}, registration numbers, and names for ${spName}`,
      scopeLabel,
      iconKey: 'tag',
    },
    {
      id: 'breed-with-report',
      title: 'Breed With Compatibility Report',
      category: 'Breeding',
      description: `Suggested ${spLower} pairings screened for lineage diversity and Wright COI`,
      scopeLabel,
      iconKey: 'breeding',
    },
    {
      id: 'my-owned-stock-report',
      title: `My Owned ${spName} Report`,
      category: 'Ownership',
      description: `${spName} animals currently owned and housed in your barn (adult & non-adult)`,
      scopeLabel,
      iconKey: 'ownership',
    },
    {
      id: 'outside-reference-stock-report',
      title: `Outside / Reference ${spName} Report`,
      category: 'Ownership',
      description: `Outside males, females, and pedigree-only reference ${spLower} records`,
      scopeLabel,
      iconKey: 'ownership',
    },
    {
      id: 'barn-economics-report',
      title: `${spName} Economics & P&L Margin Report`,
      category: 'Financial',
      description: `Revenue, categorized barn expenses, feed allocation costs, and net P&L margins for ${spLower}`,
      scopeLabel,
      iconKey: 'income',
    },
    {
      id: 'meat-pelt-yield-report',
      title: `${spName} Meat & Pelt Yield Report`,
      category: 'Production',
      description: `Scheduled butcher dates, harvest live/dressed weights, carcass dress-out %, and pelt grades for ${spLower}`,
      scopeLabel,
      iconKey: 'weight',
    },
    {
      id: 'youth-project-report',
      title: `4-H / FFA Youth Project Books (${spName})`,
      category: 'Youth / 4-H / FFA',
      description: `Youth project feed logs, project expenses/income, inventory change, and net returns for ${spLower}`,
      scopeLabel,
      iconKey: 'roster',
    },
    {
      id: 'crm-waitlist-report',
      title: `Buyer Waitlist Queue (${spName})`,
      category: 'Sales & CRM',
      description: `Prioritized buyer waitlist inquiries, desired breeds/varieties, follow-up dates, and contact methods for ${spLower}`,
      scopeLabel,
      iconKey: 'users',
    },
    {
      id: 'crm-reservations-deposits-report',
      title: `Reservations & Deposit Tracking (${spName})`,
      category: 'Sales & CRM',
      description: `Active holds, deposits collected, remaining balances, and scheduled pickup dates for ${spLower}`,
      scopeLabel,
      iconKey: 'income',
    },
  ];
}
```

## `src/core/reportGenerators.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Per-Species Report Generators (`src/core/reportGenerators.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 * Generates structured tables, summary metrics, UTF-8 CSVs, and printable `.HTM`
 * reports strictly scoped to species present in `snapshot.speciesProfiles`.
 */

import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisksFromAnalyses,
  AnimalCarrierLineageAnalysis,
} from './carrierGenetics';
import { escapeCsvCell, UTF8_BOM } from './csvExport';
import {
  addDaysIso,
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  BreedingRecord,
  CareLog,
  formatBreedingStatusForSpecies,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isAnimalActive,
  isAnimalNonAdult,
  isSameSpecies,
  normalizeCurrencyCode,
  normalizeOwnershipType,
  pluralizeSpeciesLabel,
  resolveSpeciesWeightUnit,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from './models';
import { evaluateLitterSurvivalAndMilestones } from './growthAnalytics';
import {
  buildSpeciesHerdMap,
  createSpeciesCoiEvaluator,
} from './pedigreeCalculator';
import {
  calculateDressOutPercent,
  computeAnimalProfitMargins,
  evaluateProcessingSummary,
  evaluateSpeciesEconomicsSummary,
  evaluateYouthProjectSummary,
  getLedgerCategoryLabel,
} from './economicsLedger';
import { buildReportCatalogForSpecies, ReportCatalogEntrySpec } from './reportCatalog';
import { computeAnimalShowSummary } from './showResults';
import { evaluateReservationFinancials, formatPreferredContactLabel } from './clientCrm';

export type ReportAudienceFilter =
  | 'All'
  | 'Male'
  | 'Female'
  | 'Non-Adult Male'
  | 'Non-Adult Female';

export const REPORT_AUDIENCE_FILTERS: ReadonlyArray<{
  value: ReportAudienceFilter;
  label: string;
}> = [
  { value: 'All', label: 'All (Male & Female)' },
  { value: 'Male', label: 'Male (All Ages)' },
  { value: 'Female', label: 'Female (All Ages)' },
  { value: 'Non-Adult Male', label: 'Non-Adult Male' },
  { value: 'Non-Adult Female', label: 'Non-Adult Female' },
];

export interface ReportGenerationOptions {
  filter?: ReportAudienceFilter;
  dateFromIso?: string;
  dateToIso?: string;
  referenceDateIso?: string;
  subjectAnimalId?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export interface ReportRow {
  id: string;
  cells: Record<string, string | number>;
  animalId?: string;
  highlightTone?: 'normal' | 'warning' | 'danger' | 'success';
}

export interface ReportSummaryMetric {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}

export interface GeneratedReport {
  reportId: string;
  title: string;
  category: string;
  description: string;
  speciesName: string;
  speciesAdded: boolean;
  audienceFilter: ReportAudienceFilter;
  generatedAtDateIso: string;
  weightUnit: WeightUnit;
  currencyCode: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summaryMetrics: ReportSummaryMetric[];
  emptyMessage: string;
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifySegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function parseIsoUtcMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [yStr, mStr, dStr] = iso.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function diffDaysIso(fromIso: string | undefined, toIso: string | undefined): number | null {
  const a = parseIsoUtcMs(fromIso);
  const b = parseIsoUtcMs(toIso);
  if (a === null || b === null || b < a) return null;
  return Math.floor((b - a) / 86_400_000);
}

function formatAgeSummary(days: number | null): string {
  if (days === null) return 'Unknown';
  if (days < 60) return `${days} d`;
  if (days < 730) return `${(days / 30.4375).toFixed(1)} mo (${days} d)`;
  return `${(days / 365.25).toFixed(1)} yr (${days} d)`;
}

function isIsoWithinRange(
  dateIso: string | undefined,
  fromIso?: string,
  toIso?: string
): boolean {
  const f = (fromIso || '').trim();
  const t = (toIso || '').trim();
  if (!f && !t) return true;
  const target = (dateIso || '').trim();
  if (!target) return false;
  if (f && target < f) return false;
  if (t && target > t) return false;
  return true;
}

function matchesAudienceFilter(
  animal: Animal | undefined,
  filter: ReportAudienceFilter,
  speciesProfile: SpeciesProfile,
  referenceDateIso: string
): boolean {
  if (filter === 'All') return true;
  if (!animal) return false;
  if (filter === 'Male') return animal.sex === 'Male';
  if (filter === 'Female') return animal.sex === 'Female';
  if (filter === 'Non-Adult Male') {
    return animal.sex === 'Male' && isAnimalNonAdult(animal, speciesProfile, referenceDateIso);
  }
  if (filter === 'Non-Adult Female') {
    return animal.sex === 'Female' && isAnimalNonAdult(animal, speciesProfile, referenceDateIso);
  }
  return true;
}

function formatAnimalRef(animal: Animal | undefined, fallbackName = ''): string {
  if (!animal) return fallbackName || '—';
  const name = (animal.name || '').trim();
  const tattoo = (animal.tattoo || '').trim();
  if (name && tattoo) return `${name} (${tattoo})`;
  return name || tattoo || 'Unnamed';
}

function formatStageLabel(
  animal: Animal,
  speciesProfile: SpeciesProfile,
  referenceDateIso: string
): 'Adult' | 'Non-Adult' {
  return isAnimalNonAdult(animal, speciesProfile, referenceDateIso) ? 'Non-Adult' : 'Adult';
}

function formatWeightRatePerDay(gramsPerDay: number, unit: WeightUnit): string {
  if (!Number.isFinite(gramsPerDay)) return '—';
  const sign = gramsPerDay < 0 ? '-' : '';
  const abs = Math.abs(gramsPerDay);
  if (unit === 'grams') return `${sign}${abs.toFixed(1)} g/day`;
  if (unit === 'kg') return `${sign}${(abs / 1000).toFixed(3)} kg/day`;
  return `${sign}${(abs / 453.59237).toFixed(3)} lb/day (${sign}${abs.toFixed(1)} g/day)`;
}

function formatSignedWeightDelta(deltaGrams: number, unit: WeightUnit): string {
  if (!Number.isFinite(deltaGrams) || deltaGrams === 0) return '0';
  const prefix = deltaGrams > 0 ? '+' : '-';
  return `${prefix}${formatWeight(Math.abs(deltaGrams), unit)}`;
}

function buildMissingSpeciesReport(
  speciesName: string,
  reportId: string,
  filter: ReportAudienceFilter,
  referenceDateIso: string,
  currencyCode: string,
  preferredUnit: WeightUnit
): GeneratedReport {
  return {
    reportId,
    title: 'Species Not Added',
    category: 'Unavailable',
    description: `${speciesName || 'Requested species'} has not been added to this barn.`,
    speciesName,
    speciesAdded: false,
    audienceFilter: filter,
    generatedAtDateIso: referenceDateIso,
    weightUnit: preferredUnit,
    currencyCode,
    columns: [{ key: 'notice', label: 'Notice' }],
    rows: [],
    summaryMetrics: [
      { label: 'Species Status', value: 'Not Added to Barn', tone: 'warning' },
    ],
    emptyMessage: `${speciesName || 'This species'} has not been added to your barn. Only configured species reports can be generated.`,
  };
}

interface ReportContext {
  snapshot: BarnDatabaseSnapshot;
  speciesProfile: SpeciesProfile;
  spec: ReportCatalogEntrySpec;
  filter: ReportAudienceFilter;
  dateFromIso: string;
  dateToIso: string;
  referenceDateIso: string;
  subjectAnimalId: string;
  weightUnit: WeightUnit;
  currencyCode: string;
  idShortLabel: string;
  birthLabel: string;
  offspringPlural: string;
  speciesAnimals: Animal[];
  animalById: Map<string, Animal>;
  speciesBreedings: BreedingRecord[];
  speciesCareLogs: CareLog[];
  speciesShows: ShowEvent[];
  herdMap: Map<string, Animal>;
}

/**
 * Generates a complete structured report for a single species present in `snapshot.speciesProfiles`.
 * Strictly refuses to leak or invent data for unadded species.
 */
export function generateSpeciesReport(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string,
  reportId: string,
  options: ReportGenerationOptions = {}
): GeneratedReport {
  const filter: ReportAudienceFilter = options.filter || 'All';
  const referenceDateIso = (options.referenceDateIso || '').trim() || todayDateIso();
  const dateFromIso = (options.dateFromIso || '').trim();
  const dateToIso = (options.dateToIso || '').trim();
  const subjectAnimalId = (options.subjectAnimalId || '').trim();
  const currencyCode = normalizeCurrencyCode(snapshot.settings.currencyCode, 'USD');

  const speciesProfile = snapshot.speciesProfiles.find((sp) =>
    isSameSpecies(sp.name, speciesName)
  );
  if (!speciesProfile) {
    return buildMissingSpeciesReport(
      speciesName,
      reportId,
      filter,
      referenceDateIso,
      currencyCode,
      snapshot.settings.preferredUnit
    );
  }

  const catalog = buildReportCatalogForSpecies(speciesProfile);
  const spec: ReportCatalogEntrySpec = catalog.find((entry) => entry.id === reportId) || {
    id: reportId,
    title: `${speciesProfile.name} Report`,
    category: 'General',
    description: `Generated ${speciesProfile.name.toLowerCase()} report`,
    scopeLabel: `${speciesProfile.name} Only`,
    iconKey: 'roster',
  };

  const weightUnit = resolveSpeciesWeightUnit(speciesProfile, snapshot.settings);
  const idShortLabel = getSpeciesIdentifierLabels(speciesProfile.name).shortLabel;
  const birthLabel = (speciesProfile.birthEventLabel || 'Birth').trim() || 'Birth';
  const offspringPlural = pluralizeSpeciesLabel(speciesProfile.offspringLabel || 'Offspring');

  const speciesAnimals = snapshot.animals.filter((a) =>
    isSameSpecies(a.species, speciesProfile.name)
  );
  const animalById = new Map<string, Animal>();
  for (const animal of speciesAnimals) {
    animalById.set(animal.id, animal);
  }

  const speciesBreedings = snapshot.breedings.filter((b) =>
    isSameSpecies(b.species, speciesProfile.name)
  );

  // Scope careLogs strictly to this species (never leak logs tagged with another species)
  const speciesCareLogs = snapshot.careLogs.filter((l) => {
    const hasLogSpecies = Boolean((l.species || '').trim());
    if (hasLogSpecies) {
      return isSameSpecies(l.species, speciesProfile.name);
    }
    return animalById.has(l.animalId);
  });

  const speciesShows = (snapshot.shows ?? []).filter((s) =>
    isSameSpecies(s.species, speciesProfile.name)
  );

  const herdMap = buildSpeciesHerdMap(speciesAnimals, speciesProfile.name);

  const ctx: ReportContext = {
    snapshot,
    speciesProfile,
    spec,
    filter,
    dateFromIso,
    dateToIso,
    referenceDateIso,
    subjectAnimalId,
    weightUnit,
    currencyCode,
    idShortLabel,
    birthLabel,
    offspringPlural,
    speciesAnimals,
    animalById,
    speciesBreedings,
    speciesCareLogs,
    speciesShows,
    herdMap,
  };

  const built = buildReportBody(ctx);

  return {
    reportId: spec.id,
    title: spec.title,
    category: spec.category,
    description: spec.description,
    speciesName: speciesProfile.name,
    speciesAdded: true,
    audienceFilter: filter,
    generatedAtDateIso: referenceDateIso,
    weightUnit,
    currencyCode,
    columns: built.columns,
    rows: built.rows,
    summaryMetrics: built.summaryMetrics,
    emptyMessage:
      built.emptyMessage ||
      `No ${speciesProfile.name.toLowerCase()} records matched this report${
        filter !== 'All' ? ` (${filter})` : ''
      }.`,
  };
}

interface ReportBody {
  columns: ReportColumn[];
  rows: ReportRow[];
  summaryMetrics: ReportSummaryMetric[];
  emptyMessage?: string;
}

function buildReportBody(ctx: ReportContext): ReportBody {
  const {
    speciesProfile,
    filter,
    dateFromIso,
    dateToIso,
    referenceDateIso,
    subjectAnimalId,
    weightUnit,
    currencyCode,
    idShortLabel,
    birthLabel,
    offspringPlural,
    speciesAnimals,
    animalById,
    speciesBreedings,
    speciesCareLogs,
    herdMap,
  } = ctx;

  const spShows = ctx.snapshot.shows.filter((s) =>
    isSameSpecies(s.species, speciesProfile.name)
  );

  const matchesFilter = (animal: Animal | undefined): boolean =>
    matchesAudienceFilter(animal, filter, speciesProfile, referenceDateIso);

  const matchesBreedingFilter = (b: BreedingRecord): boolean => {
    if (filter === 'All') return true;
    const sire = b.sireId ? animalById.get(b.sireId) : undefined;
    const dam = b.damId ? animalById.get(b.damId) : undefined;
    if (filter === 'Male' || filter === 'Non-Adult Male') {
      return matchesAudienceFilter(sire, filter, speciesProfile, referenceDateIso);
    }
    return matchesAudienceFilter(dam, filter, speciesProfile, referenceDateIso);
  };

  switch (ctx.spec.id) {
    // 1. Birth Calendar (By ID)
    case 'birth-calendar-marks': {
      const upcoming = speciesBreedings
        .filter((b) => {
          const isUpcoming =
            b.status === 'Planned' ||
            b.status === 'Bred' ||
            b.status === 'Palpated Positive' ||
            (b.ultrasoundResult === 'Positive' && b.status !== 'Born' && b.status !== 'Weaned' && b.status !== 'Missed');
          if (!isUpcoming) return false;
          const dueIso = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
          return (
            isIsoWithinRange(dueIso, dateFromIso, dateToIso) &&
            matchesBreedingFilter(b)
          );
        })
        .sort((a, b) => {
          const damA = animalById.get(a.damId);
          const damB = animalById.get(b.damId);
          const idCmp = (damA?.tattoo || '').localeCompare(damB?.tattoo || '');
          if (idCmp !== 0) return idCmp;
          return (a.expectedDueDateIso || '').localeCompare(b.expectedDueDateIso || '');
        });

      const rows: ReportRow[] = upcoming.map((b) => {
        const dam = animalById.get(b.damId);
        const sire = animalById.get(b.sireId);
        const projected = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
        const usSummary = b.ultrasoundResult
          ? `${b.ultrasoundResult}${b.ultrasoundFetalCount ? ` (${b.ultrasoundFetalCount})` : ''}`
          : '—';
        return {
          id: b.id,
          animalId: dam?.id,
          cells: {
            damIdTag: dam?.tattoo || 'Unmarked',
            damName: dam?.name || b.damName || 'Unknown',
            sireName: formatAnimalRef(sire, b.sireName),
            bredDate: formatReadableDate(b.bredDateIso),
            dueDate: formatReadableDate(projected),
            status: formatBreedingStatusForSpecies(b.status, speciesProfile),
            ultrasound: usSummary,
            housing: dam?.cageLocation || 'Unassigned',
          },
        };
      });

      const dueSoonCount = upcoming.filter((b) => {
        const due = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
        const delta = diffDaysIso(referenceDateIso, due);
        return delta !== null && delta <= 7;
      }).length;

      return {
        columns: [
          { key: 'damIdTag', label: `Female ${idShortLabel}` },
          { key: 'damName', label: 'Female Name' },
          { key: 'sireName', label: 'Paired Male' },
          { key: 'bredDate', label: 'Bred Date' },
          { key: 'dueDate', label: `Projected ${birthLabel}` },
          { key: 'status', label: 'Status' },
          { key: 'ultrasound', label: 'Ultrasound' },
          { key: 'housing', label: 'Housing' },
        ],
        rows,
        summaryMetrics: [
          { label: `Scheduled ${birthLabel}s`, value: String(rows.length) },
          {
            label: 'Due Within 7 Days',
            value: String(dueSoonCount),
            tone: dueSoonCount > 0 ? 'warning' : 'neutral',
          },
        ],
      };
    }

    // 2. Birth Calendar (Ultrasounds)
    case 'birth-calendar-ultrasounds': {
      const candidates = speciesBreedings
        .filter((b) => {
          const hasScan = Boolean(
            b.ultrasoundDateIso ||
              b.ultrasoundResult ||
              b.ultrasoundProjectedDueIso ||
              (b.ultrasoundFetalCount || 0) > 0
          );
          const isOpenPregnancy =
            b.status === 'Bred' || b.status === 'Palpated Positive' || b.status === 'Planned';
          if (!hasScan && !isOpenPregnancy) return false;
          if (b.ultrasoundResult === 'Negative' && !hasScan) return false;
          const projected = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
          return (
            isIsoWithinRange(projected, dateFromIso, dateToIso) &&
            matchesBreedingFilter(b)
          );
        })
        .sort((a, b) => {
          const dA = a.ultrasoundProjectedDueIso || a.expectedDueDateIso || '';
          const dB = b.ultrasoundProjectedDueIso || b.expectedDueDateIso || '';
          return dA.localeCompare(dB);
        });

      const rows: ReportRow[] = candidates.map((b) => {
        const dam = animalById.get(b.damId);
        const sire = animalById.get(b.sireId);
        const projected = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
        const confirmedPositive = b.ultrasoundResult === 'Positive';
        return {
          id: b.id,
          animalId: dam?.id,
          highlightTone:
            confirmedPositive
              ? 'success'
              : b.ultrasoundResult === 'Negative'
              ? 'warning'
              : 'normal',
          cells: {
            projectedDue: formatReadableDate(projected),
            calendarDue: formatReadableDate(b.expectedDueDateIso),
            damName: dam?.name || b.damName || 'Unknown',
            damTag: dam?.tattoo || 'Unmarked',
            sireName: sire?.name || b.sireName || 'Unknown',
            scanDate: b.ultrasoundDateIso ? formatReadableDate(b.ultrasoundDateIso) : 'Pending',
            scanResult: b.ultrasoundResult || 'Not scanned',
            estCount:
              b.ultrasoundFetalCount && b.ultrasoundFetalCount > 0
                ? String(b.ultrasoundFetalCount)
                : '—',
            notes: b.notes || '—',
          },
        };
      });

      const positiveCount = candidates.filter((b) => b.ultrasoundResult === 'Positive').length;
      const estOffspring = candidates.reduce((sum, b) => sum + (b.ultrasoundFetalCount || 0), 0);

      return {
        columns: [
          { key: 'projectedDue', label: `Projected ${birthLabel}` },
          { key: 'calendarDue', label: 'Calendar Due' },
          { key: 'damName', label: 'Female' },
          { key: 'damTag', label: idShortLabel },
          { key: 'sireName', label: 'Male' },
          { key: 'scanDate', label: 'Scan Date' },
          { key: 'scanResult', label: 'Scan Result' },
          { key: 'estCount', label: `Est. ${offspringPlural}`, align: 'right' },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Active Pregnancies / Scans', value: String(rows.length) },
          { label: 'Ultrasound Positive', value: String(positiveCount), tone: 'positive' },
          { label: `Est. Total ${offspringPlural}`, value: String(estOffspring) },
        ],
      };
    }

    // 3. Roster Report
    case 'roster-report': {
      const roster = speciesAnimals
        .filter((a) => isAnimalActive(a) && matchesFilter(a))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const adultCount = roster.filter(
        (a) => !isAnimalNonAdult(a, speciesProfile, referenceDateIso)
      ).length;
      const nonAdultCount = roster.length - adultCount;

      const rows: ReportRow[] = roster.map((a) => {
        const flags: string[] = [];
        if (a.culled) flags.push('Flagged for Cull');
        if (a.needsAttention) flags.push('Needs Attention');
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: a.culled ? 'warning' : 'normal',
          cells: {
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            breed: a.breed || '—',
            variety: a.variety || '—',
            dob: formatReadableDate(a.birthDateIso),
            weight: formatWeight(a.weightGrams, weightUnit),
            ownership: normalizeOwnershipType(a.ownershipType, 'Owned'),
            housing: a.cageLocation || 'Unassigned',
            regNo: a.registrationNumber || '—',
            status: a.status,
            flags: flags.length > 0 ? flags.join(', ') : '—',
          },
        };
      });

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'breed', label: 'Breed' },
          { key: 'variety', label: 'Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'housing', label: 'Housing' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'status', label: 'Status' },
          { key: 'flags', label: 'Flags' },
        ],
        rows,
        summaryMetrics: [
          { label: `Active ${speciesProfile.name}`, value: String(rows.length) },
          { label: 'Adults', value: String(adultCount) },
          { label: 'Non-Adults', value: String(nonAdultCount) },
        ],
      };
    }

    // 4. ID Tags & Housing Labels Report
    case 'label-report': {
      const labeled = speciesAnimals
        .filter((a) => isAnimalActive(a) && matchesFilter(a))
        .sort((a, b) => {
          const cageCmp = (a.cageLocation || 'zzz').localeCompare(b.cageLocation || 'zzz');
          if (cageCmp !== 0) return cageCmp;
          const tagCmp = (a.tattoo || '').localeCompare(b.tattoo || '');
          if (tagCmp !== 0) return tagCmp;
          return (a.name || '').localeCompare(b.name || '');
        });

      const rows: ReportRow[] = labeled.map((a) => {
        const sire = a.sireId ? animalById.get(a.sireId) : undefined;
        const dam = a.damId ? animalById.get(a.damId) : undefined;
        return {
          id: a.id,
          animalId: a.id,
          cells: {
            housing: a.cageLocation || 'Unassigned',
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
            dob: formatReadableDate(a.birthDateIso),
            weight: formatWeight(a.weightGrams, weightUnit),
            sire: formatAnimalRef(sire),
            dam: formatAnimalRef(dam),
            regNo: a.registrationNumber || '—',
            gcNo: a.grandChampionNumber || '—',
          },
        };
      });

      const assignedHousingCount = labeled.filter((a) => Boolean(a.cageLocation?.trim())).length;

      return {
        columns: [
          { key: 'housing', label: 'Housing / Cage' },
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Labels', value: String(rows.length) },
          { label: 'With Housing Assigned', value: String(assignedHousingCount) },
        ],
      };
    }

    // 5. Male Income Report
    case 'male-income-report': {
      const males = speciesAnimals.filter(
        (a) => a.sex === 'Male' && matchesFilter(a)
      );

      let grandStudEarnedCents = 0;
      let grandDirectSalesCents = 0;
      let grandFeesPaidCents = 0;

      const enriched = males
        .map((male) => {
          const siredBreedings = speciesBreedings.filter((b) => {
            if (b.sireId !== male.id) return false;
            return isIsoWithinRange(
              b.actualBirthDateIso || b.bredDateIso,
              dateFromIso,
              dateToIso
            );
          });

          const studEarnedCents = siredBreedings.reduce((sum, b) => {
            const fee = b.serviceFeeCents || 0;
            if (fee <= 0) return sum;
            return b.serviceFeeDirection === 'paid' ? sum : sum + fee;
          }, 0);

          const studPaidCents = siredBreedings.reduce((sum, b) => {
            const fee = b.serviceFeeCents || 0;
            if (fee <= 0) return sum;
            return b.serviceFeeDirection === 'paid' ? sum + fee : sum;
          }, 0);

          const directSaleMatch =
            (male.status === 'Sold' || (male.salePriceCents || 0) > 0) &&
            isIsoWithinRange(male.soldDateIso || male.updatedAt.slice(0, 10), dateFromIso, dateToIso);
          const directSaleCents = directSaleMatch ? male.salePriceCents || 0 : 0;

          const totalGrossCents = studEarnedCents + directSaleCents;
          return {
            male,
            siredCount: siredBreedings.length,
            studEarnedCents,
            studPaidCents,
            directSaleCents,
            totalGrossCents,
          };
        })
        .filter(
          (item) =>
            item.totalGrossCents > 0 ||
            item.studPaidCents > 0 ||
            item.siredCount > 0 ||
            isAnimalActive(item.male)
        )
        .sort((a, b) => b.totalGrossCents - a.totalGrossCents || a.male.name.localeCompare(b.male.name));

      const rows: ReportRow[] = enriched.map((item) => {
        grandStudEarnedCents += item.studEarnedCents;
        grandDirectSalesCents += item.directSaleCents;
        grandFeesPaidCents += item.studPaidCents;
        return {
          id: item.male.id,
          animalId: item.male.id,
          highlightTone: item.totalGrossCents > 0 ? 'success' : 'normal',
          cells: {
            idTag: item.male.tattoo || 'Unmarked',
            name: item.male.name,
            stage: formatStageLabel(item.male, speciesProfile, referenceDateIso),
            status: item.male.status,
            breedings: item.siredCount,
            studEarned: formatCurrencyCents(item.studEarnedCents, currencyCode),
            directSales: formatCurrencyCents(item.directSaleCents, currencyCode),
            totalIncome: formatCurrencyCents(item.totalGrossCents, currencyCode),
            feesPaid: formatCurrencyCents(item.studPaidCents, currencyCode),
          },
        };
      });

      const combinedCents = grandStudEarnedCents + grandDirectSalesCents;

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Male Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'status', label: 'Status' },
          { key: 'breedings', label: 'Breedings Sired', align: 'right' },
          { key: 'studEarned', label: 'Stud Fees Earned', align: 'right' },
          { key: 'directSales', label: 'Direct Sales', align: 'right' },
          { key: 'totalIncome', label: 'Total Income', align: 'right' },
          { key: 'feesPaid', label: 'Fees Paid', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Male Income', value: formatCurrencyCents(combinedCents, currencyCode), tone: combinedCents > 0 ? 'positive' : 'neutral' },
          { label: 'Stud Fees Earned', value: formatCurrencyCents(grandStudEarnedCents, currencyCode) },
          { label: 'Direct Male Sales', value: formatCurrencyCents(grandDirectSalesCents, currencyCode) },
          { label: 'Stud Fees Paid Out', value: formatCurrencyCents(grandFeesPaidCents, currencyCode) },
        ],
      };
    }

    // 6. Female Income Report
    case 'female-income-report': {
      const females = speciesAnimals.filter(
        (a) => a.sex === 'Female' && matchesFilter(a)
      );

      let grandOffspringSalesCents = 0;
      let grandDirectSalesCents = 0;
      let grandStudPaidCents = 0;

      const enriched = females
        .map((female) => {
          const offspringSold = speciesAnimals.filter((child) => {
            if (child.damId !== female.id) return false;
            if (child.status !== 'Sold' && (child.salePriceCents || 0) <= 0) return false;
            return isIsoWithinRange(
              child.soldDateIso || child.updatedAt.slice(0, 10),
              dateFromIso,
              dateToIso
            );
          });
          const offspringSalesCents = offspringSold.reduce(
            (sum, child) => sum + (child.salePriceCents || 0),
            0
          );

          const directSaleMatch =
            (female.status === 'Sold' || (female.salePriceCents || 0) > 0) &&
            isIsoWithinRange(female.soldDateIso || female.updatedAt.slice(0, 10), dateFromIso, dateToIso);
          const directSaleCents = directSaleMatch ? female.salePriceCents || 0 : 0;

          const damBreedings = speciesBreedings.filter((b) => {
            if (b.damId !== female.id) return false;
            return isIsoWithinRange(
              b.actualBirthDateIso || b.bredDateIso,
              dateFromIso,
              dateToIso
            );
          });
          const studPaidCents = damBreedings.reduce((sum, b) => {
            const fee = b.serviceFeeCents || 0;
            return fee > 0 && b.serviceFeeDirection === 'paid' ? sum + fee : sum;
          }, 0);
          const netCents = offspringSalesCents + directSaleCents - studPaidCents;

          return {
            female,
            litters: damBreedings.filter((b) => b.status === 'Born' || b.status === 'Weaned').length,
            offspringSoldCount: offspringSold.length,
            offspringSalesCents,
            directSaleCents,
            totalGrossCents: offspringSalesCents + directSaleCents,
            studPaidCents,
            netCents,
          };
        })
        .filter(
          (item) =>
            item.totalGrossCents > 0 ||
            item.studPaidCents > 0 ||
            item.offspringSoldCount > 0 ||
            item.litters > 0 ||
            isAnimalActive(item.female)
        )
        .sort((a, b) => b.totalGrossCents - a.totalGrossCents || a.female.name.localeCompare(b.female.name));

      const rows: ReportRow[] = enriched.map((item) => {
        grandOffspringSalesCents += item.offspringSalesCents;
        grandDirectSalesCents += item.directSaleCents;
        grandStudPaidCents += item.studPaidCents;
        return {
          id: item.female.id,
          animalId: item.female.id,
          highlightTone: item.totalGrossCents > 0 ? 'success' : 'normal',
          cells: {
            idTag: item.female.tattoo || 'Unmarked',
            name: item.female.name,
            stage: formatStageLabel(item.female, speciesProfile, referenceDateIso),
            litters: item.litters,
            offspringSold: item.offspringSoldCount,
            offspringRevenue: formatCurrencyCents(item.offspringSalesCents, currencyCode),
            directRevenue: formatCurrencyCents(item.directSaleCents, currencyCode),
            studPaid: formatCurrencyCents(item.studPaidCents, currencyCode),
            netIncome: formatCurrencyCents(item.netCents, currencyCode),
          },
        };
      });

      const grossTotal = grandOffspringSalesCents + grandDirectSalesCents;
      const netTotal = grossTotal - grandStudPaidCents;

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Female Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'litters', label: `${birthLabel}s`, align: 'right' },
          { key: 'offspringSold', label: `${offspringPlural} Sold`, align: 'right' },
          { key: 'offspringRevenue', label: `${offspringPlural} Sales`, align: 'right' },
          { key: 'directRevenue', label: 'Direct Sale', align: 'right' },
          { key: 'studPaid', label: 'Stud Fees Paid', align: 'right' },
          { key: 'netIncome', label: 'Net Income', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Gross Female Income', value: formatCurrencyCents(grossTotal, currencyCode), tone: grossTotal > 0 ? 'positive' : 'neutral' },
          { label: `${offspringPlural} Sales`, value: formatCurrencyCents(grandOffspringSalesCents, currencyCode) },
          { label: 'Stud Fees Paid', value: formatCurrencyCents(grandStudPaidCents, currencyCode) },
          { label: 'Net Revenue', value: formatCurrencyCents(netTotal, currencyCode) },
        ],
      };
    }

    // 7. Unidentified / Missing ID Report
    case 'unmarked-report': {
      const unmarked = speciesAnimals
        .filter((a) => {
          if (!isAnimalActive(a) || !matchesFilter(a)) return false;
          const missingPrimary = !(a.tattoo || '').trim();
          const missingReg = !(a.registrationNumber || '').trim();
          return missingPrimary || missingReg;
        })
        .sort((a, b) => {
          const missA = !(a.tattoo || '').trim() ? 0 : 1;
          const missB = !(b.tattoo || '').trim() ? 0 : 1;
          if (missA !== missB) return missA - missB;
          return (a.birthDateIso || '').localeCompare(b.birthDateIso || '');
        });

      let missingPrimaryCount = 0;
      let missingRegCount = 0;

      const rows: ReportRow[] = unmarked.map((a) => {
        const noPrimary = !(a.tattoo || '').trim();
        const noReg = !(a.registrationNumber || '').trim();
        if (noPrimary) missingPrimaryCount += 1;
        if (noReg) missingRegCount += 1;
        const missingList: string[] = [];
        if (noPrimary) missingList.push(`Missing ${idShortLabel}`);
        if (noReg) missingList.push('Missing Reg #');
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: noPrimary ? 'warning' : 'normal',
          cells: {
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            dob: formatReadableDate(a.birthDateIso),
            housing: a.cageLocation || 'Unassigned',
            primaryId: a.tattoo || 'Missing',
            regNo: a.registrationNumber || 'Missing',
            missing: missingList.join(' & '),
            sire: formatAnimalRef(animalById.get(a.sireId)),
            dam: formatAnimalRef(animalById.get(a.damId)),
          },
        };
      });

      return {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'dob', label: 'DOB' },
          { key: 'housing', label: 'Housing' },
          { key: 'primaryId', label: idShortLabel },
          { key: 'regNo', label: 'Reg #' },
          { key: 'missing', label: 'Missing Fields' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Records Missing IDs', value: String(rows.length), tone: rows.length > 0 ? 'warning' : 'positive' },
          { label: `Missing ${idShortLabel}`, value: String(missingPrimaryCount) },
          { label: 'Missing Reg #', value: String(missingRegCount) },
        ],
      };
    }

    // 8. Weight Gain Report
    case 'weight-gain-report': {
      const logsByAnimal = new Map<string, CareLog[]>();
      for (const l of speciesCareLogs) {
        if ((l.type !== 'Weight Check' && !(l.weightGrams > 0)) || l.weightGrams <= 0) continue;
        if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) continue;
        const arr = logsByAnimal.get(l.animalId) || [];
        arr.push(l);
        logsByAnimal.set(l.animalId, arr);
      }

      const items: Array<{
        animal: Animal;
        weighIns: number;
        startGrams: number;
        startDate: string;
        latestGrams: number;
        latestDate: string;
        gainGrams: number;
        daysElapsed: number | null;
        adgGramsPerDay: number | null;
      }> = [];

      for (const a of speciesAnimals) {
        if (!matchesFilter(a)) continue;
        const logs = (logsByAnimal.get(a.id) || []).sort((x, y) =>
          (x.dateIso || '').localeCompare(y.dateIso || '')
        );
        if (logs.length === 0 && a.weightGrams <= 0) continue;
        if (logs.length === 0 && !isAnimalActive(a)) continue;

        const startGrams = logs.length > 0 ? logs[0].weightGrams : a.weightGrams;
        const startDate = logs.length > 0 ? logs[0].dateIso : a.birthDateIso;
        const latestGrams = logs.length > 0 ? logs[logs.length - 1].weightGrams : a.weightGrams;
        const latestDate =
          logs.length > 0 ? logs[logs.length - 1].dateIso : a.updatedAt.slice(0, 10);
        const gainGrams = logs.length >= 2 ? latestGrams - startGrams : 0;
        const daysElapsed = logs.length >= 2 ? diffDaysIso(startDate, latestDate) : null;
        const adgGramsPerDay =
          daysElapsed && daysElapsed > 0 ? gainGrams / daysElapsed : null;

        items.push({
          animal: a,
          weighIns: logs.length,
          startGrams,
          startDate,
          latestGrams,
          latestDate,
          gainGrams,
          daysElapsed,
          adgGramsPerDay,
        });
      }

      items.sort((x, y) => {
        const adgX = x.adgGramsPerDay ?? -Infinity;
        const adgY = y.adgGramsPerDay ?? -Infinity;
        if (adgY !== adgX) return adgY - adgX;
        return y.latestGrams - x.latestGrams;
      });

      const adgValues = items
        .map((i) => i.adgGramsPerDay)
        .filter((v): v is number => v !== null);
      const avgAdg =
        adgValues.length > 0
          ? adgValues.reduce((s, v) => s + v, 0) / adgValues.length
          : null;

      const rows: ReportRow[] = items.map((item) => ({
        id: item.animal.id,
        animalId: item.animal.id,
        highlightTone:
          item.gainGrams < 0 ? 'warning' : item.gainGrams > 0 ? 'success' : 'normal',
        cells: {
          idTag: item.animal.tattoo || 'Unmarked',
          name: item.animal.name,
          stage: formatStageLabel(item.animal, speciesProfile, referenceDateIso),
          weighIns: item.weighIns,
          startWeight: `${formatWeight(item.startGrams, weightUnit)}${
            item.startDate ? ` (${formatReadableDate(item.startDate)})` : ''
          }`,
          latestWeight: `${formatWeight(item.latestGrams, weightUnit)}${
            item.latestDate ? ` (${formatReadableDate(item.latestDate)})` : ''
          }`,
          totalGain:
            item.weighIns >= 2 ? formatSignedWeightDelta(item.gainGrams, weightUnit) : '1 weigh-in',
          days: item.daysElapsed !== null ? String(item.daysElapsed) : '—',
          adg:
            item.adgGramsPerDay !== null
              ? formatWeightRatePerDay(item.adgGramsPerDay, weightUnit)
              : '—',
        },
      }));

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'weighIns', label: 'Weigh-Ins', align: 'right' },
          { key: 'startWeight', label: 'Start Weight' },
          { key: 'latestWeight', label: 'Latest Weight' },
          { key: 'totalGain', label: 'Total Gain', align: 'right' },
          { key: 'days', label: 'Days', align: 'right' },
          { key: 'adg', label: 'Avg Daily Gain', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Tracked Animals', value: String(rows.length) },
          { label: 'Multi-Point Series', value: String(adgValues.length) },
          {
            label: 'Mean ADG',
            value: avgAdg !== null ? formatWeightRatePerDay(avgAdg, weightUnit) : 'N/A',
          },
        ],
      };
    }

    // 9. Breeding History Report
    case 'breeding-history-report': {
      const history = speciesBreedings
        .filter(
          (b) =>
            isIsoWithinRange(
              b.actualBirthDateIso || b.bredDateIso,
              dateFromIso,
              dateToIso
            ) && matchesBreedingFilter(b)
        )
        .sort((a, b) => (b.bredDateIso || '').localeCompare(a.bredDateIso || ''));

      let totalLive = 0;
      let totalStillborn = 0;
      let totalWeaned = 0;
      let settledCount = 0;
      let positiveCount = 0;

      const rows: ReportRow[] = history.map((b) => {
        const sire = animalById.get(b.sireId);
        const dam = animalById.get(b.damId);
        totalLive += b.liveCount || 0;
        totalStillborn += b.stillbornCount || 0;
        totalWeaned += b.weanedCount || 0;

        if (b.status !== 'Planned') {
          settledCount += 1;
          if (b.status === 'Born' || b.status === 'Weaned' || b.status === 'Palpated Positive') {
            positiveCount += 1;
          }
        }

        const feeText =
          b.serviceFeeCents && b.serviceFeeCents > 0
            ? `${formatCurrencyCents(b.serviceFeeCents, currencyCode)} (${
                b.serviceFeeDirection === 'paid' ? 'Paid' : 'Earned'
              })`
            : '—';

        const usText = b.ultrasoundResult
          ? `${b.ultrasoundResult}${b.ultrasoundFetalCount ? ` (${b.ultrasoundFetalCount})` : ''}`
          : '—';

        return {
          id: b.id,
          animalId: dam?.id,
          highlightTone:
            b.status === 'Missed'
              ? 'warning'
              : b.status === 'Born' || b.status === 'Weaned'
              ? 'success'
              : 'normal',
          cells: {
            bredDate: formatReadableDate(b.bredDateIso),
            dam: formatAnimalRef(dam, b.damName),
            sire: formatAnimalRef(sire, b.sireName),
            status: formatBreedingStatusForSpecies(b.status, speciesProfile),
            dueDate: formatReadableDate(b.ultrasoundProjectedDueIso || b.expectedDueDateIso),
            actualBirth: b.actualBirthDateIso ? formatReadableDate(b.actualBirthDateIso) : '—',
            live: b.liveCount,
            stillborn: b.stillbornCount,
            fostered: b.fosteredCount,
            weaned: b.weanedCount,
            ultrasound: usText,
            serviceFee: feeText,
            coi: `${(b.projectedCoiPercent || 0).toFixed(2)}%`,
          },
        };
      });

      const conceptionRate =
        settledCount > 0 ? `${Math.round((positiveCount / settledCount) * 100)}%` : 'N/A';

      return {
        columns: [
          { key: 'bredDate', label: 'Bred Date' },
          { key: 'dam', label: 'Female' },
          { key: 'sire', label: 'Male' },
          { key: 'status', label: 'Outcome' },
          { key: 'dueDate', label: 'Due Date' },
          { key: 'actualBirth', label: `Actual ${birthLabel}` },
          { key: 'live', label: 'Live', align: 'right' },
          { key: 'stillborn', label: 'Stillborn', align: 'right' },
          { key: 'fostered', label: 'Fostered', align: 'right' },
          { key: 'weaned', label: 'Weaned', align: 'right' },
          { key: 'ultrasound', label: 'Ultrasound' },
          { key: 'serviceFee', label: 'Service Fee', align: 'right' },
          { key: 'coi', label: 'COI %', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Pairings', value: String(rows.length) },
          { label: 'Conception Rate', value: conceptionRate },
          { label: `Total Live ${offspringPlural}`, value: String(totalLive), tone: 'positive' },
          { label: `Total Weaned / Stillborn`, value: `${totalWeaned} / ${totalStillborn}` },
        ],
      };
    }

    // 9b. Litter Survival & Parent Performance Report
    case 'litter-survival-performance-report': {
      const filteredBreedings = speciesBreedings.filter((b) => {
        if (!isIsoWithinRange(b.actualBirthDateIso || b.bredDateIso, dateFromIso, dateToIso)) {
          return false;
        }
        if (filter === 'Male' || filter === 'Non-Adult Male') {
          return matchesFilter(animalById.get(b.sireId));
        }
        if (filter === 'Female' || filter === 'Non-Adult Female') {
          return matchesFilter(animalById.get(b.damId));
        }
        return true;
      });

      const evalRes = evaluateLitterSurvivalAndMilestones({
        speciesProfile,
        breedings: filteredBreedings,
        animals: speciesAnimals,
        careLogs: speciesCareLogs,
      });

      const summaries =
        filter === 'Male' || filter === 'Non-Adult Male'
          ? evalRes.sireSummaries
          : evalRes.damSummaries;

      const roleLabel =
        filter === 'Male' || filter === 'Non-Adult Male' ? 'Male' : 'Female';

      const rows: ReportRow[] = summaries.map((p) => ({
        id: `${p.role}-${p.parentId || p.parentName}`,
        animalId: p.parentId || undefined,
        highlightTone:
          p.weaningSurvivalRatePct !== null && p.weaningSurvivalRatePct >= 85
            ? 'success'
            : p.weaningSurvivalRatePct !== null && p.weaningSurvivalRatePct < 60
            ? 'warning'
            : 'normal',
        cells: {
          parent: p.parentName,
          idTag: p.parentTattoo || 'Unmarked',
          role: roleLabel,
          litters: String(p.littersBornCount),
          liveBorn: String(p.totalLiveBorn),
          stillborn: String(p.totalStillborn),
          weaned: String(p.totalWeaned),
          liveBirthPct: p.liveBirthRatePct !== null ? `${p.liveBirthRatePct.toFixed(1)}%` : '—',
          weanSurvivalPct:
            p.weaningSurvivalRatePct !== null ? `${p.weaningSurvivalRatePct.toFixed(1)}%` : '—',
          avg3w: p.avg3WeekGrams !== null ? formatWeight(p.avg3WeekGrams, weightUnit) : '—',
          avg6w: p.avg6WeekGrams !== null ? formatWeight(p.avg6WeekGrams, weightUnit) : '—',
          avg8w: p.avg8WeekGrams !== null ? formatWeight(p.avg8WeekGrams, weightUnit) : '—',
          litterAdg:
            p.meanLitterAdgGramsPerDay !== null
              ? formatWeightRatePerDay(p.meanLitterAdgGramsPerDay, weightUnit)
              : '—',
        },
      }));

      return {
        columns: [
          { key: 'parent', label: roleLabel },
          { key: 'idTag', label: idShortLabel },
          { key: 'litters', label: 'Litters', align: 'right' },
          { key: 'liveBorn', label: 'Live Born', align: 'right' },
          { key: 'stillborn', label: 'Stillborn', align: 'right' },
          { key: 'weaned', label: 'Weaned', align: 'right' },
          { key: 'liveBirthPct', label: 'Live Birth %', align: 'right' },
          { key: 'weanSurvivalPct', label: 'Wean Survival %', align: 'right' },
          { key: 'avg3w', label: '3w Avg', align: 'right' },
          { key: 'avg6w', label: '6w Avg', align: 'right' },
          { key: 'avg8w', label: '8w Avg', align: 'right' },
          { key: 'litterAdg', label: 'Litter ADG', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Litters Born', value: String(evalRes.overallSummary.littersBornCount) },
          {
            label: 'Live Birth Survival',
            value:
              evalRes.overallSummary.liveBirthRatePct !== null
                ? `${evalRes.overallSummary.liveBirthRatePct.toFixed(1)}%`
                : 'N/A',
            tone: 'positive',
          },
          {
            label: 'Weaning Survival',
            value:
              evalRes.overallSummary.weaningSurvivalRatePct !== null
                ? `${evalRes.overallSummary.weaningSurvivalRatePct.toFixed(1)}%`
                : 'N/A',
          },
          {
            label: 'Mean 8w Avg',
            value:
              evalRes.overallSummary.avg8WeekGrams !== null
                ? formatWeight(evalRes.overallSummary.avg8WeekGrams, weightUnit)
                : '—',
          },
        ],
      };
    }

    // 10. Medicine & Treatment Report
    case 'medicine-report': {
      const treatments = speciesCareLogs
        .filter((l) => {
          const isMed =
            l.type === 'Health / Vet' ||
            Boolean(l.medicationName?.trim()) ||
            Boolean(l.dosage?.trim()) ||
            Boolean(l.administrationRoute?.trim()) ||
            (l.withdrawalDays || 0) > 0 ||
            Boolean(l.withdrawalClearDateIso?.trim());
          if (!isMed) return false;
          if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) return false;
          const animal = animalById.get(l.animalId);
          return matchesFilter(animal);
        })
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      let activeHolds = 0;

      const rows: ReportRow[] = treatments.map((l) => {
        const animal = animalById.get(l.animalId);
        const wDays = l.withdrawalDays || 0;
        const clearIso =
          (l.withdrawalClearDateIso || '').trim() ||
          (wDays > 0 && l.dateIso ? addDaysIso(l.dateIso, wDays) : '');
        let wStatus = 'None';
        let tone: ReportRow['highlightTone'] = 'normal';
        if (clearIso) {
          if (clearIso > referenceDateIso) {
            wStatus = `Active Hold (until ${formatReadableDate(clearIso)})`;
            tone = 'warning';
            activeHolds += 1;
          } else {
            wStatus = 'Cleared';
            tone = 'success';
          }
        }
        return {
          id: l.id,
          animalId: animal?.id,
          highlightTone: tone,
          cells: {
            date: formatReadableDate(l.dateIso),
            animal: animal?.name || 'Unknown',
            idTag: animal?.tattoo || 'Unmarked',
            treatment: l.title || 'Health Entry',
            medication: l.medicationName || '—',
            dosage: l.dosage || '—',
            route: l.administrationRoute || '—',
            withdrawalDays: wDays > 0 ? `${wDays} d` : '0 d',
            clearDate: clearIso ? formatReadableDate(clearIso) : '—',
            withdrawalStatus: wStatus,
            notes: l.notes || '—',
          },
        };
      });

      return {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'animal', label: 'Animal' },
          { key: 'idTag', label: idShortLabel },
          { key: 'treatment', label: 'Treatment / Entry' },
          { key: 'medication', label: 'Medication' },
          { key: 'dosage', label: 'Dosage' },
          { key: 'route', label: 'Route' },
          { key: 'withdrawalDays', label: 'Withdrawal', align: 'right' },
          { key: 'clearDate', label: 'Clear Date' },
          { key: 'withdrawalStatus', label: 'Hold Status' },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Treatment Entries', value: String(rows.length) },
          {
            label: 'Active Withdrawal Holds',
            value: String(activeHolds),
            tone: activeHolds > 0 ? 'warning' : 'positive',
          },
        ],
      };
    }

    // 11. Body Condition & Parasite Score Report
    case 'health-score-report': {
      const scoreLogs = speciesCareLogs
        .filter((l) => {
          const isScore =
            l.type === 'Health Score / BCS' ||
            (l.bodyConditionScore || 0) > 0 ||
            (l.famachaScore || 0) > 0 ||
            (l.fecalEggCount || 0) > 0;
          if (!isScore) return false;
          if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) return false;
          return matchesFilter(animalById.get(l.animalId));
        })
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      const bcsList: number[] = [];
      let elevatedFamachaCount = 0;

      const rows: ReportRow[] = scoreLogs.map((l) => {
        const animal = animalById.get(l.animalId);
        const bcs = l.bodyConditionScore && l.bodyConditionScore > 0 ? l.bodyConditionScore : 0;
        const famacha = l.famachaScore && l.famachaScore > 0 ? l.famachaScore : 0;
        const fec = l.fecalEggCount && l.fecalEggCount > 0 ? l.fecalEggCount : 0;
        if (bcs > 0) bcsList.push(bcs);
        if (famacha >= 4) elevatedFamachaCount += 1;

        return {
          id: l.id,
          animalId: animal?.id,
          highlightTone: famacha >= 4 ? 'danger' : famacha === 3 ? 'warning' : 'normal',
          cells: {
            date: formatReadableDate(l.dateIso),
            animal: animal?.name || 'Unknown',
            idTag: animal?.tattoo || 'Unmarked',
            sex: animal ? formatSexForSpecies(animal.sex, speciesProfile) : '—',
            stage: animal ? formatStageLabel(animal, speciesProfile, referenceDateIso) : '—',
            bcs: bcs > 0 ? bcs.toFixed(1) : '—',
            famacha: famacha > 0 ? `${famacha} / 5` : '—',
            fec: fec > 0 ? `${fec} EPG` : '—',
            notes: [l.title, l.notes].filter(Boolean).join(' — ') || '—',
          },
        };
      });

      const meanBcs =
        bcsList.length > 0
          ? (bcsList.reduce((s, v) => s + v, 0) / bcsList.length).toFixed(2)
          : 'N/A';

      return {
        columns: [
          { key: 'date', label: 'Check Date' },
          { key: 'animal', label: 'Animal' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'bcs', label: 'BCS', align: 'right' },
          { key: 'famacha', label: 'FAMACHA / Eye', align: 'right' },
          { key: 'fec', label: 'FEC (EPG)', align: 'right' },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Score Checks', value: String(rows.length) },
          { label: 'Average BCS', value: meanBcs },
          {
            label: 'FAMACHA ≥ 4 Alerts',
            value: String(elevatedFamachaCount),
            tone: elevatedFamachaCount > 0 ? 'danger' : 'positive',
          },
        ],
      };
    }

    // 12. Ultrasound & Pregnancy Scan Report
    case 'ultrasound-report': {
      interface ScanEntry {
        id: string;
        sortDate: string;
        animalId?: string;
        animalName: string;
        idTag: string;
        partner: string;
        source: 'Breeding' | 'Care Log';
        result: string;
        fetalCount: number;
        projectedDueIso: string;
        notes: string;
      }

      const combined: ScanEntry[] = [];

      for (const b of speciesBreedings) {
        const hasScan = Boolean(
          b.ultrasoundDateIso ||
            b.ultrasoundResult ||
            b.ultrasoundProjectedDueIso ||
            (b.ultrasoundFetalCount || 0) > 0
        );
        if (!hasScan) continue;
        const scanDate = b.ultrasoundDateIso || b.bredDateIso;
        if (!isIsoWithinRange(scanDate, dateFromIso, dateToIso)) continue;
        if (!matchesBreedingFilter(b)) continue;
        const dam = animalById.get(b.damId);
        const sire = animalById.get(b.sireId);
        combined.push({
          id: `br-${b.id}`,
          sortDate: scanDate,
          animalId: dam?.id,
          animalName: dam?.name || b.damName || 'Unknown',
          idTag: dam?.tattoo || 'Unmarked',
          partner: formatAnimalRef(sire, b.sireName),
          source: 'Breeding',
          result: b.ultrasoundResult || 'Recorded',
          fetalCount: b.ultrasoundFetalCount || 0,
          projectedDueIso: b.ultrasoundProjectedDueIso || b.expectedDueDateIso || '',
          notes: b.notes || '',
        });
      }

      for (const l of speciesCareLogs) {
        const hasUltrasound =
          l.type === 'Ultrasound' ||
          Boolean(l.ultrasoundResult) ||
          (l.ultrasoundFetalCount || 0) > 0;
        if (!hasUltrasound) continue;
        if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) continue;
        const animal = animalById.get(l.animalId);
        if (!matchesFilter(animal)) continue;
        combined.push({
          id: `cl-${l.id}`,
          sortDate: l.dateIso,
          animalId: animal?.id,
          animalName: animal?.name || 'Unknown',
          idTag: animal?.tattoo || 'Unmarked',
          partner: '—',
          source: 'Care Log',
          result: l.ultrasoundResult || l.title || 'Recorded',
          fetalCount: l.ultrasoundFetalCount || 0,
          projectedDueIso: '',
          notes: l.notes || l.title || '',
        });
      }

      combined.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));

      const positiveCount = combined.filter((c) => c.result === 'Positive').length;
      const negativeCount = combined.filter((c) => c.result === 'Negative').length;

      const rows: ReportRow[] = combined.map((c) => ({
        id: c.id,
        animalId: c.animalId,
        highlightTone:
          c.result === 'Positive'
            ? 'success'
            : c.result === 'Negative'
            ? 'warning'
            : 'normal',
        cells: {
          scanDate: formatReadableDate(c.sortDate),
          animal: c.animalName,
          idTag: c.idTag,
          partner: c.partner,
          source: c.source,
          result: c.result,
          estCount: c.fetalCount > 0 ? String(c.fetalCount) : '—',
          projectedDue: c.projectedDueIso ? formatReadableDate(c.projectedDueIso) : '—',
          notes: c.notes || '—',
        },
      }));

      return {
        columns: [
          { key: 'scanDate', label: 'Scan Date' },
          { key: 'animal', label: 'Animal' },
          { key: 'idTag', label: idShortLabel },
          { key: 'partner', label: 'Paired Sire' },
          { key: 'source', label: 'Source' },
          { key: 'result', label: 'Scan Result' },
          { key: 'estCount', label: `Est. ${offspringPlural}`, align: 'right' },
          { key: 'projectedDue', label: `Projected ${birthLabel}` },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Scans', value: String(rows.length) },
          { label: 'Positive', value: String(positiveCount), tone: 'positive' },
          { label: 'Negative', value: String(negativeCount) },
        ],
      };
    }

    // 13. Mortality / Loss Report
    case 'death-report': {
      const deceased = speciesAnimals
        .filter((a) => {
          const isLoss =
            a.status === 'Deceased' ||
            Boolean(a.deceasedDateIso?.trim()) ||
            Boolean(a.deathCause?.trim());
          if (!isLoss || !matchesFilter(a)) return false;
          return isIsoWithinRange(
            a.deceasedDateIso || a.updatedAt.slice(0, 10),
            dateFromIso,
            dateToIso
          );
        })
        .sort((a, b) =>
          (b.deceasedDateIso || b.updatedAt).localeCompare(a.deceasedDateIso || a.updatedAt)
        );

      let adultLosses = 0;
      let nonAdultLosses = 0;
      const causeCounts = new Map<string, number>();

      const rows: ReportRow[] = deceased.map((a) => {
        const deathDate = (a.deceasedDateIso || '').trim();
        const evalRefDate = deathDate || referenceDateIso;
        const wasNonAdult = isAnimalNonAdult(a, speciesProfile, evalRefDate);
        if (wasNonAdult) nonAdultLosses += 1;
        else adultLosses += 1;

        const cause = (a.deathCause || '').trim() || 'Not recorded';
        causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);

        const ageDays = deathDate ? diffDaysIso(a.birthDateIso, deathDate) : null;

        return {
          id: a.id,
          animalId: a.id,
          highlightTone: 'danger',
          cells: {
            deceasedDate: deathDate ? formatReadableDate(deathDate) : 'Unset',
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stageAtDeath: wasNonAdult ? 'Non-Adult' : 'Adult',
            ageAtDeath: formatAgeSummary(ageDays),
            dob: formatReadableDate(a.birthDateIso),
            cause,
            sire: formatAnimalRef(animalById.get(a.sireId)),
            dam: formatAnimalRef(animalById.get(a.damId)),
          },
        };
      });

      const topCauseEntry = Array.from(causeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

      return {
        columns: [
          { key: 'deceasedDate', label: 'Deceased Date' },
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'stageAtDeath', label: 'Stage at Loss' },
          { key: 'ageAtDeath', label: 'Age at Loss' },
          { key: 'dob', label: 'DOB' },
          { key: 'cause', label: 'Cause' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Losses', value: String(rows.length), tone: rows.length > 0 ? 'danger' : 'neutral' },
          { label: 'Adults / Non-Adults', value: `${adultLosses} / ${nonAdultLosses}` },
          { label: 'Top Recorded Cause', value: topCauseEntry ? `${topCauseEntry[0]} (${topCauseEntry[1]})` : 'N/A' },
        ],
      };
    }

    // 14. Sold Stock Report
    case 'sold-stock-report': {
      const sold = speciesAnimals
        .filter((a) => {
          const isSold =
            a.status === 'Sold' ||
            Boolean(a.soldDateIso?.trim()) ||
            (a.salePriceCents || 0) > 0 ||
            Boolean(a.buyerName?.trim());
          if (!isSold || !matchesFilter(a)) return false;
          return isIsoWithinRange(
            a.soldDateIso || a.updatedAt.slice(0, 10),
            dateFromIso,
            dateToIso
          );
        })
        .sort((a, b) =>
          (b.soldDateIso || b.updatedAt).localeCompare(a.soldDateIso || a.updatedAt)
        );

      let grossCents = 0;
      let pricedCount = 0;

      const rows: ReportRow[] = sold.map((a) => {
        const saleCents = a.salePriceCents || 0;
        const costCents = a.purchaseCostCents || 0;
        if (saleCents > 0) {
          grossCents += saleCents;
          pricedCount += 1;
        }
        const netCents = saleCents - costCents;
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: saleCents > 0 ? 'success' : 'normal',
          cells: {
            soldDate: a.soldDateIso ? formatReadableDate(a.soldDateIso) : 'Unset',
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
            salePrice: saleCents > 0 ? formatCurrencyCents(saleCents, currencyCode) : '—',
            purchaseCost: costCents > 0 ? formatCurrencyCents(costCents, currencyCode) : '—',
            netMargin:
              saleCents > 0 || costCents > 0
                ? formatCurrencyCents(netCents, currencyCode)
                : '—',
            buyer: a.buyerName || '—',
            weight: formatWeight(a.weightGrams, weightUnit),
          },
        };
      });

      const avgPriceCents = pricedCount > 0 ? Math.round(grossCents / pricedCount) : 0;

      return {
        columns: [
          { key: 'soldDate', label: 'Sold Date' },
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'salePrice', label: 'Sale Price', align: 'right' },
          { key: 'purchaseCost', label: 'Acquisition Cost', align: 'right' },
          { key: 'netMargin', label: 'Net Margin', align: 'right' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'weight', label: 'Weight', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: `${speciesProfile.name} Sold`, value: String(rows.length) },
          { label: 'Total Gross Sales', value: formatCurrencyCents(grossCents, currencyCode), tone: grossCents > 0 ? 'positive' : 'neutral' },
          { label: 'Average Sale Price', value: pricedCount > 0 ? formatCurrencyCents(avgPriceCents, currencyCode) : 'N/A' },
        ],
      };
    }

    // 15. Non-Adults (Male & Female) Report
    case 'non-adult-report': {
      const nonAdults = speciesAnimals
        .filter(
          (a) =>
            isAnimalActive(a) &&
            isAnimalNonAdult(a, speciesProfile, referenceDateIso) &&
            matchesFilter(a)
        )
        .sort((a, b) => (b.birthDateIso || '').localeCompare(a.birthDateIso || ''));

      let maleCount = 0;
      let femaleCount = 0;
      const weanCutoff = speciesProfile.weanDaysAfterBirth || 42;

      const rows: ReportRow[] = nonAdults.map((a) => {
        if (a.sex === 'Male') maleCount += 1;
        else if (a.sex === 'Female') femaleCount += 1;

        const ageDays = diffDaysIso(a.birthDateIso, referenceDateIso);
        const weanStatus =
          ageDays === null
            ? a.status === 'Junior'
              ? 'Junior'
              : 'Unknown'
            : ageDays >= weanCutoff
            ? `Weaned / Weaning Ready (>= ${weanCutoff}d)`
            : `Nursing (${weanCutoff - ageDays}d to wean)`;

        return {
          id: a.id,
          animalId: a.id,
          cells: {
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            dob: formatReadableDate(a.birthDateIso),
            ageDays: ageDays !== null ? String(ageDays) : '—',
            weanStatus,
            weight: formatWeight(a.weightGrams, weightUnit),
            housing: a.cageLocation || 'Unassigned',
            sire: formatAnimalRef(animalById.get(a.sireId)),
            dam: formatAnimalRef(animalById.get(a.damId)),
            status: a.status,
          },
        };
      });

      return {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'dob', label: 'DOB' },
          { key: 'ageDays', label: 'Age (Days)', align: 'right' },
          { key: 'weanStatus', label: 'Weaning Status' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'housing', label: 'Housing' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Non-Adults', value: String(rows.length) },
          { label: 'Males / Females', value: `${maleCount} / ${femaleCount}` },
          { label: 'Wean Window', value: `${weanCutoff} d` },
        ],
      };
    }

    // 16. Male Report
    case 'male-report': {
      const males = speciesAnimals
        .filter(
          (a) =>
            a.sex === 'Male' &&
            a.status !== 'Sold' &&
            a.status !== 'Deceased' &&
            matchesFilter(a)
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let activeOwned = 0;
      let totalLegs = 0;
      let gcOrEligibleCount = 0;
      let totalShowPoints = 0;

      const rows: ReportRow[] = males.map((m) => {
        if (isAnimalActive(m) && normalizeOwnershipType(m.ownershipType, 'Owned') === 'Owned') {
          activeOwned += 1;
        }
        const showSummary = computeAnimalShowSummary(m, ctx.speciesShows, speciesCareLogs);
        totalLegs += showSummary.effectiveLegs;
        totalShowPoints += showSummary.totalPoints;
        if (showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible) {
          gcOrEligibleCount += 1;
        }
        const siredBreedings = speciesBreedings.filter((b) => b.sireId === m.id);
        const siredOffspring = siredBreedings.reduce((sum, b) => sum + (b.liveCount || 0), 0);

        return {
          id: m.id,
          animalId: m.id,
          highlightTone:
            showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible
              ? 'success'
              : 'normal',
          cells: {
            idTag: m.tattoo || 'Unmarked',
            name: m.name,
            stage: formatStageLabel(m, speciesProfile, referenceDateIso),
            ownership: normalizeOwnershipType(m.ownershipType, 'Owned'),
            breedVariety: [m.breed, m.variety].filter(Boolean).join(' · ') || '—',
            weight: formatWeight(m.weightGrams, weightUnit),
            breedings: siredBreedings.length,
            liveOffspring: siredOffspring,
            legs: showSummary.effectiveLegs,
            showWins: showSummary.awardsSummaryText || '—',
            showPoints: showSummary.totalPoints > 0 ? showSummary.totalPoints : 0,
            gcProgress: showSummary.gcProgress.shortLabel,
            regNo: m.registrationNumber || '—',
            gcNo: m.grandChampionNumber || '—',
            status: m.status,
          },
        };
      });

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'breedings', label: 'Breedings', align: 'right' },
          { key: 'liveOffspring', label: `Live ${offspringPlural}`, align: 'right' },
          { key: 'legs', label: 'Show Legs', align: 'right' },
          { key: 'showWins', label: 'Show Wins' },
          { key: 'showPoints', label: 'Points', align: 'right' },
          { key: 'gcProgress', label: 'GC Progress' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: `Total ${speciesProfile.name} Males`, value: String(rows.length) },
          { label: 'Active Owned Males', value: String(activeOwned) },
          { label: 'Combined Show Legs', value: String(totalLegs) },
          {
            label: 'GC / Eligible Males',
            value: String(gcOrEligibleCount),
            tone: gcOrEligibleCount > 0 ? 'positive' : 'neutral',
          },
          ...(totalShowPoints > 0
            ? [{ label: 'Total Show Points', value: String(Math.round(totalShowPoints * 100) / 100) }]
            : []),
        ],
      };
    }

    // 17. Female Report
    case 'female-report': {
      const females = speciesAnimals
        .filter(
          (a) =>
            a.sex === 'Female' &&
            a.status !== 'Sold' &&
            a.status !== 'Deceased' &&
            matchesFilter(a)
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let activeOwned = 0;
      let totalWeaned = 0;
      let totalLegs = 0;
      let gcOrEligibleCount = 0;

      const rows: ReportRow[] = females.map((f) => {
        if (isAnimalActive(f) && normalizeOwnershipType(f.ownershipType, 'Owned') === 'Owned') {
          activeOwned += 1;
        }
        const showSummary = computeAnimalShowSummary(f, ctx.speciesShows, speciesCareLogs);
        totalLegs += showSummary.effectiveLegs;
        if (showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible) {
          gcOrEligibleCount += 1;
        }
        const damBreedings = speciesBreedings.filter((b) => b.damId === f.id);
        const birthCount = damBreedings.filter(
          (b) => b.status === 'Born' || b.status === 'Weaned'
        ).length;
        const liveOffspring = damBreedings.reduce((sum, b) => sum + (b.liveCount || 0), 0);
        const weanedOffspring = damBreedings.reduce((sum, b) => sum + (b.weanedCount || 0), 0);
        totalWeaned += weanedOffspring;

        return {
          id: f.id,
          animalId: f.id,
          highlightTone:
            showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible
              ? 'success'
              : 'normal',
          cells: {
            idTag: f.tattoo || 'Unmarked',
            name: f.name,
            stage: formatStageLabel(f, speciesProfile, referenceDateIso),
            ownership: normalizeOwnershipType(f.ownershipType, 'Owned'),
            breedVariety: [f.breed, f.variety].filter(Boolean).join(' · ') || '—',
            weight: formatWeight(f.weightGrams, weightUnit),
            breedings: damBreedings.length,
            births: birthCount,
            liveOffspring,
            weaned: weanedOffspring,
            legs: showSummary.effectiveLegs,
            showWins: showSummary.awardsSummaryText || '—',
            showPoints: showSummary.totalPoints > 0 ? showSummary.totalPoints : 0,
            gcProgress: showSummary.gcProgress.shortLabel,
            regNo: f.registrationNumber || '—',
            gcNo: f.grandChampionNumber || '—',
            status: f.status,
          },
        };
      });

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'breedings', label: 'Breedings', align: 'right' },
          { key: 'births', label: `${birthLabel}s`, align: 'right' },
          { key: 'liveOffspring', label: `Live ${offspringPlural}`, align: 'right' },
          { key: 'weaned', label: 'Weaned', align: 'right' },
          { key: 'legs', label: 'Show Legs', align: 'right' },
          { key: 'showWins', label: 'Show Wins' },
          { key: 'showPoints', label: 'Points', align: 'right' },
          { key: 'gcProgress', label: 'GC Progress' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: `Total ${speciesProfile.name} Females`, value: String(rows.length) },
          { label: 'Active Owned Females', value: String(activeOwned) },
          { label: `Total ${offspringPlural} Weaned`, value: String(totalWeaned) },
          { label: 'Combined Show Legs', value: String(totalLegs) },
          {
            label: 'GC / Eligible Females',
            value: String(gcOrEligibleCount),
            tone: gcOrEligibleCount > 0 ? 'positive' : 'neutral',
          },
        ],
      };
    }

    // 18. Cull Decision Report
    case 'cull-report': {
      const flagged = speciesAnimals
        .filter((a) => {
          const isCull =
            Boolean(a.culled) ||
            Boolean(a.cullDateIso?.trim()) ||
            Boolean(a.cullReason?.trim());
          if (!isCull || !matchesFilter(a)) return false;
          return isIsoWithinRange(
            a.cullDateIso || a.updatedAt.slice(0, 10),
            dateFromIso,
            dateToIso
          );
        })
        .sort((a, b) =>
          (b.cullDateIso || b.updatedAt).localeCompare(a.cullDateIso || a.updatedAt)
        );

      const pendingCount = flagged.filter((a) => isAnimalActive(a)).length;

      const rows: ReportRow[] = flagged.map((a) => {
        const stillActive = isAnimalActive(a);
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: stillActive ? 'warning' : 'normal',
          cells: {
            cullDate: a.cullDateIso ? formatReadableDate(a.cullDateIso) : 'Unset',
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            disposition: stillActive ? `Pending (${a.status})` : `Removed (${a.status})`,
            reason: a.cullReason || 'No reason noted',
            housing: a.cageLocation || 'Unassigned',
            weight: formatWeight(a.weightGrams, weightUnit),
          },
        };
      });

      return {
        columns: [
          { key: 'cullDate', label: 'Flag Date' },
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'disposition', label: 'Disposition' },
          { key: 'reason', label: 'Cull Reason' },
          { key: 'housing', label: 'Housing' },
          { key: 'weight', label: 'Weight', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Flagged', value: String(rows.length) },
          {
            label: 'Still Active / Pending',
            value: String(pendingCount),
            tone: pendingCount > 0 ? 'warning' : 'neutral',
          },
        ],
      };
    }

    // 19. ID Cross-Reference Report
    case 'id-mark-crossref-report': {
      const sorted = speciesAnimals
        .filter((a) => matchesFilter(a))
        .sort((a, b) => {
          const tA = (a.tattoo || '').trim() || 'zzz';
          const tB = (b.tattoo || '').trim() || 'zzz';
          const tCmp = tA.localeCompare(tB);
          if (tCmp !== 0) return tCmp;
          return (a.name || '').localeCompare(b.name || '');
        });

      const regCount = sorted.filter((a) => Boolean(a.registrationNumber?.trim())).length;

      const rows: ReportRow[] = sorted.map((a) => ({
        id: a.id,
        animalId: a.id,
        cells: {
          primaryId: a.tattoo || 'Unmarked',
          regNo: a.registrationNumber || '—',
          gcNo: a.grandChampionNumber || '—',
          name: a.name,
          sex: formatSexForSpecies(a.sex, speciesProfile),
          breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
          dob: formatReadableDate(a.birthDateIso),
          ownership: normalizeOwnershipType(a.ownershipType, 'Owned'),
          status: a.status,
          housing: a.cageLocation || 'Unassigned',
        },
      }));

      return {
        columns: [
          { key: 'primaryId', label: idShortLabel },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'status', label: 'Status' },
          { key: 'housing', label: 'Housing' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Cross-Referenced Records', value: String(rows.length) },
          { label: 'With Registration #', value: String(regCount) },
        ],
      };
    }

    // 20. Breed With Compatibility Report
    case 'breed-with-report': {
      const eligible = speciesAnimals.filter((a) => isAnimalActive(a) && !a.culled);
      const subject = subjectAnimalId ? animalById.get(subjectAnimalId) : undefined;

      let candidateSires = eligible.filter((a) => a.sex === 'Male');
      let candidateDams = eligible.filter((a) => a.sex === 'Female');

      if (subject) {
        if (subject.sex === 'Male') {
          candidateSires = [subject];
        } else if (subject.sex === 'Female') {
          candidateDams = [subject];
        }
      }

      if (filter === 'Male' || filter === 'Non-Adult Male') {
        candidateSires = candidateSires.filter((s) => matchesFilter(s));
      } else if (filter === 'Female' || filter === 'Non-Adult Female') {
        candidateDams = candidateDams.filter((d) => matchesFilter(d));
      }

      interface PairEval {
        id: string;
        sire: Animal;
        dam: Animal;
        coiPercent: number;
        riskLabel: string;
        carrierWarnings: string;
        dangerCount: number;
        warningCount: number;
        sameBreed: boolean;
      }

      const coiEvaluator = createSpeciesCoiEvaluator(herdMap);
      const sireCarrierCache = new Map<string, AnimalCarrierLineageAnalysis>();
      for (const s of candidateSires) {
        sireCarrierCache.set(s.id, analyzeAnimalCarrierLineage(s, herdMap));
      }
      const damCarrierCache = new Map<string, AnimalCarrierLineageAnalysis>();
      for (const d of candidateDams) {
        damCarrierCache.set(
          d.id,
          sireCarrierCache.get(d.id) ?? analyzeAnimalCarrierLineage(d, herdMap)
        );
      }

      const pairs: PairEval[] = [];
      for (const sire of candidateSires) {
        const sireAnalysis = sireCarrierCache.get(sire.id)!;
        for (const dam of candidateDams) {
          if (sire.id === dam.id) continue;
          const coi = coiEvaluator.calculatePairingCoi(sire.id, dam.id);
          const damAnalysis = damCarrierCache.get(dam.id)!;
          const risks = analyzePairingCarrierRisksFromAnalyses(sireAnalysis, damAnalysis);
          const dangerCount = risks.filter((r) => r.severity === 'danger').length;
          const warningCount = risks.filter((r) => r.severity === 'warning').length;
          const carrierText =
            risks.length > 0
              ? risks
                  .slice(0, 3)
                  .map((r) => `${r.trait} (${r.severity.toUpperCase()})`)
                  .join('; ') + (risks.length > 3 ? ` +${risks.length - 3}` : '')
              : 'None detected';
          pairs.push({
            id: `${sire.id}__${dam.id}`,
            sire,
            dam,
            coiPercent: coi.coiPercent,
            riskLabel: coi.risk.label,
            carrierWarnings: carrierText,
            dangerCount,
            warningCount,
            sameBreed:
              Boolean(sire.breed && dam.breed) &&
              sire.breed.trim().toLowerCase() === dam.breed.trim().toLowerCase(),
          });
        }
      }

      pairs.sort((a, b) => {
        if (a.dangerCount !== b.dangerCount) return a.dangerCount - b.dangerCount;
        if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) return a.coiPercent - b.coiPercent;
        if (a.warningCount !== b.warningCount) return a.warningCount - b.warningCount;
        return a.sire.name.localeCompare(b.sire.name) || a.dam.name.localeCompare(b.dam.name);
      });

      const capped = pairs.slice(0, 100);
      const lowCoiCount = pairs.filter((p) => p.coiPercent < 6.25 && p.dangerCount === 0).length;

      const rows: ReportRow[] = capped.map((p) => ({
        id: p.id,
        animalId: p.dam.id,
        highlightTone:
          p.dangerCount > 0 || p.coiPercent >= 25
            ? 'danger'
            : p.warningCount > 0 || p.coiPercent >= 12.5
            ? 'warning'
            : 'success',
        cells: {
          sire: p.sire.name,
          sireId: p.sire.tattoo || 'Unmarked',
          dam: p.dam.name,
          damId: p.dam.tattoo || 'Unmarked',
          coi: `${p.coiPercent.toFixed(2)}%`,
          riskTier: p.riskLabel,
          carriers: p.carrierWarnings,
          breedMatch: p.sameBreed
            ? `${p.sire.breed} (Matched)`
            : `${p.sire.breed || '—'} × ${p.dam.breed || '—'}`,
        },
      }));

      return {
        columns: [
          { key: 'sire', label: 'Male' },
          { key: 'sireId', label: `Male ${idShortLabel}` },
          { key: 'dam', label: 'Female' },
          { key: 'damId', label: `Female ${idShortLabel}` },
          { key: 'coi', label: 'Projected COI', align: 'right' },
          { key: 'riskTier', label: 'COI Tier' },
          { key: 'carriers', label: 'Shared Carrier Alerts' },
          { key: 'breedMatch', label: 'Breed Compatibility' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Pairings Evaluated', value: String(pairs.length) },
          { label: 'Low COI & Clear (<6.25%)', value: String(lowCoiCount), tone: 'positive' },
        ],
      };
    }

    // 21. My Owned Stock Report
    case 'my-owned-stock-report': {
      const owned = speciesAnimals
        .filter(
          (a) =>
            normalizeOwnershipType(a.ownershipType, 'Owned') === 'Owned' &&
            a.status !== 'Sold' &&
            a.status !== 'Deceased' &&
            matchesFilter(a)
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let totalPurchaseCents = 0;

      const rows: ReportRow[] = owned.map((a) => {
        const costCents = a.purchaseCostCents || 0;
        totalPurchaseCents += costCents;
        return {
          id: a.id,
          animalId: a.id,
          cells: {
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            breed: a.breed || '—',
            variety: a.variety || '—',
            dob: formatReadableDate(a.birthDateIso),
            weight: formatWeight(a.weightGrams, weightUnit),
            housing: a.cageLocation || 'Unassigned',
            purchaseCost: costCents > 0 ? formatCurrencyCents(costCents, currencyCode) : '—',
            regNo: a.registrationNumber || '—',
            status: a.status,
          },
        };
      });

      const showEligibleCount = spShows.length;
      const summaryMetrics: ReportSummaryMetric[] = [
        { label: `Owned ${speciesProfile.name}`, value: String(rows.length) },
        {
          label: 'Recorded Acquisition Cost',
          value: formatCurrencyCents(totalPurchaseCents, currencyCode),
        },
      ];
      if (showEligibleCount > 0) {
        summaryMetrics.push({ label: 'Shows Recorded', value: String(showEligibleCount) });
      }

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'breed', label: 'Breed' },
          { key: 'variety', label: 'Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'housing', label: 'Housing' },
          { key: 'purchaseCost', label: 'Acquisition Cost', align: 'right' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics,
      };
    }

    // 22. Outside / Reference Stock Report
    case 'outside-reference-stock-report': {
      const outside = speciesAnimals
        .filter((a) => {
          const own = normalizeOwnershipType(a.ownershipType, 'Owned');
          return own !== 'Owned' && matchesFilter(a);
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const outsideCount = outside.filter(
        (a) => normalizeOwnershipType(a.ownershipType, 'Owned') === 'Outside'
      ).length;
      const refCount = outside.length - outsideCount;

      const coiEvaluator = createSpeciesCoiEvaluator(herdMap);
      const rows: ReportRow[] = outside.map((a) => {
        const own = normalizeOwnershipType(a.ownershipType, 'Owned');
        const coi = coiEvaluator.calculateAnimalCoi(a);
        return {
          id: a.id,
          animalId: a.id,
          cells: {
            ownership: own,
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
            dob: formatReadableDate(a.birthDateIso),
            ownerName: a.ownerName || '—',
            breederName: a.breederName || '—',
            regNo: a.registrationNumber || '—',
            coi: `${coi.coiPercent.toFixed(2)}%`,
            status: a.status,
          },
        };
      });

      return {
        columns: [
          { key: 'ownership', label: 'Type' },
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'ownerName', label: 'Owner' },
          { key: 'breederName', label: 'Breeder' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'coi', label: 'COI %', align: 'right' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Outside / Reference Total', value: String(rows.length) },
          { label: 'Outside Stock / Reference', value: `${outsideCount} / ${refCount}` },
        ],
      };
    }

    // 23. Barn Economics & P&L Margin Report
    case 'barn-economics-report': {
      const speciesLedger = (ctx.snapshot.ledgerEntries ?? []).filter((e) =>
        isSameSpecies(e.species, speciesProfile.name)
      );
      const speciesFeedBatches = (ctx.snapshot.feedBatches ?? []).filter((fb) =>
        isSameSpecies(fb.species, speciesProfile.name)
      );
      const speciesFeedAllocations = (ctx.snapshot.feedAllocations ?? []).filter((fa) =>
        isSameSpecies(fa.species, speciesProfile.name)
      );
      const speciesProcessing = (ctx.snapshot.processingLogs ?? []).filter((pl) =>
        isSameSpecies(pl.species, speciesProfile.name)
      );

      const econSummary = evaluateSpeciesEconomicsSummary({
        animals: speciesAnimals,
        breedings: speciesBreedings,
        ledgerEntries: speciesLedger,
        feedBatches: speciesFeedBatches,
        processingLogs: speciesProcessing,
        currencyCode,
        dateFromIso,
        dateToIso,
      });

      const filteredLedger = speciesLedger
        .filter((e) => {
          if (!isIsoWithinRange(e.dateIso, dateFromIso, dateToIso)) return false;
          if (e.linkedAnimalId) {
            return matchesFilter(animalById.get(e.linkedAnimalId));
          }
          return filter === 'All';
        })
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      const rows: ReportRow[] = filteredLedger.map((e) => {
        const linkedAnimal = e.linkedAnimalId ? animalById.get(e.linkedAnimalId) : undefined;
        return {
          id: e.id,
          animalId: linkedAnimal?.id,
          highlightTone: e.entryType === 'income' ? 'success' : 'normal',
          cells: {
            date: formatReadableDate(e.dateIso),
            type: e.entryType === 'income' ? 'Income' : 'Expense',
            category: getLedgerCategoryLabel(e.category),
            title: e.title,
            party: e.vendorOrParty || '—',
            linkedAnimal: linkedAnimal ? formatAnimalRef(linkedAnimal) : '—',
            receipt: e.receiptPhotoDataUrl || e.receiptPhotoThumbnailDataUrl ? 'Yes' : 'No',
            amount: formatCurrencyCents(e.amountCents, currencyCode),
          },
        };
      });

      // Also append computed animal P&L highlights when no manual ledger entries matched
      const animalMargins = computeAnimalProfitMargins({
        animals: speciesAnimals.filter((a) => matchesFilter(a)),
        breedings: speciesBreedings,
        ledgerEntries: speciesLedger,
        feedBatches: speciesFeedBatches,
        feedAllocations: speciesFeedAllocations,
        processingLogs: speciesProcessing,
        dateFromIso,
        dateToIso,
      });

      return {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'type', label: 'Type' },
          { key: 'category', label: 'Category' },
          { key: 'title', label: 'Description' },
          { key: 'party', label: 'Vendor / Party' },
          { key: 'linkedAnimal', label: 'Linked Animal' },
          { key: 'receipt', label: 'Receipt' },
          { key: 'amount', label: 'Amount', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          {
            label: 'Gross Revenue',
            value: formatCurrencyCents(econSummary.totalRevenueCents, currencyCode),
            tone: econSummary.totalRevenueCents > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'Total Expenses',
            value: formatCurrencyCents(econSummary.totalExpenseCents, currencyCode),
          },
          {
            label: 'Net Profit / Loss',
            value: formatCurrencyCents(econSummary.netProfitCents, currencyCode),
            tone: econSummary.netProfitCents >= 0 ? 'positive' : 'danger',
          },
          {
            label: 'Profit Margin',
            value:
              econSummary.marginPercent !== null
                ? `${econSummary.marginPercent.toFixed(1)}%`
                : 'N/A',
          },
          {
            label: 'Animals with P&L',
            value: String(animalMargins.length),
          },
        ],
      };
    }

    // 24. Meat & Pelt Processing Yield Report
    case 'meat-pelt-yield-report': {
      const speciesProcessing = (ctx.snapshot.processingLogs ?? [])
        .filter((pl) => {
          if (!isSameSpecies(pl.species, speciesProfile.name)) return false;
          const dateVal = pl.harvestDateIso || pl.scheduledDateIso;
          if (!isIsoWithinRange(dateVal, dateFromIso, dateToIso)) return false;
          if (pl.linkedAnimalId) {
            return matchesFilter(animalById.get(pl.linkedAnimalId));
          }
          return filter === 'All';
        })
        .sort((a, b) =>
          (b.harvestDateIso || b.scheduledDateIso || '').localeCompare(
            a.harvestDateIso || a.scheduledDateIso || ''
          )
        );

      const procSummary = evaluateProcessingSummary(speciesProcessing, referenceDateIso);

      const rows: ReportRow[] = speciesProcessing.map((pl) => {
        const linkedAnimal = pl.linkedAnimalId ? animalById.get(pl.linkedAnimalId) : undefined;
        const pct =
          pl.dressOutPercent ?? calculateDressOutPercent(pl.liveWeightGrams, pl.dressedWeightGrams);
        const totalValueCents = (pl.meatValueCents || 0) + (pl.peltValueCents || 0);
        return {
          id: pl.id,
          animalId: linkedAnimal?.id,
          highlightTone:
            pl.status === 'Scheduled' && pl.scheduledDateIso && pl.scheduledDateIso < referenceDateIso
              ? 'warning'
              : pl.status === 'Processed'
              ? 'success'
              : 'normal',
          cells: {
            title: pl.title,
            status: pl.status,
            date: formatReadableDate(pl.harvestDateIso || pl.scheduledDateIso),
            headCount: pl.animalCount,
            liveWeight: pl.liveWeightGrams > 0 ? formatWeight(pl.liveWeightGrams, weightUnit) : '—',
            dressedWeight:
              pl.dressedWeightGrams > 0 ? formatWeight(pl.dressedWeightGrams, weightUnit) : '—',
            dressOut: pct !== undefined ? `${pct.toFixed(1)}%` : '—',
            pelts:
              pl.peltCount > 0 || pl.peltGrade
                ? `${pl.peltCount} (${pl.peltGrade || 'Unspecified'})`
                : '—',
            value: totalValueCents > 0 ? formatCurrencyCents(totalValueCents, currencyCode) : '—',
            cost: pl.processingCostCents
              ? formatCurrencyCents(pl.processingCostCents, currencyCode)
              : '—',
          },
        };
      });

      return {
        columns: [
          { key: 'title', label: 'Batch / Animal' },
          { key: 'status', label: 'Status' },
          { key: 'date', label: 'Harvest / Scheduled' },
          { key: 'headCount', label: 'Count', align: 'right' },
          { key: 'liveWeight', label: 'Live Weight', align: 'right' },
          { key: 'dressedWeight', label: 'Dressed Weight', align: 'right' },
          { key: 'dressOut', label: 'Dress-Out %', align: 'right' },
          { key: 'pelts', label: 'Pelts & Grade' },
          { key: 'value', label: 'Meat + Pelt Value', align: 'right' },
          { key: 'cost', label: 'Processing Cost', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Animals Processed', value: String(procSummary.totalAnimalsProcessed) },
          {
            label: 'Scheduled Harvests',
            value: String(procSummary.scheduledCount),
            tone: procSummary.overdueScheduledLogs.length > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'Avg Dress-Out %',
            value:
              procSummary.averageDressOutPercent !== null
                ? `${procSummary.averageDressOutPercent.toFixed(1)}%`
                : 'N/A',
            tone: procSummary.averageDressOutPercent !== null ? 'positive' : 'neutral',
          },
          { label: 'Pelts Logged', value: String(procSummary.totalPelts) },
          {
            label: 'Meat & Pelt Value',
            value: formatCurrencyCents(
              procSummary.totalMeatValueCents + procSummary.totalPeltValueCents,
              currencyCode
            ),
          },
        ],
      };
    }

    // 25. 4-H / FFA Youth Project Books Report
    case 'youth-project-report': {
      const speciesLedger = (ctx.snapshot.ledgerEntries ?? []).filter((e) =>
        isSameSpecies(e.species, speciesProfile.name)
      );
      const speciesProjects = (ctx.snapshot.youthProjectBooks ?? [])
        .filter((yp) => {
          if (!isSameSpecies(yp.species, speciesProfile.name)) return false;
          if (!isIsoWithinRange(yp.startDateIso, dateFromIso, dateToIso)) return false;
          if (filter !== 'All' && (yp.linkedAnimalIds ?? []).length > 0) {
            return yp.linkedAnimalIds.some((id) => matchesFilter(animalById.get(id)));
          }
          return true;
        })
        .sort((a, b) => (b.projectYear || '').localeCompare(a.projectYear || ''));

      let totalIncomeCents = 0;
      let totalExpenseCents = 0;
      let totalNetCents = 0;

      const rows: ReportRow[] = speciesProjects.map((yp) => {
        const sum = evaluateYouthProjectSummary(yp, {
          animals: speciesAnimals,
          breedings: speciesBreedings,
          ledgerEntries: speciesLedger,
        });
        totalIncomeCents += sum.totalIncomeCents;
        totalExpenseCents += sum.totalExpenseCents;
        totalNetCents += sum.netProjectProfitCents;
        return {
          id: yp.id,
          animalId: sum.enrolledAnimals[0]?.id,
          highlightTone:
            yp.status === 'Completed'
              ? sum.netProjectProfitCents >= 0
                ? 'success'
                : 'warning'
              : 'normal',
          cells: {
            org: yp.organization,
            year: yp.projectYear,
            title: yp.projectTitle,
            member: yp.memberName || '—',
            club: yp.clubOrChapter || '—',
            animals: sum.enrolledAnimals.length,
            feedCost: formatCurrencyCents(sum.totalFeedLogCostCents, currencyCode),
            income: formatCurrencyCents(sum.totalIncomeCents, currencyCode),
            expense: formatCurrencyCents(sum.totalExpenseCents, currencyCode),
            netReturn: formatCurrencyCents(sum.netProjectProfitCents, currencyCode),
            status: yp.status,
          },
        };
      });

      return {
        columns: [
          { key: 'org', label: 'Org' },
          { key: 'year', label: 'Year' },
          { key: 'title', label: 'Project Title' },
          { key: 'member', label: 'Youth Member' },
          { key: 'club', label: 'Club / Chapter' },
          { key: 'animals', label: 'Animals', align: 'right' },
          { key: 'feedCost', label: 'Feed Log Cost', align: 'right' },
          { key: 'income', label: 'Total Income', align: 'right' },
          { key: 'expense', label: 'Total Expense', align: 'right' },
          { key: 'netReturn', label: 'Net Return', align: 'right' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Project Books', value: String(rows.length) },
          {
            label: 'Total Project Income',
            value: formatCurrencyCents(totalIncomeCents, currencyCode),
            tone: totalIncomeCents > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'Total Project Expenses',
            value: formatCurrencyCents(totalExpenseCents, currencyCode),
          },
          {
            label: 'Combined Net Return',
            value: formatCurrencyCents(totalNetCents, currencyCode),
            tone: totalNetCents >= 0 ? 'positive' : 'danger',
          },
        ],
      };
    }

    // 26. CRM Buyer Waitlist Queue Report
    case 'crm-waitlist-report': {
      const speciesClients = (ctx.snapshot.clientContacts ?? []).filter((cc) =>
        isSameSpecies(cc.species, speciesProfile.name)
      );
      const clientMap = new Map(speciesClients.map((c) => [c.id, c]));
      const speciesWaitlist = (ctx.snapshot.waitlistEntries ?? [])
        .filter((wl) => {
          if (!isSameSpecies(wl.species, speciesProfile.name)) return false;
          if (!isIsoWithinRange(wl.inquiryDateIso, dateFromIso, dateToIso)) return false;
          return true;
        })
        .sort(
          (a, b) =>
            (a.priorityRank || 9999) - (b.priorityRank || 9999) ||
            a.inquiryDateIso.localeCompare(b.inquiryDateIso)
        );

      const activeCount = speciesWaitlist.filter(
        (w) => w.status === 'Active' || w.status === 'Matched'
      ).length;
      const overdueFollowUps = speciesWaitlist.filter(
        (w) =>
          (w.status === 'Active' || w.status === 'Matched') &&
          Boolean(w.followUpDateIso) &&
          w.followUpDateIso < referenceDateIso
      ).length;

      const rows: ReportRow[] = speciesWaitlist.map((w) => {
        const client = clientMap.get(w.clientId);
        const contactInfo = client
          ? `${formatPreferredContactLabel(client.preferredContact)}: ${client.phone || client.email || '—'}`
          : '—';
        return {
          id: w.id,
          highlightTone:
            (w.status === 'Active' || w.status === 'Matched') &&
            Boolean(w.followUpDateIso) &&
            w.followUpDateIso < referenceDateIso
              ? 'warning'
              : w.status === 'Deposited' || w.status === 'Fulfilled'
                ? 'success'
                : 'normal',
          cells: {
            rank: `#${w.priorityRank || 1}`,
            buyer: client?.fullName || w.clientName || 'Buyer',
            status: w.status,
            intent: w.intent,
            preferences:
              [w.desiredBreed, w.desiredVariety, w.preferredSex !== 'Any' ? w.preferredSex : '']
                .filter(Boolean)
                .join(' · ') || 'Any',
            inquiryDate: formatReadableDate(w.inquiryDateIso),
            followUp: w.followUpDateIso ? formatReadableDate(w.followUpDateIso) : '—',
            budget:
              w.maxBudgetCents && w.maxBudgetCents > 0
                ? formatCurrencyCents(w.maxBudgetCents, currencyCode)
                : '—',
            contact: contactInfo,
          },
        };
      });

      return {
        columns: [
          { key: 'rank', label: 'Rank', align: 'right' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'status', label: 'Status' },
          { key: 'intent', label: 'Intent' },
          { key: 'preferences', label: 'Desired Stock' },
          { key: 'inquiryDate', label: 'Inquiry Date' },
          { key: 'followUp', label: 'Follow-Up' },
          { key: 'budget', label: 'Max Budget', align: 'right' },
          { key: 'contact', label: 'Contact' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Waitlist Entries', value: String(rows.length) },
          { label: 'Active / Matched', value: String(activeCount), tone: activeCount > 0 ? 'positive' : 'neutral' },
          {
            label: 'Overdue Follow-Ups',
            value: String(overdueFollowUps),
            tone: overdueFollowUps > 0 ? 'danger' : 'neutral',
          },
        ],
      };
    }

    // 27. CRM Reservations & Deposit Tracking Report
    case 'crm-reservations-deposits-report': {
      const speciesReservations = (ctx.snapshot.animalReservations ?? [])
        .filter((ar) => {
          if (!isSameSpecies(ar.species, speciesProfile.name)) return false;
          if (!isIsoWithinRange(ar.reservedDateIso, dateFromIso, dateToIso)) return false;
          if (filter !== 'All' && ar.animalId) {
            return matchesFilter(animalById.get(ar.animalId));
          }
          return true;
        })
        .sort((a, b) => (b.reservedDateIso || '').localeCompare(a.reservedDateIso || ''));

      let totalAgreedCents = 0;
      let totalPaidCents = 0;
      let totalRemainingCents = 0;
      let overdueDepositsCount = 0;

      const rows: ReportRow[] = speciesReservations.map((r) => {
        const fin = evaluateReservationFinancials(r);
        if (r.status !== 'Cancelled') {
          totalAgreedCents += fin.totalPriceCents;
          totalPaidCents += fin.depositPaidCents;
          if (r.status !== 'Picked Up / Completed') {
            totalRemainingCents += fin.balanceRemainingCents;
          }
        }
        const depositOverdue =
          r.status !== 'Cancelled' &&
          r.status !== 'Picked Up / Completed' &&
          fin.depositRemainingCents > 0 &&
          Boolean(r.depositDueDateIso) &&
          r.depositDueDateIso < referenceDateIso;
        if (depositOverdue) overdueDepositsCount += 1;
        return {
          id: r.id,
          animalId: r.animalId,
          highlightTone: depositOverdue
            ? 'danger'
            : r.status === 'Picked Up / Completed' || fin.isPaidInFull
              ? 'success'
              : 'normal',
          cells: {
            agreement: r.agreementNumber || '—',
            buyer: r.clientName || 'Buyer',
            item: r.itemLabel || 'Reserved Stock',
            status: r.status,
            reservedDate: formatReadableDate(r.reservedDateIso),
            totalPrice: formatCurrencyCents(fin.totalPriceCents, currencyCode),
            depositReq: formatCurrencyCents(fin.depositRequiredCents, currencyCode),
            paid: formatCurrencyCents(fin.depositPaidCents, currencyCode),
            balanceDue: formatCurrencyCents(fin.balanceRemainingCents, currencyCode),
            pickupDate: r.pickupScheduledDateIso ? formatReadableDate(r.pickupScheduledDateIso) : '—',
          },
        };
      });

      return {
        columns: [
          { key: 'agreement', label: 'Agreement #' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'item', label: 'Animal / Pick' },
          { key: 'status', label: 'Status' },
          { key: 'reservedDate', label: 'Reserved' },
          { key: 'totalPrice', label: 'Price', align: 'right' },
          { key: 'depositReq', label: 'Deposit Req', align: 'right' },
          { key: 'paid', label: 'Paid', align: 'right' },
          { key: 'balanceDue', label: 'Balance Due', align: 'right' },
          { key: 'pickupDate', label: 'Pickup Date' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Reservations', value: String(rows.length) },
          { label: 'Total Price Value', value: formatCurrencyCents(totalAgreedCents, currencyCode) },
          {
            label: 'Deposits / Payments Collected',
            value: formatCurrencyCents(totalPaidCents, currencyCode),
            tone: totalPaidCents > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'Open Balance Due',
            value: formatCurrencyCents(totalRemainingCents, currencyCode),
          },
          {
            label: 'Overdue Deposits',
            value: String(overdueDepositsCount),
            tone: overdueDepositsCount > 0 ? 'danger' : 'neutral',
          },
        ],
      };
    }

    default: {
      return {
        columns: [{ key: 'notice', label: 'Notice' }],
        rows: [],
        summaryMetrics: [{ label: 'Report ID', value: ctx.spec.id, tone: 'warning' }],
        emptyMessage: `Unknown report template "${ctx.spec.id}".`,
      };
    }
  }
}

/**
 * Exports any `GeneratedReport` as a UTF-8 BOM RFC-4180 CSV string suitable for Excel / Sheets.
 */
export function exportReportToCsv(report: GeneratedReport): string {
  const headerLine = report.columns.map((c) => escapeCsvCell(c.label)).join(',');
  const rowLines = report.rows.map((row) =>
    report.columns.map((c) => escapeCsvCell(row.cells[c.key] ?? '')).join(',')
  );
  return `${UTF8_BOM}${[headerLine, ...rowLines].join('\r\n')}`;
}

/**
 * Builds a clean, dated export filename for a generated report CSV or HTML print file.
 */
export function buildReportFileName(
  report: GeneratedReport,
  ext: 'csv' | 'htm',
  barnName?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const barnSlug = isDefault ? 'pedigree' : slugifySegment(trimmed, 'pedigree');
  const spSlug = slugifySegment(report.speciesName, 'species');
  const repSlug = slugifySegment(report.reportId, 'report');
  const stamp = report.generatedAtDateIso || todayDateIso();
  return `${barnSlug}-${spSlug}-${repSlug}-${stamp}.${ext}`;
}

/**
 * Builds a clean, standalone printable `.HTM` document for `PrintPreviewModal` and PDF export.
 * Enforces white paper print rules (`color-scheme: light only`, `#ffffff` background) matching
 * the app's pedigree & cage-card print standards.
 */
export function buildPrintableReportHtml(
  report: GeneratedReport,
  settings: Pick<BarnSettings, 'barnName' | 'breederName'>
): string {
  const barnTitle = (settings.barnName || '').trim() || 'Community Pedigree';
  const breeder = (settings.breederName || '').trim();

  const summaryHtml =
    report.summaryMetrics.length > 0
      ? `<div class="metrics">
          ${report.summaryMetrics
            .map(
              (m) => `<div class="metric">
                <div class="metric-label">${escapeHtml(m.label)}</div>
                <div class="metric-val">${escapeHtml(m.value)}</div>
              </div>`
            )
            .join('')}
        </div>`
      : '';

  const tableHtml =
    report.rows.length > 0
      ? `<table>
          <thead>
            <tr>
              ${report.columns
                .map(
                  (col) =>
                    `<th class="${col.align === 'right' ? 'num' : ''}">${escapeHtml(col.label)}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${report.rows
              .map(
                (row) => `<tr class="tone-${escapeHtml(row.highlightTone || 'normal')}">
                  ${report.columns
                    .map(
                      (col) =>
                        `<td class="${col.align === 'right' ? 'num' : ''}">${escapeHtml(
                          row.cells[col.key] ?? ''
                        )}</td>`
                    )
                    .join('')}
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`
      : `<div class="empty">${escapeHtml(report.emptyMessage)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(report.speciesName)} — ${escapeHtml(report.title)}</title>
<style>
  @page { size: landscape; margin: 10mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #1e241e; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 16px; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2d5a3d; padding-bottom: 8px; margin-bottom: 12px; gap: 16px; }
  .title { font-family: Georgia, "Times New Roman", serif; font-size: 20px; font-weight: bold; color: #1e3f2a; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #4a534a; }
  .meta-right { text-align: right; font-size: 11px; color: #4a534a; }
  .metrics { display: flex; flex-wrap: wrap; gap: 10px 24px; padding: 8px 12px; border: 1px solid #d5d0c5; border-radius: 6px; margin-bottom: 12px; background: #faf9f6; }
  .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b635b; }
  .metric-val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; color: #1e241e; }
  table { width: 100%; border-collapse: collapse; background: #ffffff; }
  th { background: #f4f2ec; color: #1e3f2a; font-size: 11px; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #c9c3b6; border-bottom: 2px solid #2d5a3d; }
  td { padding: 5px 8px; border: 1px solid #d9d4c8; font-size: 11px; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fbfaf7; }
  th.num, td.num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.tone-warning td:first-child { border-left: 3px solid #b86b2b; }
  tr.tone-danger td:first-child { border-left: 3px solid #9f2d2d; }
  tr.tone-success td:first-child { border-left: 3px solid #2d5a3d; }
  .empty { padding: 20px; border: 1px dashed #c9c3b6; border-radius: 6px; text-align: center; color: #5b635b; }
  @media print {
    :root, html, body, .metrics, table, th, td, tbody tr {
      color-scheme: light only !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${escapeHtml(report.title)}</div>
      <div class="sub">${escapeHtml(barnTitle)}${breeder ? ` &middot; Breeder: ${escapeHtml(breeder)}` : ''} &middot; Species: ${escapeHtml(report.speciesName)} Only &middot; Filter: ${escapeHtml(report.audienceFilter)}</div>
    </div>
    <div class="meta-right">
      <div>Category: ${escapeHtml(report.category)}</div>
      <div>Generated: ${escapeHtml(formatReadableDate(report.generatedAtDateIso))} &middot; Rows: ${report.rows.length}</div>
    </div>
  </div>
  ${summaryHtml}
  ${tableHtml}
</body>
</html>`;
}
```

## `src/core/sampleData.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Species Sample Herd & Lineage Seeder.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Provides authentic 3- to 6-generation pedigree trees (with ~half of active animals having a
 * complete 6-generation pedigree backed by archived/inactive foundation ancestors), active breedings,
 * cascaded Master Task List chores, cage/pen locations, weight/leg logs, and show rosters for ALL
 * predefined species—led by an ARBA-standard New Zealand Red rabbitry.
 */

import { parseGenotypeString } from './geneticsEngine';
import {
  addDaysIso,
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  FeedAllocation,
  FeedBatch,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
} from './models';
import { calculatePairingCoi } from './pedigreeCalculator';
import { generateCascadedTasksForBreeding } from './taskMaster';

interface SeedFamilySpec {
  species: string;
  breed: string;
  varietyA: string;
  varietyB: string;
  tagPrefix: string;
  breederName: string;
  cagePrefix: string;
  avgAdultGrams: number;
  juniorGrams: number;
  genoPgs?: string;
  genoPgd?: string;
  genoMgs?: string;
  genoMgd?: string;
  genoSire?: string;
  genoDam?: string;
  genoSubject?: string;
  names: {
    pgs: string; // Paternal Grandsire
    pgd: string; // Paternal Granddam
    mgs: string; // Maternal Grandsire (can match pgs on purpose in some herds or stay distinct)
    mgd: string; // Maternal Granddam
    sire: string;
    dam: string;
    juniorFemale: string;
    juniorMale: string;
  };
  shareGrandsireForLinebreeding?: boolean;
  sanctionBody: string;
  showTitle: string;
  showLocation: string;
}

const SPECIES_SEED_SPECS: SeedFamilySpec[] = [
  {
    species: 'Rabbit',
    breed: 'New Zealand',
    varietyA: 'Red',
    varietyB: 'Red',
    tagPrefix: 'NZR',
    breederName: 'Copper Creek Rabbitry',
    cagePrefix: 'Hutch R',
    avgAdultGrams: 4650, // ~10 lb 4 oz ARBA Senior New Zealand Red
    juniorGrams: 2950,
    genoPgs: 'AA BB CC DD ee ww',
    genoPgd: 'AA Bb CC DD ee ww',
    genoMgs: 'AA BB CC DD ee ww',
    genoMgd: 'Aa BB CC Dd ee ww',
    genoSire: 'AA Bb CC DD ee ww',
    genoDam: 'Aa BB CC Dd ee ww',
    genoSubject: 'AA B_ CC D_ ee ww',
    names: {
      pgs: 'Copper Creek Red Baron',
      pgd: 'Autumn Briar Scarlet',
      mgs: 'Redwood Ridge Rusty',
      mgd: 'Cinnamon Hollow Ember',
      sire: 'Copper Creek Firestorm',
      dam: 'Copper Creek Crimson Clover',
      juniorFemale: 'Copper Creek Ruby Rose',
      juniorMale: 'Copper Creek Blaze',
    },
    shareGrandsireForLinebreeding: true, // Classic mild linebreeding on Red Baron (12.5% COI)
    sanctionBody: 'ARBA',
    showTitle: 'Pacific Northwest ARBA All-Breed Show',
    showLocation: 'County Fairgrounds Pavilion',
  },
  {
    species: 'Goat',
    breed: 'Nigerian Dwarf',
    varietyA: 'Gold & White',
    varietyB: 'Buckskin',
    tagPrefix: 'NDG',
    breederName: ' Meadowbrook Dairy Goats',
    cagePrefix: 'Pen G',
    avgAdultGrams: 34000, // ~75 lbs
    juniorGrams: 16500,
    names: {
      pgs: 'Cedar Glen Orion *B',
      pgd: 'Willow Run Honeybee 2*M',
      mgs: ' Cloverleaf Atlas *B',
      mgd: 'Meadowbrook Marigold',
      sire: 'Meadowbrook Ranger *B',
      dam: 'Meadowbrook Sweet Clover 3*M',
      juniorFemale: 'Meadowbrook Buttercup',
      juniorMale: 'Meadowbrook Flint',
    },
    shareGrandsireForLinebreeding: true,
    sanctionBody: 'ADGA / AGS',
    showTitle: 'Spring Dairy Goat Classic',
    showLocation: 'Valley Livestock Arena',
  },
  {
    species: 'Sheep',
    breed: 'Katahdin',
    varietyA: 'Red & White',
    varietyB: 'Tan',
    tagPrefix: 'KAT',
    breederName: 'Rolling Hills Hair Sheep',
    cagePrefix: 'Paddock S',
    avgAdultGrams: 68000, // ~150 lbs
    juniorGrams: 31000,
    names: {
      pgs: 'Oakridge Monarch',
      pgd: 'Oakridge Fern',
      mgs: 'Prairie Wind Summit',
      mgd: 'Prairie Wind Laurel',
      sire: 'Rolling Hills Granite',
      dam: 'Rolling Hills Juniper',
      juniorFemale: 'Rolling Hills Hazel',
      juniorMale: 'Rolling Hills Canyon',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'County / State Fair',
    showTitle: 'Autumn Hair Sheep & Forage Expo',
    showLocation: 'Tri-County Ag Center',
  },
  {
    species: 'Swine / Pig',
    breed: 'Berkshire',
    varietyA: 'Black w/ Six White Points',
    varietyB: 'Heritage Black',
    tagPrefix: 'BRK',
    breederName: 'Heritage Oak Farm',
    cagePrefix: 'Pasture Bay P',
    avgAdultGrams: 215000, // ~474 lbs
    juniorGrams: 48000,
    names: {
      pgs: 'Ironwood Duke',
      pgd: 'Ironwood Duchess',
      mgs: 'Acorn Hollow Major',
      mgd: 'Acorn Hollow Pearl',
      sire: 'Heritage Oak Blacksmith',
      dam: 'Heritage Oak Maple',
      juniorFemale: 'Heritage Oak Poppy',
      juniorMale: 'Heritage Oak Forge',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: '4-H / FFA',
    showTitle: 'Regional Heritage Swine Showcase',
    showLocation: 'Heritage Barn Complex',
  },
  {
    species: 'Cattle',
    breed: 'Dexter',
    varietyA: 'Red Non-Chondro',
    varietyB: 'Dun',
    tagPrefix: 'DEX',
    breederName: 'Greenbrier Homestead',
    cagePrefix: 'Pasture C',
    avgAdultGrams: 340000, // ~750 lbs Dexter
    juniorGrams: 135000,
    names: {
      pgs: 'Kerry Glen Fergus',
      pgd: 'Kerry Glen Fiona',
      mgs: 'Highland Brook Rowan',
      mgd: 'Highland Brook Maeve',
      sire: 'Greenbrier Cormac',
      dam: 'Greenbrier Brigid',
      juniorFemale: 'Greenbrier Saoirse',
      juniorMale: 'Greenbrier Declan',
    },
    shareGrandsireForLinebreeding: true,
    sanctionBody: 'Specialty Club',
    showTitle: 'American Dexter Homestead Gathering',
    showLocation: 'State Agricultural Park',
  },
  {
    species: 'Guinea Pig',
    breed: 'Abyssinian',
    varietyA: 'Red',
    varietyB: 'Brindle',
    tagPrefix: 'ABY',
    breederName: 'Clover Patch Caviary',
    cagePrefix: 'Cavy Loft CV',
    avgAdultGrams: 1050, // ~2 lb 5 oz
    juniorGrams: 580,
    names: {
      pgs: 'Clover Patch Nutmeg',
      pgd: 'Clover Patch Ginger',
      mgs: 'Sunbeam Barnaby',
      mgd: 'Sunbeam Cinnamon',
      sire: 'Clover Patch Rosette King',
      dam: 'Clover Patch Clementine',
      juniorFemale: 'Clover Patch Pippin',
      juniorMale: 'Clover Patch Acorn',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'ARBA',
    showTitle: 'Cavy Breeders Specialty Show',
    showLocation: 'Civic Expo Hall',
  },
  {
    species: 'Chinchilla',
    breed: 'Standard Chinchilla',
    varietyA: 'Standard Gray',
    varietyB: 'Violet',
    tagPrefix: 'CHN',
    breederName: 'Andes Mist Chinchillas',
    cagePrefix: 'Tower CH',
    avgAdultGrams: 680,
    juniorGrams: 410,
    names: {
      pgs: 'Andes Mist Sterling',
      pgd: 'Andes Mist Cloud',
      mgs: 'Silver Peak Zephyr',
      mgd: 'Silver Peak Lavender',
      sire: 'Andes Mist Slate',
      dam: 'Andes Mist Amethyst',
      juniorFemale: 'Andes Mist Whisper',
      juniorMale: 'Andes Mist Quartz',
    },
    shareGrandsireForLinebreeding: true,
    sanctionBody: 'Specialty Club',
    showTitle: 'Empress / Mutation Chinchilla Classic',
    showLocation: 'Mountain View Hall',
  },
  {
    species: 'Ferret',
    breed: 'Domestic Ferret',
    varietyA: 'Sable',
    varietyB: 'Cinnamon',
    tagPrefix: 'FRT',
    breederName: 'Woodland Hollow Ferretry',
    cagePrefix: 'Suite F',
    avgAdultGrams: 1250,
    juniorGrams: 690,
    names: {
      pgs: 'Woodland Bandit',
      pgd: 'Woodland Willow',
      mgs: 'Pine Creek Jasper',
      mgd: 'Pine Creek Nutmeg',
      sire: 'Woodland Ranger',
      dam: 'Woodland Maple',
      juniorFemale: 'Woodland Cricket',
      juniorMale: 'Woodland Scout',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'Specialty Club',
    showTitle: 'Autumn Ferret Championship',
    showLocation: 'Community Event Center',
  },
  {
    species: 'Alpaca',
    breed: 'Huacaya',
    varietyA: 'Medium Fawn',
    varietyB: 'Light Brown',
    tagPrefix: 'ALP',
    breederName: 'Sierra Fiber Alpacas',
    cagePrefix: 'Paddock A',
    avgAdultGrams: 64000, // ~141 lbs
    juniorGrams: 28000,
    names: {
      pgs: 'Sierra Gold Inca',
      pgd: 'Sierra Gold Sierra',
      mgs: 'Altiplano Santiago',
      mgd: 'Altiplano Paloma',
      sire: 'Sierra Fiber Cusco',
      dam: 'Sierra Fiber Marisol',
      juniorFemale: 'Sierra Fiber Luna',
      juniorMale: 'Sierra Fiber Mateo',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'Specialty Club',
    showTitle: 'Western Fleece & Halter Futurity',
    showLocation: 'Regional Equine & Fiber Pavilion',
  },
  {
    species: 'Dog',
    breed: 'Golden Retriever',
    varietyA: 'Medium Golden',
    varietyB: 'Dark Golden',
    tagPrefix: 'DOG',
    breederName: 'Timberline Goldens',
    cagePrefix: 'Kennel D',
    avgAdultGrams: 29500, // ~65 lbs
    juniorGrams: 11500,
    names: {
      pgs: 'Timberline Cedar Ridge',
      pgd: 'Timberline Honeybell',
      mgs: 'Suncrest Maverick',
      mgd: 'Suncrest Willow',
      sire: 'Timberline Copperfield',
      dam: 'Timberline Autumn Breeze',
      juniorFemale: 'Timberline Meadow',
      juniorMale: 'Timberline Tucker',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'AKC / UKC',
    showTitle: 'Pacific Northwest All-Breed Kennel Classic',
    showLocation: 'Metro Exhibition Pavilion',
  },
  {
    species: 'Cat',
    breed: 'Maine Coon',
    varietyA: 'Brown Classic Tabby',
    varietyB: 'Silver Torbie & White',
    tagPrefix: 'CAT',
    breederName: 'Whispering Pines Cattery',
    cagePrefix: 'Suite C',
    avgAdultGrams: 6400, // ~14 lbs
    juniorGrams: 2800,
    names: {
      pgs: 'Whispering Pines Magnus',
      pgd: 'Whispering Pines Freya',
      mgs: 'Nordic Crown Thorin',
      mgd: 'Nordic Crown Astrid',
      sire: 'Whispering Pines Lynx',
      dam: 'Whispering Pines Aurora',
      juniorFemale: 'Whispering Pines Willow',
      juniorMale: 'Whispering Pines Jasper',
    },
    shareGrandsireForLinebreeding: false,
    sanctionBody: 'CFA / TICA',
    showTitle: 'Cascade Feline Championship',
    showLocation: 'Harborview Convention Hall',
  },
];

/**
 * Generates deterministic, human-readable IDs per species so re-seeding a species updates
 * existing sample records cleanly without creating duplicate ghosts.
 */
function seedId(speciesSlug: string, suffix: string): string {
  return `seed-${speciesSlug}-${suffix}`;
}

/**
 * Returns true if an entity ID belongs to built-in sample/testing seed data (`seed-...`).
 */
export function isSampleTestingId(id: string | undefined | null): boolean {
  return Boolean(id && id.startsWith('seed-'));
}

/**
 * Counts how many seeded sample/testing records currently exist for `speciesName`
 * (including any photos, care logs, or chores attached to seeded animals/breedings).
 */
export function countSpeciesTestingRecords(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): number {
  const seedAnimalIds = new Set(
    snapshot.animals
      .filter((a) => isSameSpecies(a.species, speciesName) && isSampleTestingId(a.id))
      .map((a) => a.id)
  );
  const seedBreedingIds = new Set(
    snapshot.breedings
      .filter((b) => isSameSpecies(b.species, speciesName) && isSampleTestingId(b.id))
      .map((b) => b.id)
  );

  const photos = (snapshot.animalPhotos ?? []).filter(
    (p) =>
      isSameSpecies(p.species, speciesName) &&
      (isSampleTestingId(p.id) || seedAnimalIds.has(p.animalId))
  ).length;
  const cages = snapshot.cages.filter(
    (c) => isSameSpecies(c.species, speciesName) && isSampleTestingId(c.id)
  ).length;
  const tasks = snapshot.tasks.filter(
    (t) =>
      isSameSpecies(t.species, speciesName) &&
      (isSampleTestingId(t.id) ||
        seedAnimalIds.has(t.linkedAnimalId) ||
        seedBreedingIds.has(t.linkedBreedingId))
  ).length;
  const careLogs = snapshot.careLogs.filter(
    (l) =>
      isSameSpecies(l.species, speciesName) &&
      (isSampleTestingId(l.id) || seedAnimalIds.has(l.animalId))
  ).length;
  const shows = snapshot.shows.filter(
    (s) => isSameSpecies(s.species, speciesName) && isSampleTestingId(s.id)
  ).length;
  const seedFeedBatchIds = new Set(
    (snapshot.feedBatches ?? [])
      .filter((f) => isSameSpecies(f.species, speciesName) && isSampleTestingId(f.id))
      .map((f) => f.id)
  );
  const feedAllocations = (snapshot.feedAllocations ?? []).filter(
    (fa) =>
      isSameSpecies(fa.species, speciesName) &&
      (isSampleTestingId(fa.id) || seedFeedBatchIds.has(fa.feedBatchId))
  ).length;
  const ledgerEntries = (snapshot.ledgerEntries ?? []).filter(
    (le) => isSameSpecies(le.species, speciesName) && isSampleTestingId(le.id)
  ).length;
  const processingLogs = (snapshot.processingLogs ?? []).filter(
    (pl) => isSameSpecies(pl.species, speciesName) && isSampleTestingId(pl.id)
  ).length;
  const youthProjectBooks = (snapshot.youthProjectBooks ?? []).filter(
    (yp) => isSameSpecies(yp.species, speciesName) && isSampleTestingId(yp.id)
  ).length;
  const clientContacts = (snapshot.clientContacts ?? []).filter(
    (cc) => isSameSpecies(cc.species, speciesName) && isSampleTestingId(cc.id)
  ).length;
  const waitlistEntries = (snapshot.waitlistEntries ?? []).filter(
    (wl) => isSameSpecies(wl.species, speciesName) && isSampleTestingId(wl.id)
  ).length;
  const animalReservations = (snapshot.animalReservations ?? []).filter(
    (ar) => isSameSpecies(ar.species, speciesName) && isSampleTestingId(ar.id)
  ).length;
  const woolHarvests = (snapshot.woolHarvests ?? []).filter(
    (wh) => isSameSpecies(wh.species, speciesName) && isSampleTestingId(wh.id)
  ).length;

  return (
    seedAnimalIds.size +
    seedBreedingIds.size +
    photos +
    cages +
    tasks +
    careLogs +
    shows +
    seedFeedBatchIds.size +
    feedAllocations +
    ledgerEntries +
    processingLogs +
    youthProjectBooks +
    clientContacts +
    waitlistEntries +
    animalReservations +
    woolHarvests
  );
}

/**
 * Counts all records (animals, photos, cages, breedings, tasks, careLogs, shows, feedBatches, feedAllocations, ledgerEntries, processingLogs, youthProjectBooks) scoped to `speciesName`.
 */
export function countAllSpeciesRecords(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): number {
  const animals = snapshot.animals.filter((a) => isSameSpecies(a.species, speciesName)).length;
  const photos = (snapshot.animalPhotos ?? []).filter((p) =>
    isSameSpecies(p.species, speciesName)
  ).length;
  const cages = snapshot.cages.filter((c) => isSameSpecies(c.species, speciesName)).length;
  const breedings = snapshot.breedings.filter((b) => isSameSpecies(b.species, speciesName)).length;
  const tasks = snapshot.tasks.filter((t) => isSameSpecies(t.species, speciesName)).length;
  const careLogs = snapshot.careLogs.filter((l) => isSameSpecies(l.species, speciesName)).length;
  const shows = snapshot.shows.filter((s) => isSameSpecies(s.species, speciesName)).length;
  const feedBatches = (snapshot.feedBatches ?? []).filter((f) =>
    isSameSpecies(f.species, speciesName)
  ).length;
  const feedAllocations = (snapshot.feedAllocations ?? []).filter((fa) =>
    isSameSpecies(fa.species, speciesName)
  ).length;
  const ledgerEntries = (snapshot.ledgerEntries ?? []).filter((le) =>
    isSameSpecies(le.species, speciesName)
  ).length;
  const processingLogs = (snapshot.processingLogs ?? []).filter((pl) =>
    isSameSpecies(pl.species, speciesName)
  ).length;
  const youthProjectBooks = (snapshot.youthProjectBooks ?? []).filter((yp) =>
    isSameSpecies(yp.species, speciesName)
  ).length;
  const clientContacts = (snapshot.clientContacts ?? []).filter((cc) =>
    isSameSpecies(cc.species, speciesName)
  ).length;
  const waitlistEntries = (snapshot.waitlistEntries ?? []).filter((wl) =>
    isSameSpecies(wl.species, speciesName)
  ).length;
  const animalReservations = (snapshot.animalReservations ?? []).filter((ar) =>
    isSameSpecies(ar.species, speciesName)
  ).length;
  const woolHarvests = (snapshot.woolHarvests ?? []).filter((wh) =>
    isSameSpecies(wh.species, speciesName)
  ).length;

  return (
    animals +
    photos +
    cages +
    breedings +
    tasks +
    careLogs +
    shows +
    feedBatches +
    feedAllocations +
    ledgerEntries +
    processingLogs +
    youthProjectBooks +
    clientContacts +
    waitlistEntries +
    animalReservations +
    woolHarvests
  );
}

/**
 * Counts non-testing (real / imported / user-entered) records scoped to `speciesName`,
 * strictly complementary to `countSpeciesTestingRecords`.
 */
export function countSpeciesNonTestingRecords(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): number {
  return Math.max(
    0,
    countAllSpeciesRecords(snapshot, speciesName) -
      countSpeciesTestingRecords(snapshot, speciesName)
  );
}

/**
 * Pure helper: deletes ONLY seeded testing data (`seed-...`) inside `speciesName`,
 * keeping real/imported records in `speciesName` and leaving every other species untouched.
 */
export function purgeSpeciesTestingDataPure(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedAnimals: number;
  removedTotalRecords: number;
  removedAnimalIds: Set<string>;
} {
  const ts = nowIsoUtc();
  const removedAnimalIds = new Set<string>();
  const removedBreedingIds = new Set<string>();
  let removedTotalRecords = 0;

  for (const a of snapshot.animals) {
    if (isSameSpecies(a.species, speciesName) && isSampleTestingId(a.id)) {
      removedAnimalIds.add(a.id);
    }
  }
  for (const b of snapshot.breedings) {
    if (isSameSpecies(b.species, speciesName) && isSampleTestingId(b.id)) {
      removedBreedingIds.add(b.id);
    }
  }

  const nextAnimals = snapshot.animals
    .filter((a) => {
      if (removedAnimalIds.has(a.id)) {
        removedTotalRecords++;
        return false;
      }
      return true;
    })
    .map((a) => {
      if (!isSameSpecies(a.species, speciesName)) return a;
      const clearSire = a.sireId && removedAnimalIds.has(a.sireId);
      const clearDam = a.damId && removedAnimalIds.has(a.damId);
      if (!clearSire && !clearDam) return a;
      return {
        ...a,
        sireId: clearSire ? '' : a.sireId,
        damId: clearDam ? '' : a.damId,
        updatedAt: ts,
      };
    });

  const nextPhotos = (snapshot.animalPhotos ?? []).filter((p) => {
    const remove =
      isSameSpecies(p.species, speciesName) &&
      (isSampleTestingId(p.id) || removedAnimalIds.has(p.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCages = snapshot.cages.filter((c) => {
    const remove = isSameSpecies(c.species, speciesName) && isSampleTestingId(c.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextBreedings = snapshot.breedings.filter((b) => {
    if (removedBreedingIds.has(b.id)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextTasks = snapshot.tasks.filter((t) => {
    const remove =
      isSameSpecies(t.species, speciesName) &&
      (isSampleTestingId(t.id) ||
        removedAnimalIds.has(t.linkedAnimalId) ||
        removedBreedingIds.has(t.linkedBreedingId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCareLogs = snapshot.careLogs.filter((l) => {
    const remove =
      isSameSpecies(l.species, speciesName) &&
      (isSampleTestingId(l.id) || removedAnimalIds.has(l.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextShows = snapshot.shows
    .filter((s) => {
      const remove = isSameSpecies(s.species, speciesName) && isSampleTestingId(s.id);
      if (remove) removedTotalRecords++;
      return !remove;
    })
    .map((s) => {
      if (!isSameSpecies(s.species, speciesName)) return s;
      const filteredIds = s.enteredAnimalIds.filter((id) => !removedAnimalIds.has(id));
      if (filteredIds.length === s.enteredAnimalIds.length) return s;
      return { ...s, enteredAnimalIds: filteredIds, updatedAt: ts };
    });

  const removedFeedBatchIds = new Set<string>();
  const nextFeedBatches = (snapshot.feedBatches ?? []).filter((f) => {
    const remove = isSameSpecies(f.species, speciesName) && isSampleTestingId(f.id);
    if (remove) {
      removedFeedBatchIds.add(f.id);
      removedTotalRecords++;
    }
    return !remove;
  });

  const nextFeedAllocations = (snapshot.feedAllocations ?? []).filter((fa) => {
    const remove =
      isSameSpecies(fa.species, speciesName) &&
      (isSampleTestingId(fa.id) || removedFeedBatchIds.has(fa.feedBatchId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextLedgerEntries = (snapshot.ledgerEntries ?? []).filter((le) => {
    const remove = isSameSpecies(le.species, speciesName) && isSampleTestingId(le.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextProcessingLogs = (snapshot.processingLogs ?? []).filter((pl) => {
    const remove = isSameSpecies(pl.species, speciesName) && isSampleTestingId(pl.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextYouthProjectBooks = (snapshot.youthProjectBooks ?? []).filter((yp) => {
    const remove = isSameSpecies(yp.species, speciesName) && isSampleTestingId(yp.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextClientContacts = (snapshot.clientContacts ?? []).filter((cc) => {
    const remove = isSameSpecies(cc.species, speciesName) && isSampleTestingId(cc.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextWaitlistEntries = (snapshot.waitlistEntries ?? []).filter((wl) => {
    const remove = isSameSpecies(wl.species, speciesName) && isSampleTestingId(wl.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextAnimalReservations = (snapshot.animalReservations ?? []).filter((ar) => {
    const remove = isSameSpecies(ar.species, speciesName) && isSampleTestingId(ar.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextWoolHarvests = (snapshot.woolHarvests ?? []).filter((wh) => {
    const remove =
      (isSameSpecies(wh.species, speciesName) && isSampleTestingId(wh.id)) ||
      removedAnimalIds.has(wh.animalId);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  return {
    nextSnapshot: {
      ...snapshot,
      animals: nextAnimals,
      animalPhotos: nextPhotos,
      cages: nextCages,
      breedings: nextBreedings,
      tasks: nextTasks,
      careLogs: nextCareLogs,
      shows: nextShows,
      feedBatches: nextFeedBatches,
      feedAllocations: nextFeedAllocations,
      ledgerEntries: nextLedgerEntries,
      processingLogs: nextProcessingLogs,
      youthProjectBooks: nextYouthProjectBooks,
      clientContacts: nextClientContacts,
      waitlistEntries: nextWaitlistEntries,
      animalReservations: nextAnimalReservations,
      woolHarvests: nextWoolHarvests,
    },
    removedAnimals: removedAnimalIds.size,
    removedTotalRecords,
    removedAnimalIds,
  };
}

/**
 * Pure helper: deletes ONLY non-testing (user-entered / imported) records inside `speciesName`,
 * preserving any seeded testing records (`seed-...`), the `SpeciesProfile`, and all other species.
 */
export function purgeSpeciesNonTestingDataPure(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedAnimals: number;
  removedTotalRecords: number;
  removedAnimalIds: Set<string>;
} {
  const ts = nowIsoUtc();
  const removedAnimalIds = new Set<string>();
  const removedBreedingIds = new Set<string>();
  let removedTotalRecords = 0;

  for (const a of snapshot.animals) {
    if (isSameSpecies(a.species, speciesName) && !isSampleTestingId(a.id)) {
      removedAnimalIds.add(a.id);
    }
  }
  for (const b of snapshot.breedings) {
    if (isSameSpecies(b.species, speciesName) && !isSampleTestingId(b.id)) {
      removedBreedingIds.add(b.id);
    }
  }

  const nextAnimals = snapshot.animals
    .filter((a) => {
      if (removedAnimalIds.has(a.id)) {
        removedTotalRecords++;
        return false;
      }
      return true;
    })
    .map((a) => {
      if (!isSameSpecies(a.species, speciesName)) return a;
      const clearSire = a.sireId && removedAnimalIds.has(a.sireId);
      const clearDam = a.damId && removedAnimalIds.has(a.damId);
      if (!clearSire && !clearDam) return a;
      return {
        ...a,
        sireId: clearSire ? '' : a.sireId,
        damId: clearDam ? '' : a.damId,
        updatedAt: ts,
      };
    });

  const nextPhotos = (snapshot.animalPhotos ?? []).filter((p) => {
    const remove =
      isSameSpecies(p.species, speciesName) &&
      (!isSampleTestingId(p.id) || removedAnimalIds.has(p.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCages = snapshot.cages.filter((c) => {
    const remove = isSameSpecies(c.species, speciesName) && !isSampleTestingId(c.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextBreedings = snapshot.breedings.filter((b) => {
    if (removedBreedingIds.has(b.id)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextTasks = snapshot.tasks.filter((t) => {
    const remove =
      isSameSpecies(t.species, speciesName) &&
      (!isSampleTestingId(t.id) ||
        removedAnimalIds.has(t.linkedAnimalId) ||
        removedBreedingIds.has(t.linkedBreedingId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextCareLogs = snapshot.careLogs.filter((l) => {
    const remove =
      isSameSpecies(l.species, speciesName) &&
      (!isSampleTestingId(l.id) || removedAnimalIds.has(l.animalId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextShows = snapshot.shows
    .filter((s) => {
      const remove = isSameSpecies(s.species, speciesName) && !isSampleTestingId(s.id);
      if (remove) removedTotalRecords++;
      return !remove;
    })
    .map((s) => {
      if (!isSameSpecies(s.species, speciesName)) return s;
      const filteredIds = s.enteredAnimalIds.filter((id) => !removedAnimalIds.has(id));
      if (filteredIds.length === s.enteredAnimalIds.length) return s;
      return { ...s, enteredAnimalIds: filteredIds, updatedAt: ts };
    });

  const removedFeedBatchIds = new Set<string>();
  const nextFeedBatches = (snapshot.feedBatches ?? []).filter((f) => {
    const remove = isSameSpecies(f.species, speciesName) && !isSampleTestingId(f.id);
    if (remove) {
      removedFeedBatchIds.add(f.id);
      removedTotalRecords++;
    }
    return !remove;
  });

  const nextFeedAllocations = (snapshot.feedAllocations ?? []).filter((fa) => {
    const remove =
      isSameSpecies(fa.species, speciesName) &&
      (!isSampleTestingId(fa.id) || removedFeedBatchIds.has(fa.feedBatchId));
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextLedgerEntries = (snapshot.ledgerEntries ?? []).filter((le) => {
    const remove = isSameSpecies(le.species, speciesName) && !isSampleTestingId(le.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextProcessingLogs = (snapshot.processingLogs ?? []).filter((pl) => {
    const remove = isSameSpecies(pl.species, speciesName) && !isSampleTestingId(pl.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextYouthProjectBooks = (snapshot.youthProjectBooks ?? []).filter((yp) => {
    const remove = isSameSpecies(yp.species, speciesName) && !isSampleTestingId(yp.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextClientContacts = (snapshot.clientContacts ?? []).filter((cc) => {
    const remove = isSameSpecies(cc.species, speciesName) && !isSampleTestingId(cc.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextWaitlistEntries = (snapshot.waitlistEntries ?? []).filter((wl) => {
    const remove = isSameSpecies(wl.species, speciesName) && !isSampleTestingId(wl.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextAnimalReservations = (snapshot.animalReservations ?? []).filter((ar) => {
    const remove = isSameSpecies(ar.species, speciesName) && !isSampleTestingId(ar.id);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  const nextWoolHarvests = (snapshot.woolHarvests ?? []).filter((wh) => {
    const remove =
      (isSameSpecies(wh.species, speciesName) && !isSampleTestingId(wh.id)) ||
      removedAnimalIds.has(wh.animalId);
    if (remove) removedTotalRecords++;
    return !remove;
  });

  return {
    nextSnapshot: {
      ...snapshot,
      animals: nextAnimals,
      animalPhotos: nextPhotos,
      cages: nextCages,
      breedings: nextBreedings,
      tasks: nextTasks,
      careLogs: nextCareLogs,
      shows: nextShows,
      feedBatches: nextFeedBatches,
      feedAllocations: nextFeedAllocations,
      ledgerEntries: nextLedgerEntries,
      processingLogs: nextProcessingLogs,
      youthProjectBooks: nextYouthProjectBooks,
      clientContacts: nextClientContacts,
      waitlistEntries: nextWaitlistEntries,
      animalReservations: nextAnimalReservations,
      woolHarvests: nextWoolHarvests,
    },
    removedAnimals: removedAnimalIds.size,
    removedTotalRecords,
    removedAnimalIds,
  };
}

/**
 * Pure helper: deletes ALL records (animals, photos, cages, breedings, chores, care logs, shows)
 * belonging to `speciesName` while preserving the `SpeciesProfile` schedule and all other species.
 */
export function purgeAllSpeciesRecordsPure(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string
): {
  nextSnapshot: BarnDatabaseSnapshot;
  removedAnimals: number;
  removedTotalRecords: number;
  removedAnimalIds: Set<string>;
} {
  const removedAnimalIds = new Set<string>();
  let removedTotalRecords = 0;

  const nextAnimals = snapshot.animals.filter((a) => {
    if (isSameSpecies(a.species, speciesName)) {
      removedAnimalIds.add(a.id);
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextPhotos = (snapshot.animalPhotos ?? []).filter((p) => {
    if (isSameSpecies(p.species, speciesName) || removedAnimalIds.has(p.animalId)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextCages = snapshot.cages.filter((c) => {
    if (isSameSpecies(c.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextBreedings = snapshot.breedings.filter((b) => {
    if (isSameSpecies(b.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextTasks = snapshot.tasks.filter((t) => {
    if (isSameSpecies(t.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextCareLogs = snapshot.careLogs.filter((l) => {
    if (isSameSpecies(l.species, speciesName) || removedAnimalIds.has(l.animalId)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextShows = snapshot.shows.filter((s) => {
    if (isSameSpecies(s.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextFeedBatches = (snapshot.feedBatches ?? []).filter((f) => {
    if (isSameSpecies(f.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextFeedAllocations = (snapshot.feedAllocations ?? []).filter((fa) => {
    if (isSameSpecies(fa.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextLedgerEntries = (snapshot.ledgerEntries ?? []).filter((le) => {
    if (isSameSpecies(le.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextProcessingLogs = (snapshot.processingLogs ?? []).filter((pl) => {
    if (isSameSpecies(pl.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextYouthProjectBooks = (snapshot.youthProjectBooks ?? []).filter((yp) => {
    if (isSameSpecies(yp.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextClientContacts = (snapshot.clientContacts ?? []).filter((cc) => {
    if (isSameSpecies(cc.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextWaitlistEntries = (snapshot.waitlistEntries ?? []).filter((wl) => {
    if (isSameSpecies(wl.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextAnimalReservations = (snapshot.animalReservations ?? []).filter((ar) => {
    if (isSameSpecies(ar.species, speciesName)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  const nextWoolHarvests = (snapshot.woolHarvests ?? []).filter((wh) => {
    if (isSameSpecies(wh.species, speciesName) || removedAnimalIds.has(wh.animalId)) {
      removedTotalRecords++;
      return false;
    }
    return true;
  });

  return {
    nextSnapshot: {
      ...snapshot,
      animals: nextAnimals,
      animalPhotos: nextPhotos,
      cages: nextCages,
      breedings: nextBreedings,
      tasks: nextTasks,
      careLogs: nextCareLogs,
      shows: nextShows,
      feedBatches: nextFeedBatches,
      feedAllocations: nextFeedAllocations,
      ledgerEntries: nextLedgerEntries,
      processingLogs: nextProcessingLogs,
      youthProjectBooks: nextYouthProjectBooks,
      clientContacts: nextClientContacts,
      waitlistEntries: nextWaitlistEntries,
      animalReservations: nextAnimalReservations,
      woolHarvests: nextWoolHarvests,
    },
    removedAnimals: removedAnimalIds.size,
    removedTotalRecords,
    removedAnimalIds,
  };
}

export interface SpeciesSeedBundle {
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  cages: CageLocation[];
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  careLogs: CareLog[];
  shows: ShowEvent[];
  feedBatches: FeedBatch[];
  feedAllocations: FeedAllocation[];
}

/**
 * Builds a complete 3-generation sample herd, cages, active breeding, cascaded Master Task List
 * chores, weight/show care logs, and upcoming show for any predefined or custom species.
 */
export function buildSampleDataForSpecies(
  speciesName: string,
  speciesProfileOverride?: SpeciesProfile,
  referenceTodayIso?: string
): SpeciesSeedBundle | null {
  const ts = nowIsoUtc();
  const today = referenceTodayIso || todayDateIso();
  const matchedSpec = SPECIES_SEED_SPECS.find((s) => isSameSpecies(s.species, speciesName));
  const matchedPreset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, speciesName));

  const speciesProfile: SpeciesProfile = speciesProfileOverride
    ? { ...speciesProfileOverride, updatedAt: ts }
    : matchedPreset
    ? { ...matchedPreset, createdAt: ts, updatedAt: ts }
    : resolveSpeciesProfile(speciesName, []);

  const codePrefix = (speciesProfile.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || 'SP').toUpperCase();
  const spec: SeedFamilySpec = matchedSpec ?? {
    species: speciesProfile.name,
    breed: speciesProfile.exampleBreeds[0] || `Heritage ${speciesProfile.name}`,
    varietyA: 'Chestnut',
    varietyB: 'Black',
    tagPrefix: codePrefix,
    breederName: 'Community Barn',
    cagePrefix: `Pen ${codePrefix}`,
    avgAdultGrams: 5400,
    juniorGrams: 2200,
    names: {
      pgs: `Foundation ${speciesProfile.maleLabel} Atlas`,
      pgd: `Foundation ${speciesProfile.femaleLabel} Willow`,
      mgs: `Outcross ${speciesProfile.maleLabel} Rowan`,
      mgd: `Outcross ${speciesProfile.femaleLabel} Clover`,
      sire: `Herd ${speciesProfile.maleLabel} Cedar`,
      dam: `Herd ${speciesProfile.femaleLabel} Meadow`,
      juniorFemale: `Keeper ${speciesProfile.offspringLabel} Hazel`,
      juniorMale: `Prospect ${speciesProfile.offspringLabel} Birch`,
    },
    showTitle: `${speciesProfile.name} Specialty Club Show`,
    showLocation: 'County Fairgrounds',
    sanctionBody: 'Specialty Club',
    shareGrandsireForLinebreeding: false,
  };

  const slug = spec.species.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const pgsId = seedId(slug, 'pgs');
  const pgdId = seedId(slug, 'pgd');
  const mgsId = spec.shareGrandsireForLinebreeding ? pgsId : seedId(slug, 'mgs');
  const mgdId = seedId(slug, 'mgd');
  const sireId = seedId(slug, 'sire');
  const damId = seedId(slug, 'dam');
  const jrFemaleId = seedId(slug, 'jr-female');
  const jrMaleId = seedId(slug, 'jr-male');

  const makeAnimal = (params: {
    id: string;
    idx: string;
    name: string;
    sex: 'Male' | 'Female';
    status: 'Active' | 'Junior' | 'Retired';
    archived?: boolean;
    daysOld: number;
    weightGrams: number;
    variety: string;
    genoRaw?: string;
    sireId?: string;
    damId?: string;
    cage: string;
    legs: number;
    regSuffix: string;
    notes: string;
  }): Animal => {
    const genoRaw = params.genoRaw || '';
    return {
      id: params.id,
      tattoo: `${spec.tagPrefix}-${params.idx}`,
      name: params.name.trim(),
      species: spec.species,
      breed: spec.breed,
      variety: params.variety,
      sex: params.sex,
      status: params.status,
      archived: Boolean(params.archived),
      birthDateIso: addDaysIso(today, -params.daysOld),
      weightGrams: params.weightGrams,
      genotype: parseGenotypeString(genoRaw, spec.species),
      genotypeRaw: genoRaw,
      registrationNumber: params.regSuffix ? `REG-${spec.tagPrefix}-${params.regSuffix}` : '',
      grandChampionNumber: params.legs >= 3 ? `GC-${spec.tagPrefix}-${params.idx}` : '',
      legsCount: params.legs,
      cageLocation: params.cage,
      breederName: spec.breederName.trim(),
      ownerName: 'My Barn',
      sireId: params.sireId || '',
      damId: params.damId || '',
      notes: params.notes,
      createdAt: ts,
      updatedAt: ts,
    };
  };

  const animals: Animal[] = [
    makeAnimal({
      id: pgsId,
      idx: '101',
      name: spec.names.pgs,
      sex: 'Male',
      status: 'Retired',
      archived: true,
      daysOld: 1120,
      weightGrams: Math.round(spec.avgAdultGrams * 1.02),
      variety: spec.varietyA,
      genoRaw: spec.genoPgs,
      cage: `${spec.cagePrefix}-01`,
      legs: 4,
      regSuffix: '8810',
      notes: `Foundation ${speciesProfile.maleLabel.toLowerCase()} known for deep type, strong bone, and calm temperament.`,
    }),
    makeAnimal({
      id: pgdId,
      idx: '102',
      name: spec.names.pgd,
      sex: 'Female',
      status: 'Retired',
      archived: true,
      daysOld: 1080,
      weightGrams: Math.round(spec.avgAdultGrams * 1.04),
      variety: spec.varietyA,
      genoRaw: spec.genoPgd,
      cage: `${spec.cagePrefix}-02`,
      legs: 3,
      regSuffix: '8814',
      notes: `Consistent maternal line with strong nursing instincts and even litter weights.`,
    }),
  ];

  if (!spec.shareGrandsireForLinebreeding) {
    animals.push(
      makeAnimal({
        id: mgsId,
        idx: '103',
        name: spec.names.mgs,
        sex: 'Male',
        status: 'Active',
        daysOld: 980,
        weightGrams: Math.round(spec.avgAdultGrams * 1.01),
        variety: spec.varietyB,
        genoRaw: spec.genoMgs,
        cage: `${spec.cagePrefix}-03`,
        legs: 2,
        regSuffix: '8902',
        notes: `Outcross maternal grandsire bringing vigor and topline balance.`,
      })
    );
  }

  animals.push(
    makeAnimal({
      id: mgdId,
      idx: '104',
      name: spec.names.mgd,
      sex: 'Female',
      status: 'Active',
      daysOld: 940,
      weightGrams: Math.round(spec.avgAdultGrams * 1.03),
      variety: spec.varietyB,
      genoRaw: spec.genoMgd,
      cage: `${spec.cagePrefix}-04`,
      legs: 2,
      regSuffix: '8919',
      notes: `Reliable dam line with steady growth curve.`,
    }),
    makeAnimal({
      id: sireId,
      idx: '201',
      name: spec.names.sire,
      sex: 'Male',
      status: 'Active',
      daysOld: 540,
      weightGrams: spec.avgAdultGrams,
      variety: spec.varietyA,
      genoRaw: spec.genoSire,
      sireId: pgsId,
      damId: pgdId,
      cage: `${spec.cagePrefix}-05`,
      legs: 3,
      regSuffix: '9201',
      notes: `Primary herd ${speciesProfile.maleLabel.toLowerCase()} with rich coat and balanced shoulders.`,
    }),
    makeAnimal({
      id: damId,
      idx: '202',
      name: spec.names.dam,
      sex: 'Female',
      status: 'Active',
      daysOld: 510,
      weightGrams: Math.round(spec.avgAdultGrams * 1.05),
      variety: spec.varietyA,
      genoRaw: spec.genoDam,
      sireId: mgsId,
      damId: mgdId,
      cage: `${spec.cagePrefix}-06`,
      legs: 2,
      regSuffix: '9208',
      notes: `Attentive ${speciesProfile.femaleLabel.toLowerCase()} currently bred for upcoming ${speciesProfile.birthEventLabel.toLowerCase()}.`,
    }),
    makeAnimal({
      id: jrFemaleId,
      idx: '301',
      name: spec.names.juniorFemale,
      sex: 'Female',
      status: 'Junior',
      daysOld: 95,
      weightGrams: spec.juniorGrams,
      variety: spec.varietyA,
      genoRaw: spec.genoSubject,
      sireId: sireId,
      damId: damId,
      cage: `${spec.cagePrefix}-07`,
      legs: 1,
      regSuffix: '',
      notes: `Promising keeper ${speciesProfile.offspringLabel.toLowerCase()} retained for show string and replacement stock.`,
    }),
    makeAnimal({
      id: jrMaleId,
      idx: '302',
      name: spec.names.juniorMale,
      sex: 'Male',
      status: 'Junior',
      daysOld: 95,
      weightGrams: Math.round(spec.juniorGrams * 0.98),
      variety: spec.varietyB,
      genoRaw: spec.genoSubject,
      sireId: sireId,
      damId: damId,
      cage: `${spec.cagePrefix}-08`,
      legs: 0,
      regSuffix: '',
      notes: `Growing junior ${speciesProfile.maleLabel.toLowerCase()} prospect from previous litter.`,
    })
  );

  const cages: CageLocation[] = animals.map((a, idx) => ({
    id: seedId(slug, `cage-${idx + 1}`),
    species: spec.species,
    label: a.cageLocation,
    section: idx < 4 ? 'Foundation Row' : idx < 6 ? 'Breeding Row' : 'Grow-Out Row',
    capacity: idx >= 6 ? 2 : 1,
    notes: `Assigned to ${a.name} (${a.tattoo})`,
    createdAt: ts,
    updatedAt: ts,
  }));

  // Extend ancestral lineage with Retired/archived foundation animals so ~half of active
  // animals (jrFemale, jrMale, and sire) carry a complete 6-generation pedigree.
  const herdPrefixes = [
    'Oakridge',
    'Briarwood',
    'Suncrest',
    'Timberline',
    'Cloverdale',
    'Meadowlark',
    'Ironwood',
    'Redwood',
  ];
  const maleAncestorNames = [
    'Sovereign',
    'Cavalier',
    'Brigadier',
    'Vanguard',
    'Monarch',
    'Sterling',
    'Sentinel',
    'Marshal',
    'Ranger',
    'Noble',
    'Champion',
    'Warden',
    'Commodore',
    'Duke',
    'Major',
    'Baron',
  ];
  const femaleAncestorNames = [
    'Duchess',
    'Velvet',
    'Autumn',
    'Garnet',
    'Saffron',
    'Briar',
    'Celeste',
    'Dahlia',
    'Empress',
    'Magnolia',
    'Sorrel',
    'Camellia',
    'Heather',
    'Rosette',
    'Aurora',
    'Verbena',
  ];

  const animalById = new Map(animals.map((a) => [a.id, a]));
  const rabbitAncestorGeno = spec.genoPgs ? 'Aa Bb CC Dd ee ww' : '';

  const attachAncestors = (params: {
    rootId: string;
    branchKey: string;
    branchCode: string;
    depth: number;
  }) => {
    const root = animalById.get(params.rootId);
    if (!root || params.depth <= 0) return;

    const rootBirthDaysAgo =
      params.branchKey === 'pgs'
        ? 1120
        : params.branchKey === 'pgd'
        ? 1080
        : params.branchKey === 'mgs'
        ? 980
        : 940;

    let currentLevelIds: string[] = [root.id];

    for (let level = 1; level <= params.depth; level++) {
      const nextLevelIds: string[] = [];
      const levelDaysOld = rootBirthDaysAgo + level * 540;

      for (let i = 0; i < currentLevelIds.length; i++) {
        const child = animalById.get(currentLevelIds[i])!;
        const sireIdx = i * 2;
        const damIdx = i * 2 + 1;

        const ancSireId = seedId(slug, `anc-${params.branchKey}-l${level}-${sireIdx}`);
        const ancDamId = seedId(slug, `anc-${params.branchKey}-l${level}-${damIdx}`);

        const sirePrefix = herdPrefixes[(level * 3 + sireIdx) % herdPrefixes.length];
        const sireGiven = maleAncestorNames[(level * 5 + sireIdx) % maleAncestorNames.length];
        const damPrefix = herdPrefixes[(level * 3 + damIdx + 2) % herdPrefixes.length];
        const damGiven = femaleAncestorNames[(level * 5 + damIdx) % femaleAncestorNames.length];

        const ancSire = makeAnimal({
          id: ancSireId,
          idx: `${params.branchCode}${level}${String(sireIdx + 1).padStart(2, '0')}`,
          name: `${sirePrefix} ${sireGiven} ${params.branchCode}${level}-${sireIdx + 1}`,
          sex: 'Male',
          status: 'Retired',
          archived: true,
          daysOld: levelDaysOld,
          weightGrams: spec.avgAdultGrams,
          variety: sireIdx % 4 === 0 ? spec.varietyB : spec.varietyA,
          genoRaw: rabbitAncestorGeno,
          cage: '',
          legs: level <= 2 && sireIdx === 0 ? 1 : 0,
          regSuffix: level <= 3 ? `${params.branchCode}${level}${String(sireIdx + 1).padStart(2, '0')}` : '',
          notes: `Archived pedigree ancestor (Gen +${level} from ${root.name}).`,
        });

        const ancDam = makeAnimal({
          id: ancDamId,
          idx: `${params.branchCode}${level}${String(damIdx + 1).padStart(2, '0')}`,
          name: `${damPrefix} ${damGiven} ${params.branchCode}${level}-${damIdx + 1}`,
          sex: 'Female',
          status: 'Retired',
          archived: true,
          daysOld: levelDaysOld - 15,
          weightGrams: Math.round(spec.avgAdultGrams * 1.02),
          variety: damIdx % 4 === 1 ? spec.varietyA : spec.varietyB,
          genoRaw: rabbitAncestorGeno,
          cage: '',
          legs: level === 1 ? 1 : 0,
          regSuffix: level <= 3 ? `${params.branchCode}${level}${String(damIdx + 1).padStart(2, '0')}` : '',
          notes: `Archived pedigree ancestor (Gen +${level} from ${root.name}).`,
        });

        child.sireId = ancSireId;
        child.damId = ancDamId;

        animals.push(ancSire, ancDam);
        animalById.set(ancSireId, ancSire);
        animalById.set(ancDamId, ancDam);

        nextLevelIds.push(ancSireId, ancDamId);
      }

      currentLevelIds = nextLevelIds;
    }
  };

  attachAncestors({ rootId: pgsId, branchKey: 'pgs', branchCode: 'P', depth: 5 });
  attachAncestors({ rootId: pgdId, branchKey: 'pgd', branchCode: 'Q', depth: 5 });
  if (!spec.shareGrandsireForLinebreeding) {
    attachAncestors({ rootId: mgsId, branchKey: 'mgs', branchCode: 'M', depth: 4 });
  }
  attachAncestors({ rootId: mgdId, branchKey: 'mgd', branchCode: 'N', depth: 4 });

  const herdMap = new Map(animals.map((a) => [a.id, a]));
  const sire = herdMap.get(sireId)!;
  const dam = herdMap.get(damId)!;
  const projectedCoi = calculatePairingCoi(sire.id, dam.id, herdMap).coiPercent;

  // Set bred date so expected due date lands within the arriving-babies alert window
  // (e.g. 2 days from today) whenever sample data is built or restored.
  const arrivalLeadDays = Math.min(2, Math.max(0, speciesProfile.gestationDays - 1));
  const bredDaysAgo = Math.max(1, speciesProfile.gestationDays - arrivalLeadDays);
  const bredDateIso = addDaysIso(today, -bredDaysAgo);
  const expectedDueDateIso = addDaysIso(bredDateIso, speciesProfile.gestationDays);

  const activeBreeding: BreedingRecord = {
    id: seedId(slug, 'breeding-active'),
    species: spec.species,
    sireId: sire.id,
    damId: dam.id,
    sireName: sire.name,
    damName: dam.name,
    bredDateIso,
    expectedDueDateIso,
    actualBirthDateIso: '',
    projectedCoiPercent: Math.round(projectedCoi * 100) / 100,
    liveCount: 0,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 0,
    offspringCreated: false,
    status: 'Bred',
    notes: `Repeat pairing of ${sire.tattoo} × ${dam.tattoo} following strong prior ${speciesProfile.offspringLabel.toLowerCase()} litter.`,
    createdAt: ts,
    updatedAt: ts,
  };

  const cascadedTasks = generateCascadedTasksForBreeding(activeBreeding, speciesProfile).map(
    (task, idx) => ({
      ...task,
      id: seedId(slug, `task-${idx + 1}`),
      completed: task.dueDateIso < today,
    })
  );

  const overdueTask: BarnTask = {
    id: seedId(slug, 'task-overdue'),
    species: spec.species,
    title: `Pre-${speciesProfile.birthEventLabel} Health & Bedding Check: ${dam.name}`,
    category: 'Health',
    priority: 'High',
    dueDateIso: addDaysIso(today, -2),
    linkedAnimalId: dam.id,
    linkedAnimalName: dam.name,
    linkedBreedingId: activeBreeding.id,
    completed: false,
    createdAt: ts,
    updatedAt: ts,
  };

  const tasks: BarnTask[] = [overdueTask, ...cascadedTasks];

  const careLogs: CareLog[] = [
    {
      id: seedId(slug, 'care-1'),
      species: spec.species,
      animalId: jrFemaleId,
      dateIso: addDaysIso(today, -45),
      type: 'Weight Check',
      title: '6-Week Weaning Weight',
      weightGrams: Math.round(spec.juniorGrams * 0.62),
      showLegEarned: false,
      notes: 'Clean transition onto grower ration.',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: seedId(slug, 'care-2'),
      species: spec.species,
      animalId: jrFemaleId,
      dateIso: addDaysIso(today, -20),
      type: 'Weight Check',
      title: '10-Week Growth Check',
      weightGrams: Math.round(spec.juniorGrams * 0.84),
      showLegEarned: false,
      notes: 'Steady topline and rich coat development.',
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: seedId(slug, 'care-3'),
      species: spec.species,
      animalId: jrFemaleId,
      dateIso: addDaysIso(today, -3),
      type: 'Weight Check',
      title: 'Current Cage-Side Weight',
      weightGrams: spec.juniorGrams,
      showLegEarned: true,
      notes: 'Earned Best Junior Variety leg at club table show.',
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const shows: ShowEvent[] = [
    {
      id: seedId(slug, 'show-1'),
      species: spec.species,
      name: spec.showTitle,
      location: spec.showLocation,
      sanctioningBody: spec.sanctionBody,
      eventDateIso: addDaysIso(today, 18),
      entryDeadlineIso: addDaysIso(today, 10),
      enteredAnimalIds: [sireId, jrFemaleId],
      notes: `Confirm tattoo legibility and travel carriers before entry deadline.`,
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const feedBatchId = seedId(slug, 'feed-1');
  const feedBatches: FeedBatch[] = [
    {
      id: feedBatchId,
      species: spec.species,
      brand: 'Purina Animal Nutrition',
      productName: `${spec.species} Complete Ration 16%`,
      lotNumber: `4291A-${codePrefix}01`,
      millCode: 'PLT-429',
      manufactureDateIso: addDaysIso(today, -18),
      purchaseDateIso: addDaysIso(today, -10),
      bagCount: 4,
      bagWeightValue: 50,
      bagWeightUnit: 'lbs',
      totalQuantity: 200,
      remainingQuantity: 150,
      lowStockThreshold: 50,
      totalCostCents: 9200,
      supplierName: 'Valley Farm & Feed Co-op',
      proteinPercent: 16,
      notes: 'Stored in airtight galvanized feed bin; sewn tag lot recorded.',
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  const feedAllocations: FeedAllocation[] = [
    {
      id: seedId(slug, 'feed-alloc-1'),
      species: spec.species,
      feedBatchId,
      targetType: 'cage',
      targetId: cages[0]?.id || '',
      targetLabel: cages[0]?.label || `${spec.cagePrefix}-1`,
      dateIso: addDaysIso(today, -2),
      quantity: 50,
      unit: 'lbs',
      notes: 'Opened fresh bag for breeding stock hopper.',
      createdAt: ts,
      updatedAt: ts,
    },
  ];

  return {
    speciesProfile,
    animals,
    cages,
    breedings: [activeBreeding],
    tasks,
    careLogs,
    shows,
    feedBatches,
    feedAllocations,
  };
}

/**
 * Builds a complete initial `BarnDatabaseSnapshot` seeded with ALL predefined species
 * so every species tab has rich, strictly isolated 3-generation test data out of the box.
 */
export function buildFullPredefinedSampleSnapshot(
  existingSettings?: Partial<BarnSettings>,
  referenceTodayIso?: string
): BarnDatabaseSnapshot {
  const ts = nowIsoUtc();
  const settings: BarnSettings = {
    id: 'barn_settings',
    barnName: existingSettings?.barnName || 'Copper Creek Barn',
    breederName: existingSettings?.breederName || '',
    preferredUnit: existingSettings?.preferredUnit || 'lbs_oz',
    defaultSpecies: existingSettings?.defaultSpecies || 'Rabbit',
    pinnedLandingSpecies: existingSettings?.pinnedLandingSpecies ?? '',
    defaultGenerations: existingSettings?.defaultGenerations || 3,
    themeMode: existingSettings?.themeMode || 'dark',
    customColors: existingSettings?.customColors,
    imageOptimizationPreset: existingSettings?.imageOptimizationPreset || 'balanced',
    showHomeSummaryGrid: existingSettings?.showHomeSummaryGrid ?? true,
    barnNameOnboarded: existingSettings?.barnNameOnboarded ?? false,
    ignoredTaskIds: existingSettings?.ignoredTaskIds ?? [],
    dismissedTaskGroupKeys: existingSettings?.dismissedTaskGroupKeys ?? {},
    dismissedMemoAlertSignatures: existingSettings?.dismissedMemoAlertSignatures ?? {},
    includePhotoOnPedigree: existingSettings?.includePhotoOnPedigree ?? false,
    feedTagPurgeWindowDays: existingSettings?.feedTagPurgeWindowDays ?? 60,
    updatedAt: ts,
  };

  const speciesProfiles: SpeciesProfile[] = [];
  const animals: Animal[] = [];
  const cages: CageLocation[] = [];
  const breedings: BreedingRecord[] = [];
  const tasks: BarnTask[] = [];
  const careLogs: CareLog[] = [];
  const shows: ShowEvent[] = [];
  const feedBatches: FeedBatch[] = [];
  const feedAllocations: FeedAllocation[] = [];

  PREDEFINED_SPECIES_PRESETS.forEach((preset, idx) => {
    const bundle = buildSampleDataForSpecies(preset.name, undefined, referenceTodayIso);
    if (bundle) {
      speciesProfiles.push({ ...bundle.speciesProfile, sortOrder: idx });
      animals.push(...bundle.animals);
      cages.push(...bundle.cages);
      breedings.push(...bundle.breedings);
      tasks.push(...bundle.tasks);
      careLogs.push(...bundle.careLogs);
      shows.push(...bundle.shows);
      feedBatches.push(...bundle.feedBatches);
      feedAllocations.push(...bundle.feedAllocations);
    }
  });

  return {
    settings,
    speciesProfiles,
    animals,
    animalPhotos: [],
    cages,
    breedings,
    tasks,
    careLogs,
    shows,
    feedBatches,
    feedAllocations,
    ledgerEntries: [],
    processingLogs: [],
    youthProjectBooks: [],
    clientContacts: [],
    waitlistEntries: [],
    animalReservations: [],
    woolHarvests: [],
  };
}
```

## `src/core/shareablePedigreeCard.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Lightweight Standalone Shareable Pedigree HTML Card Generator
 * (`src/core/shareablePedigreeCard.ts`).
 *
 * Produces a self-contained, mobile-friendly, single-file `.html` pedigree summary card
 * (< ~15-40 KB) designed for quick sharing via Web Share, text/email attachments, or
 * buyer packets—without external scripts, fonts, or network dependencies.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls.
 */

import { formatCompactCarrierDisclosure } from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import { escapeSafeHtml, sanitizeSafeRasterImageDataUrl } from './inputSanitization';
import {
  Animal,
  BarnSettings,
  formatPedigreeWeight,
  formatReadableDate,
  formatSexForSpecies,
  nowIsoUtc,
  PedigreeGenerationDepth,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  PedigreeSlot,
} from './pedigreeCalculator';
import { resolvePedigreePrintTheme } from './pedigreePrintStyles';
import { buildAnimalProfileDeepLink, renderQrSvg } from './qrCode';
import { computeAnimalShowSummary } from './showResults';
import type { PedigreePrintOptions } from './syncAndExports';
import {
  AnimalWoolSummary,
  buildWoolHarvestSummaryByAnimalId,
  formatWoolWeightSummary,
  summarizeAnimalWoolHarvests,
} from './woolFiber';

export interface ShareablePedigreeCardOptions extends PedigreePrintOptions {
  /** Optional PWA base URL used to embed a scannable QR profile link when desired. */
  appBaseUrl?: string;
  /** Embed a scannable QR profile badge when `appBaseUrl` is provided (default: false). */
  includeQrCode?: boolean;
}

export function buildShareablePedigreeCardFileName(subject: Animal): string {
  const raw = (subject.tattoo || subject.name || subject.id || 'animal')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `pedigree-card-${raw || 'animal'}.html`;
}

/**
 * Generates a lightweight, self-contained, responsive HTML Pedigree Card suitable for
 * mobile sharing, buyer inquiries, or offline viewing. Always displays a crisp 3-generation
 * card layout and includes a compact collapsible `<details>` block when Gen 4–8 ancestors exist.
 */
export function generateShareablePedigreeCardHtml(
  subject: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  generations: PedigreeGenerationDepth = 3,
  primaryPhotoDataUrl?: string,
  options?: ShareablePedigreeCardOptions
): string {
  const sp = resolveSpeciesProfile(subject.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, subject.species);
  const depth = Math.min(8, Math.max(3, generations));
  const slots = buildPedigreeSlots(subject, herdById, depth, sp);
  const coi = calculateAnimalCoi(subject, herdById);
  const theme = resolvePedigreePrintTheme(options, settings.customColors);

  const showWeights = options?.showWeights ?? true;
  const arbaLbsOzDotNotation = Boolean(options?.arbaLbsOzDotNotation);
  const showGenotypes = options?.showGenotypes ?? false;
  const showBreederFooter = options?.showBreederFooter ?? true;
  const breederContactLine = (options?.breederContactLine || '').trim();
  const showBreederLogo = options?.showBreederLogo ?? true;
  const rawLogoUrl =
    options?.breederLogoDataUrl !== undefined
      ? options.breederLogoDataUrl
      : settings.breederLogoDataUrl;
  const safeLogo = showBreederLogo ? sanitizeSafeRasterImageDataUrl(rawLogoUrl) : '';
  const safePhoto = sanitizeSafeRasterImageDataUrl(primaryPhotoDataUrl);
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });

  const qrUrl =
    options?.includeQrCode && options?.appBaseUrl
      ? buildAnimalProfileDeepLink(options.appBaseUrl, subject)
      : '';
  const qrSvg = qrUrl
    ? renderQrSvg(qrUrl, {
        sizePx: 64,
        quietZone: 2,
        ariaLabel: `QR code to open ${subject.name || subject.tattoo || 'animal'} profile`,
        className: 'qr-svg',
      })
    : '';

  const woolHarvestList = options?.woolHarvests ?? [];
  const woolByAnimalId =
    woolHarvestList.length > 0
      ? buildWoolHarvestSummaryByAnimalId(woolHarvestList)
      : new Map<string, AnimalWoolSummary>();
  const subjectWool =
    woolHarvestList.length > 0 ? summarizeAnimalWoolHarvests(woolHarvestList, subject.id) : null;
  const subjectWoolLine = subjectWool ? formatWoolWeightSummary(subjectWool) : '';

  const renderNodeHtml = (gen: number, idx: number, compact = false): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const isSire = idx % 2 === 0;
    const roleLabel = isSire ? sp.maleLabel : sp.femaleLabel;
    if (!a) {
      return `<div class="node empty ${isSire ? 'sire' : 'dam'}">
        <div class="node-role">${escapeSafeHtml(roleLabel)}</div>
        <div class="node-empty">Unknown</div>
      </div>`;
    }
    const meta = [
      a.tattoo ? `#${escapeSafeHtml(a.tattoo)}` : '',
      a.variety ? escapeSafeHtml(a.variety) : '',
      showWeights && !compact && a.weightGrams > 0
        ? escapeSafeHtml(formatPedigreeWeight(a.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation))
        : '',
    ].filter(Boolean);
    const ancShow =
      (options?.shows?.length || 0) > 0 || (options?.careLogs?.length || 0) > 0
        ? computeAnimalShowSummary(a, options?.shows ?? [], options?.careLogs ?? [])
        : null;
    const ancLegs = ancShow ? ancShow.effectiveLegs : a.legsCount;
    const ancWool = woolByAnimalId.get(a.id);
    const ancWoolCompact =
      ancWool && (ancWool.harvestCount > 0 || ancWool.highestIagarbScore)
        ? formatWoolWeightSummary(ancWool, { compact: true })
        : '';
    const honors = [
      a.registrationNumber ? `Reg ${escapeSafeHtml(a.registrationNumber)}` : '',
      a.grandChampionNumber ? `GC ${escapeSafeHtml(a.grandChampionNumber)}` : '',
      ancLegs > 0 ? `${ancLegs} Leg${ancLegs === 1 ? '' : 's'}` : '',
      ancShow?.awardsSummaryText ? escapeSafeHtml(ancShow.awardsSummaryText) : '',
      !compact && ancWoolCompact ? escapeSafeHtml(ancWoolCompact) : '',
    ].filter(Boolean);

    return `<div class="node ${isSire ? 'sire' : 'dam'}">
      <div class="node-name">${escapeSafeHtml(a.name)}</div>
      ${meta.length ? `<div class="node-meta">${meta.join(' &middot; ')}</div>` : ''}
      ${!compact && honors.length ? `<div class="node-honors">${honors.join(' &middot; ')}</div>` : ''}
    </div>`;
  };

  // Build optional collapsible Gen 4..8 lineage summary only for recorded ancestors
  const deepGenSections: string[] = [];
  let totalDeepRecorded = 0;
  for (let g = 4; g <= depth; g++) {
    const genSlots = slots.filter((sl) => sl.generation === g && sl.animal);
    if (genSlots.length === 0) continue;
    totalDeepRecorded += genSlots.length;
    const items = genSlots
      .map((sl) => {
        const a = sl.animal!;
        const lineTag = sl.slotIndex < (1 << (g - 1)) ? 'Sire Line' : 'Dam Line';
        const idStr = a.tattoo ? ` (${escapeSafeHtml(a.tattoo)})` : '';
        const varStr = a.variety ? ` &mdash; ${escapeSafeHtml(a.variety)}` : '';
        return `<li><span class="deep-role">${escapeSafeHtml(lineTag)}:</span> <strong>${escapeSafeHtml(a.name)}</strong>${idStr}${varStr}</li>`;
      })
      .join('');
    deepGenSections.push(
      `<div class="deep-gen"><h4>Generation ${g} (${genSlots.length} recorded)</h4><ul>${items}</ul></div>`
    );
  }

  const cardRadius =
    theme.borderStyle === 'modern_rounded'
      ? '14px'
      : theme.borderStyle === 'double_frame'
      ? '4px'
      : '8px';
  const cardBorder =
    theme.borderStyle === 'double_frame'
      ? `4px double ${theme.borderHex}`
      : theme.borderStyle === 'minimal_lines'
      ? `1px solid ${theme.cellBorderHex}`
      : `2px solid ${theme.borderHex}`;

  const badges: string[] = [
    `<span class="badge">${escapeSafeHtml(subject.species)}</span>`,
    `<span class="badge">${escapeSafeHtml(formatSexForSpecies(subject.sex, sp))}</span>`,
    `<span class="badge">COI ${coi.coiPercent.toFixed(2)}% (${escapeSafeHtml(coi.risk.label)})</span>`,
  ];
  if (subject.registrationNumber) {
    badges.push(`<span class="badge accent">Reg: ${escapeSafeHtml(subject.registrationNumber)}</span>`);
  }
  const subjShow = computeAnimalShowSummary(
    subject,
    options?.shows ?? [],
    options?.careLogs ?? []
  );
  if (subject.grandChampionNumber) {
    badges.push(`<span class="badge accent">GC: ${escapeSafeHtml(subject.grandChampionNumber)}</span>`);
  }
  if (subjShow.effectiveLegs > 0) {
    badges.push(
      `<span class="badge accent">${subjShow.effectiveLegs} ${subjShow.effectiveLegs === 1 ? 'Leg' : 'Legs'}</span>`
    );
  }
  if (subjShow.gcProgress.isEligible) {
    badges.push('<span class="badge accent">GC Eligible</span>');
  } else if (
    subjShow.showsEntered > 0 &&
    subjShow.effectiveLegs === 0 &&
    !subjShow.gcProgress.isGrandChampion
  ) {
    badges.push(`<span class="badge accent">0/${subjShow.gcProgress.legsTarget} legs</span>`);
  }
  if (subjShow.awardsSummaryText) {
    badges.push(`<span class="badge accent">${escapeSafeHtml(subjShow.awardsSummaryText)}</span>`);
  }
  if (subjShow.totalPoints > 0) {
    badges.push(`<span class="badge accent">${subjShow.totalPoints} pts</span>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-preserve-accent-ink" content="true" />
<title>Pedigree Card - ${escapeSafeHtml(subject.name)}</title>
<style>
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif; padding: 14px; }
  .card { max-width: 680px; margin: 0 auto; background: #ffffff; border: ${cardBorder}; border-radius: ${cardRadius}; padding: 16px; box-sizing: border-box; }
  .top { display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1.5px solid ${theme.borderHex}; padding-bottom: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .logo { max-height: 36px; max-width: 96px; object-fit: contain; border-radius: 4px; }
  .barn-name { font-size: 14px; font-weight: 700; color: ${theme.primaryHex}; }
  .card-sub { font-size: 11px; color: ${theme.mutedInkHex}; }
  .hero { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; }
  .portrait { width: 88px; height: 88px; object-fit: cover; border-radius: 8px; border: 1px solid ${theme.cellBorderHex}; flex-shrink: 0; }
  .hero-main { flex: 1; min-width: 200px; }
  .subj-name { font-size: 20px; font-weight: 700; color: ${theme.primaryHex}; line-height: 1.15; margin: 0 0 4px 0; }
  .subj-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: ${theme.mutedInkHex}; margin-bottom: 6px; }
  .badges { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
  .badge { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; border: 1px solid ${theme.cellBorderHex}; background: #ffffff; color: ${theme.inkHex}; font-weight: 600; }
  .badge.accent { border-color: ${theme.primaryHex}; color: ${theme.primaryHex}; }
  .facts { font-size: 12px; color: ${theme.inkHex}; line-height: 1.45; }
  .qr-wrap { flex-shrink: 0; border: 1px solid ${theme.cellBorderHex}; padding: 3px; border-radius: 6px; text-align: center; background: #ffffff; }
  .qr-svg { display: block; width: 64px; height: 64px; }
  .qr-label { font-size: 8px; font-family: ui-monospace, monospace; text-transform: uppercase; color: ${theme.mutedInkHex}; margin-top: 2px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: ${theme.primaryHex}; font-weight: 700; margin: 12px 0 6px 0; }
  .tree-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .col { display: flex; flex-direction: column; gap: 6px; justify-content: space-around; }
  .col-head { font-size: 10px; font-weight: 700; color: ${theme.mutedInkHex}; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid ${theme.cellBorderHex}; padding-bottom: 2px; margin-bottom: 2px; }
  .node { border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 5px 7px; background: #ffffff; font-size: 11px; line-height: 1.25; }
  .node.sire { border-left: 3px solid ${theme.sireHex}; }
  .node.dam { border-left: 3px solid ${theme.damHex}; }
  .node.empty { opacity: 0.7; }
  .node-name { font-weight: 700; color: ${theme.inkHex}; word-break: break-word; }
  .node-meta, .node-honors, .node-role, .node-empty { font-size: 9.5px; color: ${theme.mutedInkHex}; margin-top: 1px; }
  .node-honors { color: ${theme.primaryHex}; font-weight: 600; }
  .disclosures { margin-top: 10px; padding: 7px 9px; border: 1px dashed ${theme.cellBorderHex}; border-radius: 6px; font-size: 11px; color: ${theme.inkHex}; }
  details.deep-box { margin-top: 10px; border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 7px 10px; font-size: 11px; }
  details.deep-box summary { cursor: pointer; font-weight: 700; color: ${theme.primaryHex}; }
  .deep-gen h4 { margin: 8px 0 4px 0; font-size: 11px; color: ${theme.primaryHex}; }
  .deep-gen ul { margin: 0; padding-left: 16px; }
  .deep-gen li { margin-bottom: 2px; }
  .deep-role { color: ${theme.mutedInkHex}; }
  .notice { margin-top: 8px; font-size: 10px; color: ${theme.mutedInkHex}; }
  .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid ${theme.cellBorderHex}; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 10.5px; color: ${theme.mutedInkHex}; }
  .footer strong { color: ${theme.primaryHex}; }
  @media (max-width: 560px) {
    .tree-grid { grid-template-columns: 1fr; }
  }
  @media print {
    body { padding: 0; }
    .card { max-width: none; }
    :root, html, body, .card, .node, .badge { background: #ffffff !important; }
  }
</style>
</head>
<body>
  <article class="card">
    <header class="top">
      <div class="brand">
        ${safeLogo ? `<img class="logo" src="${safeLogo}" alt="${escapeSafeHtml(settings.barnName || 'Barn Logo')}" />` : ''}
        <div>
          <div class="barn-name">${escapeSafeHtml(settings.barnName || 'Community Pedigree')}</div>
          <div class="card-sub">Shareable ${depth}-Gen Pedigree Card${settings.breederName ? ` &middot; ${escapeSafeHtml(settings.breederName)}` : ''}</div>
        </div>
      </div>
      <div class="card-sub">Generated ${escapeSafeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}</div>
    </header>

    <section class="hero">
      ${safePhoto ? `<img class="portrait" src="${safePhoto}" alt="${escapeSafeHtml(subject.name)}" />` : ''}
      <div class="hero-main">
        <h1 class="subj-name">${escapeSafeHtml(subject.name)}</h1>
        <div class="subj-id">${escapeSafeHtml(subject.tattoo || 'Unmarked ID')} &middot; ${escapeSafeHtml([subject.breed, subject.variety].filter(Boolean).join(' — ') || 'Unspecified Breed/Variety')}</div>
        <div class="badges">${badges.join('')}</div>
        <div class="facts">
          ${subject.birthDateIso ? `<span><strong>DOB:</strong> ${escapeSafeHtml(formatReadableDate(subject.birthDateIso))}</span>` : ''}
          ${showWeights ? `<span>${subject.birthDateIso ? ' &middot; ' : ''}<strong>Weight:</strong> ${escapeSafeHtml(formatPedigreeWeight(subject.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation))}</span>` : ''}
          ${subjectWoolLine ? `<div><strong>Wool / Fiber:</strong> ${escapeSafeHtml(subjectWoolLine)}</div>` : ''}
          ${showGenotypes && subjectGeno ? `<div><strong>Genotype:</strong> <code>${escapeSafeHtml(subjectGeno)}</code></div>` : ''}
        </div>
      </div>
      ${
        qrSvg
          ? `<div class="qr-wrap" data-qr-url="${escapeSafeHtml(qrUrl)}">${qrSvg}<div class="qr-label">Profile</div></div>`
          : ''
      }
    </section>

    <div class="section-title">3-Generation Lineage Summary</div>
    <section class="tree-grid" aria-label="3-Generation Lineage Summary">
      <div class="col">
        <div class="col-head">Parents (Gen 1)</div>
        ${renderNodeHtml(1, 0)}
        ${renderNodeHtml(1, 1)}
      </div>
      <div class="col">
        <div class="col-head">Grandparents (Gen 2)</div>
        ${renderNodeHtml(2, 0)}
        ${renderNodeHtml(2, 1)}
        ${renderNodeHtml(2, 2)}
        ${renderNodeHtml(2, 3)}
      </div>
      <div class="col">
        <div class="col-head">Great-Grandparents (Gen 3)</div>
        ${renderNodeHtml(3, 0, true)}
        ${renderNodeHtml(3, 1, true)}
        ${renderNodeHtml(3, 2, true)}
        ${renderNodeHtml(3, 3, true)}
        ${renderNodeHtml(3, 4, true)}
        ${renderNodeHtml(3, 5, true)}
        ${renderNodeHtml(3, 6, true)}
        ${renderNodeHtml(3, 7, true)}
      </div>
    </section>

    ${
      subjectCarriers
        ? `<div class="disclosures"><strong>Carrier Disclosures:</strong> ${escapeSafeHtml(subjectCarriers)}</div>`
        : ''
    }

    ${
      deepGenSections.length > 0
        ? `<details class="deep-box">
            <summary>Extended Ancestry (Gen 4&ndash;${depth}: ${totalDeepRecorded} recorded ancestor${totalDeepRecorded === 1 ? '' : 's'})</summary>
            ${deepGenSections.join('')}
          </details>`
        : ''
    }

    ${
      (showGenotypes && Boolean(subjectGeno)) || Boolean(subject.rufusLevel)
        ? `<div class="notice"><strong>Notice:</strong> Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified).</div>`
        : ''
    }

    ${
      showBreederFooter
        ? `<footer class="footer">
            <span>${breederContactLine ? `<strong>${escapeSafeHtml(breederContactLine)}</strong>` : escapeSafeHtml(settings.barnName || 'Community Pedigree')}</span>
            <span>Open-source offline pedigree record</span>
          </footer>`
        : ''
    }
  </article>
</body>
</html>`;
}
```

## `src/core/showDocuments.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript ARBA Show Entry Form & Show Remark Card Generators (`src/core/showDocuments.ts`).
 *
 * Generates printable `.HTM` forms and emailable plain-text / `mailto:` summaries directly from
 * `ShowEvent` rosters and structured `ShowAnimalResult` placements.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 */

import { escapeSafeHtml } from './inputSanitization';
import {
  Animal,
  BarnSettings,
  formatReadableDate,
  formatSexForSpecies,
  nowIsoUtc,
  ShowAnimalResult,
  ShowEvent,
  SpeciesProfile,
} from './models';
import { computeDaysBetweenDateIso } from './woolFiber';

export type ShowEntryDivision = 'Open' | 'Youth';
export type RemarkCardLayoutMode = '4up' | '1up';

export interface ShowEntryFormOptions {
  exhibitorName?: string;
  exhibitorBarn?: string;
  exhibitorAddress?: string;
  exhibitorPhone?: string;
  exhibitorEmail?: string;
  exhibitorArbaNumber?: string;
  division?: ShowEntryDivision;
  entryFeePerAnimal?: string;
  furWoolFeePerAnimal?: string;
  defaultEnterFurWool?: boolean;
  coopByAnimalId?: Record<string, string>;
  classOverrideByAnimalId?: Record<string, string>;
  furWoolOverrideByAnimalId?: Record<string, boolean>;
  secretaryEmail?: string;
}

export interface ShowRemarkCardsOptions {
  layoutMode?: RemarkCardLayoutMode;
  division?: ShowEntryDivision;
  exhibitorName?: string;
  coopByAnimalId?: Record<string, string>;
  classOverrideByAnimalId?: Record<string, string>;
  includeExistingJudgeNotes?: boolean;
}

export function buildShowDocumentFileName(show: ShowEvent, kind: 'entry-form' | 'remark-cards'): string {
  const slug = (show.name || show.id || 'show')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const datePart = show.eventDateIso ? `-${show.eventDateIso}` : '';
  return `${kind}-${slug || 'show'}${datePart}.htm`;
}

/**
 * Neutral age-bracket helper based on calendar months at show date (editable via override).
 * Does not hardcode breed-specific weight tables.
 */
export function suggestShowClassLabel(
  animal: Animal,
  showDateIso?: string
): 'Senior' | 'Intermediate' | 'Junior' | 'Pre-Junior' | 'Open / Verify' {
  if (!animal.birthDateIso) {
    return animal.status === 'Junior' ? 'Junior' : 'Open / Verify';
  }
  const refDate =
    showDateIso && /^\d{4}-\d{2}-\d{2}$/.test(showDateIso)
      ? showDateIso
      : nowIsoUtc().slice(0, 10);
  const days = computeDaysBetweenDateIso(animal.birthDateIso, refDate);
  if (days === null || days < 0) {
    return 'Open / Verify';
  }
  const approxMonths = days / 30.4375;
  if (approxMonths >= 8) return 'Senior';
  if (approxMonths >= 6) return 'Intermediate';
  if (approxMonths >= 3) return 'Junior';
  return 'Pre-Junior';
}

export function resolveShowRosterAnimals(show: ShowEvent, speciesAnimals: Animal[]): Animal[] {
  const byId = new Map(speciesAnimals.map((a) => [a.id, a]));
  const ids = new Set<string>(show.enteredAnimalIds ?? []);
  for (const r of show.results ?? []) {
    if (r.animalId) ids.add(r.animalId);
  }
  const list: Animal[] = [];
  for (const id of ids) {
    const animal = byId.get(id);
    if (animal) list.push(animal);
  }
  return list.sort(
    (a, b) =>
      a.breed.localeCompare(b.breed) ||
      a.variety.localeCompare(b.variety) ||
      (a.tattoo || a.name).localeCompare(b.tattoo || b.name)
  );
}

function parseFeeDollars(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

/**
 * Generates a printable official ARBA-style Show Entry Form `.HTM` document from a `ShowEvent`.
 */
export function generateShowEntryFormHtml(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowEntryFormOptions
): string {
  const roster = resolveShowRosterAnimals(show, speciesAnimals);
  const division: ShowEntryDivision = options?.division === 'Youth' ? 'Youth' : 'Open';
  const exhibitorName = (options?.exhibitorName ?? settings.breederName ?? '').trim() || '__________________';
  const exhibitorBarn = (options?.exhibitorBarn ?? settings.barnName ?? '').trim();
  const exhibitorPhone = (options?.exhibitorPhone ?? '').trim();
  const exhibitorEmail = (options?.exhibitorEmail ?? '').trim();
  const exhibitorAddress = (options?.exhibitorAddress ?? '').trim();
  const exhibitorArba = (options?.exhibitorArbaNumber ?? '').trim();
  const defaultFurWool = Boolean(options?.defaultEnterFurWool);
  const baseFeeEach = parseFeeDollars(options?.entryFeePerAnimal);
  const furFeeEach = parseFeeDollars(options?.furWoolFeePerAnimal);

  let furEntriesCount = 0;
  const rowsHtml = roster
    .map((animal, idx) => {
      const coop = (options?.coopByAnimalId?.[animal.id] ?? '').trim() || String(idx + 1);
      const cls = (options?.classOverrideByAnimalId?.[animal.id] ?? '').trim() || suggestShowClassLabel(animal, show.eventDateIso);
      const furChecked =
        options?.furWoolOverrideByAnimalId?.[animal.id] !== undefined
          ? Boolean(options.furWoolOverrideByAnimalId[animal.id])
          : defaultFurWool;
      if (furChecked) furEntriesCount += 1;
      const rowFee = baseFeeEach + (furChecked ? furFeeEach : 0);

      return `<tr>
        <td class="center">${idx + 1}</td>
        <td class="mono">${escapeSafeHtml(coop)}</td>
        <td class="mono strong">${escapeSafeHtml(animal.tattoo || 'UNMARKED')}</td>
        <td>${escapeSafeHtml(animal.breed || speciesProfile.name)}</td>
        <td>${escapeSafeHtml(animal.variety || '—')}</td>
        <td class="center">${escapeSafeHtml(formatSexForSpecies(animal.sex, speciesProfile))}</td>
        <td>${escapeSafeHtml(cls)}</td>
        <td class="mono">${escapeSafeHtml(animal.registrationNumber || '—')}</td>
        <td class="center">${furChecked ? 'YES' : '—'}</td>
        <td class="right mono">${baseFeeEach > 0 || furChecked ? `$${rowFee.toFixed(2)}` : ''}</td>
      </tr>`;
    })
    .join('\n');

  const totalFees = roster.length * baseFeeEach + furEntriesCount * furFeeEach;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="portrait" />
<title>Show Entry Form - ${escapeSafeHtml(show.name)}</title>
<style>
  @page { size: letter portrait; margin: 11mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111827; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 14px; max-width: 8.3in; margin: 0 auto; font-size: 11px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; gap: 12px; }
  .title { font-size: 18px; font-weight: bold; margin: 0; letter-spacing: 0.02em; }
  .subtitle { font-size: 11px; color: #374151; margin-top: 2px; }
  .division-badge { border: 2px solid #111827; padding: 4px 12px; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  .exhibitor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; border: 1px solid #9ca3af; padding: 8px 10px; margin-bottom: 10px; background: #ffffff; }
  .ex-field { line-height: 1.4; }
  .ex-label { font-size: 9.5px; text-transform: uppercase; color: #4b5563; font-weight: bold; }
  table.entries { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.entries th, table.entries td { border: 1px solid #6b7280; padding: 4.5px 6px; text-align: left; }
  table.entries th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; color: #111827; }
  .center { text-align: center !important; }
  .right { text-align: right !important; }
  .mono { font-family: "Courier New", monospace; }
  .strong { font-weight: bold; }
  .summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border: 1px solid #9ca3af; padding: 8px 10px; margin-bottom: 14px; }
  .fees-box { text-align: right; min-width: 180px; font-size: 11.5px; }
  .sig-row { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 18px; }
  .sig-line { border-top: 1px solid #111827; padding-top: 4px; font-size: 10px; color: #374151; }
  @media print {
    body { padding: 0; max-width: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Official ${escapeSafeHtml(show.sanctioningBody || 'ARBA')} Show Entry Form</h1>
      <div class="subtitle">
        <strong>${escapeSafeHtml(show.name)}</strong> &middot; Date: ${escapeSafeHtml(formatReadableDate(show.eventDateIso))}
        ${show.location ? ` &middot; ${escapeSafeHtml(show.location)}` : ''}
      </div>
      ${show.entryDeadlineIso ? `<div class="subtitle">Entry Deadline: ${escapeSafeHtml(formatReadableDate(show.entryDeadlineIso))}</div>` : ''}
    </div>
    <div class="division-badge">${escapeSafeHtml(division)} Division</div>
  </div>

  <div class="exhibitor-grid">
    <div class="ex-field"><span class="ex-label">Exhibitor Name:</span> ${escapeSafeHtml(exhibitorName)}</div>
    <div class="ex-field"><span class="ex-label">Rabbitry / Barn:</span> ${escapeSafeHtml(exhibitorBarn || '__________________')}</div>
    <div class="ex-field"><span class="ex-label">Address:</span> ${escapeSafeHtml(exhibitorAddress || '___________________________')}</div>
    <div class="ex-field"><span class="ex-label">Phone / Email:</span> ${escapeSafeHtml([exhibitorPhone, exhibitorEmail].filter(Boolean).join(' · ') || '___________________________')}</div>
    <div class="ex-field"><span class="ex-label">Sanction / Reg Member #:</span> ${escapeSafeHtml(exhibitorArba || '______________')}</div>
    <div class="ex-field"><span class="ex-label">Species / Breed Group:</span> ${escapeSafeHtml(speciesProfile.name)}</div>
  </div>

  <table class="entries">
    <thead>
      <tr>
        <th class="center" style="width:28px;">#</th>
        <th style="width:52px;">Coop</th>
        <th style="width:92px;">Ear Tattoo</th>
        <th>Breed</th>
        <th>Variety / Color</th>
        <th class="center" style="width:58px;">Sex</th>
        <th style="width:88px;">Class</th>
        <th style="width:76px;">Reg #</th>
        <th class="center" style="width:54px;">Fur/Wool</th>
        <th class="right" style="width:62px;">Fee</th>
      </tr>
    </thead>
    <tbody>
      ${
        rowsHtml ||
        '<tr><td colspan="10" class="center">No entered animals attached to this show event yet.</td></tr>'
      }
    </tbody>
  </table>

  <div class="summary-row">
    <div style="flex:1;">
      <strong>Exhibitor Declaration:</strong> I agree to abide by all rules of the sponsoring club and
      sanctioning organization (${escapeSafeHtml(show.sanctioningBody || 'ARBA')}). All animals listed above are healthy
      and accurately identified by permanent ear number/tag.
      ${show.notes ? `<div style="margin-top:4px; color:#374151;"><strong>Show Notes:</strong> ${escapeSafeHtml(show.notes)}</div>` : ''}
    </div>
    <div class="fees-box">
      <div>Total Entries: <strong>${roster.length}</strong></div>
      <div>Fur / Wool Entries: <strong>${furEntriesCount}</strong></div>
      <div>Total Entry Fees: <strong>${totalFees > 0 ? `$${totalFees.toFixed(2)}` : '__________'}</strong></div>
    </div>
  </div>

  <div class="sig-row">
    <div class="sig-line">Exhibitor Signature (or Parent/Guardian for Youth)</div>
    <div class="sig-line">Date Signed</div>
  </div>
</body>
</html>`;
}

/**
 * Generates an emailable plain-text Show Entry summary ready for copy/paste or `mailto:` dispatch.
 */
export function buildShowEntryPlainTextSummary(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowEntryFormOptions
): string {
  const roster = resolveShowRosterAnimals(show, speciesAnimals);
  const division: ShowEntryDivision = options?.division === 'Youth' ? 'Youth' : 'Open';
  const exhibitorName = (options?.exhibitorName ?? settings.breederName ?? '').trim() || 'Exhibitor';
  const exhibitorBarn = (options?.exhibitorBarn ?? settings.barnName ?? '').trim();
  const lines: string[] = [
    `${show.sanctioningBody || 'ARBA'} SHOW ENTRY - ${show.name}`,
    `Show Date: ${formatReadableDate(show.eventDateIso)}${show.location ? ` | Location: ${show.location}` : ''}`,
    `Division: ${division}`,
    `Exhibitor: ${exhibitorName}${exhibitorBarn ? ` (${exhibitorBarn})` : ''}`,
    options?.exhibitorArbaNumber ? `Member #: ${options.exhibitorArbaNumber}` : '',
    options?.exhibitorPhone || options?.exhibitorEmail
      ? `Contact: ${[options.exhibitorPhone, options.exhibitorEmail].filter(Boolean).join(' | ')}`
      : '',
    '',
    `ENTRIES (${roster.length}):`,
  ].filter((l) => l !== '');

  const baseFeeEach = parseFeeDollars(options?.entryFeePerAnimal);
  const furFeeEach = parseFeeDollars(options?.furWoolFeePerAnimal);
  const defaultFurWool = Boolean(options?.defaultEnterFurWool);
  let furCount = 0;

  roster.forEach((animal, idx) => {
    const coop = (options?.coopByAnimalId?.[animal.id] ?? '').trim();
    const cls =
      (options?.classOverrideByAnimalId?.[animal.id] ?? '').trim() ||
      suggestShowClassLabel(animal, show.eventDateIso);
    const furChecked =
      options?.furWoolOverrideByAnimalId?.[animal.id] !== undefined
        ? Boolean(options.furWoolOverrideByAnimalId[animal.id])
        : defaultFurWool;
    if (furChecked) furCount += 1;
    lines.push(
      `${idx + 1}. Tattoo: ${animal.tattoo || 'UNMARKED'} | ${animal.breed || speciesProfile.name} | ${animal.variety || 'Variety Unset'} | ${formatSexForSpecies(animal.sex, speciesProfile)} | ${cls}${furChecked ? ' | +Fur/Wool' : ''}${coop ? ` | Coop: ${coop}` : ''}${animal.registrationNumber ? ` | Reg: ${animal.registrationNumber}` : ''}`
    );
  });

  if (baseFeeEach > 0 || furCount > 0) {
    const totalFees = roster.length * baseFeeEach + furCount * furFeeEach;
    lines.push('');
    lines.push(`Total Animals: ${roster.length} | Fur/Wool: ${furCount} | Est. Fees: $${totalFees.toFixed(2)}`);
  }

  return lines.join('\n');
}

export function buildShowEntryMailtoUrl(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowEntryFormOptions
): string {
  const to = encodeURIComponent((options?.secretaryEmail || '').trim());
  const subject = encodeURIComponent(
    `Show Entry: ${show.name} (${show.eventDateIso || 'Upcoming'}) - ${
      (options?.exhibitorName ?? settings.breederName ?? settings.barnName ?? 'Exhibitor').trim()
    }`
  );
  const body = encodeURIComponent(
    buildShowEntryPlainTextSummary(show, speciesAnimals, speciesProfile, settings, options)
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/**
 * Generates printable ARBA-style Show Remark Card labels directly from a `ShowEvent`.
 * Supports 4-up US Letter sheets (`4up`) or individual `4"x6"` index/thermal cards (`1up`).
 */
export function generateShowRemarkCardsHtml(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowRemarkCardsOptions
): string {
  const roster = resolveShowRosterAnimals(show, speciesAnimals);
  const layoutMode: RemarkCardLayoutMode = options?.layoutMode === '1up' ? '1up' : '4up';
  const division: ShowEntryDivision = options?.division === 'Youth' ? 'Youth' : 'Open';
  const exhibitorName = (options?.exhibitorName ?? settings.breederName ?? settings.barnName ?? '').trim();
  const includeExisting = options?.includeExistingJudgeNotes ?? true;
  const resultsByAnimalId = new Map<string, ShowAnimalResult>();
  for (const r of show.results ?? []) {
    if (r.animalId) resultsByAnimalId.set(r.animalId, r);
  }

  const cards = roster.map((animal, idx) => {
    const coop = (options?.coopByAnimalId?.[animal.id] ?? '').trim() || String(idx + 1);
    const cls =
      (options?.classOverrideByAnimalId?.[animal.id] ?? '').trim() ||
      suggestShowClassLabel(animal, show.eventDateIso);
    const result = includeExisting ? resultsByAnimalId.get(animal.id) : undefined;
    const awardBadges = result
      ? [
          result.classPlacement ? result.classPlacement : '',
          ...result.awards,
          result.legsEarned > 0 ? `${result.legsEarned} Leg(s)` : '',
        ].filter(Boolean)
      : [];

    return `<div class="remark-card">
      <div class="rc-top">
        <div>
          <div class="rc-show">${escapeSafeHtml(show.name)} &middot; ${escapeSafeHtml(formatReadableDate(show.eventDateIso))}</div>
          <div class="rc-sub">${escapeSafeHtml(show.sanctioningBody || 'ARBA')} &middot; ${escapeSafeHtml(division)} Division${exhibitorName ? ` &middot; ${escapeSafeHtml(exhibitorName)}` : ''}</div>
        </div>
        <div class="rc-coop">Coop ${escapeSafeHtml(coop)}</div>
      </div>

      <div class="rc-animal-grid">
        <div><span class="lbl">Ear #</span> <strong class="mono">${escapeSafeHtml(animal.tattoo || 'UNMARKED')}</strong></div>
        <div><span class="lbl">Sex</span> <strong>${escapeSafeHtml(formatSexForSpecies(animal.sex, speciesProfile))}</strong></div>
        <div><span class="lbl">Breed</span> <strong>${escapeSafeHtml(animal.breed || speciesProfile.name)}</strong></div>
        <div><span class="lbl">Variety</span> <strong>${escapeSafeHtml(animal.variety || '—')}</strong></div>
        <div><span class="lbl">Class</span> <strong>${escapeSafeHtml(cls)}</strong></div>
        <div><span class="lbl">Name</span> <strong>${escapeSafeHtml(animal.name || '—')}</strong></div>
      </div>

      <div class="rc-rubric">
        <div>&#9744; Type / Balance</div>
        <div>&#9744; Head / Ears / Crown</div>
        <div>&#9744; Fur / Wool Quality</div>
        <div>&#9744; Color / Markings</div>
        <div>&#9744; Bone / Feet / Hocks</div>
        <div>&#9744; Condition / Flesh</div>
      </div>

      <div class="rc-remarks">
        <div class="lbl">Judge Remarks &amp; Placings</div>
        ${
          result?.judgeNotes
            ? `<div class="judge-notes">${escapeSafeHtml(result.judgeNotes)}</div>`
            : '<div class="write-lines"><div></div><div></div><div></div></div>'
        }
      </div>

      <div class="rc-footer">
        <div><strong>Placed:</strong> ${escapeSafeHtml(awardBadges.join(' · ') || '________')}</div>
        <div><strong>Judge:</strong> ${escapeSafeHtml(result?.judgeName || '________________')}</div>
      </div>
    </div>`;
  });

  const pagesHtml =
    layoutMode === '1up'
      ? cards.map((card) => `<div class="page single-page">${card}</div>`).join('\n')
      : (() => {
          const chunks: string[] = [];
          for (let i = 0; i < cards.length; i += 4) {
            chunks.push(`<div class="page grid-4up">${cards.slice(i, i + 4).join('\n')}</div>`);
          }
          return chunks.join('\n');
        })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="landscape" />
<title>Show Remark Cards - ${escapeSafeHtml(show.name)}</title>
<style>
  @page { size: ${layoutMode === '1up' ? '6in 4in' : 'letter landscape'}; margin: ${layoutMode === '1up' ? '4mm' : '8mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111827; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: ${layoutMode === '1up' ? '4px' : '10px'}; }
  .page { page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .grid-4up { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .single-page { max-width: 5.8in; margin: 0 auto; }
  .remark-card { border: 2px solid #111827; border-radius: 6px; padding: 10px 12px; background: #ffffff; box-sizing: border-box; min-height: 3.35in; display: flex; flex-direction: column; justify-content: space-between; break-inside: avoid; }
  .rc-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827; padding-bottom: 5px; margin-bottom: 6px; gap: 8px; }
  .rc-show { font-size: 11px; font-weight: bold; }
  .rc-sub { font-size: 9.5px; color: #4b5563; }
  .rc-coop { border: 1.5px solid #111827; padding: 2px 7px; font-size: 11px; font-weight: bold; white-space: nowrap; }
  .rc-animal-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 8px; font-size: 10.5px; margin-bottom: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 5px; }
  .lbl { font-size: 8.5px; text-transform: uppercase; color: #4b5563; display: block; }
  .mono { font-family: "Courier New", monospace; }
  .rc-rubric { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 6px; font-size: 9.5px; margin-bottom: 6px; }
  .rc-remarks { flex: 1; display: flex; flex-direction: column; margin-bottom: 6px; }
  .judge-notes { font-size: 10.5px; line-height: 1.35; border: 1px solid #d1d5db; padding: 5px 6px; border-radius: 4px; min-height: 46px; }
  .write-lines div { border-bottom: 1px solid #9ca3af; height: 18px; }
  .rc-footer { display: flex; justify-content: space-between; font-size: 10px; border-top: 1px solid #111827; padding-top: 5px; gap: 8px; }
  @media print {
    body { padding: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  ${pagesHtml || '<p>No entered animals attached to this show event yet.</p>'}
</body>
</html>`;
}
```

## `src/core/showResults.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Show Results, Awards, Grand Championship Progress & E-Leg Vault Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same normalization, GC progress evaluation, pedigree honor formatting, and report aggregations
 * run cleanly in Web PWAs, unit tests, and React Native / Expo.
 */

import {
  isSafeRecordKey,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
} from './inputSanitization';
import {
  Animal,
  CareLog,
  generateUuid,
  nowIsoUtc,
  SHOW_AWARD_OPTIONS,
  ShowAnimalResult,
  ShowAwardCode,
  ShowELegAttachment,
  ShowEvent,
} from './models';

export const GC_LEG_TARGET = 3;
export const MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT = 6;

const ALLOWED_AWARD_CODES = new Set<ShowAwardCode>(
  SHOW_AWARD_OPTIONS.map((opt) => opt.code)
);

const AWARD_DISPLAY_ORDER: ShowAwardCode[] = [
  'BIS',
  'RIS',
  'GCH',
  'BOB',
  'BOS',
  'BOV',
  'BOSV',
];

function finiteNonNegInt(raw: unknown, max = 10_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n));
}

function finiteNonNegPoints(raw: unknown, max = 1_000_000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(max, Math.round(n * 100) / 100);
}

export function normalizeShowAwards(raw: unknown): ShowAwardCode[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ShowAwardCode>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const upper = item.trim().toUpperCase() as ShowAwardCode;
    if (ALLOWED_AWARD_CODES.has(upper)) {
      seen.add(upper);
    }
  }
  return AWARD_DISPLAY_ORDER.filter((code) => seen.has(code));
}

export function sanitizeShowELegAttachment(raw: unknown): ShowELegAttachment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const safeDataUrl = sanitizeSafeRasterImageDataUrl(obj.dataUrl);
  const safeThumbUrl = sanitizeSafeRasterImageDataUrl(obj.thumbnailDataUrl) || safeDataUrl;
  if (!safeDataUrl && !safeThumbUrl) return null;

  const resolvedDataUrl = safeDataUrl || safeThumbUrl;
  const resolvedThumb = safeThumbUrl || resolvedDataUrl;
  const rawId = typeof obj.id === 'string' ? sanitizeSingleLineText(obj.id, 120) : '';

  return {
    id: rawId && isSafeRecordKey(rawId) ? rawId : generateUuid(),
    fileName: sanitizeSingleLineText(obj.fileName || 'e-leg-certificate', 180) || 'e-leg-certificate',
    mimeType: sanitizeSingleLineText(obj.mimeType || 'image/webp', 80) || 'image/webp',
    width: finiteNonNegInt(obj.width, 32_768),
    height: finiteNonNegInt(obj.height, 32_768),
    storedBytes: finiteNonNegInt(obj.storedBytes, 50_000_000),
    thumbnailDataUrl: resolvedThumb,
    dataUrl: resolvedDataUrl,
    caption: sanitizeSingleLineText(obj.caption || '', 240) || undefined,
    addedAtIso:
      typeof obj.addedAtIso === 'string' && obj.addedAtIso.trim()
        ? sanitizeSingleLineText(obj.addedAtIso, 48)
        : nowIsoUtc(),
  };
}

export function hasMeaningfulShowResult(result: ShowAnimalResult): boolean {
  return Boolean(
    result.classPlacement.trim() ||
      result.awards.length > 0 ||
      (result.judgeName || '').trim() ||
      result.judgeNotes.trim() ||
      result.legsEarned > 0 ||
      (result.pointsEarned ?? 0) > 0 ||
      (result.legCertificateNumber || '').trim() ||
      result.eLegAttachments.length > 0
  );
}

export function normalizeShowResults(
  raw: unknown,
  options?: { dropEmpty?: boolean }
): ShowAnimalResult[] {
  if (!Array.isArray(raw)) return [];
  const byAnimalId = new Map<string, ShowAnimalResult>();

  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const rawAnimalId = typeof obj.animalId === 'string' ? obj.animalId.trim() : '';
    if (!rawAnimalId || !isSafeRecordKey(rawAnimalId)) continue;
    const animalId = sanitizeSingleLineText(rawAnimalId, 140);
    if (!animalId) continue;

    const rawAttachments = Array.isArray(obj.eLegAttachments) ? obj.eLegAttachments : [];
    const eLegAttachments: ShowELegAttachment[] = [];
    const seenAttachmentIds = new Set<string>();
    for (const att of rawAttachments) {
      if (eLegAttachments.length >= MAX_SHOW_ELEG_ATTACHMENTS_PER_RESULT) break;
      const clean = sanitizeShowELegAttachment(att);
      if (clean && !seenAttachmentIds.has(clean.id)) {
        seenAttachmentIds.add(clean.id);
        eLegAttachments.push(clean);
      }
    }

    const points = finiteNonNegPoints(obj.pointsEarned);
    const judgeName = sanitizeSingleLineText(obj.judgeName || '', 120);
    const certNo = sanitizeSingleLineText(obj.legCertificateNumber || '', 80);

    const normalized: ShowAnimalResult = {
      animalId,
      classPlacement: sanitizeSingleLineText(obj.classPlacement || '', 120),
      awards: normalizeShowAwards(obj.awards),
      judgeName: judgeName || undefined,
      judgeNotes: sanitizePlainText(obj.judgeNotes || '', 4_000).trim(),
      legsEarned: finiteNonNegInt(obj.legsEarned, 20),
      pointsEarned: points > 0 ? points : undefined,
      legCertificateNumber: certNo || undefined,
      eLegAttachments,
    };

    if (options?.dropEmpty && !hasMeaningfulShowResult(normalized)) {
      continue;
    }

    byAnimalId.set(animalId, normalized);
  }

  return Array.from(byAnimalId.values());
}

export function mergeEnteredAnimalIdsWithResults(
  enteredAnimalIds: string[],
  results?: ShowAnimalResult[]
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of enteredAnimalIds) {
    const clean = typeof id === 'string' ? id.trim() : '';
    if (!clean || !isSafeRecordKey(clean) || seen.has(clean)) continue;
    seen.add(clean);
    ordered.push(clean);
  }
  for (const res of results ?? []) {
    const clean = typeof res.animalId === 'string' ? res.animalId.trim() : '';
    if (!clean || !isSafeRecordKey(clean) || seen.has(clean)) continue;
    seen.add(clean);
    ordered.push(clean);
  }
  return ordered;
}

/**
 * Computes per-animal leg count deltas (`nextLegs - prevLegs`) when creating,
 * updating, or deleting a `ShowEvent` so `Animal.legsCount` stays synchronized.
 */
export function computeShowLegDeltas(
  prevResults: ShowAnimalResult[] | undefined,
  nextResults: ShowAnimalResult[] | undefined
): Map<string, number> {
  const prevByAnimal = new Map<string, number>();
  for (const r of prevResults ?? []) {
    if (!r.animalId) continue;
    prevByAnimal.set(r.animalId, (prevByAnimal.get(r.animalId) || 0) + finiteNonNegInt(r.legsEarned, 20));
  }

  const nextByAnimal = new Map<string, number>();
  for (const r of nextResults ?? []) {
    if (!r.animalId) continue;
    nextByAnimal.set(r.animalId, (nextByAnimal.get(r.animalId) || 0) + finiteNonNegInt(r.legsEarned, 20));
  }

  const allIds = new Set<string>([...prevByAnimal.keys(), ...nextByAnimal.keys()]);
  const deltas = new Map<string, number>();
  for (const animalId of allIds) {
    const delta = (nextByAnimal.get(animalId) || 0) - (prevByAnimal.get(animalId) || 0);
    if (delta !== 0) {
      deltas.set(animalId, delta);
    }
  }
  return deltas;
}

export interface AnimalShowHistoryEntry {
  showId: string;
  showName: string;
  eventDateIso: string;
  location: string;
  sanctioningBody: string;
  result: ShowAnimalResult | null;
}

export interface AnimalELegVaultItem extends ShowELegAttachment {
  showId: string;
  showName: string;
  eventDateIso: string;
  sanctioningBody: string;
  legCertificateNumber?: string;
}

export interface GrandChampionProgress {
  isGrandChampion: boolean;
  grandChampionNumber: string;
  legsEarned: number;
  legsTarget: number;
  distinctJudgesCount: number;
  isEligible: boolean;
  progressPercent: number;
  statusLabel: string;
  shortLabel: string;
}

export interface AnimalShowSummary {
  showsEntered: number;
  placementsRecorded: number;
  totalShowEventLegs: number;
  totalCareLogLegs: number;
  effectiveLegs: number;
  totalPoints: number;
  awardCounts: Record<ShowAwardCode, number>;
  awardsSummaryText: string;
  distinctJudgesWithLegs: number;
  eLegAttachments: AnimalELegVaultItem[];
  entries: AnimalShowHistoryEntry[];
  gcProgress: GrandChampionProgress;
  pedigreeHonorLine: string;
}

export function formatAwardCountsText(awardCounts: Record<ShowAwardCode, number>): string {
  const parts: string[] = [];
  for (const code of AWARD_DISPLAY_ORDER) {
    const count = awardCounts[code] || 0;
    if (count > 0) {
      parts.push(count === 1 ? code : `${count}x ${code}`);
    }
  }
  return parts.join(' · ');
}

export function computeAnimalShowSummary(
  animal: Animal,
  shows: ShowEvent[] = [],
  careLogs: CareLog[] = []
): AnimalShowSummary {
  const awardCounts: Record<ShowAwardCode, number> = {
    BOB: 0,
    BOS: 0,
    BIS: 0,
    GCH: 0,
    BOV: 0,
    BOSV: 0,
    RIS: 0,
  };

  const entries: AnimalShowHistoryEntry[] = [];
  const eLegAttachments: AnimalELegVaultItem[] = [];
  const legJudges = new Set<string>();

  let totalShowEventLegs = 0;
  let totalPoints = 0;
  let placementsRecorded = 0;

  for (const show of shows) {
    const result = (show.results ?? []).find((r) => r.animalId === animal.id) ?? null;
    const isEntered = (show.enteredAnimalIds ?? []).includes(animal.id) || Boolean(result);
    if (!isEntered) continue;

    entries.push({
      showId: show.id,
      showName: show.name,
      eventDateIso: show.eventDateIso,
      location: show.location,
      sanctioningBody: show.sanctioningBody,
      result,
    });

    if (result) {
      const hasPlacementOrWin = Boolean(
        result.classPlacement.trim() ||
          result.awards.length > 0 ||
          result.legsEarned > 0 ||
          (result.pointsEarned ?? 0) > 0
      );
      if (hasPlacementOrWin) {
        placementsRecorded += 1;
      }
      totalShowEventLegs += finiteNonNegInt(result.legsEarned, 20);
      totalPoints += finiteNonNegPoints(result.pointsEarned);

      for (const code of result.awards) {
        if (ALLOWED_AWARD_CODES.has(code)) {
          awardCounts[code] += 1;
        }
      }

      if (result.legsEarned > 0 && result.judgeName?.trim()) {
        legJudges.add(result.judgeName.trim().toLowerCase());
      }

      for (const att of result.eLegAttachments ?? []) {
        eLegAttachments.push({
          ...att,
          showId: show.id,
          showName: show.name,
          eventDateIso: show.eventDateIso,
          sanctioningBody: show.sanctioningBody,
          legCertificateNumber: result.legCertificateNumber,
        });
      }
    }
  }

  entries.sort((a, b) => (b.eventDateIso || '').localeCompare(a.eventDateIso || ''));

  const totalCareLogLegs = careLogs.filter(
    (l) => l.animalId === animal.id && l.showLegEarned
  ).length;

  const effectiveLegs = Math.max(
    finiteNonNegInt(animal.legsCount, 10_000),
    totalShowEventLegs,
    totalCareLogLegs
  );

  const gcNumber = (animal.grandChampionNumber || '').trim();
  const isGrandChampion = Boolean(gcNumber) || awardCounts.GCH > 0;
  const isEligible = !isGrandChampion && effectiveLegs >= GC_LEG_TARGET;
  const progressPercent = isGrandChampion
    ? 100
    : Math.min(100, Math.round((effectiveLegs / GC_LEG_TARGET) * 100));

  let statusLabel: string;
  let shortLabel: string;
  if (gcNumber) {
    statusLabel = `Grand Champion #${gcNumber} (${effectiveLegs} leg${effectiveLegs === 1 ? '' : 's'})`;
    shortLabel = `GC #${gcNumber}`;
  } else if (awardCounts.GCH > 0) {
    statusLabel = `Grand Champion Win (${effectiveLegs} leg${effectiveLegs === 1 ? '' : 's'})`;
    shortLabel = `GCH (${effectiveLegs} leg${effectiveLegs === 1 ? '' : 's'})`;
  } else if (effectiveLegs >= GC_LEG_TARGET) {
    statusLabel = `GC Eligible (${effectiveLegs}/${GC_LEG_TARGET} legs${legJudges.size > 0 ? ` · ${legJudges.size} judge${legJudges.size === 1 ? '' : 's'}` : ''})`;
    shortLabel = `GC Eligible (${effectiveLegs}/3)`;
  } else {
    statusLabel = `${effectiveLegs}/${GC_LEG_TARGET} legs to GC${legJudges.size > 0 ? ` (${legJudges.size} judge${legJudges.size === 1 ? '' : 's'})` : ''}`;
    shortLabel = `${effectiveLegs}/${GC_LEG_TARGET} legs`;
  }

  const awardsSummaryText = formatAwardCountsText(awardCounts);
  const roundedPoints = Math.round(totalPoints * 100) / 100;

  const honorParts: string[] = [];
  if (gcNumber) {
    honorParts.push(`GC #${gcNumber}`);
  } else if (isEligible) {
    honorParts.push(`GC Eligible (${effectiveLegs}/3 Legs)`);
  } else if (effectiveLegs > 0) {
    honorParts.push(`${effectiveLegs}/3 Legs to GC`);
  }
  if (awardsSummaryText) {
    honorParts.push(awardsSummaryText);
  }
  if (roundedPoints > 0) {
    honorParts.push(`${roundedPoints} pts`);
  }
  if (eLegAttachments.length > 0) {
    honorParts.push(`${eLegAttachments.length} E-Leg${eLegAttachments.length === 1 ? '' : 's'}`);
  }

  return {
    showsEntered: entries.length,
    placementsRecorded,
    totalShowEventLegs,
    totalCareLogLegs,
    effectiveLegs,
    totalPoints: roundedPoints,
    awardCounts,
    awardsSummaryText,
    distinctJudgesWithLegs: legJudges.size,
    eLegAttachments,
    entries,
    gcProgress: {
      isGrandChampion,
      grandChampionNumber: gcNumber,
      legsEarned: effectiveLegs,
      legsTarget: GC_LEG_TARGET,
      distinctJudgesCount: legJudges.size,
      isEligible,
      progressPercent,
      statusLabel,
      shortLabel,
    },
    pedigreeHonorLine: honorParts.join(' · '),
  };
}
```

## `src/core/speciesMemo.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Per-Species Memo Pad Hygiene & Formatting Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Security & Hygiene Guarantees:
 * - Preserves all valid Unicode characters including keyboard/OS emoji, ZWJ sequences,
 *   variation selectors, skin-tone modifiers, and regional flags.
 * - Rejects non-string/erroneous payloads cleanly, strips NUL/C0/C1 control characters
 *   and bidirectional spoofing overrides, repairs lone UTF-16 surrogates, and bounds length
 *   safely without splitting emoji surrogate pairs.
 * - Parses only a minimal plain-text formatting AST (headings, bullets, checklists, **bold**,
 *   *italic*) with ZERO HTML parsing, ZERO link evaluation, and ZERO code execution.
 */

export const MAX_SPECIES_MEMO_CHARS = 50_000;

export interface MemoEmojiItem {
  emoji: string;
  label: string;
}

export const MEMO_EMOJI_PALETTE: MemoEmojiItem[] = [
  { emoji: '🐇', label: 'Rabbit' },
  { emoji: '🐐', label: 'Goat' },
  { emoji: '🐑', label: 'Sheep' },
  { emoji: '🐖', label: 'Pig' },
  { emoji: '🐄', label: 'Cattle' },
  { emoji: '🐾', label: 'Livestock' },
  { emoji: '🌾', label: 'Feed / Hay' },
  { emoji: '🏡', label: 'Barn' },
  { emoji: '🩺', label: 'Health Check' },
  { emoji: '💉', label: 'Care / Meds' },
  { emoji: '⚖️', label: 'Weight' },
  { emoji: '📋', label: 'Notes' },
  { emoji: '✅', label: 'Done' },
  { emoji: '⚠️', label: 'Attention' },
  { emoji: '❤️', label: 'Favorite' },
  { emoji: '⭐', label: 'Star' },
];

/**
 * Strips unpaired UTF-16 surrogates while preserving every valid supplementary-plane emoji pair.
 */
function stripLoneSurrogates(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
      // Drop unpaired high surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Drop unpaired low surrogate
    } else {
      out += input[i];
    }
  }
  return out;
}

/**
 * Truncates `text` to `maxChars` without slicing inside a UTF-16 surrogate pair.
 */
function truncateSafelyAtSurrogateBoundary(text: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (text.length <= maxChars) return text;
  let cut = maxChars;
  const lastCode = text.charCodeAt(cut - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    cut -= 1;
  }
  return text.slice(0, cut);
}

/**
 * Sanitizes memo text from live keyboard/paste input or imported/corrupted storage values.
 *
 * - Coerces erroneous non-string values (`null`, numbers, objects, arrays) to `""`.
 * - Normalizes CRLF/CR newlines to `\n`.
 * - Strips NUL bytes, non-printable C0/C1 control characters (keeping `\n` and `\t`),
 *   and bidirectional text override spoofing characters.
 * - Drops broken lone UTF-16 surrogates while keeping all valid emoji, ZWJ (`\u200D`),
 *   variation selectors (`\uFE0F`), and Unicode text intact.
 */
export function sanitizeSpeciesMemo(
  raw: unknown,
  maxChars: number = MAX_SPECIES_MEMO_CHARS
): string {
  if (typeof raw !== 'string') return '';

  const normalizedNewlines = raw.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  const withoutControls = normalizedNewlines.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '');
  const validUnicode = stripLoneSurrogates(withoutControls);
  return truncateSafelyAtSurrogateBoundary(validUnicode, maxChars);
}

export type MemoFormatAction =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'heading' }
  | { type: 'bullet' }
  | { type: 'checklist' }
  | { type: 'date'; dateLabel: string }
  | { type: 'emoji'; emoji: string };

export interface MemoFormatResult {
  nextText: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
}

function clampSelectionIndex(text: string, idx: number): number {
  const safe = Number.isFinite(idx) ? Math.max(0, Math.min(text.length, Math.round(idx))) : 0;
  // Never place cursor in the middle of a surrogate pair
  if (safe > 0 && safe < text.length) {
    const prev = text.charCodeAt(safe - 1);
    const curr = text.charCodeAt(safe);
    if (prev >= 0xd800 && prev <= 0xdbff && curr >= 0xdc00 && curr <= 0xdfff) {
      return safe + 1;
    }
  }
  return safe;
}

function applyLinePrefixToggle(
  text: string,
  selStart: number,
  selEnd: number,
  prefix: string
): MemoFormatResult {
  const lineStart = text.lastIndexOf('\n', Math.max(0, selStart - 1)) + 1;
  const lineEndIdx = text.indexOf('\n', selEnd);
  const blockEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
  const block = text.slice(lineStart, blockEnd);
  const lines = block.split('\n');

  const allHavePrefix = lines.every((l) => l.startsWith(prefix));
  const transformed = lines.map((line) => {
    if (allHavePrefix) {
      return line.slice(prefix.length);
    }
    // Replace competing line prefixes cleanly
    const stripped = line.replace(/^(?:##\s+|- \[[ xX]\]\s+|- )/, '');
    return `${prefix}${stripped}`;
  });

  const nextBlock = transformed.join('\n');
  const nextText = sanitizeSpeciesMemo(
    text.slice(0, lineStart) + nextBlock + text.slice(blockEnd)
  );
  const cursorPos = Math.min(nextText.length, lineStart + nextBlock.length);
  return {
    nextText,
    nextSelectionStart: cursorPos,
    nextSelectionEnd: cursorPos,
  };
}

/**
 * Applies a basic safe formatting action or emoji insertion to the memo scratchpad.
 */
export function applyMemoFormatAction(
  rawText: string,
  rawSelStart: number,
  rawSelEnd: number,
  action: MemoFormatAction
): MemoFormatResult {
  const text = sanitizeSpeciesMemo(rawText);
  const start = clampSelectionIndex(text, Math.min(rawSelStart, rawSelEnd));
  const end = clampSelectionIndex(text, Math.max(rawSelStart, rawSelEnd));
  const selected = text.slice(start, end);

  if (action.type === 'bold' || action.type === 'italic') {
    const marker = action.type === 'bold' ? '**' : '*';
    const placeholder = action.type === 'bold' ? 'bold text' : 'italic text';
    const inner = selected || placeholder;
    const inserted = `${marker}${inner}${marker}`;
    const candidate = text.slice(0, start) + inserted + text.slice(end);
    const nextText = sanitizeSpeciesMemo(candidate);
    if (selected) {
      const nextPos = Math.min(nextText.length, start + inserted.length);
      return {
        nextText,
        nextSelectionStart: nextPos,
        nextSelectionEnd: nextPos,
      };
    }
    const innerStart = Math.min(nextText.length, start + marker.length);
    const innerEnd = Math.min(nextText.length, innerStart + placeholder.length);
    return {
      nextText,
      nextSelectionStart: innerStart,
      nextSelectionEnd: innerEnd,
    };
  }

  if (action.type === 'heading') {
    return applyLinePrefixToggle(text, start, end, '## ');
  }
  if (action.type === 'bullet') {
    return applyLinePrefixToggle(text, start, end, '- ');
  }
  if (action.type === 'checklist') {
    return applyLinePrefixToggle(text, start, end, '- [ ] ');
  }

  const snippet =
    action.type === 'emoji'
      ? sanitizeSpeciesMemo(action.emoji)
      : sanitizeSpeciesMemo(`[${action.dateLabel}] `);
  const candidate = text.slice(0, start) + snippet + text.slice(end);
  const nextText = sanitizeSpeciesMemo(candidate);
  const nextPos = Math.min(nextText.length, start + snippet.length);
  return {
    nextText,
    nextSelectionStart: nextPos,
    nextSelectionEnd: nextPos,
  };
}

/**
 * Toggles a checklist item on `lineIndex` between `- [ ] ` and `- [x] `.
 */
export function toggleMemoChecklistLine(rawText: string, lineIndex: number): string {
  const text = sanitizeSpeciesMemo(rawText);
  const lines = text.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return text;
  const line = lines[lineIndex];
  if (/^- \[ \]\s*/.test(line)) {
    lines[lineIndex] = line.replace(/^- \[ \]/, '- [x]');
  } else if (/^- \[[xX]\]\s*/.test(line)) {
    lines[lineIndex] = line.replace(/^- \[[xX]\]/, '- [ ]');
  }
  return sanitizeSpeciesMemo(lines.join('\n'));
}

export type MemoInlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string };

/**
 * Parses inline `**bold**` and `*italic*` runs purely into plain-text tokens (never HTML).
 */
export function parseMemoInlineTokens(line: string): MemoInlineToken[] {
  const tokens: MemoInlineToken[] = [];
  const pattern = /(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'text', text: line.slice(lastIdx, match.index) });
    }
    const rawToken = match[0];
    if (rawToken.startsWith('**') && rawToken.endsWith('**') && rawToken.length > 4) {
      tokens.push({ type: 'bold', text: rawToken.slice(2, -2) });
    } else if (rawToken.startsWith('*') && rawToken.endsWith('*') && rawToken.length > 2) {
      tokens.push({ type: 'italic', text: rawToken.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', text: rawToken });
    }
    lastIdx = pattern.lastIndex;
  }

  if (lastIdx < line.length) {
    tokens.push({ type: 'text', text: line.slice(lastIdx) });
  }
  return tokens.length > 0 ? tokens : [{ type: 'text', text: '' }];
}

export type MemoLineBlock =
  | { type: 'blank'; lineIndex: number }
  | { type: 'heading'; lineIndex: number; tokens: MemoInlineToken[] }
  | { type: 'checklist'; lineIndex: number; checked: boolean; tokens: MemoInlineToken[] }
  | { type: 'bullet'; lineIndex: number; tokens: MemoInlineToken[] }
  | { type: 'paragraph'; lineIndex: number; tokens: MemoInlineToken[] };

/**
 * Parses sanitized memo text into safe structural blocks for non-HTML React rendering.
 */
export function parseMemoBlocks(rawText: string): MemoLineBlock[] {
  const clean = sanitizeSpeciesMemo(rawText);
  if (!clean) return [];
  const lines = clean.split('\n');
  return lines.map((line, lineIndex): MemoLineBlock => {
    if (!line.trim()) {
      return { type: 'blank', lineIndex };
    }
    if (line.startsWith('## ')) {
      return {
        type: 'heading',
        lineIndex,
        tokens: parseMemoInlineTokens(line.slice(3)),
      };
    }
    const checkMatch = /^- \[([ xX])\]\s?(.*)$/.exec(line);
    if (checkMatch) {
      return {
        type: 'checklist',
        lineIndex,
        checked: checkMatch[1].toLowerCase() === 'x',
        tokens: parseMemoInlineTokens(checkMatch[2]),
      };
    }
    if (line.startsWith('- ')) {
      return {
        type: 'bullet',
        lineIndex,
        tokens: parseMemoInlineTokens(line.slice(2)),
      };
    }
    return {
      type: 'paragraph',
      lineIndex,
      tokens: parseMemoInlineTokens(line),
    };
  });
}
```

## `src/core/speciesMigration.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Cross-Species Animal & Herd Migration Engine (`src/core/speciesMigration.ts`).
 *
 * Supports:
 * 1. Single-animal migration (`Move Species`)
 * 2. Multi-select pedigree-family migration (selected animals + their parents/ancestors +
 *    offspring/descendants + additional co-parents & pedigree ancestors linked to those offspring)
 * 3. Full-species bulk migration (`Migrate All` across ALL statuses and ALL species-scoped
 *    photos, care logs, chores, breedings, cages/pens, and show events)
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Zero browser DOM (`window`, `document`) dependencies; portable directly into Expo / React Native.
 */

import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  generateUuid,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  ShowEvent,
  SpeciesProfile,
} from './models';
import { countAllSpeciesRecords } from './sampleData';
import { bumpRecordRevision } from './syncOutbox';

export interface SpeciesMigrationResult {
  snapshot: BarnDatabaseSnapshot;
  sourceSpecies: string;
  targetSpecies: string;
  animalsMigrated: number;
  photosMigrated: number;
  careLogsMigrated: number;
  tasksMigrated: number;
  breedingsMigrated: number;
  cagesMigratedOrAdded: number;
  showsUpdated: number;
  createdTargetProfile: boolean;
  /** Migrated animals that still reference a sire/dam staying in another species (will reconnect if those parents are migrated too). */
  splitParentLinksCount: number;
  /** Breedings left in the source species because one parent was migrated and the other parent was not. */
  splitBreedingsCount: number;
  /** Total records of any type remaining in `sourceSpecies` after this migration. */
  remainingSourceRecordsCount: number;
  /** Animals remaining in `sourceSpecies` after this migration. */
  remainingSourceAnimalsCount: number;
}

export interface SpeciesMigrationOptions {
  /** When true, moves 100% of animals (all statuses) AND all chores, cages, breedings, shows, photos, and logs in `sourceSpeciesName`. */
  migrateEntireSpecies?: boolean;
  /** Explicit source species name (required when `migrateEntireSpecies` is true and animal count may be 0). */
  sourceSpeciesName?: string;
}

export interface PedigreeFamilyExpansion {
  directIds: string[];
  ancestorIds: string[];
  descendantIds: string[];
  linkedCoParentAndRelativeIds: string[];
  allExpandedIds: string[];
  expandedAnimals: Animal[];
}

/**
 * Expands a user-selected set of animals inside `sourceSpecies` to include:
 * - Their parents & ancestors (`sireId`, `damId` recursively)
 * - Their offspring & descendants (children where `sireId` or `damId` matches, recursively)
 * - Any additional co-parents (and their pedigree ancestors) linked to those offspring
 *
 * Only expands through animals currently in `sourceSpecies` so unrelated species are never touched.
 */
export function expandPedigreeFamilyInSpecies(
  allAnimals: Animal[],
  selectedIds: string[],
  sourceSpecies: string
): PedigreeFamilyExpansion {
  const speciesAnimals = allAnimals.filter((a) => isSameSpecies(a.species, sourceSpecies));
  const byId = new Map(speciesAnimals.map((a) => [a.id, a]));
  const childrenByParentId = new Map<string, Animal[]>();

  for (const a of speciesAnimals) {
    if (a.sireId && byId.has(a.sireId)) {
      const list = childrenByParentId.get(a.sireId) || [];
      list.push(a);
      childrenByParentId.set(a.sireId, list);
    }
    if (a.damId && byId.has(a.damId) && a.damId !== a.sireId) {
      const list = childrenByParentId.get(a.damId) || [];
      list.push(a);
      childrenByParentId.set(a.damId, list);
    }
  }

  const directIds: string[] = [];
  const directSet = new Set<string>();
  for (const id of selectedIds) {
    if (byId.has(id) && !directSet.has(id)) {
      directSet.add(id);
      directIds.push(id);
    }
  }

  // 1. Descendants (offspring, grand-offspring, ...) downward from direct selection
  const descendantSet = new Set<string>();
  const downQueue = [...directIds];
  const visitedDown = new Set<string>(directIds);
  while (downQueue.length > 0) {
    const currId = downQueue.shift()!;
    const children = childrenByParentId.get(currId) || [];
    for (const child of children) {
      if (!visitedDown.has(child.id)) {
        visitedDown.add(child.id);
        if (!directSet.has(child.id)) {
          descendantSet.add(child.id);
        }
        downQueue.push(child.id);
      }
    }
  }

  // 2. Direct ancestors upward from direct selection
  const directAncestorSet = new Set<string>();
  const upDirectQueue = [...directIds];
  const visitedUpDirect = new Set<string>(directIds);
  while (upDirectQueue.length > 0) {
    const curr = byId.get(upDirectQueue.shift()!);
    if (!curr) continue;
    for (const parentId of [curr.sireId, curr.damId]) {
      if (parentId && byId.has(parentId) && !visitedUpDirect.has(parentId)) {
        visitedUpDirect.add(parentId);
        if (!directSet.has(parentId) && !descendantSet.has(parentId)) {
          directAncestorSet.add(parentId);
        }
        upDirectQueue.push(parentId);
      }
    }
  }

  // 3. Additional co-parents & ancestors linked via offspring (or parent pedigrees)
  const linkedCoParentSet = new Set<string>();
  const upFromAllQueue = [...directIds, ...descendantSet, ...directAncestorSet];
  const visitedAllUp = new Set<string>(upFromAllQueue);
  while (upFromAllQueue.length > 0) {
    const curr = byId.get(upFromAllQueue.shift()!);
    if (!curr) continue;
    for (const parentId of [curr.sireId, curr.damId]) {
      if (parentId && byId.has(parentId) && !visitedAllUp.has(parentId)) {
        visitedAllUp.add(parentId);
        if (
          !directSet.has(parentId) &&
          !descendantSet.has(parentId) &&
          !directAncestorSet.has(parentId)
        ) {
          linkedCoParentSet.add(parentId);
        }
        upFromAllQueue.push(parentId);
      }
    }
  }

  const allSet = new Set<string>([
    ...directIds,
    ...directAncestorSet,
    ...descendantSet,
    ...linkedCoParentSet,
  ]);

  const expandedAnimals = speciesAnimals.filter((a) => allSet.has(a.id));

  return {
    directIds,
    ancestorIds: Array.from(directAncestorSet),
    descendantIds: Array.from(descendantSet),
    linkedCoParentAndRelativeIds: Array.from(linkedCoParentSet),
    allExpandedIds: expandedAnimals.map((a) => a.id),
    expandedAnimals,
  };
}

/**
 * Resolves a user-supplied target species name against configured species profiles first,
 * then predefined presets (including common aliases like "Pig" -> "Swine / Pig"), or creates
 * a clean custom `SpeciesProfile` if brand-new.
 */
export function resolveOrCreateTargetSpeciesProfile(
  targetSpeciesInput: string,
  existingProfiles: SpeciesProfile[],
  ts: string
): { profile: SpeciesProfile; created: boolean } {
  const trimmed = targetSpeciesInput.trim();
  const aliasMap: Record<string, string> = {
    pig: 'Swine / Pig',
    pigs: 'Swine / Pig',
    swine: 'Swine / Pig',
    hog: 'Swine / Pig',
    hogs: 'Swine / Pig',
    rabbits: 'Rabbit',
    goats: 'Goat',
    cow: 'Cattle',
    cows: 'Cattle',
    cavy: 'Guinea Pig',
    cavies: 'Guinea Pig',
    chinchillas: 'Chinchilla',
    ferrets: 'Ferret',
    alpacas: 'Alpaca',
    dog: 'Dog',
    dogs: 'Dog',
    canine: 'Dog',
    cat: 'Cat',
    cats: 'Cat',
    feline: 'Cat',
  };

  const existingDirect = existingProfiles.find((p) => isSameSpecies(p.name, trimmed));
  if (existingDirect) {
    return { profile: existingDirect, created: false };
  }

  const aliasedName = aliasMap[trimmed.toLowerCase()];
  if (aliasedName) {
    const existingAliased = existingProfiles.find((p) => isSameSpecies(p.name, aliasedName));
    if (existingAliased) {
      return { profile: existingAliased, created: false };
    }
  }

  const lookupName = aliasedName || trimmed;
  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, lookupName));
  if (preset) {
    return {
      profile: {
        ...preset,
        id: generateUuid(),
        sortOrder: existingProfiles.length,
        _rev: 1,
        createdAt: ts,
        updatedAt: ts,
      },
      created: true,
    };
  }

  const resolved = resolveSpeciesProfile(trimmed, existingProfiles);
  return {
    profile: {
      ...resolved,
      id: generateUuid(),
      sortOrder: existingProfiles.length,
      _rev: 1,
      createdAt: ts,
      updatedAt: ts,
    },
    created: true,
  };
}

/**
 * Migrates the specified `animalIds` (or 100% of a species when `options.migrateEntireSpecies` is true)
 * into `targetSpeciesInput` along with strictly isolated dependent records.
 *
 * Pedigree UUID links (`sireId`, `damId`) are always preserved so partial/batch migrations
 * automatically reconnect pedigree trees once parents/offspring are also migrated.
 */
export function migrateAnimalsToSpecies(
  snapshot: BarnDatabaseSnapshot,
  animalIds: string[],
  targetSpeciesInput: string,
  options?: SpeciesMigrationOptions
): SpeciesMigrationResult {
  const cleanTargetInput = targetSpeciesInput.trim();
  if (!cleanTargetInput) {
    throw new Error('Please choose or enter a target livestock species.');
  }

  const ts = nowIsoUtc();
  const { profile: targetProfile, created: createdTargetProfile } =
    resolveOrCreateTargetSpeciesProfile(cleanTargetInput, snapshot.speciesProfiles, ts);
  const targetName = targetProfile.name;

  const migrateEntireSpecies = Boolean(options?.migrateEntireSpecies);
  const explicitSource = (options?.sourceSpeciesName || '').trim();

  const idSet = new Set(animalIds);
  if (migrateEntireSpecies && explicitSource) {
    for (const a of snapshot.animals) {
      if (isSameSpecies(a.species, explicitSource)) {
        idSet.add(a.id);
      }
    }
  }

  const animalsToMove = snapshot.animals.filter((a) => idSet.has(a.id));
  const actuallyMovingIds = new Set(
    animalsToMove.filter((a) => !isSameSpecies(a.species, targetName)).map((a) => a.id)
  );

  const sourceSpeciesSet = new Set(
    animalsToMove.filter((a) => actuallyMovingIds.has(a.id)).map((a) => a.species)
  );
  if (explicitSource && !isSameSpecies(explicitSource, targetName)) {
    sourceSpeciesSet.add(explicitSource);
  }
  const sourceSpecies = Array.from(sourceSpeciesSet).join(', ');
  const isFullSpeciesFromSource = (recordSpecies: string): boolean =>
    Boolean(
      migrateEntireSpecies &&
        sourceSpeciesSet.size > 0 &&
        Array.from(sourceSpeciesSet).some((src) => isSameSpecies(recordSpecies, src))
    );

  const hasSpeciesRecordsToMove =
    migrateEntireSpecies &&
    explicitSource &&
    !isSameSpecies(explicitSource, targetName) &&
    countAllSpeciesRecords(snapshot, explicitSource) > 0;

  if (actuallyMovingIds.size === 0 && !hasSpeciesRecordsToMove) {
    throw new Error(
      animalsToMove.length > 0
        ? `Selected animal(s) are already in ${targetName}.`
        : 'No animals or records were selected to migrate.'
    );
  }

  // 1. Update species on selected animals (ALL statuses; preserving sireId & damId UUIDs)
  const nextAnimals: Animal[] = snapshot.animals.map((a) =>
    actuallyMovingIds.has(a.id)
      ? {
          ...a,
          species: targetName,
          _rev: bumpRecordRevision(a),
          updatedAt: ts,
        }
      : a
  );

  const nextAnimalById = new Map(nextAnimals.map((a) => [a.id, a]));

  // Count migrated animals whose parent(s) still live in a different species
  let splitParentLinksCount = 0;
  for (const id of actuallyMovingIds) {
    const moved = nextAnimalById.get(id);
    if (!moved) continue;
    const sire = moved.sireId ? nextAnimalById.get(moved.sireId) : undefined;
    const dam = moved.damId ? nextAnimalById.get(moved.damId) : undefined;
    if (
      (sire && !isSameSpecies(sire.species, targetName)) ||
      (dam && !isSameSpecies(dam.species, targetName))
    ) {
      splitParentLinksCount++;
    }
  }

  // 2. Migrate AnimalPhotos belonging to moved animals (or all in source species during bulk migrate)
  let photosMigrated = 0;
  const nextPhotos: AnimalPhoto[] = (snapshot.animalPhotos ?? []).map((p) => {
    if (
      (actuallyMovingIds.has(p.animalId) || isFullSpeciesFromSource(p.species)) &&
      !isSameSpecies(p.species, targetName)
    ) {
      photosMigrated++;
      return { ...p, species: targetName, _rev: bumpRecordRevision(p), updatedAt: ts };
    }
    return p;
  });

  // 3. Migrate CareLogs belonging to moved animals (or all in source species during bulk migrate)
  let careLogsMigrated = 0;
  const nextCareLogs: CareLog[] = snapshot.careLogs.map((l) => {
    if (
      (actuallyMovingIds.has(l.animalId) || isFullSpeciesFromSource(l.species)) &&
      !isSameSpecies(l.species, targetName)
    ) {
      careLogsMigrated++;
      return { ...l, species: targetName, _rev: bumpRecordRevision(l), updatedAt: ts };
    }
    return l;
  });

  // 4. Migrate BreedingRecords where both present parents end up in targetName (or all in full-species mode)
  let breedingsMigrated = 0;
  let splitBreedingsCount = 0;
  const migratedBreedingIds = new Set<string>();

  const nextBreedings: BreedingRecord[] = snapshot.breedings.map((b) => {
    const sireMoved = Boolean(b.sireId && actuallyMovingIds.has(b.sireId));
    const damMoved = Boolean(b.damId && actuallyMovingIds.has(b.damId));
    const fullSpeciesBreeding = isFullSpeciesFromSource(b.species);
    if (!sireMoved && !damMoved && !fullSpeciesBreeding) return b;

    const sire = b.sireId ? nextAnimalById.get(b.sireId) : undefined;
    const dam = b.damId ? nextAnimalById.get(b.damId) : undefined;
    const sireInTarget = !sire || isSameSpecies(sire.species, targetName);
    const damInTarget = !dam || isSameSpecies(dam.species, targetName);

    if (
      ((sireInTarget && damInTarget) || fullSpeciesBreeding) &&
      !isSameSpecies(b.species, targetName)
    ) {
      breedingsMigrated++;
      migratedBreedingIds.add(b.id);
      return { ...b, species: targetName, _rev: bumpRecordRevision(b), updatedAt: ts };
    }
    splitBreedingsCount++;
    return b;
  });

  // 5. Migrate BarnTasks linked to moved animals/breedings (plus unlinked species tasks in full-species mode)
  let tasksMigrated = 0;
  const nextTasks: BarnTask[] = snapshot.tasks.map((t) => {
    const linkedToMovedAnimal = Boolean(t.linkedAnimalId && actuallyMovingIds.has(t.linkedAnimalId));
    const linkedToMovedBreeding = Boolean(
      t.linkedBreedingId && migratedBreedingIds.has(t.linkedBreedingId)
    );
    const fullSpeciesTask = isFullSpeciesFromSource(t.species);
    if (
      (linkedToMovedAnimal || linkedToMovedBreeding || fullSpeciesTask) &&
      !isSameSpecies(t.species, targetName)
    ) {
      tasksMigrated++;
      return { ...t, species: targetName, _rev: bumpRecordRevision(t), updatedAt: ts };
    }
    return t;
  });

  // 6. Migrate / deduplicate CageLocations
  let cagesMigratedOrAdded = 0;
  const usedCageKeysInTarget = new Set(
    snapshot.cages
      .filter((c) => isSameSpecies(c.species, targetName))
      .map((c) => c.label.trim().toLowerCase())
  );

  const movedCageLabelsBySource = new Map<string, { sourceSpecies: string; label: string }>();
  for (const id of actuallyMovingIds) {
    const moved = nextAnimalById.get(id);
    const rawLabel = moved?.cageLocation.trim();
    if (!moved || !rawLabel) continue;
    const origSource = animalsToMove.find((a) => a.id === id)?.species || '';
    movedCageLabelsBySource.set(`${origSource.toLowerCase()}::${rawLabel.toLowerCase()}`, {
      sourceSpecies: origSource,
      label: rawLabel,
    });
  }

  const cagesToAppend: CageLocation[] = [];
  const nextCages: CageLocation[] = [];

  for (const c of snapshot.cages) {
    const labelKey = c.label.trim().toLowerCase();
    const pairKey = `${c.species.toLowerCase()}::${labelKey}`;
    const fullSpeciesCage = isFullSpeciesFromSource(c.species) && !isSameSpecies(c.species, targetName);

    if (fullSpeciesCage) {
      if (!usedCageKeysInTarget.has(labelKey)) {
        usedCageKeysInTarget.add(labelKey);
        cagesMigratedOrAdded++;
        nextCages.push({ ...c, species: targetName, _rev: bumpRecordRevision(c), updatedAt: ts });
      }
      // If target already had a cage with identical label, omit the duplicate source cage cleanly
      continue;
    }

    if (!movedCageLabelsBySource.has(pairKey)) {
      nextCages.push(c);
      continue;
    }

    const stillUsedInSource = nextAnimals.some(
      (a) =>
        isSameSpecies(a.species, c.species) && a.cageLocation.trim().toLowerCase() === labelKey
    );

    if (!stillUsedInSource && !usedCageKeysInTarget.has(labelKey)) {
      usedCageKeysInTarget.add(labelKey);
      cagesMigratedOrAdded++;
      nextCages.push({ ...c, species: targetName, _rev: bumpRecordRevision(c), updatedAt: ts });
      continue;
    }

    if (!usedCageKeysInTarget.has(labelKey)) {
      usedCageKeysInTarget.add(labelKey);
      cagesMigratedOrAdded++;
      cagesToAppend.push({
        ...c,
        id: generateUuid(),
        species: targetName,
        _rev: 1,
        createdAt: ts,
        updatedAt: ts,
      });
    }
    nextCages.push(c);
  }

  // 7. Update ShowEvents cleanly
  let showsUpdated = 0;
  const showsToAppend: ShowEvent[] = [];
  const nextShows: ShowEvent[] = snapshot.shows.map((s) => {
    if (isSameSpecies(s.species, targetName)) return s;

    const fullSpeciesShow = isFullSpeciesFromSource(s.species);
    const movedEntered = s.enteredAnimalIds.filter((id) => actuallyMovingIds.has(id));
    const movedResults = (s.results ?? []).filter((r) => actuallyMovingIds.has(r.animalId));
    if (movedEntered.length === 0 && movedResults.length === 0 && !fullSpeciesShow) return s;

    const remainingEntered = s.enteredAnimalIds.filter((id) => !actuallyMovingIds.has(id));
    const remainingResults = (s.results ?? []).filter((r) => !actuallyMovingIds.has(r.animalId));
    const sourceHasRemainingAnimals = nextAnimals.some((a) => isSameSpecies(a.species, s.species));
    showsUpdated++;

    if (
      fullSpeciesShow ||
      (remainingEntered.length === 0 && remainingResults.length === 0 && !sourceHasRemainingAnimals)
    ) {
      return { ...s, species: targetName, _rev: bumpRecordRevision(s), updatedAt: ts };
    }

    showsToAppend.push({
      ...s,
      id: generateUuid(),
      species: targetName,
      enteredAnimalIds: movedEntered,
      results: movedResults.length > 0 ? movedResults : undefined,
      _rev: 1,
      createdAt: ts,
      updatedAt: ts,
    });
    return {
      ...s,
      enteredAnimalIds: remainingEntered,
      results: remainingResults.length > 0 ? remainingResults : undefined,
      _rev: bumpRecordRevision(s),
      updatedAt: ts,
    };
  });

  const nextSpeciesProfiles = createdTargetProfile
    ? [...snapshot.speciesProfiles, targetProfile]
    : snapshot.speciesProfiles;

  const nextLedgerEntries = (snapshot.ledgerEntries ?? []).map((le) => {
    const linkedAnimalMoved = Boolean(le.linkedAnimalId && actuallyMovingIds.has(le.linkedAnimalId));
    const linkedBreedingMoved = Boolean(le.linkedBreedingId && migratedBreedingIds.has(le.linkedBreedingId));
    const fullSpecies = isFullSpeciesFromSource(le.species);
    if ((linkedAnimalMoved || linkedBreedingMoved || fullSpecies) && !isSameSpecies(le.species, targetName)) {
      return { ...le, species: targetName, _rev: bumpRecordRevision(le), updatedAt: ts };
    }
    return le;
  });

  const nextProcessingLogs = (snapshot.processingLogs ?? []).map((pl) => {
    const linkedAnimalMoved = Boolean(pl.linkedAnimalId && actuallyMovingIds.has(pl.linkedAnimalId));
    const linkedBreedingMoved = Boolean(pl.linkedBreedingId && migratedBreedingIds.has(pl.linkedBreedingId));
    const fullSpecies = isFullSpeciesFromSource(pl.species);
    if ((linkedAnimalMoved || linkedBreedingMoved || fullSpecies) && !isSameSpecies(pl.species, targetName)) {
      return { ...pl, species: targetName, _rev: bumpRecordRevision(pl), updatedAt: ts };
    }
    return pl;
  });

  const nextYouthBooks = (snapshot.youthProjectBooks ?? []).map((yp) => {
    const fullSpecies = isFullSpeciesFromSource(yp.species);
    if (fullSpecies && !isSameSpecies(yp.species, targetName)) {
      return { ...yp, species: targetName, _rev: bumpRecordRevision(yp), updatedAt: ts };
    }
    return yp;
  });

  const nextClientContacts = (snapshot.clientContacts ?? []).map((cc) => {
    const fullSpecies = isFullSpeciesFromSource(cc.species);
    if (fullSpecies && !isSameSpecies(cc.species, targetName)) {
      return { ...cc, species: targetName, _rev: bumpRecordRevision(cc), updatedAt: ts };
    }
    return cc;
  });

  const nextWaitlistEntries = (snapshot.waitlistEntries ?? []).map((wl) => {
    const linkedBreedingMoved = Boolean(
      wl.preferredBreedingId && migratedBreedingIds.has(wl.preferredBreedingId)
    );
    const fullSpecies = isFullSpeciesFromSource(wl.species);
    if ((linkedBreedingMoved || fullSpecies) && !isSameSpecies(wl.species, targetName)) {
      return { ...wl, species: targetName, _rev: bumpRecordRevision(wl), updatedAt: ts };
    }
    return wl;
  });

  const nextAnimalReservations = (snapshot.animalReservations ?? []).map((ar) => {
    const linkedAnimalMoved = Boolean(ar.animalId && actuallyMovingIds.has(ar.animalId));
    const linkedBreedingMoved = Boolean(ar.breedingId && migratedBreedingIds.has(ar.breedingId));
    const fullSpecies = isFullSpeciesFromSource(ar.species);
    if ((linkedAnimalMoved || linkedBreedingMoved || fullSpecies) && !isSameSpecies(ar.species, targetName)) {
      return { ...ar, species: targetName, _rev: bumpRecordRevision(ar), updatedAt: ts };
    }
    return ar;
  });

  const nextWoolHarvests = (snapshot.woolHarvests ?? []).map((wh) => {
    const linkedAnimalMoved = Boolean(wh.animalId && actuallyMovingIds.has(wh.animalId));
    const fullSpecies = isFullSpeciesFromSource(wh.species);
    if ((linkedAnimalMoved || fullSpecies) && !isSameSpecies(wh.species, targetName)) {
      return { ...wh, species: targetName, _rev: bumpRecordRevision(wh), updatedAt: ts };
    }
    return wh;
  });

  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    speciesProfiles: nextSpeciesProfiles,
    animals: nextAnimals,
    animalPhotos: nextPhotos,
    cages: [...nextCages, ...cagesToAppend],
    breedings: nextBreedings,
    tasks: nextTasks,
    careLogs: nextCareLogs,
    shows: [...nextShows, ...showsToAppend],
    ledgerEntries: nextLedgerEntries,
    processingLogs: nextProcessingLogs,
    youthProjectBooks: nextYouthBooks,
    clientContacts: nextClientContacts,
    waitlistEntries: nextWaitlistEntries,
    animalReservations: nextAnimalReservations,
    woolHarvests: nextWoolHarvests,
  };

  let remainingSourceRecordsCount = 0;
  let remainingSourceAnimalsCount = 0;
  for (const src of sourceSpeciesSet) {
    remainingSourceRecordsCount += countAllSpeciesRecords(nextSnapshot, src);
    remainingSourceAnimalsCount += nextAnimals.filter((a) => isSameSpecies(a.species, src)).length;
  }

  return {
    snapshot: nextSnapshot,
    sourceSpecies,
    targetSpecies: targetName,
    animalsMigrated: actuallyMovingIds.size,
    photosMigrated,
    careLogsMigrated,
    tasksMigrated,
    breedingsMigrated,
    cagesMigratedOrAdded,
    showsUpdated,
    createdTargetProfile,
    splitParentLinksCount,
    splitBreedingsCount,
    remainingSourceRecordsCount,
    remainingSourceAnimalsCount,
  };
}
```

## `src/core/suggestionsBacklog.ts`

````typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Suggestion Backlog Parser, Idea Sanitizer & Export Formatter
 * (`src/core/suggestionsBacklog.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import { escapeSafeHtml, sanitizePlainText } from './inputSanitization';

export const SUGGESTIONS_BACKLOG_PATH = '/docs/plans/suggestions-backlog.md';
export const MIN_CAPTURED_IDEA_LENGTH = 3;
export const MAX_CAPTURED_IDEA_LENGTH = 1000;
export const MAX_CAPTURED_IDEAS_COUNT = 500;

export interface BacklogSubBullet {
  lead: string | null;
  text: string;
}

export interface BacklogItem {
  number: number;
  title: string;
  codeTag: string | null;
  details: BacklogSubBullet[];
}

export interface BacklogSection {
  id: string;
  title: string;
  subtitle: string | null;
  items: BacklogItem[];
}

export interface ParsedSuggestionsBacklog {
  title: string;
  overviewHeading: string | null;
  auditNote: string | null;
  sections: BacklogSection[];
  totalItems: number;
  isEmpty: boolean;
}

export interface CapturedIdeaEntry {
  id: string;
  text: string;
  createdAtIso: string;
}

export type SanitizeIdeaResult =
  | {
      ok: true;
      sanitizedText: string;
      truncated: boolean;
    }
  | {
      ok: false;
      error: string;
    };

function stripInlineMarkdownFormatting(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifySectionId(title: string, index: number): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `section-${index + 1}`;
}

/**
 * Parses `docs/plans/suggestions-backlog.md` into structured sections, items, and sub-bullets
 * without raw markdown tokens so UI components can render clean human-readable cards.
 */
export function parseSuggestionsBacklogMarkdown(rawMarkdown: string): ParsedSuggestionsBacklog {
  if (typeof rawMarkdown !== 'string' || !rawMarkdown.trim()) {
    return {
      title: 'Community Pedigree — Saved Suggestions Backlog',
      overviewHeading: null,
      auditNote: null,
      sections: [],
      totalItems: 0,
      isEmpty: true,
    };
  }

  const lines = rawMarkdown.split(/\r?\n/);
  let title = 'Community Pedigree — Saved Suggestions Backlog';
  let overviewHeading: string | null = null;
  const auditLines: string[] = [];
  const sections: BacklogSection[] = [];

  let currentSection: BacklogSection | null = null;
  let currentItem: BacklogItem | null = null;
  let hasSeenSections = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === '---') {
      continue;
    }

    // Top-level document title
    const h1Match = /^#\s+(.+)$/.exec(trimmed);
    if (h1Match && !hasSeenSections) {
      title = stripInlineMarkdownFormatting(h1Match[1]);
      continue;
    }

    // Overview H2 heading (e.g. "## Current App Suggestions & Remediation List (14 Remaining...)")
    const h2Match = /^##\s+(.+)$/.exec(trimmed);
    if (h2Match) {
      overviewHeading = stripInlineMarkdownFormatting(h2Match[1]);
      continue;
    }

    // Blockquote notes before sections
    if (trimmed.startsWith('>') && !hasSeenSections) {
      const quoteBody = stripInlineMarkdownFormatting(trimmed.replace(/^>\s*/, ''));
      if (quoteBody && !/^NOTE TO FUTURE SELF/i.test(quoteBody)) {
        auditLines.push(quoteBody);
      }
      continue;
    }

    // Priority / Category section heading (H3)
    const h3Match = /^###\s+(.+)$/.exec(trimmed);
    if (h3Match) {
      hasSeenSections = true;
      currentItem = null;
      const sectionTitle = stripInlineMarkdownFormatting(h3Match[1]);
      currentSection = {
        id: slugifySectionId(sectionTitle, sections.length),
        title: sectionTitle,
        subtitle: null,
        items: [],
      };
      sections.push(currentSection);
      continue;
    }

    // Italicized section subtitle directly below H3
    if (
      currentSection &&
      !currentItem &&
      currentSection.items.length === 0 &&
      trimmed.startsWith('*') &&
      trimmed.endsWith('*') &&
      !trimmed.startsWith('**')
    ) {
      currentSection.subtitle = stripInlineMarkdownFormatting(trimmed);
      continue;
    }

    // Numbered backlog item (e.g., "1. **Structured Show Placements... (`ShowEvent`)**")
    const numberedMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
    if (numberedMatch) {
      if (!currentSection) {
        hasSeenSections = true;
        currentSection = {
          id: `section-${sections.length + 1}`,
          title: 'General Suggestions',
          subtitle: null,
          items: [],
        };
        sections.push(currentSection);
      }

      const itemNumber = Number(numberedMatch[1]) || currentSection.items.length + 1;
      const rawTitle = numberedMatch[2].trim();
      const codeTagMatch = /\(`([^`]+)`\)\s*\*?\*?\s*$/.exec(rawTitle);
      const codeTag = codeTagMatch ? codeTagMatch[1].trim() : null;
      const cleanedTitle = stripInlineMarkdownFormatting(
        codeTagMatch ? rawTitle.slice(0, codeTagMatch.index) : rawTitle
      );

      currentItem = {
        number: itemNumber,
        title: cleanedTitle,
        codeTag,
        details: [],
      };
      currentSection.items.push(currentItem);
      continue;
    }

    // Sub-bullet detail under a numbered backlog item
    const bulletMatch = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bulletMatch && currentItem) {
      const bulletBody = bulletMatch[1].trim();
      const leadMatch = /^\*\*([^*:]+):\*\*\s*(.+)$/.exec(bulletBody);
      if (leadMatch) {
        currentItem.details.push({
          lead: stripInlineMarkdownFormatting(leadMatch[1]),
          text: stripInlineMarkdownFormatting(leadMatch[2]),
        });
      } else {
        currentItem.details.push({
          lead: null,
          text: stripInlineMarkdownFormatting(bulletBody),
        });
      }
      continue;
    }

    // Continuation line for an active detail or standalone line
    if (currentItem && currentItem.details.length > 0) {
      const last = currentItem.details[currentItem.details.length - 1];
      last.text = `${last.text} ${stripInlineMarkdownFormatting(trimmed)}`.trim();
    } else if (currentItem) {
      currentItem.details.push({
        lead: null,
        text: stripInlineMarkdownFormatting(trimmed),
      });
    }
  }

  const nonEmptySections = sections.filter((section) => section.items.length > 0);
  const totalItems = nonEmptySections.reduce((sum, sec) => sum + sec.items.length, 0);

  return {
    title,
    overviewHeading,
    auditNote: auditLines.length > 0 ? auditLines.join(' ') : null,
    sections: nonEmptySections,
    totalItems,
    isEmpty: totalItems === 0,
  };
}

/**
 * Returns a brief, human-readable explanation of the severity/scope represented
 * by a backlog priority section tab.
 */
export function getBacklogSectionSeverityDescription(
  section: Pick<BacklogSection, 'title' | 'subtitle'>
): string {
  const titleLower = section.title.toLowerCase();
  if (/priority\s*1\b|critical|high[- ]severity/i.test(titleLower)) {
    return 'Critical offline safety, data integrity, or crash fixes';
  }
  if (/priority\s*2\b|medium[- ]severity/i.test(titleLower)) {
    return 'Core workflow gaps, performance, and resilience upgrades';
  }
  if (/priority\s*3\b|low[- ]severity/i.test(titleLower)) {
    return 'Low-severity UX polish, pedigree, show & weight analytics';
  }
  if (/priority\s*4\b|specialized\s+operations/i.test(titleLower)) {
    return 'Larger domain tools, OCR, CRM, ledger & optional cloud';
  }
  if (section.subtitle && section.subtitle.trim().length > 0) {
    return section.subtitle.trim();
  }
  const colonIdx = section.title.indexOf(':');
  if (colonIdx !== -1) {
    const afterColon = section.title.slice(colonIdx + 1).trim();
    if (afterColon) return afterColon;
  }
  return 'Backlog items grouped under this priority tier';
}

/**
 * Pure sanitization utility for captured idea text before React state update or storage write.
 * - Strips `<script>` / `<style>` blocks and inline HTML tags
 * - Strips NUL, C0/C1 control characters, and Unicode bidi overrides
 * - Normalizes whitespace into a single clean line (preventing markdown heading/list injection)
 * - Escapes HTML entities (`&`, `<`, `>`, `"`, `'`)
 * - Enforces minimum & maximum character limits
 */
export function sanitizeIdeaInput(
  rawInput: unknown,
  maxLen: number = MAX_CAPTURED_IDEA_LENGTH
): SanitizeIdeaResult {
  if (typeof rawInput !== 'string') {
    return { ok: false, error: 'Idea text must be a non-empty string.' };
  }

  const effectiveMax =
    Number.isFinite(maxLen) && maxLen >= MIN_CAPTURED_IDEA_LENGTH
      ? Math.floor(maxLen)
      : MAX_CAPTURED_IDEA_LENGTH;

  // 1. Strip NUL bytes, unsafe control chars, bidi overrides, and unpaired surrogates
  let cleaned = sanitizePlainText(rawInput, effectiveMax * 4);

  // 2. Strip executable/style tag blocks and any residual HTML tags
  cleaned = cleaned
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ');

  // 3. Neutralize fenced code blocks / backtick clutter and collapse whitespace/newlines
  cleaned = cleaned
    .replace(/```+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 4. Strip leading markdown structural tokens (# headings, > blockquotes, list markers)
  cleaned = cleaned.replace(/^(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)+/, '').trim();

  if (cleaned.length < MIN_CAPTURED_IDEA_LENGTH) {
    return {
      ok: false,
      error: `Please enter at least ${MIN_CAPTURED_IDEA_LENGTH} characters for your idea.`,
    };
  }

  let truncated = false;
  if (cleaned.length > effectiveMax) {
    cleaned = cleaned.slice(0, effectiveMax).trimEnd();
    truncated = true;
  }

  // 5. Escape HTML entities before state update or storage write
  const escaped = escapeSafeHtml(cleaned);

  return {
    ok: true,
    sanitizedText: escaped,
    truncated,
  };
}

/**
 * Converts HTML-entity-escaped sanitized text back into plain display characters for
 * safe React JSX text-node interpolation (`{formatSanitizedIdeaForDisplay(idea.text)}`).
 * Never pass the return value into `dangerouslySetInnerHTML`.
 */
export function formatSanitizedIdeaForDisplay(sanitizedText: string): string {
  return String(sanitizedText ?? '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function isValidCapturedIdeaEntry(raw: unknown): raw is CapturedIdeaEntry {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.text === 'string' &&
    candidate.text.trim().length >= MIN_CAPTURED_IDEA_LENGTH &&
    typeof candidate.createdAtIso === 'string' &&
    candidate.createdAtIso.trim().length > 0
  );
}

/**
 * Formats captured ideas into a clean, intake-ready Markdown list using already-sanitized
 * text so copied or exported content cannot inject headings or raw HTML into the master backlog.
 */
export function buildCapturedIdeasMarkdownExport(
  ideas: readonly CapturedIdeaEntry[],
  exportedAtIso: string = new Date().toISOString()
): string {
  const lines: string[] = [
    '# Community Pedigree — Pending Captured Ideas',
    '',
    `Exported: ${exportedAtIso}`,
    `Total Ideas: ${ideas.length}`,
    '',
  ];

  if (ideas.length === 0) {
    lines.push('_No pending ideas captured._');
    return lines.join('\n');
  }

  ideas.forEach((idea, index) => {
    const safeLine = sanitizePlainText(idea.text, MAX_CAPTURED_IDEA_LENGTH * 2)
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
    lines.push(`${index + 1}. [${idea.createdAtIso}] ${safeLine}`);
  });

  lines.push('');
  return lines.join('\n');
}

export function buildCapturedIdeasJsonExport(
  ideas: readonly CapturedIdeaEntry[],
  exportedAtIso: string = new Date().toISOString()
): string {
  return JSON.stringify(
    {
      format: 'community-pedigree-captured-ideas',
      version: 1,
      exportedAtIso,
      count: ideas.length,
      ideas: ideas.map((idea) => ({
        id: idea.id,
        createdAtIso: idea.createdAtIso,
        text: idea.text,
      })),
    },
    null,
    2
  );
}
````

## `src/core/supportBundle.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Support Bundle Exporter (.ZIP with Logs + Optional Copy of User Barn Data) & Email/Share Helper.
 *
 * Packages:
 * - `diagnostics/support-report.txt`: Human-readable device, memory, quota & crash summary
 * - `diagnostics/error-logs.json`: Complete verbose structured log history within retention window
 * - Optional copy of user data (`pedigree-backup.json` + optional `photos/...`) placed at archive
 *   root so maintainers can inspect reports AND 1-click restore the exact workspace into
 *   Community Pedigree to reproduce issues.
 */

import { strToU8, zipSync, Zippable } from 'fflate';
import { buildCompleteBackupZipFiles } from './backupArchive';
import { formatByteSizePure } from './imageOptimizationSpec';
import { BarnDatabaseSnapshot, nowIsoUtc } from './models';
import { exportBarnBackupJson, formatTimestampedBackupSlug } from './syncAndExports';

export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type DiagnosticCategory =
  | 'runtime'
  | 'promise'
  | 'react'
  | 'memory'
  | 'storage'
  | 'media'
  | 'lifecycle'
  | 'console';

export interface MemorySample {
  usedHeapBytes: number | null;
  totalHeapBytes: number | null;
  heapLimitBytes: number | null;
  heapPercent: number | null;
  deviceMemoryGb: number | null;
  storageUsageBytes?: number;
  storageQuotaBytes?: number;
}

export interface DiagnosticLogEntry {
  id: string;
  timestampIso: string;
  timestampMs: number;
  sessionId: string;
  level: DiagnosticLogLevel;
  category: DiagnosticCategory;
  route: string;
  message: string;
  stack?: string;
  componentStack?: string;
  details?: string;
  memory?: MemorySample;
}

export type LogRetentionDays = 3 | 7 | 14;

export interface DiagnosticConfig {
  verboseEnabled: boolean;
  retentionDays: LogRetentionDays;
  supportEmail: string;
}

export interface DiagnosticSummary {
  totalEntries: number;
  errorCount: number;
  memoryWarningCount: number;
  crashCount: number;
  oldestEntryIso: string | null;
  newestEntryIso: string | null;
  currentMemory: MemorySample;
  config: DiagnosticConfig;
  sessionId: string;
  userAgent: string;
  platformInfo: string;
}

export interface SupportBundleBuildResult {
  bytes: Uint8Array;
  filename: string;
  logCount: number;
  includedData: boolean;
  includedPhotos: boolean;
  animalCount: number;
  photoCount: number;
}

export interface CompactAppStateSummary {
  barnName: string;
  breederName: string;
  themeMode: string;
  preferredUnit: string;
  defaultSpecies: string;
  pinnedLandingSpecies: string;
  defaultGenerations: number;
  imageOptimizationPreset: string;
  speciesCount: number;
  animalCount: number;
  photoCount: number;
  totalPhotoStoredBytes: number;
  breedingCount: number;
  openTaskCount: number;
  cageCount: number;
  careLogCount: number;
  showCount: number;
  speciesBreakdown: Array<{ name: string; animals: number; breedings: number }>;
}

export function buildCompactAppStateSummary(
  snapshot?: BarnDatabaseSnapshot | null
): CompactAppStateSummary | null {
  if (!snapshot) return null;
  const photos = snapshot.animalPhotos ?? [];
  return {
    barnName: snapshot.settings.barnName,
    breederName: snapshot.settings.breederName,
    themeMode: snapshot.settings.themeMode,
    preferredUnit: snapshot.settings.preferredUnit,
    defaultSpecies: snapshot.settings.defaultSpecies,
    pinnedLandingSpecies: snapshot.settings.pinnedLandingSpecies || '(Home Screen)',
    defaultGenerations: snapshot.settings.defaultGenerations,
    imageOptimizationPreset: snapshot.settings.imageOptimizationPreset || 'balanced',
    speciesCount: snapshot.speciesProfiles.length,
    animalCount: snapshot.animals.length,
    photoCount: photos.length,
    totalPhotoStoredBytes: photos.reduce((sum, p) => sum + (p.storedBytes || 0), 0),
    breedingCount: snapshot.breedings.length,
    openTaskCount: snapshot.tasks.filter((t) => !t.completed).length,
    cageCount: snapshot.cages.length,
    careLogCount: snapshot.careLogs.length,
    showCount: snapshot.shows.length,
    speciesBreakdown: snapshot.speciesProfiles.map((sp) => {
      const key = sp.name.trim().toLowerCase();
      return {
        name: sp.name,
        animals: snapshot.animals.filter((a) => a.species.trim().toLowerCase() === key).length,
        breedings: snapshot.breedings.filter((b) => b.species.trim().toLowerCase() === key).length,
      };
    }),
  };
}

export function formatSupportReportText(
  entries: DiagnosticLogEntry[],
  summary: DiagnosticSummary,
  snapshot?: BarnDatabaseSnapshot | null
): string {
  const mem = summary.currentMemory;
  const heapUsed =
    mem.usedHeapBytes !== null ? formatByteSizePure(mem.usedHeapBytes) : 'Unavailable';
  const heapLimit =
    mem.heapLimitBytes !== null ? formatByteSizePure(mem.heapLimitBytes) : 'Unavailable';
  const storageUsed =
    mem.storageUsageBytes !== undefined ? formatByteSizePure(mem.storageUsageBytes) : 'Unavailable';
  const storageQuota =
    mem.storageQuotaBytes !== undefined
      ? formatByteSizePure(mem.storageQuotaBytes)
      : 'Unavailable';
  const appState = buildCompactAppStateSummary(snapshot);

  const headerLines = [
    '====================================================================',
    'Community Pedigree — Crash & Diagnostic Support Report',
    '====================================================================',
    `Generated UTC:      ${nowIsoUtc()}`,
    `Active Session:     ${summary.sessionId}`,
    `Platform / Screen:  ${summary.platformInfo}`,
    `Browser User-Agent: ${summary.userAgent}`,
    `Retention Window:   ${summary.config.retentionDays} days (Verbose: ${
      summary.config.verboseEnabled ? 'ON' : 'OFF'
    })`,
    `JS Heap Memory:     ${heapUsed} / ${heapLimit}${
      mem.heapPercent !== null ? ` (${mem.heapPercent}%)` : ''
    }`,
    `Browser Storage:    ${storageUsed} / ${storageQuota}`,
    `Total Log Entries:  ${summary.totalEntries} (Errors/Fatal: ${summary.errorCount}, Memory Warnings: ${summary.memoryWarningCount}, React Crashes: ${summary.crashCount})`,
    `Log Time Span:      ${summary.oldestEntryIso || 'none'} -> ${summary.newestEntryIso || 'none'}`,
    ...(appState
      ? [
          '--------------------------------------------------------------------',
          `App State:          Barn="${appState.barnName}" · Theme=${appState.themeMode} · Default=${appState.defaultSpecies} (${appState.defaultGenerations}-Gen)`,
          `Totals:             ${appState.speciesCount} species · ${appState.animalCount} animals · ${appState.photoCount} photos (${formatByteSizePure(appState.totalPhotoStoredBytes)}) · ${appState.breedingCount} breedings · ${appState.openTaskCount} open chores`,
          `Species Counts:     ${appState.speciesBreakdown.map((s) => `${s.name}: ${s.animals}`).join(' | ')}`,
        ]
      : []),
    '====================================================================',
    '',
  ];

  if (entries.length === 0) {
    headerLines.push('No diagnostic log entries recorded within the active retention window.');
    return headerLines.join('\n');
  }

  const logLines = entries.map((e) => {
    const memTag =
      e.memory?.heapPercent !== null && e.memory?.heapPercent !== undefined
        ? ` | heap=${e.memory.heapPercent}% (${formatByteSizePure(e.memory.usedHeapBytes || 0)})`
        : '';
    const parts = [
      `[${e.timestampIso}] [${e.level.toUpperCase()}] [${e.category}] [route=${e.route}]${memTag}`,
      `  Message: ${e.message}`,
    ];
    if (e.details) parts.push(`  Details: ${e.details}`);
    if (e.stack) parts.push(`  Stack:\n    ${e.stack.replace(/\n/g, '\n    ')}`);
    if (e.componentStack) {
      parts.push(`  Component Stack:\n    ${e.componentStack.replace(/\n/g, '\n    ')}`);
    }
    return parts.join('\n');
  });

  return [...headerLines, ...logLines].join('\n\n');
}

export function buildErrorLogsJson(
  entries: DiagnosticLogEntry[],
  summary: DiagnosticSummary,
  snapshot?: BarnDatabaseSnapshot | null
): string {
  return JSON.stringify(
    {
      format: 'community-pedigree-diagnostics-v1',
      package: 'Pedigree',
      exportedAtIsoUtc: nowIsoUtc(),
      summary,
      appState: buildCompactAppStateSummary(snapshot),
      entries,
    },
    null,
    2
  );
}

export interface SupportBundleBuildParams {
  entries: DiagnosticLogEntry[];
  summary: DiagnosticSummary;
  snapshot?: BarnDatabaseSnapshot | null;
  includeData: boolean;
  includePhotos: boolean;
}

export function buildSupportBundleZipArchive(
  params: SupportBundleBuildParams
): SupportBundleBuildResult {
  const { entries, summary, snapshot, includeData, includePhotos } = params;
  const stamp = formatTimestampedBackupSlug();
  let zipFiles: Zippable = {};

  let photoCount = 0;
  let animalCount = 0;

  if (includeData && snapshot) {
    animalCount = snapshot.animals.length;
    if (includePhotos) {
      const built = buildCompleteBackupZipFiles(snapshot);
      zipFiles = built.zipFiles;
      photoCount = built.photoCount;
    } else {
      const dbOnlySnapshot: BarnDatabaseSnapshot = {
        ...snapshot,
        animalPhotos: [],
      };
      zipFiles['pedigree-backup.json'] = [
        strToU8(exportBarnBackupJson(dbOnlySnapshot)),
        { level: 6 },
      ];
    }
  }

  zipFiles['diagnostics/support-report.txt'] = [
    strToU8(formatSupportReportText(entries, summary, snapshot)),
    { level: 6 },
  ];
  zipFiles['diagnostics/error-logs.json'] = [
    strToU8(buildErrorLogsJson(entries, summary, snapshot)),
    { level: 6 },
  ];

  const filename = includeData
    ? `pedigree-support-bundle-with-data-${stamp}.zip`
    : `pedigree-error-logs-${stamp}.zip`;

  return {
    bytes: zipSync(zipFiles),
    filename,
    logCount: entries.length,
    includedData: Boolean(includeData && snapshot),
    includedPhotos: Boolean(includeData && snapshot && includePhotos),
    animalCount,
    photoCount,
  };
}

export function buildSupportMailtoHref(params: {
  recipientEmail: string;
  filename: string;
  summary: DiagnosticSummary;
  includedData: boolean;
  includedPhotos: boolean;
}): string {
  const { recipientEmail, filename, summary, includedData, includedPhotos } = params;
  const email = (recipientEmail || '').trim();
  const subject = `[Community Pedigree] Bug Report & Diagnostic Bundle (${
    summary.errorCount
  } errors, ${summary.memoryWarningCount} memory warnings)`;

  const mem = summary.currentMemory;
  const bodyLines = [
    'Hello,',
    '',
    'I am sending a bug report & diagnostic export from Community Pedigree.',
    `Attached / Downloaded File: ${filename}`,
    '',
    '--- Device & Diagnostic Summary ---',
    `Platform / Screen: ${summary.platformInfo}`,
    `Errors / Fatal: ${summary.errorCount}`,
    `Memory Warnings: ${summary.memoryWarningCount}`,
    `JS Heap: ${
      mem.usedHeapBytes !== null ? formatByteSizePure(mem.usedHeapBytes) : 'n/a'
    } / ${mem.heapLimitBytes !== null ? formatByteSizePure(mem.heapLimitBytes) : 'n/a'}${
      mem.heapPercent !== null ? ` (${mem.heapPercent}%)` : ''
    }`,
    `Includes Copy of Barn Data: ${
      includedData ? (includedPhotos ? 'Yes (Database + Photos)' : 'Yes (Database Only)') : 'Logs Only'
    }`,
    '',
    'What I was doing when the problem occurred:',
    '(Please describe what you tapped before the crash/error, and make sure the downloaded .ZIP file above is attached to this email.)',
  ];

  return `mailto:${email ? encodeURIComponent(email) : ''}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}
```

## `src/core/syncAndExports.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Device Conflict-Free Merge Engine & Open Export Serializers
 * (.json, .csv, Evans .HTM Pedigrees, Thermal Labels, and PDF-Ready Snapshots).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript string/JSON/HTML builders with zero browser DOM (`window`, `document`)
 * calls so the exact same serializers run in React Native / Expo (`expo-file-system` / `expo-print`).
 */

import {
  formatCompactCarrierDisclosure,
  reconcileCarrierTraitLists,
} from './carrierGenetics';
import { formatGenotypeArray, parseGenotypeString } from './geneticsEngine';
import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  BreedingStatus,
  CageLocation,
  CareLog,
  CareLogType,
  ClientContact,
  FeedAllocation,
  FeedAllocationTargetType,
  FeedBatch,
  formatPedigreeWeight,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  generateUuid,
  isAnimalArchived,
  isSameSpecies,
  LedgerEntry,
  millisToDateIso,
  normalizeAnimalStatus,
  normalizeBiologicalSex,
  normalizeBreedScheduleOverrides,
  normalizeCalendarSyncSettings,
  normalizeClientKind,
  normalizeCurrencyCode,
  normalizeFeedPurgeWindowDays,
  normalizeHousingUnitType,
  normalizeIgnoredConflicts,
  normalizeLedgerCategory,
  normalizeLedgerEntryType,
  normalizeLitterWeightMilestones,
  normalizeOwnershipType,
  normalizePedigreeGenerationDepth,
  normalizePeltGrade,
  normalizePreferredContactMethod,
  normalizeProcessingStatus,
  normalizeReservationStatus,
  normalizeRufusLevel,
  normalizeServiceFeeDirection,
  normalizeTargetWeightCurve,
  normalizeUltrasoundResult,
  normalizeWaitlistIntent,
  normalizeWaitlistStatus,
  normalizeWeightUnit,
  normalizeYouthOrgType,
  normalizeYouthProjectFeedLogs,
  nowEpochMs,
  nowIsoUtc,
  PedigreeGenerationDepth,
  PREDEFINED_SPECIES_PRESETS,
  ProcessingLog,
  resolveSpeciesProfile,
  YouthProjectBook,
  resolveSpeciesWeightUnit,
  ShowEvent,
  SpeciesProfile,
  TaskCategory,
  TaskPriority,
  todayDateIso,
  WaitlistEntry,
  WoolHarvest,
} from './models';
import {
  AnimalWoolSummary,
  buildWoolHarvestSummaryByAnimalId,
  formatWoolWeightSummary,
  IAGARB_JUDGING_POSITIONS,
  IAGARB_MIN_90_DAY_WOOL_GRAMS,
  IAGARB_REGISTRATION_MIN_POINTS,
  normalizeWoolHarvest,
  summarizeAnimalWoolHarvests,
} from './woolFiber';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  createSpeciesCoiEvaluator,
  PedigreeSlot,
} from './pedigreeCalculator';
import {
  PedigreeBorderStyleId,
  PedigreeColorPresetId,
  PedigreeLayoutPresetId,
  resolvePedigreePrintTheme,
} from './pedigreePrintStyles';
import { buildAnimalProfileDeepLink, renderQrSvg } from './qrCode';
import {
  computeAnimalShowSummary,
  mergeEnteredAnimalIdsWithResults,
  normalizeShowResults,
} from './showResults';
import { sanitizeSpeciesMemo } from './speciesMemo';
import {
  escapeSafeHtml,
  isSafeRecordKey,
  MAX_JSON_BACKUP_BYTES,
  sanitizeCustomColors,
  sanitizePlainDictionary,
  sanitizePlainText,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
  validateUploadFileSize,
} from './inputSanitization';

/**
 * Deterministic UUID + ISO-8601 `updatedAt` record merge helper.
 * When two devices edit records offline (e.g. via Google Drive, OneDrive, or SyncThing),
 * unique UUID records union cleanly and matching UUIDs keep whichever copy has the newer `updatedAt`.
 */
function mergeByIdAndTimestamp<T extends { id: string; updatedAt: string }>(
  localList: T[],
  incomingList: T[]
): { merged: T[]; added: number; updated: number } {
  const map = new Map<string, T>();
  for (const item of localList) {
    map.set(item.id, item);
  }

  let added = 0;
  let updated = 0;

  for (const inc of incomingList) {
    if (!inc.id) continue;
    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, inc);
      added++;
    } else if ((inc.updatedAt || '') > (existing.updatedAt || '')) {
      map.set(inc.id, inc);
      updated++;
    }
  }

  return { merged: Array.from(map.values()), added, updated };
}

function mergeAnimalPhotosWithBlobPreservation(
  localPhotos: AnimalPhoto[],
  incomingPhotos: AnimalPhoto[]
): { merged: AnimalPhoto[]; added: number; updated: number } {
  const map = new Map<string, AnimalPhoto>();
  for (const item of localPhotos) {
    map.set(item.id, item);
  }

  let added = 0;
  let updated = 0;

  for (const inc of incomingPhotos) {
    if (!inc.id) continue;
    const existing = map.get(inc.id);
    if (!existing) {
      map.set(inc.id, inc);
      added++;
      continue;
    }
    const existingHasBlob = Boolean(existing.dataUrl || existing.thumbnailDataUrl);
    const incHasBlob = Boolean(inc.dataUrl || inc.thumbnailDataUrl);
    const incIsNewer = (inc.updatedAt || '') > (existing.updatedAt || '');

    if (!existingHasBlob && incHasBlob) {
      map.set(inc.id, {
        ...(incIsNewer ? inc : existing),
        dataUrl: inc.dataUrl,
        thumbnailDataUrl: inc.thumbnailDataUrl,
        mimeType: inc.mimeType || existing.mimeType,
        width: inc.width || existing.width,
        height: inc.height || existing.height,
        originalBytes: inc.originalBytes || existing.originalBytes,
        storedBytes: inc.storedBytes || existing.storedBytes,
      });
      updated++;
    } else if (incIsNewer) {
      map.set(
        inc.id,
        !incHasBlob && existingHasBlob
          ? {
              ...inc,
              dataUrl: existing.dataUrl,
              thumbnailDataUrl: existing.thumbnailDataUrl,
            }
          : inc
      );
      updated++;
    }
  }

  return { merged: Array.from(map.values()), added, updated };
}

export interface SyncMergeReport {
  snapshot: BarnDatabaseSnapshot;
  animalsAdded: number;
  animalsUpdated: number;
  photosMerged: number;
  breedingsMerged: number;
  tasksMerged: number;
}

/**
 * Merges an incoming `BarnDatabaseSnapshot` (from a shared cloud folder or peer device)
 * into the local snapshot using deterministic UUID + ISO-8601 `updatedAt` resolution.
 */
export function mergeBarnSnapshots(
  local: BarnDatabaseSnapshot,
  incoming: BarnDatabaseSnapshot
): SyncMergeReport {
  const settings =
    (incoming.settings?.updatedAt || '') > (local.settings?.updatedAt || '')
      ? incoming.settings
      : local.settings;

  // Merge species profiles by case-insensitive species name first, then ID,
  // while preserving whichever side has the newest memo pad edit.
  const speciesByName = new Map<string, SpeciesProfile>();
  for (const sp of local.speciesProfiles) {
    speciesByName.set(sp.name.trim().toLowerCase(), {
      ...sp,
      memoText: sanitizeSpeciesMemo(sp.memoText),
      memoUpdatedAt: typeof sp.memoUpdatedAt === 'string' ? sp.memoUpdatedAt : '',
      breedOverrides: normalizeBreedScheduleOverrides(sp.breedOverrides),
      targetWeightCurve: normalizeTargetWeightCurve(sp.targetWeightCurve),
    });
  }
  for (const incSp of incoming.speciesProfiles) {
    const key = incSp.name.trim().toLowerCase();
    const prev = speciesByName.get(key);
    const cleanIncText = sanitizeSpeciesMemo(incSp.memoText);
    const cleanIncMemoTs = typeof incSp.memoUpdatedAt === 'string' ? incSp.memoUpdatedAt : '';
    const cleanIncOverrides = normalizeBreedScheduleOverrides(incSp.breedOverrides);
    const cleanIncTargetCurve = normalizeTargetWeightCurve(incSp.targetWeightCurve);

    if (!prev) {
      speciesByName.set(key, {
        ...incSp,
        memoText: cleanIncText,
        memoUpdatedAt: cleanIncMemoTs,
        breedOverrides: cleanIncOverrides,
        targetWeightCurve: cleanIncTargetCurve,
      });
      continue;
    }

    const prevText = sanitizeSpeciesMemo(prev.memoText);
    const prevMemoTs = typeof prev.memoUpdatedAt === 'string' ? prev.memoUpdatedAt : '';
    const pickIncomingMemo =
      (cleanIncMemoTs && (!prevMemoTs || cleanIncMemoTs > prevMemoTs)) ||
      (!prevMemoTs && !cleanIncMemoTs && !prevText && Boolean(cleanIncText));

    const winnerMemo = pickIncomingMemo
      ? { memoText: cleanIncText, memoUpdatedAt: cleanIncMemoTs }
      : { memoText: prevText, memoUpdatedAt: prevMemoTs };

    if ((incSp.updatedAt || '') > (prev.updatedAt || '')) {
      speciesByName.set(key, {
        ...incSp,
        id: prev.id,
        ...winnerMemo,
        breedOverrides: cleanIncOverrides,
        targetWeightCurve:
          cleanIncTargetCurve.length > 0
            ? cleanIncTargetCurve
            : normalizeTargetWeightCurve(prev.targetWeightCurve),
      });
    } else {
      speciesByName.set(key, {
        ...prev,
        ...winnerMemo,
        targetWeightCurve:
          normalizeTargetWeightCurve(prev.targetWeightCurve).length > 0
            ? normalizeTargetWeightCurve(prev.targetWeightCurve)
            : cleanIncTargetCurve,
      });
    }
  }

  const animalsRes = mergeByIdAndTimestamp(local.animals, incoming.animals);
  const animalPhotosRes = mergeAnimalPhotosWithBlobPreservation(
    local.animalPhotos ?? [],
    incoming.animalPhotos ?? []
  );
  const cagesRes = mergeByIdAndTimestamp(local.cages, incoming.cages);
  const breedingsRes = mergeByIdAndTimestamp(local.breedings, incoming.breedings);
  const tasksRes = mergeByIdAndTimestamp(local.tasks, incoming.tasks);
  const careLogsRes = mergeByIdAndTimestamp(local.careLogs, incoming.careLogs);
  const showsRes = mergeByIdAndTimestamp(local.shows, incoming.shows);
  const feedBatchesRes = mergeByIdAndTimestamp(
    local.feedBatches ?? [],
    incoming.feedBatches ?? []
  );
  const feedAllocationsRes = mergeByIdAndTimestamp(
    local.feedAllocations ?? [],
    incoming.feedAllocations ?? []
  );
  const ledgerEntriesRes = mergeByIdAndTimestamp(
    local.ledgerEntries ?? [],
    incoming.ledgerEntries ?? []
  );
  const processingLogsRes = mergeByIdAndTimestamp(
    local.processingLogs ?? [],
    incoming.processingLogs ?? []
  );
  const youthBooksRes = mergeByIdAndTimestamp(
    local.youthProjectBooks ?? [],
    incoming.youthProjectBooks ?? []
  );
  const clientContactsRes = mergeByIdAndTimestamp(
    local.clientContacts ?? [],
    incoming.clientContacts ?? []
  );
  const waitlistEntriesRes = mergeByIdAndTimestamp(
    local.waitlistEntries ?? [],
    incoming.waitlistEntries ?? []
  );
  const animalReservationsRes = mergeByIdAndTimestamp(
    local.animalReservations ?? [],
    incoming.animalReservations ?? []
  );
  const woolHarvestsRes = mergeByIdAndTimestamp(
    local.woolHarvests ?? [],
    incoming.woolHarvests ?? []
  );

  const sortedSpecies = Array.from(speciesByName.values())
    .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name))
    .map((sp, idx) => ({ ...sp, sortOrder: idx }));

  return {
    snapshot: {
      settings,
      speciesProfiles: sortedSpecies,
      animals: animalsRes.merged,
      animalPhotos: animalPhotosRes.merged,
      cages: cagesRes.merged,
      breedings: breedingsRes.merged,
      tasks: tasksRes.merged,
      careLogs: careLogsRes.merged,
      shows: showsRes.merged,
      feedBatches: feedBatchesRes.merged,
      feedAllocations: feedAllocationsRes.merged,
      ledgerEntries: ledgerEntriesRes.merged,
      processingLogs: processingLogsRes.merged,
      youthProjectBooks: youthBooksRes.merged,
      clientContacts: clientContactsRes.merged,
      waitlistEntries: waitlistEntriesRes.merged,
      animalReservations: animalReservationsRes.merged,
      woolHarvests: woolHarvestsRes.merged,
    },
    animalsAdded: animalsRes.added,
    animalsUpdated: animalsRes.updated,
    photosMerged: animalPhotosRes.added + animalPhotosRes.updated,
    breedingsMerged: breedingsRes.added + breedingsRes.updated,
    tasksMerged: tasksRes.added + tasksRes.updated,
  };
}

export type SpeciesBackupReason =
  | 'manual'
  | 'pre-remove-species'
  | 'pre-remove-non-testing'
  | 'pre-delete-all';

function slugifyFileSegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

/**
 * Builds clean, human-readable filenames for external backups and exports.
 * Default `"My Barn"` normalizes to `"pedigree"` so downloads look tidy.
 */
export function buildCleanBackupFileName(
  barnName: string | undefined,
  format: 'json' | 'sqlite' | 'csv',
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifyFileSegment(trimmed, 'pedigree');
  const stamp = dateSlug || todayDateIso();
  if (format === 'sqlite') {
    return `${prefix}-${stamp}.sqlite`;
  }
  if (format === 'csv') {
    return `${prefix}-export-${stamp}.csv`;
  }
  return `${prefix}-backup-${stamp}.json`;
}

/**
 * Builds a collision-free timestamped safety backup filename for targeted species operations.
 */
export function buildSpeciesSafetyBackupFileName(
  barnName: string | undefined,
  speciesName: string,
  reason: SpeciesBackupReason = 'manual',
  timestampSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifyFileSegment(trimmed, 'pedigree');
  const spSlug = slugifyFileSegment(speciesName, 'species');
  const reasonSlug =
    reason === 'pre-remove-non-testing'
      ? 'pre-clear-non-testing'
      : reason === 'pre-remove-species'
      ? 'pre-remove-species'
      : reason === 'pre-delete-all'
      ? 'pre-delete-all'
      : 'backup';
  const stamp = timestampSlug || formatTimestampedBackupSlug();
  return `${prefix}-${spSlug}-${reasonSlug}-${stamp}.json`;
}

/**
 * Builds a collision-free timestamped Species `.ZIP` backup filename (JSON + Photos + Printable Barn Binder `.HTM`).
 */
export function buildSpeciesZipBackupFileName(
  barnName: string | undefined,
  speciesName: string,
  reason: SpeciesBackupReason = 'manual',
  timestampSlug?: string
): string {
  return buildSpeciesSafetyBackupFileName(barnName, speciesName, reason, timestampSlug).replace(
    /\.json$/i,
    '.zip'
  );
}

const JSON_STREAM_CHUNK_TARGET_CHARS = 64 * 1024;

function buildBarnBackupEnvelopeContext(
  snapshot: BarnDatabaseSnapshot,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
) {
  const sortedAnimals = [...snapshot.animals].sort((a, b) => {
    const spCmp = (a.species || '').localeCompare(b.species || '');
    if (spCmp !== 0) return spCmp;
    const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
    if (archDiff !== 0) return archDiff;
    return (a.name || '').localeCompare(b.name || '');
  });

  const activeAnimalsCount = sortedAnimals.filter((a) => !isAnimalArchived(a)).length;
  const archivedAnimalsCount = sortedAnimals.length - activeAnimalsCount;

  const bySpeciesMap = new Map<
    string,
    { species: string; totalAnimals: number; activeAnimals: number; archivedAnimals: number }
  >();
  for (const sp of snapshot.speciesProfiles) {
    bySpeciesMap.set(sp.name.trim().toLowerCase(), {
      species: sp.name,
      totalAnimals: 0,
      activeAnimals: 0,
      archivedAnimals: 0,
    });
  }
  for (const a of sortedAnimals) {
    const key = (a.species || 'Other').trim().toLowerCase();
    const bucket = bySpeciesMap.get(key) || {
      species: a.species || 'Other',
      totalAnimals: 0,
      activeAnimals: 0,
      archivedAnimals: 0,
    };
    bucket.totalAnimals += 1;
    if (isAnimalArchived(a)) {
      bucket.archivedAnimals += 1;
    } else {
      bucket.activeAnimals += 1;
    }
    bySpeciesMap.set(key, bucket);
  }

  const exportedSpeciesProfiles: SpeciesProfile[] = snapshot.speciesProfiles.map((sp) => ({
    ...sp,
    memoText: sanitizeSpeciesMemo(sp.memoText),
    memoUpdatedAt: typeof sp.memoUpdatedAt === 'string' ? sp.memoUpdatedAt : '',
  }));

  const exportedAtIsoUtc = nowIsoUtc();
  const headerPayload = {
    format: 'community-pedigree-backup',
    package: 'Pedigree',
    version: 5,
    _schemaVersion: 6,
    exportedAtIsoUtc,
    exportedAtLocal: new Date(exportedAtIsoUtc).toLocaleString(),
    ...(extraMeta ?? {}),
    barnSummary: {
      barnName: snapshot.settings.barnName,
      breederName: snapshot.settings.breederName,
      counts: {
        animals: sortedAnimals.length,
        activeAnimals: activeAnimalsCount,
        archivedAnimals: archivedAnimalsCount,
        speciesProfiles: exportedSpeciesProfiles.length,
        animalPhotos: (snapshot.animalPhotos ?? []).length,
        breedings: snapshot.breedings.length,
        tasks: snapshot.tasks.length,
        feedBatches: (snapshot.feedBatches ?? []).length,
        feedAllocations: (snapshot.feedAllocations ?? []).length,
        ledgerEntries: (snapshot.ledgerEntries ?? []).length,
        processingLogs: (snapshot.processingLogs ?? []).length,
        youthProjectBooks: (snapshot.youthProjectBooks ?? []).length,
        clientContacts: (snapshot.clientContacts ?? []).length,
        waitlistEntries: (snapshot.waitlistEntries ?? []).length,
        animalReservations: (snapshot.animalReservations ?? []).length,
        woolHarvests: (snapshot.woolHarvests ?? []).length,
      },
      bySpecies: Array.from(bySpeciesMap.values()),
    },
    settings: snapshot.settings,
  };

  return {
    headerPayload,
    exportedSpeciesProfiles,
    sortedAnimals,
  };
}

/**
 * Serializes the entire database into an open, human-readable JSON backup (`version: 5`)
 * with summary metadata and deterministic sorting.
 */
export function exportBarnBackupJson(
  snapshot: BarnDatabaseSnapshot,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  }
): string {
  const { headerPayload, exportedSpeciesProfiles, sortedAnimals } =
    buildBarnBackupEnvelopeContext(snapshot, extraMeta);

  const payload = {
    ...headerPayload,
    speciesProfiles: exportedSpeciesProfiles,
    animals: sortedAnimals,
    animalPhotos: snapshot.animalPhotos ?? [],
    cages: snapshot.cages,
    breedings: snapshot.breedings,
    tasks: snapshot.tasks,
    careLogs: snapshot.careLogs,
    shows: snapshot.shows,
    feedBatches: snapshot.feedBatches ?? [],
    feedAllocations: snapshot.feedAllocations ?? [],
    ledgerEntries: snapshot.ledgerEntries ?? [],
    processingLogs: snapshot.processingLogs ?? [],
    youthProjectBooks: snapshot.youthProjectBooks ?? [],
    clientContacts: snapshot.clientContacts ?? [],
    waitlistEntries: snapshot.waitlistEntries ?? [],
    animalReservations: snapshot.animalReservations ?? [],
    woolHarvests: snapshot.woolHarvests ?? [],
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Streams a full JSON v5 backup incrementally in bounded (~64 KB) string chunks so large
 * photo-inclusive backups never materialize a monolithic string in JS heap beforehand.
 */
export function* generateBarnBackupJsonChunks(
  snapshot: BarnDatabaseSnapshot,
  extraMeta?: {
    backupScope?: 'barn' | 'species';
    backupReason?: SpeciesBackupReason;
    targetSpecies?: string;
  },
  chunkTargetChars: number = JSON_STREAM_CHUNK_TARGET_CHARS
): Generator<string, void, unknown> {
  const targetChars = Math.max(4096, chunkTargetChars);
  const { headerPayload, exportedSpeciesProfiles, sortedAnimals } =
    buildBarnBackupEnvelopeContext(snapshot, extraMeta);

  const headerJson = JSON.stringify(headerPayload, null, 2);
  let buffer = headerJson.slice(0, -1).trimEnd() + ',\n';

  const sections: ReadonlyArray<{ key: string; items: readonly unknown[] }> = [
    { key: 'speciesProfiles', items: exportedSpeciesProfiles },
    { key: 'animals', items: sortedAnimals },
    { key: 'animalPhotos', items: snapshot.animalPhotos ?? [] },
    { key: 'cages', items: snapshot.cages },
    { key: 'breedings', items: snapshot.breedings },
    { key: 'tasks', items: snapshot.tasks },
    { key: 'careLogs', items: snapshot.careLogs },
    { key: 'shows', items: snapshot.shows },
    { key: 'feedBatches', items: snapshot.feedBatches ?? [] },
    { key: 'feedAllocations', items: snapshot.feedAllocations ?? [] },
    { key: 'ledgerEntries', items: snapshot.ledgerEntries ?? [] },
    { key: 'processingLogs', items: snapshot.processingLogs ?? [] },
    { key: 'youthProjectBooks', items: snapshot.youthProjectBooks ?? [] },
    { key: 'clientContacts', items: snapshot.clientContacts ?? [] },
    { key: 'waitlistEntries', items: snapshot.waitlistEntries ?? [] },
    { key: 'animalReservations', items: snapshot.animalReservations ?? [] },
    { key: 'woolHarvests', items: snapshot.woolHarvests ?? [] },
  ];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const { key, items } = sections[sIdx];
    const isLastSection = sIdx === sections.length - 1;
    const sectionTrailer = isLastSection ? '\n' : ',\n';

    if (items.length === 0) {
      buffer += `  ${JSON.stringify(key)}: []${sectionTrailer}`;
      if (buffer.length >= targetChars) {
        yield buffer;
        buffer = '';
      }
      continue;
    }

    buffer += `  ${JSON.stringify(key)}: [\n`;
    for (let i = 0; i < items.length; i++) {
      const rawItem = JSON.stringify(items[i], null, 2) ?? 'null';
      const indentedItem = `    ${rawItem.replace(/\n/g, '\n    ')}`;
      buffer += indentedItem;
      buffer += i < items.length - 1 ? ',\n' : '\n';
      if (buffer.length >= targetChars) {
        yield buffer;
        buffer = '';
      }
    }
    buffer += `  ]${sectionTrailer}`;
    if (buffer.length >= targetChars) {
      yield buffer;
      buffer = '';
    }
  }

  buffer += '}';
  if (buffer.length > 0) {
    yield buffer;
  }
}

/**
 * Parses both current (`v5`) and legacy Kotlin demo (`v3`/`v4`) JSON backups into a normalized
 * `BarnDatabaseSnapshot`, automatically upgrading `earTag` -> `tattoo`, epoch millis -> ISO dates,
 * and `Buck`/`Doe` -> canonical biological sex + strict `species` scoping.
 */
export function parseBarnBackupJson(
  jsonText: string,
  fallbackSettings: BarnSettings
): BarnDatabaseSnapshot {
  const sizeCheck = validateUploadFileSize(
    'backup.json',
    jsonText.length,
    MAX_JSON_BACKUP_BYTES,
    'a JSON backup file'
  );
  if (!sizeCheck.ok) {
    throw new Error(sizeCheck.error);
  }
  const raw = JSON.parse(jsonText);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Backup file is not a valid JSON object.');
  }
  const hasKnownRootCollection =
    Array.isArray(raw.animals) ||
    Array.isArray(raw.speciesProfiles) ||
    Array.isArray(raw.speciesConfigs) ||
    (raw.settings && typeof raw.settings === 'object') ||
    (raw.profile && typeof raw.profile === 'object') ||
    raw.format === 'community-pedigree-backup' ||
    raw.format === 'community-pedigree-vault-backup';
  if (!hasKnownRootCollection) {
    throw new Error(
      'Backup JSON root structure is invalid (missing animals, speciesProfiles, or settings collections).'
    );
  }

  const ts = nowIsoUtc();
  const isObj = (v: unknown): v is Record<string, any> =>
    Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const finiteNum = (v: unknown, fb = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fb;
  };
  const finiteNonNeg = (v: unknown, fb = 0): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fb;
  };
  const safeId = (v: unknown): string => {
    if (typeof v !== 'string') return generateUuid();
    const clean = sanitizeSingleLineText(v, 140);
    return clean && isSafeRecordKey(clean) ? clean : generateUuid();
  };

  const rawSettingsCand = raw.settings ?? raw.profile;
  const rawSettings = isObj(rawSettingsCand) ? rawSettingsCand : {};
  const settings: BarnSettings = {
    id: 'barn_settings',
    barnName:
      sanitizeSingleLineText(rawSettings.barnName || rawSettings.warrenName, 160) ||
      fallbackSettings.barnName ||
      'My Barn',
    breederName: sanitizeSingleLineText(rawSettings.breederName, 160) || fallbackSettings.breederName || '',
    preferredUnit: normalizeWeightUnit(rawSettings.preferredUnit, fallbackSettings.preferredUnit || 'lbs_oz'),
    currencyCode: normalizeCurrencyCode(rawSettings.currencyCode, fallbackSettings.currencyCode || 'USD'),
    defaultSpecies:
      sanitizeSingleLineText(rawSettings.defaultSpecies, 100) || fallbackSettings.defaultSpecies || 'Rabbit',
    pinnedLandingSpecies:
      rawSettings.pinnedLandingSpecies !== undefined
        ? sanitizeSingleLineText(rawSettings.pinnedLandingSpecies, 100)
        : fallbackSettings.pinnedLandingSpecies ?? '',
    defaultGenerations:
      rawSettings.defaultGenerations === 4 ||
      rawSettings.defaultGenerations === 5 ||
      rawSettings.defaultGenerations === 6
        ? rawSettings.defaultGenerations
        : 3,
    themeMode:
      rawSettings.themeMode === 'dark' || rawSettings.themeMode === 'light'
        ? rawSettings.themeMode
        : fallbackSettings.themeMode,
    customColors:
      rawSettings.customColors && typeof rawSettings.customColors === 'object'
        ? sanitizeCustomColors(rawSettings.customColors) ?? fallbackSettings.customColors
        : fallbackSettings.customColors,
    imageOptimizationPreset:
      rawSettings.imageOptimizationPreset === 'compact' ||
      rawSettings.imageOptimizationPreset === 'balanced' ||
      rawSettings.imageOptimizationPreset === 'high_detail'
        ? rawSettings.imageOptimizationPreset
        : fallbackSettings.imageOptimizationPreset || 'balanced',
    showHomeSummaryGrid:
      typeof rawSettings.showHomeSummaryGrid === 'boolean'
        ? rawSettings.showHomeSummaryGrid
        : fallbackSettings.showHomeSummaryGrid ?? true,
    barnNameOnboarded:
      typeof rawSettings.barnNameOnboarded === 'boolean'
        ? rawSettings.barnNameOnboarded
        : fallbackSettings.barnNameOnboarded ?? true,
    ignoredTaskIds: Array.isArray(rawSettings.ignoredTaskIds)
      ? rawSettings.ignoredTaskIds
          .filter((x: unknown): x is string => typeof x === 'string')
          .map((x: string) => sanitizeSingleLineText(x, 120))
          .filter(Boolean)
      : fallbackSettings.ignoredTaskIds ?? [],
    dismissedTaskGroupKeys:
      rawSettings.dismissedTaskGroupKeys &&
      typeof rawSettings.dismissedTaskGroupKeys === 'object'
        ? sanitizePlainDictionary<string | string[]>(rawSettings.dismissedTaskGroupKeys, (val) => {
            if (typeof val === 'string') return sanitizeSingleLineText(val, 200);
            if (Array.isArray(val)) {
              return val
                .filter((x): x is string => typeof x === 'string')
                .map((x) => sanitizeSingleLineText(x, 200))
                .filter(Boolean);
            }
            return undefined;
          })
        : fallbackSettings.dismissedTaskGroupKeys ?? {},
    dismissedMemoAlertSignatures:
      rawSettings.dismissedMemoAlertSignatures &&
      typeof rawSettings.dismissedMemoAlertSignatures === 'object'
        ? sanitizePlainDictionary<string>(rawSettings.dismissedMemoAlertSignatures, (val) =>
            typeof val === 'string' ? sanitizeSingleLineText(val, 200) : undefined
          )
        : fallbackSettings.dismissedMemoAlertSignatures ?? {},
    speciesHubBlockOrder:
      rawSettings.speciesHubBlockOrder &&
      typeof rawSettings.speciesHubBlockOrder === 'object'
        ? sanitizePlainDictionary(rawSettings.speciesHubBlockOrder, (val) =>
            Array.isArray(val) ? val : undefined
          )
        : fallbackSettings.speciesHubBlockOrder ?? {},
    includePhotoOnPedigree:
      typeof rawSettings.includePhotoOnPedigree === 'boolean'
        ? rawSettings.includePhotoOnPedigree
        : fallbackSettings.includePhotoOnPedigree ?? false,
    breederLogoDataUrl:
      rawSettings.breederLogoDataUrl === ''
        ? undefined
        : sanitizeSafeRasterImageDataUrl(rawSettings.breederLogoDataUrl) ||
          fallbackSettings.breederLogoDataUrl,
    calendarSync: normalizeCalendarSyncSettings(
      rawSettings.calendarSync ?? fallbackSettings.calendarSync
    ),
    autoOffloadRetiredToOpfs:
      typeof rawSettings.autoOffloadRetiredToOpfs === 'boolean'
        ? rawSettings.autoOffloadRetiredToOpfs
        : fallbackSettings.autoOffloadRetiredToOpfs ?? false,
    feedTagPurgeWindowDays: normalizeFeedPurgeWindowDays(
      rawSettings.feedTagPurgeWindowDays,
      fallbackSettings.feedTagPurgeWindowDays ?? 60
    ),
    updatedAt: sanitizeSingleLineText(rawSettings.updatedAt || ts, 64) || ts,
  };

  const rawSpeciesList: Record<string, any>[] = (Array.isArray(raw.speciesProfiles)
    ? raw.speciesProfiles
    : Array.isArray(raw.speciesConfigs)
    ? raw.speciesConfigs
    : []
  ).filter(isObj);

  const speciesProfiles: SpeciesProfile[] =
    rawSpeciesList.length > 0
      ? rawSpeciesList
          .map((item: any, idx: number) => {
            const maturity = finiteNonNeg(item.maturityDays, 0);
            return {
              id: safeId(item.id),
              name: sanitizeSingleLineText(item.name, 100) || 'Rabbit',
              sortOrder: finiteNum(item.sortOrder, idx),
              defaultAnimalPrefix: sanitizeSingleLineText(item.defaultAnimalPrefix || '', 40),
              preferredUnit:
                item.preferredUnit === 'lbs_oz' ||
                item.preferredUnit === 'lbs' ||
                item.preferredUnit === 'grams' ||
                item.preferredUnit === 'kg'
                  ? item.preferredUnit
                  : undefined,
              memoText: sanitizeSpeciesMemo(item.memoText),
              memoUpdatedAt: typeof item.memoUpdatedAt === 'string' ? item.memoUpdatedAt : '',
              gestationDays: finiteNonNeg(item.gestationDays, 31) || 31,
              rebreedDaysAfterBirth: finiteNonNeg(item.rebreedDaysAfterBirth, 28),
              weanDaysAfterBirth: finiteNonNeg(item.weanDaysAfterBirth, 42),
              maturityDays: maturity > 0 ? maturity : undefined,
              birthEventLabel: sanitizeSingleLineText(item.birthEventLabel, 80) || 'Kindling',
              maleLabel: sanitizeSingleLineText(item.maleLabel, 80) || 'Buck',
              femaleLabel: sanitizeSingleLineText(item.femaleLabel, 80) || 'Doe',
              offspringLabel: sanitizeSingleLineText(item.offspringLabel, 80) || 'Kit',
              exampleBreeds: Array.isArray(item.exampleBreeds)
                ? item.exampleBreeds
                    .filter((b: unknown): b is string => typeof b === 'string')
                    .map((b: string) => sanitizeSingleLineText(b, 120))
                    .filter(Boolean)
                : [],
              milestones: Array.isArray(item.milestones)
                ? item.milestones.filter(isObj).map((m: any) => ({
                    label: sanitizeSingleLineText(m.label, 120) || 'Care Check',
                    relativeTo: m.relativeTo || 'BEFORE_BIRTH',
                    daysOffset: finiteNum(m.daysOffset, 0),
                    category: (m.category as TaskCategory) || 'Care',
                    priority: (m.priority as TaskPriority) || 'Normal',
                  }))
                : [],
              breedOverrides: normalizeBreedScheduleOverrides(
                Array.isArray(item.breedOverrides)
                  ? item.breedOverrides.filter(isObj).map((ov: any) => ({
                      ...ov,
                      breed: sanitizeSingleLineText(ov.breed, 120),
                      milestoneOverrides: Array.isArray(ov.milestoneOverrides)
                        ? ov.milestoneOverrides.filter(isObj).map((mo: any) => ({
                            label: sanitizeSingleLineText(mo.label, 120),
                            daysOffset: mo.daysOffset,
                          }))
                        : undefined,
                    }))
                  : []
              ),
              targetWeightCurve: normalizeTargetWeightCurve(item.targetWeightCurve),
              createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : ts,
              updatedAt: typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : ts,
            };
          })
          .sort(
            (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
          )
      : PREDEFINED_SPECIES_PRESETS.map((p, idx) => ({
          ...p,
          sortOrder: idx,
          createdAt: ts,
          updatedAt: ts,
        }));

  const animals: Animal[] = (Array.isArray(raw.animals) ? raw.animals : [])
    .filter(isObj)
    .map((a: any) => {
      const speciesName = sanitizeSingleLineText(a.species, 100) || 'Rabbit';
      const genoArray = Array.isArray(a.genotype)
        ? a.genotype.filter(isObj)
        : parseGenotypeString(
            typeof a.genotype === 'string' ? a.genotype : typeof a.genotypeRaw === 'string' ? a.genotypeRaw : '',
            speciesName
          );
      const genoStr =
        typeof a.genotypeRaw === 'string' && a.genotypeRaw
          ? sanitizeSingleLineText(a.genotypeRaw, 200)
          : typeof a.genotype === 'string'
          ? sanitizeSingleLineText(a.genotype, 200)
          : formatGenotypeArray(genoArray);

      const carriers = reconcileCarrierTraitLists(
        a.suspectedCarrierOf,
        a.confirmedCarrierOf,
        a.clearedCarrierOf
      );

      const status = normalizeAnimalStatus(a.status, a.archived);
      const birthMillis = finiteNonNeg(a.birthDateMillis, 0);

      return {
        id: safeId(a.id),
        tattoo: sanitizeSingleLineText(a.tattoo ?? a.earTag ?? '', 80),
        name: sanitizeSingleLineText(a.name, 140) || 'Unnamed',
        species: speciesName,
        breed: sanitizeSingleLineText(a.breed || '', 120),
        variety: sanitizeSingleLineText(a.variety || '', 120),
        sex: normalizeBiologicalSex(a.sex || 'Unknown'),
        status,
        archived:
          typeof a.archived === 'boolean' ? a.archived : isAnimalArchived({ status }),
        needsAttention: Boolean(a.needsAttention),
        ignoredConflicts: normalizeIgnoredConflicts(a.ignoredConflicts),
        birthDateIso:
          typeof a.birthDateIso === 'string' && a.birthDateIso
            ? a.birthDateIso
            : millisToDateIso(birthMillis),
        weightGrams: finiteNonNeg(a.weightGrams, 0),
        genotype: genoArray,
        genotypeRaw: genoStr,
        rufusLevel: normalizeRufusLevel(a.rufusLevel),
        suspectedCarrierOf: carriers.suspectedCarrierOf,
        confirmedCarrierOf: carriers.confirmedCarrierOf,
        clearedCarrierOf: carriers.clearedCarrierOf,
        registrationNumber: sanitizeSingleLineText(a.registrationNumber || '', 100),
        grandChampionNumber: sanitizeSingleLineText(a.grandChampionNumber || '', 100),
        legsCount: Math.round(finiteNonNeg(a.legsCount, 0)),
        cageLocation: sanitizeSingleLineText(a.cageLocation || '', 120),
        breederName: sanitizeSingleLineText(a.breederName || '', 140),
        ownerName: sanitizeSingleLineText(a.ownerName || '', 140),
        ownershipType: normalizeOwnershipType(a.ownershipType, 'Owned'),
        culled: Boolean(a.culled),
        cullDateIso: sanitizeSingleLineText(a.cullDateIso || '', 32),
        cullReason: sanitizeSingleLineText(a.cullReason || '', 300),
        deceasedDateIso: sanitizeSingleLineText(a.deceasedDateIso || '', 32),
        deathCause: sanitizeSingleLineText(a.deathCause || '', 300),
        soldDateIso: sanitizeSingleLineText(a.soldDateIso || '', 32),
        salePriceCents: Math.round(finiteNonNeg(a.salePriceCents, 0)),
        purchaseCostCents: Math.round(finiteNonNeg(a.purchaseCostCents, 0)),
        buyerName: sanitizeSingleLineText(a.buyerName || '', 140),
        sireId: typeof a.sireId === 'string' && isSafeRecordKey(a.sireId) ? a.sireId : '',
        damId: typeof a.damId === 'string' && isSafeRecordKey(a.damId) ? a.damId : '',
        notes: sanitizePlainText(a.notes || '', 20_000),
        offloadedArchiveKey: sanitizeSingleLineText(a.offloadedArchiveKey || '', 160) || undefined,
        offloadedAtIso: sanitizeSingleLineText(a.offloadedAtIso || '', 64) || undefined,
        createdAt: typeof a.createdAt === 'string' && a.createdAt ? a.createdAt : ts,
        updatedAt: typeof a.updatedAt === 'string' && a.updatedAt ? a.updatedAt : ts,
      };
    });

  const animalById = new Map(animals.map((a) => [a.id, a]));

  const cages: CageLocation[] = (Array.isArray(raw.cages) ? raw.cages : [])
    .filter(isObj)
    .map((c: any) => {
      const unitType = normalizeHousingUnitType(c.unitType);
      const feedLotName = sanitizeSingleLineText(c.feedLotName || '', 120);
      const feedStockRemaining = finiteNonNeg(c.feedStockRemaining, 0);
      const feedStockUnit = sanitizeSingleLineText(c.feedStockUnit || '', 30);
      const dailyRationNote = sanitizeSingleLineText(c.dailyRationNote || '', 120);
      const feedLowThreshold = finiteNonNeg(c.feedLowThreshold, 0);
      const maintenanceIntervalDays = Math.min(
        3650,
        Math.round(finiteNonNeg(c.maintenanceIntervalDays, 0))
      );
      const maintenanceTaskLabel = sanitizeSingleLineText(c.maintenanceTaskLabel || '', 120);
      const rawLastMaint =
        typeof c.lastMaintenanceDateIso === 'string' ? c.lastMaintenanceDateIso.trim() : '';
      const lastMaintenanceDateIso = /^\d{4}-\d{2}-\d{2}$/.test(rawLastMaint) ? rawLastMaint : '';

      return {
        id: safeId(c.id),
        species: sanitizeSingleLineText(c.species, 100) || 'Rabbit',
        label: sanitizeSingleLineText(c.label || '', 120),
        section: sanitizeSingleLineText(c.section || '', 120),
        capacity: Math.max(1, Math.round(finiteNonNeg(c.capacity, 1))),
        notes: sanitizePlainText(c.notes || '', 10_000),
        ...(unitType ? { unitType } : {}),
        ...(feedLotName ? { feedLotName } : {}),
        ...(feedStockRemaining > 0 ? { feedStockRemaining } : {}),
        ...(feedStockUnit ? { feedStockUnit } : {}),
        ...(dailyRationNote ? { dailyRationNote } : {}),
        ...(feedLowThreshold > 0 ? { feedLowThreshold } : {}),
        ...(maintenanceIntervalDays > 0 ? { maintenanceIntervalDays } : {}),
        ...(maintenanceTaskLabel ? { maintenanceTaskLabel } : {}),
        ...(lastMaintenanceDateIso ? { lastMaintenanceDateIso } : {}),
        createdAt: typeof c.createdAt === 'string' && c.createdAt ? c.createdAt : ts,
        updatedAt: typeof c.updatedAt === 'string' && c.updatedAt ? c.updatedAt : ts,
      };
    });

  const mapLegacyBreedingStatus = (st: string): BreedingStatus => {
    if (st === 'Confirmed Pregnant' || st === 'Palpated Positive') return 'Palpated Positive';
    if (['Kindled', 'Kidded', 'Lambed', 'Farrowed', 'Calved', 'Born'].includes(st)) return 'Born';
    if (st === 'Planned' || st === 'Weaned' || st === 'Missed') return st;
    return 'Bred';
  };

  const breedings: BreedingRecord[] = (Array.isArray(raw.breedings) ? raw.breedings : [])
    .filter(isObj)
    .map((b: any) => {
      const sireId = typeof b.sireId === 'string' && isSafeRecordKey(b.sireId) ? b.sireId : '';
      const damId = typeof b.damId === 'string' && isSafeRecordKey(b.damId) ? b.damId : '';
      const inferredSpecies =
        sanitizeSingleLineText(b.species, 100) ||
        animalById.get(damId)?.species ||
        animalById.get(sireId)?.species ||
        'Rabbit';
      return {
        id: safeId(b.id),
        species: inferredSpecies,
        sireId,
        damId,
        sireName: sanitizeSingleLineText(b.sireName, 140) || animalById.get(sireId)?.name || '',
        damName: sanitizeSingleLineText(b.damName, 140) || animalById.get(damId)?.name || '',
        bredDateIso:
          (typeof b.bredDateIso === 'string' && b.bredDateIso) ||
          millisToDateIso(finiteNonNeg(b.bredDateMillis, 0)),
        expectedDueDateIso:
          (typeof b.expectedDueDateIso === 'string' && b.expectedDueDateIso) ||
          millisToDateIso(finiteNonNeg(b.expectedDueDateMillis, 0)),
        actualBirthDateIso:
          (typeof b.actualBirthDateIso === 'string' && b.actualBirthDateIso) ||
          millisToDateIso(finiteNonNeg(b.actualKindleDateMillis, 0)),
        projectedCoiPercent: finiteNonNeg(b.projectedCoiPercent, 0),
        liveCount: Math.round(finiteNonNeg(b.liveCount, 0)),
        stillbornCount: Math.round(finiteNonNeg(b.stillbornCount, 0)),
        fosteredCount: Math.round(finiteNonNeg(b.fosteredCount, 0)),
        weanedCount: Math.round(finiteNonNeg(b.weanedCount, 0)),
        offspringCreated: Boolean(b.offspringCreated),
        status: mapLegacyBreedingStatus(String(b.status || 'Bred')),
        serviceFeeCents: Math.round(finiteNonNeg(b.serviceFeeCents, 0)),
        serviceFeeDirection: normalizeServiceFeeDirection(b.serviceFeeDirection),
        ultrasoundDateIso: sanitizeSingleLineText(b.ultrasoundDateIso || '', 32),
        ultrasoundResult: normalizeUltrasoundResult(b.ultrasoundResult),
        ultrasoundFetalCount: Math.round(finiteNonNeg(b.ultrasoundFetalCount, 0)),
        ultrasoundProjectedDueIso: sanitizeSingleLineText(b.ultrasoundProjectedDueIso || '', 32),
        litterWeightMilestones: normalizeLitterWeightMilestones(b.litterWeightMilestones),
        notes: sanitizePlainText(b.notes || '', 20_000),
        createdAt: typeof b.createdAt === 'string' && b.createdAt ? b.createdAt : ts,
        updatedAt: typeof b.updatedAt === 'string' && b.updatedAt ? b.updatedAt : ts,
      };
    });

  const tasks: BarnTask[] = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter(isObj)
    .map((t: any) => {
      const linkedAnimalId =
        typeof t.linkedAnimalId === 'string' && isSafeRecordKey(t.linkedAnimalId)
          ? t.linkedAnimalId
          : '';
      const inferredSpecies =
        sanitizeSingleLineText(t.species, 100) ||
        animalById.get(linkedAnimalId)?.species ||
        settings.defaultSpecies ||
        'Rabbit';
      return {
        id: safeId(t.id),
        species: inferredSpecies,
        title: sanitizeSingleLineText(t.title, 200) || 'Barn Chore',
        category: (t.category as TaskCategory) || 'Care',
        priority: (t.priority as TaskPriority) || 'Normal',
        dueDateIso:
          (typeof t.dueDateIso === 'string' && t.dueDateIso) ||
          millisToDateIso(finiteNonNeg(t.dueDateMillis, 0)),
        linkedAnimalId,
        linkedAnimalName: sanitizeSingleLineText(t.linkedAnimalName || '', 140),
        linkedBreedingId:
          typeof t.linkedBreedingId === 'string' && isSafeRecordKey(t.linkedBreedingId)
            ? t.linkedBreedingId
            : '',
        completed: Boolean(t.completed),
        createdAt: typeof t.createdAt === 'string' && t.createdAt ? t.createdAt : ts,
        updatedAt: typeof t.updatedAt === 'string' && t.updatedAt ? t.updatedAt : ts,
      };
    });

  const careLogs: CareLog[] = (Array.isArray(raw.careLogs) ? raw.careLogs : [])
    .filter(isObj)
    .map((l: any) => {
      const animalId =
        typeof l.animalId === 'string' && isSafeRecordKey(l.animalId) ? l.animalId : '';
      return {
        id: safeId(l.id),
        species:
          sanitizeSingleLineText(l.species, 100) || animalById.get(animalId)?.species || 'Rabbit',
        animalId,
        dateIso:
          (typeof l.dateIso === 'string' && l.dateIso) ||
          millisToDateIso(finiteNonNeg(l.dateMillis, 0)),
        type: (l.type as CareLogType) || 'Weight Check',
        title: sanitizeSingleLineText(l.title || '', 160),
        weightGrams: Math.round(finiteNonNeg(l.weightGrams, 0)),
        showLegEarned: Boolean(l.showLegEarned),
        medicationName: sanitizeSingleLineText(l.medicationName || '', 140),
        dosage: sanitizeSingleLineText(l.dosage || '', 100),
        administrationRoute: sanitizeSingleLineText(l.administrationRoute || '', 100),
        withdrawalDays: Math.round(finiteNonNeg(l.withdrawalDays, 0)),
        withdrawalClearDateIso: sanitizeSingleLineText(l.withdrawalClearDateIso || '', 32),
        bodyConditionScore: finiteNonNeg(l.bodyConditionScore, 0),
        famachaScore: Math.round(finiteNonNeg(l.famachaScore, 0)),
        fecalEggCount: Math.round(finiteNonNeg(l.fecalEggCount, 0)),
        ultrasoundResult: normalizeUltrasoundResult(l.ultrasoundResult),
        ultrasoundFetalCount: Math.round(finiteNonNeg(l.ultrasoundFetalCount, 0)),
        notes: sanitizePlainText(l.notes || '', 20_000),
        createdAt: typeof l.createdAt === 'string' && l.createdAt ? l.createdAt : ts,
        updatedAt: typeof l.updatedAt === 'string' && l.updatedAt ? l.updatedAt : ts,
      };
    });

  const shows: ShowEvent[] = (Array.isArray(raw.shows) ? raw.shows : [])
    .filter(isObj)
    .map((s: any) => {
      const enteredIds = Array.isArray(s.enteredAnimalIds)
        ? s.enteredAnimalIds
            .filter((x: unknown): x is string => typeof x === 'string' && isSafeRecordKey(x))
            .map((x: string) => sanitizeSingleLineText(x, 140))
            .filter(Boolean)
        : [];
      const firstEntered = enteredIds[0];
      const cleanResults = normalizeShowResults(s.results, { dropEmpty: false });
      return {
        id: safeId(s.id),
        species:
          sanitizeSingleLineText(s.species, 100) ||
          (firstEntered ? animalById.get(firstEntered)?.species : '') ||
          'Rabbit',
        name: sanitizeSingleLineText(s.name, 160) || 'Show Event',
        location: sanitizeSingleLineText(s.location || '', 160),
        sanctioningBody: sanitizeSingleLineText(s.sanctioningBody || 'ARBA', 80) || 'ARBA',
        eventDateIso:
          (typeof s.eventDateIso === 'string' && s.eventDateIso) ||
          millisToDateIso(finiteNonNeg(s.eventDateMillis, 0)),
        entryDeadlineIso:
          (typeof s.entryDeadlineIso === 'string' && s.entryDeadlineIso) ||
          millisToDateIso(finiteNonNeg(s.entryDeadlineMillis, 0)),
        enteredAnimalIds: mergeEnteredAnimalIdsWithResults(enteredIds, cleanResults),
        results: cleanResults.length > 0 ? cleanResults : undefined,
        notes: sanitizePlainText(s.notes || '', 20_000),
        createdAt: typeof s.createdAt === 'string' && s.createdAt ? s.createdAt : ts,
        updatedAt: typeof s.updatedAt === 'string' && s.updatedAt ? s.updatedAt : ts,
      };
    });

  const animalPhotos: AnimalPhoto[] = (
    Array.isArray(raw.animalPhotos) ? raw.animalPhotos : []
  )
    .map((p: any, idx: number) => {
      if (!p || typeof p !== 'object' || !p.animalId) return null;
      const safeDataUrl = sanitizeSafeRasterImageDataUrl(p.dataUrl);
      if (!safeDataUrl) return null;
      const safeThumbUrl = sanitizeSafeRasterImageDataUrl(p.thumbnailDataUrl) || safeDataUrl;
      return {
        id: sanitizeSingleLineText(p.id, 120) || generateUuid(),
        species: sanitizeSingleLineText(p.species || animalById.get(p.animalId)?.species || 'Rabbit', 100) || 'Rabbit',
        animalId: sanitizeSingleLineText(p.animalId, 120),
        isPrimary: Boolean(p.isPrimary),
        sortOrder: typeof p.sortOrder === 'number' && Number.isFinite(p.sortOrder) ? p.sortOrder : idx,
        caption: sanitizePlainText(p.caption || '', 2000),
        originalFileName: sanitizeSingleLineText(p.originalFileName || '', 260),
        mimeType: sanitizeSingleLineText(p.mimeType || 'image/webp', 80) || 'image/webp',
        width: Math.max(0, Number(p.width) || 0),
        height: Math.max(0, Number(p.height) || 0),
        originalBytes: Math.max(0, Number(p.originalBytes) || 0),
        storedBytes: Math.max(0, Number(p.storedBytes) || 0),
        thumbnailDataUrl: safeThumbUrl,
        dataUrl: safeDataUrl,
        createdAt: sanitizeSingleLineText(p.createdAt || ts, 64) || ts,
        updatedAt: sanitizeSingleLineText(p.updatedAt || ts, 64) || ts,
      } satisfies AnimalPhoto;
    })
    .filter((p: AnimalPhoto | null): p is AnimalPhoto => Boolean(p));

  const feedBatches: FeedBatch[] = (Array.isArray(raw.feedBatches) ? raw.feedBatches : [])
    .filter(isObj)
    .map((f: any) => {
      const safeTagPhoto = sanitizeSafeRasterImageDataUrl(f.tagPhotoDataUrl) || undefined;
      const safeTagThumb =
        sanitizeSafeRasterImageDataUrl(f.tagPhotoThumbnailDataUrl) || safeTagPhoto || undefined;
      const rawCapDate =
        typeof f.tagPhotoCapturedDateIso === 'string' ? f.tagPhotoCapturedDateIso.trim() : '';
      const rawMfgDate =
        typeof f.manufactureDateIso === 'string' ? f.manufactureDateIso.trim() : '';
      const rawPurchaseDate =
        typeof f.purchaseDateIso === 'string' ? f.purchaseDateIso.trim() : '';
      return {
        id: safeId(f.id),
        species: sanitizeSingleLineText(f.species, 100) || 'Rabbit',
        brand: sanitizeSingleLineText(f.brand || '', 140),
        productName: sanitizeSingleLineText(f.productName || '', 180) || 'Feed Batch',
        lotNumber: sanitizeSingleLineText(f.lotNumber || '', 80),
        millCode: sanitizeSingleLineText(f.millCode || '', 80),
        manufactureDateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawMfgDate) ? rawMfgDate : '',
        purchaseDateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawPurchaseDate)
          ? rawPurchaseDate
          : todayDateIso(),
        bagCount: finiteNonNeg(f.bagCount, 0),
        bagWeightValue: finiteNonNeg(f.bagWeightValue, 0),
        bagWeightUnit: sanitizeSingleLineText(f.bagWeightUnit || 'lbs', 30) || 'lbs',
        totalQuantity: finiteNonNeg(f.totalQuantity, 0),
        remainingQuantity: finiteNonNeg(f.remainingQuantity, 0),
        lowStockThreshold: finiteNonNeg(f.lowStockThreshold, 0),
        totalCostCents:
          f.totalCostCents !== undefined ? Math.round(finiteNonNeg(f.totalCostCents, 0)) : undefined,
        supplierName: sanitizeSingleLineText(f.supplierName || '', 160),
        proteinPercent:
          f.proteinPercent !== undefined && finiteNonNeg(f.proteinPercent, 0) > 0
            ? finiteNonNeg(f.proteinPercent, 0)
            : undefined,
        notes: sanitizePlainText(f.notes || '', 20_000),
        ...(safeTagPhoto ? { tagPhotoDataUrl: safeTagPhoto } : {}),
        ...(safeTagThumb ? { tagPhotoThumbnailDataUrl: safeTagThumb } : {}),
        ...(f.tagPhotoMimeType ? { tagPhotoMimeType: sanitizeSingleLineText(f.tagPhotoMimeType, 80) } : {}),
        ...(finiteNonNeg(f.tagPhotoBytes, 0) > 0 ? { tagPhotoBytes: finiteNonNeg(f.tagPhotoBytes, 0) } : {}),
        ...( /^\d{4}-\d{2}-\d{2}$/.test(rawCapDate) ? { tagPhotoCapturedDateIso: rawCapDate } : {}),
        ...(typeof f.tagPhotoPurgedAtIso === 'string' && f.tagPhotoPurgedAtIso
          ? { tagPhotoPurgedAtIso: sanitizeSingleLineText(f.tagPhotoPurgedAtIso, 64) }
          : {}),
        ...(finiteNonNeg(f.tagPhotoBytesReclaimed, 0) > 0
          ? { tagPhotoBytesReclaimed: finiteNonNeg(f.tagPhotoBytesReclaimed, 0) }
          : {}),
        ...(typeof f.ocrRawText === 'string' && f.ocrRawText
          ? { ocrRawText: sanitizePlainText(f.ocrRawText, 6000) }
          : {}),
        ...(f.ocrConfidence !== undefined && Number.isFinite(Number(f.ocrConfidence))
          ? { ocrConfidence: Math.max(0, Math.min(100, Number(f.ocrConfidence))) }
          : {}),
        ...(f.ocrManualOverride ? { ocrManualOverride: true } : {}),
        ...(f.recallFlagged ? { recallFlagged: true } : {}),
        ...(f.recallNote ? { recallNote: sanitizePlainText(f.recallNote, 1000) } : {}),
        ...(typeof f._rev === 'number' && Number.isFinite(f._rev) ? { _rev: Math.floor(f._rev) } : {}),
        createdAt: typeof f.createdAt === 'string' && f.createdAt ? f.createdAt : ts,
        updatedAt: typeof f.updatedAt === 'string' && f.updatedAt ? f.updatedAt : ts,
      } satisfies FeedBatch;
    });

  const feedAllocations: FeedAllocation[] = (
    Array.isArray(raw.feedAllocations) ? raw.feedAllocations : []
  )
    .filter(isObj)
    .map((fa: any) => {
      const targetType: FeedAllocationTargetType =
        fa.targetType === 'cage' ||
        fa.targetType === 'litter' ||
        fa.targetType === 'animal'
          ? fa.targetType
          : 'general';
      const rawDate = typeof fa.dateIso === 'string' ? fa.dateIso.trim() : '';
      return {
        id: safeId(fa.id),
        species: sanitizeSingleLineText(fa.species, 100) || 'Rabbit',
        feedBatchId: typeof fa.feedBatchId === 'string' && isSafeRecordKey(fa.feedBatchId) ? fa.feedBatchId : '',
        targetType,
        targetId: typeof fa.targetId === 'string' && isSafeRecordKey(fa.targetId) ? fa.targetId : '',
        targetLabel: sanitizeSingleLineText(fa.targetLabel || '', 160),
        dateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateIso(),
        quantity: finiteNonNeg(fa.quantity, 0),
        unit: sanitizeSingleLineText(fa.unit || 'lbs', 30) || 'lbs',
        notes: sanitizePlainText(fa.notes || '', 5000),
        ...(typeof fa._rev === 'number' && Number.isFinite(fa._rev) ? { _rev: Math.floor(fa._rev) } : {}),
        createdAt: typeof fa.createdAt === 'string' && fa.createdAt ? fa.createdAt : ts,
        updatedAt: typeof fa.updatedAt === 'string' && fa.updatedAt ? fa.updatedAt : ts,
      } satisfies FeedAllocation;
    });

  const ledgerEntries: LedgerEntry[] = (
    Array.isArray(raw.ledgerEntries) ? raw.ledgerEntries : []
  )
    .filter(isObj)
    .map((le: any) => {
      const rawDate = typeof le.dateIso === 'string' ? le.dateIso.trim() : '';
      const receiptData = sanitizeSafeRasterImageDataUrl(le.receiptPhotoDataUrl);
      const receiptThumb = sanitizeSafeRasterImageDataUrl(le.receiptPhotoThumbnailDataUrl);
      return {
        id: safeId(le.id),
        species: sanitizeSingleLineText(le.species, 100) || 'Rabbit',
        dateIso: /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateIso(),
        entryType: normalizeLedgerEntryType(le.entryType, 'expense'),
        category: normalizeLedgerCategory(le.category, 'other'),
        amountCents: Math.round(finiteNonNeg(le.amountCents, 0)),
        title: sanitizeSingleLineText(le.title || 'Barn Transaction', 180) || 'Barn Transaction',
        vendorOrParty: sanitizeSingleLineText(le.vendorOrParty || '', 160),
        ...(typeof le.linkedAnimalId === 'string' && isSafeRecordKey(le.linkedAnimalId)
          ? { linkedAnimalId: le.linkedAnimalId }
          : {}),
        ...(typeof le.linkedBreedingId === 'string' && isSafeRecordKey(le.linkedBreedingId)
          ? { linkedBreedingId: le.linkedBreedingId }
          : {}),
        ...(typeof le.linkedFeedBatchId === 'string' && isSafeRecordKey(le.linkedFeedBatchId)
          ? { linkedFeedBatchId: le.linkedFeedBatchId }
          : {}),
        ...(typeof le.linkedProjectId === 'string' && isSafeRecordKey(le.linkedProjectId)
          ? { linkedProjectId: le.linkedProjectId }
          : {}),
        ...(receiptData ? { receiptPhotoDataUrl: receiptData } : {}),
        ...(receiptThumb ? { receiptPhotoThumbnailDataUrl: receiptThumb } : {}),
        ...(typeof le.receiptPhotoMimeType === 'string' && le.receiptPhotoMimeType
          ? { receiptPhotoMimeType: sanitizeSingleLineText(le.receiptPhotoMimeType, 60) }
          : {}),
        ...(le.receiptPhotoBytes !== undefined
          ? { receiptPhotoBytes: Math.round(finiteNonNeg(le.receiptPhotoBytes, 0)) }
          : {}),
        notes: sanitizePlainText(le.notes || '', 5000),
        ...(typeof le._rev === 'number' && Number.isFinite(le._rev) ? { _rev: Math.floor(le._rev) } : {}),
        createdAt: typeof le.createdAt === 'string' && le.createdAt ? le.createdAt : ts,
        updatedAt: typeof le.updatedAt === 'string' && le.updatedAt ? le.updatedAt : ts,
      } satisfies LedgerEntry;
    });

  const processingLogs: ProcessingLog[] = (
    Array.isArray(raw.processingLogs) ? raw.processingLogs : []
  )
    .filter(isObj)
    .map((pl: any) => {
      const schedDate = typeof pl.scheduledDateIso === 'string' ? pl.scheduledDateIso.trim() : '';
      const harvDate = typeof pl.harvestDateIso === 'string' ? pl.harvestDateIso.trim() : '';
      const liveW = Math.round(finiteNonNeg(pl.liveWeightGrams, 0));
      const dressedW = Math.round(finiteNonNeg(pl.dressedWeightGrams, 0));
      const dressPct =
        liveW > 0 && dressedW > 0
          ? Math.round((dressedW / liveW) * 1000) / 10
          : typeof pl.dressOutPercent === 'number' && Number.isFinite(pl.dressOutPercent)
          ? Math.round(pl.dressOutPercent * 10) / 10
          : undefined;
      return {
        id: safeId(pl.id),
        species: sanitizeSingleLineText(pl.species, 100) || 'Rabbit',
        title: sanitizeSingleLineText(pl.title || 'Processing Batch', 180) || 'Processing Batch',
        ...(typeof pl.linkedAnimalId === 'string' && isSafeRecordKey(pl.linkedAnimalId)
          ? { linkedAnimalId: pl.linkedAnimalId }
          : {}),
        ...(typeof pl.linkedBreedingId === 'string' && isSafeRecordKey(pl.linkedBreedingId)
          ? { linkedBreedingId: pl.linkedBreedingId }
          : {}),
        scheduledDateIso: /^\d{4}-\d{2}-\d{2}$/.test(schedDate) ? schedDate : '',
        harvestDateIso: /^\d{4}-\d{2}-\d{2}$/.test(harvDate) ? harvDate : '',
        status: normalizeProcessingStatus(pl.status, 'Processed'),
        animalCount: Math.max(1, Math.round(finiteNonNeg(pl.animalCount, 1))),
        liveWeightGrams: liveW,
        dressedWeightGrams: dressedW,
        ...(dressPct !== undefined ? { dressOutPercent: dressPct } : {}),
        peltCount: Math.round(finiteNonNeg(pl.peltCount, 0)),
        peltGrade: normalizePeltGrade(pl.peltGrade),
        peltColorNotes: sanitizeSingleLineText(pl.peltColorNotes || '', 240),
        ...(pl.processingCostCents !== undefined
          ? { processingCostCents: Math.round(finiteNonNeg(pl.processingCostCents, 0)) }
          : {}),
        ...(pl.meatValueCents !== undefined
          ? { meatValueCents: Math.round(finiteNonNeg(pl.meatValueCents, 0)) }
          : {}),
        ...(pl.peltValueCents !== undefined
          ? { peltValueCents: Math.round(finiteNonNeg(pl.peltValueCents, 0)) }
          : {}),
        notes: sanitizePlainText(pl.notes || '', 5000),
        ...(typeof pl._rev === 'number' && Number.isFinite(pl._rev) ? { _rev: Math.floor(pl._rev) } : {}),
        createdAt: typeof pl.createdAt === 'string' && pl.createdAt ? pl.createdAt : ts,
        updatedAt: typeof pl.updatedAt === 'string' && pl.updatedAt ? pl.updatedAt : ts,
      } satisfies ProcessingLog;
    });

  const youthProjectBooks: YouthProjectBook[] = (
    Array.isArray(raw.youthProjectBooks) ? raw.youthProjectBooks : []
  )
    .filter(isObj)
    .map((yp: any) => {
      const startDate = typeof yp.startDateIso === 'string' ? yp.startDateIso.trim() : '';
      const endDate = typeof yp.endDateIso === 'string' ? yp.endDateIso.trim() : '';
      return {
        id: safeId(yp.id),
        species: sanitizeSingleLineText(yp.species, 100) || 'Rabbit',
        organization: normalizeYouthOrgType(yp.organization, '4-H'),
        projectTitle: sanitizeSingleLineText(yp.projectTitle || 'Youth Livestock Project', 180) || 'Youth Livestock Project',
        memberName: sanitizeSingleLineText(yp.memberName || '', 140),
        clubOrChapter: sanitizeSingleLineText(yp.clubOrChapter || '', 160),
        leaderOrAdvisor: sanitizeSingleLineText(yp.leaderOrAdvisor || '', 140),
        projectYear: sanitizeSingleLineText(yp.projectYear || todayDateIso().slice(0, 4), 16) || todayDateIso().slice(0, 4),
        startDateIso: /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : todayDateIso(),
        endDateIso: /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : '',
        status: yp.status === 'Completed' ? 'Completed' : 'Active',
        linkedAnimalIds: Array.isArray(yp.linkedAnimalIds)
          ? yp.linkedAnimalIds.filter((id: unknown): id is string => typeof id === 'string' && isSafeRecordKey(id))
          : [],
        linkedBreedingIds: Array.isArray(yp.linkedBreedingIds)
          ? yp.linkedBreedingIds.filter((id: unknown): id is string => typeof id === 'string' && isSafeRecordKey(id))
          : [],
        startingInventoryValueCents: Math.round(finiteNonNeg(yp.startingInventoryValueCents, 0)),
        endingInventoryValueCents: Math.round(finiteNonNeg(yp.endingInventoryValueCents, 0)),
        feedLogs: normalizeYouthProjectFeedLogs(yp.feedLogs),
        goalsAndReflection: sanitizePlainText(yp.goalsAndReflection || '', 10_000),
        showAndCommunityNotes: sanitizePlainText(yp.showAndCommunityNotes || '', 10_000),
        notes: sanitizePlainText(yp.notes || '', 5000),
        ...(typeof yp._rev === 'number' && Number.isFinite(yp._rev) ? { _rev: Math.floor(yp._rev) } : {}),
        createdAt: typeof yp.createdAt === 'string' && yp.createdAt ? yp.createdAt : ts,
        updatedAt: typeof yp.updatedAt === 'string' && yp.updatedAt ? yp.updatedAt : ts,
      } satisfies YouthProjectBook;
    });

  const clientContacts: ClientContact[] = (
    Array.isArray(raw.clientContacts) ? raw.clientContacts : []
  )
    .filter(isObj)
    .map((cc: any) => ({
      id: safeId(cc.id),
      species: sanitizeSingleLineText(cc.species, 100) || 'Rabbit',
      fullName: sanitizeSingleLineText(cc.fullName || 'Buyer', 140) || 'Buyer',
      ranchOrHerdName: sanitizeSingleLineText(cc.ranchOrHerdName || '', 160),
      email: sanitizeSingleLineText(cc.email || '', 160),
      phone: sanitizeSingleLineText(cc.phone || '', 60),
      preferredContact: normalizePreferredContactMethod(cc.preferredContact, 'sms'),
      clientKind: normalizeClientKind(cc.clientKind, 'pet_buyer'),
      cityState: sanitizeSingleLineText(cc.cityState || '', 120),
      shippingAddress: sanitizePlainText(cc.shippingAddress || '', 400),
      tags: Array.isArray(cc.tags)
        ? cc.tags
            .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t: string) => sanitizeSingleLineText(t, 60))
            .filter(Boolean)
        : [],
      notes: sanitizePlainText(cc.notes || '', 5000),
      ...(typeof cc._rev === 'number' && Number.isFinite(cc._rev) ? { _rev: Math.floor(cc._rev) } : {}),
      createdAt: typeof cc.createdAt === 'string' && cc.createdAt ? cc.createdAt : ts,
      updatedAt: typeof cc.updatedAt === 'string' && cc.updatedAt ? cc.updatedAt : ts,
    }));

  const waitlistEntries: WaitlistEntry[] = (
    Array.isArray(raw.waitlistEntries) ? raw.waitlistEntries : []
  )
    .filter(isObj)
    .map((wl: any) => {
      const reqDate = typeof wl.requestedByDateIso === 'string' ? wl.requestedByDateIso.trim() : '';
      const inqDate = typeof wl.inquiryDateIso === 'string' ? wl.inquiryDateIso.trim() : '';
      const fuDate = typeof wl.followUpDateIso === 'string' ? wl.followUpDateIso.trim() : '';
      const lcDate = typeof wl.lastContactedDateIso === 'string' ? wl.lastContactedDateIso.trim() : '';
      const rawSex = String(wl.preferredSex || 'Any');
      const preferredSex: WaitlistEntry['preferredSex'] =
        rawSex === 'Male' || rawSex === 'Female' ? rawSex : 'Any';
      return {
        id: safeId(wl.id),
        species: sanitizeSingleLineText(wl.species, 100) || 'Rabbit',
        clientId: typeof wl.clientId === 'string' && isSafeRecordKey(wl.clientId) ? wl.clientId : '',
        clientName: sanitizeSingleLineText(wl.clientName || 'Buyer', 140),
        priorityRank: Math.max(1, Math.round(finiteNonNeg(wl.priorityRank, 1))),
        status: normalizeWaitlistStatus(wl.status, 'Active'),
        intent: normalizeWaitlistIntent(wl.intent, 'Show / Breeding'),
        desiredBreed: sanitizeSingleLineText(wl.desiredBreed || '', 120),
        desiredVariety: sanitizeSingleLineText(wl.desiredVariety || '', 120),
        preferredSex,
        ...(typeof wl.preferredBreedingId === 'string' && isSafeRecordKey(wl.preferredBreedingId)
          ? { preferredBreedingId: wl.preferredBreedingId }
          : {}),
        requestedByDateIso: /^\d{4}-\d{2}-\d{2}$/.test(reqDate) ? reqDate : '',
        inquiryDateIso: /^\d{4}-\d{2}-\d{2}$/.test(inqDate) ? inqDate : todayDateIso(),
        followUpDateIso: /^\d{4}-\d{2}-\d{2}$/.test(fuDate) ? fuDate : '',
        lastContactedDateIso: /^\d{4}-\d{2}-\d{2}$/.test(lcDate) ? lcDate : '',
        ...(wl.maxBudgetCents !== undefined && Number(wl.maxBudgetCents) > 0
          ? { maxBudgetCents: Math.round(finiteNonNeg(wl.maxBudgetCents, 0)) }
          : {}),
        notes: sanitizePlainText(wl.notes || '', 5000),
        ...(typeof wl._rev === 'number' && Number.isFinite(wl._rev) ? { _rev: Math.floor(wl._rev) } : {}),
        createdAt: typeof wl.createdAt === 'string' && wl.createdAt ? wl.createdAt : ts,
        updatedAt: typeof wl.updatedAt === 'string' && wl.updatedAt ? wl.updatedAt : ts,
      };
    });

  const animalReservations: AnimalReservation[] = (
    Array.isArray(raw.animalReservations) ? raw.animalReservations : []
  )
    .filter(isObj)
    .map((ar: any) => {
      const isoOrEmpty = (val: unknown) =>
        typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim()) ? val.trim() : '';
      return {
        id: safeId(ar.id),
        species: sanitizeSingleLineText(ar.species, 100) || 'Rabbit',
        agreementNumber: sanitizeSingleLineText(ar.agreementNumber || '', 60),
        clientId: typeof ar.clientId === 'string' && isSafeRecordKey(ar.clientId) ? ar.clientId : '',
        clientName: sanitizeSingleLineText(ar.clientName || 'Buyer', 140),
        ...(typeof ar.waitlistEntryId === 'string' && isSafeRecordKey(ar.waitlistEntryId)
          ? { waitlistEntryId: ar.waitlistEntryId }
          : {}),
        ...(typeof ar.animalId === 'string' && isSafeRecordKey(ar.animalId)
          ? { animalId: ar.animalId }
          : {}),
        ...(typeof ar.breedingId === 'string' && isSafeRecordKey(ar.breedingId)
          ? { breedingId: ar.breedingId }
          : {}),
        ...(ar.pickOrder !== undefined && Number(ar.pickOrder) > 0
          ? { pickOrder: Math.round(finiteNonNeg(ar.pickOrder, 1)) }
          : {}),
        itemLabel: sanitizeSingleLineText(ar.itemLabel || '', 180),
        status: normalizeReservationStatus(ar.status, 'Pending Deposit'),
        reservedDateIso: isoOrEmpty(ar.reservedDateIso) || todayDateIso(),
        holdExpiresDateIso: isoOrEmpty(ar.holdExpiresDateIso),
        totalPriceCents: Math.round(finiteNonNeg(ar.totalPriceCents, 0)),
        depositRequiredCents: Math.round(finiteNonNeg(ar.depositRequiredCents, 0)),
        depositPaidCents: Math.round(finiteNonNeg(ar.depositPaidCents, 0)),
        depositDueDateIso: isoOrEmpty(ar.depositDueDateIso),
        depositPaidDateIso: isoOrEmpty(ar.depositPaidDateIso),
        pickupScheduledDateIso: isoOrEmpty(ar.pickupScheduledDateIso),
        completedDateIso: isoOrEmpty(ar.completedDateIso),
        balanceReminderDateIso: isoOrEmpty(ar.balanceReminderDateIso),
        paymentMethod: sanitizeSingleLineText(ar.paymentMethod || '', 80),
        ...(typeof ar.ledgerEntryId === 'string' && isSafeRecordKey(ar.ledgerEntryId)
          ? { ledgerEntryId: ar.ledgerEntryId }
          : {}),
        termsSummary: sanitizePlainText(ar.termsSummary || '', 5000),
        healthGuaranteeNotes: sanitizePlainText(ar.healthGuaranteeNotes || '', 5000),
        notes: sanitizePlainText(ar.notes || '', 5000),
        ...(typeof ar._rev === 'number' && Number.isFinite(ar._rev) ? { _rev: Math.floor(ar._rev) } : {}),
        createdAt: typeof ar.createdAt === 'string' && ar.createdAt ? ar.createdAt : ts,
        updatedAt: typeof ar.updatedAt === 'string' && ar.updatedAt ? ar.updatedAt : ts,
      };
    });

  const woolHarvests: WoolHarvest[] = (
    Array.isArray(raw.woolHarvests) ? raw.woolHarvests : []
  )
    .map((wh: unknown) => normalizeWoolHarvest(wh, settings.defaultSpecies || 'Rabbit'))
    .filter((wh: WoolHarvest | null): wh is WoolHarvest => Boolean(wh));

  return {
    settings,
    speciesProfiles,
    animals,
    animalPhotos,
    cages,
    breedings,
    tasks,
    careLogs,
    shows,
    feedBatches,
    feedAllocations,
    ledgerEntries,
    processingLogs,
    youthProjectBooks,
    clientContacts,
    waitlistEntries,
    animalReservations,
    woolHarvests,
  };
}

export {
  buildCleanCsvExportFileName,
  escapeCsvCell,
  exportAnimalsCsv,
  formatParentReferenceForCsv,
  UTF8_BOM,
} from './csvExport';

export {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  computeAnimalKinshipSummary,
  generateSpeciesBarnBinderHtml,
  resolveBinderPalette,
} from './barnBinder';
export type {
  AnimalKinshipSummary,
  BarnBinderColorMode,
  BarnBinderOptions,
  BinderRelatedAnimalEntry,
  ResolvedBinderPalette,
} from './barnBinder';

function escapeHtml(raw: string): string {
  return escapeSafeHtml(raw);
}

export type PedigreePrintOrientation = 'landscape' | 'portrait';

export interface PedigreePrintOptions {
  /** Page orientation for 8.5" x 11" printing & PDF export (default: 'landscape'). */
  orientation?: PedigreePrintOrientation;
  /** Include animal & ancestor weights (default: true). */
  showWeights?: boolean;
  /** Format weights using traditional ARBA `lbs.oz` decimal dot notation (e.g., `10.04`). */
  arbaLbsOzDotNotation?: boolean;
  /** Include coat color genotype strings (default: true when omitted for API compatibility). */
  showGenotypes?: boolean;
  /** Include bottom breeder certification & signature footer (default: true). */
  showBreederFooter?: boolean;
  /** Optional breeder phone, email, or website line shown in footer when enabled. */
  breederContactLine?: string;
  /** Include breeder/rabbitry logo in header block when available (default: true). */
  showBreederLogo?: boolean;
  /** Optional per-preview override logo raster data URL (defaults to `settings.breederLogoDataUrl`). */
  breederLogoDataUrl?: string;
  /** Print accent palette preset (all paper backgrounds remain strict `#FFFFFF`). */
  colorPreset?: PedigreeColorPresetId;
  /** Pedigree framing and border style preset. */
  borderStyle?: PedigreeBorderStyleId;
  /** Pedigree header & density layout preset. */
  layoutPreset?: PedigreeLayoutPresetId;
  /** Optional species shows & careLogs so pedigree certificates auto-surface show honors & GC progress. */
  shows?: ShowEvent[];
  careLogs?: CareLog[];
  /** Optional wool/fiber harvests to summarize fiber yields & IAGARB scores onto pedigrees. */
  woolHarvests?: WoolHarvest[];
  /** Optional map of ancestor animalId -> portrait data URL used by `family_portrait` layout. */
  ancestorPhotosByAnimalId?: Record<string, string>;
}

/**
 * Generates a standardized, self-contained `.HTM` multi-generation pedigree file compatible
 * with Evans Rabbit Register / ARBA breeder sharing conventions and direct PDF printing.
 * Supports 3 through 8 generations, Landscape/Portrait 8.5"x11" sizing, customizable print
 * border/color/layout presets, optional breeder logo, ARBA `lbs.oz` dot weight notation,
 * multi-photo Family Portrait mode, IAGARB German Angora template, and fiber harvest totals.
 */
export function generateEvansHtmPedigree(
  subject: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  generations: PedigreeGenerationDepth = 3,
  primaryPhotoDataUrl?: string,
  printOptions?: PedigreePrintOptions
): string {
  const depth = normalizePedigreeGenerationDepth(generations, 3);
  const sp = resolveSpeciesProfile(subject.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, subject.species);
  const slots = buildPedigreeSlots(subject, herdById, depth, sp);
  const coi = calculateAnimalCoi(subject, herdById);
  const theme = resolvePedigreePrintTheme(printOptions, settings.customColors);

  const orientation: PedigreePrintOrientation =
    printOptions?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isPortrait = orientation === 'portrait';
  const showWeights = printOptions?.showWeights ?? true;
  const arbaLbsOzDotNotation = Boolean(printOptions?.arbaLbsOzDotNotation);
  const showGenotypes = printOptions?.showGenotypes ?? true;
  const showBreederFooter = printOptions?.showBreederFooter ?? true;
  const breederContactLine = (printOptions?.breederContactLine || '').trim();
  const showBreederLogo = printOptions?.showBreederLogo ?? true;
  const rawLogoUrl =
    printOptions?.breederLogoDataUrl !== undefined
      ? printOptions.breederLogoDataUrl
      : settings.breederLogoDataUrl;
  const safeLogo = showBreederLogo ? sanitizeSafeRasterImageDataUrl(rawLogoUrl) : '';
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  const woolHarvestList = printOptions?.woolHarvests ?? [];
  const woolSummaryByAnimalId =
    woolHarvestList.length > 0
      ? buildWoolHarvestSummaryByAnimalId(woolHarvestList)
      : new Map<string, AnimalWoolSummary>();
  const subjectWoolSummary =
    woolHarvestList.length > 0 ? summarizeAnimalWoolHarvests(woolHarvestList, subject.id) : null;
  const subjectWoolLine = subjectWoolSummary ? formatWoolWeightSummary(subjectWoolSummary) : '';

  const isFamilyPortrait = theme.layoutPreset === 'family_portrait';
  const isIagarbAngora = theme.layoutPreset === 'iagarb_angora';
  const ultraCompactMode = depth >= 7;
  const compactMode = depth >= 5 || theme.layoutPreset === 'compact_ledger';
  const tightMode = compactMode || (isPortrait && depth >= 4);
  const isShowCert = theme.layoutPreset === 'show_certificate';
  const preserveColorInk =
    theme.colorPreset !== 'classic_sage' && !theme.isMonochrome;

  let anyAncestorGeno = false;
  const renderAncestorCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    const isTinyLeaf = ultraCompactMode && rowspan <= 2;
    if (!a) {
      return `<td rowspan="${rowspan}" class="cell empty${isTinyLeaf ? ' leaf' : ''}">
        <div class="role">${escapeHtml(roleTag)} &mdash; Unknown</div>
      </td>`;
    }
    const geno = showGenotypes ? a.genotypeRaw || formatGenotypeArray(a.genotype) : '';
    if (showGenotypes && !compactMode && geno) {
      anyAncestorGeno = true;
    }
    const fullCarrierText = formatCompactCarrierDisclosure(a, {
      herdById,
      includeCleared: true,
    });
    const carrierText = isTinyLeaf
      ? ''
      : formatCompactCarrierDisclosure(a, {
          herdById,
          includeCleared: true,
          ultraCompact: compactMode,
          maxItemsPerGroup: compactMode ? 2 : 4,
        });
    const metaParts = [
      a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
      !compactMode && a.variety ? escapeHtml(a.variety) : '',
      showWeights && !compactMode && a.weightGrams > 0
        ? escapeHtml(formatPedigreeWeight(a.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation))
        : '',
    ].filter(Boolean);

    const ancShowSummary =
      (printOptions?.shows?.length || 0) > 0 || (printOptions?.careLogs?.length || 0) > 0
        ? computeAnimalShowSummary(a, printOptions?.shows ?? [], printOptions?.careLogs ?? [])
        : null;
    const ancLegs = ancShowSummary ? ancShowSummary.effectiveLegs : a.legsCount;
    const regParts = [
      a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
      a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
      ancLegs > 0 ? `Legs: ${ancLegs}` : '',
      ancShowSummary?.awardsSummaryText ? escapeHtml(ancShowSummary.awardsSummaryText) : '',
    ].filter(Boolean);

    const ancWool = woolSummaryByAnimalId.get(a.id);
    const ancWoolText =
      ancWool && (ancWool.harvestCount > 0 || ancWool.highestIagarbScore)
        ? formatWoolWeightSummary(ancWool, { compact: true })
        : '';

    const ancSafePhoto =
      isFamilyPortrait && !compactMode && gen <= 2
        ? sanitizeSafeRasterImageDataUrl(printOptions?.ancestorPhotosByAnimalId?.[a.id])
        : '';

    if (isTinyLeaf) {
      return `<td rowspan="${rowspan}" class="cell leaf ${idx % 2 === 0 ? 'sire' : 'dam'}">
      <div class="name">${escapeHtml(a.name)}${a.tattoo ? ` <span class="meta">(${escapeHtml(a.tattoo)})</span>` : ''}</div>
    </td>`;
    }

    return `<td rowspan="${rowspan}" class="cell ${idx % 2 === 0 ? 'sire' : 'dam'}">
      ${ancSafePhoto ? `<div class="anc-photo-row"><img class="anc-photo" src="${ancSafePhoto}" alt="${escapeHtml(a.name)}" /><div>` : ''}
      <div class="name">${escapeHtml(a.name)}</div>
      ${metaParts.length ? `<div class="meta">${metaParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && a.birthDateIso ? `<div class="meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
      ${!compactMode && regParts.length ? `<div class="meta">${regParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && ancWoolText ? `<div class="wool-line">${escapeHtml(ancWoolText)}</div>` : ''}
      ${showGenotypes && !compactMode && geno ? `<div class="geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierText ? `<div class="carrier" title="${escapeHtml(fullCarrierText)}">${escapeHtml(carrierText)}</div>` : ''}
      ${ancSafePhoto ? `</div></div>` : ''}
    </td>`;
  };

  const totalRows = 1 << depth;
  const tableRowsHtml: string[] = [];

  for (let r = 0; r < totalRows; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= depth; g++) {
      const span = 1 << (depth - g);
      if (r % span === 0) {
        const slotIdx = Math.floor(r / span);
        cells.push(renderAncestorCell(g, slotIdx, span));
      }
    }
    tableRowsHtml.push(`<tr>${cells.join('')}</tr>`);
  }

  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });
  const safePhoto = sanitizeSafeRasterImageDataUrl(primaryPhotoDataUrl);

  const familyPortraitStripHtml = (() => {
    if (!isFamilyPortrait) return '';
    const cards: Array<{ label: string; name: string; sub: string; photo: string; role: 'subj' | 'sire' | 'dam' }> = [];
    cards.push({
      label: 'Subject',
      name: subject.name,
      sub: subject.tattoo || subject.variety || '',
      photo: safePhoto || sanitizeSafeRasterImageDataUrl(printOptions?.ancestorPhotosByAnimalId?.[subject.id]),
      role: 'subj',
    });
    const gen1Slots: Array<{ idx: number; label: string; role: 'sire' | 'dam' }> = [
      { idx: 0, label: `Sire (${sp.maleLabel})`, role: 'sire' },
      { idx: 1, label: `Dam (${sp.femaleLabel})`, role: 'dam' },
    ];
    for (const entry of gen1Slots) {
      const anc = slotMap.get(`1:${entry.idx}`)?.animal;
      if (anc) {
        cards.push({
          label: entry.label,
          name: anc.name,
          sub: anc.tattoo || anc.variety || '',
          photo: sanitizeSafeRasterImageDataUrl(printOptions?.ancestorPhotosByAnimalId?.[anc.id]),
          role: entry.role,
        });
      }
    }
    const gen2Labels = ['Pat. Grandsire', 'Pat. Granddam', 'Mat. Grandsire', 'Mat. Granddam'];
    for (let i = 0; i < 4; i += 1) {
      const anc = slotMap.get(`2:${i}`)?.animal;
      if (!anc) continue;
      const ancPhoto = sanitizeSafeRasterImageDataUrl(printOptions?.ancestorPhotosByAnimalId?.[anc.id]);
      if (ancPhoto) {
        cards.push({
          label: gen2Labels[i],
          name: anc.name,
          sub: anc.tattoo || anc.variety || '',
          photo: ancPhoto,
          role: i % 2 === 0 ? 'sire' : 'dam',
        });
      }
    }
    if (cards.length <= 1 && !cards[0]?.photo) return '';
    return `<div class="family-strip" aria-label="Family Portrait Gallery">
      ${cards
        .map(
          (c) => `<div class="fp-card fp-${c.role}">
            ${
              c.photo
                ? `<img class="fp-img" src="${c.photo}" alt="${escapeHtml(c.name)}" />`
                : `<div class="fp-placeholder">${escapeHtml((c.name || '?').slice(0, 2).toUpperCase())}</div>`
            }
            <div class="fp-role">${escapeHtml(c.label)}</div>
            <div class="fp-name">${escapeHtml(c.name)}</div>
            ${c.sub ? `<div class="fp-sub">${escapeHtml(c.sub)}</div>` : ''}
          </div>`
        )
        .join('')}
    </div>`;
  })();

  const iagarbSectionHtml = (() => {
    if (!isIagarbAngora) return '';
    const bestScore = subjectWoolSummary?.highestIagarbScore ?? subjectWoolSummary?.latestIagarbScore ?? null;
    const totalPrime = subjectWoolSummary?.primeGrams ?? 0;
    const totalGrade = subjectWoolSummary?.gradeGrams ?? 0;
    const avg90 = subjectWoolSummary?.average90DayRateGrams;
    const eligText = subjectWoolSummary?.eligibility.statusLabel || 'Log wool harvests & IAGARB score to verify qualification';
    const scoreCells = IAGARB_JUDGING_POSITIONS.map((pos) => {
      const val = bestScore ? bestScore[pos.key] : null;
      return `<div class="iag-pos">
        <div class="iag-lbl">${escapeHtml(pos.label)}</div>
        <div class="iag-val">${val !== null ? `${val} / ${pos.maxPoints}` : `&mdash; / ${pos.maxPoints}`}</div>
      </div>`;
    }).join('');
    return `<div class="iagarb-panel">
      <div class="iag-head">
        <div><strong>IAGARB German Angora Wool &amp; Evaluation Standard</strong> (Reg min: ${IAGARB_REGISTRATION_MIN_POINTS}/100 pts &middot; 90-day yield min: ${IAGARB_MIN_90_DAY_WOOL_GRAMS}g)</div>
        <div class="iag-status">${escapeHtml(eligText)}</div>
      </div>
      <div class="iag-stats">
        <div><strong>Logged Harvests:</strong> ${subjectWoolSummary?.harvestCount ?? 0}</div>
        <div><strong>Prime Fiber:</strong> ${totalPrime}g</div>
        <div><strong>Grade Fiber:</strong> ${totalGrade}g</div>
        <div><strong>Total Yield:</strong> ${subjectWoolSummary?.totalGrams ?? 0}g</div>
        <div><strong>90-Day Rate:</strong> ${avg90 !== null && avg90 !== undefined ? `${avg90}g` : 'N/A'}</div>
        <div><strong>Total IAGARB Score:</strong> ${bestScore ? `${bestScore.totalPts} / 100 pts` : 'Not Scored'}</div>
      </div>
      <div class="iag-grid">${scoreCells}</div>
    </div>`;
  })();

  const genHeaders: string[] = [
    '<th>Parents (Gen 1)</th>',
    '<th>Grandparents (Gen 2)</th>',
    '<th>Great-Grandparents (Gen 3)</th>',
  ];
  if (depth >= 4) genHeaders.push('<th>4th Generation (Gen 4)</th>');
  if (depth >= 5) genHeaders.push('<th>5th Generation (Gen 5)</th>');
  if (depth >= 6) genHeaders.push('<th>6th Generation (Gen 6)</th>');
  if (depth >= 7) genHeaders.push('<th>7th Generation (Gen 7)</th>');
  if (depth >= 8) genHeaders.push('<th>8th Generation (Gen 8)</th>');

  const pageWidthCss = isPortrait ? '8.5in' : '11in';
  const frameCss =
    theme.borderStyle === 'double_frame'
      ? `border: 4px double ${theme.borderHex}; padding: ${ultraCompactMode ? '8px' : '12px'}; background: #ffffff;`
      : theme.borderStyle === 'modern_rounded'
      ? `border: 1.5px solid ${theme.borderHex}; border-radius: 12px; padding: ${ultraCompactMode ? '8px' : '12px'}; background: #ffffff;`
      : 'background: #ffffff;';
  const subjectBorderCss =
    theme.borderStyle === 'modern_rounded'
      ? `border: 1.5px solid ${theme.borderHex}; border-radius: 8px;`
      : theme.borderStyle === 'minimal_lines'
      ? `border: 1px solid ${theme.cellBorderHex};`
      : `border: 1px solid ${theme.borderHex};`;
  const cellBorderCss =
    theme.borderStyle === 'minimal_lines'
      ? `0.75px solid ${theme.cellBorderHex}`
      : `1px solid ${theme.cellBorderHex}`;

  const certSubtitle = isIagarbAngora
    ? `IAGARB German Angora ${depth}-Generation Wool &amp; Evaluation Pedigree`
    : isFamilyPortrait
    ? `Family Portrait ${depth}-Generation ${escapeHtml(subject.species)} Pedigree`
    : `Official ${depth}-Generation ${escapeHtml(subject.species)} Pedigree Certificate`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="${orientation}" />
<meta name="barn-preserve-accent-ink" content="${preserveColorInk ? 'true' : 'false'}" />
<title>Pedigree - ${escapeHtml(subject.name)} (${escapeHtml(subject.tattoo || subject.id)})</title>
<style>
  @page { size: letter ${orientation}; margin: ${ultraCompactMode ? '6mm' : compactMode ? '8mm' : isPortrait ? '10mm' : '12mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; }
  body { font-family: Georgia, "Times New Roman", serif; margin: ${ultraCompactMode ? '6px' : compactMode ? '8px' : '16px'}; max-width: ${pageWidthCss}; }
  .pedigree-frame { ${frameCss} }
  .header { display: flex; ${isShowCert ? 'flex-direction: column; align-items: center; text-align: center;' : 'justify-content: space-between; align-items: flex-end;'} gap: ${isShowCert ? '4px' : '12px'}; border-bottom: ${theme.borderStyle === 'minimal_lines' ? '1px' : '2px'} solid ${theme.borderHex}; padding-bottom: ${theme.layoutPreset === 'compact_ledger' ? '5px' : '8px'}; margin-bottom: ${theme.layoutPreset === 'compact_ledger' ? '6px' : '10px'}; }
  .header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; ${isShowCert ? 'justify-content: center;' : ''} }
  .barn-logo { max-height: ${compactMode ? '36px' : '52px'}; max-width: ${compactMode ? '96px' : '140px'}; width: auto; height: auto; object-fit: contain; border-radius: 4px; flex-shrink: 0; }
  .barn-title { font-size: ${isShowCert ? (isPortrait ? '20px' : '22px') : theme.layoutPreset === 'compact_ledger' ? '16px' : isPortrait ? '18px' : '20px'}; font-weight: bold; color: ${theme.primaryHex}; letter-spacing: ${isShowCert ? '0.02em' : 'normal'}; }
  .sub-title { font-size: ${ultraCompactMode || theme.layoutPreset === 'compact_ledger' ? '10px' : isPortrait ? '10.5px' : '11.5px'}; color: ${theme.mutedInkHex}; }
  .subject-wrap { ${subjectBorderCss} padding: ${theme.layoutPreset === 'compact_ledger' ? '5px 9px' : isPortrait ? '8px 11px' : '10px 14px'}; margin-bottom: ${theme.layoutPreset === 'compact_ledger' ? '6px' : '10px'}; background: #ffffff; display: flex; align-items: center; gap: ${isPortrait ? '12px' : '16px'}; }
  .subject-photo { width: ${theme.layoutPreset === 'compact_ledger' ? '58px' : isPortrait ? '72px' : '84px'}; height: ${theme.layoutPreset === 'compact_ledger' ? '58px' : isPortrait ? '72px' : '84px'}; object-fit: cover; border-radius: 6px; border: 1px solid ${theme.cellBorderHex}; flex-shrink: 0; }
  .subject-box { display: flex; flex-wrap: wrap; gap: ${theme.layoutPreset === 'compact_ledger' ? '4px 12px' : isPortrait ? '6px 14px' : '8px 18px'}; font-size: ${theme.layoutPreset === 'compact_ledger' ? '10.5px' : isPortrait ? '11.5px' : '12.5px'}; flex: 1; }
  .family-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(105px, 1fr)); gap: 8px; margin-bottom: 10px; }
  .fp-card { border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 6px; text-align: center; background: #ffffff; }
  .fp-card.fp-subj { border-top: 3px solid ${theme.primaryHex}; }
  .fp-card.fp-sire { border-top: 3px solid ${theme.sireHex}; }
  .fp-card.fp-dam { border-top: 3px solid ${theme.damHex}; }
  .fp-img { width: 58px; height: 58px; object-fit: cover; border-radius: 6px; border: 1px solid ${theme.cellBorderHex}; display: block; margin: 0 auto 4px auto; }
  .fp-placeholder { width: 58px; height: 58px; border-radius: 6px; border: 1px dashed ${theme.cellBorderHex}; display: flex; align-items: center; justify-content: center; margin: 0 auto 4px auto; font-weight: bold; font-size: 16px; color: ${theme.mutedInkHex}; }
  .fp-role { font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; text-transform: uppercase; color: ${theme.mutedInkHex}; }
  .fp-name { font-size: 10.5px; font-weight: bold; color: ${theme.inkHex}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fp-sub { font-size: 9px; color: ${theme.mutedInkHex}; }
  .iagarb-panel { border: 1.5px solid ${theme.borderHex}; border-radius: 6px; padding: 7px 10px; margin-bottom: 10px; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  .iag-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 10.5px; border-bottom: 1px solid ${theme.cellBorderHex}; padding-bottom: 4px; margin-bottom: 5px; }
  .iag-status { font-weight: bold; color: ${theme.primaryHex}; }
  .iag-stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 10px; margin-bottom: 6px; }
  .iag-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .iag-pos { border: 1px solid ${theme.cellBorderHex}; border-radius: 4px; padding: 3px 5px; text-align: center; }
  .iag-lbl { font-size: 8.5px; color: ${theme.mutedInkHex}; }
  .iag-val { font-size: 10.5px; font-weight: bold; color: ${theme.inkHex}; margin-top: 1px; }
  .anc-photo-row { display: flex; align-items: flex-start; gap: 6px; }
  .anc-photo { width: 34px; height: 34px; object-fit: cover; border-radius: 4px; border: 1px solid ${theme.cellBorderHex}; flex-shrink: 0; }
  .wool-line { color: ${theme.primaryHex}; font-family: Arial, Helvetica, sans-serif; font-size: 9px; font-weight: bold; margin-top: 1px; }
  table.pedigree { width: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.pedigree thead { display: table-header-group; }
  table.pedigree tr { break-inside: avoid; page-break-inside: avoid; }
  table.pedigree th { background: #ffffff; color: ${theme.primaryHex}; font-size: ${ultraCompactMode ? '8px' : tightMode ? '9.5px' : '12px'}; padding: ${ultraCompactMode ? '3px' : tightMode ? '4px' : '6px'}; text-align: left; border: ${cellBorderCss}; border-bottom: ${theme.borderStyle === 'minimal_lines' ? '1.5px' : '2px'} solid ${theme.borderHex}; }
  td.cell { border: ${cellBorderCss}; padding: ${ultraCompactMode ? '1px 3px' : compactMode ? '2px 4px' : tightMode ? '4px 5px' : '6px 8px'}; vertical-align: middle; font-size: ${ultraCompactMode ? '7.2px' : compactMode ? '8.5px' : tightMode ? '10px' : '11.5px'}; line-height: ${ultraCompactMode ? '1.08' : compactMode ? '1.15' : '1.3'}; word-break: break-word; background: #ffffff; break-inside: avoid; page-break-inside: avoid; }
  td.cell.leaf { padding: 1px 3px; font-size: 6.8px; line-height: 1.05; }
  td.sire { background: #ffffff; border-left: ${ultraCompactMode ? '2px' : '3px'} solid ${theme.sireHex}; }
  td.dam { background: #ffffff; border-left: ${ultraCompactMode ? '2px' : '3px'} solid ${theme.damHex}; }
  td.empty { color: #555555; font-style: italic; background: #ffffff; }
  .name { font-weight: bold; font-size: ${ultraCompactMode ? '7.5px' : compactMode ? '9px' : tightMode ? '11px' : '12.5px'}; color: #111; }
  td.cell.leaf .name { font-size: 7px; }
  .meta { color: #333; font-family: "Courier New", monospace; font-size: ${ultraCompactMode ? '6.8px' : compactMode ? '8px' : tightMode ? '9.5px' : '10.5px'}; }
  .geno { color: ${theme.primaryHex}; font-family: "Courier New", monospace; font-size: ${tightMode ? '9px' : '10px'}; margin-top: 2px; }
  .carrier { color: ${theme.accentHex}; font-family: Arial, Helvetica, sans-serif; font-size: ${compactMode ? '8px' : '9.5px'}; font-weight: 600; margin-top: 2px; line-height: 1.2; }
  .genetics-notice { margin-top: 8px; font-size: 10px; color: ${theme.mutedInkHex}; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  .footer { margin-top: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px; font-size: 11px; color: #333; border-top: 1px solid ${theme.cellBorderHex}; padding-top: 8px; background: #ffffff; }
  .footer-contact { width: 100%; font-size: 10.5px; color: ${theme.primaryHex}; font-weight: bold; }
  @media print {
    body { max-width: none; margin: 0; }
    :root, html, body, .pedigree-frame, .header, .subject-wrap, .family-strip, .fp-card, .iagarb-panel, .iag-pos, table.pedigree, table.pedigree th, td.cell, td.sire, td.dam, td.empty, .genetics-notice, .footer {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      ${preserveColorInk ? '' : 'color: #000000 !important;'}
    }
    * {
      -webkit-print-color-adjust: ${preserveColorInk ? 'exact' : 'economy'} !important;
      print-color-adjust: ${preserveColorInk ? 'exact' : 'economy'} !important;
    }
  }
</style>
</head>
<body>
  <div class="pedigree-frame">
    <div class="header">
      <div class="header-brand">
        ${safeLogo ? `<img class="barn-logo" src="${safeLogo}" alt="${escapeHtml(settings.barnName || 'Barn Logo')}" />` : ''}
        <div>
          <div class="barn-title">${escapeHtml(settings.barnName || 'Community Pedigree')}</div>
          <div class="sub-title">${certSubtitle}${settings.breederName ? ` &middot; Breeder: ${escapeHtml(settings.breederName)}` : ''}</div>
        </div>
      </div>
      <div class="sub-title">Generated ${escapeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))} &middot; Wright COI: ${coi.coiPercent.toFixed(2)}% (${escapeHtml(coi.risk.label)})</div>
    </div>

    <div class="subject-wrap">
      ${safePhoto ? `<img class="subject-photo" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />` : ''}
      <div class="subject-box">
        <div><strong>Name:</strong> ${escapeHtml(subject.name)}</div>
        <div><strong>Tattoo / ID:</strong> ${escapeHtml(subject.tattoo || 'Unmarked')}</div>
        <div><strong>Breed &amp; Variety:</strong> ${escapeHtml(subject.breed)} ${escapeHtml(subject.variety)}</div>
        <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
        <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
        ${showWeights ? `<div><strong>Weight:</strong> ${escapeHtml(formatPedigreeWeight(subject.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation))}</div>` : ''}
        ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
        ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
        ${(() => {
          const subjShow = computeAnimalShowSummary(
            subject,
            printOptions?.shows ?? [],
            printOptions?.careLogs ?? []
          );
          const legDisplay = subjShow.effectiveLegs;
          const parts: string[] = [];
          if (legDisplay > 0 || subjShow.showsEntered > 0) {
            parts.push(`<div><strong>Legs / GC:</strong> ${escapeHtml(subjShow.gcProgress.shortLabel)}</div>`);
          }
          if (subjShow.awardsSummaryText) {
            parts.push(`<div><strong>Show Wins:</strong> ${escapeHtml(subjShow.awardsSummaryText)}</div>`);
          }
          if (subjShow.totalPoints > 0) {
            parts.push(`<div><strong>Show Points:</strong> ${subjShow.totalPoints}</div>`);
          }
          return parts.join('\n        ');
        })()}
        ${subjectWoolLine ? `<div><strong>Wool / Fiber:</strong> ${escapeHtml(subjectWoolLine)}</div>` : ''}
        ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
        ${showGenotypes && subjectGeno ? `<div><strong>Genotype:</strong> <code>${escapeHtml(subjectGeno)}</code></div>` : ''}
        ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
      </div>
    </div>

    ${familyPortraitStripHtml}
    ${iagarbSectionHtml}

    <table class="pedigree">
      <thead>
        <tr>
          ${genHeaders.join('\n          ')}
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml.join('\n        ')}
      </tbody>
    </table>

    ${
      (showGenotypes && (Boolean(subjectGeno) || anyAncestorGeno)) || Boolean(subject.rufusLevel)
        ? `<div class="genetics-notice"><strong>Notice:</strong> Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified).</div>`
        : ''
    }

    ${
      showBreederFooter
        ? `<div class="footer">
      ${breederContactLine ? `<div class="footer-contact">${escapeHtml(breederContactLine)}</div>` : ''}
      <div>I hereby certify that this pedigree is correct to the best of my knowledge and belief.</div>
      <div>Breeder Signature: ___________________________ &nbsp;&nbsp; Date: _______________</div>
    </div>`
        : ''
    }
  </div>
</body>
</html>`;
}

/**
 * Generates a timestamp suffix (`YYYY-MM-DD-HHmmss`) so emergency/pre-delete backups never overwrite prior files.
 */
export function formatTimestampedBackupSlug(date: Date = new Date(nowEpochMs())): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * Exports a single species subset as a valid `BarnDatabaseSnapshot` JSON string for targeted backups.
 */
export function exportSpeciesBackupJson(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string,
  options?: { reason?: SpeciesBackupReason }
): string {
  const speciesProfile = snapshot.speciesProfiles.find((sp) =>
    isSameSpecies(sp.name, speciesName)
  );
  const animals = snapshot.animals.filter((a) => isSameSpecies(a.species, speciesName));
  const animalIds = new Set(animals.map((a) => a.id));
  const animalPhotos = (snapshot.animalPhotos ?? []).filter(
    (p) => isSameSpecies(p.species, speciesName) || animalIds.has(p.animalId)
  );
  const cages = snapshot.cages.filter((c) => isSameSpecies(c.species, speciesName));
  const breedings = snapshot.breedings.filter((b) => isSameSpecies(b.species, speciesName));
  const tasks = snapshot.tasks.filter((t) => isSameSpecies(t.species, speciesName));
  const careLogs = snapshot.careLogs.filter(
    (l) => isSameSpecies(l.species, speciesName) || animalIds.has(l.animalId)
  );
  const shows = snapshot.shows.filter((s) => isSameSpecies(s.species, speciesName));
  const feedBatches = (snapshot.feedBatches ?? []).filter((f) =>
    isSameSpecies(f.species, speciesName)
  );
  const feedAllocations = (snapshot.feedAllocations ?? []).filter((fa) =>
    isSameSpecies(fa.species, speciesName)
  );
  const ledgerEntries = (snapshot.ledgerEntries ?? []).filter((le) =>
    isSameSpecies(le.species, speciesName)
  );
  const processingLogs = (snapshot.processingLogs ?? []).filter((pl) =>
    isSameSpecies(pl.species, speciesName)
  );
  const youthProjectBooks = (snapshot.youthProjectBooks ?? []).filter((yp) =>
    isSameSpecies(yp.species, speciesName)
  );
  const clientContacts = (snapshot.clientContacts ?? []).filter((cc) =>
    isSameSpecies(cc.species, speciesName)
  );
  const waitlistEntries = (snapshot.waitlistEntries ?? []).filter((wl) =>
    isSameSpecies(wl.species, speciesName)
  );
  const animalReservations = (snapshot.animalReservations ?? []).filter((ar) =>
    isSameSpecies(ar.species, speciesName)
  );
  const woolHarvests = (snapshot.woolHarvests ?? []).filter(
    (wh) => isSameSpecies(wh.species, speciesName) || animalIds.has(wh.animalId)
  );

  return exportBarnBackupJson(
    {
      settings: snapshot.settings,
      speciesProfiles: speciesProfile ? [speciesProfile] : [],
      animals,
      animalPhotos,
      cages,
      breedings,
      tasks,
      careLogs,
      shows,
      feedBatches,
      feedAllocations,
      ledgerEntries,
      processingLogs,
      youthProjectBooks,
      clientContacts,
      waitlistEntries,
      animalReservations,
      woolHarvests,
    },
    {
      backupScope: 'species',
      backupReason: options?.reason || 'manual',
      targetSpecies: speciesProfile?.name || speciesName,
    }
  );
}

export interface ThermalCageCardOptions {
  /** Embed a scannable QR code jumping straight to the animal's local PWA profile. */
  includeQrCode?: boolean;
  /** Origin + pathname of the PWA (e.g. `https://example.github.io/Pedigree/`). */
  appBaseUrl?: string;
}

/**
 * Generates a compact printable Cage Card / Bluetooth Thermal Label HTML layout (e.g. 4" x 2.25" label)
 * with an optional scannable QR code pointing straight to the animal's local PWA profile.
 */
export function generateThermalCageCardHtml(
  animal: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  options?: ThermalCageCardOptions
): string {
  const sp = resolveSpeciesProfile(animal.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, animal.species);
  const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
  const dam = animal.damId ? herdById.get(animal.damId) : undefined;
  const geno = animal.genotypeRaw || formatGenotypeArray(animal.genotype);
  const shouldIncludeQr = options?.includeQrCode !== false && Boolean(options?.appBaseUrl);
  const profileUrl = shouldIncludeQr
    ? buildAnimalProfileDeepLink(options?.appBaseUrl, animal)
    : '';
  const qrSvg = profileUrl
    ? renderQrSvg(profileUrl, {
        sizePx: 74,
        quietZone: 2,
        ariaLabel: `QR code to open ${animal.name || animal.tattoo || 'animal'} profile`,
        className: 'qr-svg',
      })
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>Cage Card - ${escapeHtml(animal.tattoo || animal.name)}</title>
<style>
  @page { size: 4in 2.25in; margin: 0.12in; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #000000; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 8px; }
  .card { border: 2px solid #000; padding: 8px 10px; max-width: 3.75in; background: #ffffff; color: #000000; }
  .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #000; padding-bottom: 4px; gap: 8px; }
  .tattoo { font-family: "Courier New", monospace; font-size: 18px; font-weight: bold; }
  .cage { font-family: "Courier New", monospace; font-size: 12px; font-weight: bold; text-align: right; }
  .content { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-top: 4px; }
  .details { flex: 1; min-width: 0; }
  .name { font-size: 14.5px; font-weight: bold; line-height: 1.15; }
  .row { font-size: 10.5px; margin-top: 3px; display: flex; justify-content: space-between; gap: 6px; flex-wrap: wrap; }
  .mono { font-family: "Courier New", monospace; font-size: 10px; margin-top: 4px; border-top: 1px solid #cccccc; padding-top: 3px; }
  .qr-box { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid #cccccc; padding: 2px; background: #ffffff; }
  .qr-svg { display: block; width: 72px; height: 72px; }
  .qr-cap { font-family: "Courier New", monospace; font-size: 7px; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; color: #111111; }
  @media print {
    :root, html, body, .card, .qr-box {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * {
      -webkit-print-color-adjust: economy !important;
      print-color-adjust: economy !important;
    }
  }
</style>
</head>
<body>
  <div class="card">
    <div class="top">
      <span class="tattoo">${escapeHtml(animal.tattoo || 'NO-ID')}</span>
      <span class="cage">${escapeHtml(animal.cageLocation || settings.barnName)}</span>
    </div>
    <div class="content">
      <div class="details">
        <div class="name">${escapeHtml(animal.name)}</div>
        <div class="row">
          <span>${escapeHtml(animal.breed)} ${escapeHtml(animal.variety)}</span>
          <span><strong>${escapeHtml(formatSexForSpecies(animal.sex, sp))}</strong> &middot; DOB: ${escapeHtml(animal.birthDateIso || 'N/A')}</span>
        </div>
        <div class="row">
          <span>Sire: ${escapeHtml(sire ? `${sire.name} (${sire.tattoo})` : 'Unknown')}</span>
        </div>
        <div class="row">
          <span>Dam: ${escapeHtml(dam ? `${dam.name} (${dam.tattoo})` : 'Unknown')}</span>
        </div>
      </div>
      ${
        qrSvg
          ? `<div class="qr-box" data-qr-url="${escapeHtml(profileUrl)}">
              ${qrSvg}
              <span class="qr-cap">Scan Profile</span>
            </div>`
          : ''
      }
    </div>
    <div class="mono">
      Wt: ${escapeHtml(formatWeight(animal.weightGrams, resolveSpeciesWeightUnit(sp, settings)))}
      ${animal.registrationNumber ? ` | Reg: ${escapeHtml(animal.registrationNumber)}` : ''}
      ${geno ? ` | ${escapeHtml(geno)} (genetics in dev)` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Canonical normalized DTO projection preparing 100% of user-entered records for
 * structured JSON reporting and PDF document generation.
 */
export interface PdfReadyBarnReport {
  barnName: string;
  breederName: string;
  exportedAtIsoUtc: string;
  filterSpecies: string | null;
  totalAnimals: number;
  openTasksCount: number;
  activeBreedingsCount: number;
  animals: Array<{
    id: string;
    species: string;
    tattoo: string;
    name: string;
    sexLabel: string;
    breedAndVariety: string;
    birthDateFormatted: string;
    weightFormatted: string;
    coiPercent: string;
    genotype: string;
    carrierDisclosures: string;
    cageLocation: string;
    ownershipType: string;
    culled: boolean;
    soldDateIso: string;
    salePriceCents: number;
    deceasedDateIso: string;
    deathCause: string;
    sireSummary: string;
    damSummary: string;
  }>;
}

export function buildPdfReadyBarnSnapshot(
  snapshot: BarnDatabaseSnapshot,
  filterSpecies?: string
): PdfReadyBarnReport {
  const scopedAnimals = filterSpecies
    ? snapshot.animals.filter((a) => isSameSpecies(a.species, filterSpecies))
    : snapshot.animals;
  const scopedTasks = filterSpecies
    ? snapshot.tasks.filter((t) => isSameSpecies(t.species, filterSpecies))
    : snapshot.tasks;
  const scopedBreedings = filterSpecies
    ? snapshot.breedings.filter((b) => isSameSpecies(b.species, filterSpecies))
    : snapshot.breedings;

  const speciesCache = new Map<
    string,
    {
      sp: SpeciesProfile;
      herdMap: Map<string, Animal>;
      evalCoi: ReturnType<typeof createSpeciesCoiEvaluator>;
    }
  >();
  const getSpeciesCtx = (speciesName: string) => {
    const key = (speciesName || '').trim().toLowerCase();
    let cached = speciesCache.get(key);
    if (!cached) {
      const sp = resolveSpeciesProfile(speciesName, snapshot.speciesProfiles);
      const herdMap = buildSpeciesHerdMap(snapshot.animals, speciesName);
      const evalCoi = createSpeciesCoiEvaluator(herdMap);
      cached = { sp, herdMap, evalCoi };
      speciesCache.set(key, cached);
    }
    return cached;
  };

  return {
    barnName: snapshot.settings.barnName,
    breederName: snapshot.settings.breederName,
    exportedAtIsoUtc: nowIsoUtc(),
    filterSpecies: filterSpecies || null,
    totalAnimals: scopedAnimals.length,
    openTasksCount: scopedTasks.filter((t) => !t.completed).length,
    activeBreedingsCount: scopedBreedings.filter((b) =>
      ['Planned', 'Bred', 'Palpated Positive', 'Born'].includes(b.status)
    ).length,
    animals: scopedAnimals.map((a) => {
      const { sp, herdMap, evalCoi } = getSpeciesCtx(a.species);
      const coi = evalCoi.calculateAnimalCoi(a);
      const sire = a.sireId ? herdMap.get(a.sireId) : undefined;
      const dam = a.damId ? herdMap.get(a.damId) : undefined;
      return {
        id: a.id,
        species: a.species,
        tattoo: a.tattoo,
        name: a.name,
        sexLabel: formatSexForSpecies(a.sex, sp),
        breedAndVariety: `${a.breed} ${a.variety}`.trim(),
        birthDateFormatted: formatReadableDate(a.birthDateIso),
        weightFormatted: formatWeight(a.weightGrams, resolveSpeciesWeightUnit(sp, snapshot.settings)),
        coiPercent: `${coi.coiPercent.toFixed(2)}%`,
        genotype: a.genotypeRaw || formatGenotypeArray(a.genotype),
        carrierDisclosures: formatCompactCarrierDisclosure(a, {
          herdById: herdMap,
          includeCleared: true,
          includeLineage: true,
        }),
        cageLocation: a.cageLocation,
        ownershipType: normalizeOwnershipType(a.ownershipType, 'Owned'),
        culled: Boolean(a.culled),
        soldDateIso: a.soldDateIso || '',
        salePriceCents: a.salePriceCents || 0,
        deceasedDateIso: a.deceasedDateIso || '',
        deathCause: a.deathCause || '',
        sireSummary: sire ? `${sire.name} (${sire.tattoo})` : 'Unknown',
        damSummary: dam ? `${dam.name} (${dam.tattoo})` : 'Unknown',
      };
    }),
  };
}
```

## `src/core/syncOutbox.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Field-Level Multi-Worker Sync & Conflict Resolution Engine (`src/core/syncOutbox.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls.
 *
 * Implements:
 * - Immutable append-only operation outbox (`SyncOperation` entries keyed by `op_id`)
 * - Additive set-union semantics for grow-only barn logs (breedings, weights/care logs, shows)
 * - Field-level merging so Worker A editing weight + Worker B editing cage location merge cleanly
 * - Deterministic `timestamp + logical_counter + device_id` tie-breaking with non-destructive
 *   audit entries in `sync_conflicts` whenever two devices collide on the exact same field.
 */

import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  CageLocation,
  CareLog,
  ClientContact,
  FeedAllocation,
  FeedBatch,
  generateUuid,
  LedgerEntry,
  normalizeBreedScheduleOverrides,
  nowIsoUtc,
  ProcessingLog,
  ShowEvent,
  SpeciesProfile,
  WaitlistEntry,
  WoolHarvest,
  YouthProjectBook,
} from './models';
import { normalizeShowResults, mergeEnteredAnimalIdsWithResults } from './showResults';
import { sanitizeSpeciesMemo } from './speciesMemo';
import {
  isValidSyncOperation,
  MAX_DELTA_OPERATIONS,
  sanitizeCustomColors,
  sanitizeSafeRasterImageDataUrl,
} from './inputSanitization';

export type SyncEntityType =
  | 'animal'
  | 'breeding'
  | 'task'
  | 'careLog'
  | 'show'
  | 'cage'
  | 'species'
  | 'settings'
  | 'photo'
  | 'feedBatch'
  | 'feedAllocation'
  | 'ledgerEntry'
  | 'processingLog'
  | 'youthProjectBook'
  | 'clientContact'
  | 'waitlistEntry'
  | 'animalReservation'
  | 'woolHarvest';

export interface SyncOperation {
  op_id: string;
  entity_type: SyncEntityType;
  entity_uuid: string;
  device_id: string;
  timestamp: string; // ISO-8601 UTC
  logical_counter: number;
  /** Optional per-record monotonic revision counter protecting sequential edits against device clock rewinds. */
  record_rev?: number;
  field_name: string; // '__create__', '__delete__', or a specific property name
  new_value: unknown;
}

export interface SyncConflictEntry {
  conflict_id: string;
  entity_type: SyncEntityType;
  entity_uuid: string;
  entity_label: string;
  field_name: string;
  winning_value: unknown;
  winning_device_id: string;
  winning_timestamp: string;
  losing_value: unknown;
  losing_device_id: string;
  losing_timestamp: string;
  detected_at: string;
  resolved: boolean;
}

export interface DeltaExportFile {
  format: 'community-pedigree-delta-v1';
  device_id: string;
  exported_at: string;
  operations: SyncOperation[];
}

export function createOutboxOperation(params: {
  entityType: SyncEntityType;
  entityUuid: string;
  deviceId: string;
  logicalCounter: number;
  fieldName: string;
  newValue: unknown;
  timestamp?: string;
  recordRev?: number;
}): SyncOperation {
  const op: SyncOperation = {
    op_id: generateUuid(),
    entity_type: params.entityType,
    entity_uuid: params.entityUuid,
    device_id: params.deviceId,
    timestamp: params.timestamp || nowIsoUtc(),
    logical_counter: params.logicalCounter,
    field_name: params.fieldName,
    new_value: params.newValue,
  };
  if (typeof params.recordRev === 'number' && Number.isFinite(params.recordRev) && params.recordRev >= 0) {
    op.record_rev = Math.floor(params.recordRev);
  }
  return op;
}

/**
 * Deterministic total ordering of operations across multiple offline devices.
 */
export function compareSyncOperations(a: SyncOperation, b: SyncOperation): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
  if (a.logical_counter !== b.logical_counter) {
    return a.logical_counter - b.logical_counter;
  }
  if (a.device_id !== b.device_id) return a.device_id < b.device_id ? -1 : 1;
  if (a.op_id !== b.op_id) return a.op_id < b.op_id ? -1 : 1;
  return 0;
}

/**
 * Ordering for two operations targeting the EXACT same `(entity_type, entity_uuid)`.
 * When both carry monotonic `record_rev` numbers that differ, the higher revision
 * always wins even if one device's local wall-clock was rewound backward.
 */
export function compareSameEntitySyncOperations(a: SyncOperation, b: SyncOperation): number {
  if (
    a.entity_type === b.entity_type &&
    a.entity_uuid === b.entity_uuid &&
    typeof a.record_rev === 'number' &&
    Number.isFinite(a.record_rev) &&
    typeof b.record_rev === 'number' &&
    Number.isFinite(b.record_rev) &&
    a.record_rev !== b.record_rev
  ) {
    return a.record_rev - b.record_rev;
  }
  return compareSyncOperations(a, b);
}

/**
 * Returns the next monotonic `_rev` integer for a mutated record.
 */
export function bumpRecordRevision(previous?: { _rev?: number } | null): number {
  const prevRev =
    previous && typeof previous._rev === 'number' && Number.isFinite(previous._rev) && previous._rev >= 0
      ? Math.floor(previous._rev)
      : 0;
  return prevRev + 1;
}

/**
 * Computes fine-grained field-level `SyncOperation` diffs between two versions of a plain entity.
 */
export function diffEntityFieldsToOperations<T extends { id: string; _rev?: number }>(params: {
  entityType: SyncEntityType;
  previous: T | undefined;
  next: T;
  deviceId: string;
  nextCounter: () => number;
  ignoreFields?: string[];
  timestamp?: string;
  recordRev?: number;
}): SyncOperation[] {
  const ops: SyncOperation[] = [];
  const ignore = new Set(['updatedAt', 'createdAt', '_rev', ...(params.ignoreFields || [])]);
  const ts = params.timestamp || nowIsoUtc();
  const explicitRev =
    typeof params.recordRev === 'number' && Number.isFinite(params.recordRev)
      ? Math.floor(params.recordRev)
      : typeof params.next._rev === 'number' && Number.isFinite(params.next._rev)
      ? Math.floor(params.next._rev)
      : bumpRecordRevision(params.previous);

  if (!params.previous) {
    ops.push(
      createOutboxOperation({
        entityType: params.entityType,
        entityUuid: params.next.id,
        deviceId: params.deviceId,
        logicalCounter: params.nextCounter(),
        fieldName: '__create__',
        newValue: params.next,
        timestamp: ts,
        recordRev: explicitRev,
      })
    );
    return ops;
  }

  const keys = new Set([
    ...Object.keys(params.previous as Record<string, unknown>),
    ...Object.keys(params.next as Record<string, unknown>),
  ]);

  for (const key of keys) {
    if (ignore.has(key)) continue;
    const prevVal = (params.previous as Record<string, unknown>)[key];
    const nextVal = (params.next as Record<string, unknown>)[key];
    if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) {
      ops.push(
        createOutboxOperation({
          entityType: params.entityType,
          entityUuid: params.next.id,
          deviceId: params.deviceId,
          logicalCounter: params.nextCounter(),
          fieldName: key,
          newValue: nextVal,
          timestamp: ts,
          recordRev: explicitRev,
        })
      );
    }
  }
  return ops;
}

/**
 * Strips base64 image payloads from an `AnimalPhoto` so delta/folder sync queues
 * only lightweight photo metadata while large image blobs travel via `.ZIP` backups.
 */
export function stripPhotoBlobsForSync(photo: AnimalPhoto): AnimalPhoto {
  return {
    ...photo,
    dataUrl: '',
    thumbnailDataUrl: '',
  };
}

/**
 * Computes field-level and create/delete `SyncOperation` entries across all synced
 * snapshot collections when transitioning from `previous` to `next` (for bulk operations
 * such as cross-species migrations). Photo diffs always ignore image blob fields.
 */
export function diffSnapshotsToSyncOperations(params: {
  previous: BarnDatabaseSnapshot;
  next: BarnDatabaseSnapshot;
  deviceId: string;
  nextCounter: () => number;
  timestamp?: string;
  includeSettings?: boolean;
}): SyncOperation[] {
  const ts = params.timestamp || nowIsoUtc();
  const ops: SyncOperation[] = [];

  const diffCollection = <T extends { id: string; _rev?: number }>(
    entityType: Exclude<SyncEntityType, 'settings'>,
    prevList: T[],
    nextList: T[]
  ) => {
    const prevById = new Map<string, T>(prevList.map((item) => [item.id, item]));
    const nextById = new Map<string, T>(nextList.map((item) => [item.id, item]));
    const ignoreFields =
      entityType === 'photo'
        ? ['dataUrl', 'thumbnailDataUrl']
        : entityType === 'ledgerEntry'
        ? ['receiptPhotoDataUrl', 'receiptPhotoThumbnailDataUrl']
        : undefined;

    for (const nextItem of nextList) {
      const prevItem = prevById.get(nextItem.id);
      const safeNext =
        !prevItem && entityType === 'photo'
          ? (stripPhotoBlobsForSync(nextItem as unknown as AnimalPhoto) as unknown as T)
          : !prevItem && entityType === 'ledgerEntry'
          ? ({
              ...(nextItem as unknown as LedgerEntry),
              receiptPhotoDataUrl: '',
              receiptPhotoThumbnailDataUrl: '',
            } as unknown as T)
          : nextItem;
      const rev =
        typeof nextItem._rev === 'number' && Number.isFinite(nextItem._rev)
          ? Math.floor(nextItem._rev)
          : bumpRecordRevision(prevItem);

      ops.push(
        ...diffEntityFieldsToOperations({
          entityType,
          previous: prevItem,
          next: safeNext,
          deviceId: params.deviceId,
          nextCounter: params.nextCounter,
          ignoreFields,
          timestamp: ts,
          recordRev: rev,
        })
      );
    }

    for (const prevItem of prevList) {
      if (!nextById.has(prevItem.id)) {
        ops.push(
          createOutboxOperation({
            entityType,
            entityUuid: prevItem.id,
            deviceId: params.deviceId,
            logicalCounter: params.nextCounter(),
            fieldName: '__delete__',
            newValue: true,
            timestamp: ts,
            recordRev: bumpRecordRevision(prevItem),
          })
        );
      }
    }
  };

  diffCollection('species', params.previous.speciesProfiles, params.next.speciesProfiles);
  diffCollection('animal', params.previous.animals, params.next.animals);
  diffCollection('photo', params.previous.animalPhotos ?? [], params.next.animalPhotos ?? []);
  diffCollection('cage', params.previous.cages, params.next.cages);
  diffCollection('breeding', params.previous.breedings, params.next.breedings);
  diffCollection('task', params.previous.tasks, params.next.tasks);
  diffCollection('careLog', params.previous.careLogs, params.next.careLogs);
  diffCollection('show', params.previous.shows, params.next.shows);
  diffCollection('feedBatch', params.previous.feedBatches ?? [], params.next.feedBatches ?? []);
  diffCollection('feedAllocation', params.previous.feedAllocations ?? [], params.next.feedAllocations ?? []);
  diffCollection('ledgerEntry', params.previous.ledgerEntries ?? [], params.next.ledgerEntries ?? []);
  diffCollection('processingLog', params.previous.processingLogs ?? [], params.next.processingLogs ?? []);
  diffCollection('youthProjectBook', params.previous.youthProjectBooks ?? [], params.next.youthProjectBooks ?? []);
  diffCollection('clientContact', params.previous.clientContacts ?? [], params.next.clientContacts ?? []);
  diffCollection('waitlistEntry', params.previous.waitlistEntries ?? [], params.next.waitlistEntries ?? []);
  diffCollection('animalReservation', params.previous.animalReservations ?? [], params.next.animalReservations ?? []);
  diffCollection('woolHarvest', params.previous.woolHarvests ?? [], params.next.woolHarvests ?? []);

  if (params.includeSettings) {
    ops.push(
      ...diffEntityFieldsToOperations({
        entityType: 'settings',
        previous: params.previous.settings,
        next: params.next.settings,
        deviceId: params.deviceId,
        nextCounter: params.nextCounter,
        ignoreFields: [
          'lastBackupMeta',
          'backupReminderSnoozedUntilMs',
          'autoOffloadRetiredToOpfs',
        ],
        timestamp: ts,
        recordRev: bumpRecordRevision(params.previous.settings),
      })
    );
  }

  return ops;
}

export interface DeltaMergeResult {
  nextSnapshot: BarnDatabaseSnapshot;
  mergedOperations: SyncOperation[];
  newConflicts: SyncConflictEntry[];
  appliedOpCount: number;
}

function labelForEntity(
  type: SyncEntityType,
  uuid: string,
  snapshot: BarnDatabaseSnapshot
): string {
  if (type === 'animal') {
    const a = snapshot.animals.find((x) => x.id === uuid);
    return a ? `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}` : uuid;
  }
  if (type === 'breeding') {
    const b = snapshot.breedings.find((x) => x.id === uuid);
    return b ? `${b.damName} × ${b.sireName}` : uuid;
  }
  if (type === 'task') {
    const t = snapshot.tasks.find((x) => x.id === uuid);
    return t ? t.title : uuid;
  }
  if (type === 'species') {
    const s = snapshot.speciesProfiles.find((x) => x.id === uuid);
    return s ? s.name : uuid;
  }
  if (type === 'feedBatch') {
    const f = (snapshot.feedBatches ?? []).find((x) => x.id === uuid);
    return f ? `${f.brand ? `${f.brand} ` : ''}${f.productName}${f.lotNumber ? ` (Lot ${f.lotNumber})` : ''}` : uuid;
  }
  if (type === 'feedAllocation') {
    const fa = (snapshot.feedAllocations ?? []).find((x) => x.id === uuid);
    return fa ? `${fa.targetLabel || fa.targetType} (${fa.quantity} ${fa.unit})` : uuid;
  }
  if (type === 'ledgerEntry') {
    const le = (snapshot.ledgerEntries ?? []).find((x) => x.id === uuid);
    return le ? le.title : uuid;
  }
  if (type === 'processingLog') {
    const pl = (snapshot.processingLogs ?? []).find((x) => x.id === uuid);
    return pl ? pl.title : uuid;
  }
  if (type === 'youthProjectBook') {
    const yp = (snapshot.youthProjectBooks ?? []).find((x) => x.id === uuid);
    return yp ? yp.projectTitle : uuid;
  }
  if (type === 'clientContact') {
    const cc = (snapshot.clientContacts ?? []).find((x) => x.id === uuid);
    return cc ? cc.fullName : uuid;
  }
  if (type === 'waitlistEntry') {
    const wl = (snapshot.waitlistEntries ?? []).find((x) => x.id === uuid);
    return wl ? `${wl.clientName || 'Waitlist'} (#${wl.priorityRank})` : uuid;
  }
  if (type === 'animalReservation') {
    const ar = (snapshot.animalReservations ?? []).find((x) => x.id === uuid);
    return ar ? `${ar.agreementNumber || ar.clientName || uuid}` : uuid;
  }
  if (type === 'woolHarvest') {
    const wh = (snapshot.woolHarvests ?? []).find((x) => x.id === uuid);
    return wh ? `Wool Harvest (${wh.harvestDateIso})` : uuid;
  }
  if (type === 'settings') return 'Barn Settings';
  return uuid;
}

function getCollectionMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, { ...item }]));
}

/**
 * Replays incoming worker delta operations into `localSnapshot` at the individual FIELD level.
 * Additive logs (`__create__` on careLogs, breedings, tasks, shows, animals, cages, photos)
 * merge non-destructively via set union; distinct field edits merge cleanly; and exact
 * same-field collisions across two distinct workers log a reversible `SyncConflictEntry`.
 */
export function mergeDeltaOperations(
  localSnapshot: BarnDatabaseSnapshot,
  existingOps: SyncOperation[],
  incomingOps: SyncOperation[],
  _localDeviceId: string
): DeltaMergeResult {
  if (incomingOps.length > MAX_DELTA_OPERATIONS) {
    throw new Error(
      `Delta sync payload contains ${incomingOps.length.toLocaleString()} operations, exceeding the rational limit of ${MAX_DELTA_OPERATIONS.toLocaleString()}. Import a full backup .ZIP instead.`
    );
  }

  const byOpId = new Map<string, SyncOperation>();
  for (const op of existingOps) {
    if (isValidSyncOperation(op)) byOpId.set(op.op_id, op);
  }

  const unseenIncoming: SyncOperation[] = [];
  for (const op of incomingOps) {
    if (!isValidSyncOperation(op)) continue;
    if (!byOpId.has(op.op_id)) {
      byOpId.set(op.op_id, op);
      unseenIncoming.push(op);
    }
  }

  if (unseenIncoming.length === 0) {
    return {
      nextSnapshot: localSnapshot,
      mergedOperations: Array.from(byOpId.values()).sort(compareSyncOperations),
      newConflicts: [],
      appliedOpCount: 0,
    };
  }

  const allOpsSorted = Array.from(byOpId.values()).sort(compareSyncOperations);

  const animals = getCollectionMap<Animal>(localSnapshot.animals);
  const photos = getCollectionMap<AnimalPhoto>(localSnapshot.animalPhotos ?? []);
  const cages = getCollectionMap<CageLocation>(localSnapshot.cages);
  const breedings = getCollectionMap<BreedingRecord>(localSnapshot.breedings);
  const tasks = getCollectionMap<BarnTask>(localSnapshot.tasks);
  const careLogs = getCollectionMap<CareLog>(localSnapshot.careLogs);
  const shows = getCollectionMap<ShowEvent>(localSnapshot.shows);
  const feedBatches = getCollectionMap<FeedBatch>(localSnapshot.feedBatches ?? []);
  const feedAllocations = getCollectionMap<FeedAllocation>(localSnapshot.feedAllocations ?? []);
  const ledgerEntries = getCollectionMap<LedgerEntry>(localSnapshot.ledgerEntries ?? []);
  const processingLogs = getCollectionMap<ProcessingLog>(localSnapshot.processingLogs ?? []);
  const youthProjectBooks = getCollectionMap<YouthProjectBook>(localSnapshot.youthProjectBooks ?? []);
  const clientContacts = getCollectionMap<ClientContact>(localSnapshot.clientContacts ?? []);
  const waitlistEntries = getCollectionMap<WaitlistEntry>(localSnapshot.waitlistEntries ?? []);
  const animalReservations = getCollectionMap<AnimalReservation>(localSnapshot.animalReservations ?? []);
  const woolHarvests = getCollectionMap<WoolHarvest>(localSnapshot.woolHarvests ?? []);
  const speciesProfiles = getCollectionMap<SpeciesProfile>(localSnapshot.speciesProfiles);
  let settings: BarnSettings = { ...localSnapshot.settings };

  // Track the winning op per (entity_type, entity_uuid, field_name) to detect collisions
  const lastFieldOp = new Map<string, SyncOperation>();
  for (const op of existingOps) {
    const key = `${op.entity_type}::${op.entity_uuid}::${op.field_name}`;
    const prev = lastFieldOp.get(key);
    if (!prev || compareSameEntitySyncOperations(prev, op) < 0) {
      lastFieldOp.set(key, op);
    }
  }

  const newConflicts: SyncConflictEntry[] = [];
  const unseenSorted = [...unseenIncoming].sort((a, b) =>
    a.entity_type === b.entity_type && a.entity_uuid === b.entity_uuid
      ? compareSameEntitySyncOperations(a, b)
      : compareSyncOperations(a, b)
  );

  for (const op of unseenSorted) {
    const fieldKey = `${op.entity_type}::${op.entity_uuid}::${op.field_name}`;
    const existingFieldOp = lastFieldOp.get(fieldKey);

    // Check if there was a concurrent edit on the EXACT same field from a different device
    if (
      existingFieldOp &&
      op.field_name !== '__create__' &&
      op.field_name !== '__delete__' &&
      existingFieldOp.device_id !== op.device_id &&
      JSON.stringify(existingFieldOp.new_value) !== JSON.stringify(op.new_value)
    ) {
      // Only raise conflict if timestamps are within 7 days of independent offline edits
      // and neither operation strictly supersedes the other via sequential `_rev`
      const msA = Date.parse(existingFieldOp.timestamp) || 0;
      const msB = Date.parse(op.timestamp) || 0;
      const sequentialSupersede =
        typeof existingFieldOp.record_rev === 'number' &&
        typeof op.record_rev === 'number' &&
        existingFieldOp.record_rev !== op.record_rev &&
        Math.abs(existingFieldOp.record_rev - op.record_rev) > 0;
      if (Math.abs(msA - msB) <= 7 * 86400_000 || sequentialSupersede) {
        const opWins = compareSameEntitySyncOperations(existingFieldOp, op) < 0;
        const winner = opWins ? op : existingFieldOp;
        const loser = opWins ? existingFieldOp : op;
        newConflicts.push({
          conflict_id: generateUuid(),
          entity_type: op.entity_type,
          entity_uuid: op.entity_uuid,
          entity_label: labelForEntity(op.entity_type, op.entity_uuid, localSnapshot),
          field_name: op.field_name,
          winning_value: winner.new_value,
          winning_device_id: winner.device_id,
          winning_timestamp: winner.timestamp,
          losing_value: loser.new_value,
          losing_device_id: loser.device_id,
          losing_timestamp: loser.timestamp,
          detected_at: nowIsoUtc(),
          resolved: false,
        });
      }
    }

    // Only apply if this operation beats any already-recorded op for the exact same field
    if (existingFieldOp && compareSameEntitySyncOperations(op, existingFieldOp) < 0 && op.field_name !== '__create__') {
      continue;
    }
    lastFieldOp.set(fieldKey, op);

    const applyToMap = <T extends { id: string; updatedAt: string; _rev?: number }>(map: Map<string, T>) => {
      if (op.field_name === '__create__' && op.new_value && typeof op.new_value === 'object') {
        if (!map.has(op.entity_uuid)) {
          const clone: Record<string, unknown> = { ...(op.new_value as Record<string, unknown>), id: op.entity_uuid };
          if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
            clone._rev = Math.max(Number(clone._rev) || 0, Math.floor(op.record_rev));
          }
          if (op.entity_type === 'photo') {
            const rawData = typeof clone.dataUrl === 'string' ? clone.dataUrl.trim() : '';
            const rawThumb =
              typeof clone.thumbnailDataUrl === 'string' ? clone.thumbnailDataUrl.trim() : '';
            if (rawData) {
              const safeData = sanitizeSafeRasterImageDataUrl(rawData);
              if (!safeData) return;
              clone.dataUrl = safeData;
              clone.thumbnailDataUrl =
                (rawThumb ? sanitizeSafeRasterImageDataUrl(rawThumb) : '') || safeData;
            } else if (rawThumb) {
              const safeThumb = sanitizeSafeRasterImageDataUrl(rawThumb);
              if (!safeThumb) return;
              clone.dataUrl = safeThumb;
              clone.thumbnailDataUrl = safeThumb;
            } else {
              clone.dataUrl = '';
              clone.thumbnailDataUrl = '';
            }
          }
          if (op.entity_type === 'show') {
            const cleanResults = normalizeShowResults(clone.results, { dropEmpty: false });
            clone.results = cleanResults.length > 0 ? cleanResults : undefined;
            clone.enteredAnimalIds = mergeEnteredAnimalIdsWithResults(
              Array.isArray(clone.enteredAnimalIds) ? (clone.enteredAnimalIds as string[]) : [],
              cleanResults
            );
          }
          map.set(op.entity_uuid, clone as unknown as T);
        }
        return;
      }
      if (op.field_name === '__delete__') {
        map.delete(op.entity_uuid);
        return;
      }
      const target = map.get(op.entity_uuid);
      if (target) {
        let nextVal = op.new_value;
        if (
          op.entity_type === 'photo' &&
          (op.field_name === 'dataUrl' || op.field_name === 'thumbnailDataUrl')
        ) {
          const safeUrl = sanitizeSafeRasterImageDataUrl(nextVal);
          if (!safeUrl) return;
          nextVal = safeUrl;
        } else if (op.entity_type === 'show' && op.field_name === 'results') {
          const cleanResults = normalizeShowResults(nextVal, { dropEmpty: false });
          nextVal = cleanResults.length > 0 ? cleanResults : undefined;
        }
        (target as Record<string, unknown>)[op.field_name] = nextVal;
        target.updatedAt = op.timestamp;
        if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
          target._rev = Math.max(target._rev ?? 0, Math.floor(op.record_rev));
        }
      }
    };

    switch (op.entity_type) {
      case 'animal':
        applyToMap(animals);
        break;
      case 'photo':
        applyToMap(photos);
        break;
      case 'cage':
        applyToMap(cages);
        break;
      case 'breeding':
        applyToMap(breedings);
        break;
      case 'task':
        applyToMap(tasks);
        break;
      case 'careLog':
        applyToMap(careLogs);
        break;
      case 'show':
        applyToMap(shows);
        break;
      case 'feedBatch':
        applyToMap(feedBatches);
        break;
      case 'feedAllocation':
        applyToMap(feedAllocations);
        break;
      case 'ledgerEntry':
        applyToMap(ledgerEntries);
        break;
      case 'processingLog':
        applyToMap(processingLogs);
        break;
      case 'youthProjectBook':
        applyToMap(youthProjectBooks);
        break;
      case 'clientContact':
        applyToMap(clientContacts);
        break;
      case 'waitlistEntry':
        applyToMap(waitlistEntries);
        break;
      case 'animalReservation':
        applyToMap(animalReservations);
        break;
      case 'woolHarvest':
        applyToMap(woolHarvests);
        break;
      case 'species':
        applyToMap(speciesProfiles);
        break;
      case 'settings':
        if (op.field_name !== '__create__' && op.field_name !== '__delete__') {
          const nextSettingsVal =
            op.field_name === 'customColors'
              ? sanitizeCustomColors(op.new_value)
              : op.new_value;
          (settings as unknown as Record<string, unknown>)[op.field_name] = nextSettingsVal;
          settings.updatedAt = op.timestamp;
          if (typeof op.record_rev === 'number' && Number.isFinite(op.record_rev)) {
            settings._rev = Math.max(settings._rev ?? 0, Math.floor(op.record_rev));
          }
        }
        break;
    }
  }

  return {
    nextSnapshot: {
      settings,
      speciesProfiles: Array.from(speciesProfiles.values())
        .map((sp) => ({
          ...sp,
          memoText: sanitizeSpeciesMemo(sp.memoText),
          memoUpdatedAt: typeof sp.memoUpdatedAt === 'string' ? sp.memoUpdatedAt : '',
          breedOverrides: normalizeBreedScheduleOverrides(sp.breedOverrides),
        }))
        .sort(
          (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.name.localeCompare(b.name)
        ),
      animals: Array.from(animals.values()),
      animalPhotos: Array.from(photos.values()),
      cages: Array.from(cages.values()),
      breedings: Array.from(breedings.values()),
      tasks: Array.from(tasks.values()),
      careLogs: Array.from(careLogs.values()),
      shows: Array.from(shows.values()),
      feedBatches: Array.from(feedBatches.values()),
      feedAllocations: Array.from(feedAllocations.values()),
      ledgerEntries: Array.from(ledgerEntries.values()),
      processingLogs: Array.from(processingLogs.values()),
      youthProjectBooks: Array.from(youthProjectBooks.values()),
      clientContacts: Array.from(clientContacts.values()),
      waitlistEntries: Array.from(waitlistEntries.values()),
      animalReservations: Array.from(animalReservations.values()),
      woolHarvests: Array.from(woolHarvests.values()),
    },
    mergedOperations: allOpsSorted,
    newConflicts,
    appliedOpCount: unseenIncoming.length,
  };
}
```

<!-- END OF PART 11 OF 16 (13 files) -->
