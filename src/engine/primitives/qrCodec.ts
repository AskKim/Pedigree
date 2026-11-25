/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Content-Agnostic ISO/IEC 18004 QR Code Generator & Query Deep-Link Codec
 * (`@engine/primitives/qrCodec.ts`).
 *
 * Generates 100% offline, zero-dependency scannable QR codes (Versions 1–14, Byte mode,
 * EC Level M with automatic EC-L fallback for long URLs) as crisp single-path inline `<svg>`
 * strings suitable for thermal labels, print sheets, and on-screen previews.
 *
 * Zero DOM, zero Node built-ins, zero domain terminology.
 */

import { escapeSafeHtml } from './sanitization';

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

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

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

  pushBits(0b0100, 4);
  pushBits(payload.length, spec.version <= 9 ? 8 : 16);
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }

  const terminatorLen = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) {
    bits.push(0);
  }
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

  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

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

  const centers = ALIGNMENT_CENTERS[version] ?? [];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
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
  setFunctionModule(size - 8, 8, true);

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
  const ecBits = ecLevel === 'L' ? 0b01 : 0b00;
  const data = (ecBits << 3) | (mask & 0x7);
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;

  const bitAt = (idx: number) => ((bits >>> idx) & 1) !== 0;

  for (let i = 0; i <= 5; i++) modules[8][i] = bitAt(14 - i);
  modules[8][7] = bitAt(8);
  modules[8][8] = bitAt(7);
  modules[7][8] = bitAt(6);
  for (let i = 0; i <= 5; i++) modules[5 - i][8] = bitAt(5 - i);

  for (let i = 0; i < 7; i++) modules[size - 1 - i][8] = bitAt(14 - i);
  for (let i = 0; i < 8; i++) modules[8][size - 8 + i] = bitAt(7 - i);
}

function computePenaltyScore(modules: boolean[][]): number {
  const size = modules.length;
  let penalty = 0;

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
  return (appBaseUrl || '').trim().split(/[?#]/)[0];
}

/**
 * Builds a query-parameterized deep link URL from any base URL and ordered key/value entries.
 */
export function buildQueryDeepLink(
  baseUrl: string | undefined,
  entries: ReadonlyArray<readonly [string, string | undefined]>
): string {
  const base = normalizeAppBaseUrl(baseUrl);
  if (!base) return '';
  const params: string[] = [];
  for (const [key, rawVal] of entries) {
    const cleanKey = key.trim();
    const cleanVal = (rawVal || '').trim();
    if (!cleanKey || !cleanVal) continue;
    params.push(`${encodeURIComponent(cleanKey)}=${encodeURIComponent(cleanVal)}`);
  }
  return params.length > 0 ? `${base}?${params.join('&')}` : base;
}

/**
 * Pure parser for URL query strings (`?route=records&id=...`) into a first-wins key/value map.
 */
export function parseQueryDeepLinkParams(search: string | undefined | null): Map<string, string> {
  const raw = (search || '').trim().replace(/^\?/, '');
  const map = new Map<string, string>();
  if (!raw) return map;

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

  return map;
}
