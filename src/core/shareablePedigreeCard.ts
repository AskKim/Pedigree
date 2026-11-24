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
          <div class="barn-name">${escapeSafeHtml(settings.barnName || 'Pedigree')}</div>
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
            <span>${breederContactLine ? `<strong>${escapeSafeHtml(breederContactLine)}</strong>` : escapeSafeHtml(settings.barnName || 'Pedigree')}</span>
            <span>Open-source offline pedigree record</span>
          </footer>`
        : ''
    }
  </article>
</body>
</html>`;
}
