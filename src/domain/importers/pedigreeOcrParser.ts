/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Paper Pedigree OCR Parser & Import Review Queue Bridge
 * (`src/domain/importers/pedigreeOcrParser.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 *
 * Parses raw OCR text + optional 2D word bounding boxes (from Tesseract.js, Chromium
 * `TextDetector`, or extracted searchable PDF text operators) into an editable 15-slot
 * 3-generation pedigree draft (`Subject` + `Sire`/`Dam` + `PGS`/`PGD`/`MGS`/`MGD` +
 * `SSS`..`DDD`), extracting ancestor names, ear tattoos/IDs, weights, birth dates,
 * varieties/breeds, and ARBA registration / Grand Champion numbers directly into
 * `PlatformImportPreview` for the Import Review Queue.
 */

import { parseGenotypeString } from '../geneticsEngine';
import { sanitizePlainText, sanitizeSingleLineText } from '../inputSanitization';
import {
  Animal,
  BarnDatabaseSnapshot,
  BiologicalSex,
  formatWeight,
  isSameSpecies,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  SpeciesProfile,
  WeightUnit,
} from '../models';
import { normalizeFlexibleDateIso, parseFlexibleWeightToGrams } from './archiveAndCsvUtils';
import {
  AnimalImportConflict,
  buildAnimalContradictions,
  findPreexistingAnimalMatch,
  PreexistingAnimalMatch,
} from './conflictResolver';
import {
  PlatformImportPreview,
  StagedImportedPhoto,
} from './importerTypes';

export type PedigreeOcrSlotKey =
  | 'subject'
  | 'sire'
  | 'dam'
  | 'pgs'
  | 'pgd'
  | 'mgs'
  | 'mgd'
  | 'sss'
  | 'ssd'
  | 'sds'
  | 'sdd'
  | 'dss'
  | 'dsd'
  | 'dds'
  | 'ddd';

export interface PedigreeOcrSlotDescriptor {
  key: PedigreeOcrSlotKey;
  label: string;
  shortLabel: string;
  generation: 0 | 1 | 2 | 3;
  slotIndex: number;
  defaultSex: BiologicalSex;
  childKey: PedigreeOcrSlotKey | null;
  linkSide: 'sire' | 'dam' | null;
}

export const PEDIGREE_OCR_SLOT_DESCRIPTORS: readonly PedigreeOcrSlotDescriptor[] = [
  {
    key: 'subject',
    label: 'Subject Animal',
    shortLabel: 'Subject',
    generation: 0,
    slotIndex: 0,
    defaultSex: 'Unknown',
    childKey: null,
    linkSide: null,
  },
  {
    key: 'sire',
    label: 'Sire (Father · Gen 1)',
    shortLabel: 'Sire',
    generation: 1,
    slotIndex: 0,
    defaultSex: 'Male',
    childKey: 'subject',
    linkSide: 'sire',
  },
  {
    key: 'dam',
    label: 'Dam (Mother · Gen 1)',
    shortLabel: 'Dam',
    generation: 1,
    slotIndex: 1,
    defaultSex: 'Female',
    childKey: 'subject',
    linkSide: 'dam',
  },
  {
    key: 'pgs',
    label: "Paternal Grandsire (Sire's Sire · Gen 2)",
    shortLabel: 'PGS',
    generation: 2,
    slotIndex: 0,
    defaultSex: 'Male',
    childKey: 'sire',
    linkSide: 'sire',
  },
  {
    key: 'pgd',
    label: "Paternal Granddam (Sire's Dam · Gen 2)",
    shortLabel: 'PGD',
    generation: 2,
    slotIndex: 1,
    defaultSex: 'Female',
    childKey: 'sire',
    linkSide: 'dam',
  },
  {
    key: 'mgs',
    label: "Maternal Grandsire (Dam's Sire · Gen 2)",
    shortLabel: 'MGS',
    generation: 2,
    slotIndex: 2,
    defaultSex: 'Male',
    childKey: 'dam',
    linkSide: 'sire',
  },
  {
    key: 'mgd',
    label: "Maternal Granddam (Dam's Dam · Gen 2)",
    shortLabel: 'MGD',
    generation: 2,
    slotIndex: 3,
    defaultSex: 'Female',
    childKey: 'dam',
    linkSide: 'dam',
  },
  {
    key: 'sss',
    label: "Sire's Sire's Sire (Gen 3)",
    shortLabel: 'SSS',
    generation: 3,
    slotIndex: 0,
    defaultSex: 'Male',
    childKey: 'pgs',
    linkSide: 'sire',
  },
  {
    key: 'ssd',
    label: "Sire's Sire's Dam (Gen 3)",
    shortLabel: 'SSD',
    generation: 3,
    slotIndex: 1,
    defaultSex: 'Female',
    childKey: 'pgs',
    linkSide: 'dam',
  },
  {
    key: 'sds',
    label: "Sire's Dam's Sire (Gen 3)",
    shortLabel: 'SDS',
    generation: 3,
    slotIndex: 2,
    defaultSex: 'Male',
    childKey: 'pgd',
    linkSide: 'sire',
  },
  {
    key: 'sdd',
    label: "Sire's Dam's Dam (Gen 3)",
    shortLabel: 'SDD',
    generation: 3,
    slotIndex: 3,
    defaultSex: 'Female',
    childKey: 'pgd',
    linkSide: 'dam',
  },
  {
    key: 'dss',
    label: "Dam's Sire's Sire (Gen 3)",
    shortLabel: 'DSS',
    generation: 3,
    slotIndex: 4,
    defaultSex: 'Male',
    childKey: 'mgs',
    linkSide: 'sire',
  },
  {
    key: 'dsd',
    label: "Dam's Sire's Dam (Gen 3)",
    shortLabel: 'DSD',
    generation: 3,
    slotIndex: 5,
    defaultSex: 'Female',
    childKey: 'mgs',
    linkSide: 'dam',
  },
  {
    key: 'dds',
    label: "Dam's Dam's Sire (Gen 3)",
    shortLabel: 'DDS',
    generation: 3,
    slotIndex: 6,
    defaultSex: 'Male',
    childKey: 'mgd',
    linkSide: 'sire',
  },
  {
    key: 'ddd',
    label: "Dam's Dam's Dam (Gen 3)",
    shortLabel: 'DDD',
    generation: 3,
    slotIndex: 7,
    defaultSex: 'Female',
    childKey: 'mgd',
    linkSide: 'dam',
  },
];

export interface OcrWordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence?: number;
}

export interface OcrScannedPageInput {
  pageIndex?: number;
  sourceFileName: string;
  rawText: string;
  imageWidth?: number;
  imageHeight?: number;
  words?: OcrWordBox[];
  confidence?: number;
  engine?: string;
}

export interface PedigreeOcrSlotDraft {
  slotKey: PedigreeOcrSlotKey;
  label: string;
  shortLabel: string;
  generation: 0 | 1 | 2 | 3;
  name: string;
  tattoo: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  weightText: string;
  weightGrams: number;
  breed: string;
  variety: string;
  birthDateIso: string;
  genotypeRaw: string;
  sex: BiologicalSex;
  notes: string;
  confidence: number;
  rawSnippet: string;
  included: boolean;
}

export interface PedigreeOcrParseResult {
  slots: PedigreeOcrSlotDraft[];
  detectedSpecies: string;
  detectedBreed: string;
  sanitizedRawText: string;
  layoutMode: 'bounding_box_tree' | 'line_heuristic' | 'manual_empty';
  populatedSlotCount: number;
  warnings: string[];
}

function slugifyKey(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h1 ^= input.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}

function deterministicOcrEntityId(species: string, seed: string): string {
  return `ocr-${slugifyKey(species)}-${stableHash(seed.trim().toLowerCase())}`;
}

export function createEmptyPedigreeOcrSlots(defaultBreed = ''): PedigreeOcrSlotDraft[] {
  return PEDIGREE_OCR_SLOT_DESCRIPTORS.map((desc) => ({
    slotKey: desc.key,
    label: desc.label,
    shortLabel: desc.shortLabel,
    generation: desc.generation,
    name: '',
    tattoo: '',
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    weightText: '',
    weightGrams: 0,
    breed: defaultBreed,
    variety: '',
    birthDateIso: '',
    genotypeRaw: '',
    sex: desc.defaultSex,
    notes: '',
    confidence: 0,
    rawSnippet: '',
    included: false,
  }));
}

function normalizeSexLoose(
  raw: string | undefined,
  fallback: BiologicalSex = 'Unknown'
): BiologicalSex {
  const s = (raw || '').trim().toLowerCase();
  if (!s) return fallback;
  if (
    /^(?:m|male|buck|ram|bull|boar|stallion|stud|rooster|cock|drake|gander|tom|billy|jack|hob|dog|sire)$/.test(
      s
    ) ||
    /\b(?:male|buck|ram|bull|boar|stallion|sire)\b/.test(s)
  ) {
    return 'Male';
  }
  if (
    /^(?:f|female|doe|ewe|cow|heifer|sow|gilt|mare|hen|duck|goose|queen|nanny|jenny|jill|bitch|dam)$/.test(
      s
    ) ||
    /\b(?:female|doe|ewe|cow|heifer|sow|mare|dam)\b/.test(s)
  ) {
    return 'Female';
  }
  return fallback;
}

function detectSpeciesFromOcrText(
  rawText: string,
  fileName: string,
  fallbackSpecies = 'Rabbit'
): string {
  const combined = `${fileName} ${rawText.slice(0, 2500)}`.toLowerCase();
  for (const preset of PREDEFINED_SPECIES_PRESETS) {
    if (combined.includes(preset.name.toLowerCase())) {
      return preset.name;
    }
  }
  if (
    /\b(?:arba|kindling|hutch|holland lop|mini rex|netherland dwarf|lionhead|new zealand|californian|flemish giant|english angora|french angora|satin)\b/.test(
      combined
    )
  ) {
    return 'Rabbit';
  }
  if (/\b(?:cavy|cavies|guinea pig|abyssinian|american cavy|peruvian|silkie|teddy)\b/.test(combined)) {
    return 'Guinea Pig';
  }
  if (/\b(?:kidding|adga|nigerian dwarf|boer|nubian|lamancha|alpine|saanen|wether)\b/.test(combined)) {
    return 'Goat';
  }
  if (/\b(?:lambing|ewe|ram|suffolk|dorper|katahdin|hampshire)\b/.test(combined)) {
    return 'Sheep';
  }
  if (/\b(?:calving|heifer|bull|steer|angus|hereford|holstein|simmental)\b/.test(combined)) {
    return 'Cattle';
  }
  if (/\b(?:farrowing|boar|sow|gilt|berkshire|duroc|yorkshire|kunekune)\b/.test(combined)) {
    return 'Swine / Pig';
  }
  return fallbackSpecies || 'Rabbit';
}

function parseOcrWeightSegment(
  raw: string,
  preferredUnit: WeightUnit = 'lbs_oz'
): { weightGrams: number; weightText: string } {
  const clean = raw.trim();
  if (!clean) return { weightGrams: 0, weightText: '' };

  // Handle ARBA lbs-oz shorthand like "4# 8oz", "4 lb 8 oz", "4 lbs. 8 oz.", "4 lb 8"
  const lbOzBare = clean.match(
    /^(\d+(?:\.\d+)?)\s*(?:#|lbs?\.?|pounds?)\s*(\d+(?:\.\d+)?)\s*(?:oz\.?|ounces?)?$/i
  );
  if (lbOzBare) {
    const lbs = Number(lbOzBare[1]);
    const oz = Number(lbOzBare[2]);
    if (Number.isFinite(lbs) && Number.isFinite(oz) && lbs >= 0 && oz >= 0 && oz < 16) {
      const grams = Math.round((lbs + oz / 16) * 453.59237);
      return { weightGrams: grams, weightText: formatWeight(grams, preferredUnit) };
    }
  }

  // Handle ARBA dot/dash notation like "4.08#" or "4-8#"
  const dotPound = clean.match(/^(\d{1,2})[-.](\d{1,2})\s*(?:#|lbs?\.?)$/i);
  if (dotPound) {
    const lbs = Number(dotPound[1]);
    const oz = Number(dotPound[2]);
    if (Number.isFinite(lbs) && Number.isFinite(oz) && oz >= 0 && oz < 16) {
      const grams = Math.round((lbs + oz / 16) * 453.59237);
      return { weightGrams: grams, weightText: formatWeight(grams, preferredUnit) };
    }
  }

  const grams = parseFlexibleWeightToGrams(clean);
  if (grams > 0) {
    return { weightGrams: grams, weightText: formatWeight(grams, preferredUnit) };
  }
  return { weightGrams: 0, weightText: '' };
}

function isUnknownPlaceholderLine(line: string): boolean {
  return /^(?:unknown|none|n\/a|na|-|—|\?|(?:buck|doe|sire|dam|ram|ewe|bull|cow|boar|sow|stallion|mare|male|female)\s*(?:-|—|:)?\s*unknown)$/i.test(
    line.trim()
  );
}

function isBoilerplatePedigreeLine(line: string): boolean {
  const s = line.trim();
  if (!s) return true;
  if (/^[_=\-|*•·.]{2,}$/.test(s)) return true;
  if (
    /^(?:pedigree(?:\s+certificate)?|certificate\s+of\s+pedigree|official\s+(?:\d+-generation\s+)?pedigree(?:\s*\(.*\))?|parents\s*(?:\(gen\s*1\))?|grandparents\s*(?:\(gen\s*2\))?|great[- ]?grandparents\s*(?:\(gen\s*3\))?|gen(?:eration)?\s*[1-8]|page\s*\d+(?:\s*of\s*\d+)?|community\s+pedigree|arba\s+pedigree|i\s+hereby\s+certify\b.*|breeder\s+signature\s*:.*|notice\s*:\s*color\s+genetics\b.*|printed\s+\d{4}.*|wright\s+coi\s*:.*)$/i.test(
      s
    )
  ) {
    return true;
  }
  return false;
}

const ROLE_PREFIX_REGEX =
  /^(?:subject(?:\s+animal)?|animal|sire'?s\s+sire'?s\s+sire|sire'?s\s+sire'?s\s+dam|sire'?s\s+dam'?s\s+sire|sire'?s\s+dam'?s\s+dam|dam'?s\s+sire'?s\s+sire|dam'?s\s+sire'?s\s+dam|dam'?s\s+dam'?s\s+sire|dam'?s\s+dam'?s\s+dam|sire'?s\s+sire|sire'?s\s+dam|dam'?s\s+sire|dam'?s\s+dam|paternal\s+grand(?:sire|dam)|maternal\s+grand(?:sire|dam)|sire|dam|pgs|pgd|mgs|mgd|sss|ssd|sds|sdd|dss|dsd|dds|ddd)\s*(?:\([^)]*\))?\s*[:\-–—]\s*/i;

/**
 * Extracts structured animal fields (name, ear tattoo/ID, ARBA registration #, GC #,
 * legs, weight, variety, breed, DOB, genotype, sex) from an OCR block's text lines.
 */
export function parsePedigreeSlotLines(
  lines: string[],
  defaultSex: BiologicalSex,
  preferredUnit: WeightUnit = 'lbs_oz'
): {
  name: string;
  tattoo: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  weightText: string;
  weightGrams: number;
  breed: string;
  variety: string;
  birthDateIso: string;
  genotypeRaw: string;
  sex: BiologicalSex;
  notes: string;
  isUnknown: boolean;
} {
  const cleanedLines = lines
    .map((l) => sanitizeSingleLineText(l, 260))
    .filter((l) => l.length > 0 && !isBoilerplatePedigreeLine(l));

  if (cleanedLines.length === 0 || cleanedLines.every(isUnknownPlaceholderLine)) {
    return {
      name: '',
      tattoo: '',
      registrationNumber: '',
      grandChampionNumber: '',
      legsCount: 0,
      weightText: '',
      weightGrams: 0,
      breed: '',
      variety: '',
      birthDateIso: '',
      genotypeRaw: '',
      sex: defaultSex,
      notes: '',
      isUnknown: true,
    };
  }

  let name = '';
  let tattoo = '';
  let registrationNumber = '';
  let grandChampionNumber = '';
  let legsCount = 0;
  let weightGrams = 0;
  let weightText = '';
  let breed = '';
  let variety = '';
  let birthDateIso = '';
  let genotypeRaw = '';
  let sex: BiologicalSex = defaultSex;
  const extraParts: string[] = [];

  for (let lineIdx = 0; lineIdx < cleanedLines.length; lineIdx++) {
    let line = cleanedLines[lineIdx];
    if (lineIdx === 0) {
      line = line.replace(ROLE_PREFIX_REGEX, '').trim();
    }

    // Split inline metadata separators (·, |, •, ;) OR multi-label spacing
    const segments = line
      .split(/\s*[·|•;]\s*/)
      .map((t) => t.trim())
      .filter(Boolean);

    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      let tok = segments[segIdx];

      // Extract inline labeled fields from compound lines like "Ear: OR-101 Reg: 4412A Wt: 4# 8oz"
      const inlineMatches: Array<{ end: number }> = [];
      const inlineFieldRegex =
        /\b(name|animal|ear(?:\s*tag|\s*no\.?|\s*#)?|tattoo\s*(?:\/|\s+)?id|tattoo|tat\.?|id|arba\s*reg(?:\.|istration)?(?:\s*no\.?|\s*#)?|reg(?:\.|istration)?(?:\s*no\.?|\s*#)?|gc(?:\s*no\.?|\s*#)?|grand\s*champ(?:ion)?(?:\s*no\.?|\s*#)?|legs?|wt\.?|weight|dob|born|kindled|whelped|birth\s*date|breed\s*(?:&|and)\s*var(?:iety)?|breed|var(?:iety)?|color|coat|geno(?:type)?|sex)(?:\s*[:#=]\s*|\s+(?=\S))/gi;

      const labelHits: Array<{ key: string; start: number; valStart: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = inlineFieldRegex.exec(tok)) !== null) {
        // Avoid matching short tokens mid-sentence without explicit ':'/'#'/'=' punctuation
        const keyLower = m[1].toLowerCase().trim();
        const hasPunct = /[:#=]/.test(m[0].slice(m[1].length));
        if (m.index > 0 && !hasPunct && /^(?:name|animal|id|ear|gc|color|coat|var|legs?)$/i.test(keyLower)) {
          continue;
        }
        // Avoid splitting "GC: GC-88" inside its own value
        const prevSlice = tok.slice(Math.max(0, m.index - 6), m.index);
        if (/[:#=]\s*$/.test(prevSlice)) {
          continue;
        }
        labelHits.push({
          key: keyLower,
          start: m.index,
          valStart: m.index + m[0].length,
        });
      }
      void inlineMatches;

      if (labelHits.length >= 2) {
        // Leading unlabelled portion before first label is likely the name
        const leadingText = tok.slice(0, labelHits[0].start).trim();
        if (leadingText && !name && lineIdx === 0 && segIdx === 0) {
          name = leadingText.replace(/^(?:name|animal)\s*[:\-]\s*/i, '').trim();
        }
        const subTokens: string[] = [];
        for (let k = 0; k < labelHits.length; k++) {
          const end = k + 1 < labelHits.length ? labelHits[k + 1].start : tok.length;
          const chunk = tok.slice(labelHits[k].start, end).trim();
          if (chunk) subTokens.push(chunk);
        }
        segments.splice(segIdx, 1, ...subTokens);
        tok = segments[segIdx];
      }

      // Explicit "Name:" or "Animal:" label overrides any banner header line
      const explicitNameMatch = tok.match(/^(?:name|animal)\s*[:=\-]\s*(.+)$/i);
      if (explicitNameMatch) {
        const val = sanitizeSingleLineText(explicitNameMatch[1], 140);
        if (val && !isUnknownPlaceholderLine(val)) {
          name = val;
        }
        continue;
      }

      if (
        lineIdx === 0 &&
        segIdx === 0 &&
        !name &&
        !/^(?:name|animal|id|ear(?:\s*tag|\s*no\.?|\s*#)?|tattoo|tat\.?|dob|born|kindled|birth|reg|arba\s*reg|gc|grand\s*champ|legs?|wt|weight|breed|var|variety|color|sex|geno|wright|printed)\b/i.test(
          tok
        )
      ) {
        name = tok.trim();
        continue;
      }

      // Ear tattoo / ID (supports "Tattoo/ID: OC-99" and "ID: OS-10")
      const idMatch = tok.match(
        /^(?:tattoo\s*(?:\/|\s+)?id|ear(?:\s*tag|\s*no\.?|\s*#)?|tattoo|tat\.?|id)(?:\s*[:#=\-]+\s*|\s+)(.+)$/i
      );
      if (idMatch && !tattoo) {
        const val = sanitizeSingleLineText(idMatch[1], 60);
        if (val && !isUnknownPlaceholderLine(val)) tattoo = val;
        continue;
      }

      // ARBA Registration #
      const regMatch = tok.match(
        /^(?:arba\s*)?(?:reg(?:istration)?(?:\s*no\.?|\s*#)?)(?:\s*[:#=\-]+\s*|\s+)(.+)$/i
      );
      if (regMatch && !registrationNumber) {
        const val = sanitizeSingleLineText(regMatch[1], 60);
        if (val && !isUnknownPlaceholderLine(val)) registrationNumber = val;
        continue;
      }

      // Grand Champion #
      const gcMatch = tok.match(
        /^(?:g\.?\s*c\.?|grand\s*champ(?:ion)?(?:\s*no\.?|\s*#)?)(?:\s*[:#=\-]+\s*|\s+)(.+)$/i
      );
      if (gcMatch && !grandChampionNumber) {
        const val = sanitizeSingleLineText(gcMatch[1], 60);
        if (val && !isUnknownPlaceholderLine(val)) grandChampionNumber = val;
        continue;
      }

      // Legs
      const legsLabelMatch = tok.match(/^legs?(?:\s*[:#=\-]+\s*|\s+)(\d{1,2})\b/i);
      const legsTrailingMatch = tok.match(/^(\d{1,2})\s*(?:arba\s*)?legs?\b/i);
      if (legsLabelMatch || legsTrailingMatch) {
        const count = Number((legsLabelMatch || legsTrailingMatch)![1]);
        if (Number.isFinite(count) && count >= 0 && count <= 50) {
          legsCount = Math.max(legsCount, count);
        }
        continue;
      }

      // Birth date
      const dobMatch = tok.match(
        /^(?:dob|born|kindled|whelped|birth(?:\s*date)?)(?:\s*[:=\-]+\s*|\s+)(.+)$/i
      );
      if (dobMatch && !birthDateIso) {
        birthDateIso = normalizeFlexibleDateIso(dobMatch[1]);
        continue;
      }

      // Weight (explicit label)
      const wtMatch = tok.match(/^(?:wt\.?|weight)(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (wtMatch && weightGrams === 0) {
        const parsedWt = parseOcrWeightSegment(wtMatch[1], preferredUnit);
        if (parsedWt.weightGrams > 0) {
          weightGrams = parsedWt.weightGrams;
          weightText = parsedWt.weightText;
          continue;
        }
      }

      // Inline unlabeled weight (e.g. "4# 8oz", "4 lbs 8 oz", "8.5 lbs", "3.2 kg")
      if (
        weightGrams === 0 &&
        /^\d+(?:\.\d+)?\s*(?:#|lbs?\.?|pounds?|oz\.?|ounces?|kg|grams?|gm?)\b/i.test(tok)
      ) {
        const parsedWt = parseOcrWeightSegment(tok, preferredUnit);
        if (parsedWt.weightGrams > 0) {
          weightGrams = parsedWt.weightGrams;
          weightText = parsedWt.weightText;
          continue;
        }
      }

      // Breed & Variety combined (e.g. "Breed & Variety: Holland Lop Broken Tort")
      const breedVarMatch = tok.match(/^breed\s*(?:&|and)\s*var(?:iety)?\s*[:=\-]+\s*(.+)$/i);
      if (breedVarMatch) {
        const val = sanitizeSingleLineText(breedVarMatch[1], 120);
        if (val && !variety) variety = val;
        continue;
      }

      // Breed
      const breedMatch = tok.match(/^breed(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (breedMatch && !breed) {
        breed = sanitizeSingleLineText(breedMatch[1], 100);
        continue;
      }

      // Variety / Color
      const varMatch = tok.match(/^(?:var(?:iety)?|color|coat)(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (varMatch && !variety) {
        variety = sanitizeSingleLineText(varMatch[1], 100);
        continue;
      }

      // Genotype
      const genoMatch = tok.match(/^geno(?:type)?(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (genoMatch && !genotypeRaw) {
        genotypeRaw = sanitizeSingleLineText(genoMatch[1], 120);
        continue;
      }

      // Sex
      const sexMatch = tok.match(/^sex(?:\s*[:=\-]+\s*|\s+)(.+)$/i);
      if (sexMatch) {
        sex = normalizeSexLoose(sexMatch[1], defaultSex);
        continue;
      }

      // Inline unlabeled ARBA date like "03/14/2024" or "2024-03-14"
      if (!birthDateIso && /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/. -]\d{1,2}[/. -]\d{2,4})$/.test(tok)) {
        const iso = normalizeFlexibleDateIso(tok);
        if (iso) {
          birthDateIso = iso;
          continue;
        }
      }

      // Heuristic unlabelled variety on line >= 1 (alphabetic color words like "Broken Tort", "Chestnut Agouti")
      if (
        !variety &&
        lineIdx > 0 &&
        tok.length >= 3 &&
        tok.length <= 42 &&
        !/\d/.test(tok) &&
        !isUnknownPlaceholderLine(tok)
      ) {
        variety = tok;
        continue;
      }

      if (tok && tok !== name) {
        extraParts.push(tok);
      }
    }
  }

  // Extract trailing parenthetical tattoo if embedded in name, e.g. "Oakridge Barnaby (OR-101)"
  const parenTag = name.match(/^(.+?)\s*\(([A-Za-z0-9#-]{2,20})\)\s*$/);
  if (parenTag) {
    const tagInsideParens = parenTag[2].trim();
    if (!tattoo) {
      name = parenTag[1].trim();
      tattoo = tagInsideParens;
    } else if (tattoo.toLowerCase() === tagInsideParens.toLowerCase()) {
      name = parenTag[1].trim();
    }
  }

  // Extract inline "Reg # ..." or "Wt ..." appended onto the name line without delimiter
  const inlineRegOnName = name.match(/\b(?:arba\s*)?reg\.?\s*#?\s*([A-Z0-9\-]{3,16})\b/i);
  if (inlineRegOnName && !registrationNumber) {
    registrationNumber = inlineRegOnName[1].trim();
    name = name.replace(inlineRegOnName[0], '').trim();
  }

  const finalName = sanitizeSingleLineText(name || tattoo || '', 140);
  const hasAnyUsefulData = Boolean(
    finalName || tattoo || registrationNumber || grandChampionNumber || weightGrams > 0 || variety
  );

  return {
    name: finalName,
    tattoo,
    registrationNumber,
    grandChampionNumber,
    legsCount,
    weightText,
    weightGrams,
    breed,
    variety,
    birthDateIso,
    genotypeRaw,
    sex,
    notes: extraParts.length > 0 ? sanitizePlainText(extraParts.join(' · '), 500) : '',
    isUnknown: !hasAnyUsefulData,
  };
}

interface TextFragment {
  text: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  xCenter: number;
  yCenter: number;
  confidence: number;
}

function buildLineFragmentsFromWords(
  words: OcrWordBox[],
  pageWidth: number
): TextFragment[] {
  const valid = words
    .map((w) => ({
      text: sanitizeSingleLineText(w.text, 120),
      x0: Number(w.x0) || 0,
      y0: Number(w.y0) || 0,
      x1: Number(w.x1) || 0,
      y1: Number(w.y1) || 0,
      confidence: typeof w.confidence === 'number' ? w.confidence : 75,
    }))
    .filter((w) => w.text.length > 0 && w.x1 >= w.x0 && w.y1 >= w.y0);

  if (valid.length === 0) return [];

  const heights = valid
    .map((w) => Math.max(4, w.y1 - w.y0))
    .sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 14;
  const rowTol = Math.max(5, medianH * 0.65);

  const sortedByY = [...valid].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  const rowBuckets: typeof valid[] = [];
  for (const w of sortedByY) {
    const wy = (w.y0 + w.y1) / 2;
    const bucket = rowBuckets[rowBuckets.length - 1];
    if (bucket) {
      const by =
        bucket.reduce((acc, item) => acc + (item.y0 + item.y1) / 2, 0) / bucket.length;
      if (Math.abs(wy - by) <= rowTol) {
        bucket.push(w);
        continue;
      }
    }
    rowBuckets.push([w]);
  }

  const xGapThreshold = Math.max(medianH * 2.4, pageWidth * 0.038);
  const fragments: TextFragment[] = [];

  for (const row of rowBuckets) {
    row.sort((a, b) => a.x0 - b.x0);
    let currentWords = [row[0]];
    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1];
      const curr = row[i];
      if (curr.x0 - prev.x1 > xGapThreshold) {
        fragments.push(mergeFragmentWords(currentWords));
        currentWords = [curr];
      } else {
        currentWords.push(curr);
      }
    }
    fragments.push(mergeFragmentWords(currentWords));
  }

  return fragments.filter((f) => !isBoilerplatePedigreeLine(f.text));
}

function mergeFragmentWords(words: Array<{
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}>): TextFragment {
  const x0 = Math.min(...words.map((w) => w.x0));
  const y0 = Math.min(...words.map((w) => w.y0));
  const x1 = Math.max(...words.map((w) => w.x1));
  const y1 = Math.max(...words.map((w) => w.y1));
  const avgConf =
    words.reduce((sum, w) => sum + w.confidence, 0) / Math.max(1, words.length);
  return {
    text: words.map((w) => w.text).join(' '),
    x0,
    y0,
    x1,
    y1,
    xCenter: (x0 + x1) / 2,
    yCenter: (y0 + y1) / 2,
    confidence: Math.round(avgConf),
  };
}

function clusterSortedXValues(xs: number[], k: number): { centers: number[]; variance: number } {
  if (xs.length === 0) return { centers: [], variance: 0 };
  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  if (maxX - minX < 20) {
    return { centers: [minX], variance: 0 };
  }
  let centers = Array.from({ length: k }, (_, i) => minX + ((i + 0.5) / k) * (maxX - minX));
  for (let iter = 0; iter < 12; iter++) {
    const groups: number[][] = Array.from({ length: k }, () => []);
    for (const x of xs) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = Math.abs(x - centers[c]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      groups[bestIdx].push(x);
    }
    const nextCenters = centers.map((c, idx) =>
      groups[idx].length > 0
        ? groups[idx].reduce((a, b) => a + b, 0) / groups[idx].length
        : c
    );
    centers = nextCenters;
  }
  centers.sort((a, b) => a - b);
  let variance = 0;
  for (const x of xs) {
    let bestDist = Infinity;
    for (const c of centers) {
      bestDist = Math.min(bestDist, Math.abs(x - c));
    }
    variance += bestDist * bestDist;
  }
  return { centers, variance };
}

function tryParse2dBoundingBoxTree(
  words: OcrWordBox[],
  imageWidth: number,
  imageHeight: number,
  preferredUnit: WeightUnit
): {
  slots: PedigreeOcrSlotDraft[];
  populatedCount: number;
  headerLines: string[];
} | null {
  const inferredW = Math.max(imageWidth || 0, ...words.map((w) => w.x1), 1000);
  const inferredH = Math.max(imageHeight || 0, ...words.map((w) => w.y1), 800);
  const fragments = buildLineFragmentsFromWords(words, inferredW);
  if (fragments.length < 3) return null;

  // Separate potential top header lines (above tree) vs tree columns by testing 3-col vs 4-col fit
  const allMinY = Math.min(...fragments.map((f) => f.y0));
  const allMaxY = Math.max(...fragments.map((f) => f.y1));
  const spanY = Math.max(1, allMaxY - allMinY);

  // Look for multi-column tree fragments (either full height or lower 78% if header subject sits on top)
  const lowerFragments = fragments.filter((f) => f.yCenter >= allMinY + spanY * 0.18);
  const candidatePool = lowerFragments.length >= 4 ? lowerFragments : fragments;
  const xs = candidatePool.map((f) => f.x0).sort((a, b) => a - b);
  if (xs[xs.length - 1] - xs[0] < inferredW * 0.25) {
    return null; // Single-column layout; let line heuristic handle it
  }

  const fit3 = clusterSortedXValues(xs, 3);
  const fit4 = clusterSortedXValues(xs, 4);

  // Check if 4 columns are genuinely distinct (min gap >= 12% of page width and meaningfully lower variance)
  const minGap4 = fit4.centers
    .slice(1)
    .reduce((min, c, i) => Math.min(min, c - fit4.centers[i]), Infinity);
  const minGap3 = fit3.centers
    .slice(1)
    .reduce((min, c, i) => Math.min(min, c - fit3.centers[i]), Infinity);

  // Count how many fragments fall near col 0 in 4-col clustering and whether they span a compact single region
  const col0FragsIn4 = candidatePool.filter(
    (f) => Math.abs(f.x0 - fit4.centers[0]) <= Math.abs(f.x0 - fit4.centers[1])
  );
  const use4Cols =
    minGap4 >= inferredW * 0.12 &&
    fit4.variance < fit3.variance * 0.55 &&
    col0FragsIn4.length >= 1 &&
    col0FragsIn4.length <= 8;

  const colCenters = use4Cols ? fit4.centers : fit3.centers;
  if (!use4Cols && minGap3 < inferredW * 0.12) {
    return null;
  }

  // Decide tree top Y: separate top Subject box / banner lines from 3-column ancestor tree rows
  const isSubjectBannerFragment = (f: TextFragment) =>
    /\b(?:name\s*:|tattoo\s*(?:\/|\s+)?id\s*:|breed\s*(?:&|and)\s*var(?:iety)?\s*:|wright\s+coi\s*:|official\s+\d+-generation)/i.test(
      f.text
    );

  const topMultiRowY = (() => {
    const sorted = [...fragments].sort((a, b) => a.yCenter - b.yCenter);
    // Start after any explicit Subject summary / PDF header banner fragments
    const lastBannerIdx = sorted.reduce(
      (last, f, idx) => (isSubjectBannerFragment(f) ? idx : last),
      -1
    );
    const searchStart = lastBannerIdx >= 0 ? lastBannerIdx + 1 : 0;

    for (let i = searchStart; i < sorted.length; i++) {
      const f = sorted[i];
      // Tree row begins where fragments sit across distinct pedigree columns without spanning across columns
      const hasRightPeer = sorted.some(
        (other, j) =>
          j >= searchStart &&
          other !== f &&
          !isSubjectBannerFragment(other) &&
          Math.abs(other.yCenter - f.yCenter) < spanY * 0.14 &&
          other.x0 - f.x0 > inferredW * 0.22
      );
      if (hasRightPeer) return f.y0;
    }
    return sorted[searchStart]?.y0 ?? allMinY;
  })();

  const headerFrags = use4Cols
    ? []
    : fragments.filter((f) => f.y1 < topMultiRowY - 2 || isSubjectBannerFragment(f));
  const treeFrags = use4Cols
    ? fragments
    : fragments.filter((f) => f.y1 >= topMultiRowY - 2 && !isSubjectBannerFragment(f));

  if (treeFrags.length < 2) return null;

  const treeTopY = Math.min(...treeFrags.map((f) => f.y0));
  const treeBottomY = Math.max(...treeFrags.map((f) => f.y1));
  const treeHeight = Math.max(10, treeBottomY - treeTopY);

  // Assign each tree fragment to nearest column center
  const slotFragments = new Map<PedigreeOcrSlotKey, TextFragment[]>();
  const pushSlotFrag = (key: PedigreeOcrSlotKey, frag: TextFragment) => {
    const arr = slotFragments.get(key) ?? [];
    arr.push(frag);
    slotFragments.set(key, arr);
  };

  if (!use4Cols && headerFrags.length > 0) {
    for (const hf of headerFrags) {
      pushSlotFrag('subject', hf);
    }
  }

  const genKeysByDepth: Record<1 | 2 | 3, PedigreeOcrSlotKey[]> = {
    1: ['sire', 'dam'],
    2: ['pgs', 'pgd', 'mgs', 'mgd'],
    3: ['sss', 'ssd', 'sds', 'sdd', 'dss', 'dsd', 'dds', 'ddd'],
  };

  for (const frag of treeFrags) {
    let colIdx = 0;
    let bestDist = Infinity;
    for (let c = 0; c < colCenters.length; c++) {
      const d = Math.abs(frag.x0 - colCenters[c]);
      if (d < bestDist) {
        bestDist = d;
        colIdx = c;
      }
    }

    if (use4Cols && colIdx === 0) {
      pushSlotFrag('subject', frag);
      continue;
    }

    const genNum = (use4Cols ? colIdx : colIdx + 1) as 1 | 2 | 3;
    const keys = genKeysByDepth[genNum];
    if (!keys) continue;

    const normY = Math.max(0, Math.min(0.9999, (frag.yCenter - treeTopY) / treeHeight));
    const bucketIdx = Math.min(keys.length - 1, Math.floor(normY * keys.length));
    pushSlotFrag(keys[bucketIdx], frag);
  }

  const slots = createEmptyPedigreeOcrSlots('');
  let populatedCount = 0;

  for (const slot of slots) {
    const frags = slotFragments.get(slot.slotKey);
    if (!frags || frags.length === 0) continue;
    frags.sort((a, b) => a.yCenter - b.yCenter || a.x0 - b.x0);
    const lines = frags.map((f) => f.text);
    const desc = PEDIGREE_OCR_SLOT_DESCRIPTORS.find((d) => d.key === slot.slotKey)!;
    const parsed = parsePedigreeSlotLines(lines, desc.defaultSex, preferredUnit);
    if (parsed.isUnknown) continue;

    const avgConf = Math.round(
      frags.reduce((s, f) => s + f.confidence, 0) / Math.max(1, frags.length)
    );
    slot.name = parsed.name;
    slot.tattoo = parsed.tattoo;
    slot.registrationNumber = parsed.registrationNumber;
    slot.grandChampionNumber = parsed.grandChampionNumber;
    slot.legsCount = parsed.legsCount;
    slot.weightText = parsed.weightText;
    slot.weightGrams = parsed.weightGrams;
    slot.breed = parsed.breed;
    slot.variety = parsed.variety;
    slot.birthDateIso = parsed.birthDateIso;
    slot.genotypeRaw = parsed.genotypeRaw;
    slot.sex = parsed.sex;
    slot.notes = parsed.notes;
    slot.confidence = avgConf;
    slot.rawSnippet = lines.join('\n');
    slot.included = true;
    populatedCount++;
  }

  if (populatedCount === 0) return null;

  return {
    slots,
    populatedCount,
    headerLines: headerFrags.map((f) => f.text),
  };
}

const SLOT_LABEL_PATTERNS: Array<{ key: PedigreeOcrSlotKey; pattern: RegExp }> = [
  { key: 'sss', pattern: /^(?:sss|sire'?s\s+sire'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'ssd', pattern: /^(?:ssd|sire'?s\s+sire'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'sds', pattern: /^(?:sds|sire'?s\s+dam'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'sdd', pattern: /^(?:sdd|sire'?s\s+dam'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'dss', pattern: /^(?:dss|dam'?s\s+sire'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'dsd', pattern: /^(?:dsd|dam'?s\s+sire'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'dds', pattern: /^(?:dds|dam'?s\s+dam'?s\s+sire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'ddd', pattern: /^(?:ddd|dam'?s\s+dam'?s\s+dam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'pgs', pattern: /^(?:pgs|sire'?s\s+sire|paternal\s+grandsire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'pgd', pattern: /^(?:pgd|sire'?s\s+dam|paternal\s+granddam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'mgs', pattern: /^(?:mgs|dam'?s\s+sire|maternal\s+grandsire)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'mgd', pattern: /^(?:mgd|dam'?s\s+dam|maternal\s+granddam)\b\s*[:\-–—]?\s*(.*)$/i },
  { key: 'sire', pattern: /^(?:sire(?:\s*\(gen\s*1\))?|father)\b\s*[:\-–—]\s*(.*)$/i },
  { key: 'dam', pattern: /^(?:dam(?:\s*\(gen\s*1\))?|mother)\b\s*[:\-–—]\s*(.*)$/i },
  { key: 'subject', pattern: /^(?:subject(?:\s+animal)?|animal)\b\s*[:\-–—]\s*(.*)$/i },
];

function parseLinesHeuristic(
  rawText: string,
  baseConfidence: number,
  preferredUnit: WeightUnit
): { slots: PedigreeOcrSlotDraft[]; populatedCount: number } {
  const slots = createEmptyPedigreeOcrSlots('');
  const byKey = new Map<PedigreeOcrSlotKey, string[]>();

  const rawLines = rawText.replace(/\r\n/g, '\n').split('\n');
  let activeKey: PedigreeOcrSlotKey | null = null;
  let foundExplicitLabels = false;

  for (const rawLine of rawLines) {
    const clean = sanitizeSingleLineText(rawLine, 260);
    if (!clean || isBoilerplatePedigreeLine(clean)) continue;

    let matchedLabel = false;
    for (const spec of SLOT_LABEL_PATTERNS) {
      const m = spec.pattern.exec(clean);
      if (m) {
        foundExplicitLabels = true;
        activeKey = spec.key;
        matchedLabel = true;
        const remainder = (m[1] || '').trim();
        const arr = byKey.get(activeKey) ?? [];
        if (remainder) arr.push(remainder);
        byKey.set(activeKey, arr);
        break;
      }
    }
    if (matchedLabel) continue;

    if (activeKey) {
      const arr = byKey.get(activeKey) ?? [];
      arr.push(clean);
      byKey.set(activeKey, arr);
    }
  }

  // If no explicit Sire/Dam/PGS labels existed, fall back to blank-line-separated blocks in tree order
  if (!foundExplicitLabels) {
    const blocks = rawText
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n+/)
      .map((blk) =>
        blk
          .split('\n')
          .map((l) => sanitizeSingleLineText(l, 260))
          .filter((l) => l.length > 0 && !isBoilerplatePedigreeLine(l))
      )
      .filter((lines) => lines.length > 0);

    const order: PedigreeOcrSlotKey[] = PEDIGREE_OCR_SLOT_DESCRIPTORS.map((d) => d.key);
    blocks.slice(0, order.length).forEach((lines, idx) => {
      byKey.set(order[idx], lines);
    });
  }

  let populatedCount = 0;
  for (const slot of slots) {
    const lines = byKey.get(slot.slotKey);
    if (!lines || lines.length === 0) continue;
    const desc = PEDIGREE_OCR_SLOT_DESCRIPTORS.find((d) => d.key === slot.slotKey)!;
    const parsed = parsePedigreeSlotLines(lines, desc.defaultSex, preferredUnit);
    if (parsed.isUnknown) continue;

    slot.name = parsed.name;
    slot.tattoo = parsed.tattoo;
    slot.registrationNumber = parsed.registrationNumber;
    slot.grandChampionNumber = parsed.grandChampionNumber;
    slot.legsCount = parsed.legsCount;
    slot.weightText = parsed.weightText;
    slot.weightGrams = parsed.weightGrams;
    slot.breed = parsed.breed;
    slot.variety = parsed.variety;
    slot.birthDateIso = parsed.birthDateIso;
    slot.genotypeRaw = parsed.genotypeRaw;
    slot.sex = parsed.sex;
    slot.notes = parsed.notes;
    slot.confidence = baseConfidence;
    slot.rawSnippet = lines.join('\n');
    slot.included = true;
    populatedCount++;
  }

  return { slots, populatedCount };
}

/**
 * Parses a scanned pedigree page (raw OCR text + optional 2D word bounding boxes) into an
 * editable 15-slot 3-generation pedigree draft ready for the Import Review Queue.
 */
export function parsePedigreeOcrResult(
  input: OcrScannedPageInput,
  options?: {
    fallbackSpecies?: string;
    preferredUnit?: WeightUnit;
  }
): PedigreeOcrParseResult {
  const preferredUnit = options?.preferredUnit ?? 'lbs_oz';
  const sanitizedRawText = sanitizePlainText(input.rawText || '', 30_000)
    .replace(/\r\n/g, '\n')
    .trim();
  const detectedSpecies = detectSpeciesFromOcrText(
    sanitizedRawText,
    input.sourceFileName,
    options?.fallbackSpecies || 'Rabbit'
  );
  const warnings: string[] = [];
  const baseConf =
    typeof input.confidence === 'number' && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(100, Math.round(input.confidence)))
      : 75;

  const lineRes = sanitizedRawText
    ? parseLinesHeuristic(sanitizedRawText, baseConf, preferredUnit)
    : { slots: createEmptyPedigreeOcrSlots(''), populatedCount: 0 };

  let chosenSlots = lineRes.slots;
  let populatedSlotCount = lineRes.populatedCount;
  let layoutMode: PedigreeOcrParseResult['layoutMode'] =
    populatedSlotCount > 0 ? 'line_heuristic' : 'manual_empty';

  if (input.words && input.words.length >= 4) {
    const treeRes = tryParse2dBoundingBoxTree(
      input.words,
      input.imageWidth || 1000,
      input.imageHeight || 800,
      preferredUnit
    );
    // Prefer 2D tree layout whenever it extracts >= line heuristic (or >= 2 ancestors)
    if (treeRes && treeRes.populatedCount >= Math.max(2, lineRes.populatedCount)) {
      chosenSlots = treeRes.slots;
      populatedSlotCount = treeRes.populatedCount;
      layoutMode = 'bounding_box_tree';
    }
  }

  // Propagate subject/detected breed down to slots missing an explicit breed
  const detectedBreed =
    chosenSlots.find((s) => s.slotKey === 'subject' && s.breed)?.breed ||
    chosenSlots.find((s) => s.breed)?.breed ||
    '';
  if (detectedBreed) {
    for (const s of chosenSlots) {
      if (s.included && !s.breed) s.breed = detectedBreed;
    }
  }

  if (populatedSlotCount === 0) {
    warnings.push(
      'No pedigree entries could be parsed automatically from this scan. Fill in or edit any slots below before staging into the Import Review Queue.'
    );
  } else if (populatedSlotCount <= 2) {
    warnings.push(
      'Only partial pedigree text was recognized (creases, handwriting, or low contrast). Review and correct any ancestor fields below before merging.'
    );
  }

  return {
    slots: chosenSlots,
    detectedSpecies,
    detectedBreed,
    sanitizedRawText,
    layoutMode,
    populatedSlotCount,
    warnings,
  };
}

/**
 * Converts reviewed/edited OCR pedigree slot drafts directly into a standard `PlatformImportPreview`
 * with deterministic IDs, 3-generation parent linking, preexisting barn animal matching,
 * and per-field contradiction checks for the Import Review Queue.
 */
export function buildPlatformImportPreviewFromOcrDrafts(params: {
  slots: PedigreeOcrSlotDraft[];
  speciesName: string;
  sourceFileName: string;
  existingSnapshot: BarnDatabaseSnapshot;
  attachedScanPhoto?: {
    fileName: string;
    mimeHint: string;
    bytes: Uint8Array;
  };
}): PlatformImportPreview {
  const ts = nowIsoUtc();
  const species = sanitizeSingleLineText(params.speciesName || 'Rabbit', 80) || 'Rabbit';
  const cleanSourceName = sanitizeSingleLineText(params.sourceFileName || 'pedigree-scan.jpg', 140);
  const warnings: string[] = [];

  const workingSpeciesProfiles: SpeciesProfile[] = [...params.existingSnapshot.speciesProfiles];
  const newSpeciesProfiles: SpeciesProfile[] = [];
  const existingSp = workingSpeciesProfiles.find((p) => isSameSpecies(p.name, species));
  if (!existingSp) {
    const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, species));
    const base = resolveSpeciesProfile(species, []);
    const created: SpeciesProfile = preset
      ? { ...preset, sortOrder: workingSpeciesProfiles.length, createdAt: ts, updatedAt: ts }
      : {
          ...base,
          id: `species-${slugifyKey(species)}`,
          name: species,
          sortOrder: workingSpeciesProfiles.length,
          createdAt: ts,
          updatedAt: ts,
        };
    workingSpeciesProfiles.push(created);
    newSpeciesProfiles.push(created);
  }

  const activeDrafts = params.slots.filter(
    (s) =>
      s.included &&
      Boolean(
        s.name.trim() ||
          s.tattoo.trim() ||
          s.registrationNumber.trim() ||
          s.grandChampionNumber.trim()
      )
  );

  const animalsById = new Map<string, Animal>();
  const slotToAnimalId = new Map<PedigreeOcrSlotKey, string>();
  const matchedExistingByAnimalId = new Map<string, PreexistingAnimalMatch>();

  for (const draft of activeDrafts) {
    const cleanName = sanitizeSingleLineText(draft.name, 140);
    const cleanTag = sanitizeSingleLineText(draft.tattoo, 60);
    const cleanReg = sanitizeSingleLineText(draft.registrationNumber, 60);
    const cleanGc = sanitizeSingleLineText(draft.grandChampionNumber, 60);
    const cleanVariety = sanitizeSingleLineText(draft.variety, 100);
    const cleanBreed = sanitizeSingleLineText(draft.breed, 100);
    const cleanGeno = sanitizeSingleLineText(draft.genotypeRaw, 120);
    const cleanDob = normalizeFlexibleDateIso(draft.birthDateIso);
    const parsedWt =
      draft.weightGrams > 0
        ? draft.weightGrams
        : parseOcrWeightSegment(draft.weightText).weightGrams;

    const detId = deterministicOcrEntityId(
      species,
      `${cleanTag}|${cleanReg}|${cleanName}|${draft.slotKey}`
    );

    const preexisting = findPreexistingAnimalMatch(params.existingSnapshot.animals, {
      species,
      candidateDeterministicId: detId,
      tattoo: cleanTag,
      registrationNumber: cleanReg,
      name: cleanName,
      birthDateIso: cleanDob,
    });

    const finalId = preexisting ? preexisting.animal.id : detId;
    if (preexisting && !matchedExistingByAnimalId.has(finalId)) {
      matchedExistingByAnimalId.set(finalId, preexisting);
    }

    const existingInBatch = animalsById.get(finalId);
    if (existingInBatch) {
      if (!existingInBatch.tattoo && cleanTag) existingInBatch.tattoo = cleanTag;
      if (!existingInBatch.registrationNumber && cleanReg) existingInBatch.registrationNumber = cleanReg;
      if (!existingInBatch.grandChampionNumber && cleanGc) existingInBatch.grandChampionNumber = cleanGc;
      if (!existingInBatch.variety && cleanVariety) existingInBatch.variety = cleanVariety;
      if (!existingInBatch.breed && cleanBreed) existingInBatch.breed = cleanBreed;
      if (!existingInBatch.birthDateIso && cleanDob) existingInBatch.birthDateIso = cleanDob;
      if (!existingInBatch.weightGrams && parsedWt) existingInBatch.weightGrams = parsedWt;
      slotToAnimalId.set(draft.slotKey, finalId);
      continue;
    }

    const animal: Animal = {
      id: finalId,
      tattoo: cleanTag,
      name: cleanName || cleanTag || cleanReg || `${draft.shortLabel} (Scanned)`,
      species,
      breed: cleanBreed,
      variety: cleanVariety,
      sex: draft.sex,
      status: 'Active',
      archived: false,
      birthDateIso: cleanDob,
      weightGrams: parsedWt,
      genotype: cleanGeno ? parseGenotypeString(cleanGeno, species) : [],
      genotypeRaw: cleanGeno,
      registrationNumber: cleanReg,
      grandChampionNumber: cleanGc,
      legsCount: Math.max(0, Math.round(Number(draft.legsCount) || 0)),
      cageLocation: '',
      breederName: '',
      ownerName: '',
      sireId: '',
      damId: '',
      notes: sanitizePlainText(draft.notes, 2000),
      createdAt: preexisting?.animal.createdAt || ts,
      updatedAt: ts,
    };

    animalsById.set(finalId, animal);
    slotToAnimalId.set(draft.slotKey, finalId);
  }

  let parentLinksResolved = 0;
  for (const desc of PEDIGREE_OCR_SLOT_DESCRIPTORS) {
    if (!desc.childKey || !desc.linkSide) continue;
    const childId = slotToAnimalId.get(desc.childKey);
    const parentId = slotToAnimalId.get(desc.key);
    if (!childId || !parentId || childId === parentId) continue;
    const childAnimal = animalsById.get(childId);
    if (!childAnimal) continue;
    if (desc.linkSide === 'sire' && childAnimal.sireId !== parentId) {
      childAnimal.sireId = parentId;
      parentLinksResolved++;
    } else if (desc.linkSide === 'dam' && childAnimal.damId !== parentId) {
      childAnimal.damId = parentId;
      parentLinksResolved++;
    }
  }

  const allKnownAnimalsById = new Map<string, Animal>();
  for (const ex of params.existingSnapshot.animals) allKnownAnimalsById.set(ex.id, ex);
  for (const inc of animalsById.values()) {
    if (!allKnownAnimalsById.has(inc.id)) allKnownAnimalsById.set(inc.id, inc);
  }

  const conflicts: AnimalImportConflict[] = [];
  for (const [animalId, match] of matchedExistingByAnimalId.entries()) {
    const inc = animalsById.get(animalId);
    if (!inc) continue;
    const contradictions = buildAnimalContradictions(match.animal, inc, {
      preferredUnit: params.existingSnapshot.settings.preferredUnit,
      speciesProfiles: workingSpeciesProfiles,
      allKnownAnimalsById,
    });
    if (contradictions.length > 0) {
      conflicts.push({
        animalId,
        species: match.animal.species,
        displayName: match.animal.name || inc.name,
        displayTag: match.animal.tattoo || inc.tattoo,
        matchedBy: match.matchedBy,
        existingAnimal: match.animal,
        incomingAnimal: inc,
        contradictions,
      });
    }
  }

  const stagedPhotos: StagedImportedPhoto[] = [];
  const subjectId = slotToAnimalId.get('subject');
  const subjectAnimal = subjectId ? animalsById.get(subjectId) : undefined;
  if (params.attachedScanPhoto && subjectAnimal && params.attachedScanPhoto.bytes.byteLength > 0) {
    stagedPhotos.push({
      id: `ocr-scan-${stableHash(`${subjectAnimal.id}:${params.attachedScanPhoto.fileName}`)}`,
      species,
      animalId: subjectAnimal.id,
      animalName: subjectAnimal.name,
      isPrimary: false,
      sortOrder: 99,
      caption: `Scanned Paper Pedigree (${cleanSourceName})`,
      originalFileName: params.attachedScanPhoto.fileName,
      entryPath: params.attachedScanPhoto.fileName,
      mimeHint: params.attachedScanPhoto.mimeHint,
      bytes: params.attachedScanPhoto.bytes,
    });
  }

  const stagedPhotosRawBytes = stagedPhotos.reduce((acc, p) => acc + p.bytes.byteLength, 0);

  return {
    platformId: 'ocr-pedigree-scanner',
    platformName: 'Offline Pedigree OCR Scan',
    archiveNames: [cleanSourceName],
    diagnostics: [
      {
        archiveName: cleanSourceName,
        entryPath: cleanSourceName,
        classification: 'animals',
        rowCount: animalsById.size,
        headers: ['Pedigree OCR Review Slots'],
        matchedColumns: ['Name', 'Tattoo / Ear #', 'ARBA Reg #', 'Weight', 'Variety'],
        unmappedColumns: [],
      },
    ],
    stagedPhotos,
    stagedPhotosRawBytes,
    missingPhotoZipRefsCount: 0,
    deferredMediaCount: 0,
    deferredMediaBytes: 0,
    deferredMediaSampleNames: [],
    deferredManifestRowCount: 0,
    animalsWithMultipleImagesCount: 0,
    warnings,
    speciesDetected: animalsById.size > 0 ? [species] : [],
    newSpeciesProfiles,
    animals: Array.from(animalsById.values()),
    matchedExistingAnimalsCount: matchedExistingByAnimalId.size,
    conflicts,
    parentLinksResolved,
    placeholderAncestorsCreated: 0,
    cages: [],
    breedings: [],
    tasks: [],
    careLogs: [],
    shows: [],
    schemaDiagnosticReport: [
      'Importer: Offline Pedigree OCR Scan',
      `Source: ${cleanSourceName}`,
      `Parsed Slots: ${animalsById.size} (${parentLinksResolved} parent links)`,
    ].join('\n'),
  };
}
