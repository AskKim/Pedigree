/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Per-Species Printable Barn & Herd Binder Generator (.HTM).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript HTML5 + CSS string builder with zero browser DOM (`window`, `document`)
 * calls so identical human-readable binder books render on Web PWA, mobile Print/PDF,
 * standalone `.HTM` files, automatic `.ZIP` backups, and React Native / Expo.
 */

import {
  analyzeAnimalCarrierLineage,
  formatClearedProofBadge,
  formatCompactCarrierDisclosure,
  getAnimalCarrierDisclosures,
} from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  Animal,
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BreedingRecord,
  CageLocation,
  CareLog,
  formatBreedingStatusForSpecies,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isAnimalArchived,
  isSameSpecies,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  getPedigreeCompletenessSummary,
  PedigreeSlot,
} from './pedigreeCalculator';
import { sanitizeSpeciesMemo } from './speciesMemo';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  mixHex,
  relativeLuminance,
} from './themePalette';

export type BarnBinderColorMode = 'color' | 'ink_saver';

export interface BarnBinderOptions {
  /** Uses Barn Color Picker accents on pure `#FFFFFF` paper (`'color'`) or pure black ink (`'ink_saver'`). */
  colorMode: BarnBinderColorMode;
  /** Default `false` (Active & Current stock) for interactive printable preview; `true` includes Archived, Sold & Deceased. */
  includeArchived: boolean;
  /** Pedigree chart depth; inherits `BarnSettings.defaultGenerations` by default. */
  generations: 3 | 4 | 5 | 6;
  /** Include animal portrait & uploaded gallery photos with captions/notes. */
  includePhotos: boolean;
  /** Include Cover Page, inherited Barn/Species overview metadata, and Breeder Certification Signature block. */
  includeCoverAndSignature: boolean;
  /** Include Herd Index (TOC), Species Schedule & Milestones, Species Memo, Cage Directory & Shows Overview. */
  includeSpeciesOverview: boolean;
  /** Include per-animal Medical/Care History & Litters/Birthings sections. */
  includeHealthAndLitters: boolean;
  /** Include per-animal Shows, Registration #, Related In-Herd Animals, Offspring, Noteworthy Relatives & Notes. */
  includeShowsAndKinship: boolean;
  /** Optional breeder contact or herd-transfer line shown on the cover certification & footer. */
  breederTransferNote?: string;
}

export interface ResolvedBinderPalette {
  mode: BarnBinderColorMode;
  paperBg: '#FFFFFF';
  ink: string;
  mutedInk: string;
  primary: string;
  accent: string;
  male: string;
  female: string;
  border: string;
  hairline: string;
}

export interface BinderRelatedAnimalEntry {
  animal: Animal;
  relationLabel: string;
  inHerd: boolean;
  otherParentLabel?: string;
  achievementBadge?: string;
}

export interface AnimalKinshipSummary {
  directOffspring: BinderRelatedAnimalEntry[];
  inHerdRelatives: BinderRelatedAnimalEntry[];
  noteworthyRelatives: BinderRelatedAnimalEntry[];
}

function escapeHtml(raw: string | undefined | null): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeMultilineHtml(raw: string | undefined | null): string {
  return escapeHtml(raw).replace(/\r\n|\r|\n/g, '<br />');
}

function slugifyBinderSegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

/**
 * Normalizes a `#RRGGBB` hex string and automatically ensures dark, high-contrast legibility
 * against pure `#FFFFFF` white paper so light/neon Color Picker choices remain crisp in print.
 */
function ensurePrintSafeInkHex(rawHex: string | undefined, fallbackHex: string): string {
  const trimmed = (rawHex || '').trim();
  const valid = /^#[0-9a-fA-F]{6}$/.test(trimmed)
    ? trimmed.toUpperCase()
    : fallbackHex.toUpperCase();
  const lum = relativeLuminance(valid);
  if (lum > 0.34) {
    return mixHex(valid, '#141B15', 0.56);
  }
  if (lum > 0.22) {
    return mixHex(valid, '#141B15', 0.3);
  }
  return valid;
}

/**
 * Resolves printable Color vs. Ink Saver palette tokens strictly on `#FFFFFF` paper.
 * Never outputs dark or full-colored document backgrounds regardless of UI dark mode.
 */
export function resolveBinderPalette(
  colorMode: BarnBinderColorMode,
  customColors?: CustomThemeColors
): ResolvedBinderPalette {
  if (colorMode === 'ink_saver') {
    return {
      mode: 'ink_saver',
      paperBg: '#FFFFFF',
      ink: '#000000',
      mutedInk: '#3F3F46',
      primary: '#000000',
      accent: '#18181B',
      male: '#18181B',
      female: '#3F3F46',
      border: '#27272A',
      hairline: '#D4D4D8',
    };
  }

  const primary = ensurePrintSafeInkHex(
    customColors?.lightPrimary,
    DEFAULT_WARM_THEME_COLORS.lightPrimary
  );
  const accent = ensurePrintSafeInkHex(
    customColors?.lightAccent,
    DEFAULT_WARM_THEME_COLORS.lightAccent
  );
  const male = ensurePrintSafeInkHex(
    customColors?.lightMale,
    DEFAULT_WARM_THEME_COLORS.lightMale
  );

  return {
    mode: 'color',
    paperBg: '#FFFFFF',
    ink: '#171C17',
    mutedInk: '#4A524A',
    primary,
    accent,
    male,
    female: accent,
    border: primary,
    hairline: '#D1D5D1',
  };
}

/**
 * Builds default binder options inheriting Barn-level settings cleanly.
 */
export function buildDefaultBarnBinderOptions(
  settings: BarnSettings,
  overrides?: Partial<BarnBinderOptions>
): BarnBinderOptions {
  const inheritedGen =
    settings.defaultGenerations === 4 ||
    settings.defaultGenerations === 5 ||
    settings.defaultGenerations === 6
      ? settings.defaultGenerations
      : 3;

  return {
    colorMode: overrides?.colorMode ?? 'color',
    includeArchived: overrides?.includeArchived ?? false,
    generations: overrides?.generations ?? inheritedGen,
    includePhotos: overrides?.includePhotos ?? true,
    includeCoverAndSignature: overrides?.includeCoverAndSignature ?? true,
    includeSpeciesOverview: overrides?.includeSpeciesOverview ?? true,
    includeHealthAndLitters: overrides?.includeHealthAndLitters ?? true,
    includeShowsAndKinship: overrides?.includeShowsAndKinship ?? true,
    breederTransferNote: overrides?.breederTransferNote ?? '',
  };
}

export function buildBarnBinderFileName(
  barnName: string | undefined,
  speciesName: string,
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const barnPrefix = isDefault ? 'pedigree' : slugifyBinderSegment(trimmed, 'pedigree');
  const spSlug = slugifyBinderSegment(speciesName, 'species');
  const stamp = dateSlug || todayDateIso();
  return `${barnPrefix}-${spSlug}-binder-${stamp}.htm`;
}

function formatUnitLabel(unit: WeightUnit): string {
  switch (unit) {
    case 'lbs_oz':
      return 'Pounds & Oz';
    case 'lbs':
      return 'Decimal Pounds (lbs)';
    case 'kg':
      return 'Kilograms (kg)';
    case 'grams':
      return 'Grams (g)';
  }
}

function formatAchievementBadge(
  animal: Animal,
  showLegCountFromLogs: number
): string | undefined {
  const parts: string[] = [];
  if (animal.grandChampionNumber.trim()) {
    parts.push(`GC #${animal.grandChampionNumber.trim()}`);
  }
  const effectiveLegs = Math.max(animal.legsCount || 0, showLegCountFromLogs);
  if (effectiveLegs >= 3 && !animal.grandChampionNumber.trim()) {
    parts.push(`Grand Champion Eligible (${effectiveLegs} Legs)`);
  } else if (effectiveLegs > 0) {
    parts.push(`${effectiveLegs} Show Leg${effectiveLegs === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) return undefined;
  return parts.join(' · ');
}

function isAnimalNoteworthy(animal: Animal, showLegCountFromLogs: number): boolean {
  if (animal.grandChampionNumber.trim().length > 0) return true;
  if ((animal.legsCount || 0) >= 1) return true;
  if (showLegCountFromLogs >= 1) return true;
  return false;
}

/**
 * Computes direct offspring, currently in-herd relatives, and noteworthy titled relatives
 * (including titled ancestors, siblings, and descendants even if sold/archived/deceased).
 */
export function computeAnimalKinshipSummary(
  subject: Animal,
  speciesAnimals: Animal[],
  careLogs: CareLog[],
  speciesProfile: SpeciesProfile
): AnimalKinshipSummary {
  const herdById = new Map<string, Animal>(speciesAnimals.map((a) => [a.id, a]));
  const showLegsByAnimalId = new Map<string, number>();
  for (const log of careLogs) {
    if (log.type === 'Show / Leg' || log.showLegEarned) {
      showLegsByAnimalId.set(log.animalId, (showLegsByAnimalId.get(log.animalId) || 0) + 1);
    }
  }

  const sortRelatives = (list: BinderRelatedAnimalEntry[]): BinderRelatedAnimalEntry[] =>
    [...list].sort((a, b) => {
      if (a.inHerd !== b.inHerd) return a.inHerd ? -1 : 1;
      return (
        (b.animal.birthDateIso || '').localeCompare(a.animal.birthDateIso || '') ||
        a.animal.name.localeCompare(b.animal.name)
      );
    });

  // 1. Direct Offspring (all children referencing subject as sireId or damId)
  const directOffspringRaw: BinderRelatedAnimalEntry[] = [];
  const directChildIds = new Set<string>();
  for (const cand of speciesAnimals) {
    if (cand.id === subject.id) continue;
    const isSire = cand.sireId === subject.id;
    const isDam = cand.damId === subject.id;
    if (!isSire && !isDam) continue;
    directChildIds.add(cand.id);
    const otherParentId = isSire ? cand.damId : cand.sireId;
    const otherParent = otherParentId ? herdById.get(otherParentId) : undefined;
    const otherLabel = otherParent
      ? `with ${otherParent.name}${otherParent.tattoo ? ` (${otherParent.tattoo})` : ''}`
      : undefined;
    directOffspringRaw.push({
      animal: cand,
      relationLabel: `${speciesProfile.offspringLabel} (${isSire ? `by ${speciesProfile.maleLabel}` : `out of ${speciesProfile.femaleLabel}`})`,
      inHerd: !isAnimalArchived(cand),
      otherParentLabel: otherLabel,
      achievementBadge: formatAchievementBadge(cand, showLegsByAnimalId.get(cand.id) || 0),
    });
  }
  const directOffspring = sortRelatives(directOffspringRaw);

  // Build ancestor map (up to 4 gens) & 2nd-gen descendant set for broader kinship
  const relationById = new Map<string, { label: string; priority: number }>();
  const registerRel = (id: string, label: string, priority: number) => {
    if (!id || id === subject.id) return;
    const existing = relationById.get(id);
    if (!existing || priority < existing.priority) {
      relationById.set(id, { label, priority });
    }
  };

  if (subject.sireId && herdById.has(subject.sireId)) {
    registerRel(subject.sireId, `Sire (${speciesProfile.maleLabel})`, 1);
  }
  if (subject.damId && herdById.has(subject.damId)) {
    registerRel(subject.damId, `Dam (${speciesProfile.femaleLabel})`, 1);
  }

  // Grandparents + Great-Grandparents + 4th-gen Ancestors (BFS with cycle protection)
  const visitedAnc = new Set<string>([subject.id]);
  const ancQueue: Array<{ id: string; depth: number; side: string }> = [];
  if (subject.sireId && herdById.has(subject.sireId)) {
    ancQueue.push({ id: subject.sireId, depth: 1, side: 'Paternal' });
  }
  if (subject.damId && herdById.has(subject.damId)) {
    ancQueue.push({ id: subject.damId, depth: 1, side: 'Maternal' });
  }
  while (ancQueue.length > 0) {
    const curr = ancQueue.shift()!;
    if (visitedAnc.has(curr.id)) continue;
    visitedAnc.add(curr.id);
    const ancAnimal = herdById.get(curr.id);
    if (!ancAnimal) continue;

    if (curr.depth === 2) {
      registerRel(curr.id, `${curr.side} Grandparent`, 3);
    } else if (curr.depth === 3) {
      registerRel(curr.id, `${curr.side} Great-Grandparent`, 5);
    } else if (curr.depth === 4) {
      registerRel(curr.id, `${curr.side} 2nd Great-Grandparent`, 6);
    }

    if (curr.depth < 4) {
      if (ancAnimal.sireId && herdById.has(ancAnimal.sireId)) {
        ancQueue.push({ id: ancAnimal.sireId, depth: curr.depth + 1, side: curr.side });
      }
      if (ancAnimal.damId && herdById.has(ancAnimal.damId)) {
        ancQueue.push({ id: ancAnimal.damId, depth: curr.depth + 1, side: curr.side });
      }
    }
  }

  // Siblings & Grandchildren
  for (const cand of speciesAnimals) {
    if (cand.id === subject.id) continue;
    const sameSire = Boolean(subject.sireId && cand.sireId && cand.sireId === subject.sireId);
    const sameDam = Boolean(subject.damId && cand.damId && cand.damId === subject.damId);
    if (sameSire && sameDam) {
      registerRel(cand.id, 'Full Sibling', 2);
    } else if (sameSire) {
      registerRel(cand.id, `Half Sibling (Shared ${speciesProfile.maleLabel})`, 4);
    } else if (sameDam) {
      registerRel(cand.id, `Half Sibling (Shared ${speciesProfile.femaleLabel})`, 4);
    }

    if (
      (cand.sireId && directChildIds.has(cand.sireId)) ||
      (cand.damId && directChildIds.has(cand.damId))
    ) {
      registerRel(cand.id, 'Grand-Offspring', 4);
    }
  }

  // 2. Related Animals Still Within the Herd (excluding direct offspring shown separately)
  const inHerdRelativesRaw: BinderRelatedAnimalEntry[] = [];
  for (const [relId, meta] of relationById.entries()) {
    if (directChildIds.has(relId)) continue;
    const relAnimal = herdById.get(relId);
    if (!relAnimal || isAnimalArchived(relAnimal)) continue;
    inHerdRelativesRaw.push({
      animal: relAnimal,
      relationLabel: meta.label,
      inHerd: true,
      achievementBadge: formatAchievementBadge(
        relAnimal,
        showLegsByAnimalId.get(relAnimal.id) || 0
      ),
    });
  }
  const inHerdRelatives = inHerdRelativesRaw.sort((a, b) => {
    const pA = relationById.get(a.animal.id)?.priority ?? 99;
    const pB = relationById.get(b.animal.id)?.priority ?? 99;
    return pA - pB || a.animal.name.localeCompare(b.animal.name);
  });

  // 3. Noteworthy / Titled Relatives (across offspring + ancestors + siblings, IN HERD or DEPARTED)
  const noteworthyMap = new Map<string, BinderRelatedAnimalEntry>();
  for (const off of directOffspring) {
    const legLogs = showLegsByAnimalId.get(off.animal.id) || 0;
    if (isAnimalNoteworthy(off.animal, legLogs)) {
      noteworthyMap.set(off.animal.id, {
        animal: off.animal,
        relationLabel: 'Direct Offspring',
        inHerd: off.inHerd,
        achievementBadge: formatAchievementBadge(off.animal, legLogs),
      });
    }
  }
  for (const [relId, meta] of relationById.entries()) {
    const relAnimal = herdById.get(relId);
    if (!relAnimal) continue;
    const legLogs = showLegsByAnimalId.get(relAnimal.id) || 0;
    if (isAnimalNoteworthy(relAnimal, legLogs)) {
      noteworthyMap.set(relAnimal.id, {
        animal: relAnimal,
        relationLabel: meta.label,
        inHerd: !isAnimalArchived(relAnimal),
        achievementBadge: formatAchievementBadge(relAnimal, legLogs),
      });
    }
  }
  const noteworthyRelatives = Array.from(noteworthyMap.values()).sort((a, b) => {
    const gcA = a.animal.grandChampionNumber.trim() ? 1 : 0;
    const gcB = b.animal.grandChampionNumber.trim() ? 1 : 0;
    if (gcA !== gcB) return gcB - gcA;
    const legsDiff = (b.animal.legsCount || 0) - (a.animal.legsCount || 0);
    if (legsDiff !== 0) return legsDiff;
    return a.animal.name.localeCompare(b.animal.name);
  });

  return {
    directOffspring,
    inHerdRelatives,
    noteworthyRelatives,
  };
}

function renderPedigreeTableHtml(
  subject: Animal,
  herdById: Map<string, Animal>,
  sp: SpeciesProfile,
  settings: BarnSettings,
  effectiveUnit: WeightUnit,
  generations: 3 | 4 | 5 | 6,
  showPhotos: boolean,
  primaryPhoto?: AnimalPhoto
): string {
  const slots = buildPedigreeSlots(subject, herdById, generations, sp);
  const coi = calculateAnimalCoi(subject, herdById);
  const completeness = getPedigreeCompletenessSummary(coi);
  const slotMap = new Map<string, PedigreeSlot>();
  for (const sl of slots) {
    slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
  }
  const compactMode = generations >= 5;

  const renderAncestorCell = (gen: number, idx: number, rowspan: number): string => {
    const slot = slotMap.get(`${gen}:${idx}`);
    const a = slot?.animal;
    const roleTag = idx % 2 === 0 ? sp.maleLabel : sp.femaleLabel;
    if (!a) {
      return `<td rowspan="${rowspan}" class="ped-cell ped-empty">
        <div class="ped-role">${escapeHtml(roleTag)} &mdash; Unknown</div>
      </td>`;
    }
    const geno = a.genotypeRaw || formatGenotypeArray(a.genotype);
    const carrierSummary = formatCompactCarrierDisclosure(a, {
      herdById,
      includeCleared: true,
      ultraCompact: compactMode,
      maxItemsPerGroup: compactMode ? 2 : 4,
    });
    const metaParts = [
      a.tattoo ? `ID: ${escapeHtml(a.tattoo)}` : '',
      !compactMode && a.variety ? escapeHtml(a.variety) : '',
      !compactMode && a.weightGrams > 0 ? escapeHtml(formatWeight(a.weightGrams, effectiveUnit)) : '',
    ].filter(Boolean);
    const regParts = [
      a.registrationNumber ? `Reg: ${escapeHtml(a.registrationNumber)}` : '',
      a.grandChampionNumber ? `GC: ${escapeHtml(a.grandChampionNumber)}` : '',
      a.legsCount > 0 ? `Legs: ${a.legsCount}` : '',
    ].filter(Boolean);

    return `<td rowspan="${rowspan}" class="ped-cell ${idx % 2 === 0 ? 'ped-sire' : 'ped-dam'}">
      <div class="ped-name">${escapeHtml(a.name)}</div>
      ${metaParts.length ? `<div class="ped-meta">${metaParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && a.birthDateIso ? `<div class="ped-meta">DOB: ${escapeHtml(formatReadableDate(a.birthDateIso))}</div>` : ''}
      ${regParts.length ? `<div class="ped-meta ped-reg">${regParts.join(' &middot; ')}</div>` : ''}
      ${!compactMode && geno ? `<div class="ped-geno">${escapeHtml(geno)}</div>` : ''}
      ${carrierSummary ? `<div class="ped-carrier">${escapeHtml(carrierSummary)}</div>` : ''}
    </td>`;
  };

  const totalRows = 1 << generations;
  const rows: string[] = [];
  for (let r = 0; r < totalRows; r++) {
    const cells: string[] = [];
    for (let g = 1; g <= generations; g++) {
      const span = 1 << (generations - g);
      if (r % span === 0) {
        const slotIdx = Math.floor(r / span);
        cells.push(renderAncestorCell(g, slotIdx, span));
      }
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  const genHeaders = [
    '<th>Parents (Gen 1)</th>',
    '<th>Grandparents (Gen 2)</th>',
    '<th>Great-Grandparents (Gen 3)</th>',
  ];
  if (generations >= 4) genHeaders.push('<th>Gen 4</th>');
  if (generations >= 5) genHeaders.push('<th>Gen 5</th>');
  if (generations >= 6) genHeaders.push('<th>Gen 6</th>');

  const safePrimary =
    showPhotos && primaryPhoto?.dataUrl && primaryPhoto.dataUrl.startsWith('data:image/')
      ? primaryPhoto.dataUrl
      : '';
  const subjectGeno = subject.genotypeRaw || formatGenotypeArray(subject.genotype);
  const subjectCarriers = formatCompactCarrierDisclosure(subject, {
    herdById,
    includeLineage: true,
    includeCleared: true,
  });

  const sharedAncestorsHtml =
    coi.sharedAncestors.length > 0
      ? `<div class="sub-card">
          <div class="sub-card-title">Linebreeding &amp; Shared Ancestor Contributions</div>
          <table class="data-table compact">
            <thead>
              <tr>
                <th>Common Ancestor</th>
                <th>ID / Tattoo</th>
                <th>Sire Line</th>
                <th>Dam Line</th>
                <th>COI Contribution</th>
              </tr>
            </thead>
            <tbody>
              ${coi.sharedAncestors
                .slice(0, 8)
                .map(
                  (item) => `<tr>
                    <td><strong>${escapeHtml(item.ancestor.name)}</strong></td>
                    <td class="mono">${escapeHtml(item.ancestor.tattoo || '—')}</td>
                    <td class="mono">${item.sireAppearances}x</td>
                    <td class="mono">${item.damAppearances}x</td>
                    <td class="mono">${item.coiContributionPercent.toFixed(2)}%</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`
      : '';

  return `<div class="binder-sheet">
    <div class="sheet-banner">
      <div>
        <div class="sheet-kicker">PEDIGREE SHEET &middot; ${generations}-GENERATION LINEAGE</div>
        <h3 class="sheet-title">${escapeHtml(subject.name)}${subject.tattoo ? ` <span class="mono muted">(${escapeHtml(subject.tattoo)})</span>` : ''}</h3>
      </div>
      <div class="sheet-meta-right">
        <div><strong>Wright COI:</strong> <span class="mono">${coi.coiPercent.toFixed(2)}%</span> (${escapeHtml(coi.risk.label)})</div>
        <div><strong>3-Gen Completeness:</strong> <span class="mono">${completeness.known3Gen}/${completeness.max3Gen} (${completeness.percent3Gen}%)</span></div>
      </div>
    </div>

    <div class="subject-strip">
      ${safePrimary ? `<img class="subject-thumb" src="${safePrimary}" alt="${escapeHtml(subject.name)}" />` : ''}
      <div class="subject-facts">
        <div><strong>Breed &amp; Variety:</strong> ${escapeHtml([subject.breed, subject.variety].filter(Boolean).join(' — ') || 'Not specified')}</div>
        <div><strong>Sex:</strong> ${escapeHtml(formatSexForSpecies(subject.sex, sp))}</div>
        <div><strong>DOB:</strong> ${escapeHtml(formatReadableDate(subject.birthDateIso))}</div>
        <div><strong>Weight:</strong> ${escapeHtml(formatWeight(subject.weightGrams, effectiveUnit))}</div>
        <div><strong>Reg #:</strong> <span class="mono">${escapeHtml(subject.registrationNumber || 'Unregistered')}</span></div>
        ${subject.grandChampionNumber ? `<div><strong>GC #:</strong> <span class="mono">${escapeHtml(subject.grandChampionNumber)}</span></div>` : ''}
        ${subject.legsCount > 0 ? `<div><strong>Legs:</strong> <span class="mono">${subject.legsCount}</span></div>` : ''}
        ${subject.rufusLevel ? `<div><strong>Rufus Intensity:</strong> ${escapeHtml(subject.rufusLevel)}</div>` : ''}
        ${subjectGeno ? `<div><strong>Genotype:</strong> <code class="mono">${escapeHtml(subjectGeno)}</code></div>` : ''}
        ${subjectCarriers ? `<div><strong>Carrier Disclosures:</strong> ${escapeHtml(subjectCarriers)}</div>` : ''}
      </div>
    </div>

    <table class="ped-table ${compactMode ? 'ped-compact' : ''}">
      <thead><tr>${genHeaders.join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>

    ${sharedAncestorsHtml}
  </div>`;
}

/**
 * Generates a complete, self-contained, human-readable Printable Barn / Herd Binder `.HTM` document
 * strictly scoped to a single livestock species, inheriting missing Barn-level defaults seamlessly.
 */
export function generateSpeciesBarnBinderHtml(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string,
  rawOptions?: Partial<BarnBinderOptions>
): string {
  const settings = snapshot.settings;
  const options = buildDefaultBarnBinderOptions(settings, rawOptions);
  const sp = resolveSpeciesProfile(speciesName, snapshot.speciesProfiles);
  const effectiveUnit = resolveSpeciesWeightUnit(sp, settings, snapshot.speciesProfiles);
  const unitInherited = !sp.preferredUnit;
  const palette = resolveBinderPalette(options.colorMode, settings.customColors);
  const idLabels = getSpeciesIdentifierLabels(sp.name);
  const generatedIso = nowIsoUtc();
  const generatedDateLabel = formatReadableDate(generatedIso.slice(0, 10));
  const barnTitle = (settings.barnName || '').trim() || 'Community Pedigree Barn';
  const breederTitle = (settings.breederName || '').trim() || 'Recorded Breeder';

  // Full species data for lineage lookups (always keep archived ancestors visible in kinship/pedigree lookups)
  const allSpeciesAnimals = snapshot.animals.filter((a) => isSameSpecies(a.species, sp.name));
  const herdById = buildSpeciesHerdMap(allSpeciesAnimals, sp.name);
  const allSpeciesAnimalIds = new Set(allSpeciesAnimals.map((a) => a.id));

  const speciesPhotos = (snapshot.animalPhotos ?? []).filter(
    (p) => isSameSpecies(p.species, sp.name) || allSpeciesAnimalIds.has(p.animalId)
  );
  const photosByAnimalId = new Map<string, AnimalPhoto[]>();
  for (const photo of speciesPhotos) {
    const arr = photosByAnimalId.get(photo.animalId) || [];
    arr.push(photo);
    photosByAnimalId.set(photo.animalId, arr);
  }
  for (const arr of photosByAnimalId.values()) {
    arr.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);
    });
  }

  const speciesCareLogs = snapshot.careLogs.filter(
    (l) => isSameSpecies(l.species, sp.name) || allSpeciesAnimalIds.has(l.animalId)
  );
  const speciesBreedings = snapshot.breedings.filter((b) => isSameSpecies(b.species, sp.name));
  const speciesShows = snapshot.shows.filter((s) => isSameSpecies(s.species, sp.name));
  const speciesCages: CageLocation[] = snapshot.cages
    .filter((c) => isSameSpecies(c.species, sp.name))
    .sort((a, b) => a.label.localeCompare(b.label));

  const activeAnimals = allSpeciesAnimals.filter((a) => !isAnimalArchived(a));
  const archivedAnimals = allSpeciesAnimals.filter((a) => isAnimalArchived(a));

  const includedAnimals = (
    options.includeArchived ? [...activeAnimals, ...archivedAnimals] : [...activeAnimals]
  ).sort((a, b) => {
    const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
    if (archDiff !== 0) return archDiff;
    return a.name.localeCompare(b.name) || a.tattoo.localeCompare(b.tattoo);
  });

  // Group Care Logs, Breedings, and Shows by animal ID
  const careLogsByAnimal = new Map<string, CareLog[]>();
  for (const log of speciesCareLogs) {
    const arr = careLogsByAnimal.get(log.animalId) || [];
    arr.push(log);
    careLogsByAnimal.set(log.animalId, arr);
  }
  for (const arr of careLogsByAnimal.values()) {
    arr.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
  }

  const breedingsByAnimal = new Map<string, BreedingRecord[]>();
  for (const br of speciesBreedings) {
    if (br.sireId) {
      const arr = breedingsByAnimal.get(br.sireId) || [];
      arr.push(br);
      breedingsByAnimal.set(br.sireId, arr);
    }
    if (br.damId && br.damId !== br.sireId) {
      const arr = breedingsByAnimal.get(br.damId) || [];
      arr.push(br);
      breedingsByAnimal.set(br.damId, arr);
    }
  }
  for (const arr of breedingsByAnimal.values()) {
    arr.sort((a, b) => (b.bredDateIso || '').localeCompare(a.bredDateIso || ''));
  }

  const showsByAnimal = new Map<string, ShowEvent[]>();
  for (const sh of speciesShows) {
    for (const aid of sh.enteredAnimalIds || []) {
      const arr = showsByAnimal.get(aid) || [];
      arr.push(sh);
      showsByAnimal.set(aid, arr);
    }
  }
  for (const arr of showsByAnimal.values()) {
    arr.sort((a, b) => (b.eventDateIso || '').localeCompare(a.eventDateIso || ''));
  }

  const transferNote = (options.breederTransferNote || '').trim();

  // ── 1. COVER PAGE & BREEDER CERTIFICATION ───────────────────────────────────
  const coverPageHtml = options.includeCoverAndSignature
    ? `<section class="binder-page cover-page">
        <div class="cover-top">
          <div class="cover-eyebrow">${escapeHtml(barnTitle)} &middot; OFFICIAL ARCHIVAL HERD RECORD</div>
          <h1 class="cover-title">${escapeHtml(sp.name)} Barn &amp; Herd Binder</h1>
          <p class="cover-subtitle">
            Complete human-readable livestock registry, multi-generation pedigrees, genetics, health &amp; medical logs,
            ${escapeHtml(sp.birthEventLabel.toLowerCase())} records, show honors, kinship directory, and photograph archive.
          </p>
        </div>

        <div class="cover-grid">
          <div class="info-box">
            <div class="box-title">Binder Scope &amp; Herd Totals</div>
            <dl class="kv-list">
              <div><dt>Document Date</dt><dd>${escapeHtml(generatedDateLabel)}</dd></div>
              <div><dt>Included Stock Scope</dt><dd>${options.includeArchived ? 'Complete Species Archive (Active + Archived / Sold / Deceased)' : 'Active &amp; Current Breeding Stock Only'}</dd></div>
              <div><dt>Animals in Binder</dt><dd class="mono">${includedAnimals.length} (${activeAnimals.length} Active &middot; ${archivedAnimals.length} Archived/Historical)</dd></div>
              <div><dt>Breedings &amp; Litters</dt><dd class="mono">${speciesBreedings.length}</dd></div>
              <div><dt>Medical &amp; Care Logs</dt><dd class="mono">${speciesCareLogs.length}</dd></div>
              <div><dt>Shows &amp; Events</dt><dd class="mono">${speciesShows.length}</dd></div>
              <div><dt>Uploaded Photos</dt><dd class="mono">${options.includePhotos ? speciesPhotos.length : `Omitted by preview setting (${speciesPhotos.length} stored)`}</dd></div>
            </dl>
          </div>

          <div class="info-box">
            <div class="box-title">Barn Standards &amp; Species Inheritance</div>
            <dl class="kv-list">
              <div><dt>Barn / Rabbitry Name</dt><dd>${escapeHtml(barnTitle)}</dd></div>
              <div><dt>Owner / Breeder</dt><dd>${escapeHtml(breederTitle)}</dd></div>
              <div><dt>Weight Display Unit</dt><dd>${escapeHtml(formatUnitLabel(effectiveUnit))} <span class="muted">(${unitInherited ? 'inherited from Barn Settings' : `${escapeHtml(sp.name)} override`})</span></dd></div>
              <div><dt>Pedigree Chart Depth</dt><dd class="mono">${options.generations} Generations${options.generations === settings.defaultGenerations ? ' (inherited default)' : ''}</dd></div>
              <div><dt>Terminology</dt><dd>${escapeHtml(sp.maleLabel)} / ${escapeHtml(sp.femaleLabel)} / ${escapeHtml(sp.offspringLabel)} (${escapeHtml(sp.birthEventLabel)})</dd></div>
              <div><dt>Cycle Defaults</dt><dd class="mono">${sp.gestationDays}d gestation &middot; ${sp.weanDaysAfterBirth}d wean &middot; ${sp.rebreedDaysAfterBirth}d rebreed</dd></div>
              <div><dt>Print Style</dt><dd>${palette.mode === 'color' ? 'Barn Color Picker Accents (White Paper Lock)' : 'Ink Saver Monochrome'}</dd></div>
            </dl>
          </div>
        </div>

        <div class="certification-box">
          <div class="box-title">Breeder Truthfulness Acknowledgment &amp; Herd Transfer Certification</div>
          <p class="cert-statement">
            I hereby certify and acknowledge that the pedigrees, registration numbers, health and medical logs,
            ${escapeHtml(sp.birthEventLabel.toLowerCase())} dates, show awards, and lineage records contained in this binder are
            true, complete, and accurate to the best of my knowledge and belief as of ${escapeHtml(generatedDateLabel)}.
          </p>
          ${transferNote ? `<p class="cert-contact"><strong>Breeder / Transfer Contact:</strong> ${escapeHtml(transferNote)}</p>` : ''}
          <div class="sig-grid">
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Breeder Printed Name (${escapeHtml(breederTitle)})</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Breeder Authorized Signature</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Certification Date</span></div>
          </div>
          <div class="sig-grid sig-buyer">
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Buyer / Transferee Name (Optional — Complete upon Sale/Transfer)</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Buyer / Transferee Signature</span></div>
            <div class="sig-field"><span class="sig-line"></span><span class="sig-label">Transfer Date</span></div>
          </div>
        </div>

        <div class="page-foot">
          <span>${escapeHtml(barnTitle)} &middot; ${escapeHtml(sp.name)} Barn Binder</span>
          <span>Generated ${escapeHtml(generatedIso.slice(0, 10))}</span>
        </div>
      </section>`
    : '';

  // ── 2. SPECIES OVERVIEW, HERD INDEX, MEMO PAD & HOUSING DIRECTORY ──────────
  const cleanMemo = sanitizeSpeciesMemo(sp.memoText);
  const speciesOverviewHtml = options.includeSpeciesOverview
    ? `<section class="binder-page overview-page">
        <div class="sheet-banner">
          <div>
            <div class="sheet-kicker">SECTION 01 &middot; ${escapeHtml(sp.name.toUpperCase())} INDEX &amp; OPERATIONS</div>
            <h2 class="sheet-title">Herd Index, Biological Schedule &amp; Facility Directory</h2>
          </div>
          <div class="sheet-meta-right">
            <div class="mono">${includedAnimals.length} Included Animal${includedAnimals.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <div class="sub-card">
          <div class="sub-card-title">Herd Index (Table of Contents)</div>
          ${
            includedAnimals.length === 0
              ? '<p class="empty-msg">No animals match the selected herd scope for this species.</p>'
              : `<table class="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Animal Name</th>
                      <th>${escapeHtml(idLabels.shortLabel)}</th>
                      <th>Breed / Variety</th>
                      <th>Sex</th>
                      <th>Reg #</th>
                      <th>Cage / Pen</th>
                      <th>Status</th>
                      <th>COI</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${includedAnimals
                      .map((a, idx) => {
                        const aCoi = calculateAnimalCoi(a, herdById);
                        return `<tr>
                          <td class="mono">${idx + 1}</td>
                          <td><strong>${escapeHtml(a.name)}</strong></td>
                          <td class="mono">${escapeHtml(a.tattoo || '—')}</td>
                          <td>${escapeHtml([a.breed, a.variety].filter(Boolean).join(' · ') || '—')}</td>
                          <td>${escapeHtml(formatSexForSpecies(a.sex, sp))}</td>
                          <td class="mono">${escapeHtml(a.registrationNumber || '—')}</td>
                          <td>${escapeHtml(a.cageLocation || '—')}</td>
                          <td>${escapeHtml(a.status)}</td>
                          <td class="mono">${aCoi.coiPercent.toFixed(2)}%</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>

        ${
          sp.milestones.length > 0
            ? `<div class="sub-card">
                <div class="sub-card-title">${escapeHtml(sp.name)} Automated Care Milestones</div>
                <table class="data-table compact">
                  <thead>
                    <tr>
                      <th>Milestone Task</th>
                      <th>Timing Rule</th>
                      <th>Category</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sp.milestones
                      .map((m) => {
                        const timingLabel =
                          m.relativeTo === 'AFTER_BRED'
                            ? `${m.daysOffset} days after breeding`
                            : m.relativeTo === 'BEFORE_BIRTH'
                            ? m.daysOffset === 0
                              ? `On expected ${sp.birthEventLabel.toLowerCase()} date`
                              : `${m.daysOffset} days before ${sp.birthEventLabel.toLowerCase()}`
                            : `${m.daysOffset} days after birth`;
                        return `<tr>
                          <td><strong>${escapeHtml(m.label)}</strong></td>
                          <td>${escapeHtml(timingLabel)}</td>
                          <td>${escapeHtml(m.category)}</td>
                          <td>${escapeHtml(m.priority)}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }

        ${
          cleanMemo
            ? `<div class="sub-card">
                <div class="sub-card-title">${escapeHtml(sp.name)} Note / Memo Pad${sp.memoUpdatedAt ? ` <span class="muted mono">(Updated ${escapeHtml(formatReadableDate(sp.memoUpdatedAt.slice(0, 10)))})</span>` : ''}</div>
                <div class="prose-note">${escapeMultilineHtml(cleanMemo)}</div>
              </div>`
            : ''
        }

        ${
          speciesCages.length > 0
            ? `<div class="sub-card">
                <div class="sub-card-title">Cages, Hutches &amp; Pens Directory (${speciesCages.length})</div>
                <table class="data-table compact">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Barn Section</th>
                      <th>Capacity</th>
                      <th>Current Occupants</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${speciesCages
                      .map((cage) => {
                        const occupants = activeAnimals.filter(
                          (a) => a.cageLocation.trim().toLowerCase() === cage.label.trim().toLowerCase()
                        );
                        return `<tr>
                          <td><strong>${escapeHtml(cage.label)}</strong></td>
                          <td>${escapeHtml(cage.section || 'Main')}</td>
                          <td class="mono">${cage.capacity}</td>
                          <td>${occupants.length > 0 ? escapeHtml(occupants.map((o) => `${o.name}${o.tattoo ? ` (${o.tattoo})` : ''}`).join(', ')) : '<span class="muted">Vacant</span>'}</td>
                          <td>${escapeHtml(cage.notes || '—')}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }

        ${
          speciesShows.length > 0
            ? `<div class="sub-card">
                <div class="sub-card-title">Recorded ${escapeHtml(sp.name)} Shows &amp; Events (${speciesShows.length})</div>
                <table class="data-table compact">
                  <thead>
                    <tr>
                      <th>Event Date</th>
                      <th>Show Name</th>
                      <th>Sanction</th>
                      <th>Location</th>
                      <th>Entered Animals</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${speciesShows
                      .map((sh) => {
                        const enteredNames = (sh.enteredAnimalIds || [])
                          .map((id) => herdById.get(id))
                          .filter((a): a is Animal => Boolean(a))
                          .map((a) => `${a.name}${a.tattoo ? ` (${a.tattoo})` : ''}`);
                        return `<tr>
                          <td class="mono">${escapeHtml(formatReadableDate(sh.eventDateIso))}</td>
                          <td><strong>${escapeHtml(sh.name)}</strong></td>
                          <td>${escapeHtml(sh.sanctioningBody || '—')}</td>
                          <td>${escapeHtml(sh.location || '—')}</td>
                          <td>${enteredNames.length > 0 ? escapeHtml(enteredNames.join(', ')) : '—'}</td>
                        </tr>`;
                      })
                      .join('')}
                  </tbody>
                </table>
              </div>`
            : ''
        }
      </section>`
    : '';

  // ── 3. PER-ANIMAL MULTI-PAGE DOSSIERS ──────────────────────────────────────
  const animalDossiersHtml = includedAnimals
    .map((animal, idx) => {
      const dossierNumber = idx + 1;
      const animalPhotos = photosByAnimalId.get(animal.id) || [];
      const primaryPhoto = animalPhotos.find((p) => p.isPrimary) || animalPhotos[0];
      const animalCareLogs = careLogsByAnimal.get(animal.id) || [];
      const animalBreedings = breedingsByAnimal.get(animal.id) || [];
      const animalShows = showsByAnimal.get(animal.id) || [];
      const coi = calculateAnimalCoi(animal, herdById);
      const kinship = computeAnimalKinshipSummary(animal, allSpeciesAnimals, speciesCareLogs, sp);
      const sire = animal.sireId ? herdById.get(animal.sireId) : undefined;
      const dam = animal.damId ? herdById.get(animal.damId) : undefined;
      const subjectGeno = animal.genotypeRaw || formatGenotypeArray(animal.genotype);
      const animalCarriers = getAnimalCarrierDisclosures(animal);
      const lineageAnalysis = analyzeAnimalCarrierLineage(animal, herdById);
      const showLegLogs = animalCareLogs.filter((l) => l.type === 'Show / Leg' || l.showLegEarned);

      // Sheet 1: Pedigree
      const sheet1Html = renderPedigreeTableHtml(
        animal,
        herdById,
        sp,
        settings,
        effectiveUnit,
        options.generations,
        options.includePhotos,
        primaryPhoto
      );

      // Sheet 2: Supplemental Profile, Genetics & Kinship Network
      const renderRelRows = (entries: BinderRelatedAnimalEntry[], includeMateCol: boolean) =>
        entries
          .map((e) => {
            const stText = e.inHerd ? `In Herd (${e.animal.status})` : `Historical (${e.animal.status})`;
            return `<tr>
              <td><strong>${escapeHtml(e.animal.name)}</strong></td>
              <td class="mono">${escapeHtml(e.animal.tattoo || '—')}</td>
              <td>${escapeHtml(e.relationLabel)}${includeMateCol && e.otherParentLabel ? `<div class="muted small">${escapeHtml(e.otherParentLabel)}</div>` : ''}</td>
              <td class="mono">${escapeHtml(formatReadableDate(e.animal.birthDateIso))}</td>
              <td>${escapeHtml(stText)}</td>
              <td>${escapeHtml(e.achievementBadge || (e.animal.registrationNumber ? `Reg: ${e.animal.registrationNumber}` : '—'))}</td>
            </tr>`;
          })
          .join('');

      const sheet2Html = `<div class="binder-sheet">
        <div class="sheet-banner">
          <div>
            <div class="sheet-kicker">DOSSIER #${dossierNumber} &middot; PROFILE, GENETICS &amp; KINSHIP</div>
            <h3 class="sheet-title">${escapeHtml(animal.name)}${animal.tattoo ? ` <span class="mono muted">(${escapeHtml(animal.tattoo)})</span>` : ''}</h3>
          </div>
          <div class="sheet-meta-right">
            <div><strong>Reg #:</strong> <span class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</span></div>
            <div><strong>Status:</strong> ${escapeHtml(animal.status)}</div>
          </div>
        </div>

        <div class="two-col-grid">
          <div class="sub-card">
            <div class="sub-card-title">Supplemental Identification &amp; Registry Profile</div>
            <dl class="kv-list">
              <div><dt>Registered Name</dt><dd><strong>${escapeHtml(animal.name)}</strong></dd></div>
              <div><dt>${escapeHtml(idLabels.fieldLabel)}</dt><dd class="mono">${escapeHtml(animal.tattoo || 'Unmarked')}</dd></div>
              <div><dt>Registration Number</dt><dd class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</dd></div>
              <div><dt>Grand Champion (GC) #</dt><dd class="mono">${escapeHtml(animal.grandChampionNumber || 'None')}</dd></div>
              <div><dt>Show Legs Recorded</dt><dd class="mono">${Math.max(animal.legsCount || 0, showLegLogs.length)}</dd></div>
              <div><dt>Species &amp; Breed</dt><dd>${escapeHtml(sp.name)} &mdash; ${escapeHtml(animal.breed || 'Unspecified')}</dd></div>
              <div><dt>Variety / Color</dt><dd>${escapeHtml(animal.variety || 'Unspecified')}</dd></div>
              <div><dt>Biological Sex</dt><dd>${escapeHtml(formatSexForSpecies(animal.sex, sp))}</dd></div>
              <div><dt>Date of Birth</dt><dd>${escapeHtml(formatReadableDate(animal.birthDateIso))}</dd></div>
              <div><dt>Recorded Weight</dt><dd class="mono">${escapeHtml(formatWeight(animal.weightGrams, effectiveUnit))}</dd></div>
              <div><dt>Cage / Pen Location</dt><dd>${escapeHtml(animal.cageLocation || 'Unassigned')}</dd></div>
              <div><dt>Breeder</dt><dd>${escapeHtml(animal.breederName || breederTitle)}</dd></div>
              <div><dt>Current Owner</dt><dd>${escapeHtml(animal.ownerName || breederTitle)}</dd></div>
              <div><dt>Sire / Dam</dt><dd>${escapeHtml(sire ? `${sire.name} (${sire.tattoo || 'No ID'})` : 'Unknown')} &times; ${escapeHtml(dam ? `${dam.name} (${dam.tattoo || 'No ID'})` : 'Unknown')}</dd></div>
            </dl>
          </div>

          <div class="sub-card">
            <div class="sub-card-title">Coat Color Genetics, Carriers &amp; COI Summary</div>
            <dl class="kv-list">
              <div><dt>Genotype String</dt><dd><code class="mono">${escapeHtml(subjectGeno || 'Not recorded')}</code></dd></div>
              ${animal.rufusLevel ? `<div><dt>Rufus Intensity</dt><dd>${escapeHtml(animal.rufusLevel)}</dd></div>` : ''}
              <div><dt>Confirmed Carrier Of</dt><dd>${escapeHtml(animalCarriers.confirmed.length > 0 ? animalCarriers.confirmed.join(', ') : 'None recorded')}</dd></div>
              <div><dt>Suspected Carrier Of</dt><dd>${escapeHtml(animalCarriers.suspected.length > 0 ? animalCarriers.suspected.join(', ') : 'None recorded')}</dd></div>
              <div><dt>Cleared (Non-Carrier Of)</dt><dd>${escapeHtml(
                lineageAnalysis.cleared.length > 0 || lineageAnalysis.genotypeCleared.length > 0
                  ? [
                      ...lineageAnalysis.cleared.map(
                        (c) => `${c.trait} (${formatClearedProofBadge(c)})`
                      ),
                      ...lineageAnalysis.genotypeCleared.map(
                        (g) => `${g.trait} (Homozygous ${g.pair})`
                      ),
                    ].join('; ')
                  : 'None recorded'
              )}</dd></div>
              <div><dt>Lineage Potential Carriers</dt><dd>${escapeHtml(
                lineageAnalysis.lineagePotential.length > 0
                  ? lineageAnalysis.lineagePotential
                      .map((l) => `${l.trait} (via ${l.viaBranches.join('/')})`)
                      .join('; ')
                  : lineageAnalysis.blockedBranches.length > 0
                  ? `None open (${lineageAnalysis.blockedBranches
                      .map((b) => `${b.trait} cleared on ${b.branch} line by ${b.clearedByName}`)
                      .join('; ')})`
                  : 'None from known pedigree'
              )}</dd></div>
              <div><dt>Wright COI</dt><dd class="mono">${coi.coiPercent.toFixed(2)}% &mdash; ${escapeHtml(coi.risk.label)}</dd></div>
              <div><dt>COI Guidance</dt><dd>${escapeHtml(coi.risk.guidance)}</dd></div>
            </dl>
            ${
              animal.genotype.length > 0
                ? `<table class="data-table compact" style="margin-top:8px;">
                    <thead><tr><th>Locus</th><th>Allele 1</th><th>Allele 2</th></tr></thead>
                    <tbody>
                      ${animal.genotype
                        .map(
                          (g) => `<tr>
                            <td class="mono"><strong>${escapeHtml(g.locus)}</strong></td>
                            <td class="mono">${escapeHtml(g.allele1)}</td>
                            <td class="mono">${escapeHtml(g.allele2)}</td>
                          </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>`
                : ''
            }
            <p class="small muted" style="margin-top:8px;">Note: Coat genotypes represent breeder-entered expectations or pedigree inference unless DNA-verified.</p>
          </div>
        </div>

        ${
          options.includeShowsAndKinship
            ? `<div class="sub-card">
                <div class="sub-card-title">Direct Offspring (${kinship.directOffspring.length})</div>
                ${
                  kinship.directOffspring.length === 0
                    ? '<p class="empty-msg">No recorded offspring in this species herd.</p>'
                    : `<table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Offspring Name</th>
                            <th>ID</th>
                            <th>Relationship / Mate</th>
                            <th>DOB</th>
                            <th>Herd Status</th>
                            <th>Titles / Reg #</th>
                          </tr>
                        </thead>
                        <tbody>${renderRelRows(kinship.directOffspring, true)}</tbody>
                      </table>`
                }
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Related Animals Still Within the Herd (${kinship.inHerdRelatives.length})</div>
                ${
                  kinship.inHerdRelatives.length === 0
                    ? '<p class="empty-msg">No active/in-herd parents, siblings, or extended relatives recorded.</p>'
                    : `<table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Relative Name</th>
                            <th>ID</th>
                            <th>Relationship</th>
                            <th>DOB</th>
                            <th>Herd Status</th>
                            <th>Titles / Reg #</th>
                          </tr>
                        </thead>
                        <tbody>${renderRelRows(kinship.inHerdRelatives, false)}</tbody>
                      </table>`
                }
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Noteworthy &amp; Titled Relatives Across Lineage (${kinship.noteworthyRelatives.length})</div>
                ${
                  kinship.noteworthyRelatives.length === 0
                    ? '<p class="empty-msg">No Grand Champions or Show Leg winners recorded among ancestors, siblings, or offspring.</p>'
                    : `<table class="data-table compact">
                        <thead>
                          <tr>
                            <th>Titled Relative</th>
                            <th>ID</th>
                            <th>Relationship</th>
                            <th>DOB</th>
                            <th>Current / Historical Status</th>
                            <th>Accomplishments</th>
                          </tr>
                        </thead>
                        <tbody>${renderRelRows(kinship.noteworthyRelatives, false)}</tbody>
                      </table>`
                }
              </div>`
            : ''
        }
      </div>`;

      // Sheet 3: Medical / Health History & Litters / Birthings
      const sheet3Html = options.includeHealthAndLitters
        ? `<div class="binder-sheet">
            <div class="sheet-banner">
              <div>
                <div class="sheet-kicker">DOSSIER #${dossierNumber} &middot; HEALTH, WEIGHTS &amp; ${escapeHtml(sp.birthEventLabel.toUpperCase())} HISTORY</div>
                <h3 class="sheet-title">${escapeHtml(animal.name)}${animal.tattoo ? ` <span class="mono muted">(${escapeHtml(animal.tattoo)})</span>` : ''}</h3>
              </div>
              <div class="sheet-meta-right">
                <div><strong>Care Logs:</strong> <span class="mono">${animalCareLogs.length}</span> &middot; <strong>Litters:</strong> <span class="mono">${animalBreedings.length}</span></div>
              </div>
            </div>

            <div class="sub-card">
              <div class="sub-card-title">Medical, Health, Weight &amp; Care History (${animalCareLogs.length})</div>
              ${
                animalCareLogs.length === 0
                  ? '<p class="empty-msg">No medical, weight, palpation, or care history entries logged for this animal.</p>'
                  : `<table class="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Log Type</th>
                          <th>Title / Treatment</th>
                          <th>Weight</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${animalCareLogs
                          .map(
                            (l) => `<tr>
                              <td class="mono">${escapeHtml(formatReadableDate(l.dateIso))}</td>
                              <td><strong>${escapeHtml(l.type)}</strong>${l.showLegEarned ? ' (Leg)' : ''}</td>
                              <td>${escapeHtml(l.title || '—')}</td>
                              <td class="mono">${l.weightGrams > 0 ? escapeHtml(formatWeight(l.weightGrams, effectiveUnit)) : '—'}</td>
                              <td>${l.notes ? escapeMultilineHtml(l.notes) : '—'}</td>
                            </tr>`
                          )
                          .join('')}
                      </tbody>
                    </table>`
              }
            </div>

            <div class="sub-card">
              <div class="sub-card-title">${escapeHtml(sp.birthEventLabel)}s, Pairings &amp; Litter Records (${animalBreedings.length})</div>
              ${
                animalBreedings.length === 0
                  ? `<p class="empty-msg">No ${escapeHtml(sp.birthEventLabel.toLowerCase())} or breeding pairings recorded as ${escapeHtml(sp.maleLabel)} or ${escapeHtml(sp.femaleLabel)}.</p>`
                  : `<table class="data-table">
                      <thead>
                        <tr>
                          <th>Role &amp; Mate</th>
                          <th>Bred Date</th>
                          <th>Due / Actual Birth</th>
                          <th>Status</th>
                          <th>Outcome Counts</th>
                          <th>Proj. COI</th>
                          <th>Breeding Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${animalBreedings
                          .map((b) => {
                            const asSire = b.sireId === animal.id;
                            const mate = asSire
                              ? b.damId ? herdById.get(b.damId) : undefined
                              : b.sireId ? herdById.get(b.sireId) : undefined;
                            const mateLabel = mate
                              ? `${mate.name}${mate.tattoo ? ` (${mate.tattoo})` : ''}`
                              : asSire
                              ? b.damName || 'Unknown Dam'
                              : b.sireName || 'Unknown Sire';
                            const rolePrefix = asSire ? `As ${sp.maleLabel} × ` : `As ${sp.femaleLabel} × `;
                            const countsStr = [
                              `Live: ${b.liveCount}`,
                              `Still: ${b.stillbornCount}`,
                              b.fosteredCount ? `Fost: ${b.fosteredCount}` : '',
                              `Weaned: ${b.weanedCount}`,
                            ]
                              .filter(Boolean)
                              .join(' · ');
                            return `<tr>
                              <td><strong>${escapeHtml(rolePrefix + mateLabel)}</strong></td>
                              <td class="mono">${escapeHtml(formatReadableDate(b.bredDateIso))}</td>
                              <td class="mono">Due ${escapeHtml(formatReadableDate(b.expectedDueDateIso))}${b.actualBirthDateIso ? `<br />Born ${escapeHtml(formatReadableDate(b.actualBirthDateIso))}` : ''}</td>
                              <td>${escapeHtml(formatBreedingStatusForSpecies(b.status, sp))}</td>
                              <td class="mono">${escapeHtml(countsStr)}</td>
                              <td class="mono">${b.projectedCoiPercent.toFixed(2)}%</td>
                              <td>${b.notes ? escapeMultilineHtml(b.notes) : '—'}</td>
                            </tr>`;
                          })
                          .join('')}
                      </tbody>
                    </table>`
              }
            </div>
          </div>`
        : '';

      // Sheet 4: Shows, Uploaded Photos + Captions, & Remaining Animal Notes
      const sheet4Html =
        options.includeShowsAndKinship || options.includePhotos || Boolean(animal.notes?.trim())
          ? `<div class="binder-sheet">
              <div class="sheet-banner">
                <div>
                  <div class="sheet-kicker">DOSSIER #${dossierNumber} &middot; SHOWS, PHOTOS &amp; SUPPLEMENTAL NOTES</div>
                  <h3 class="sheet-title">${escapeHtml(animal.name)}${animal.tattoo ? ` <span class="mono muted">(${escapeHtml(animal.tattoo)})</span>` : ''}</h3>
                </div>
                <div class="sheet-meta-right">
                  <div><strong>Reg #:</strong> <span class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</span></div>
                  <div><strong>GC #:</strong> <span class="mono">${escapeHtml(animal.grandChampionNumber || '—')}</span> &middot; <strong>Legs:</strong> <span class="mono">${Math.max(animal.legsCount || 0, showLegLogs.length)}</span></div>
                </div>
              </div>

              ${
                options.includeShowsAndKinship
                  ? `<div class="sub-card">
                      <div class="sub-card-title">Show Winnings, Show Legs &amp; Event Entries</div>
                      <div class="reg-summary-bar">
                        <span><strong>Registration #:</strong> <span class="mono">${escapeHtml(animal.registrationNumber || 'Unregistered')}</span></span>
                        <span><strong>Grand Champion #:</strong> <span class="mono">${escapeHtml(animal.grandChampionNumber || 'None')}</span></span>
                        <span><strong>Total Show Legs:</strong> <span class="mono">${Math.max(animal.legsCount || 0, showLegLogs.length)}</span></span>
                      </div>
                      ${
                        showLegLogs.length === 0 && animalShows.length === 0
                          ? '<p class="empty-msg">No show events or show leg winnings recorded yet.</p>'
                          : `<table class="data-table compact">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Source</th>
                                  <th>Show / Award Title</th>
                                  <th>Sanction / Location</th>
                                  <th>Notes &amp; Placements</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${showLegLogs
                                  .map(
                                    (l) => `<tr>
                                      <td class="mono">${escapeHtml(formatReadableDate(l.dateIso))}</td>
                                      <td>Show / Leg Log</td>
                                      <td><strong>${escapeHtml(l.title || 'Show Placement')}</strong>${l.showLegEarned ? ' (Leg Earned)' : ''}</td>
                                      <td>Recorded Award</td>
                                      <td>${l.notes ? escapeMultilineHtml(l.notes) : '—'}</td>
                                    </tr>`
                                  )
                                  .join('')}
                                ${animalShows
                                  .map(
                                    (sh) => `<tr>
                                      <td class="mono">${escapeHtml(formatReadableDate(sh.eventDateIso))}</td>
                                      <td>Entered Show</td>
                                      <td><strong>${escapeHtml(sh.name)}</strong></td>
                                      <td>${escapeHtml([sh.sanctioningBody, sh.location].filter(Boolean).join(' · ') || '—')}</td>
                                      <td>${sh.notes ? escapeMultilineHtml(sh.notes) : 'Entered on roster'}</td>
                                    </tr>`
                                  )
                                  .join('')}
                              </tbody>
                            </table>`
                      }
                    </div>`
                  : ''
              }

              <div class="sub-card">
                <div class="sub-card-title">Uploaded Photographs &amp; Photo Notes (${animalPhotos.length})</div>
                ${
                  animalPhotos.length === 0
                    ? '<p class="empty-msg">No uploaded photographs attached to this animal.</p>'
                    : !options.includePhotos
                    ? `<p class="empty-msg">Image rendering disabled by preview setting (${animalPhotos.length} photo caption${animalPhotos.length === 1 ? '' : 's'} summarized): ${escapeHtml(
                        animalPhotos
                          .map((p, pIdx) => `#${pIdx + 1}${p.caption ? `: ${p.caption}` : ''}`)
                          .join(' | ')
                      )}</p>`
                    : `<div class="photo-grid">
                        ${animalPhotos
                          .map((p, pIdx) => {
                            const safeUrl =
                              p.dataUrl && p.dataUrl.startsWith('data:image/') ? p.dataUrl : '';
                            return `<figure class="photo-card">
                              ${safeUrl ? `<img src="${safeUrl}" alt="${escapeHtml(p.caption || `${animal.name} photo ${pIdx + 1}`)}" />` : ''}
                              <figcaption>
                                <div class="photo-label">Photo #${pIdx + 1}${p.isPrimary ? ' (Primary Cover)' : ''}${p.originalFileName ? ` &middot; <span class="mono">${escapeHtml(p.originalFileName)}</span>` : ''}</div>
                                <div class="photo-caption">${p.caption ? escapeMultilineHtml(p.caption) : '<span class="muted">No photo notes entered.</span>'}</div>
                              </figcaption>
                            </figure>`;
                          })
                          .join('')}
                      </div>`
                }
              </div>

              <div class="sub-card">
                <div class="sub-card-title">Additional / General Profile Notes</div>
                <div class="prose-note">${
                  animal.notes && animal.notes.trim()
                    ? escapeMultilineHtml(animal.notes.trim())
                    : '<span class="muted">No additional general notes recorded on this animal&rsquo;s profile.</span>'
                }</div>
              </div>
            </div>`
          : '';

      return `<article class="animal-dossier">
        ${sheet1Html}
        ${sheet2Html}
        ${sheet3Html}
        ${sheet4Html}
      </article>`;
    })
    .join('\n');

  const emptyDossierFallback =
    includedAnimals.length === 0
      ? `<section class="binder-page">
          <div class="sub-card">
            <div class="sub-card-title">No Animal Dossiers Selected</div>
            <p class="empty-msg">
              There are currently no ${options.includeArchived ? '' : 'active '}${escapeHtml(sp.name)} animals in the selected binder scope.
              ${!options.includeArchived && archivedAnimals.length > 0 ? `Enable <strong>Include Archived / Sold / Deceased</strong> in the Binder toolbar to print ${archivedAnimals.length} historical animal record${archivedAnimals.length === 1 ? '' : 's'}.` : ''}
            </p>
          </div>
        </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
${palette.mode === 'color' ? '<meta name="barn-preserve-accent-ink" content="true" />' : ''}
<title>${escapeHtml(barnTitle)} - ${escapeHtml(sp.name)} Barn Binder</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
  :root, html, body {
    color-scheme: light only;
    background: #ffffff;
    background-color: #ffffff;
    color: ${palette.ink};
    margin: 0;
    padding: 0;
  }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11.5px;
    line-height: 1.42;
    padding: 16px;
  }
  * { box-sizing: border-box; }
  .mono { font-family: "Courier New", Courier, monospace; font-variant-numeric: tabular-nums; }
  .muted { color: ${palette.mutedInk}; }
  .small { font-size: 10px; }

  .binder-page, .binder-sheet {
    background: #ffffff;
    background-color: #ffffff;
    page-break-after: always;
    break-after: page;
    padding-bottom: 10px;
  }
  .binder-sheet:last-child, .animal-dossier:last-child .binder-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  /* Cover Page */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 9.3in;
    border: 2px solid ${palette.border};
    padding: 24px 26px;
    background: #ffffff;
  }
  .cover-eyebrow {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.14em;
    font-weight: bold;
    color: ${palette.accent};
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .cover-title {
    font-size: 30px;
    line-height: 1.15;
    margin: 0 0 8px 0;
    color: ${palette.primary};
    border-bottom: 2.5px solid ${palette.primary};
    padding-bottom: 10px;
  }
  .cover-subtitle {
    font-size: 12.5px;
    color: ${palette.mutedInk};
    margin: 10px 0 0 0;
    max-width: 660px;
  }
  .cover-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin: 18px 0;
  }
  .info-box, .sub-card, .certification-box {
    background: #ffffff;
    background-color: #ffffff;
    border: 1px solid ${palette.hairline};
    border-top: 2.5px solid ${palette.primary};
    padding: 10px 12px;
    margin-bottom: 10px;
    break-inside: avoid;
  }
  .certification-box {
    border-top: 2.5px solid ${palette.accent};
    margin-top: 8px;
  }
  .box-title, .sub-card-title {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    font-weight: bold;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${palette.primary};
    border-bottom: 1px solid ${palette.hairline};
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .kv-list {
    margin: 0;
    padding: 0;
  }
  .kv-list > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-bottom: 1px dotted ${palette.hairline};
    font-size: 11px;
  }
  .kv-list > div:last-child { border-bottom: none; }
  .kv-list dt { font-weight: bold; color: ${palette.mutedInk}; min-width: 130px; }
  .kv-list dd { margin: 0; text-align: right; color: ${palette.ink}; }

  .cert-statement { font-size: 11.5px; margin: 4px 0 10px 0; font-style: italic; }
  .cert-contact { font-size: 11px; margin: 0 0 10px 0; color: ${palette.primary}; }
  .sig-grid {
    display: grid;
    grid-template-columns: 1.2fr 1.4fr 0.9fr;
    gap: 16px;
    margin-top: 18px;
  }
  .sig-buyer { margin-top: 22px; }
  .sig-field { display: flex; flex-direction: column; }
  .sig-line {
    border-bottom: 1px solid ${palette.ink};
    height: 22px;
    margin-bottom: 4px;
  }
  .sig-label {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    color: ${palette.mutedInk};
  }
  .page-foot {
    display: flex;
    justify-content: space-between;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    color: ${palette.mutedInk};
    border-top: 1px solid ${palette.hairline};
    padding-top: 6px;
    margin-top: 10px;
  }

  /* Sheet Headers & Layout */
  .sheet-banner {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    border-bottom: 2px solid ${palette.primary};
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .sheet-kicker {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    letter-spacing: 0.1em;
    font-weight: bold;
    color: ${palette.accent};
    text-transform: uppercase;
  }
  .sheet-title {
    font-size: 19px;
    margin: 2px 0 0 0;
    color: ${palette.primary};
  }
  .sheet-meta-right {
    text-align: right;
    font-size: 10.5px;
    color: ${palette.mutedInk};
    white-space: nowrap;
  }
  .two-col-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* Subject Strip & Pedigree Table */
  .subject-strip {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid ${palette.hairline};
    border-left: 3.5px solid ${palette.primary};
    background: #ffffff;
    padding: 8px 10px;
    margin-bottom: 10px;
  }
  .subject-thumb {
    width: 68px;
    height: 68px;
    object-fit: cover;
    border: 1px solid ${palette.hairline};
    border-radius: 4px;
    flex-shrink: 0;
  }
  .subject-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 11px;
    flex: 1;
  }
  table.ped-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    background: #ffffff;
    margin-bottom: 10px;
  }
  table.ped-table th {
    background: #ffffff;
    color: ${palette.primary};
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    text-align: left;
    padding: 4px 6px;
    border: 1px solid ${palette.hairline};
    border-bottom: 2px solid ${palette.primary};
  }
  td.ped-cell {
    background: #ffffff;
    border: 1px solid ${palette.hairline};
    padding: 4px 6px;
    vertical-align: middle;
    font-size: 10px;
    line-height: 1.25;
    word-break: break-word;
  }
  td.ped-sire { border-left: 3px solid ${palette.male}; }
  td.ped-dam { border-left: 3px solid ${palette.female}; }
  td.ped-empty { color: ${palette.mutedInk}; font-style: italic; }
  table.ped-compact td.ped-cell { padding: 2px 4px; font-size: 8.5px; line-height: 1.15; }
  .ped-name { font-weight: bold; color: ${palette.ink}; }
  .ped-meta { font-family: "Courier New", monospace; font-size: 9px; color: ${palette.mutedInk}; }
  .ped-reg { color: ${palette.accent}; }
  .ped-geno { font-family: "Courier New", monospace; font-size: 8.5px; color: ${palette.primary}; }
  .ped-carrier { font-family: Arial, Helvetica, sans-serif; font-size: 8.2px; font-weight: bold; color: ${palette.accent}; margin-top: 1.5px; line-height: 1.15; }

  /* Data Tables */
  table.data-table {
    width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    font-size: 10.5px;
  }
  table.data-table.compact { font-size: 10px; }
  table.data-table th {
    background: #ffffff;
    color: ${palette.primary};
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: left;
    padding: 5px 6px;
    border-bottom: 1.5px solid ${palette.primary};
    border-top: 1px solid ${palette.hairline};
  }
  table.data-table td {
    background: #ffffff;
    padding: 5px 6px;
    border-bottom: 1px solid ${palette.hairline};
    vertical-align: top;
  }
  .reg-summary-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    font-size: 11px;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid ${palette.hairline};
  }
  .prose-note {
    font-size: 11px;
    line-height: 1.5;
    padding: 4px 2px;
    white-space: normal;
    word-break: break-word;
  }
  .empty-msg {
    font-size: 10.5px;
    color: ${palette.mutedInk};
    font-style: italic;
    margin: 2px 0;
  }

  /* Photo Gallery Grid */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .photo-card {
    margin: 0;
    border: 1px solid ${palette.hairline};
    background: #ffffff;
    padding: 6px;
    break-inside: avoid;
  }
  .photo-card img {
    width: 100%;
    height: 165px;
    object-fit: contain;
    background: #ffffff;
    border-bottom: 1px solid ${palette.hairline};
    margin-bottom: 5px;
  }
  .photo-label {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9.5px;
    font-weight: bold;
    color: ${palette.primary};
    margin-bottom: 2px;
  }
  .photo-caption {
    font-size: 10.5px;
    color: ${palette.ink};
    word-break: break-word;
  }

  @media print {
    :root, html, body, .binder-page, .binder-sheet, .cover-page, .info-box, .sub-card, .certification-box, .subject-strip, table.ped-table, table.ped-table th, td.ped-cell, table.data-table, table.data-table th, table.data-table td, .photo-card, .photo-card img {
      color-scheme: light only !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      box-shadow: none !important;
    }
    ${
      palette.mode === 'ink_saver'
        ? `:root, html, body, * {
             color: #000000 !important;
             -webkit-print-color-adjust: economy !important;
             print-color-adjust: economy !important;
           }`
        : `* {
             -webkit-print-color-adjust: exact;
             print-color-adjust: exact;
           }`
    }
  }
</style>
</head>
<body>
  ${coverPageHtml}
  ${speciesOverviewHtml}
  ${animalDossiersHtml || emptyDossierFallback}
</body>
</html>`;
}
