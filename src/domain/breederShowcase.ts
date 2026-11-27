/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Zero-Server Breeder Showcase & "For Sale" Catalog HTML Exporter
 * (`src/domain/breederShowcase.ts`).
 *
 * Generates a self-contained, single-file `.html` catalog + printable buyer stock sheet
 * from animals marked `For Sale` (with optional photos, summarized 2–3 generation
 * pedigrees, show/wool highlights, reservation hold badges, carrier disclosures, and
 * breeder contact details) that breeders can share directly or host on any free static
 * web host with zero centralized server, external fonts, or CDN dependencies.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) calls.
 */

import {
  AnimalWithdrawalEvaluation,
  buildWithdrawalByAnimalMap,
} from './barnAlerts';
import { formatCompactCarrierDisclosure } from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import {
  escapeSafeHtml,
  sanitizePlainText,
  sanitizeSafeExternalHttpUrl,
  sanitizeSafeRasterImageDataUrl,
  sanitizeSingleLineText,
} from './inputSanitization';
import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  formatCurrencyCents,
  formatPedigreeWeight,
  formatReadableDate,
  formatSexForSpecies,
  isAnimalAvailableForSale,
  isSameSpecies,
  normalizeCurrencyCode,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  todayDateIso,
} from './models';
import {
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  getPedigreeCompletenessSummary,
  PedigreeSlot,
} from './pedigreeCalculator';
import {
  PedigreeColorPresetId,
  resolvePedigreePrintTheme,
} from './pedigreePrintStyles';
import { renderQrSvg } from './qrCode';
import { computeAnimalShowSummary } from './showResults';
import { buildWoolHarvestSummaryByAnimalId, formatWoolWeightSummary } from './woolFiber';

export type BreederShowcaseLayoutMode = 'showcase_and_sheet' | 'stock_sheet_only';

export interface BreederShowcaseOptions {
  /** Optional species filter; omit or pass empty string for all species. */
  speciesName?: string;
  /** Optional explicit animal ID subset (still filtered by `isAnimalAvailableForSale`). */
  selectedAnimalIds?: string[];
  /** Embed animal portraits (default: true). */
  includePhotos?: boolean;
  /** Prefer lighter thumbnail data URLs when keeping share files compact (default: false). */
  preferThumbnails?: boolean;
  /** Include 2-generation Sire/Dam/Grandparents + COI summary per animal (default: true). */
  includePedigreeSummary?: boolean;
  /** Include genotype & carrier disclosures (default: true for carriers, configurable for loci). */
  includeGenotypes?: boolean;
  /** Include breeder contact bar & inquiry links (default: true). */
  includeContactInfo?: boolean;
  /** Optional base URL used to render a QR badge back to the breeder's app/site. */
  appBaseUrl?: string;
  /** Render QR code when `appBaseUrl` is valid (default: false unless provided). */
  includeQrCode?: boolean;
  /** Layout mode: interactive cards + printable stock sheet, or compact stock sheet only. */
  layoutMode?: BreederShowcaseLayoutMode;
  /** Print accent palette preset (defaults to classic_sage inheriting custom barn colors). */
  colorPreset?: PedigreeColorPresetId;
  /** Calendar date YYYY-MM-DD override for deterministic output & withdrawal checks. */
  todayIso?: string;
  /** Optional custom catalog title override. */
  title?: string;
  /** Optional subtitle/tagline override. */
  subtitle?: string;
}

export interface BreederShowcaseResult {
  html: string;
  filename: string;
  animalCount: number;
  speciesNames: string[];
  reservedCount: number;
  activeWithdrawalWarnings: string[];
  hasPhotosEmbedded: boolean;
}

function sanitizeShowcaseFileSlug(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function buildBreederShowcaseFileName(
  barnName: string | undefined,
  speciesName?: string,
  dateIso: string = nowIsoUtc().slice(0, 10)
): string {
  const barnSlug = sanitizeShowcaseFileSlug(barnName, 'breeder');
  const spSlug = speciesName?.trim()
    ? `-${sanitizeShowcaseFileSlug(speciesName, 'stock')}`
    : '';
  const dateSlug = /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : nowIsoUtc().slice(0, 10);
  return `${barnSlug}${spSlug}-for-sale-showcase-${dateSlug}.html`;
}

function sanitizeSafeEmail(raw: string | undefined): string {
  const clean = sanitizeSingleLineText(raw || '', 160).replace(/[\s<>"'()\\]/g, '');
  if (!clean || !clean.includes('@') || clean.startsWith('@') || clean.endsWith('@')) {
    return '';
  }
  return clean;
}

function sanitizeSafeTelHref(raw: string | undefined): { display: string; href: string } {
  const display = sanitizeSingleLineText(raw || '', 80);
  if (!display) return { display: '', href: '' };
  const telChars = display.replace(/[^0-9+().\- ]/g, '').trim();
  const digits = telChars.replace(/\D/g, '');
  if (digits.length < 7) return { display, href: '' };
  return {
    display,
    href: `tel:${telChars.replace(/\s+/g, '')}`,
  };
}

function resolveReservationBadgeForAnimal(
  animalId: string,
  reservations: AnimalReservation[]
): { label: string; kind: 'hold' | 'reserved' } | null {
  for (const res of reservations) {
    if (res.animalId !== animalId) continue;
    if (res.status === 'Cancelled' || res.status === 'Picked Up / Completed') continue;
    if (res.status === 'Deposit Paid' || res.status === 'Paid in Full' || res.status === 'Ready for Pickup') {
      return { label: 'Reserved', kind: 'reserved' };
    }
    return { label: 'On Hold', kind: 'hold' };
  }
  return null;
}

function pickBestAnimalPhotoUrl(
  animalId: string,
  photos: AnimalPhoto[],
  preferThumbnails: boolean
): string {
  const matching = photos
    .filter((p) => p.animalId === animalId)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  for (const p of matching) {
    const candidate = preferThumbnails
      ? p.thumbnailDataUrl || p.dataUrl
      : p.dataUrl || p.thumbnailDataUrl;
    const safe = sanitizeSafeRasterImageDataUrl(candidate);
    if (safe) return safe;
  }
  return '';
}

function formatAncestorLine(slot: PedigreeSlot | undefined): string {
  const anc = slot?.animal;
  if (!anc) return 'Unknown';
  const bits = [anc.name];
  if (anc.tattoo) bits.push(`#${anc.tattoo}`);
  if (anc.variety) bits.push(anc.variety);
  if (anc.grandChampionNumber) bits.push(`GC ${anc.grandChampionNumber}`);
  return bits.join(' · ');
}

function buildMailtoHref(
  email: string,
  subjectText: string,
  bodyText: string
): string {
  if (!email) return '';
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subjectText)}&body=${encodeURIComponent(bodyText)}`;
}

/**
 * Builds the complete Breeder Showcase HTML page alongside summary metrics and withdrawal advisories.
 */
export function buildBreederShowcaseResult(
  snapshot: BarnDatabaseSnapshot,
  options: BreederShowcaseOptions = {}
): BreederShowcaseResult {
  const { settings } = snapshot;
  const scopedSpecies = options.speciesName?.trim() || '';
  const todayIso =
    options.todayIso && /^\d{4}-\d{2}-\d{2}$/.test(options.todayIso)
      ? options.todayIso
      : todayDateIso();
  const includePhotos = options.includePhotos ?? true;
  const preferThumbnails = options.preferThumbnails ?? false;
  const includePedigreeSummary = options.includePedigreeSummary ?? true;
  const includeGenotypes = options.includeGenotypes ?? false;
  const includeContactInfo = options.includeContactInfo ?? true;
  const layoutMode: BreederShowcaseLayoutMode = options.layoutMode ?? 'showcase_and_sheet';

  const selectedSet =
    options.selectedAnimalIds && options.selectedAnimalIds.length > 0
      ? new Set(options.selectedAnimalIds)
      : null;

  const forSaleAnimals = snapshot.animals
    .filter((a) => {
      if (!isAnimalAvailableForSale(a)) return false;
      if (scopedSpecies && !isSameSpecies(a.species, scopedSpecies)) return false;
      if (selectedSet && !selectedSet.has(a.id)) return false;
      return true;
    })
    .sort((a, b) => {
      const spCmp = a.species.localeCompare(b.species);
      if (spCmp !== 0) return spCmp;
      const breedCmp = (a.breed || '').localeCompare(b.breed || '');
      if (breedCmp !== 0) return breedCmp;
      return a.name.localeCompare(b.name);
    });

  const speciesNames = Array.from(new Set(forSaleAnimals.map((a) => a.species))).sort((a, b) =>
    a.localeCompare(b)
  );
  const sexesPresent = Array.from(new Set(forSaleAnimals.map((a) => a.sex))).filter(
    (s) => s === 'Male' || s === 'Female'
  );

  const theme = resolvePedigreePrintTheme(
    { colorPreset: options.colorPreset ?? 'classic_sage' },
    settings.customColors
  );
  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const barnTitle = sanitizeSingleLineText(settings.barnName, 160) || 'Community Pedigree Barn';
  const breederDisplay = sanitizeSingleLineText(settings.breederName, 160);
  const safeLogo = sanitizeSafeRasterImageDataUrl(settings.breederLogoDataUrl);

  const safeEmail = includeContactInfo ? sanitizeSafeEmail(settings.breederEmail) : '';
  const safeTel = includeContactInfo ? sanitizeSafeTelHref(settings.breederPhone) : { display: '', href: '' };
  const safeLocation = includeContactInfo
    ? sanitizeSingleLineText(settings.breederLocation || '', 160)
    : '';
  const safeWebsite = includeContactInfo
    ? sanitizeSafeExternalHttpUrl(settings.breederWebsite || '')
    : '';
  const tagline = sanitizeSingleLineText(
    options.subtitle || settings.showcaseTagline || '',
    240
  );
  const pageTitle = sanitizeSingleLineText(
    options.title ||
      (scopedSpecies ? `${barnTitle} — ${scopedSpecies} Available Stock` : `${barnTitle} — Available Stock Showcase`),
    180
  );

  const safeAppBaseUrl = sanitizeSafeExternalHttpUrl(options.appBaseUrl || '');
  const qrUrl = options.includeQrCode && safeAppBaseUrl ? safeWebsite || safeAppBaseUrl : '';
  const qrSvg = qrUrl
    ? renderQrSvg(qrUrl, {
        sizePx: 68,
        quietZone: 2,
        ariaLabel: `QR code for ${barnTitle}`,
        className: 'qr-svg',
      })
    : '';

  const withdrawalByAnimal = buildWithdrawalByAnimalMap(snapshot.careLogs, { todayIso });
  const woolByAnimalId =
    snapshot.woolHarvests && snapshot.woolHarvests.length > 0
      ? buildWoolHarvestSummaryByAnimalId(snapshot.woolHarvests)
      : new Map();

  // Pre-build per-species herd maps cleanly once per species
  const herdMapBySpeciesKey = new Map<string, Map<string, Animal>>();
  const getHerdMapFor = (speciesName: string): Map<string, Animal> => {
    const key = speciesName.trim().toLowerCase();
    let map = herdMapBySpeciesKey.get(key);
    if (!map) {
      map = buildSpeciesHerdMap(snapshot.animals, speciesName);
      herdMapBySpeciesKey.set(key, map);
    }
    return map;
  };

  let reservedCount = 0;
  let embeddedPhotoCount = 0;
  let anyGenotypeShown = false;
  const activeWithdrawalWarnings: string[] = [];

  interface PreparedSaleEntry {
    animal: Animal;
    sexLabel: string;
    breedVariety: string;
    priceText: string;
    weightText: string;
    dobText: string;
    photoUrl: string;
    reservation: { label: string; kind: 'hold' | 'reserved' } | null;
    withdrawal: AnimalWithdrawalEvaluation | undefined;
    sireLine: string;
    damLine: string;
    pgsLine: string;
    pgdLine: string;
    mgsLine: string;
    mgdLine: string;
    coiText: string;
    completenessText: string;
    honors: string[];
    woolLine: string;
    genotypeText: string;
    carrierLine: string;
    saleNotesText: string;
    inquiryHref: string;
    searchBlob: string;
  }

  const prepared: PreparedSaleEntry[] = forSaleAnimals.map((animal) => {
    const sp = resolveSpeciesProfile(animal.species, snapshot.speciesProfiles);
    const unit = resolveSpeciesWeightUnit(sp, settings);
    const herdMap = getHerdMapFor(animal.species);
    const coi = calculateAnimalCoi(animal, herdMap);
    const comp = getPedigreeCompletenessSummary(coi);
    const slots = includePedigreeSummary
      ? buildPedigreeSlots(animal, herdMap, 3, sp)
      : [];
    const slotMap = new Map<string, PedigreeSlot>();
    for (const sl of slots) {
      slotMap.set(`${sl.generation}:${sl.slotIndex}`, sl);
    }

    const reservation = resolveReservationBadgeForAnimal(
      animal.id,
      snapshot.animalReservations ?? []
    );
    if (reservation) reservedCount++;

    const withdrawal = withdrawalByAnimal.get(animal.id);
    if (withdrawal?.isActive) {
      activeWithdrawalWarnings.push(
        `${animal.name}${animal.tattoo ? ` (${animal.tattoo})` : ''} is under active medication withdrawal until ${formatReadableDate(withdrawal.clearDateIso)} (${withdrawal.medicationSummary}).`
      );
    }

    const photoUrl = includePhotos
      ? pickBestAnimalPhotoUrl(animal.id, snapshot.animalPhotos ?? [], preferThumbnails)
      : '';
    if (photoUrl) embeddedPhotoCount++;

    const showSummary = computeAnimalShowSummary(
      animal,
      snapshot.shows ?? [],
      snapshot.careLogs ?? []
    );
    const honors: string[] = [];
    if (animal.registrationNumber) honors.push(`Reg ${animal.registrationNumber}`);
    if (animal.grandChampionNumber) honors.push(`GC ${animal.grandChampionNumber}`);
    if (showSummary.effectiveLegs > 0) {
      honors.push(`${showSummary.effectiveLegs} Leg${showSummary.effectiveLegs === 1 ? '' : 's'}`);
    }
    if (showSummary.awardsSummaryText) honors.push(showSummary.awardsSummaryText);

    const woolSum = woolByAnimalId.get(animal.id);
    const woolLine =
      woolSum && (woolSum.harvestCount > 0 || woolSum.highestIagarbScore)
        ? formatWoolWeightSummary(woolSum, { compact: true })
        : '';

    const genotypeText = includeGenotypes
      ? animal.genotypeRaw || formatGenotypeArray(animal.genotype)
      : '';
    if (genotypeText || animal.rufusLevel) {
      anyGenotypeShown = true;
    }

    const carrierLine = formatCompactCarrierDisclosure(animal, {
      herdById: herdMap,
      includeLineage: true,
      includeCleared: true,
    });

    const priceText =
      animal.askingPriceCents && animal.askingPriceCents > 0
        ? formatCurrencyCents(animal.askingPriceCents, currencyCode)
        : 'Inquire for Price';

    const sexLabel = formatSexForSpecies(animal.sex, sp);
    const breedVariety = [animal.breed, animal.variety].filter(Boolean).join(' — ');
    const weightText =
      animal.weightGrams > 0 ? formatPedigreeWeight(animal.weightGrams, unit, false) : '';
    const dobText = animal.birthDateIso ? formatReadableDate(animal.birthDateIso) : '';
    const saleNotesText = sanitizePlainText(animal.saleNotes || '', 1_500).trim();

    const inquiryHref = safeEmail
      ? buildMailtoHref(
          safeEmail,
          `Inquiry: ${animal.name}${animal.tattoo ? ` (#${animal.tattoo})` : ''} — ${barnTitle}`,
          `Hello${breederDisplay ? ` ${breederDisplay}` : ''},\n\nI saw ${animal.name} (${animal.species}${breedVariety ? `, ${breedVariety}` : ''}, listed at ${priceText}) in your ${barnTitle} showcase and would like to ask about availability.\n`
        )
      : '';

    const searchBlob = [
      animal.name,
      animal.tattoo,
      animal.species,
      animal.breed,
      animal.variety,
      sexLabel,
      saleNotesText,
      formatAncestorLine(slotMap.get('1:0')),
      formatAncestorLine(slotMap.get('1:1')),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return {
      animal,
      sexLabel,
      breedVariety,
      priceText,
      weightText,
      dobText,
      photoUrl,
      reservation,
      withdrawal,
      sireLine: formatAncestorLine(slotMap.get('1:0')),
      damLine: formatAncestorLine(slotMap.get('1:1')),
      pgsLine: formatAncestorLine(slotMap.get('2:0')),
      pgdLine: formatAncestorLine(slotMap.get('2:1')),
      mgsLine: formatAncestorLine(slotMap.get('2:2')),
      mgdLine: formatAncestorLine(slotMap.get('2:3')),
      coiText: `${coi.coiPercent.toFixed(2)}% (${coi.risk.label})`,
      completenessText: `${comp.known3Gen}/${comp.max3Gen} 3-gen`,
      honors,
      woolLine,
      genotypeText,
      carrierLine,
      saleNotesText,
      inquiryHref,
      searchBlob,
    };
  });

  const cardsHtml = prepared
    .map((entry) => {
      const a = entry.animal;
      const initialLetter = escapeSafeHtml((a.name || '?').trim().charAt(0).toUpperCase() || '?');
      const statusBadge = entry.reservation
        ? `<span class="badge ${entry.reservation.kind === 'reserved' ? 'reserved' : 'hold'}">${escapeSafeHtml(entry.reservation.label)}</span>`
        : '<span class="badge avail">Available</span>';
      const sexClass = a.sex === 'Male' ? 'male' : a.sex === 'Female' ? 'female' : 'neutral';

      const mediaHtml = entry.photoUrl
        ? `<div class="photo-wrap"><img class="animal-photo" src="${entry.photoUrl}" alt="${escapeSafeHtml(a.name)}" loading="lazy" /></div>`
        : `<div class="photo-wrap placeholder" aria-hidden="true"><span>${initialLetter}</span></div>`;

      const pedigreeHtml = includePedigreeSummary
        ? `<div class="pedigree-box">
            <div class="ped-head">
              <span>Lineage Summary</span>
              <span class="mono">COI ${escapeSafeHtml(entry.coiText)} &middot; ${escapeSafeHtml(entry.completenessText)}</span>
            </div>
            <div class="ped-grid">
              <div class="ped-branch sire">
                <div class="ped-role">Sire</div>
                <div class="ped-name">${escapeSafeHtml(entry.sireLine)}</div>
                ${
                  entry.pgsLine !== 'Unknown' || entry.pgdLine !== 'Unknown'
                    ? `<div class="ped-gp">PGS: ${escapeSafeHtml(entry.pgsLine)}<br/>PGD: ${escapeSafeHtml(entry.pgdLine)}</div>`
                    : ''
                }
              </div>
              <div class="ped-branch dam">
                <div class="ped-role">Dam</div>
                <div class="ped-name">${escapeSafeHtml(entry.damLine)}</div>
                ${
                  entry.mgsLine !== 'Unknown' || entry.mgdLine !== 'Unknown'
                    ? `<div class="ped-gp">MGS: ${escapeSafeHtml(entry.mgsLine)}<br/>MGD: ${escapeSafeHtml(entry.mgdLine)}</div>`
                    : ''
                }
              </div>
            </div>
          </div>`
        : '';

      const withdrawalHtml = entry.withdrawal?.isActive
        ? `<div class="alert-hold"><strong>Medication Withdrawal Hold:</strong> Clears ${escapeSafeHtml(formatReadableDate(entry.withdrawal.clearDateIso))} (${escapeSafeHtml(entry.withdrawal.countdownLabel)})</div>`
        : '';

      const disclosuresHtml = [
        entry.honors.length > 0
          ? `<div class="meta-line"><strong>Show &amp; Registry:</strong> ${escapeSafeHtml(entry.honors.join(' · '))}</div>`
          : '',
        entry.woolLine
          ? `<div class="meta-line"><strong>Wool / Fiber:</strong> ${escapeSafeHtml(entry.woolLine)}</div>`
          : '',
        entry.genotypeText
          ? `<div class="meta-line"><strong>Genotype:</strong> <code>${escapeSafeHtml(entry.genotypeText)}</code></div>`
          : '',
        entry.carrierLine
          ? `<div class="meta-line"><strong>Disclosures:</strong> ${escapeSafeHtml(entry.carrierLine)}</div>`
          : '',
      ]
        .filter(Boolean)
        .join('');

      return `<article class="showcase-card" data-species="${escapeSafeHtml(a.species.toLowerCase())}" data-sex="${escapeSafeHtml(a.sex.toLowerCase())}" data-search="${escapeSafeHtml(entry.searchBlob)}">
        ${mediaHtml}
        <div class="card-body">
          <div class="card-top">
            <div class="card-titles">
              <div class="eyebrow">${escapeSafeHtml(a.species)}${a.tattoo ? ` &middot; <span class="mono">#${escapeSafeHtml(a.tattoo)}</span>` : ''}</div>
              <h2 class="animal-name">${escapeSafeHtml(a.name)}</h2>
              <div class="breed-line">${escapeSafeHtml(entry.breedVariety || 'Purebred / Barn Stock')}</div>
            </div>
            <div class="price-col">
              <div class="price-tag">${escapeSafeHtml(entry.priceText)}</div>
              ${statusBadge}
            </div>
          </div>
          <div class="badges-row">
            <span class="badge ${sexClass}">${escapeSafeHtml(entry.sexLabel)}</span>
            ${entry.dobText ? `<span class="badge">DOB ${escapeSafeHtml(entry.dobText)}</span>` : ''}
            ${entry.weightText ? `<span class="badge">Wt ${escapeSafeHtml(entry.weightText)}</span>` : ''}
          </div>
          ${withdrawalHtml}
          ${entry.saleNotesText ? `<p class="sale-notes">${escapeSafeHtml(entry.saleNotesText).replace(/\r?\n/g, '<br/>')}</p>` : ''}
          ${disclosuresHtml ? `<div class="extra-meta">${disclosuresHtml}</div>` : ''}
          ${pedigreeHtml}
          ${
            entry.inquiryHref
              ? `<div class="card-actions"><a class="inquire-btn" href="${escapeSafeHtml(entry.inquiryHref)}">Inquire About ${escapeSafeHtml(a.name)}</a></div>`
              : ''
          }
        </div>
      </article>`;
    })
    .join('\n');

  const stockSheetRowsHtml = prepared
    .map((entry) => {
      const a = entry.animal;
      return `<tr class="sheet-row" data-species="${escapeSafeHtml(a.species.toLowerCase())}" data-sex="${escapeSafeHtml(a.sex.toLowerCase())}" data-search="${escapeSafeHtml(entry.searchBlob)}">
        <td><strong>${escapeSafeHtml(a.name)}</strong>${a.tattoo ? `<br/><span class="mono muted">#${escapeSafeHtml(a.tattoo)}</span>` : ''}</td>
        <td>${escapeSafeHtml(a.species)}${entry.breedVariety ? `<br/><span class="muted">${escapeSafeHtml(entry.breedVariety)}</span>` : ''}</td>
        <td>${escapeSafeHtml(entry.sexLabel)}</td>
        <td class="mono">${escapeSafeHtml(entry.dobText || '—')}${entry.weightText ? `<br/><span class="muted">${escapeSafeHtml(entry.weightText)}</span>` : ''}</td>
        <td><span class="muted">S:</span> ${escapeSafeHtml(entry.sireLine)}<br/><span class="muted">D:</span> ${escapeSafeHtml(entry.damLine)}</td>
        <td class="mono">${escapeSafeHtml(entry.coiText)}</td>
        <td class="mono"><strong>${escapeSafeHtml(entry.priceText)}</strong></td>
        <td>${escapeSafeHtml(entry.reservation ? entry.reservation.label : 'Available')}${entry.withdrawal?.isActive ? `<br/><span class="muted">Hold until ${escapeSafeHtml(formatReadableDate(entry.withdrawal.clearDateIso))}</span>` : ''}</td>
      </tr>`;
    })
    .join('\n');

  const contactChips: string[] = [];
  if (breederDisplay) {
    contactChips.push(`<span class="contact-chip"><strong>Breeder:</strong> ${escapeSafeHtml(breederDisplay)}</span>`);
  }
  if (safeLocation) {
    contactChips.push(`<span class="contact-chip"><strong>Location:</strong> ${escapeSafeHtml(safeLocation)}</span>`);
  }
  if (safeEmail) {
    contactChips.push(
      `<a class="contact-chip link" href="mailto:${encodeURIComponent(safeEmail)}">${escapeSafeHtml(safeEmail)}</a>`
    );
  }
  if (safeTel.display) {
    contactChips.push(
      safeTel.href
        ? `<a class="contact-chip link" href="${escapeSafeHtml(safeTel.href)}">${escapeSafeHtml(safeTel.display)}</a>`
        : `<span class="contact-chip">${escapeSafeHtml(safeTel.display)}</span>`
    );
  }
  if (safeWebsite) {
    contactChips.push(
      `<a class="contact-chip link" href="${escapeSafeHtml(safeWebsite)}" target="_blank" rel="noopener noreferrer">${escapeSafeHtml(safeWebsite.replace(/^https?:\/\//i, ''))}</a>`
    );
  }

  const filterBarHtml =
    layoutMode === 'showcase_and_sheet' && prepared.length > 0
      ? `<section class="toolbar no-print" aria-label="Filter available livestock">
          <div class="toolbar-inputs">
            <input id="showcase-search" type="search" placeholder="Search name, breed, variety, sire/dam..." aria-label="Search available livestock" />
            ${
              speciesNames.length > 1
                ? `<select id="showcase-species" aria-label="Filter by species">
                    <option value="">All Species (${prepared.length})</option>
                    ${speciesNames.map((sp) => `<option value="${escapeSafeHtml(sp.toLowerCase())}">${escapeSafeHtml(sp)}</option>`).join('')}
                  </select>`
                : ''
            }
            ${
              sexesPresent.length > 1
                ? `<select id="showcase-sex" aria-label="Filter by sex">
                    <option value="">All Sexes</option>
                    <option value="male">Males / Bucks / Rams</option>
                    <option value="female">Females / Does / Ewes</option>
                  </select>`
                : ''
            }
          </div>
          <div class="toolbar-actions">
            <span id="showcase-count" class="count-label">Showing ${prepared.length} of ${prepared.length}</span>
            <button type="button" class="view-btn active" id="btn-view-cards" aria-pressed="true">Catalog Cards</button>
            <button type="button" class="view-btn" id="btn-view-sheet" aria-pressed="false">Stock Sheet</button>
          </div>
        </section>`
      : '';

  const emptyStateHtml = `<section class="empty-state">
    <h2>No Animals Currently Listed For Sale</h2>
    <p>Mark active animals as <strong>Available For Sale</strong> inside the Animal Editor in Community Pedigree${scopedSpecies ? ` (filter: ${escapeSafeHtml(scopedSpecies)})` : ''}, then re-export this standalone storefront HTML page.</p>
  </section>`;

  const mainContentHtml =
    prepared.length === 0
      ? emptyStateHtml
      : layoutMode === 'stock_sheet_only'
      ? `<section class="sheet-section" aria-label="Buyer Stock Sheet">
          <table class="stock-table">
            <thead>
              <tr>
                <th>Animal / ID</th>
                <th>Species &amp; Variety</th>
                <th>Sex</th>
                <th>DOB / Weight</th>
                <th>Parents (Sire / Dam)</th>
                <th>COI</th>
                <th>Asking Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${stockSheetRowsHtml}</tbody>
          </table>
        </section>`
      : `<section id="showcase-cards-view" class="cards-grid" aria-label="Available Stock Cards">
          ${cardsHtml}
        </section>
        <section id="showcase-sheet-view" class="sheet-section sheet-print-block hidden-screen" aria-label="Printable Buyer Stock Sheet">
          <h2 class="sheet-heading">Compact Buyer Stock Sheet (${prepared.length} Head)</h2>
          <table class="stock-table">
            <thead>
              <tr>
                <th>Animal / ID</th>
                <th>Species &amp; Variety</th>
                <th>Sex</th>
                <th>DOB / Weight</th>
                <th>Parents (Sire / Dam)</th>
                <th>COI</th>
                <th>Asking Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${stockSheetRowsHtml}</tbody>
          </table>
        </section>
        <div id="showcase-no-match" class="empty-state hidden-all">
          <h3>No matching stock found</h3>
          <p>Try clearing the search box or switching species/sex filters.</p>
        </div>`;

  // Static progressive filter script (strictly zero dynamic user strings interpolated into JS)
  const progressiveScriptHtml =
    layoutMode === 'showcase_and_sheet' && prepared.length > 0
      ? `<script>
(function () {
  var searchEl = document.getElementById('showcase-search');
  var speciesEl = document.getElementById('showcase-species');
  var sexEl = document.getElementById('showcase-sex');
  var countEl = document.getElementById('showcase-count');
  var cardsWrap = document.getElementById('showcase-cards-view');
  var sheetWrap = document.getElementById('showcase-sheet-view');
  var emptyWrap = document.getElementById('showcase-no-match');
  var btnCards = document.getElementById('btn-view-cards');
  var btnSheet = document.getElementById('btn-view-sheet');
  if (!cardsWrap || !sheetWrap) return;

  var cards = Array.prototype.slice.call(cardsWrap.querySelectorAll('.showcase-card'));
  var rows = Array.prototype.slice.call(sheetWrap.querySelectorAll('.sheet-row'));
  var total = cards.length;

  function matches(el, q, sp, sx) {
    var elSp = el.getAttribute('data-species') || '';
    var elSx = el.getAttribute('data-sex') || '';
    var elText = el.getAttribute('data-search') || '';
    if (sp && elSp !== sp) return false;
    if (sx && elSx !== sx) return false;
    if (q && elText.indexOf(q) === -1) return false;
    return true;
  }

  function applyFilters() {
    var q = searchEl ? String(searchEl.value || '').trim().toLowerCase() : '';
    var sp = speciesEl ? String(speciesEl.value || '').toLowerCase() : '';
    var sx = sexEl ? String(sexEl.value || '').toLowerCase() : '';
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      var ok = matches(cards[i], q, sp, sx);
      cards[i].style.display = ok ? '' : 'none';
      if (rows[i]) rows[i].style.display = ok ? '' : 'none';
      if (ok) shown++;
    }
    if (countEl) countEl.textContent = 'Showing ' + shown + ' of ' + total;
    if (emptyWrap) {
      if (shown === 0) {
        emptyWrap.classList.remove('hidden-all');
      } else {
        emptyWrap.classList.add('hidden-all');
      }
    }
  }

  function setMode(mode) {
    if (mode === 'sheet') {
      cardsWrap.classList.add('hidden-screen');
      sheetWrap.classList.remove('hidden-screen');
      if (btnCards) { btnCards.classList.remove('active'); btnCards.setAttribute('aria-pressed', 'false'); }
      if (btnSheet) { btnSheet.classList.add('active'); btnSheet.setAttribute('aria-pressed', 'true'); }
    } else {
      cardsWrap.classList.remove('hidden-screen');
      sheetWrap.classList.add('hidden-screen');
      if (btnCards) { btnCards.classList.add('active'); btnCards.setAttribute('aria-pressed', 'true'); }
      if (btnSheet) { btnSheet.classList.remove('active'); btnSheet.setAttribute('aria-pressed', 'false'); }
    }
  }

  if (searchEl) searchEl.addEventListener('input', applyFilters);
  if (speciesEl) speciesEl.addEventListener('change', applyFilters);
  if (sexEl) sexEl.addEventListener('change', applyFilters);
  if (btnCards) btnCards.addEventListener('click', function () { setMode('cards'); });
  if (btnSheet) btnSheet.addEventListener('click', function () { setMode('sheet'); });
})();
</script>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-preserve-accent-ink" content="true" />
<title>${escapeSafeHtml(pageTitle)}</title>
<style>
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; margin: 0; padding: 0; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif; padding: 18px; line-height: 1.45; }
  .shell { max-width: 1120px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; border: 2px solid ${theme.borderHex}; border-radius: 14px; padding: 18px 20px; background: #ffffff; margin-bottom: 16px; }
  .brand-row { display: flex; align-items: center; gap: 14px; min-width: 0; flex: 1; }
  .barn-logo { max-height: 56px; max-width: 140px; object-fit: contain; border-radius: 8px; border: 1px solid ${theme.cellBorderHex}; padding: 3px; background: #ffffff; flex-shrink: 0; }
  .title-block h1 { margin: 0; font-size: 24px; line-height: 1.15; color: ${theme.primaryHex}; }
  .tagline { margin: 4px 0 0 0; font-size: 13.5px; color: ${theme.mutedInkHex}; }
  .stats-line { margin-top: 6px; font-size: 12px; color: ${theme.mutedInkHex}; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .contact-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .contact-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px; border: 1px solid ${theme.cellBorderHex}; font-size: 12px; color: ${theme.inkHex}; text-decoration: none; background: #ffffff; }
  .contact-chip.link { border-color: ${theme.primaryHex}; color: ${theme.primaryHex}; font-weight: 600; }
  .contact-chip.link:hover { opacity: 0.82; }
  .header-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .qr-wrap { border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 4px; text-align: center; background: #ffffff; }
  .qr-svg { display: block; width: 68px; height: 68px; }
  .qr-label { font-size: 9px; font-family: ui-monospace, monospace; text-transform: uppercase; color: ${theme.mutedInkHex}; margin-top: 2px; }
  .toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 16px; padding: 12px 14px; border: 1px solid ${theme.cellBorderHex}; border-radius: 12px; background: #fafaf8; }
  .toolbar-inputs { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; min-width: 240px; }
  .toolbar-inputs input, .toolbar-inputs select { min-height: 38px; padding: 6px 10px; border-radius: 8px; border: 1px solid ${theme.cellBorderHex}; background: #ffffff; color: ${theme.inkHex}; font-size: 13px; }
  .toolbar-inputs input { flex: 1; min-width: 190px; }
  .toolbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .count-label { font-size: 12px; font-family: ui-monospace, monospace; color: ${theme.mutedInkHex}; margin-right: 4px; }
  .view-btn { min-height: 36px; padding: 6px 12px; border-radius: 8px; border: 1px solid ${theme.cellBorderHex}; background: #ffffff; color: ${theme.inkHex}; font-size: 12px; font-weight: 600; cursor: pointer; }
  .view-btn.active { background: ${theme.primaryHex}; color: #ffffff; border-color: ${theme.primaryHex}; }
  .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
  .showcase-card { border: 1.5px solid ${theme.cellBorderHex}; border-radius: 14px; overflow: hidden; background: #ffffff; display: flex; flex-direction: column; break-inside: avoid; }
  .photo-wrap { width: 100%; height: 215px; background: #f4f4f1; border-bottom: 1px solid ${theme.cellBorderHex}; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .animal-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo-wrap.placeholder span { font-size: 46px; font-weight: 700; color: ${theme.primaryHex}; opacity: 0.4; }
  .card-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
  .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
  .card-titles { min-width: 0; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: ${theme.mutedInkHex}; font-weight: 600; }
  .animal-name { margin: 2px 0; font-size: 19px; line-height: 1.2; color: ${theme.primaryHex}; }
  .breed-line { font-size: 12.5px; color: ${theme.mutedInkHex}; }
  .price-col { text-align: right; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .price-tag { font-size: 17px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: ${theme.primaryHex}; white-space: nowrap; }
  .badges-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid ${theme.cellBorderHex}; background: #ffffff; color: ${theme.inkHex}; font-weight: 600; }
  .badge.male { border-color: ${theme.sireHex}; color: ${theme.sireHex}; }
  .badge.female { border-color: ${theme.damHex}; color: ${theme.damHex}; }
  .badge.avail { border-color: ${theme.primaryHex}; color: ${theme.primaryHex}; }
  .badge.hold, .badge.reserved { border-color: ${theme.accentHex}; color: ${theme.accentHex}; }
  .alert-hold { padding: 7px 10px; border-radius: 8px; border: 1px solid ${theme.accentHex}; background: #fff9f5; font-size: 11.5px; color: ${theme.inkHex}; }
  .sale-notes { margin: 0; font-size: 13px; color: ${theme.inkHex}; }
  .extra-meta { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: ${theme.inkHex}; }
  .meta-line code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; background: #f4f4f1; padding: 1px 4px; border-radius: 4px; }
  .pedigree-box { border: 1px solid ${theme.cellBorderHex}; border-radius: 10px; padding: 9px 10px; background: #fafaf8; }
  .ped-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: ${theme.mutedInkHex}; font-weight: 700; margin-bottom: 6px; }
  .ped-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ped-branch { border-left: 3px solid ${theme.cellBorderHex}; padding-left: 7px; font-size: 11.5px; }
  .ped-branch.sire { border-left-color: ${theme.sireHex}; }
  .ped-branch.dam { border-left-color: ${theme.damHex}; }
  .ped-role { font-size: 9.5px; text-transform: uppercase; color: ${theme.mutedInkHex}; font-weight: 700; }
  .ped-name { font-weight: 600; color: ${theme.inkHex}; word-break: break-word; }
  .ped-gp { font-size: 10px; color: ${theme.mutedInkHex}; margin-top: 2px; line-height: 1.3; }
  .card-actions { margin-top: auto; padding-top: 4px; }
  .inquire-btn { display: inline-block; width: 100%; text-align: center; padding: 9px 12px; border-radius: 9px; background: ${theme.primaryHex}; color: #ffffff; text-decoration: none; font-size: 12.5px; font-weight: 600; }
  .inquire-btn:hover { opacity: 0.92; }
  .sheet-section { margin-top: 16px; overflow-x: auto; }
  .sheet-heading { font-size: 16px; color: ${theme.primaryHex}; margin: 0 0 8px 0; }
  .stock-table { width: 100%; border-collapse: collapse; font-size: 12px; background: #ffffff; }
  .stock-table th, .stock-table td { border: 1px solid ${theme.cellBorderHex}; padding: 7px 9px; text-align: left; vertical-align: top; }
  .stock-table th { background: #f4f4f1; color: ${theme.primaryHex}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .muted { color: ${theme.mutedInkHex}; font-size: 11px; }
  .empty-state { border: 1.5px dashed ${theme.cellBorderHex}; border-radius: 14px; padding: 28px 20px; text-align: center; color: ${theme.mutedInkHex}; }
  .empty-state h2, .empty-state h3 { margin: 0 0 8px 0; color: ${theme.primaryHex}; }
  .hidden-screen { display: none; }
  .hidden-all { display: none; }
  .footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid ${theme.cellBorderHex}; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 11px; color: ${theme.mutedInkHex}; }
  @media (max-width: 600px) {
    body { padding: 12px; }
    .cards-grid { grid-template-columns: 1fr; }
    .ped-grid { grid-template-columns: 1fr; }
  }
  @media print {
    body { padding: 0; }
    .no-print, .card-actions { display: none !important; }
    .cards-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .sheet-print-block { display: block !important; page-break-before: always; }
    .header { border-width: 1px; margin-bottom: 10px; }
  }
</style>
</head>
<body>
  <main class="shell">
    <header class="header">
      <div class="brand-row">
        ${safeLogo ? `<img class="barn-logo" src="${safeLogo}" alt="${escapeSafeHtml(barnTitle)} logo" />` : ''}
        <div class="title-block">
          <h1>${escapeSafeHtml(pageTitle)}</h1>
          ${tagline ? `<p class="tagline">${escapeSafeHtml(tagline)}</p>` : ''}
          <div class="stats-line">
            ${prepared.length} animal${prepared.length === 1 ? '' : 's'} listed${speciesNames.length > 0 ? ` &middot; ${escapeSafeHtml(speciesNames.join(', '))}` : ''} &middot; Updated ${escapeSafeHtml(formatReadableDate(todayIso))}
          </div>
          ${contactChips.length > 0 ? `<div class="contact-bar">${contactChips.join('')}</div>` : ''}
        </div>
      </div>
      ${
        qrSvg
          ? `<div class="header-right"><div class="qr-wrap" data-qr-url="${escapeSafeHtml(qrUrl)}">${qrSvg}<div class="qr-label">Barn Info</div></div></div>`
          : ''
      }
    </header>

    ${filterBarHtml}
    ${mainContentHtml}

    <footer class="footer">
      <span><strong>${escapeSafeHtml(barnTitle)}</strong>${breederDisplay ? ` &middot; ${escapeSafeHtml(breederDisplay)}` : ''}</span>
      <span>${anyGenotypeShown ? 'Color genetics/genotype notes are unverified &middot; ' : ''}Zero-server static breeder showcase</span>
    </footer>
  </main>
  ${progressiveScriptHtml}
</body>
</html>`;

  return {
    html,
    filename: buildBreederShowcaseFileName(settings.barnName, scopedSpecies || undefined, todayIso),
    animalCount: prepared.length,
    speciesNames,
    reservedCount,
    activeWithdrawalWarnings,
    hasPhotosEmbedded: embeddedPhotoCount > 0,
  };
}

/**
 * Generates a standalone, zero-server HTML Breeder Showcase & Printable Stock Sheet string.
 */
export function generateBreederShowcaseHtml(
  snapshot: BarnDatabaseSnapshot,
  options: BreederShowcaseOptions = {}
): string {
  return buildBreederShowcaseResult(snapshot, options).html;
}
