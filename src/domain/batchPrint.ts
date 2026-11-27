/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Batch Print Engine (`src/domain/batchPrint.ts`).
 *
 * Generates single-pass, self-contained printable `.HTM` / Print-to-PDF documents from
 * multi-selected herd animals across four breeder-ready formats:
 *   1. `cage_cards`        — 8-Up US Letter Kennel / Cage Cards (2x4 grid, optional cut guides)
 *   2. `stacked_pedigrees` — Stacked Formal Evans-Style Pedigrees (1 per landscape page, 3–6G)
 *   3. `mini_pedigree_4up` — 1/4-Page (4-Up) Compact 3-Generation Mini Pedigree Sheets (2x2)
 *   4. `photo_cards_4x6`   — 3-Generation 4x6 Photo Cards (2-Up Letter cardstock or Direct 4x6)
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript string builder with zero browser DOM (`window`, `document`) calls
 * so identical printable HTML documents run on Web PWA, Android WebView, and React Native / Expo.
 */

import { formatCompactCarrierDisclosure } from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  escapeSafeHtml,
  sanitizeSafeRasterImageDataUrl,
} from './inputSanitization';
import {
  Animal,
  BarnSettings,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  createSpeciesCoiEvaluator,
  PedigreeSlot,
} from './pedigreeCalculator';
import { buildAnimalProfileDeepLink, renderQrSvg } from './qrCode';

export type BatchPrintLayout =
  | 'cage_cards'
  | 'stacked_pedigrees'
  | 'mini_pedigree_4up'
  | 'photo_cards_4x6';

export type PhotoCardPaperMode = 'letter_2up' | 'photo_4x6';

export interface BatchPrintLayoutSpec {
  id: BatchPrintLayout;
  label: string;
  shortLabel: string;
  description: string;
  itemsPerPage: number;
  supportsGenerations: boolean;
  supportsCutLines: boolean;
  supportsPaperMode: boolean;
  supportsBreederFooter: boolean;
  supportsQrCode: boolean;
  prefersFullResPhotos: boolean;
}

export const BATCH_PRINT_LAYOUTS: ReadonlyArray<BatchPrintLayoutSpec> = [
  {
    id: 'cage_cards',
    label: 'Cage / Kennel Cards (8-Up)',
    shortLabel: 'Cage Cards (8-Up)',
    description: '8 kennel/hutch cards per Letter page (2×4 grid) with optional scannable QR profile codes.',
    itemsPerPage: 8,
    supportsGenerations: false,
    supportsCutLines: true,
    supportsPaperMode: false,
    supportsBreederFooter: false,
    supportsQrCode: true,
    prefersFullResPhotos: false,
  },
  {
    id: 'mini_pedigree_4up',
    label: '1/4-Page Mini Pedigrees (4-Up)',
    shortLabel: '4-Up Mini Sheets',
    description: '4 compact 3-generation pedigrees per landscape sheet for auctions & sale folders.',
    itemsPerPage: 4,
    supportsGenerations: false,
    supportsCutLines: true,
    supportsPaperMode: false,
    supportsBreederFooter: true,
    supportsQrCode: false,
    prefersFullResPhotos: false,
  },
  {
    id: 'photo_cards_4x6',
    label: '3-Gen 4×6 Photo Cards',
    shortLabel: '4×6 Photo Cards',
    description: 'Portrait + 3-generation pedigree cards sized 6"×4" (2-up Letter or direct 4×6).',
    itemsPerPage: 2,
    supportsGenerations: false,
    supportsCutLines: true,
    supportsPaperMode: true,
    supportsBreederFooter: true,
    supportsQrCode: false,
    prefersFullResPhotos: true,
  },
  {
    id: 'stacked_pedigrees',
    label: 'Stacked Formal Pedigrees (1-Up)',
    shortLabel: 'Stacked Pedigrees',
    description: 'Full formal multi-generation pedigrees (3–6G), one landscape page per animal.',
    itemsPerPage: 1,
    supportsGenerations: true,
    supportsCutLines: false,
    supportsPaperMode: false,
    supportsBreederFooter: true,
    supportsQrCode: false,
    prefersFullResPhotos: true,
  },
];

export interface BatchPrintOptions {
  layout: BatchPrintLayout;
  /** Pedigree depth for `stacked_pedigrees` (compact formats always use 3 generations). */
  generations: 3 | 4 | 5 | 6;
  /** Embed animal primary photos when available. */
  includePhotos: boolean;
  /** Display animal and ancestor weights in species weight unit. */
  showWeights: boolean;
  /** Display coat color genotypes (triggers unverified / in-dev notice). */
  showGenotypes: boolean;
  /** Display breeder signature / contact footer on pedigree formats. */
  showBreederFooter: boolean;
  /** Optional breeder phone, email, or website line. */
  breederContactLine: string;
  /** Draw dashed cut / trim guides around cards on multi-up sheets. */
  includeCutLines: boolean;
  /** Embed scannable QR profile links on printed cage cards. */
  includeQrCodes: boolean;
  /** Paper layout for 4x6 photo cards: 2 cards on US Letter portrait or 1 card per 6"x4" sheet. */
  photoCardPaperMode: PhotoCardPaperMode;
}

export function getBatchPrintLayoutSpec(layout: BatchPrintLayout): BatchPrintLayoutSpec {
  return BATCH_PRINT_LAYOUTS.find((item) => item.id === layout) ?? BATCH_PRINT_LAYOUTS[0];
}

export function buildDefaultBatchPrintOptions(
  settings: BarnSettings,
  overrides?: Partial<BatchPrintOptions>
): BatchPrintOptions {
  const inheritedGen =
    settings.defaultGenerations === 4 ||
    settings.defaultGenerations === 5 ||
    settings.defaultGenerations === 6
      ? settings.defaultGenerations
      : 3;

  return {
    layout: overrides?.layout ?? 'cage_cards',
    generations: overrides?.generations ?? inheritedGen,
    includePhotos: overrides?.includePhotos ?? true,
    showWeights: overrides?.showWeights ?? true,
    showGenotypes: overrides?.showGenotypes ?? false,
    showBreederFooter: overrides?.showBreederFooter ?? true,
    breederContactLine: overrides?.breederContactLine ?? '',
    includeCutLines: overrides?.includeCutLines ?? true,
    includeQrCodes: overrides?.includeQrCodes ?? true,
    photoCardPaperMode: overrides?.photoCardPaperMode ?? 'letter_2up',
  };
}

export function computeBatchPrintPageCount(
  animalCount: number,
  options: Pick<BatchPrintOptions, 'layout' | 'photoCardPaperMode'>
): number {
  const safeCount = Math.max(0, Math.floor(animalCount));
  if (safeCount === 0) return 0;
  if (options.layout === 'cage_cards') return Math.ceil(safeCount / 8);
  if (options.layout === 'mini_pedigree_4up') return Math.ceil(safeCount / 4);
  if (options.layout === 'photo_cards_4x6') {
    return options.photoCardPaperMode === 'photo_4x6'
      ? safeCount
      : Math.ceil(safeCount / 2);
  }
  return safeCount;
}

/**
 * Resolves checked animal IDs into a deduplicated, strictly species-scoped ordered array.
 * Preserves the caller's visible/sorted list order first, then appends any additional
 * checked IDs that still belong to the active species (e.g., if a filter narrowed the view).
 */
export function resolveBatchPrintAnimals(
  checkedIds: readonly string[],
  visibleAnimals: readonly Animal[],
  allSpeciesAnimals: readonly Animal[],
  speciesName: string
): Animal[] {
  if (checkedIds.length === 0) return [];
  const checkedSet = new Set(checkedIds);
  const seen = new Set<string>();
  const ordered: Animal[] = [];

  for (const animal of visibleAnimals) {
    if (
      checkedSet.has(animal.id) &&
      !seen.has(animal.id) &&
      isSameSpecies(animal.species, speciesName)
    ) {
      seen.add(animal.id);
      ordered.push(animal);
    }
  }

  if (ordered.length < checkedSet.size) {
    const byId = new Map<string, Animal>();
    for (const animal of allSpeciesAnimals) {
      if (isSameSpecies(animal.species, speciesName)) {
        byId.set(animal.id, animal);
      }
    }
    for (const id of checkedIds) {
      if (seen.has(id)) continue;
      const found = byId.get(id);
      if (found) {
        seen.add(id);
        ordered.push(found);
      }
    }
  }

  return ordered;
}

function slugifySegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

export function buildBatchPrintFileName(
  barnName: string | undefined,
  speciesName: string,
  layout: BatchPrintLayout,
  animalCount: number,
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifySegment(trimmed, 'pedigree');
  const spSlug = slugifySegment(speciesName, 'species');
  const layoutSlug =
    layout === 'cage_cards'
      ? 'cage-cards'
      : layout === 'mini_pedigree_4up'
      ? 'mini-pedigrees-4up'
      : layout === 'photo_cards_4x6'
      ? 'photo-cards-4x6'
      : 'stacked-pedigrees';
  const stamp = dateSlug || todayDateIso();
  const count = Math.max(0, Math.floor(animalCount));
  return `${prefix}-${spSlug}-${layoutSlug}-${count}-${stamp}.htm`;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, size);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}

function escapeHtml(raw: string | undefined | null): string {
  return escapeSafeHtml(raw);
}

function resolveSafePhoto(
  animalId: string,
  includePhotos: boolean,
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>
): string {
  if (!includePhotos || !photoDataUrlByAnimalId) return '';
  return sanitizeSafeRasterImageDataUrl(photoDataUrlByAnimalId[animalId]);
}

function formatWeightIfEnabled(
  weightGrams: number,
  unit: WeightUnit,
  showWeights: boolean
): string {
  if (!showWeights || !weightGrams || weightGrams <= 0) return '';
  return formatWeight(weightGrams, unit);
}

function buildCompact3GenTableHtml(params: {
  subject: Animal;
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  weightUnit: WeightUnit;
  showWeights: boolean;
  showGenotypes: boolean;
  density: 'mini' | 'photo4x6';
}): { tableHtml: string; hasGenotypeOrRufus: boolean } {
  const { subject, herdById, sp, weightUnit, showWeights, showGenotypes, density } = params;
  const slots = buildPedigreeSlots(subject, herdById, 3, sp);
  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }

  let hasGenotypeOrRufus = Boolean(subject.rufusLevel);
  const subjectGeno = showGenotypes
    ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
    : '';
  if (showGenotypes && subjectGeno) {
    hasGenotypeOrRufus = true;
  }

  const renderCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    if (!a) {
      return `<td rowspan="${rowspan}" class="ped-cell ped-empty"><span class="ped-unk">${escapeHtml(roleTag)} &mdash; Unknown</span></td>`;
    }

    const geno = showGenotypes ? a.genotypeRaw || formatGenotypeArray(a.genotype) : '';
    if (showGenotypes && geno && gen <= 2) {
      hasGenotypeOrRufus = true;
    }

    const detailBits: string[] = [];
    if (a.tattoo) detailBits.push(escapeHtml(a.tattoo));
    if (a.variety && (density === 'photo4x6' || gen <= 2)) {
      detailBits.push(escapeHtml(a.variety));
    }
    const wt = formatWeightIfEnabled(a.weightGrams, weightUnit, showWeights);
    if (wt && gen <= 2) {
      detailBits.push(escapeHtml(wt));
    }
    if (a.registrationNumber && gen <= 2) {
      detailBits.push(`Reg ${escapeHtml(a.registrationNumber)}`);
    } else if (a.grandChampionNumber && gen <= 2) {
      detailBits.push(`GC ${escapeHtml(a.grandChampionNumber)}`);
    }

    const carrierLine =
      gen <= 2
        ? formatCompactCarrierDisclosure(a, {
            herdById,
            includeCleared: false,
            ultraCompact: true,
            maxItemsPerGroup: 2,
          })
        : '';

    return `<td rowspan="${rowspan}" class="ped-cell ${idx % 2 === 0 ? 'ped-sire' : 'ped-dam'}">
      <div class="ped-name">${escapeHtml(a.name)}</div>
      ${detailBits.length > 0 ? `<div class="ped-meta">${detailBits.join(' &middot; ')}</div>` : ''}
      ${showGenotypes && gen <= 2 && geno ? `<div class="ped-geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierLine ? `<div class="ped-carrier">${escapeHtml(carrierLine)}</div>` : ''}
    </td>`;
  };

  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= 3; g++) {
      const span = 1 << (3 - g);
      if (r % span === 0) {
        cells.push(renderCell(g, Math.floor(r / span), span));
      }
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  const tableHtml = `<table class="ped-table ped-${density}">
    <thead>
      <tr>
        <th>Parents (G1)</th>
        <th>Grandparents (G2)</th>
        <th>Great-Grandparents (G3)</th>
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>`;

  return { tableHtml, hasGenotypeOrRufus };
}

function buildCageCardsDocument(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
  appBaseUrl?: string;
}): string {
  const {
    subjects,
    herdById,
    sp,
    settings,
    weightUnit,
    options,
    photoDataUrlByAnimalId,
    appBaseUrl,
  } = params;
  const idLabels = getSpeciesIdentifierLabels(sp.name);
  const pages = chunkArray(subjects, 8);
  const cutClass = options.includeCutLines ? 'with-cut-lines' : 'no-cut-lines';

  const pagesHtml = pages
    .map((pageAnimals, pageIdx) => {
      const cardsHtml = pageAnimals
        .map((animal) => {
          const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
          const dam = animal.damId ? herdById.get(animal.damId) : undefined;
          const safePhoto = resolveSafePhoto(
            animal.id,
            options.includePhotos,
            photoDataUrlByAnimalId
          );
          const profileUrl =
            options.includeQrCodes && appBaseUrl
              ? buildAnimalProfileDeepLink(appBaseUrl, animal)
              : '';
          const qrSvg = profileUrl
            ? renderQrSvg(profileUrl, {
                sizePx: 66,
                quietZone: 2,
                ariaLabel: `QR code to open ${animal.name || animal.tattoo || 'animal'} profile`,
                className: 'cage-qr-svg',
              })
            : '';
          const geno = options.showGenotypes
            ? animal.genotypeRaw || formatGenotypeArray(animal.genotype)
            : '';
          const carrierText = formatCompactCarrierDisclosure(animal, {
            herdById,
            includeCleared: false,
            ultraCompact: true,
            maxItemsPerGroup: 2,
          });
          const weightText = formatWeightIfEnabled(
            animal.weightGrams,
            weightUnit,
            options.showWeights
          );

          const regBits = [
            animal.registrationNumber ? `Reg: ${escapeHtml(animal.registrationNumber)}` : '',
            animal.grandChampionNumber ? `GC: ${escapeHtml(animal.grandChampionNumber)}` : '',
            animal.legsCount > 0 ? `Legs: ${animal.legsCount}` : '',
          ].filter(Boolean);

          const bottomMonoBits = [
            weightText ? `Wt: ${escapeHtml(weightText)}` : '',
            ...regBits,
            geno ? `${escapeHtml(geno)} (genetics in dev)` : '',
          ].filter(Boolean);

          return `<article class="cage-card ${cutClass}">
            <div class="cage-top">
              <span class="cage-tattoo">${escapeHtml(animal.tattoo || 'NO-ID')}</span>
              <span class="cage-loc">${escapeHtml(animal.cageLocation || settings.barnName || sp.name)}</span>
            </div>
            <div class="cage-body">
              ${
                safePhoto
                  ? `<img class="cage-photo" src="${safePhoto}" alt="${escapeHtml(animal.name)}" />`
                  : ''
              }
              <div class="cage-info">
                <div class="cage-name">${escapeHtml(animal.name)}</div>
                <div class="cage-row">
                  <span>${escapeHtml([animal.breed, animal.variety].filter(Boolean).join(' ') || sp.name)}</span>
                  <span><strong>${escapeHtml(formatSexForSpecies(animal.sex, sp))}</strong></span>
                </div>
                <div class="cage-row cage-sub">
                  <span>DOB: ${escapeHtml(formatReadableDate(animal.birthDateIso))}</span>
                  <span>${escapeHtml(idLabels.shortLabel)}: ${escapeHtml(animal.tattoo || 'Unmarked')}</span>
                </div>
                <div class="cage-parent"><strong>Sire:</strong> ${escapeHtml(sire ? `${sire.name}${sire.tattoo ? ` (${sire.tattoo})` : ''}` : 'Unknown')}</div>
                <div class="cage-parent"><strong>Dam:</strong> ${escapeHtml(dam ? `${dam.name}${dam.tattoo ? ` (${dam.tattoo})` : ''}` : 'Unknown')}</div>
              </div>
              ${
                qrSvg
                  ? `<div class="cage-qr" data-qr-url="${escapeHtml(profileUrl)}">
                      ${qrSvg}
                      <span class="cage-qr-cap">Scan</span>
                    </div>`
                  : ''
              }
            </div>
            ${
              bottomMonoBits.length > 0
                ? `<div class="cage-mono">${bottomMonoBits.join(' &middot; ')}</div>`
                : ''
            }
            ${
              carrierText
                ? `<div class="cage-carrier">${escapeHtml(carrierText)}</div>`
                : ''
            }
          </article>`;
        })
        .join('\n');

      return `<section class="batch-page cage-page" data-page="${pageIdx + 1}">
        <div class="cage-grid">
          ${cardsHtml}
        </div>
      </section>`;
    })
    .join('\n');

  const docTitle = `Batch Cage Cards (${subjects.length} ${sp.name}) - ${settings.barnName || 'Community Pedigree'}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter portrait; margin: 0.35in; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #000000; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 10px; }
  .batch-page { width: 7.8in; margin: 0 auto 14px auto; box-sizing: border-box; background: #ffffff; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .cage-grid { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(4, 2.4in); gap: 0.14in; width: 100%; }
  .cage-card { box-sizing: border-box; border: 2px solid #000000; padding: 7px 9px; background: #ffffff; color: #000000; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .cage-card.with-cut-lines { outline: 1px dashed #777777; outline-offset: 4px; }
  .cage-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-bottom: 1.5px solid #000000; padding-bottom: 3px; margin-bottom: 4px; }
  .cage-tattoo { font-family: "Courier New", monospace; font-size: 16px; font-weight: bold; line-height: 1.1; }
  .cage-loc { font-family: "Courier New", monospace; font-size: 10.5px; font-weight: bold; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-body { display: flex; align-items: flex-start; gap: 7px; flex: 1; min-height: 0; }
  .cage-photo { width: 54px; height: 54px; object-fit: cover; border: 1px solid #444444; border-radius: 4px; flex-shrink: 0; }
  .cage-info { flex: 1; min-width: 0; }
  .cage-name { font-size: 13px; font-weight: bold; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-row { font-size: 9.8px; margin-top: 2px; display: flex; justify-content: space-between; gap: 6px; }
  .cage-sub { color: #333333; font-family: "Courier New", monospace; font-size: 9px; }
  .cage-parent { font-size: 9.2px; margin-top: 2px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-qr { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 1px; border: 1px solid #cccccc; padding: 2px; background: #ffffff; }
  .cage-qr-svg { display: block; width: 64px; height: 64px; }
  .cage-qr-cap { font-family: "Courier New", monospace; font-size: 6.5px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; color: #111111; }
  .cage-mono { font-family: "Courier New", monospace; font-size: 9.2px; margin-top: 4px; border-top: 1px solid #cccccc; padding-top: 3px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cage-carrier { font-size: 8.5px; font-weight: bold; color: #5c2d13; margin-top: 2px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 !important; }
    :root, html, body, .batch-page, .cage-card, .cage-qr {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function buildStackedPedigreesDocument(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
}): string {
  const { subjects, herdById, sp, settings, weightUnit, options, photoDataUrlByAnimalId } = params;
  const generations = options.generations;
  const compactMode = generations >= 5;
  const coiEval = createSpeciesCoiEvaluator(herdById);
  const generatedLabel = formatReadableDate(nowIsoUtc().slice(0, 10));
  const contactLine = (options.breederContactLine || '').trim();

  const genHeaders: string[] = [
    '<th>Parents (Gen 1)</th>',
    '<th>Grandparents (Gen 2)</th>',
    '<th>Great-Grandparents (Gen 3)</th>',
  ];
  if (generations >= 4) genHeaders.push('<th>4th Generation (Gen 4)</th>');
  if (generations >= 5) genHeaders.push('<th>5th Generation (Gen 5)</th>');
  if (generations >= 6) genHeaders.push('<th>6th Generation (Gen 6)</th>');

  const totalRows = 1 << generations;

  const pagesHtml = subjects
    .map((subject, idx) => {
      const slots = buildPedigreeSlots(subject, herdById, generations, sp);
      const coi = coiEval.calculateAnimalCoi(subject);
      const slotMap = new Map<string, PedigreeSlot>();
      for (const sl of slots) {
        slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
      }

      let anyAncestorGeno = false;
      const renderAncestorCell = (gen: number, slotIdx: number, rowspan: number): string => {
        const slot = slotMap.get(`${gen}:${slotIdx}`);
        const a = slot?.animal;
        const roleTag = slotIdx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
        if (!a) {
          return `<td rowspan="${rowspan}" class="cell empty">
            <div class="role">${escapeHtml(roleTag)} &mdash; Unknown</div>
          </td>`;
        }
        const geno = options.showGenotypes
          ? a.genotypeRaw || formatGenotypeArray(a.genotype)
          : '';
        if (options.showGenotypes && !compactMode && geno) {
          anyAncestorGeno = true;
        }
        const carrierText = formatCompactCarrierDisclosure(a, {
          herdById,
          includeCleared: true,
          ultraCompact: compactMode,
          maxItemsPerGroup: compactMode ? 2 : 4,
        });
        const metaParts = [
          a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
          !compactMode && a.variety ? escapeHtml(a.variety) : '',
          options.showWeights && !compactMode && a.weightGrams > 0
            ? escapeHtml(formatWeight(a.weightGrams, weightUnit))
            : '',
        ].filter(Boolean);
        const regParts = [
          a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
          a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
          a.legsCount > 0 ? `Legs: ${a.legsCount}` : '',
        ].filter(Boolean);

        return `<td rowspan="${rowspan}" class="cell ${slotIdx % 2 === 0 ? 'sire' : 'dam'}">
          <div class="name">${escapeHtml(a.name)}</div>
          ${metaParts.length ? `<div class="meta">${metaParts.join(' &middot; ')}</div>` : ''}
          ${!compactMode && a.birthDateIso ? `<div class="meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
          ${!compactMode && regParts.length ? `<div class="meta">${regParts.join(' &middot; ')}</div>` : ''}
          ${options.showGenotypes && !compactMode && geno ? `<div class="geno">${escapeHtml(geno)}</div>` : ''}
          ${carrierText ? `<div class="carrier">${escapeHtml(carrierText)}</div>` : ''}
        </td>`;
      };

      const rowsHtml: string[] = [];
      for (let r = 0; r < totalRows; r++) {
        const cells: string[] = [];
        for (let g = 1; g <= generations; g++) {
          const span = 1 << (generations - g);
          if (r % span === 0) {
            cells.push(renderAncestorCell(g, Math.floor(r / span), span));
          }
        }
        rowsHtml.push(`<tr>${cells.join('')}</tr>`);
      }

      const subjectGeno = options.showGenotypes
        ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
        : '';
      const subjectCarriers = formatCompactCarrierDisclosure(subject, {
        herdById,
        includeLineage: true,
        includeCleared: true,
      });
      const safePhoto = resolveSafePhoto(
        subject.id,
        options.includePhotos,
        photoDataUrlByAnimalId
      );
      const showGeneticsNotice =
        (options.showGenotypes && (Boolean(subjectGeno) || anyAncestorGeno)) ||
        Boolean(subject.rufusLevel);

      return `<section class="batch-page ped-page" data-page="${idx + 1}">
        <div class="header">
          <div>
            <div class="barn-title">${escapeHtml(settings.barnName || 'Community Pedigree')}</div>
            <div class="sub-title">Official ${generations}-Generation ${escapeHtml(subject.species)} Pedigree Certificate${settings.breederName ? ` &middot; Breeder: ${escapeHtml(settings.breederName)}` : ''}</div>
          </div>
          <div class="sub-title">Page ${idx + 1} of ${subjects.length} &middot; Generated ${escapeHtml(generatedLabel)} &middot; Wright COI: ${coi.coiPercent.toFixed(2)}% (${escapeHtml(coi.risk.label)})</div>
        </div>

        <div class="subject-wrap">
          ${safePhoto ? `<img class="subject-photo" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />` : ''}
          <div class="subject-box">
            <div><strong>Name:</strong> ${escapeHtml(subject.name)}</div>
            <div><strong>Tattoo / ID:</strong> ${escapeHtml(subject.tattoo || 'Unmarked')}</div>
            <div><strong>Breed &amp; Variety:</strong> ${escapeHtml(subject.breed)} ${escapeHtml(subject.variety)}</div>
            <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
            <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
            ${options.showWeights ? `<div><strong>Weight:</strong> ${escapeHtml(formatWeight(subject.weightGrams, weightUnit))}</div>` : ''}
            ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
            ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
            ${subject.legsCount > 0 ? `<div><strong>Legs:</strong> ${subject.legsCount}</div>` : ''}
            ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
            ${options.showGenotypes && subjectGeno ? `<div><strong>Genotype:</strong> <code>${escapeHtml(subjectGeno)}</code></div>` : ''}
            ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
          </div>
        </div>

        <table class="pedigree">
          <thead><tr>${genHeaders.join('')}</tr></thead>
          <tbody>${rowsHtml.join('')}</tbody>
        </table>

        ${
          showGeneticsNotice
            ? `<div class="genetics-notice"><strong>Notice:</strong> Color genetics, Rufus intensity &amp; genotype calculation is under development and incomplete (unverified).</div>`
            : ''
        }

        ${
          options.showBreederFooter
            ? `<div class="footer">
                ${contactLine ? `<div class="footer-contact">${escapeHtml(contactLine)}</div>` : ''}
                <div>I hereby certify that this pedigree is correct to the best of my knowledge and belief.</div>
                <div>Breeder Signature: ___________________________ &nbsp;&nbsp; Date: _______________</div>
              </div>`
            : ''
        }
      </section>`;
    })
    .join('\n');

  const docTitle = `Stacked Pedigrees (${subjects.length} ${sp.name}, ${generations}G) - ${settings.barnName || 'Community Pedigree'}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter landscape; margin: ${compactMode ? '8mm' : '10mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #1e241e; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; padding: ${compactMode ? '8px' : '14px'}; }
  .batch-page { background: #ffffff; margin: 0 auto 20px auto; max-width: 10.2in; box-sizing: border-box; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; border-bottom: 2px solid #2d5a3d; padding-bottom: 6px; margin-bottom: 8px; }
  .barn-title { font-size: 19px; font-weight: bold; color: #1e3f2a; }
  .sub-title { font-size: 11px; color: #434d42; }
  .subject-wrap { border: 1px solid #999999; padding: 8px 12px; margin-bottom: 8px; background: #ffffff; display: flex; align-items: center; gap: 14px; }
  .subject-photo { width: 76px; height: 76px; object-fit: cover; border-radius: 6px; border: 1px solid #8c8678; flex-shrink: 0; }
  .subject-box { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12px; flex: 1; }
  table.pedigree { width: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.pedigree th { background: #ffffff; color: #1e3f2a; font-size: ${compactMode ? '9.5px' : '11.5px'}; padding: ${compactMode ? '3px 4px' : '5px 6px'}; text-align: left; border: 1px solid #2d5a3d; border-bottom: 2px solid #2d5a3d; }
  td.cell { border: 1px solid #b8b3a8; padding: ${compactMode ? '2px 4px' : '5px 7px'}; vertical-align: middle; font-size: ${compactMode ? '8.5px' : '11px'}; line-height: ${compactMode ? '1.15' : '1.3'}; word-break: break-word; background: #ffffff; }
  td.sire { border-left: 3px solid #366685; }
  td.dam { border-left: 3px solid #8c3f20; }
  td.empty { color: #555555; font-style: italic; }
  .name { font-weight: bold; font-size: ${compactMode ? '9px' : '12px'}; color: #111111; }
  .meta { color: #333333; font-family: "Courier New", monospace; font-size: ${compactMode ? '8px' : '10px'}; }
  .geno { color: #1e3f2a; font-family: "Courier New", monospace; font-size: 9.5px; margin-top: 2px; }
  .carrier { color: #6e3b1b; font-family: Arial, Helvetica, sans-serif; font-size: ${compactMode ? '7.5px' : '9px'}; font-weight: 600; margin-top: 2px; line-height: 1.15; }
  .genetics-notice { margin-top: 6px; font-size: 9.5px; color: #434d42; font-family: Arial, Helvetica, sans-serif; }
  .footer { margin-top: 10px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px 14px; font-size: 10.5px; color: #333333; border-top: 1px solid #cccccc; padding-top: 6px; }
  .footer-contact { width: 100%; font-size: 10px; color: #1e3f2a; font-weight: bold; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 !important; max-width: none !important; }
    :root, html, body, .batch-page, .header, .subject-wrap, table.pedigree, table.pedigree th, td.cell, .genetics-notice, .footer {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function buildMiniPedigree4UpDocument(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
}): string {
  const { subjects, herdById, sp, settings, weightUnit, options, photoDataUrlByAnimalId } = params;
  const coiEval = createSpeciesCoiEvaluator(herdById);
  const pages = chunkArray(subjects, 4);
  const cutClass = options.includeCutLines ? 'with-cut-lines' : 'no-cut-lines';
  const contactLine = (options.breederContactLine || '').trim();
  const barnTitle = settings.barnName || 'Community Pedigree';

  const pagesHtml = pages
    .map((pageAnimals, pageIdx) => {
      const cardsHtml = pageAnimals
        .map((subject) => {
          const coi = coiEval.calculateAnimalCoi(subject);
          const safePhoto = resolveSafePhoto(
            subject.id,
            options.includePhotos,
            photoDataUrlByAnimalId
          );
          const { tableHtml, hasGenotypeOrRufus } = buildCompact3GenTableHtml({
            subject,
            herdById,
            sp,
            weightUnit,
            showWeights: options.showWeights,
            showGenotypes: options.showGenotypes,
            density: 'mini',
          });
          const weightText = formatWeightIfEnabled(
            subject.weightGrams,
            weightUnit,
            options.showWeights
          );
          const facts = [
            subject.tattoo ? `ID: ${escapeHtml(subject.tattoo)}` : 'Unmarked',
            escapeHtml(formatSexForSpecies(subject.sex, sp)),
            escapeHtml([subject.breed, subject.variety].filter(Boolean).join(' ') || sp.name),
            subject.birthDateIso ? `DOB ${escapeHtml(formatReadableDate(subject.birthDateIso))}` : '',
            weightText ? escapeHtml(weightText) : '',
            subject.registrationNumber ? `Reg ${escapeHtml(subject.registrationNumber)}` : '',
            subject.grandChampionNumber ? `GC ${escapeHtml(subject.grandChampionNumber)}` : '',
            subject.legsCount > 0 ? `${subject.legsCount} Leg${subject.legsCount === 1 ? '' : 's'}` : '',
          ].filter(Boolean);

          const subjectGeno = options.showGenotypes
            ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
            : '';

          return `<article class="mini-card ${cutClass}">
            <div class="mini-head">
              <div class="mini-head-left">
                <span class="mini-barn">${escapeHtml(barnTitle)}</span>
                <span class="mini-kicker">&middot; 3G Mini Pedigree</span>
              </div>
              <span class="mini-coi">COI ${coi.coiPercent.toFixed(1)}%</span>
            </div>

            <div class="mini-subject">
              ${safePhoto ? `<img class="mini-photo" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />` : ''}
              <div class="mini-subject-text">
                <div class="mini-name">${escapeHtml(subject.name)}</div>
                <div class="mini-facts">${facts.join(' &middot; ')}</div>
                ${options.showGenotypes && subjectGeno ? `<div class="mini-geno">Geno: ${escapeHtml(subjectGeno)}</div>` : ''}
              </div>
            </div>

            <div class="mini-table-wrap">
              ${tableHtml}
            </div>

            <div class="mini-foot">
              <span>${
                options.showBreederFooter
                  ? escapeHtml(contactLine || settings.breederName || barnTitle)
                  : ''
              }</span>
              <span>${
                hasGenotypeOrRufus
                  ? 'Genetics in dev (unverified)'
                  : escapeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))
              }</span>
            </div>
          </article>`;
        })
        .join('\n');

      return `<section class="batch-page mini-page" data-page="${pageIdx + 1}">
        <div class="mini-grid">
          ${cardsHtml}
        </div>
      </section>`;
    })
    .join('\n');

  const docTitle = `4-Up Mini Pedigrees (${subjects.length} ${sp.name}) - ${barnTitle}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter landscape; margin: 0.25in; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111111; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; padding: 8px; }
  .batch-page { width: 10.5in; margin: 0 auto 14px auto; box-sizing: border-box; background: #ffffff; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .mini-grid { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 3.84in); gap: 0.16in; width: 100%; }
  .mini-card { box-sizing: border-box; border: 1.5px solid #2d5a3d; padding: 6px 7px; background: #ffffff; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .mini-card.with-cut-lines { outline: 1px dashed #888888; outline-offset: 4px; }
  .mini-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; border-bottom: 1.5px solid #2d5a3d; padding-bottom: 2px; margin-bottom: 4px; }
  .mini-head-left { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-barn { font-size: 10px; font-weight: bold; color: #1e3f2a; }
  .mini-kicker { font-size: 8px; color: #434d42; font-family: Arial, Helvetica, sans-serif; }
  .mini-coi { font-family: "Courier New", monospace; font-size: 8.5px; font-weight: bold; flex-shrink: 0; }
  .mini-subject { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; padding: 3px 5px; border: 1px solid #bbbbbb; background: #ffffff; }
  .mini-photo { width: 38px; height: 38px; object-fit: cover; border-radius: 3px; border: 1px solid #777777; flex-shrink: 0; }
  .mini-subject-text { min-width: 0; flex: 1; }
  .mini-name { font-size: 11px; font-weight: bold; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini-facts { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #333333; line-height: 1.2; margin-top: 1px; }
  .mini-geno { font-family: "Courier New", monospace; font-size: 7.5px; color: #1e3f2a; margin-top: 1px; }
  .mini-table-wrap { flex: 1; min-height: 0; overflow: hidden; }
  table.ped-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.ped-table th { font-size: 7.5px; padding: 2px 4px; text-align: left; border: 1px solid #2d5a3d; color: #1e3f2a; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  td.ped-cell { border: 1px solid #c2bdb2; padding: 1.5px 3.5px; vertical-align: middle; line-height: 1.12; word-break: break-word; overflow: hidden; background: #ffffff; }
  td.ped-sire { border-left: 2.5px solid #366685; }
  td.ped-dam { border-left: 2.5px solid #8c3f20; }
  td.ped-empty { color: #666666; font-style: italic; }
  .ped-unk { font-size: 7px; }
  .ped-name { font-weight: bold; font-size: 8px; color: #111111; }
  .ped-meta { font-family: "Courier New", monospace; font-size: 7px; color: #333333; }
  .ped-geno { font-family: "Courier New", monospace; font-size: 6.8px; color: #1e3f2a; }
  .ped-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 6.5px; color: #6e3b1b; font-weight: bold; }
  .mini-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 3px; padding-top: 2px; border-top: 1px solid #cccccc; font-family: Arial, Helvetica, sans-serif; font-size: 7.5px; color: #444444; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 !important; }
    :root, html, body, .batch-page, .mini-card, .mini-subject, table.ped-table, table.ped-table th, td.ped-cell {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

function buildPhotoCards4x6Document(params: {
  subjects: Animal[];
  herdById: Map<string, Animal>;
  sp: SpeciesProfile;
  settings: BarnSettings;
  weightUnit: WeightUnit;
  options: BatchPrintOptions;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
}): string {
  const { subjects, herdById, sp, settings, weightUnit, options, photoDataUrlByAnimalId } = params;
  const coiEval = createSpeciesCoiEvaluator(herdById);
  const isDirect4x6 = options.photoCardPaperMode === 'photo_4x6';
  const pages = chunkArray(subjects, isDirect4x6 ? 1 : 2);
  const cutClass = !isDirect4x6 && options.includeCutLines ? 'with-cut-lines' : 'no-cut-lines';
  const contactLine = (options.breederContactLine || '').trim();
  const barnTitle = settings.barnName || 'Community Pedigree';

  const pagesHtml = pages
    .map((pageAnimals, pageIdx) => {
      const cardsHtml = pageAnimals
        .map((subject) => {
          const coi = coiEval.calculateAnimalCoi(subject);
          const safePhoto = resolveSafePhoto(
            subject.id,
            options.includePhotos,
            photoDataUrlByAnimalId
          );
          const { tableHtml, hasGenotypeOrRufus } = buildCompact3GenTableHtml({
            subject,
            herdById,
            sp,
            weightUnit,
            showWeights: options.showWeights,
            showGenotypes: options.showGenotypes,
            density: 'photo4x6',
          });

          const weightText = formatWeightIfEnabled(
            subject.weightGrams,
            weightUnit,
            options.showWeights
          );
          const subjectGeno = options.showGenotypes
            ? subject.genotypeRaw || formatGenotypeArray(subject.genotype)
            : '';
          const carrierText = formatCompactCarrierDisclosure(subject, {
            herdById,
            includeLineage: false,
            includeCleared: true,
            ultraCompact: true,
            maxItemsPerGroup: 3,
          });
          const initialChar = (subject.name || sp.name || '?').trim().charAt(0).toUpperCase() || '?';

          const photoSlotHtml = options.includePhotos
            ? safePhoto
              ? `<img class="photo4x6-img" src="${safePhoto}" alt="${escapeHtml(subject.name)}" />`
              : `<div class="photo4x6-placeholder" aria-label="No primary photo">
                  <span class="photo4x6-monogram">${escapeHtml(initialChar)}</span>
                  <span class="photo4x6-ph-label">No Photo</span>
                </div>`
            : '';

          return `<article class="photo4x6-card ${cutClass}">
            <div class="photo4x6-top">
              ${photoSlotHtml}
              <div class="photo4x6-summary">
                <div class="photo4x6-kicker-row">
                  <span class="photo4x6-barn">${escapeHtml(barnTitle)} &middot; ${escapeHtml(sp.name)} 3-Gen Card</span>
                  <span class="photo4x6-coi">COI ${coi.coiPercent.toFixed(2)}%</span>
                </div>
                <div class="photo4x6-title-row">
                  <span class="photo4x6-name">${escapeHtml(subject.name)}</span>
                  <span class="photo4x6-tattoo">${escapeHtml(subject.tattoo || 'UNMARKED')}</span>
                </div>
                <div class="photo4x6-grid">
                  <div><strong>Breed/Var:</strong> ${escapeHtml([subject.breed, subject.variety].filter(Boolean).join(' ') || '—')}</div>
                  <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
                  <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
                  ${weightText ? `<div><strong>Weight:</strong> ${escapeHtml(weightText)}</div>` : ''}
                  ${subject.cageLocation ? `<div><strong>Cage/Pen:</strong> ${escapeHtml(subject.cageLocation)}</div>` : ''}
                  ${subject.registrationNumber ? `<div><strong>Reg #:</strong> ${escapeHtml(subject.registrationNumber)}</div>` : ''}
                  ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> ${escapeHtml(subject.grandChampionNumber)}</div>` : ''}
                  ${subject.legsCount > 0 ? `<div><strong>Show Legs:</strong> ${subject.legsCount}</div>` : ''}
                </div>
                ${options.showGenotypes && subjectGeno ? `<div class="photo4x6-geno"><strong>Genotype:</strong> ${escapeHtml(subjectGeno)}</div>` : ''}
                ${carrierText ? `<div class="photo4x6-carrier">${escapeHtml(carrierText)}</div>` : ''}
              </div>
            </div>

            <div class="photo4x6-ped">
              ${tableHtml}
            </div>

            <div class="photo4x6-foot">
              <span>${
                options.showBreederFooter
                  ? escapeHtml(
                      contactLine ||
                        (settings.breederName ? `Breeder: ${settings.breederName}` : barnTitle)
                    )
                  : ''
              }</span>
              <span>${
                hasGenotypeOrRufus
                  ? 'Color genetics under dev (unverified)'
                  : `4×6 Pedigree Card · ${escapeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}`
              }</span>
            </div>
          </article>`;
        })
        .join('\n');

      return `<section class="batch-page photo4x6-page" data-page="${pageIdx + 1}">
        <div class="photo4x6-stack">
          ${cardsHtml}
        </div>
      </section>`;
    })
    .join('\n');

  const docTitle = `4x6 Photo Pedigree Cards (${subjects.length} ${sp.name}) - ${barnTitle}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: ${isDirect4x6 ? '6in 4in' : 'letter portrait'}; margin: ${isDirect4x6 ? '0.12in' : '0.35in'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111111; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; padding: ${isDirect4x6 ? '4px' : '10px'}; }
  .batch-page { width: ${isDirect4x6 ? '5.76in' : '7.8in'}; margin: 0 auto 14px auto; box-sizing: border-box; background: #ffffff; }
  .batch-page:not(:last-child) { break-after: page; page-break-after: always; }
  .photo4x6-stack { display: flex; flex-direction: column; align-items: center; gap: ${isDirect4x6 ? '0' : '0.36in'}; }
  .photo4x6-card { box-sizing: border-box; width: ${isDirect4x6 ? '5.76in' : '6in'}; height: ${isDirect4x6 ? '3.76in' : '4in'}; border: 1.5px solid #2d5a3d; padding: 8px 10px; background: #ffffff; display: flex; flex-direction: column; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .photo4x6-card.with-cut-lines { outline: 1px dashed #888888; outline-offset: 6px; }
  .photo4x6-top { display: flex; align-items: stretch; gap: 10px; border-bottom: 1.5px solid #2d5a3d; padding-bottom: 6px; margin-bottom: 6px; }
  .photo4x6-img { width: 1.22in; height: 1.22in; object-fit: cover; border-radius: 5px; border: 1px solid #777777; flex-shrink: 0; }
  .photo4x6-placeholder { width: 1.22in; height: 1.22in; border-radius: 5px; border: 1px dashed #888888; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; color: #555555; }
  .photo4x6-monogram { font-size: 28px; font-weight: bold; line-height: 1; }
  .photo4x6-ph-label { font-family: Arial, Helvetica, sans-serif; font-size: 8px; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
  .photo4x6-summary { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
  .photo4x6-kicker-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-family: Arial, Helvetica, sans-serif; font-size: 8.5px; color: #434d42; }
  .photo4x6-barn { font-weight: bold; color: #1e3f2a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo4x6-coi { font-family: "Courier New", monospace; font-weight: bold; flex-shrink: 0; }
  .photo4x6-title-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: 2px; }
  .photo4x6-name { font-size: 14.5px; font-weight: bold; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo4x6-tattoo { font-family: "Courier New", monospace; font-size: 12px; font-weight: bold; flex-shrink: 0; }
  .photo4x6-grid { display: flex; flex-wrap: wrap; gap: 2px 10px; font-family: Arial, Helvetica, sans-serif; font-size: 8.8px; color: #222222; margin-top: 3px; line-height: 1.25; }
  .photo4x6-geno { font-family: "Courier New", monospace; font-size: 8.2px; color: #1e3f2a; margin-top: 2px; }
  .photo4x6-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 8px; font-weight: bold; color: #6e3b1b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo4x6-ped { flex: 1; min-height: 0; overflow: hidden; }
  table.ped-table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; background: #ffffff; }
  table.ped-table th { font-size: 8px; padding: 2px 4px; text-align: left; border: 1px solid #2d5a3d; color: #1e3f2a; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
  td.ped-cell { border: 1px solid #c2bdb2; padding: 1.5px 4px; vertical-align: middle; line-height: 1.12; word-break: break-word; overflow: hidden; background: #ffffff; }
  td.ped-sire { border-left: 2.5px solid #366685; }
  td.ped-dam { border-left: 2.5px solid #8c3f20; }
  td.ped-empty { color: #666666; font-style: italic; }
  .ped-unk { font-size: 7.5px; }
  .ped-name { font-weight: bold; font-size: 8.5px; color: #111111; }
  .ped-meta { font-family: "Courier New", monospace; font-size: 7.2px; color: #333333; }
  .ped-geno { font-family: "Courier New", monospace; font-size: 7px; color: #1e3f2a; }
  .ped-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 6.8px; color: #6e3b1b; font-weight: bold; }
  .photo4x6-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 4px; padding-top: 3px; border-top: 1px solid #cccccc; font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #444444; }
  @media print {
    body { padding: 0 !important; }
    .batch-page { margin: 0 auto !important; }
    :root, html, body, .batch-page, .photo4x6-card, .photo4x6-placeholder, table.ped-table, table.ped-table th, td.ped-cell {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

/**
 * Generates a single self-contained printable `.HTM` document for a multi-selected batch
 * of animals within one species using the requested layout and print options.
 */
export function generateBatchPrintHtml(params: {
  subjects: readonly Animal[];
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  speciesName: string;
  options?: Partial<BatchPrintOptions>;
  photoDataUrlByAnimalId?: Readonly<Record<string, string | undefined>>;
  appBaseUrl?: string;
}): string {
  const {
    subjects,
    allAnimals,
    speciesProfiles,
    settings,
    speciesName,
    photoDataUrlByAnimalId,
    appBaseUrl,
  } = params;
  const resolvedOptions = buildDefaultBatchPrintOptions(settings, params.options);
  const sp = resolveSpeciesProfile(speciesName, speciesProfiles);
  const weightUnit = resolveSpeciesWeightUnit(sp, settings, speciesProfiles);
  const herdById = buildSpeciesHerdMap(allAnimals, sp.name);

  // Deduplicate & strictly enforce active species isolation
  const seen = new Set<string>();
  const scopedSubjects: Animal[] = [];
  for (const animal of subjects) {
    if (!animal || !animal.id || seen.has(animal.id)) continue;
    if (!isSameSpecies(animal.species, sp.name)) continue;
    seen.add(animal.id);
    scopedSubjects.push(animal);
    if (!herdById.has(animal.id)) {
      herdById.set(animal.id, animal);
    }
  }

  if (scopedSubjects.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>Batch Print - No Animals Selected</title>
<style>
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111111; font-family: Arial, Helvetica, sans-serif; padding: 24px; }
</style>
</head>
<body>
  <p>No ${escapeHtml(sp.name)} animals are selected for batch printing.</p>
</body>
</html>`;
  }

  const shared = {
    subjects: scopedSubjects,
    herdById,
    sp,
    settings,
    weightUnit,
    options: resolvedOptions,
    photoDataUrlByAnimalId,
    appBaseUrl,
  };

  switch (resolvedOptions.layout) {
    case 'cage_cards':
      return buildCageCardsDocument(shared);
    case 'stacked_pedigrees':
      return buildStackedPedigreesDocument(shared);
    case 'mini_pedigree_4up':
      return buildMiniPedigree4UpDocument(shared);
    case 'photo_cards_4x6':
      return buildPhotoCards4x6Document(shared);
  }
}
