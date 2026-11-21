/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Universal Pedigree, Evans `.HTM` & Multi-System Spreadsheet Importer
 * (`src/core/importers/universalPedigreeImporter.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `DOMParser`) dependencies.
 * Runs identically in Web PWA, Node tests, and React Native / Expo.
 *
 * Designed to ingest wildly varying pedigree exports gracefully:
 * - Evans Software / ARBA `.HTM` & `.HTML` multi-generation pedigree trees (`rowspan` grids)
 * - Kintracs, ZooEasy, Hutch, Everbreed, CattleMax & custom multi-generation CSV/TSV/pipe sheets
 *   with parent & grandparent/great-grandparent columns (`Sire`, `Dam`, `PGS`, `PGD`, `MGS`, `MGD`, `SSS`..)
 * - Generic JSON animal arrays & nested `{ sire: {...}, dam: {...} }` pedigree trees
 * - Clear, non-crashing actionable warnings for wrong/corrupt/unsupported binary formats (.pdf/.xlsx/.sqlite)
 */

import { parseGenotypeString } from '../geneticsEngine';
import { sanitizePlainText, sanitizeSingleLineText } from '../inputSanitization';
import {
  Animal,
  BarnDatabaseSnapshot,
  BiologicalSex,
  IagarbScorecard,
  isAnimalArchived,
  isSameSpecies,
  isWoolApplicableSpecies,
  normalizeAnimalStatus,
  normalizeWoolHarvestMethod,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  SpeciesProfile,
  todayDateIso,
  WoolHarvest,
  WoolHarvestMethod,
} from '../models';
import {
  extractVirtualEntries,
  normalizeFlexibleDateIso,
  parseDelimitedTable,
  parseFlexibleWeightToGrams,
} from './archiveAndCsvUtils';
import {
  AnimalImportConflict,
  buildAnimalContradictions,
  findPreexistingAnimalMatch,
  PreexistingAnimalMatch,
} from './conflictResolver';
import {
  CsvTableColumnResolution,
  resolveCsvColumnAssignments,
} from './csvColumnMapper';
import {
  CsvTableMappingSummary,
  CsvTargetFieldKey,
  CustomSpeciesImportOverride,
  DetectedTableDiagnostic,
  ImporterRunOptions,
  PlatformImporter,
  PlatformImportPreview,
  RawArchiveInput,
  UnresolvedParentLink,
  VirtualArchiveEntry,
} from './importerTypes';

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

function deterministicEntityId(prefix: string, species: string, seed: string): string {
  const sSlug = slugifyKey(species);
  const cleanSeed = seed.trim().toLowerCase();
  return `${prefix}-${sSlug}-${stableHash(cleanSeed)}`;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;|&ndash;/gi, '-')
    .replace(/&middot;|&bull;/gi, '·')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    });
}

function htmlFragmentToLines(fragment: string): string[] {
  const withBreaks = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(withBreaks)
    .split('\n')
    .map((line) => sanitizeSingleLineText(line.replace(/\s+/g, ' ').trim(), 400))
    .filter(Boolean);
}

interface ParsedWoolCue {
  primeGrams: number;
  gradeGrams: number;
  totalGrams: number;
  intervalDays?: number;
  harvestDateIso?: string;
  harvestMethod?: WoolHarvestMethod;
  stapleLengthMm?: number;
  rate90dGrams?: number;
  iagarbScore?: IagarbScorecard;
  notes?: string;
}

function roundTenth(val: number): number {
  return Math.round(val * 10) / 10;
}

function parseWoolMassGrams(raw: string | undefined): number {
  const s = (raw || '').trim();
  if (!s) return 0;
  if (/\b(?:kg|kilogram|lb|lbs|pound|pounds|oz|ounce|ounces)\b|#/.test(s.toLowerCase())) {
    const parsed = parseFlexibleWeightToGrams(s);
    return parsed > 0 ? Math.min(100_000, roundTenth(parsed)) : 0;
  }
  const numMatch = s.match(/-?\d+(?:\.\d+)?/);
  if (!numMatch) return 0;
  const val = Number(numMatch[0]);
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.min(100_000, roundTenth(val));
}

function clampIagarbPts(raw: unknown, max: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(Math.min(max, num) * 10) / 10;
}

function allocateProportionalIagarbPositions(
  rawTotal: number,
  evaluatorName = '',
  evaluationDateIso = ''
): IagarbScorecard | undefined {
  const clamped = Math.round(Math.min(100, Math.max(0, rawTotal)) * 10) / 10;
  if (!Number.isFinite(clamped) || clamped <= 0) return undefined;
  const ratio = clamped / 100;
  const caps = [20, 20, 15, 15, 15, 10, 5] as const;
  const vals = caps.map((cap) => Math.min(cap, Math.round(cap * ratio * 10) / 10));
  let diff = Math.round((clamped - vals.reduce((a, b) => a + b, 0)) * 10) / 10;
  for (let i = 0; i < caps.length && Math.abs(diff) >= 0.05; i++) {
    const step = diff > 0 ? Math.min(diff, roundTenth(caps[i] - vals[i])) : Math.max(diff, -vals[i]);
    vals[i] = roundTenth(vals[i] + step);
    diff = roundTenth(diff - step);
  }
  const totalPts = roundTenth(vals.reduce((a, b) => a + b, 0));
  if (totalPts <= 0) return undefined;
  return {
    weightPts: vals[0],
    bodyTypePts: vals[1],
    densityLengthPts: vals[2],
    uniformityPts: vals[3],
    texturePts: vals[4],
    furnishingsPts: vals[5],
    conditionPts: vals[6],
    totalPts,
    evaluatorName: sanitizeSingleLineText(evaluatorName, 120),
    evaluationDateIso: /^\d{4}-\d{2}-\d{2}$/.test(evaluationDateIso) ? evaluationDateIso : '',
  };
}

function normalizeImportedIagarbScore(raw: unknown): IagarbScorecard | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw === 'number') {
    return allocateProportionalIagarbPositions(raw);
  }
  if (typeof raw === 'string') {
    const match = raw.match(/(\d+(?:\.\d+)?)(?:\s*\/\s*100|\s*pts?)?/i);
    if (!match) return undefined;
    return allocateProportionalIagarbPositions(Number(match[1]));
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const weightPts = clampIagarbPts(obj.weightPts, 20);
  const bodyTypePts = clampIagarbPts(obj.bodyTypePts, 20);
  const densityLengthPts = clampIagarbPts(obj.densityLengthPts, 15);
  const uniformityPts = clampIagarbPts(obj.uniformityPts, 15);
  const texturePts = clampIagarbPts(obj.texturePts, 15);
  const furnishingsPts = clampIagarbPts(obj.furnishingsPts, 10);
  const conditionPts = clampIagarbPts(obj.conditionPts, 5);
  const breakdownSum = roundTenth(
    weightPts + bodyTypePts + densityLengthPts + uniformityPts + texturePts + furnishingsPts + conditionPts
  );
  const evalName = sanitizeSingleLineText(obj.evaluatorName || '', 120);
  const rawDate = typeof obj.evaluationDateIso === 'string' ? obj.evaluationDateIso.trim() : '';
  const evalDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  if (breakdownSum > 0) {
    return {
      weightPts,
      bodyTypePts,
      densityLengthPts,
      uniformityPts,
      texturePts,
      furnishingsPts,
      conditionPts,
      totalPts: Math.min(100, breakdownSum),
      evaluatorName: evalName,
      evaluationDateIso: evalDate,
    };
  }
  if (typeof obj.totalPts === 'number' && obj.totalPts > 0) {
    return allocateProportionalIagarbPositions(obj.totalPts, evalName, evalDate);
  }
  return undefined;
}

function mergeParsedWoolCues(base: ParsedWoolCue | undefined, extra: ParsedWoolCue | undefined): ParsedWoolCue | undefined {
  if (!base) return extra;
  if (!extra) return base;
  return {
    primeGrams: Math.max(base.primeGrams, extra.primeGrams),
    gradeGrams: Math.max(base.gradeGrams, extra.gradeGrams),
    totalGrams: Math.max(base.totalGrams, extra.totalGrams),
    intervalDays: extra.intervalDays ?? base.intervalDays,
    harvestDateIso: extra.harvestDateIso || base.harvestDateIso,
    harvestMethod: extra.harvestMethod ?? base.harvestMethod,
    stapleLengthMm: extra.stapleLengthMm ?? base.stapleLengthMm,
    rate90dGrams: extra.rate90dGrams ?? base.rate90dGrams,
    iagarbScore: extra.iagarbScore || base.iagarbScore,
    notes: [base.notes, extra.notes].filter(Boolean).join(' · ') || undefined,
  };
}

function parseIagarbPanelFromHtml(html: string): ParsedWoolCue | undefined {
  if (!/class\s*=\s*["'][^"']*iagarb-panel/i.test(html) && !/IAGARB German Angora/i.test(html)) {
    return undefined;
  }
  let primeGrams = 0;
  let gradeGrams = 0;
  let totalGrams = 0;
  let rate90dGrams: number | undefined;
  let totalPtsFromStat = 0;

  const statRegex =
    /<strong>\s*(Logged Harvests|Prime Fiber|Grade Fiber|Total Yield|90-Day Rate|Total IAGARB Score)\s*:\s*<\/strong>\s*([^<]+)/gi;
  let statMatch: RegExpExecArray | null;
  while ((statMatch = statRegex.exec(html)) !== null) {
    const label = statMatch[1].toLowerCase();
    const valText = decodeHtmlEntities(statMatch[2]).trim();
    if (label === 'prime fiber') primeGrams = parseWoolMassGrams(valText);
    else if (label === 'grade fiber') gradeGrams = parseWoolMassGrams(valText);
    else if (label === 'total yield') totalGrams = parseWoolMassGrams(valText);
    else if (label === '90-day rate') {
      const rate = parseWoolMassGrams(valText);
      if (rate > 0) rate90dGrams = rate;
    } else if (label === 'total iagarb score') {
      const scoreMatch = valText.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*100|\s*pts?)?/i);
      if (scoreMatch) totalPtsFromStat = Number(scoreMatch[1]) || 0;
    }
  }

  const posMap: Record<string, number> = {};
  const posRegex =
    /<div\b[^>]*class\s*=\s*["'][^"']*iag-lbl[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class\s*=\s*["'][^"']*iag-val[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let posMatch: RegExpExecArray | null;
  while ((posMatch = posRegex.exec(html)) !== null) {
    const lbl = decodeHtmlEntities(posMatch[1].replace(/<[^>]+>/g, '')).trim().toLowerCase();
    const valStr = decodeHtmlEntities(posMatch[2].replace(/<[^>]+>/g, '')).trim();
    const numMatch = valStr.match(/^(\d+(?:\.\d+)?)\s*\//);
    if (!numMatch) continue;
    const pts = Number(numMatch[1]);
    if (!Number.isFinite(pts) || pts <= 0) continue;
    if (lbl === 'weight') posMap.weightPts = pts;
    else if (lbl === 'body type') posMap.bodyTypePts = pts;
    else if (lbl.includes('density')) posMap.densityLengthPts = pts;
    else if (lbl.includes('uniformity')) posMap.uniformityPts = pts;
    else if (lbl.includes('texture')) posMap.texturePts = pts;
    else if (lbl.includes('furnishing')) posMap.furnishingsPts = pts;
    else if (lbl === 'condition') posMap.conditionPts = pts;
  }

  const iagarbScore =
    Object.keys(posMap).length > 0
      ? normalizeImportedIagarbScore(posMap)
      : totalPtsFromStat > 0
      ? allocateProportionalIagarbPositions(totalPtsFromStat)
      : undefined;

  if (primeGrams === 0 && gradeGrams === 0 && totalGrams === 0 && !iagarbScore) {
    return undefined;
  }

  return {
    primeGrams,
    gradeGrams,
    totalGrams: totalGrams || roundTenth(primeGrams + gradeGrams),
    rate90dGrams,
    iagarbScore,
  };
}

interface ParsedCellMeta {
  name: string;
  tattoo: string;
  variety: string;
  breed: string;
  weightGrams: number;
  birthDateIso: string;
  registrationNumber: string;
  grandChampionNumber: string;
  legsCount: number;
  genotypeRaw: string;
  sex: BiologicalSex;
  notes: string;
  woolCue?: ParsedWoolCue;
  isUnknown: boolean;
}

function parseAncestorTextLines(
  lines: string[],
  defaultSex: BiologicalSex,
  weightHintUnit?: string
): ParsedCellMeta {
  const joined = lines.join(' · ');
  const isEmptyOrUnknown =
    lines.length === 0 ||
    lines.every((l) =>
      /^(?:unknown|none|n\/a|na|-|—|\?|(?:buck|doe|sire|dam|ram|ewe|bull|cow|boar|sow|stallion|mare|male|female)\s*(?:-|—|:)?\s*unknown)$/i.test(
        l.trim()
      )
    );

  if (isEmptyOrUnknown) {
    return {
      name: '',
      tattoo: '',
      variety: '',
      breed: '',
      weightGrams: 0,
      birthDateIso: '',
      registrationNumber: '',
      grandChampionNumber: '',
      legsCount: 0,
      genotypeRaw: '',
      sex: defaultSex,
      notes: '',
      isUnknown: true,
    };
  }

  let name = lines[0] || '';
  name = name.replace(/^(?:name|animal|sire|dam)\s*:\s*/i, '').trim();
  let tattoo = '';
  let variety = '';
  let breed = '';
  let weightGrams = 0;
  let birthDateIso = '';
  let registrationNumber = '';
  let grandChampionNumber = '';
  let legsCount = 0;
  let genotypeRaw = '';
  let sex: BiologicalSex = defaultSex;
  const extraParts: string[] = [];

  let woolPrime = 0;
  let woolGrade = 0;
  let woolTotal = 0;
  let wool90dRate: number | undefined;
  let woolIntervalDays: number | undefined;
  let woolStapleMm: number | undefined;
  let woolIagarbTotal = 0;
  let sawWoolData = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    // Skip generated .iagarb-panel lines when parsing body text around HTM pedigrees
    if (
      /^(?:iagarb german angora wool|logged harvests\s*:|prime fiber\s*:|grade fiber\s*:|total yield\s*:|90-day rate\s*:|total iagarb score\s*:|body type$|wool density & length$|wool uniformity$|wool texture$|furnishings$|condition$|weight$|\d+(?:\.\d+)?\s*\/\s*(?:5|10|15|20|100)|—\s*\/\s*(?:5|10|15|20))/i.test(
        rawLine
      )
    ) {
      continue;
    }

    const tokens = rawLine.split(/\s*[·|•;]\s*/).map((t) => t.trim()).filter(Boolean);
    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const tok = tokens[tIdx];
      if (
        i === 0 &&
        tIdx === 0 &&
        !/^(?:id|ear|tattoo|dob|born|reg|gc|legs|wt|weight|wool|fleece|iagarb)\s*:/i.test(tok)
      ) {
        name = tok.replace(/^(?:name|animal)\s*:\s*/i, '').trim();
        continue;
      }

      const nameMatch = tok.match(/^(?:name|animal\s*name)\s*:\s*(.+)$/i);
      if (nameMatch) {
        name = sanitizeSingleLineText(nameMatch[1], 140);
        continue;
      }

      // Wool / fiber yield lines generated by formatWoolWeightSummary or external wool sheets
      const woolSummaryMatch = tok.match(
        /^(\d+(?:\.\d+)?)\s*g?\s*(?:wool|fleece|total)\b(?:\s*\(([^)]*)\)?)?$/i
      );
      if (woolSummaryMatch) {
        sawWoolData = true;
        woolTotal = Math.max(woolTotal, parseWoolMassGrams(`${woolSummaryMatch[1]}g`));
        const parenBody = woolSummaryMatch[2] || '';
        const pMatch = parenBody.match(/(\d+(?:\.\d+)?)\s*g?\s*prime/i);
        const gMatch = parenBody.match(/(\d+(?:\.\d+)?)\s*g?\s*grade/i);
        if (pMatch) woolPrime = Math.max(woolPrime, parseWoolMassGrams(`${pMatch[1]}g`));
        if (gMatch) woolGrade = Math.max(woolGrade, parseWoolMassGrams(`${gMatch[1]}g`));
        continue;
      }

      const woolPrefixMatch = tok.match(/^(?:wool(?:\s*\/\s*fiber)?|fleece)\s*:\s*(.+)$/i);
      if (woolPrefixMatch) {
        sawWoolData = true;
        const val = woolPrefixMatch[1];
        const totMatch = val.match(/(\d+(?:\.\d+)?)\s*g?\s*(?:wool|fleece|total)\b/i);
        const pMatch = val.match(/(\d+(?:\.\d+)?)\s*g?\s*prime/i);
        const gMatch = val.match(/(\d+(?:\.\d+)?)\s*g?\s*grade/i);
        if (totMatch) woolTotal = Math.max(woolTotal, parseWoolMassGrams(`${totMatch[1]}g`));
        if (pMatch) woolPrime = Math.max(woolPrime, parseWoolMassGrams(`${pMatch[1]}g`));
        if (gMatch) woolGrade = Math.max(woolGrade, parseWoolMassGrams(`${gMatch[1]}g`));
        if (!totMatch && !pMatch && !gMatch) {
          woolTotal = Math.max(woolTotal, parseWoolMassGrams(val));
        }
        continue;
      }

      const primePiece = tok.match(/^(\d+(?:\.\d+)?)\s*g?\s*prime\b/i);
      if (primePiece) {
        sawWoolData = true;
        woolPrime = Math.max(woolPrime, parseWoolMassGrams(`${primePiece[1]}g`));
        continue;
      }

      const gradePiece = tok.match(/^(\d+(?:\.\d+)?)\s*g?\s*grade\)?$/i);
      if (gradePiece) {
        sawWoolData = true;
        woolGrade = Math.max(woolGrade, parseWoolMassGrams(`${gradePiece[1]}g`));
        continue;
      }

      if (/^\d+\s*harvests?\)?$/i.test(tok)) {
        continue;
      }

      const rate90Match = tok.match(/^(\d+(?:\.\d+)?)\s*g\s*\/\s*(\d+)\s*d(?:ays?)?$/i);
      if (rate90Match) {
        sawWoolData = true;
        wool90dRate = parseWoolMassGrams(`${rate90Match[1]}g`);
        woolIntervalDays = Number(rate90Match[2]) || undefined;
        continue;
      }

      const iagarbTokMatch = tok.match(
        /^iagarb(?:\s+score)?\s*:?\s*(\d+(?:\.\d+)?)(?:\s*\/\s*100|\s*pts?)?$/i
      );
      if (iagarbTokMatch) {
        sawWoolData = true;
        woolIagarbTotal = Math.max(woolIagarbTotal, Number(iagarbTokMatch[1]) || 0);
        continue;
      }

      const stapleTokMatch = tok.match(
        /^(?:staple(?:\s*length)?\s*:?\s*(\d+(?:\.\d+)?)\s*mm?|(\d+(?:\.\d+)?)\s*mm\s*staple)$/i
      );
      if (stapleTokMatch) {
        sawWoolData = true;
        woolStapleMm = Number(stapleTokMatch[1] || stapleTokMatch[2]) || undefined;
        continue;
      }

      const idMatch = tok.match(
        /^(?:id|ear(?:\s*tag|\s*#)?|tattoo(?:\s*\/\s*id)?|tat\.?)\s*:?\s*(.+)$/i
      );
      if (idMatch && !tattoo) {
        tattoo = sanitizeSingleLineText(idMatch[1], 60);
        continue;
      }

      const dobMatch = tok.match(/^(?:dob|born|birth(?:\s*date)?)\s*:?\s*(.+)$/i);
      if (dobMatch && !birthDateIso) {
        birthDateIso = normalizeFlexibleDateIso(dobMatch[1]);
        continue;
      }

      const regMatch = tok.match(/^(?:reg(?:istration)?(?:\s*#|\s*no\.?)?)\s*:?\s*(.+)$/i);
      if (regMatch && !registrationNumber) {
        registrationNumber = sanitizeSingleLineText(regMatch[1], 60);
        continue;
      }

      const gcMatch = tok.match(/^(?:gc|grand\s*champ(?:ion)?(?:\s*#)?)\s*:?\s*(.+)$/i);
      if (gcMatch && !grandChampionNumber) {
        grandChampionNumber = sanitizeSingleLineText(gcMatch[1], 60);
        continue;
      }

      const legsMatch = tok.match(/^legs?\s*:?\s*(\d+)$/i);
      if (legsMatch) {
        legsCount = Math.max(0, Number(legsMatch[1]) || 0);
        continue;
      }

      const wtMatch = tok.match(/^(?:wt|weight)\s*:?\s*(.+)$/i);
      if (wtMatch && weightGrams === 0) {
        weightGrams = parseFlexibleWeightToGrams(wtMatch[1], weightHintUnit);
        continue;
      }

      if (
        !weightGrams &&
        /^\d+(?:\.\d+)?\s*(?:lbs?|#|oz|g|gm|grams?|kg)\b/i.test(tok)
      ) {
        weightGrams = parseFlexibleWeightToGrams(tok, weightHintUnit);
        continue;
      }

      const varMatch = tok.match(/^(?:var(?:iety)?|color|coat)\s*:?\s*(.+)$/i);
      if (varMatch && !variety) {
        variety = sanitizeSingleLineText(varMatch[1], 100);
        continue;
      }

      const breedMatch = tok.match(/^breed\s*:?\s*(.+)$/i);
      if (breedMatch && !breed) {
        breed = sanitizeSingleLineText(breedMatch[1], 100);
        continue;
      }

      const sexMatch = tok.match(/^sex\s*:?\s*(.+)$/i);
      if (sexMatch) {
        sex = normalizeSexLoose(sexMatch[1], defaultSex);
        continue;
      }

      const genoMatch = tok.match(/^(?:geno(?:type)?)\s*:?\s*(.+)$/i);
      if (genoMatch && !genotypeRaw) {
        genotypeRaw = sanitizeSingleLineText(genoMatch[1], 120);
        continue;
      }

      // Heuristic variety/color if no label and on line >= 1
      if (
        !variety &&
        i > 0 &&
        tok.length >= 3 &&
        tok.length <= 40 &&
        !/\d/.test(tok) &&
        !/^(?:unknown|none)$/i.test(tok)
      ) {
        variety = tok;
        continue;
      }

      if (tok && tok !== name) {
        extraParts.push(tok);
      }
    }
  }

  // Extract parenthetical tattoo if embedded in name e.g. "Oakridge Barnaby (OR-101)"
  const parenTag = name.match(/^(.+?)\s*\(([A-Za-z0-9#-]{2,20})\)\s*$/);
  if (parenTag && !tattoo) {
    name = parenTag[1].trim();
    tattoo = parenTag[2].trim();
  }

  const iagarbFromTok =
    woolIagarbTotal > 0 ? allocateProportionalIagarbPositions(woolIagarbTotal) : undefined;
  const effectiveTotal = woolTotal || roundTenth(woolPrime + woolGrade);
  const woolCue: ParsedWoolCue | undefined =
    sawWoolData && (effectiveTotal > 0 || woolPrime > 0 || woolGrade > 0 || iagarbFromTok || wool90dRate)
      ? {
          primeGrams: woolPrime,
          gradeGrams: woolGrade,
          totalGrams: effectiveTotal || wool90dRate || 0,
          intervalDays: woolIntervalDays,
          stapleLengthMm: woolStapleMm,
          rate90dGrams: wool90dRate,
          iagarbScore: iagarbFromTok,
        }
      : undefined;

  return {
    name: sanitizeSingleLineText(name || tattoo || 'Imported Ancestor', 140),
    tattoo,
    variety,
    breed,
    weightGrams,
    birthDateIso,
    registrationNumber,
    grandChampionNumber,
    legsCount,
    genotypeRaw,
    sex,
    notes: extraParts.length > 0 && joined.length <= 300 ? '' : sanitizePlainText(extraParts.join(' · '), 500),
    ...(woolCue ? { woolCue } : {}),
    isUnknown: false,
  };
}

function normalizeSexLoose(raw: string | undefined, fallback: BiologicalSex = 'Unknown'): BiologicalSex {
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

function detectSpeciesFromText(
  rawText: string,
  fileName: string,
  fallbackSpecies: string
): string {
  const combined = `${fileName} ${rawText.slice(0, 2500)}`.toLowerCase();
  for (const preset of PREDEFINED_SPECIES_PRESETS) {
    const pLower = preset.name.toLowerCase();
    if (combined.includes(pLower)) return preset.name;
  }
  if (/\b(?:arba|kindling|hutch|holland lop|mini rex|netherland dwarf|lionhead|new zealand)\b/.test(combined)) {
    return 'Rabbit';
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
  if (/\b(?:cavy|cavies|guinea pig|abyssinian|american cavy|peruvian|silkie|teddy)\b/.test(combined)) {
    return 'Guinea Pig';
  }
  return fallbackSpecies || 'Rabbit';
}

interface HtmlTableCell {
  textLines: string[];
  rowspan: number;
  colspan: number;
}

function parseHtmlTables(html: string): HtmlTableCell[][][] {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const tables: HtmlTableCell[][][] = [];
  const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(clean)) !== null) {
    const tableBody = tableMatch[1];
    const rows: HtmlTableCell[][] = [];
    const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;

    while ((trMatch = trRegex.exec(tableBody)) !== null) {
      const rowHtml = trMatch[1];
      const cells: HtmlTableCell[] = [];
      const tdRegex = /<(t[dh])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
      let tdMatch: RegExpExecArray | null;

      while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
        const attrs = tdMatch[2] || '';
        const inner = tdMatch[3] || '';
        const rsMatch = attrs.match(/rowspan\s*=\s*["']?(\d+)/i);
        const csMatch = attrs.match(/colspan\s*=\s*["']?(\d+)/i);
        const rowspan = Math.max(1, Math.min(256, Number(rsMatch?.[1] || 1) || 1));
        const colspan = Math.max(1, Math.min(32, Number(csMatch?.[1] || 1) || 1));
        cells.push({
          textLines: htmlFragmentToLines(inner),
          rowspan,
          colspan,
        });
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }

  return tables;
}

function parseEvansHtmlEntry(
  entry: VirtualArchiveEntry,
  speciesName: string,
  createAnimalRecord: (
    meta: ParsedCellMeta,
    seedHint: string,
    defaultBreed?: string
  ) => Animal,
  linkParent: (child: Animal, role: 'sire' | 'dam', parent: Animal) => void,
  onWoolCue?: (animal: Animal, cue: ParsedWoolCue, seedHint: string) => void
): { animalsImported: number; ancestorLinks: number } {
  const html = entry.textContent || '';
  if (!html.trim()) return { animalsImported: 0, ancestorLinks: 0 };

  let animalsImported = 0;
  let ancestorLinks = 0;

  const panelWoolCue = parseIagarbPanelFromHtml(html);

  // Extract subject header lines outside pedigree table
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, '\n');
  const bodyLines = htmlFragmentToLines(withoutTables);

  // Extract title hint
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : '';

  const subjectMeta = parseAncestorTextLines(bodyLines, 'Unknown');
  if (!subjectMeta.name || subjectMeta.name === 'Imported Ancestor') {
    const titleNameMatch = titleText.match(/pedigree\s*(?:-|for|:)\s*([^(]+?)(?:\s*\(([^)]+)\))?$/i);
    if (titleNameMatch) {
      subjectMeta.name = sanitizeSingleLineText(titleNameMatch[1].trim(), 140);
      if (!subjectMeta.tattoo && titleNameMatch[2]) {
        subjectMeta.tattoo = sanitizeSingleLineText(titleNameMatch[2].trim(), 60);
      }
    }
  }

  // Try parsing breed & variety from combined "Breed & Variety:" line
  for (const line of bodyLines) {
    const bvMatch = line.match(/breed\s*(?:&|and)?\s*variety\s*:\s*(.+)$/i);
    if (bvMatch) {
      const val = bvMatch[1].trim();
      if (!subjectMeta.breed && val) {
        const parts = val.split(/\s+-\s+|\s*,\s*/);
        subjectMeta.breed = parts[0].trim();
        if (parts[1] && !subjectMeta.variety) subjectMeta.variety = parts[1].trim();
      }
    }
  }

  const parsedTables = parseHtmlTables(html);
  // Select largest table with >= 4 rows (the pedigree tree table)
  const treeTable = parsedTables
    .filter((t) => t.length >= 4)
    .sort((a, b) => b.length - a.length)[0];

  if (!treeTable) {
    // No multi-row pedigree table, but if subject block has usable fields, import subject alone
    if (!subjectMeta.isUnknown && subjectMeta.name) {
      const subjectOnly = createAnimalRecord(subjectMeta, `${entry.entryPath}-subject`);
      const mergedSubCue = mergeParsedWoolCues(subjectMeta.woolCue, panelWoolCue);
      if (mergedSubCue && onWoolCue) {
        onWoolCue(subjectOnly, mergedSubCue, `${entry.entryPath}-subject`);
      }
      animalsImported++;
    }
    return { animalsImported, ancestorLinks };
  }

  // Drop pure <th> header rows if row 0 is headers ("Parents (Gen 1)", etc.)
  let dataRows = treeTable;
  if (
    dataRows.length > 4 &&
    dataRows[0].every((c) => c.rowspan === 1) &&
    dataRows[0].some((c) => /gen\s*1|parents|sire|grandparents/i.test(c.textLines.join(' ')))
  ) {
    dataRows = dataRows.slice(1);
  }

  // Reconstruct 2D rowspan/colspan occupancy matrix
  interface GridSlot {
    cell: HtmlTableCell;
    originRow: number;
    originCol: number;
  }
  const numRows = dataRows.length;
  const occupied: Array<Array<GridSlot | undefined>> = Array.from({ length: numRows }, () => []);
  let maxCols = 0;

  for (let r = 0; r < numRows; r++) {
    let colCursor = 0;
    for (const cell of dataRows[r]) {
      while (occupied[r][colCursor]) colCursor++;
      const slot: GridSlot = { cell, originRow: r, originCol: colCursor };
      for (let dr = 0; dr < cell.rowspan && r + dr < numRows; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          occupied[r + dr][colCursor + dc] = slot;
        }
      }
      colCursor += cell.colspan;
      if (colCursor > maxCols) maxCols = colCursor;
    }
  }

  // Detect whether column 0 is Subject (rowspan == numRows, single origin) or Gen 1 (Parents: 2 origins in col 0)
  const col0Origins = new Set<number>();
  for (let r = 0; r < numRows; r++) {
    const s = occupied[r][0];
    if (s && s.originCol === 0) col0Origins.add(s.originRow);
  }
  const hasSubjectCol = col0Origins.size === 1 && maxCols >= 3;

  let subjectAnimal: Animal | null = null;
  const cellAnimals = new Map<string, Animal>(); // `${originRow}:${originCol}` -> Animal

  if (hasSubjectCol) {
    const subSlot = occupied[0][0];
    const parsedCol0 = subSlot ? parseAncestorTextLines(subSlot.cell.textLines, 'Unknown') : null;
    const chosenMeta =
      parsedCol0 && !parsedCol0.isUnknown ? parsedCol0 : subjectMeta;
    if (!chosenMeta.isUnknown && chosenMeta.name) {
      subjectAnimal = createAnimalRecord(chosenMeta, `${entry.entryPath}-subject`);
      cellAnimals.set('0:0', subjectAnimal);
      animalsImported++;
    }
  } else if (!subjectMeta.isUnknown && subjectMeta.name) {
    subjectAnimal = createAnimalRecord(subjectMeta, `${entry.entryPath}-subject`);
    animalsImported++;
  } else {
    const fallbackName = sanitizeSingleLineText(
      titleText.replace(/^pedigree\s*[-:]?\s*/i, '') || entry.baseName.replace(/\.[^.]+$/, ''),
      120
    );
    subjectAnimal = createAnimalRecord(
      {
        ...subjectMeta,
        name: fallbackName || 'Imported Subject',
        isUnknown: false,
      },
      `${entry.entryPath}-subject`
    );
    animalsImported++;
  }

  if (subjectAnimal && onWoolCue) {
    const mergedSubjectCue = mergeParsedWoolCues(subjectMeta.woolCue, panelWoolCue);
    if (mergedSubjectCue) {
      onWoolCue(subjectAnimal, mergedSubjectCue, `${entry.entryPath}-subject`);
    }
  }

  const startGenCol = hasSubjectCol ? 1 : 0;
  for (let col = startGenCol; col < maxCols; col++) {
    const genDepth = col - startGenCol + 1;
    const expectedSlotSpan = Math.max(1, Math.floor(numRows / (1 << genDepth)));

    for (let r = 0; r < numRows; r++) {
      const slot = occupied[r][col];
      if (!slot || slot.originRow !== r || slot.originCol !== col) continue;

      const slotIndex =
        expectedSlotSpan > 0 ? Math.floor(r / expectedSlotSpan) : Math.floor(r);
      const defaultSex: BiologicalSex = slotIndex % 2 === 0 ? 'Male' : 'Female';
      const meta = parseAncestorTextLines(slot.cell.textLines, defaultSex);
      if (meta.isUnknown || !meta.name) continue;

      const ancSeed = `${entry.entryPath}-g${genDepth}-s${slotIndex}`;
      const ancAnimal = createAnimalRecord(
        meta,
        ancSeed,
        subjectAnimal?.breed || ''
      );
      if (meta.woolCue && onWoolCue) {
        onWoolCue(ancAnimal, meta.woolCue, ancSeed);
      }
      cellAnimals.set(`${r}:${col}`, ancAnimal);
      animalsImported++;
    }
  }

  // Link Gen 1 -> Subject
  if (subjectAnimal) {
    const half = Math.floor(numRows / 2);
    const sireSlot = occupied[0]?.[startGenCol];
    const damSlot = occupied[half]?.[startGenCol];
    const sireAnimal = sireSlot
      ? cellAnimals.get(`${sireSlot.originRow}:${sireSlot.originCol}`)
      : undefined;
    const damAnimal = damSlot
      ? cellAnimals.get(`${damSlot.originRow}:${damSlot.originCol}`)
      : undefined;
    if (sireAnimal) {
      linkParent(subjectAnimal, 'sire', sireAnimal);
      ancestorLinks++;
    }
    if (damAnimal) {
      linkParent(subjectAnimal, 'dam', damAnimal);
      ancestorLinks++;
    }
  }

  // Link Gen g -> Gen g+1
  for (let col = startGenCol; col < maxCols - 1; col++) {
    for (let r = 0; r < numRows; r++) {
      const slot = occupied[r][col];
      if (!slot || slot.originRow !== r || slot.originCol !== col) continue;
      const childAnimal = cellAnimals.get(`${r}:${col}`);
      if (!childAnimal) continue;

      const span = Math.max(2, slot.cell.rowspan);
      const nextCol = col + 1;
      const sireRow = r;
      const damRow = r + Math.floor(span / 2);

      const sireSlot = occupied[sireRow]?.[nextCol];
      const damSlot = occupied[damRow]?.[nextCol];

      const sireAnimal = sireSlot
        ? cellAnimals.get(`${sireSlot.originRow}:${sireSlot.originCol}`)
        : undefined;
      const damAnimal = damSlot
        ? cellAnimals.get(`${damSlot.originRow}:${damSlot.originCol}`)
        : undefined;

      if (sireAnimal) {
        linkParent(childAnimal, 'sire', sireAnimal);
        ancestorLinks++;
      }
      if (damAnimal) {
        linkParent(childAnimal, 'dam', damAnimal);
        ancestorLinks++;
      }
    }
  }

  // Species check reference unused variable
  void speciesName;

  return { animalsImported, ancestorLinks };
}

interface MultiGenColumnSpec {
  targetField: CsvTargetFieldKey;
  childRole: 'subject' | 'sire' | 'dam' | 'pgs' | 'pgd' | 'mgs' | 'mgd';
  linkSide: 'sire' | 'dam';
  sex: BiologicalSex;
  aliases: string[];
}

const MULTI_GEN_COLUMN_SPECS: MultiGenColumnSpec[] = [
  {
    targetField: 'sire',
    childRole: 'subject',
    linkSide: 'sire',
    sex: 'Male',
    aliases: ['sireid', 'siretattooid', 'sire', 'sirename', 'siretag', 'father', 'fatherid', 'fathername', 'buck', 'ram', 'bull', 'stallion', 'stud'],
  },
  {
    targetField: 'dam',
    childRole: 'subject',
    linkSide: 'dam',
    sex: 'Female',
    aliases: ['damid', 'damtattooid', 'dam', 'damname', 'damtag', 'mother', 'motherid', 'mothername', 'doe', 'ewe', 'cow', 'mare'],
  },
  // Gen 2
  {
    targetField: 'pgs',
    childRole: 'sire',
    linkSide: 'sire',
    sex: 'Male',
    aliases: ['pgs', 'siresire', 'siressire', 'paternalgrandsire', 'fatherfather', 'fathersfather', 'ss', 'ff', 'g2s1'],
  },
  {
    targetField: 'pgd',
    childRole: 'sire',
    linkSide: 'dam',
    sex: 'Female',
    aliases: ['pgd', 'siredam', 'siresdam', 'paternalgranddam', 'fathermother', 'fathersmother', 'sd', 'fm', 'g2d1'],
  },
  {
    targetField: 'mgs',
    childRole: 'dam',
    linkSide: 'sire',
    sex: 'Male',
    aliases: ['mgs', 'damsire', 'damssire', 'maternalgrandsire', 'motherfather', 'mothersfather', 'ds', 'mf', 'g2s2'],
  },
  {
    targetField: 'mgd',
    childRole: 'dam',
    linkSide: 'dam',
    sex: 'Female',
    aliases: ['mgd', 'damdam', 'damsdam', 'maternalgranddam', 'mothermother', 'mothersmother', 'dd', 'mm', 'g2d2'],
  },
  // Gen 3 (great-grandparents)
  { targetField: 'sss', childRole: 'pgs', linkSide: 'sire', sex: 'Male', aliases: ['sss', 'fff', 'pgssire', 'siresiresire'] },
  { targetField: 'ssd', childRole: 'pgs', linkSide: 'dam', sex: 'Female', aliases: ['ssd', 'ffm', 'pgsdam', 'siresiredam'] },
  { targetField: 'sds', childRole: 'pgd', linkSide: 'sire', sex: 'Male', aliases: ['sds', 'fmf', 'pgdsire', 'siredamsire'] },
  { targetField: 'sdd', childRole: 'pgd', linkSide: 'dam', sex: 'Female', aliases: ['sdd', 'fmm', 'pgddam', 'siredamdam'] },
  { targetField: 'dss', childRole: 'mgs', linkSide: 'sire', sex: 'Male', aliases: ['dss', 'mff', 'mgssire', 'damsiresire'] },
  { targetField: 'dsd', childRole: 'mgs', linkSide: 'dam', sex: 'Female', aliases: ['dsd', 'mfm', 'mgsdam', 'damsiredam'] },
  { targetField: 'dds', childRole: 'mgd', linkSide: 'sire', sex: 'Male', aliases: ['dds', 'mmf', 'mgdsire', 'damdamsire'] },
  { targetField: 'ddd', childRole: 'mgd', linkSide: 'dam', sex: 'Female', aliases: ['ddd', 'mmm', 'mgddam', 'damdamdam'] },
];

function createMissingSpeciesProfile(
  speciesName: string,
  sortOrder: number,
  ts: string,
  override?: CustomSpeciesImportOverride
): SpeciesProfile {
  const preset = PREDEFINED_SPECIES_PRESETS.find((p) => isSameSpecies(p.name, speciesName));
  if (preset && !override) {
    return { ...preset, sortOrder, createdAt: ts, updatedAt: ts };
  }
  const base = resolveSpeciesProfile(speciesName, []);
  return {
    ...base,
    id: preset?.id || `species-${slugifyKey(speciesName)}`,
    name: speciesName,
    sortOrder,
    gestationDays: Math.max(1, Math.round(override?.gestationDays ?? base.gestationDays)),
    weanDaysAfterBirth: Math.max(1, Math.round(override?.weanDaysAfterBirth ?? base.weanDaysAfterBirth)),
    rebreedDaysAfterBirth: Math.max(1, Math.round(override?.rebreedDaysAfterBirth ?? base.rebreedDaysAfterBirth)),
    maleLabel: (override?.maleLabel || '').trim() || base.maleLabel,
    femaleLabel: (override?.femaleLabel || '').trim() || base.femaleLabel,
    offspringLabel: (override?.offspringLabel || '').trim() || base.offspringLabel,
    birthEventLabel: (override?.birthEventLabel || '').trim() || base.birthEventLabel,
    createdAt: ts,
    updatedAt: ts,
  };
}

export const UniversalPedigreeImporter: PlatformImporter = {
  id: 'universal-pedigree',
  name: 'Universal Pedigree / Evans .HTM / Spreadsheets',
  badge: 'Evans · Kintracs · CSV · JSON',
  supportsMultiZip: true,
  acceptedExtensions: ['.htm', '.html', '.csv', '.tsv', '.txt', '.json', '.zip'],
  summary:
    'Imports Evans Software `.HTM`/`.HTML` 3-to-6-generation pedigree charts, Kintracs / ZooEasy / Hutch / Everbreed multi-generation CSV/TSV/pipe spreadsheets (UTF-8, UTF-16, or Windows-1252), and generic JSON pedigrees.',
  instructions:
    'Drop one or more Evans `.HTM`/`.HTML` pedigree files, CSV/TSV spreadsheets (even wide sheets with Sire/Dam/Grandparents columns), `.JSON` files, or `.ZIP` bundles. Binary `.PDF` or `.XLSX` files will display safe export instructions instead of crashing.',

  parse(
    inputs: RawArchiveInput[],
    existingSnapshot: BarnDatabaseSnapshot,
    options: ImporterRunOptions
  ): PlatformImportPreview {
    const ts = nowIsoUtc();
    const warnings: string[] = [];
    const archiveNames = inputs.map((i) => i.fileName);
    const diagnostics: DetectedTableDiagnostic[] = [];

    const entries = extractVirtualEntries(inputs);
    const workingSpeciesProfiles: SpeciesProfile[] = [...existingSnapshot.speciesProfiles];
    const newSpeciesProfiles: SpeciesProfile[] = [];
    const speciesDetectedSet = new Set<string>();

    const ensureSpecies = (rawSpecies: string | undefined, hintText: string, fileName: string): SpeciesProfile => {
      const candidate =
        (rawSpecies || '').trim() ||
        detectSpeciesFromText(hintText, fileName, options.fallbackSpeciesName || 'Rabbit');
      speciesDetectedSet.add(candidate);
      const existing = workingSpeciesProfiles.find((p) => isSameSpecies(p.name, candidate));
      if (existing) return existing;
      const override = options.customSpeciesOverrides?.[candidate.trim().toLowerCase()];
      const created = createMissingSpeciesProfile(
        candidate,
        workingSpeciesProfiles.length,
        ts,
        override
      );
      workingSpeciesProfiles.push(created);
      newSpeciesProfiles.push(created);
      return created;
    };

    const animalsById = new Map<string, Animal>();
    const matchedExistingByAnimalId = new Map<string, PreexistingAnimalMatch>();
    const animalLookup = new Map<string, string>();
    const resolvedRealAnimalIds = new Set<string>();
    const woolHarvestsById = new Map<string, WoolHarvest>();
    const woolDedupeKeys = new Set<string>();
    const fallbackHarvestDate = todayDateIso();
    const csvTables: CsvTableMappingSummary[] = [];
    const unresolvedParentLinks: UnresolvedParentLink[] = [];
    let parentLinksResolved = 0;
    let placeholderAncestorsCreated = 0;

    const recordCapturedWoolHarvest = (
      species: string,
      animalId: string,
      cue: ParsedWoolCue,
      seedHint: string
    ) => {
      // Capture wool data silently in DB only for fiber-producing species (e.g., Rabbit, Sheep)
      // even when the UI display toggle is disabled; skip non-wool species cleanly.
      if (!isWoolApplicableSpecies(species) || !animalId) return;
      const prime = cue.primeGrams > 0 ? roundTenth(cue.primeGrams) : 0;
      const grade = cue.gradeGrams > 0 ? roundTenth(cue.gradeGrams) : 0;
      const effectivePrime =
        prime === 0 && grade === 0 && cue.totalGrams > 0 ? roundTenth(cue.totalGrams) : prime;
      const total = roundTenth(effectivePrime + grade);
      const score = cue.iagarbScore;
      if (total <= 0 && !score && !cue.stapleLengthMm) return;

      const dateIso =
        cue.harvestDateIso && /^\d{4}-\d{2}-\d{2}$/.test(cue.harvestDateIso)
          ? cue.harvestDateIso
          : fallbackHarvestDate;
      const dedupeKey = `${animalId}::${dateIso}::${effectivePrime}::${grade}::${score?.totalPts ?? 0}`;
      if (woolDedupeKeys.has(dedupeKey)) return;
      woolDedupeKeys.add(dedupeKey);

      const id = deterministicEntityId(
        'wh',
        species,
        `${animalId}-${dateIso}-${effectivePrime}-${grade}-${seedHint}`
      );
      const interval =
        cue.intervalDays && Number.isFinite(cue.intervalDays) && cue.intervalDays > 0
          ? Math.min(1000, Math.round(cue.intervalDays))
          : undefined;
      const staple =
        cue.stapleLengthMm && Number.isFinite(cue.stapleLengthMm) && cue.stapleLengthMm > 0
          ? roundTenth(Math.min(500, cue.stapleLengthMm))
          : undefined;

      woolHarvestsById.set(id, {
        id,
        species,
        animalId,
        harvestDateIso: dateIso,
        ...(interval ? { shearingIntervalDays: interval } : {}),
        primeWeightGrams: effectivePrime,
        gradeWeightGrams: grade,
        harvestMethod: cue.harvestMethod ?? 'Shear',
        ...(staple ? { stapleLengthMm: staple } : {}),
        ...(score ? { iagarbScore: score } : {}),
        notes: sanitizePlainText(cue.notes || 'Captured from pedigree import', 1000),
        createdAt: ts,
        updatedAt: ts,
      });
    };

    interface PendingCsvParentRow {
      entryPath: string;
      rowNumber: number;
      row: Record<string, string>;
      resolution: CsvTableColumnResolution;
      subject: Animal;
      species: string;
      breed: string;
    }
    const pendingCsvParentRows: PendingCsvParentRow[] = [];

    const existingBarnById = new Map<string, Animal>();
    const existingBarnLookup = new Map<string, Animal>();
    const existingBarnNameCounts = new Map<string, number>();
    for (const ex of existingSnapshot.animals) {
      existingBarnById.set(ex.id, ex);
      const spKey = ex.species.trim().toLowerCase();
      const nameClean = (ex.name || '').trim().toLowerCase();
      if (nameClean) {
        const nk = `${spKey}::${nameClean}`;
        existingBarnNameCounts.set(nk, (existingBarnNameCounts.get(nk) || 0) + 1);
      }
    }
    for (const ex of existingSnapshot.animals) {
      const spKey = ex.species.trim().toLowerCase();
      const regClean = (ex.registrationNumber || '').trim().toLowerCase();
      const tatClean = (ex.tattoo || '').trim().toLowerCase();
      const idClean = (ex.id || '').trim().toLowerCase();
      const nameClean = (ex.name || '').trim().toLowerCase();
      if (idClean && !existingBarnLookup.has(`${spKey}::id::${idClean}`)) {
        existingBarnLookup.set(`${spKey}::id::${idClean}`, ex);
      }
      if (regClean && !existingBarnLookup.has(`${spKey}::reg::${regClean}`)) {
        existingBarnLookup.set(`${spKey}::reg::${regClean}`, ex);
      }
      if (tatClean && !existingBarnLookup.has(`${spKey}::tat::${tatClean}`)) {
        existingBarnLookup.set(`${spKey}::tat::${tatClean}`, ex);
      }
      if (
        nameClean &&
        (existingBarnNameCounts.get(`${spKey}::${nameClean}`) || 0) === 1 &&
        !existingBarnLookup.has(`${spKey}::name::${nameClean}`)
      ) {
        existingBarnLookup.set(`${spKey}::name::${nameClean}`, ex);
      }
    }

    const findExistingBarnParent = (
      species: string,
      tokens: Array<string | undefined>
    ): Animal | undefined => {
      const spKey = species.trim().toLowerCase();
      for (const rawTok of tokens) {
        const clean = (rawTok || '').trim().toLowerCase();
        if (!clean) continue;
        const hit =
          existingBarnLookup.get(`${spKey}::id::${clean}`) ||
          existingBarnLookup.get(`${spKey}::reg::${clean}`) ||
          existingBarnLookup.get(`${spKey}::tat::${clean}`) ||
          existingBarnLookup.get(`${spKey}::name::${clean}`);
        if (hit) return hit;
      }
      return undefined;
    };

    const registerToken = (species: string, token: string | undefined, id: string) => {
      const clean = (token || '').trim().toLowerCase();
      if (!clean) return;
      const key = `${species.trim().toLowerCase()}::${clean}`;
      if (!animalLookup.has(key)) animalLookup.set(key, id);
    };

    const resolveOrInsertAnimal = (
      species: string,
      meta: ParsedCellMeta & {
        status?: Animal['status'];
        archived?: boolean;
        cageLocation?: string;
        breederName?: string;
        ownerName?: string;
      },
      seedHint: string,
      defaultBreed = '',
      markAsRealSubject = false
    ): Animal => {
      const spLower = species.trim().toLowerCase();
      const lookupCandidates = [meta.tattoo, meta.registrationNumber, meta.name]
        .map((t) => (t || '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t !== 'imported ancestor');

      for (const tok of lookupCandidates) {
        const hitId = animalLookup.get(`${spLower}::${tok}`);
        if (hitId) {
          const existing = animalsById.get(hitId);
          if (existing) {
            if (!existing.tattoo && meta.tattoo) existing.tattoo = meta.tattoo;
            if (!existing.variety && meta.variety) existing.variety = meta.variety;
            if (!existing.breed && (meta.breed || defaultBreed)) existing.breed = meta.breed || defaultBreed;
            if (!existing.birthDateIso && meta.birthDateIso) existing.birthDateIso = meta.birthDateIso;
            if (!existing.weightGrams && meta.weightGrams) existing.weightGrams = meta.weightGrams;
            if (!existing.registrationNumber && meta.registrationNumber) existing.registrationNumber = meta.registrationNumber;
            if (!existing.grandChampionNumber && meta.grandChampionNumber) existing.grandChampionNumber = meta.grandChampionNumber;
            if (!existing.legsCount && meta.legsCount) existing.legsCount = meta.legsCount;
            if (!existing.cageLocation && meta.cageLocation) existing.cageLocation = meta.cageLocation;
            if (!existing.breederName && meta.breederName) existing.breederName = meta.breederName;
            if (!existing.ownerName && meta.ownerName) existing.ownerName = meta.ownerName;
            if (!existing.genotypeRaw && meta.genotypeRaw) {
              existing.genotypeRaw = meta.genotypeRaw;
              existing.genotype = parseGenotypeString(meta.genotypeRaw, species);
            }
            if (existing.sex === 'Unknown' && meta.sex !== 'Unknown') existing.sex = meta.sex;
            if (markAsRealSubject) resolvedRealAnimalIds.add(existing.id);
            return existing;
          }
        }
      }

      const detId = deterministicEntityId(
        'univ',
        species,
        meta.tattoo || meta.registrationNumber || meta.name || seedHint
      );
      const preexisting = findPreexistingAnimalMatch(existingSnapshot.animals, {
        species,
        candidateDeterministicId: detId,
        tattoo: meta.tattoo,
        registrationNumber: meta.registrationNumber,
        name: meta.name,
        birthDateIso: meta.birthDateIso,
      });

      const finalId = preexisting ? preexisting.animal.id : detId;
      if (preexisting && !matchedExistingByAnimalId.has(finalId)) {
        matchedExistingByAnimalId.set(finalId, preexisting);
      }

      const resolvedStatus = meta.status ?? 'Active';
      const resolvedArchived =
        meta.archived !== undefined ? meta.archived : isAnimalArchived({ status: resolvedStatus });

      const created: Animal = {
        id: finalId,
        tattoo: meta.tattoo,
        name: meta.name || meta.tattoo || 'Imported Animal',
        species,
        breed: meta.breed || defaultBreed,
        variety: meta.variety,
        sex: meta.sex,
        status: resolvedStatus,
        archived: resolvedArchived,
        birthDateIso: meta.birthDateIso,
        weightGrams: meta.weightGrams,
        genotype: meta.genotypeRaw ? parseGenotypeString(meta.genotypeRaw, species) : [],
        genotypeRaw: meta.genotypeRaw,
        registrationNumber: meta.registrationNumber,
        grandChampionNumber: meta.grandChampionNumber,
        legsCount: meta.legsCount,
        cageLocation: meta.cageLocation || '',
        breederName: meta.breederName || '',
        ownerName: meta.ownerName || '',
        sireId: '',
        damId: '',
        notes: meta.notes,
        createdAt: preexisting?.animal.createdAt || ts,
        updatedAt: ts,
      };
      animalsById.set(finalId, created);
      if (markAsRealSubject || preexisting) {
        resolvedRealAnimalIds.add(finalId);
      }
      registerToken(species, meta.tattoo, finalId);
      registerToken(species, meta.registrationNumber, finalId);
      registerToken(species, meta.name, finalId);
      return created;
    };

    const linkParentSafe = (
      child: Animal,
      role: 'sire' | 'dam',
      parent: Pick<Animal, 'id'>
    ) => {
      if (child.id === parent.id) return;
      if (role === 'sire' && child.sireId !== parent.id) {
        child.sireId = parent.id;
        parentLinksResolved++;
      } else if (role === 'dam' && child.damId !== parent.id) {
        child.damId = parent.id;
        parentLinksResolved++;
      }
    };

    const binaryUnsupportedNames: string[] = [];

    for (const entry of entries) {
      if (entry.isMediaOrBinary) {
        if (!entry.imageBytes) {
          binaryUnsupportedNames.push(entry.baseName);
        }
        continue;
      }

      const text = entry.textContent || '';
      const trimmed = text.trim();
      if (!trimmed) {
        warnings.push(`Skipped empty file "${entry.baseName}".`);
        continue;
      }

      // 1. HTML / Evans `.HTM` pedigree
      if (
        entry.extension === 'htm' ||
        entry.extension === 'html' ||
        /<(?:html|table|tr|td)\b/i.test(trimmed.slice(0, 1200))
      ) {
        const sp = ensureSpecies(undefined, text, entry.baseName);
        const res = parseEvansHtmlEntry(
          entry,
          sp.name,
          (meta, seedHint, defaultBreed) =>
            resolveOrInsertAnimal(sp.name, meta, seedHint, defaultBreed),
          linkParentSafe,
          (animal, cue, seedHint) => recordCapturedWoolHarvest(sp.name, animal.id, cue, seedHint)
        );
        diagnostics.push({
          archiveName: entry.archiveName,
          entryPath: entry.entryPath,
          classification: 'animals',
          rowCount: res.animalsImported,
          headers: ['Evans / HTML Pedigree Tree'],
          matchedColumns: ['Evans / HTML Pedigree Tree'],
          unmappedColumns: [],
        });
        if (res.animalsImported === 0) {
          warnings.push(
            `Could not locate an animal or pedigree table inside "${entry.baseName}". Verify it is an exported pedigree HTML page rather than a login/redirect page.`
          );
        }
        continue;
      }

      // 2. JSON (flat arrays or nested pedigree tree `{ name, sire: {...}, dam: {...} }`)
      if (entry.extension === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          const sp = ensureSpecies(undefined, trimmed, entry.baseName);
          const jsonAnimalIdRemap = new Map<string, string>();

          const ingestTreeNode = (
            node: unknown,
            fallbackSex: BiologicalSex,
            depth: number,
            seed: string
          ): Animal | null => {
            if (depth > 8 || !node || typeof node !== 'object' || Array.isArray(node)) return null;
            const obj = node as Record<string, unknown>;
            const rawName = sanitizeSingleLineText(
              obj.name ?? obj.animalName ?? obj.registeredName ?? obj.callName ?? '',
              140
            );
            const rawTag = sanitizeSingleLineText(
              obj.tattoo ?? obj.earTag ?? obj.tag ?? obj.id ?? '',
              60
            );
            if (!rawName && !rawTag) return null;
            const nodeSpecies = ensureSpecies(
              typeof obj.species === 'string' ? obj.species : undefined,
              rawName,
              entry.baseName
            ).name;
            const animal = resolveOrInsertAnimal(
              nodeSpecies,
              {
                name: rawName || rawTag,
                tattoo: rawTag,
                variety: sanitizeSingleLineText(obj.variety ?? obj.color ?? '', 100),
                breed: sanitizeSingleLineText(obj.breed ?? '', 100),
                weightGrams: parseFlexibleWeightToGrams(
                  obj.weight !== undefined ? String(obj.weight) : undefined,
                  typeof obj.weightUnit === 'string' ? obj.weightUnit : undefined
                ),
                birthDateIso: normalizeFlexibleDateIso(
                  String(obj.birthDateIso ?? obj.birthDate ?? obj.dob ?? '')
                ),
                registrationNumber: sanitizeSingleLineText(
                  obj.registrationNumber ?? obj.regNumber ?? obj.reg ?? '',
                  60
                ),
                grandChampionNumber: sanitizeSingleLineText(obj.grandChampionNumber ?? obj.gc ?? '', 60),
                legsCount: Math.max(0, Number(obj.legsCount ?? obj.legs) || 0),
                genotypeRaw: sanitizeSingleLineText(obj.genotypeRaw ?? obj.genotype ?? '', 120),
                sex: normalizeSexLoose(
                  typeof obj.sex === 'string' ? obj.sex : typeof obj.gender === 'string' ? obj.gender : '',
                  fallbackSex
                ),
                notes: sanitizePlainText(obj.notes ?? '', 10_000),
                isUnknown: false,
              },
              seed
            );
            if (typeof obj.id === 'string' && obj.id.trim()) {
              jsonAnimalIdRemap.set(obj.id.trim(), animal.id);
            }

            // Capture optional nested/inline wool/fleece fields on JSON pedigree nodes
            if (isWoolApplicableSpecies(nodeSpecies)) {
              if (Array.isArray(obj.woolHarvests)) {
                obj.woolHarvests.forEach((rawWh, whIdx) => {
                  if (!rawWh || typeof rawWh !== 'object' || Array.isArray(rawWh)) return;
                  const wObj = rawWh as Record<string, unknown>;
                  const pGrams = parseWoolMassGrams(
                    String(wObj.primeWeightGrams ?? wObj.primeGrams ?? wObj.prime ?? '')
                  );
                  const gGrams = parseWoolMassGrams(
                    String(wObj.gradeWeightGrams ?? wObj.gradeGrams ?? wObj.grade ?? '')
                  );
                  const tGrams = parseWoolMassGrams(
                    String(wObj.totalWeightGrams ?? wObj.totalGrams ?? wObj.weight ?? '')
                  );
                  recordCapturedWoolHarvest(
                    nodeSpecies,
                    animal.id,
                    {
                      primeGrams: pGrams,
                      gradeGrams: gGrams,
                      totalGrams: tGrams || roundTenth(pGrams + gGrams),
                      intervalDays: Number(wObj.shearingIntervalDays ?? wObj.intervalDays) || undefined,
                      harvestDateIso: normalizeFlexibleDateIso(
                        String(wObj.harvestDateIso ?? wObj.harvestDate ?? wObj.date ?? '')
                      ),
                      harvestMethod: normalizeWoolHarvestMethod(wObj.harvestMethod, 'Shear'),
                      stapleLengthMm: Number(wObj.stapleLengthMm ?? wObj.stapleLength) || undefined,
                      iagarbScore: normalizeImportedIagarbScore(wObj.iagarbScore ?? wObj.iagarb),
                      notes: sanitizePlainText(wObj.notes ?? '', 500),
                    },
                    `${seed}-wh-${whIdx}`
                  );
                });
              } else {
                const pGrams = parseWoolMassGrams(
                  String(obj.woolPrimeGrams ?? obj.primeWoolGrams ?? '')
                );
                const gGrams = parseWoolMassGrams(
                  String(obj.woolGradeGrams ?? obj.gradeWoolGrams ?? '')
                );
                const tGrams = parseWoolMassGrams(
                  String(obj.woolTotalGrams ?? obj.woolGrams ?? obj.wool ?? obj.fleece ?? '')
                );
                const inlineIagarb = normalizeImportedIagarbScore(obj.iagarbScore ?? obj.iagarb);
                if (pGrams > 0 || gGrams > 0 || tGrams > 0 || inlineIagarb) {
                  recordCapturedWoolHarvest(
                    nodeSpecies,
                    animal.id,
                    {
                      primeGrams: pGrams,
                      gradeGrams: gGrams,
                      totalGrams: tGrams || roundTenth(pGrams + gGrams),
                      intervalDays: Number(obj.shearingIntervalDays) || undefined,
                      harvestDateIso: normalizeFlexibleDateIso(
                        String(obj.woolHarvestDateIso ?? obj.shearDate ?? '')
                      ),
                      harvestMethod: normalizeWoolHarvestMethod(obj.woolHarvestMethod, 'Shear'),
                      stapleLengthMm: Number(obj.woolStapleLengthMm ?? obj.stapleLengthMm) || undefined,
                      iagarbScore: inlineIagarb,
                    },
                    `${seed}-inline`
                  );
                }
              }
            }

            if (obj.sire && typeof obj.sire === 'object') {
              const sireNode = ingestTreeNode(obj.sire, 'Male', depth + 1, `${seed}-s`);
              if (sireNode) linkParentSafe(animal, 'sire', sireNode);
            }
            if (obj.dam && typeof obj.dam === 'object') {
              const damNode = ingestTreeNode(obj.dam, 'Female', depth + 1, `${seed}-d`);
              if (damNode) linkParentSafe(animal, 'dam', damNode);
            }
            return animal;
          };

          const rootObj =
            !Array.isArray(parsed) && parsed && typeof parsed === 'object'
              ? (parsed as Record<string, unknown>)
              : null;
          const rootNodes: unknown[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray(rootObj?.animals)
            ? (rootObj.animals as unknown[])
            : [parsed];

          let jsonCount = 0;
          rootNodes.forEach((n, idx) => {
            if (ingestTreeNode(n, 'Unknown', 0, `${entry.entryPath}-${idx}`)) {
              jsonCount++;
            }
          });

          if (rootObj && Array.isArray(rootObj.woolHarvests)) {
            rootObj.woolHarvests.forEach((rawWh, whIdx) => {
              if (!rawWh || typeof rawWh !== 'object' || Array.isArray(rawWh)) return;
              const wObj = rawWh as Record<string, unknown>;
              const rawAnimalId = typeof wObj.animalId === 'string' ? wObj.animalId.trim() : '';
              if (!rawAnimalId) return;
              const mappedAnimalId = jsonAnimalIdRemap.get(rawAnimalId) || rawAnimalId;
              const matchedAnimal = animalsById.get(mappedAnimalId);
              const whSpecies =
                typeof wObj.species === 'string' && wObj.species.trim()
                  ? wObj.species.trim()
                  : matchedAnimal?.species || sp.name;
              const pGrams = parseWoolMassGrams(
                String(wObj.primeWeightGrams ?? wObj.primeGrams ?? '')
              );
              const gGrams = parseWoolMassGrams(
                String(wObj.gradeWeightGrams ?? wObj.gradeGrams ?? '')
              );
              const tGrams = parseWoolMassGrams(
                String(wObj.totalWeightGrams ?? wObj.totalGrams ?? '')
              );
              recordCapturedWoolHarvest(
                whSpecies,
                mappedAnimalId,
                {
                  primeGrams: pGrams,
                  gradeGrams: gGrams,
                  totalGrams: tGrams || roundTenth(pGrams + gGrams),
                  intervalDays: Number(wObj.shearingIntervalDays) || undefined,
                  harvestDateIso: normalizeFlexibleDateIso(
                    String(wObj.harvestDateIso ?? wObj.harvestDate ?? '')
                  ),
                  harvestMethod: normalizeWoolHarvestMethod(wObj.harvestMethod, 'Shear'),
                  stapleLengthMm: Number(wObj.stapleLengthMm) || undefined,
                  iagarbScore: normalizeImportedIagarbScore(wObj.iagarbScore),
                  notes: sanitizePlainText(wObj.notes ?? '', 500),
                },
                `${entry.entryPath}-rootwh-${whIdx}`
              );
            });
          }
          diagnostics.push({
            archiveName: entry.archiveName,
            entryPath: entry.entryPath,
            classification: 'animals',
            rowCount: jsonCount,
            headers: ['JSON Pedigree'],
            matchedColumns: ['JSON Pedigree'],
            unmappedColumns: [],
          });
          if (jsonCount === 0) {
            warnings.push(
              `JSON file "${entry.baseName}" contained no recognizable animal or pedigree objects.`
            );
          }
          void sp;
          continue;
        } catch {
          warnings.push(
            `File "${entry.baseName}" could not be parsed as valid JSON (check for truncated download or stray text).`
          );
          continue;
        }
      }

      // 3. Delimited spreadsheet (CSV / TSV / Pipe / Semicolon) — Pass 1: subject rows + column mapping
      try {
        const { headers, rows } = parseDelimitedTable(text);
        if (headers.length === 0 || rows.length === 0) {
          warnings.push(`Spreadsheet "${entry.baseName}" contained no data rows.`);
          continue;
        }

        const resolution = resolveCsvColumnAssignments(
          headers,
          rows,
          options.csvColumnMapping,
          entry.entryPath
        );
        csvTables.push({
          archiveName: entry.archiveName,
          entryPath: entry.entryPath,
          rowCount: rows.length,
          columns: resolution.columns,
        });

        const pickField = (row: Record<string, string>, field: CsvTargetFieldKey): string => {
          const matchedHeaders = resolution.headersByField.get(field);
          if (!matchedHeaders || matchedHeaders.length === 0) return '';
          for (const hdr of matchedHeaders) {
            const val = (row[hdr] || '').trim();
            if (val) return val;
          }
          return '';
        };

        rows.forEach((row, rIdx) => {
          const spRaw = pickField(row, 'species');
          const sp = ensureSpecies(spRaw, headers.join(' '), entry.baseName);

          const name = pickField(row, 'name');
          const tattoo = pickField(row, 'tattoo');
          if (!name && !tattoo) return;

          const breed = pickField(row, 'breed');
          const variety = pickField(row, 'variety');
          const sex = normalizeSexLoose(pickField(row, 'sex'));
          const birthDateIso = normalizeFlexibleDateIso(pickField(row, 'birthDateIso'));
          const wtUnit = pickField(row, 'weightUnit');
          const weightGrams = parseFlexibleWeightToGrams(pickField(row, 'weight'), wtUnit);
          const regNum = pickField(row, 'registrationNumber');
          const gcNum = pickField(row, 'grandChampionNumber');
          const legs = Math.max(0, Number(pickField(row, 'legsCount')) || 0);
          const genotypeRaw = pickField(row, 'genotypeRaw');
          const rawStatus = pickField(row, 'status');
          const status = rawStatus ? normalizeAnimalStatus(rawStatus) : 'Active';
          const cageLocation = sanitizeSingleLineText(pickField(row, 'cageLocation'), 100);
          const breederName = sanitizeSingleLineText(pickField(row, 'breederName'), 140);
          const ownerName = sanitizeSingleLineText(pickField(row, 'ownerName'), 140);
          const notes = pickField(row, 'notes');

          const subject = resolveOrInsertAnimal(
            sp.name,
            {
              name: name || tattoo,
              tattoo,
              variety,
              breed,
              weightGrams,
              birthDateIso,
              registrationNumber: regNum,
              grandChampionNumber: gcNum,
              legsCount: legs,
              genotypeRaw,
              sex,
              status,
              archived: isAnimalArchived({ status }),
              cageLocation,
              breederName,
              ownerName,
              notes,
              isUnknown: false,
            },
            `${entry.entryPath}-r${rIdx}`,
            '',
            true
          );

          if (isWoolApplicableSpecies(sp.name)) {
            const woolPrime = parseWoolMassGrams(pickField(row, 'woolPrimeGrams'));
            const woolGrade = parseWoolMassGrams(pickField(row, 'woolGradeGrams'));
            const woolTotal = parseWoolMassGrams(pickField(row, 'woolTotalGrams'));
            const woolDate = normalizeFlexibleDateIso(pickField(row, 'woolHarvestDateIso'));
            const woolInterval = Number(pickField(row, 'woolShearingIntervalDays')) || undefined;
            const woolMethodRaw = pickField(row, 'woolHarvestMethod');
            const woolStaple = Number(pickField(row, 'woolStapleLengthMm')) || undefined;
            const woolIagarb = normalizeImportedIagarbScore(pickField(row, 'woolIagarbScore'));
            if (woolPrime > 0 || woolGrade > 0 || woolTotal > 0 || woolIagarb || woolStaple) {
              recordCapturedWoolHarvest(
                sp.name,
                subject.id,
                {
                  primeGrams: woolPrime,
                  gradeGrams: woolGrade,
                  totalGrams: woolTotal || roundTenth(woolPrime + woolGrade),
                  intervalDays: woolInterval,
                  harvestDateIso: woolDate,
                  harvestMethod: woolMethodRaw
                    ? normalizeWoolHarvestMethod(woolMethodRaw, 'Shear')
                    : 'Shear',
                  stapleLengthMm: woolStaple,
                  iagarbScore: woolIagarb,
                },
                `${entry.entryPath}-r${rIdx}`
              );
            }
          }

          pendingCsvParentRows.push({
            entryPath: entry.entryPath,
            rowNumber: rIdx + 1,
            row,
            resolution,
            subject,
            species: sp.name,
            breed,
          });
        });

        diagnostics.push({
          archiveName: entry.archiveName,
          entryPath: entry.entryPath,
          classification: 'animals',
          rowCount: rows.length,
          headers,
          matchedColumns: resolution.matchedColumns,
          unmappedColumns: resolution.unmappedColumns,
        });
      } catch (tableErr) {
        warnings.push(
          `Could not parse "${entry.baseName}": ${tableErr instanceof Error ? tableErr.message : 'Invalid file format.'}`
        );
      }
    }

    // Pass 2: Resolve CSV Sire/Dam & multi-gen ancestor links after all subject rows are indexed
    const createPlaceholdersForUnlinked = options.createPlaceholderAncestorsForUnlinked !== false;
    for (const item of pendingCsvParentRows) {
      const pickItemField = (field: CsvTargetFieldKey): string => {
        const matchedHeaders = item.resolution.headersByField.get(field);
        if (!matchedHeaders || matchedHeaders.length === 0) return '';
        for (const hdr of matchedHeaders) {
          const val = (item.row[hdr] || '').trim();
          if (val) return val;
        }
        return '';
      };

      const roleAnimals: Record<
        'subject' | 'sire' | 'dam' | 'pgs' | 'pgd' | 'mgs' | 'mgd',
        Pick<Animal, 'id'> | undefined
      > = {
        subject: item.subject,
        sire: undefined,
        dam: undefined,
        pgs: undefined,
        pgd: undefined,
        mgs: undefined,
        mgd: undefined,
      };

      for (const spec of MULTI_GEN_COLUMN_SPECS) {
        const rawAncRef = pickItemField(spec.targetField);
        if (!rawAncRef || /^(?:unknown|none|n\/a|na|-|0)$/i.test(rawAncRef)) continue;
        const childTarget = roleAnimals[spec.childRole];
        if (!childTarget) continue;

        const childAnimal = animalsById.get(childTarget.id);
        if (!childAnimal) continue;

        const ancMeta = parseAncestorTextLines([rawAncRef], spec.sex);
        if (ancMeta.isUnknown || !ancMeta.name) continue;

        const spLower = item.species.trim().toLowerCase();
        const candidateTokens = [
          ancMeta.tattoo,
          ancMeta.registrationNumber,
          ancMeta.name,
          rawAncRef,
        ]
          .map((t) => (t || '').trim().toLowerCase())
          .filter((t) => t.length > 0 && t !== 'imported ancestor');

        let matchedRealAnimal: Animal | undefined;
        let matchedPlaceholderId: string | undefined;

        for (const tok of candidateTokens) {
          const hitId = animalLookup.get(`${spLower}::${tok}`);
          if (hitId) {
            if (resolvedRealAnimalIds.has(hitId)) {
              matchedRealAnimal = animalsById.get(hitId);
              break;
            }
            if (!matchedPlaceholderId) {
              matchedPlaceholderId = hitId;
            }
          }
        }

        if (!matchedRealAnimal) {
          matchedRealAnimal = findExistingBarnParent(item.species, [
            ancMeta.tattoo,
            ancMeta.registrationNumber,
            ancMeta.name,
            rawAncRef,
          ]);
        }

        let resolvedParentTarget: Pick<Animal, 'id'> | undefined = matchedRealAnimal;

        if (!resolvedParentTarget) {
          if (createPlaceholdersForUnlinked) {
            const alreadyCount = animalsById.size;
            const placeholderAnimal = matchedPlaceholderId
              ? animalsById.get(matchedPlaceholderId)
              : resolveOrInsertAnimal(
                  item.species,
                  ancMeta,
                  `${item.entryPath}-r${item.rowNumber}-${spec.childRole}-${spec.linkSide}`,
                  item.breed,
                  false
                );
            if (animalsById.size > alreadyCount) {
              placeholderAncestorsCreated++;
            }
            if (placeholderAnimal) {
              registerToken(item.species, rawAncRef, placeholderAnimal.id);
              resolvedParentTarget = placeholderAnimal;
            }
          }

          if (spec.childRole === 'subject') {
            unresolvedParentLinks.push({
              entryPath: item.entryPath,
              rowNumber: item.rowNumber,
              childAnimalId: item.subject.id,
              childName: item.subject.name,
              childTattoo: item.subject.tattoo,
              species: item.species,
              role: spec.linkSide,
              rawReference: rawAncRef,
              placeholderCreated: Boolean(resolvedParentTarget),
              placeholderAnimalId: resolvedParentTarget?.id,
            });
          }
        }

        if (!resolvedParentTarget) continue;

        linkParentSafe(childAnimal, spec.linkSide, resolvedParentTarget);

        if (spec.childRole === 'subject' && spec.linkSide === 'sire') roleAnimals.sire = resolvedParentTarget;
        else if (spec.childRole === 'subject' && spec.linkSide === 'dam') roleAnimals.dam = resolvedParentTarget;
        else if (spec.childRole === 'sire' && spec.linkSide === 'sire') roleAnimals.pgs = resolvedParentTarget;
        else if (spec.childRole === 'sire' && spec.linkSide === 'dam') roleAnimals.pgd = resolvedParentTarget;
        else if (spec.childRole === 'dam' && spec.linkSide === 'sire') roleAnimals.mgs = resolvedParentTarget;
        else if (spec.childRole === 'dam' && spec.linkSide === 'dam') roleAnimals.mgd = resolvedParentTarget;
      }
    }

    if (binaryUnsupportedNames.length > 0) {
      const sample = binaryUnsupportedNames.slice(0, 4).join(', ');
      warnings.push(
        `Skipped unsupported binary file(s) (${sample}). For Excel (.XLSX/.XLS), save as CSV or UTF-8 CSV; for desktop programs (Evans/Kintracs/ZooEasy), export .HTM/.HTML pedigrees or CSV/TSV tables.`
      );
    }

    const allKnownAnimalsById = new Map<string, Animal>();
    for (const ex of existingSnapshot.animals) allKnownAnimalsById.set(ex.id, ex);
    for (const inc of animalsById.values()) {
      if (!allKnownAnimalsById.has(inc.id)) allKnownAnimalsById.set(inc.id, inc);
    }

    const conflicts: AnimalImportConflict[] = [];
    for (const [animalId, match] of matchedExistingByAnimalId.entries()) {
      const inc = animalsById.get(animalId);
      if (!inc) continue;
      const contradictions = buildAnimalContradictions(match.animal, inc, {
        preferredUnit: existingSnapshot.settings.preferredUnit,
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

    const woolHarvests = Array.from(woolHarvestsById.values());

    const reportLines: string[] = [
      `Importer: ${this.name}`,
      `Files (${archiveNames.length}): ${archiveNames.join(', ')}`,
      `Animals & Ancestors Parsed: ${animalsById.size} (${parentLinksResolved} parent links resolved)`,
      ...(woolHarvests.length > 0
        ? [`Wool / Fiber Records Captured: ${woolHarvests.length}`]
        : []),
      ...diagnostics.map(
        (d) =>
          `- [${d.classification}] ${d.entryPath} (${d.rowCount} items) | Matched: ${d.matchedColumns.join(', ')}`
      ),
    ];

    return {
      platformId: this.id,
      platformName: this.name,
      archiveNames,
      diagnostics,
      stagedPhotos: [],
      stagedPhotosRawBytes: 0,
      missingPhotoZipRefsCount: 0,
      deferredMediaCount: 0,
      deferredMediaBytes: 0,
      deferredMediaSampleNames: [],
      deferredManifestRowCount: 0,
      animalsWithMultipleImagesCount: 0,
      warnings,
      speciesDetected: Array.from(speciesDetectedSet),
      newSpeciesProfiles,
      animals: Array.from(animalsById.values()),
      matchedExistingAnimalsCount: matchedExistingByAnimalId.size,
      conflicts,
      parentLinksResolved,
      placeholderAncestorsCreated,
      cages: [],
      breedings: [],
      tasks: [],
      careLogs: [],
      shows: [],
      woolHarvests,
      csvTables,
      unresolvedParentLinks,
      schemaDiagnosticReport: reportLines.join('\n'),
    };
  },
};
