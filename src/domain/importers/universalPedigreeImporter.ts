/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Universal Pedigree, Evans `.HTM` & Multi-System Spreadsheet Importer
 * (`src/domain/importers/universalPedigreeImporter.ts`).
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
  isAnimalArchived,
  isSameSpecies,
  normalizeAnimalStatus,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  resolveSpeciesProfile,
  SpeciesProfile,
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

  for (let i = 0; i < lines.length; i++) {
    const tokens = lines[i].split(/\s*[·|•;]\s*/).map((t) => t.trim()).filter(Boolean);
    for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
      const tok = tokens[tIdx];
      if (i === 0 && tIdx === 0 && !/^(?:id|ear|tattoo|dob|born|reg|gc|legs|wt|weight)\s*:/i.test(tok)) {
        name = tok.replace(/^(?:name|animal)\s*:\s*/i, '').trim();
        continue;
      }

      const idMatch = tok.match(/^(?:id|ear(?:\s*tag|\s*#)?|tattoo|tat\.?)\s*:?\s*(.+)$/i);
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
  linkParent: (child: Animal, role: 'sire' | 'dam', parent: Animal) => void
): { animalsImported: number; ancestorLinks: number } {
  const html = entry.textContent || '';
  if (!html.trim()) return { animalsImported: 0, ancestorLinks: 0 };

  let animalsImported = 0;
  let ancestorLinks = 0;

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
      createAnimalRecord(subjectMeta, `${entry.entryPath}-subject`);
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

      const ancAnimal = createAnimalRecord(
        meta,
        `${entry.entryPath}-g${genDepth}-s${slotIndex}`,
        subjectAnimal?.breed || ''
      );
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
    const csvTables: CsvTableMappingSummary[] = [];
    const unresolvedParentLinks: UnresolvedParentLink[] = [];
    let parentLinksResolved = 0;
    let placeholderAncestorsCreated = 0;

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
          linkParentSafe
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

          const rootNodes: unknown[] = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as Record<string, unknown>).animals)
            ? ((parsed as Record<string, unknown>).animals as unknown[])
            : [parsed];

          let jsonCount = 0;
          rootNodes.forEach((n, idx) => {
            if (ingestTreeNode(n, 'Unknown', 0, `${entry.entryPath}-${idx}`)) {
              jsonCount++;
            }
          });
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

    const reportLines: string[] = [
      `Importer: ${this.name}`,
      `Files (${archiveNames.length}): ${archiveNames.join(', ')}`,
      `Animals & Ancestors Parsed: ${animalsById.size} (${parentLinksResolved} parent links resolved)`,
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
      csvTables,
      unresolvedParentLinks,
      schemaDiagnosticReport: reportLines.join('\n'),
    };
  },
};
