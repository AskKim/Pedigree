/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic OCR Line & Field Extraction Pipeline (`@features/ocr-parser/ocrTextPipeline.ts`).
 *
 * Groups raw OCR text or 2D word bounding boxes into ordered visual lines and extracts
 * typed field values from schema-driven regex extraction rules.
 * Zero domain terms, zero DOM dependencies, zero cross-feature imports.
 */

import { sanitizePlainText, sanitizeSingleLineText } from '@engine/primitives';
import type { IFeatureModule } from '../featureModule.interface';

export interface OcrBoundingBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface OcrWordToken {
  readonly text: string;
  readonly bbox: OcrBoundingBox;
  readonly confidence?: number;
}

export interface OcrTextLine {
  readonly index: number;
  readonly text: string;
  readonly bbox: OcrBoundingBox;
  readonly words: readonly OcrWordToken[];
}

export interface OcrZoneBounds {
  readonly xMin?: number;
  readonly xMax?: number;
  readonly yMin?: number;
  readonly yMax?: number;
}

export interface OcrFieldExtractionRule<TFieldKey extends string = string> {
  readonly key: TFieldKey;
  readonly patterns: readonly RegExp[];
  readonly zone?: OcrZoneBounds;
  readonly normalize?: (captured: string, lineText: string) => string;
}

export interface OcrExtractionOutput<TFieldKey extends string = string> {
  readonly normalizedText: string;
  readonly lines: readonly string[];
  readonly extractedFields: Partial<Record<TFieldKey, string>>;
  readonly unmatchedLines: readonly string[];
}

function isPointInsideZone(bbox: OcrBoundingBox, zone?: OcrZoneBounds): boolean {
  if (!zone) return true;
  const cx = (bbox.x0 + bbox.x1) / 2;
  const cy = (bbox.y0 + bbox.y1) / 2;
  if (zone.xMin !== undefined && cx < zone.xMin) return false;
  if (zone.xMax !== undefined && cx > zone.xMax) return false;
  if (zone.yMin !== undefined && cy < zone.yMin) return false;
  if (zone.yMax !== undefined && cy > zone.yMax) return false;
  return true;
}

/**
 * Clusters 2D OCR word bounding boxes into visually aligned, reading-order text lines.
 *
 * @param words Raw word tokens with bounding box coordinates
 * @param lineMergeTolerancePx Vertical distance tolerance to consider words on the same line
 * @returns Ordered array of OcrTextLine objects
 */
export function groupWordBoxesIntoLines(
  words: readonly OcrWordToken[],
  lineMergeTolerancePx = 10
): OcrTextLine[] {
  const cleaned = words
    .map((w) => ({ ...w, text: sanitizeSingleLineText(w.text, 200) }))
    .filter((w) => w.text.length > 0)
    .sort((a, b) => {
      const ay = (a.bbox.y0 + a.bbox.y1) / 2;
      const by = (b.bbox.y0 + b.bbox.y1) / 2;
      if (Math.abs(ay - by) > lineMergeTolerancePx) {
        return ay - by;
      }
      return a.bbox.x0 - b.bbox.x0;
    });

  const groups: OcrWordToken[][] = [];
  for (const word of cleaned) {
    const wy = (word.bbox.y0 + word.bbox.y1) / 2;
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([word]);
      continue;
    }
    const avgY =
      lastGroup.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) /
      lastGroup.length;
    if (Math.abs(wy - avgY) <= lineMergeTolerancePx) {
      lastGroup.push(word);
    } else {
      groups.push([word]);
    }
  }

  return groups.map((group, idx) => {
    const ordered = group.slice().sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const bbox: OcrBoundingBox = {
      x0: Math.min(...ordered.map((w) => w.bbox.x0)),
      y0: Math.min(...ordered.map((w) => w.bbox.y0)),
      x1: Math.max(...ordered.map((w) => w.bbox.x1)),
      y1: Math.max(...ordered.map((w) => w.bbox.y1)),
    };
    return {
      index: idx,
      text: ordered.map((w) => w.text).join(' '),
      bbox,
      words: ordered,
    };
  });
}

/**
 * Parses raw text or visual 2D lines and extracts typed field keys based on schema regex rules.
 *
 * @param rawText Raw unformatted OCR output string
 * @param rules Schema-driven extraction rules (patterns, optional bounding zones, normalizers)
 * @param wordBoxes Optional array of word bounding boxes for geometric zoning
 * @returns OcrExtractionOutput containing normalizedText, lines, extractedFields, and unmatchedLines
 */
export function extractStructuredFieldsFromOcr<TFieldKey extends string = string>(
  rawText: string,
  rules: readonly OcrFieldExtractionRule<TFieldKey>[],
  wordBoxes?: readonly OcrWordToken[]
): OcrExtractionOutput<TFieldKey> {
  const normalizedText = sanitizePlainText(rawText, 120_000);
  const visualLines =
    wordBoxes && wordBoxes.length > 0 ? groupWordBoxesIntoLines(wordBoxes) : [];

  const textLines =
    visualLines.length > 0
      ? visualLines.map((l) => l.text)
      : normalizedText
          .split('\n')
          .map((l) => sanitizeSingleLineText(l, 500))
          .filter((l) => l.length > 0);

  const extractedFields: Partial<Record<TFieldKey, string>> = Object.create(null);
  const matchedLineIndexes = new Set<number>();

  for (const rule of rules) {
    if (extractedFields[rule.key] !== undefined) continue;
    for (let i = 0; i < textLines.length; i += 1) {
      if (visualLines[i] && rule.zone && !isPointInsideZone(visualLines[i].bbox, rule.zone)) {
        continue;
      }
      const lineText = textLines[i];
      let matchedValue: string | null = null;
      for (const regex of rule.patterns) {
        const hit = lineText.match(regex);
        if (hit) {
          const captured = (hit[1] ?? hit[0] ?? '').trim();
          if (captured) {
            matchedValue = rule.normalize ? rule.normalize(captured, lineText) : captured;
            break;
          }
        }
      }
      if (matchedValue) {
        extractedFields[rule.key] = matchedValue;
        matchedLineIndexes.add(i);
        break;
      }
    }
  }

  const unmatchedLines = textLines.filter((_, idx) => !matchedLineIndexes.has(idx));

  return {
    normalizedText,
    lines: textLines,
    extractedFields,
    unmatchedLines,
  };
}

export function createOcrParserFeatureModule(): IFeatureModule<
  { lineMergeTolerancePx?: number },
  { ready: boolean; lineMergeTolerancePx: number }
> {
  let ready = false;
  let lineMergeTolerancePx = 10;

  return {
    metadata: {
      id: 'ocr-parser',
      name: 'OCR Line & Field Extraction Pipeline',
      version: '1.0.0',
      description: 'Content-agnostic 2D word-box grouping and pattern extraction pipeline.',
    },
    async initialize(context) {
      if (typeof context.config?.lineMergeTolerancePx === 'number') {
        lineMergeTolerancePx = context.config.lineMergeTolerancePx;
      }
      ready = true;
    },
    async dispose() {
      ready = false;
    },
    getStateSnapshot() {
      return { ready, lineMergeTolerancePx };
    },
  };
}
