/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Human-Readable CSV Export Utility (`src/domain/csvExport.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies
 * and zero external dependencies so it runs 100% offline in browser PWAs and React Native.
 *
 * Features:
 * - Resolves internal `sireId` / `damId` references into human-readable parent names + ear numbers/tattoos
 *   instead of dumping raw UUIDs.
 * - Prepends a UTF-8 BOM (`\uFEFF`) so Excel, Google Sheets, and LibreOffice render special characters cleanly.
 * - Applies RFC-4180 quoting/escaping for commas, quotes, and CR/LF line breaks inside text fields.
 */

import {
  analyzeAnimalCarrierLineage,
  formatClearedProofBadge,
  getAnimalCarrierDisclosures,
} from './carrierGenetics';
import { formatGenotypeArray } from './geneticsEngine';
import { buildSpeciesHerdMap } from './pedigreeCalculator';
import { CSV_UTF8_BOM, escapeCsvCell } from '@engine/codecs/textFormats';
import {
  Animal,
  AnimalPhoto,
  BarnSettings,
  formatCurrencyCents,
  formatSexForSpecies,
  formatWeight,
  isAnimalArchived,
  isSameSpecies,
  normalizeCurrencyCode,
  normalizeOwnershipType,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  todayDateIso,
} from './models';

/** UTF-8 Byte Order Mark so Excel / LibreOffice / Sheets decode UTF-8 characters properly. */
export const UTF8_BOM = CSV_UTF8_BOM;

function slugifyFileSegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

export { escapeCsvCell };

/**
 * Formats an internal parent reference (`sireId` or `damId`) into a readable display string
 * containing the parent's name and tattoo/ear tag instead of a raw UUID.
 */
export function formatParentReferenceForCsv(
  parent: Animal | undefined,
  rawParentId: string
): string {
  if (parent) {
    const name = (parent.name || '').trim();
    const tattoo = (parent.tattoo || '').trim();
    if (name && tattoo) return `${name} (${tattoo})`;
    return name || tattoo || '';
  }
  if ((rawParentId || '').trim()) {
    return 'Unknown / Unlinked';
  }
  return '';
}

/**
 * Builds a clean, dated CSV download filename using the barn/app name
 * (e.g. `pedigree-export-2026-11-16.csv` or `copper-creek-barn-export-2026-11-16.csv`).
 */
export function buildCleanCsvExportFileName(
  barnName: string | undefined,
  filterSpecies?: string,
  dateSlug?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const prefix = isDefault ? 'pedigree' : slugifyFileSegment(trimmed, 'pedigree');
  const stamp = dateSlug || todayDateIso();
  if (filterSpecies && filterSpecies.trim()) {
    const spSlug = slugifyFileSegment(filterSpecies, 'species');
    return `${prefix}-${spSlug}-export-${stamp}.csv`;
  }
  return `${prefix}-export-${stamp}.csv`;
}

/**
 * Generates an RFC-4180 UTF-8 BOM CSV spreadsheet of animal records (optionally filtered to a species),
 * resolving internal `sireId` / `damId` references into human-readable names and tattoos/ear numbers.
 */
export function exportAnimalsCsv(
  animals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  filterSpecies?: string,
  animalPhotos: AnimalPhoto[] = []
): string {
  const animalById = new Map<string, Animal>();
  for (const a of animals) {
    if (a.id) {
      animalById.set(a.id, a);
    }
  }

  const scoped = filterSpecies
    ? animals.filter((a) => isSameSpecies(a.species, filterSpecies))
    : animals;

  const rows = [...scoped].sort((a, b) => {
    const spCmp = (a.species || '').localeCompare(b.species || '');
    if (spCmp !== 0) return spCmp;
    const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
    if (archDiff !== 0) return archDiff;
    const nameCmp = (a.name || '').localeCompare(b.name || '');
    if (nameCmp !== 0) return nameCmp;
    return (a.tattoo || '').localeCompare(b.tattoo || '');
  });

  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  for (const p of animalPhotos) {
    const arr = photosByAnimal.get(p.animalId) || [];
    arr.push(p);
    photosByAnimal.set(p.animalId, arr);
  }

  const headers = [
    'Species',
    'Tattoo_ID',
    'Name',
    'Breed',
    'Variety',
    'Sex',
    'Birth_Date',
    'Status',
    'Archived',
    'Sire',
    'Sire_Tattoo_ID',
    'Dam',
    'Dam_Tattoo_ID',
    'Weight',
    'Weight_Grams',
    'Genotype',
    'Rufus_Intensity',
    'Confirmed_Carrier_Of',
    'Suspected_Carrier_Of',
    'Cleared_Carrier_Of',
    'Lineage_Potential_Carriers',
    'Registration_No',
    'Grand_Champion_No',
    'Show_Legs',
    'Cage_Location',
    'Breeder',
    'Owner',
    'Photo_Count',
    'Primary_Photo_File',
    'Needs_Attention',
    'Notes',
    'Updated_At_UTC',
    'Ownership',
    'Culled',
    'Cull_Date',
    'Cull_Reason',
    'Sold_Date',
    'Sale_Price',
    'Buyer',
    'Deceased_Date',
    'Death_Cause',
  ];

  const herdMapsBySpecies = new Map<string, Map<string, Animal>>();
  const getHerdMap = (speciesName: string): Map<string, Animal> => {
    const key = (speciesName || '').trim().toLowerCase();
    let map = herdMapsBySpecies.get(key);
    if (!map) {
      map = buildSpeciesHerdMap(animals, speciesName);
      herdMapsBySpecies.set(key, map);
    }
    return map;
  };

  const lines = [headers.join(',')];
  for (const a of rows) {
    const sp = resolveSpeciesProfile(a.species, speciesProfiles);
    const aPhotos = photosByAnimal.get(a.id) || [];
    const primaryPhoto = aPhotos.find((p) => p.isPrimary) || aPhotos[0];
    const sire = a.sireId ? animalById.get(a.sireId) : undefined;
    const dam = a.damId ? animalById.get(a.damId) : undefined;

    const carriers = getAnimalCarrierDisclosures(a);
    const lineage = analyzeAnimalCarrierLineage(a, getHerdMap(a.species));
    const clearedText = [
      ...carriers.cleared.map((c) => `${c.trait} (${formatClearedProofBadge(c)})`),
      ...lineage.genotypeCleared.map((g) => `${g.trait} (${g.pair})`),
    ].join('; ');
    const lineageText = lineage.lineagePotential
      .map((l) => `${l.trait} (${l.viaBranches.join('/')})`)
      .join('; ');

    const cells = [
      a.species,
      a.tattoo,
      a.name,
      a.breed,
      a.variety,
      formatSexForSpecies(a.sex, sp),
      a.birthDateIso,
      a.status,
      isAnimalArchived(a) ? 'Yes' : 'No',
      formatParentReferenceForCsv(sire, a.sireId),
      sire?.tattoo || '',
      formatParentReferenceForCsv(dam, a.damId),
      dam?.tattoo || '',
      formatWeight(a.weightGrams, resolveSpeciesWeightUnit(sp, settings)),
      a.weightGrams,
      a.genotypeRaw || formatGenotypeArray(a.genotype),
      a.rufusLevel || '',
      carriers.confirmed.join('; '),
      carriers.suspected.join('; '),
      clearedText,
      lineageText,
      a.registrationNumber,
      a.grandChampionNumber,
      a.legsCount,
      a.cageLocation,
      a.breederName,
      a.ownerName,
      aPhotos.length,
      primaryPhoto?.originalFileName || '',
      a.needsAttention ? 'Yes' : 'No',
      a.notes,
      a.updatedAt,
      normalizeOwnershipType(a.ownershipType, 'Owned'),
      a.culled ? 'Yes' : 'No',
      a.cullDateIso || '',
      a.cullReason || '',
      a.soldDateIso || '',
      a.salePriceCents && a.salePriceCents > 0
        ? formatCurrencyCents(a.salePriceCents, normalizeCurrencyCode(settings.currencyCode))
        : '',
      a.buyerName || '',
      a.deceasedDateIso || '',
      a.deathCause || '',
    ];
    lines.push(cells.map(escapeCsvCell).join(','));
  }

  return `${UTF8_BOM}${lines.join('\r\n')}`;
}
