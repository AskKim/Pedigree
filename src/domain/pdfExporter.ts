/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript 100% Offline PDF 1.4 Generator (`src/domain/pdfExporter.ts`).
 *
 * Produces vector-sharp, searchable, standards-compliant PDF 1.4 binaries (`Uint8Array`)
 * for multi-generation ARBA/Evans-style pedigrees with zero external dependencies and
 * zero browser DOM (`window`, `document`) calls.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Runs identically in Web Workers, Node/Vitest, PWA main thread, and React Native / Expo.
 * Raster images (optional breeder logo & subject portrait) are accepted as pre-encoded
 * baseline JPEG payloads (`PdfRasterImage`) and embedded natively via PDF `/DCTDecode`.
 */

import { formatCompactCarrierDisclosure } from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  Animal,
  BarnSettings,
  formatPedigreeWeight,
  formatReadableDate,
  formatSexForSpecies,
  normalizePedigreeGenerationDepth,
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
import { hexToPdfRgb, resolvePedigreePrintTheme } from './pedigreePrintStyles';
import { computeAnimalShowSummary } from './showResults';
import type {
  BlankPedigreeTemplateOptions,
  PedigreePrintOrientation,
  PedigreePrintOptions,
} from './syncAndExports';
import { buildDefaultBreederContactLine } from './syncAndExports';
import {
  AnimalWoolSummary,
  buildWoolHarvestSummaryByAnimalId,
  formatWoolWeightSummary,
  summarizeAnimalWoolHarvests,
} from './woolFiber';

export interface PdfRasterImage {
  /** Raw JPEG bytes (`FF D8 ... FF D9`) for native PDF `/DCTDecode` embedding. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface PedigreePdfExportParams {
  subject: Animal;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  generations?: PedigreeGenerationDepth;
  printOptions?: PedigreePrintOptions;
  subjectPhotoJpeg?: PdfRasterImage;
  breederLogoJpeg?: PdfRasterImage;
}

const PT_LETTER_SHORT = 612; // 8.5 in * 72 pt/in
const PT_LETTER_LONG = 792; // 11.0 in * 72 pt/in

function toPdfAscii(raw: string): string {
  return (raw || '')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00B7|\u2022/g, '|')
    .replace(/\u2192/g, '->')
    .replace(/\u00D7/g, 'x')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfLiteral(raw: string): string {
  return toPdfAscii(raw)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function estimateTextWidthPt(text: string, fontSize: number, isBold = false): number {
  const avgFactor = isBold ? 0.56 : 0.52;
  return text.length * fontSize * avgFactor;
}

function wrapPdfLines(
  rawText: string,
  maxWidthPt: number,
  fontSize: number,
  maxLines: number,
  isBold = false
): string[] {
  const clean = toPdfAscii(rawText);
  if (!clean || maxLines <= 0 || maxWidthPt <= 8) return [];
  const maxCharsPerLine = Math.max(4, Math.floor(maxWidthPt / (fontSize * (isBold ? 0.56 : 0.52))));
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushTruncated = (text: string) => {
    if (text.length <= maxCharsPerLine) {
      lines.push(text);
    } else {
      lines.push(`${text.slice(0, Math.max(1, maxCharsPerLine - 3))}...`);
    }
  };

  for (const word of words) {
    if (!current) {
      if (word.length <= maxCharsPerLine) {
        current = word;
      } else {
        current = word.slice(0, maxCharsPerLine);
      }
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      lines.push(current);
      if (lines.length >= maxLines) {
        const last = lines[lines.length - 1];
        if (last.length > maxCharsPerLine - 3) {
          lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxCharsPerLine - 3))}...`;
        } else {
          lines[lines.length - 1] = `${last}...`;
        }
        return lines;
      }
      current = word.length <= maxCharsPerLine ? word : word.slice(0, maxCharsPerLine);
    }
  }

  if (current && lines.length < maxLines) {
    pushTruncated(current);
  }
  return lines.slice(0, maxLines);
}

function encodeAsciiBytes(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}

function fmtPt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function isValidJpegImage(img?: PdfRasterImage): img is PdfRasterImage {
  return Boolean(
    img &&
      img.bytes &&
      img.bytes.byteLength >= 4 &&
      img.width > 0 &&
      img.height > 0 &&
      img.bytes[0] === 0xff &&
      img.bytes[1] === 0xd8
  );
}

const GEN_COLUMN_TITLES: readonly string[] = [
  'Parents (Gen 1)',
  'Grandparents (Gen 2)',
  'Great-Grandparents (Gen 3)',
  '4th Gen (Gen 4)',
  '5th Gen (Gen 5)',
  '6th Gen (Gen 6)',
  '7th Gen (Gen 7)',
  '8th Gen (Gen 8)',
];

function formatAncestorLabel(animal: Animal | null | undefined, roleFallback: string): string {
  if (!animal) return `${roleFallback} (Unknown)`;
  return animal.tattoo ? `${animal.name} (${animal.tattoo})` : animal.name;
}

/**
 * Builds a clean, vector-text + optional JPEG-image US Letter PDF (`Uint8Array`)
 * for 3–8 generation ARBA/Evans pedigrees.
 * - 3–6 Generations: Single-page US Letter certificate.
 * - 7 Generations: 2-page US Letter chart (Sire's Line Gen 2–7, Dam's Line Gen 2–7).
 * - 8 Generations: 4-page US Letter chart (one quadrant per Gen-2 Grandparent, Gen 3–8).
 */
export function buildPedigreePdfBytes(params: PedigreePdfExportParams): Uint8Array {
  const {
    subject,
    allAnimals,
    speciesProfiles,
    settings,
    generations = 3,
    printOptions,
    subjectPhotoJpeg,
    breederLogoJpeg,
  } = params;

  const depth = normalizePedigreeGenerationDepth(generations, 3);
  const theme = resolvePedigreePrintTheme(printOptions, settings.customColors);
  const primaryRgb = hexToPdfRgb(theme.primaryHex);
  const accentRgb = hexToPdfRgb(theme.accentHex);
  const sireRgb = hexToPdfRgb(theme.sireHex);
  const damRgb = hexToPdfRgb(theme.damHex);
  const borderRgb = hexToPdfRgb(theme.borderHex);
  const cellBorderRgb = hexToPdfRgb(theme.cellBorderHex);
  const inkRgb = hexToPdfRgb(theme.inkHex);
  const mutedInkRgb = hexToPdfRgb(theme.mutedInkHex);

  const orientation: PedigreePrintOrientation =
    printOptions?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isPortrait = orientation === 'portrait';
  const isCompactLedger = theme.layoutPreset === 'compact_ledger';
  const isShowCert = theme.layoutPreset === 'show_certificate';

  const pageWidth = isPortrait ? PT_LETTER_SHORT : PT_LETTER_LONG;
  const pageHeight = isPortrait ? PT_LETTER_LONG : PT_LETTER_SHORT;
  const margin = depth >= 5 || isCompactLedger ? 24 : isPortrait ? 28 : 32;
  const contentWidth = pageWidth - margin * 2;

  const sp = resolveSpeciesProfile(subject.species, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, subject.species);
  const slots = buildPedigreeSlots(subject, herdById, depth, sp);
  const coi = calculateAnimalCoi(subject, herdById);

  const showWeights = printOptions?.showWeights ?? true;
  const arbaLbsOzDotNotation = Boolean(printOptions?.arbaLbsOzDotNotation);
  const showGenotypes = printOptions?.showGenotypes ?? true;
  const showBreederFooter = printOptions?.showBreederFooter ?? true;
  const breederContactLine = (printOptions?.breederContactLine || '').trim();
  const showBreederLogo = printOptions?.showBreederLogo ?? true;
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  const hasLogo = showBreederLogo && isValidJpegImage(breederLogoJpeg);
  const hasPhoto = isValidJpegImage(subjectPhotoJpeg);

  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });

  const subjectFields: string[] = [
    `Name: ${subject.name}`,
    `Tattoo/ID: ${subject.tattoo || 'Unmarked'}`,
    `Breed & Variety: ${[subject.breed, subject.variety].filter(Boolean).join(' ') || 'Unspecified'}`,
    `Sex: ${formatSexForSpecies(subject.sex, sp)}`,
    `DOB: ${formatReadableDate(subject.birthDateIso)}`,
  ];
  if (showWeights) {
    subjectFields.push(
      `Weight: ${formatPedigreeWeight(subject.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation)}`
    );
  }
  if (subject.registrationNumber) subjectFields.push(`Reg #: ${subject.registrationNumber}`);
  if (subject.grandChampionNumber) subjectFields.push(`GC #: ${subject.grandChampionNumber}`);
  const subjShow = computeAnimalShowSummary(
    subject,
    printOptions?.shows ?? [],
    printOptions?.careLogs ?? []
  );
  if (subjShow.effectiveLegs > 0 || subjShow.showsEntered > 0) {
    subjectFields.push(`Legs / GC: ${subjShow.gcProgress.shortLabel}`);
  }
  if (subjShow.awardsSummaryText) {
    subjectFields.push(`Show Wins: ${subjShow.awardsSummaryText}`);
  }
  if (subjShow.totalPoints > 0) {
    subjectFields.push(`Show Points: ${subjShow.totalPoints}`);
  }
  if (subject.rufusLevel) subjectFields.push(`Rufus: ${subject.rufusLevel}`);
  const woolHarvestList = printOptions?.woolHarvests ?? [];
  const woolSummaryByAnimalId =
    woolHarvestList.length > 0
      ? buildWoolHarvestSummaryByAnimalId(woolHarvestList)
      : new Map<string, AnimalWoolSummary>();
  const subjectWool =
    woolHarvestList.length > 0 ? summarizeAnimalWoolHarvests(woolHarvestList, subject.id) : null;
  const subjectWoolLine = subjectWool ? formatWoolWeightSummary(subjectWool) : '';
  if (subjectWoolLine) subjectFields.push(`Wool / Fiber: ${subjectWoolLine}`);
  if (showGenotypes && subjectGeno) subjectFields.push(`Genotype: ${subjectGeno}`);
  if (subjectCarriers) subjectFields.push(`Carriers: ${subjectCarriers}`);

  const hasNotice =
    (showGenotypes &&
      (Boolean(subjectGeno) ||
        slots.some((sl) => Boolean(sl.animal && (sl.animal.genotypeRaw || sl.animal.genotype.length))))) ||
    Boolean(subject.rufusLevel);

  interface PageSlice {
    rootGen: number;
    rootSlotIdx: number;
    branchBanner: string;
    pageNumber: number;
    totalPages: number;
  }

  const pageSlices: PageSlice[] = [];
  if (depth <= 6) {
    pageSlices.push({
      rootGen: 0,
      rootSlotIdx: 0,
      branchBanner: '',
      pageNumber: 1,
      totalPages: 1,
    });
  } else if (depth === 7) {
    const sire = slotMap.get('1:0')?.animal;
    const dam = slotMap.get('1:1')?.animal;
    pageSlices.push(
      {
        rootGen: 1,
        rootSlotIdx: 0,
        branchBanner: `Sheet 1 of 2 | ${sp.maleLabel}'s Ancestry Line (Gen 2-7): ${formatAncestorLabel(sire, sp.maleLabel)}`,
        pageNumber: 1,
        totalPages: 2,
      },
      {
        rootGen: 1,
        rootSlotIdx: 1,
        branchBanner: `Sheet 2 of 2 | ${sp.femaleLabel}'s Ancestry Line (Gen 2-7): ${formatAncestorLabel(dam, sp.femaleLabel)}`,
        pageNumber: 2,
        totalPages: 2,
      }
    );
  } else {
    const quadrantConfigs: Array<{ idx: number; label: string }> = [
      { idx: 0, label: `Paternal Grandsire Line (${sp.maleLabel}'s ${sp.maleLabel})` },
      { idx: 1, label: `Paternal Granddam Line (${sp.maleLabel}'s ${sp.femaleLabel})` },
      { idx: 2, label: `Maternal Grandsire Line (${sp.femaleLabel}'s ${sp.maleLabel})` },
      { idx: 3, label: `Maternal Granddam Line (${sp.femaleLabel}'s ${sp.femaleLabel})` },
    ];
    quadrantConfigs.forEach((quad, qIdx) => {
      const parentSlot = slotMap.get(`1:${quad.idx >> 1}`)?.animal;
      const gpSlot = slotMap.get(`2:${quad.idx}`)?.animal;
      const parentTag = quad.idx < 2 ? sp.maleLabel : sp.femaleLabel;
      pageSlices.push({
        rootGen: 2,
        rootSlotIdx: quad.idx,
        branchBanner: `Sheet ${qIdx + 1} of 4 | ${quad.label}: ${formatAncestorLabel(parentSlot, parentTag)} -> ${formatAncestorLabel(gpSlot, 'Gen 2')} (Gen 3-8)`,
        pageNumber: qIdx + 1,
        totalPages: 4,
      });
    });
  }

  const renderPageStream = (slice: PageSlice): Uint8Array => {
    const ops: string[] = [];
    const drawText = (
      x: number,
      yTop: number,
      text: string,
      font: 'F1' | 'F2' | 'F3',
      size: number,
      rgb: [number, number, number] = inkRgb
    ) => {
      const clean = escapePdfLiteral(text);
      if (!clean) return;
      const pdfY = pageHeight - yTop;
      ops.push(
        `BT /${font} ${fmtPt(size)} Tf ${rgb.map((v) => v.toFixed(3)).join(' ')} rg 1 0 0 1 ${fmtPt(x)} ${fmtPt(pdfY)} Tm (${clean}) Tj ET`
      );
    };

    const drawRect = (
      x: number,
      yTop: number,
      w: number,
      h: number,
      opts?: {
        fillRgb?: [number, number, number];
        strokeRgb?: [number, number, number];
        lineWidth?: number;
      }
    ) => {
      const pdfBottom = pageHeight - (yTop + h);
      ops.push('q');
      if (opts?.lineWidth !== undefined) {
        ops.push(`${fmtPt(opts.lineWidth)} w`);
      }
      if (opts?.fillRgb) {
        ops.push(`${opts.fillRgb.map((v) => v.toFixed(3)).join(' ')} rg`);
      }
      if (opts?.strokeRgb) {
        ops.push(`${opts.strokeRgb.map((v) => v.toFixed(3)).join(' ')} RG`);
      }
      ops.push(`${fmtPt(x)} ${fmtPt(pdfBottom)} ${fmtPt(w)} ${fmtPt(h)} re`);
      if (opts?.fillRgb && opts?.strokeRgb) {
        ops.push('B');
      } else if (opts?.fillRgb) {
        ops.push('f');
      } else {
        ops.push('S');
      }
      ops.push('Q');
    };

    const drawLine = (
      x1: number,
      yTop1: number,
      x2: number,
      yTop2: number,
      rgb: [number, number, number] = cellBorderRgb,
      lineWidth = 0.75
    ) => {
      ops.push('q');
      ops.push(`${fmtPt(lineWidth)} w`);
      ops.push(`${rgb.map((v) => v.toFixed(3)).join(' ')} RG`);
      ops.push(`${fmtPt(x1)} ${fmtPt(pageHeight - yTop1)} m ${fmtPt(x2)} ${fmtPt(pageHeight - yTop2)} l S`);
      ops.push('Q');
    };

    const drawImage = (
      name: string,
      x: number,
      yTop: number,
      w: number,
      h: number
    ) => {
      const pdfBottom = pageHeight - (yTop + h);
      ops.push(`q ${fmtPt(w)} 0 0 ${fmtPt(h)} ${fmtPt(x)} ${fmtPt(pdfBottom)} cm /${name} Do Q`);
    };

    // White page backdrop
    drawRect(0, 0, pageWidth, pageHeight, { fillRgb: [1, 1, 1] });

    // Outer frame for double_frame or modern_rounded
    const frameInset = theme.borderStyle === 'double_frame' ? 8 : 0;
    if (theme.borderStyle === 'double_frame') {
      const outerPad = Math.max(8, margin - 8);
      drawRect(outerPad, outerPad, pageWidth - outerPad * 2, pageHeight - outerPad * 2, {
        strokeRgb: borderRgb,
        lineWidth: 1.4,
      });
      drawRect(outerPad + 3, outerPad + 3, pageWidth - (outerPad + 3) * 2, pageHeight - (outerPad + 3) * 2, {
        strokeRgb: borderRgb,
        lineWidth: 0.65,
      });
    } else if (theme.borderStyle === 'modern_rounded') {
      const outerPad = Math.max(10, margin - 6);
      drawRect(outerPad, outerPad, pageWidth - outerPad * 2, pageHeight - outerPad * 2, {
        strokeRgb: borderRgb,
        lineWidth: 1.0,
      });
    }

    const innerLeft = margin + frameInset * 0.5;
    const innerWidth = contentWidth - frameInset;
    let cursorY = margin + frameInset * 0.5;

    // --- Header Band ---
    const headerHeight = isCompactLedger ? (hasLogo ? 32 : 26) : hasLogo ? 40 : 32;
    const barnTitle = settings.barnName || 'Pedigree';
    const pageSuffix = slice.totalPages > 1 ? ` | Page ${slice.pageNumber}/${slice.totalPages}` : '';
    const subLeft = `${
      theme.layoutPreset === 'iagarb_angora'
        ? `IAGARB German Angora ${depth}-Generation Wool Pedigree`
        : theme.layoutPreset === 'family_portrait'
        ? `Family Portrait ${depth}-Generation ${subject.species} Pedigree`
        : `Official ${depth}-Generation ${subject.species} Pedigree Certificate`
    }${settings.breederName ? ` | Breeder: ${settings.breederName}` : ''}`;
    const rightMeta = `Generated ${formatReadableDate(nowIsoUtc().slice(0, 10))} | Wright COI: ${coi.coiPercent.toFixed(2)}% (${coi.risk.label})${pageSuffix}`;

    if (isShowCert && !hasLogo) {
      const titleSize = isPortrait ? 15 : 16.5;
      const titleW = estimateTextWidthPt(toPdfAscii(barnTitle), titleSize, true);
      drawText(innerLeft + Math.max(0, (innerWidth - titleW) / 2), cursorY + 13, barnTitle, 'F2', titleSize, primaryRgb);
      const centeredSub = `${subLeft}  |  ${rightMeta}`;
      const subSize = isPortrait ? 7.5 : 8.2;
      const subW = estimateTextWidthPt(toPdfAscii(centeredSub), subSize, false);
      drawText(innerLeft + Math.max(0, (innerWidth - subW) / 2), cursorY + 26, centeredSub, 'F1', subSize, mutedInkRgb);
    } else {
      let titleOffsetX = innerLeft;
      if (hasLogo && breederLogoJpeg) {
        const maxLogoH = isCompactLedger ? 26 : 34;
        const maxLogoW = isCompactLedger ? 76 : 92;
        const scale = Math.min(maxLogoW / breederLogoJpeg.width, maxLogoH / breederLogoJpeg.height);
        const drawW = Math.max(12, breederLogoJpeg.width * scale);
        const drawH = Math.max(12, breederLogoJpeg.height * scale);
        drawImage('ImLogo', innerLeft, cursorY + (headerHeight - 6 - drawH) / 2, drawW, drawH);
        titleOffsetX = innerLeft + drawW + 10;
      }

      drawText(
        titleOffsetX,
        cursorY + (isCompactLedger ? 12 : 14),
        barnTitle,
        'F2',
        isCompactLedger ? 13 : isPortrait ? 14 : 15,
        primaryRgb
      );
      drawText(
        titleOffsetX,
        cursorY + (isCompactLedger ? 23 : 27),
        subLeft,
        'F1',
        isCompactLedger ? 7.5 : isPortrait ? 8 : 8.5,
        mutedInkRgb
      );
      const rightSize = isCompactLedger ? 7.2 : isPortrait ? 7.5 : 8.5;
      const rightW = estimateTextWidthPt(toPdfAscii(rightMeta), rightSize, false);
      drawText(
        Math.max(titleOffsetX + 180, innerLeft + innerWidth - rightW),
        cursorY + (isCompactLedger ? 23 : 27),
        rightMeta,
        'F1',
        rightSize,
        mutedInkRgb
      );
    }

    cursorY += headerHeight;
    drawLine(
      innerLeft,
      cursorY,
      innerLeft + innerWidth,
      cursorY,
      borderRgb,
      theme.borderStyle === 'minimal_lines' ? 0.8 : 1.5
    );
    cursorY += isCompactLedger ? 5 : 8;

    // --- Subject Summary Box (Full on Page 1 or 3-6G, Compact on Pages 2-4 of 7-8G) ---
    const isContinuationPage = slice.pageNumber > 1;
    if (isContinuationPage) {
      const compactText = `${subject.name}${subject.tattoo ? ` (${subject.tattoo})` : ''} | ${[subject.breed, subject.variety].filter(Boolean).join(' ')} | ${formatSexForSpecies(subject.sex, sp)} | Wright COI: ${coi.coiPercent.toFixed(2)}%`;
      drawRect(innerLeft, cursorY, innerWidth, 18, {
        fillRgb: [1, 1, 1],
        strokeRgb: theme.borderStyle === 'minimal_lines' ? cellBorderRgb : borderRgb,
        lineWidth: 0.65,
      });
      drawText(innerLeft + 6, cursorY + 12, compactText, 'F2', 8, inkRgb);
      cursorY += 22;
    } else {
      const photoBoxSize = hasPhoto ? (isCompactLedger ? 40 : isPortrait ? 52 : 58) : 0;
      const subjectTextX = innerLeft + 8 + (hasPhoto ? photoBoxSize + 10 : 0);
      const subjectTextWidth = innerWidth - 16 - (hasPhoto ? photoBoxSize + 10 : 0);
      const subjectFontSize = isCompactLedger ? 7.5 : isPortrait ? 8 : 8.5;
      const subjectLineHeight = isCompactLedger ? 9.5 : 11;
      const subjectLines = wrapPdfLines(
        subjectFields.join('   |   '),
        subjectTextWidth,
        subjectFontSize,
        isCompactLedger ? 3 : 5
      );
      const subjectBoxH = Math.max(
        hasPhoto ? photoBoxSize + 10 : isCompactLedger ? 26 : 34,
        subjectLines.length * subjectLineHeight + (isCompactLedger ? 8 : 12)
      );

      drawRect(innerLeft, cursorY, innerWidth, subjectBoxH, {
        fillRgb: [1, 1, 1],
        strokeRgb: theme.borderStyle === 'minimal_lines' ? cellBorderRgb : borderRgb,
        lineWidth: theme.borderStyle === 'minimal_lines' ? 0.6 : 0.85,
      });

      if (hasPhoto && subjectPhotoJpeg) {
        const scale = Math.min(photoBoxSize / subjectPhotoJpeg.width, photoBoxSize / subjectPhotoJpeg.height);
        const drawW = Math.max(12, subjectPhotoJpeg.width * scale);
        const drawH = Math.max(12, subjectPhotoJpeg.height * scale);
        const px = innerLeft + 8 + (photoBoxSize - drawW) / 2;
        const py = cursorY + (subjectBoxH - drawH) / 2;
        drawImage('ImPhoto', px, py, drawW, drawH);
      }

      subjectLines.forEach((line, idx) => {
        drawText(subjectTextX, cursorY + (isCompactLedger ? 10 : 13) + idx * subjectLineHeight, line, 'F1', subjectFontSize, inkRgb);
      });

      cursorY += subjectBoxH + (isCompactLedger ? 5 : 8);
    }

    if (slice.branchBanner) {
      drawRect(innerLeft, cursorY, innerWidth, 16, {
        fillRgb: [1, 1, 1],
        strokeRgb: borderRgb,
        lineWidth: 0.75,
      });
      drawText(innerLeft + 6, cursorY + 11, slice.branchBanner, 'F2', 7.8, primaryRgb);
      cursorY += 20;
    }

    // --- Footer / Notice Height Reservation ---
    const showFooterOnThisPage = showBreederFooter && (slice.totalPages === 1 || slice.pageNumber === slice.totalPages);
    const noticeHeight = hasNotice ? 14 : 0;
    const footerHeight = showFooterOnThisPage ? (breederContactLine ? 38 : 26) : 0;
    const bottomReserved =
      margin +
      frameInset * 0.5 +
      noticeHeight +
      footerHeight +
      (noticeHeight || footerHeight ? 8 : 0);

    const tableTopY = cursorY;
    const displayGenStart = slice.rootGen + 1;
    const displayColCount = depth - slice.rootGen;
    const tableHeaderH = depth >= 5 || isCompactLedger ? 16 : 20;
    const availableTableBodyH = Math.max(160, pageHeight - bottomReserved - tableTopY - tableHeaderH);

    // --- Generation Column Headers ---
    const colW = innerWidth / displayColCount;
    const headerFontSize = depth >= 5 || isPortrait || isCompactLedger ? 7.3 : 8.5;

    for (let c = 0; c < displayColCount; c++) {
      const g = displayGenStart + c;
      const gx = innerLeft + c * colW;
      drawRect(gx, tableTopY, colW, tableHeaderH, {
        fillRgb: [1, 1, 1],
        strokeRgb: borderRgb,
        lineWidth: theme.borderStyle === 'minimal_lines' ? 0.65 : 0.9,
      });
      drawText(
        gx + 4,
        tableTopY + tableHeaderH - 5,
        GEN_COLUMN_TITLES[g - 1] || `Gen ${g}`,
        'F2',
        headerFontSize,
        primaryRgb
      );
    }

    // --- Ancestor Matrix Cells ---
    const bodyTopY = tableTopY + tableHeaderH;
    const compactMode = depth >= 5 || isCompactLedger;
    const cellBorderWidth = theme.borderStyle === 'minimal_lines' ? 0.35 : 0.55;

    for (let c = 0; c < displayColCount; c++) {
      const g = displayGenStart + c;
      const relDepth = g - slice.rootGen; // 1..displayColCount
      const localSlotCount = 1 << relDepth;
      const cellH = availableTableBodyH / localSlotCount;
      const gx = innerLeft + c * colW;
      const padX = compactMode ? 3.5 : 5;
      const innerCellW = Math.max(18, colW - padX * 2);

      const nameSize =
        cellH < 8
          ? 4.6
          : cellH < 12
          ? 5.2
          : cellH < 20
          ? 6.2
          : cellH < 36
          ? 7.2
          : isPortrait && depth >= 4
          ? 7.6
          : 8.5;
      const metaSize = Math.max(4.4, nameSize - 1.1);
      const lineStep = Math.max(5.5, metaSize + 1.6);

      for (let localIdx = 0; localIdx < localSlotCount; localIdx++) {
        const globalSlotIdx = (slice.rootSlotIdx << relDepth) + localIdx;
        const cy = bodyTopY + localIdx * cellH;
        const slot = slotMap.get(`${g}:${globalSlotIdx}`);
        const animal = slot?.animal;
        const isSire = globalSlotIdx % 2 === 0;
        const roleTag = isSire ? sp.maleLabel : sp.femaleLabel;

        drawRect(gx, cy, colW, cellH, {
          fillRgb: [1, 1, 1],
          strokeRgb: cellBorderRgb,
          lineWidth: cellBorderWidth,
        });

        if (!animal) {
          if (cellH >= 6.4) {
            drawText(
              gx + padX,
              cy + Math.min(cellH - 1.5, cellH / 2 + metaSize * 0.35),
              `${roleTag} - Unknown`,
              'F1',
              Math.min(metaSize, cellH * 0.68),
              [0.38, 0.38, 0.38]
            );
          }
          continue;
        }

        drawLine(
          gx + 1.1,
          cy + 0.4,
          gx + 1.1,
          cy + cellH - 0.4,
          isSire ? sireRgb : damRgb,
          cellH < 9 ? 1.4 : 2.0
        );

        const linesToRender: Array<{ text: string; font: 'F1' | 'F2' | 'F3'; size: number; rgb: [number, number, number] }> = [];
        const inlineTattoo = cellH < 13 && animal.tattoo ? `${animal.name} (${animal.tattoo})` : animal.name;
        const nameWrapped = wrapPdfLines(inlineTattoo, innerCellW, nameSize, cellH >= 38 ? 2 : 1, true);
        for (const nl of nameWrapped) {
          linesToRender.push({ text: nl, font: 'F2', size: nameSize, rgb: inkRgb });
        }

        const metaParts = [
          animal.tattoo ? `ID: ${animal.tattoo}` : '',
          !compactMode && animal.variety ? animal.variety : '',
          showWeights && !compactMode && animal.weightGrams > 0
            ? formatPedigreeWeight(animal.weightGrams, effectiveWeightUnit, arbaLbsOzDotNotation)
            : '',
        ].filter(Boolean);
        if (metaParts.length > 0 && cellH >= 14.5) {
          const metaWrapped = wrapPdfLines(metaParts.join(' | '), innerCellW, metaSize, 1);
          for (const ml of metaWrapped) {
            linesToRender.push({ text: ml, font: 'F3', size: metaSize, rgb: [0.2, 0.2, 0.2] });
          }
        }

        if (!compactMode && animal.birthDateIso && cellH >= 28) {
          linesToRender.push({
            text: `DOB: ${formatReadableDate(animal.birthDateIso)}`,
            font: 'F3',
            size: metaSize,
            rgb: [0.24, 0.24, 0.24],
          });
        }

        const ancShowSummary =
          (printOptions?.shows?.length || 0) > 0 || (printOptions?.careLogs?.length || 0) > 0
            ? computeAnimalShowSummary(animal, printOptions?.shows ?? [], printOptions?.careLogs ?? [])
            : null;
        const ancLegs = ancShowSummary ? ancShowSummary.effectiveLegs : animal.legsCount;
        const regParts = [
          animal.registrationNumber ? `Reg: ${animal.registrationNumber}` : '',
          animal.grandChampionNumber ? `GC: ${animal.grandChampionNumber}` : '',
          ancLegs > 0 ? `Legs: ${ancLegs}` : '',
          ancShowSummary?.awardsSummaryText ? ancShowSummary.awardsSummaryText : '',
        ].filter(Boolean);
        const ancWool = woolSummaryByAnimalId.get(animal.id);
        const ancWoolText =
          ancWool && (ancWool.harvestCount > 0 || ancWool.highestIagarbScore)
            ? formatWoolWeightSummary(ancWool, { compact: true })
            : '';
        if (!compactMode && ancWoolText && cellH >= 40) {
          const woolWrapped = wrapPdfLines(ancWoolText, innerCellW, metaSize, 1);
          for (const wl of woolWrapped) {
            linesToRender.push({ text: wl, font: 'F3', size: metaSize, rgb: primaryRgb });
          }
        }
        if (!compactMode && regParts.length > 0 && cellH >= 36) {
          const regWrapped = wrapPdfLines(regParts.join(' | '), innerCellW, metaSize, 1);
          for (const rl of regWrapped) {
            linesToRender.push({ text: rl, font: 'F3', size: metaSize, rgb: [0.24, 0.24, 0.24] });
          }
        }

        const geno = showGenotypes ? animal.genotypeRaw || formatGenotypeArray(animal.genotype) : '';
        if (showGenotypes && !compactMode && geno && cellH >= 44) {
          const genoWrapped = wrapPdfLines(geno, innerCellW, metaSize, 1);
          for (const gl of genoWrapped) {
            linesToRender.push({ text: gl, font: 'F3', size: metaSize, rgb: primaryRgb });
          }
        }

        const carrierText = formatCompactCarrierDisclosure(animal, {
          herdById,
          includeCleared: true,
          ultraCompact: compactMode,
          maxItemsPerGroup: compactMode ? 1 : 3,
        });
        if (carrierText && cellH >= 22) {
          const carrierWrapped = wrapPdfLines(carrierText, innerCellW, metaSize, 1);
          for (const cl of carrierWrapped) {
            linesToRender.push({ text: cl, font: 'F1', size: metaSize, rgb: accentRgb });
          }
        }

        const maxFitLines = Math.max(1, Math.floor((cellH - 2) / lineStep));
        const visibleLines = linesToRender.slice(0, maxFitLines);
        const totalBlockH = visibleLines.length * lineStep;
        const startY =
          cellH < 9
            ? cy + Math.min(cellH - 1.2, cellH / 2 + nameSize * 0.35)
            : cy + Math.max(nameSize + 0.8, (cellH - totalBlockH) / 2 + nameSize * 0.8);

        visibleLines.forEach((item, lIdx) => {
          drawText(innerLeft + c * colW + padX + 1.5, startY + lIdx * lineStep, item.text, item.font, item.size, item.rgb);
        });
      }
    }

    // --- Bottom Notice & Breeder Certification Footer ---
    let footerY = bodyTopY + availableTableBodyH + 10;
    if (hasNotice) {
      drawText(
        innerLeft,
        footerY,
        'Notice: Color genetics, Rufus intensity & genotype calculation is under development and incomplete (unverified).',
        'F1',
        7.5,
        mutedInkRgb
      );
      footerY += 12;
    }

    if (showFooterOnThisPage) {
      drawLine(innerLeft, footerY, innerLeft + innerWidth, footerY, cellBorderRgb, 0.6);
      footerY += 11;
      if (breederContactLine) {
        drawText(innerLeft, footerY, breederContactLine, 'F2', 8, primaryRgb);
        footerY += 11;
      }
      drawText(
        innerLeft,
        footerY,
        'I hereby certify that this pedigree is correct to the best of my knowledge and belief.',
        'F1',
        8,
        inkRgb
      );
      const sigText = 'Breeder Signature: ________________________   Date: ____________';
      const sigW = estimateTextWidthPt(sigText, 8, false);
      drawText(Math.max(innerLeft + 260, innerLeft + innerWidth - sigW), footerY, sigText, 'F1', 8, inkRgb);
    }

    return encodeAsciiBytes(ops.join('\n'));
  };

  // --- Assemble PDF 1.4 Objects & Exact Byte-Offset XRef ---
  // Reserve 1: Catalog, 2: Pages, 3: Page 1, 4: F1, 5: F2, 6: F3, 7: Contents 1, 8+: XObjects, then extra Page+Contents pairs
  const pageContentStreams = pageSlices.map((slice) => renderPageStream(slice));
  const xObjectEntries: string[] = [];
  let nextObjId = 8;
  const imageObjects: Array<{ id: number; bytes: Uint8Array }> = [];

  const pushJpegXObject = (name: string, img: PdfRasterImage) => {
    const id = nextObjId++;
    xObjectEntries.push(`/${name} ${id} 0 R`);
    const header = encodeAsciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${Math.round(img.width)} /Height ${Math.round(img.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.byteLength} >>\nstream\n`
    );
    const footer = encodeAsciiBytes(`\nendstream`);
    imageObjects.push({ id, bytes: concatUint8Arrays([header, img.bytes, footer]) });
  };

  if (hasLogo && breederLogoJpeg) {
    pushJpegXObject('ImLogo', breederLogoJpeg);
  }
  if (hasPhoto && subjectPhotoJpeg) {
    pushJpegXObject('ImPhoto', subjectPhotoJpeg);
  }

  const xObjDict = xObjectEntries.length > 0 ? ` /XObject << ${xObjectEntries.join(' ')} >>` : '';
  const extraPageObjects: Array<{ id: number; bytes: Uint8Array }> = [];
  const kidPageIds: number[] = [3];

  for (let pIdx = 1; pIdx < pageSlices.length; pIdx++) {
    const pageObjId = nextObjId++;
    const contentObjId = nextObjId++;
    kidPageIds.push(pageObjId);

    const streamBytes = pageContentStreams[pIdx];
    extraPageObjects.push({
      id: pageObjId,
      bytes: encodeAsciiBytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjDict} >> /Contents ${contentObjId} 0 R >>`
      ),
    });
    extraPageObjects.push({
      id: contentObjId,
      bytes: concatUint8Arrays([
        encodeAsciiBytes(`<< /Length ${streamBytes.byteLength} >>\nstream\n`),
        streamBytes,
        encodeAsciiBytes('\nendstream'),
      ]),
    });
  }

  const firstPageBytes = pageContentStreams[0];
  const objects: Array<{ id: number; bytes: Uint8Array }> = [
    {
      id: 1,
      bytes: encodeAsciiBytes('<< /Type /Catalog /Pages 2 0 R >>'),
    },
    {
      id: 2,
      bytes: encodeAsciiBytes(
        `<< /Type /Pages /Kids [${kidPageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${kidPageIds.length} >>`
      ),
    },
    {
      id: 3,
      bytes: encodeAsciiBytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjDict} >> /Contents 7 0 R >>`
      ),
    },
    {
      id: 4,
      bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    },
    {
      id: 5,
      bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    },
    {
      id: 6,
      bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
    },
    {
      id: 7,
      bytes: concatUint8Arrays([
        encodeAsciiBytes(`<< /Length ${firstPageBytes.byteLength} >>\nstream\n`),
        firstPageBytes,
        encodeAsciiBytes('\nendstream'),
      ]),
    },
    ...imageObjects,
    ...extraPageObjects,
  ];

  const pdfChunks: Uint8Array[] = [encodeAsciiBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  let byteOffset = pdfChunks[0].byteLength;
  const xrefOffsets: number[] = [0];

  for (const obj of objects) {
    xrefOffsets.push(byteOffset);
    const objHead = encodeAsciiBytes(`${obj.id} 0 obj\n`);
    const objTail = encodeAsciiBytes('\nendobj\n');
    pdfChunks.push(objHead, obj.bytes, objTail);
    byteOffset += objHead.byteLength + obj.bytes.byteLength + objTail.byteLength;
  }

  const xrefStartOffset = byteOffset;
  const xrefLines: string[] = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
  ];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  xrefLines.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStartOffset}\n%%EOF\n`
  );
  pdfChunks.push(encodeAsciiBytes(xrefLines.join('')));

  return concatUint8Arrays(pdfChunks);
}

export interface BlankPedigreePdfExportParams {
  settings: BarnSettings;
  speciesProfile?: SpeciesProfile;
  options?: BlankPedigreeTemplateOptions;
  breederLogoJpeg?: PdfRasterImage;
}

/**
 * Builds a crisp vector US Letter PDF (`Uint8Array`) for a blank 3–6 generation write-in
 * pedigree certificate with configurable generations and optional Farm/Breeder header.
 */
export function buildBlankPedigreePdfBytes(params: BlankPedigreePdfExportParams): Uint8Array {
  const { settings, speciesProfile, options, breederLogoJpeg } = params;
  const rawDepth = normalizePedigreeGenerationDepth(options?.generations, 3);
  const depth: 3 | 4 | 5 | 6 = rawDepth >= 6 ? 6 : rawDepth <= 3 ? 3 : (rawDepth as 4 | 5);
  const includeFarmHeader = options?.includeFarmHeader ?? true;
  const orientation: PedigreePrintOrientation =
    options?.orientation === 'portrait' ? 'portrait' : 'landscape';
  const isPortrait = orientation === 'portrait';

  const theme = resolvePedigreePrintTheme(
    {
      colorPreset: options?.colorPreset ?? 'classic_sage',
      borderStyle: options?.borderStyle ?? 'classic_rule',
      layoutPreset: 'evans_standard',
    },
    settings.customColors
  );
  const primaryRgb = hexToPdfRgb(theme.primaryHex);
  const sireRgb = hexToPdfRgb(theme.sireHex);
  const damRgb = hexToPdfRgb(theme.damHex);
  const borderRgb = hexToPdfRgb(theme.borderHex);
  const cellBorderRgb = hexToPdfRgb(theme.cellBorderHex);
  const inkRgb = hexToPdfRgb(theme.inkHex);
  const mutedInkRgb = hexToPdfRgb(theme.mutedInkHex);

  const pageWidth = isPortrait ? PT_LETTER_SHORT : PT_LETTER_LONG;
  const pageHeight = isPortrait ? PT_LETTER_LONG : PT_LETTER_SHORT;
  const margin = depth >= 5 ? 24 : isPortrait ? 28 : 30;
  const innerPad = theme.borderStyle === 'classic_rule' ? 0 : 8;
  const innerLeft = margin + innerPad;
  const innerTop = margin + innerPad;
  const innerWidth = pageWidth - margin * 2 - innerPad * 2;
  const innerBottom = pageHeight - margin - innerPad;

  const hasLogo = includeFarmHeader && (options?.showBreederLogo ?? true) && isValidJpegImage(breederLogoJpeg);
  const speciesLabel = (options?.speciesName || speciesProfile?.name || '').trim();
  const maleLabel = speciesProfile?.maleLabel || 'Sire';
  const femaleLabel = speciesProfile?.femaleLabel || 'Dam';
  const contactLine = includeFarmHeader
    ? (options?.breederContactLine || buildDefaultBreederContactLine(settings)).trim()
    : '';

  const ops: string[] = [];
  const drawText = (
    x: number,
    yTop: number,
    text: string,
    font: 'F1' | 'F2' | 'F3',
    size: number,
    rgb: [number, number, number] = inkRgb
  ) => {
    const clean = escapePdfLiteral(text);
    if (!clean) return;
    ops.push(
      `BT /${font} ${fmtPt(size)} Tf ${rgb.map((v) => v.toFixed(3)).join(' ')} rg 1 0 0 1 ${fmtPt(x)} ${fmtPt(pageHeight - yTop)} Tm (${clean}) Tj ET`
    );
  };
  const drawRect = (
    x: number,
    yTop: number,
    w: number,
    h: number,
    opts?: { strokeRgb?: [number, number, number]; lineWidth?: number }
  ) => {
    ops.push('q');
    if (opts?.lineWidth !== undefined) ops.push(`${fmtPt(opts.lineWidth)} w`);
    if (opts?.strokeRgb) ops.push(`${opts.strokeRgb.map((v) => v.toFixed(3)).join(' ')} RG`);
    ops.push(`${fmtPt(x)} ${fmtPt(pageHeight - (yTop + h))} ${fmtPt(w)} ${fmtPt(h)} re S Q`);
  };
  const drawLine = (
    x1: number,
    yTop1: number,
    x2: number,
    yTop2: number,
    rgb: [number, number, number] = cellBorderRgb,
    lineWidth = 0.75
  ) => {
    ops.push(
      `q ${fmtPt(lineWidth)} w ${rgb.map((v) => v.toFixed(3)).join(' ')} RG ${fmtPt(x1)} ${fmtPt(pageHeight - yTop1)} m ${fmtPt(x2)} ${fmtPt(pageHeight - yTop2)} l S Q`
    );
  };

  if (theme.borderStyle === 'double_frame') {
    drawRect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2, {
      strokeRgb: borderRgb,
      lineWidth: 1.5,
    });
    drawRect(margin + 3.5, margin + 3.5, pageWidth - (margin + 3.5) * 2, pageHeight - (margin + 3.5) * 2, {
      strokeRgb: borderRgb,
      lineWidth: 0.75,
    });
  } else if (theme.borderStyle === 'modern_rounded') {
    drawRect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2, {
      strokeRgb: borderRgb,
      lineWidth: 1.1,
    });
  }

  let cursorY = innerTop;
  let textStartX = innerLeft;
  if (hasLogo && breederLogoJpeg) {
    const logoH = 34;
    const logoW = Math.min(84, Math.max(24, (breederLogoJpeg.width / breederLogoJpeg.height) * logoH));
    ops.push(
      `q ${fmtPt(logoW)} 0 0 ${fmtPt(logoH)} ${fmtPt(innerLeft)} ${fmtPt(pageHeight - (cursorY + logoH))} cm /ImLogo Do Q`
    );
    textStartX += logoW + 10;
  }

  const headerTitle = includeFarmHeader
    ? settings.barnName || 'Blank Pedigree Certificate'
    : `${depth}-Generation Blank Pedigree Form`;
  const headerSub = includeFarmHeader
    ? `${depth}-Generation ${speciesLabel ? `${speciesLabel} ` : ''}Blank Pedigree${settings.breederName ? ` | Breeder: ${settings.breederName}` : ''}`
    : `${speciesLabel ? `${speciesLabel} ` : ''}Registry Template | Farm / Breeder: ____________________________`;

  drawText(textStartX, cursorY + 14, headerTitle, 'F2', 15, primaryRgb);
  drawText(textStartX, cursorY + 27, headerSub, 'F1', 8.5, mutedInkRgb);
  if (contactLine) {
    drawText(textStartX, cursorY + 38, contactLine, 'F1', 8, primaryRgb);
  }
  const dateText = 'Date: ______________   COI: ______%';
  const dateW = estimateTextWidthPt(dateText, 8.5, false);
  drawText(innerLeft + innerWidth - dateW, cursorY + 27, dateText, 'F1', 8.5, mutedInkRgb);

  cursorY += contactLine ? 44 : 36;
  drawLine(innerLeft, cursorY, innerLeft + innerWidth, cursorY, borderRgb, 1.3);
  cursorY += 8;

  // Subject write-in box
  const subjBoxH = 54;
  drawRect(innerLeft, cursorY, innerWidth, subjBoxH, { strokeRgb: borderRgb, lineWidth: 0.9 });
  const subjLabels = [
    'Name:',
    'Tattoo / Ear #:',
    'Breed & Variety:',
    'Sex:',
    'DOB:',
    'Weight:',
    'Reg #:',
    'GC # / Legs:',
    'Genotype / Notes:',
  ];
  const colW = innerWidth / 3;
  subjLabels.forEach((lbl, idx) => {
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    const fx = innerLeft + col * colW + 8;
    const fy = cursorY + 14 + row * 16;
    drawText(fx, fy, lbl, 'F2', 8, primaryRgb);
    const lblW = estimateTextWidthPt(lbl, 8, true);
    drawLine(fx + lblW + 4, fy + 2, innerLeft + (col + 1) * colW - 10, fy + 2, cellBorderRgb, 0.6);
  });
  cursorY += subjBoxH + 8;

  const footerH = contactLine ? 34 : 24;
  const tableBottom = innerBottom - footerH - 4;
  const headerRowH = 16;
  const gridTop = cursorY + headerRowH;
  const gridHeight = Math.max(120, tableBottom - gridTop);
  const genColW = innerWidth / depth;

  for (let g = 1; g <= depth; g++) {
    const colX = innerLeft + (g - 1) * genColW;
    drawRect(colX, cursorY, genColW, headerRowH, { strokeRgb: cellBorderRgb, lineWidth: 0.7 });
    drawText(colX + 4, cursorY + 11, GEN_COLUMN_TITLES[g - 1] || `Gen ${g}`, 'F2', depth >= 5 ? 7.5 : 8.5, primaryRgb);

    const cellCount = 1 << g;
    const cellH = gridHeight / cellCount;
    for (let idx = 0; idx < cellCount; idx++) {
      const cy = gridTop + idx * cellH;
      const isSire = idx % 2 === 0;
      drawRect(colX, cy, genColW, cellH, { strokeRgb: cellBorderRgb, lineWidth: 0.6 });
      drawLine(colX + 1.5, cy + 1, colX + 1.5, cy + cellH - 1, isSire ? sireRgb : damRgb, 2.2);

      const roleText = `${isSire ? maleLabel : femaleLabel}:`;
      const fontSize = depth >= 6 ? 6.2 : depth === 5 ? 6.8 : 8;
      const lineY1 = cy + Math.min(cellH * 0.45, fontSize + 5);
      drawText(colX + 5, lineY1, roleText, 'F2', fontSize, inkRgb);
      const roleW = estimateTextWidthPt(roleText, fontSize, true);
      drawLine(colX + 7 + roleW, lineY1 + 1.5, colX + genColW - 5, lineY1 + 1.5, cellBorderRgb, 0.45);
      if (cellH >= 24 && depth <= 5) {
        const lineY2 = lineY1 + Math.min(cellH * 0.35, 11);
        drawText(colX + 5, lineY2, 'ID/Reg:', 'F1', fontSize - 0.5, mutedInkRgb);
        drawLine(colX + 28, lineY2 + 1.5, colX + genColW - 5, lineY2 + 1.5, cellBorderRgb, 0.45);
      }
    }
  }

  let footerY = tableBottom + 8;
  drawLine(innerLeft, footerY, innerLeft + innerWidth, footerY, cellBorderRgb, 0.6);
  footerY += 11;
  if (contactLine) {
    drawText(innerLeft, footerY, contactLine, 'F2', 8, primaryRgb);
    footerY += 11;
  }
  drawText(
    innerLeft,
    footerY,
    'I hereby certify that this pedigree is correct to the best of my knowledge and belief.',
    'F1',
    8,
    inkRgb
  );
  const sigText = 'Breeder Signature: ________________________   Date: ____________';
  const sigW = estimateTextWidthPt(sigText, 8, false);
  drawText(Math.max(innerLeft + 260, innerLeft + innerWidth - sigW), footerY, sigText, 'F1', 8, inkRgb);

  const streamBytes = encodeAsciiBytes(ops.join('\n'));
  const xObjEntries: string[] = [];
  const extraObjs: Array<{ id: number; bytes: Uint8Array }> = [];
  if (hasLogo && breederLogoJpeg) {
    xObjEntries.push('/ImLogo 8 0 R');
    const h = encodeAsciiBytes(
      `<< /Type /XObject /Subtype /Image /Width ${Math.round(breederLogoJpeg.width)} /Height ${Math.round(breederLogoJpeg.height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${breederLogoJpeg.bytes.byteLength} >>\nstream\n`
    );
    extraObjs.push({ id: 8, bytes: concatUint8Arrays([h, breederLogoJpeg.bytes, encodeAsciiBytes('\nendstream')]) });
  }
  const xObjDict = xObjEntries.length > 0 ? ` /XObject << ${xObjEntries.join(' ')} >>` : '';

  const objects: Array<{ id: number; bytes: Uint8Array }> = [
    { id: 1, bytes: encodeAsciiBytes('<< /Type /Catalog /Pages 2 0 R >>') },
    { id: 2, bytes: encodeAsciiBytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>') },
    {
      id: 3,
      bytes: encodeAsciiBytes(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >>${xObjDict} >> /Contents 7 0 R >>`
      ),
    },
    { id: 4, bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>') },
    { id: 5, bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>') },
    { id: 6, bytes: encodeAsciiBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>') },
    {
      id: 7,
      bytes: concatUint8Arrays([
        encodeAsciiBytes(`<< /Length ${streamBytes.byteLength} >>\nstream\n`),
        streamBytes,
        encodeAsciiBytes('\nendstream'),
      ]),
    },
    ...extraObjs,
  ];

  const pdfChunks: Uint8Array[] = [encodeAsciiBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  let byteOffset = pdfChunks[0].byteLength;
  const xrefOffsets: number[] = [0];
  for (const obj of objects) {
    xrefOffsets.push(byteOffset);
    const objHead = encodeAsciiBytes(`${obj.id} 0 obj\n`);
    const objTail = encodeAsciiBytes('\nendobj\n');
    pdfChunks.push(objHead, obj.bytes, objTail);
    byteOffset += objHead.byteLength + obj.bytes.byteLength + objTail.byteLength;
  }
  const xrefStart = byteOffset;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let i = 1; i <= objects.length; i++) {
    xrefLines.push(`${String(xrefOffsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  xrefLines.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  pdfChunks.push(encodeAsciiBytes(xrefLines.join('')));
  return concatUint8Arrays(pdfChunks);
}
