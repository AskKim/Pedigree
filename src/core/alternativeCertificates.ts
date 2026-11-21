/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Alternative Certificate Generators (`src/core/alternativeCertificates.ts`).
 *
 * Produces printable self-contained `.HTM` documents for:
 * 1. Pet-Sale Birth Certificate — strictly omits breeder contact info, pricing, stud terms,
 *    and breeder certification/contact footers so pet homes get a warm keepsake birth record.
 * 2. Breeding / Service Certificate — documents Sire, Dam, service dates, projected due date,
 *    litter outcomes (if born), service fee info, COI, and owner certification signatures.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 */

import { escapeSafeHtml, sanitizeSafeRasterImageDataUrl } from './inputSanitization';
import {
  Animal,
  BarnSettings,
  BreedingRecord,
  formatBreedingStatusForSpecies,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  normalizeCurrencyCode,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
} from './models';
import { PedigreeColorPresetId, resolvePedigreePrintTheme } from './pedigreePrintStyles';

export interface PetBirthCertificateOptions {
  /** Optional companion family / adopter name printed on the certificate. */
  companionFamilyName?: string;
  /** Optional keepsake message (falls back to a gentle companion blessing). */
  keepsakeMessage?: string;
  /** Optional photo data URL for the animal's portrait. */
  primaryPhotoDataUrl?: string;
  /** Color theme preset (all backgrounds remain crisp #FFFFFF). */
  colorPreset?: PedigreeColorPresetId;
}

export function buildPetBirthCertificateFileName(animal: Animal): string {
  const slug = (animal.name || animal.tattoo || animal.id || 'pet')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `birth-certificate-${slug || 'pet'}.htm`;
}

/**
 * Generates a pet-sale Birth Certificate `.HTM` document.
 * Intentionally omits all breeder contact info, phone/email/website footers, and commercial pricing.
 */
export function generatePetBirthCertificateHtml(
  animal: Animal,
  allAnimals: Animal[],
  speciesProfiles: SpeciesProfile[],
  settings: BarnSettings,
  options?: PetBirthCertificateOptions
): string {
  const sp = resolveSpeciesProfile(animal.species, speciesProfiles);
  const theme = resolvePedigreePrintTheme(
    { colorPreset: options?.colorPreset ?? 'classic_sage' },
    settings.customColors
  );
  const safePhoto = sanitizeSafeRasterImageDataUrl(options?.primaryPhotoDataUrl);
  const sire = animal.sireId
    ? allAnimals.find((a) => a.id === animal.sireId && a.species.toLowerCase() === animal.species.toLowerCase())
    : undefined;
  const dam = animal.damId
    ? allAnimals.find((a) => a.id === animal.damId && a.species.toLowerCase() === animal.species.toLowerCase())
    : undefined;

  const companionHome = (options?.companionFamilyName || animal.buyerName || '').trim();
  const keepsakeMessage = (
    options?.keepsakeMessage ||
    `Presented as a keepsake companion birth record for ${animal.name || 'your new companion'}. May you share many happy, healthy years together.`
  ).trim();
  const sexDisplay = formatSexForSpecies(animal.sex, sp);
  const effectiveWeightUnit = resolveSpeciesWeightUnit(sp, settings);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="landscape" />
<title>Birth Certificate - ${escapeSafeHtml(animal.name)}</title>
<style>
  @page { size: letter landscape; margin: 12mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; margin: 0; padding: 0; }
  body { font-family: Georgia, "Times New Roman", serif; padding: 18px; max-width: 10.2in; margin: 0 auto; }
  .cert-outer { border: 4px double ${theme.borderHex}; border-radius: 12px; padding: 22px 28px; background: #ffffff; box-sizing: border-box; }
  .cert-inner { border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 22px 26px; background: #ffffff; }
  .banner { text-align: center; border-bottom: 1.5px solid ${theme.borderHex}; padding-bottom: 14px; margin-bottom: 18px; }
  .eyebrow { font-family: Arial, Helvetica, sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: ${theme.accentHex}; margin-bottom: 6px; font-weight: bold; }
  .title { font-size: 30px; font-weight: bold; color: ${theme.primaryHex}; margin: 0; letter-spacing: 0.03em; }
  .subtitle { font-size: 13px; color: ${theme.mutedInkHex}; margin-top: 4px; font-style: italic; }
  .hero { display: flex; align-items: center; gap: 22px; margin-bottom: 18px; flex-wrap: wrap; }
  .portrait { width: 132px; height: 132px; object-fit: cover; border-radius: 14px; border: 2px solid ${theme.borderHex}; flex-shrink: 0; }
  .pet-focus { flex: 1; min-width: 240px; }
  .pet-name { font-size: 28px; font-weight: bold; color: ${theme.primaryHex}; margin: 0 0 6px 0; }
  .pet-tagline { font-size: 14px; color: ${theme.inkHex}; line-height: 1.45; }
  .details-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 16px; border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; background: #ffffff; }
  .field-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: ${theme.mutedInkHex}; margin-bottom: 2px; }
  .field-value { font-size: 13.5px; font-weight: bold; color: ${theme.inkHex}; }
  .parents-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  .parent-box { border: 1px solid ${theme.cellBorderHex}; border-radius: 8px; padding: 10px 14px; }
  .parent-box.sire { border-left: 4px solid ${theme.sireHex}; }
  .parent-box.dam { border-left: 4px solid ${theme.damHex}; }
  .keepsake { text-align: center; font-style: italic; font-size: 13px; line-height: 1.55; color: ${theme.mutedInkHex}; border-top: 1px solid ${theme.cellBorderHex}; padding-top: 14px; margin-top: 6px; }
  .companion-line { text-align: center; font-size: 13.5px; color: ${theme.primaryHex}; font-weight: bold; margin-bottom: 10px; }
  .issued-note { text-align: center; font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: ${theme.mutedInkHex}; margin-top: 12px; }
  @media print {
    body { padding: 0; max-width: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <div class="cert-outer">
    <div class="cert-inner">
      <div class="banner">
        <div class="eyebrow">Companion Livestock Keepsake</div>
        <h1 class="title">Certificate of Birth</h1>
        <div class="subtitle">Official Companion ${escapeSafeHtml(sp.name)} Birth Record</div>
      </div>

      <div class="hero">
        ${safePhoto ? `<img class="portrait" src="${safePhoto}" alt="${escapeSafeHtml(animal.name)}" />` : ''}
        <div class="pet-focus">
          <h2 class="pet-name">${escapeSafeHtml(animal.name || 'Unnamed Companion')}</h2>
          <div class="pet-tagline">
            This certifies the birth of <strong>${escapeSafeHtml(animal.name || 'this companion')}</strong>, a
            <strong>${escapeSafeHtml(animal.variety ? `${animal.variety} ` : '')}${escapeSafeHtml(animal.breed || sp.name)}</strong>
            (${escapeSafeHtml(sexDisplay)}), born on
            <strong>${escapeSafeHtml(formatReadableDate(animal.birthDateIso))}</strong>.
          </div>
        </div>
      </div>

      <div class="details-grid">
        <div>
          <div class="field-label">Birth Date</div>
          <div class="field-value">${escapeSafeHtml(formatReadableDate(animal.birthDateIso))}</div>
        </div>
        <div>
          <div class="field-label">Breed &amp; Coat Variety</div>
          <div class="field-value">${escapeSafeHtml([animal.breed, animal.variety].filter(Boolean).join(' · ') || sp.name)}</div>
        </div>
        <div>
          <div class="field-label">Sex</div>
          <div class="field-value">${escapeSafeHtml(sexDisplay)}</div>
        </div>
        <div>
          <div class="field-label">Identification / Ear ID</div>
          <div class="field-value">${escapeSafeHtml(animal.tattoo || 'Companion Pet (Unmarked)')}</div>
        </div>
        <div>
          <div class="field-label">Species</div>
          <div class="field-value">${escapeSafeHtml(sp.name)}</div>
        </div>
        <div>
          <div class="field-label">Recorded Weight</div>
          <div class="field-value">${animal.weightGrams > 0 ? escapeSafeHtml(formatWeight(animal.weightGrams, effectiveWeightUnit)) : 'Not Recorded'}</div>
        </div>
      </div>

      <div class="parents-row">
        <div class="parent-box sire">
          <div class="field-label">Father (${escapeSafeHtml(sp.maleLabel)})</div>
          <div class="field-value">${escapeSafeHtml(sire ? `${sire.name}${sire.variety ? ` (${sire.variety})` : ''}` : 'Not Listed')}</div>
        </div>
        <div class="parent-box dam">
          <div class="field-label">Mother (${escapeSafeHtml(sp.femaleLabel)})</div>
          <div class="field-value">${escapeSafeHtml(dam ? `${dam.name}${dam.variety ? ` (${dam.variety})` : ''}` : 'Not Listed')}</div>
        </div>
      </div>

      ${
        companionHome
          ? `<div class="companion-line">Welcomed Home By: ${escapeSafeHtml(companionHome)}</div>`
          : ''
      }

      <div class="keepsake">${escapeSafeHtml(keepsakeMessage)}</div>
      <div class="issued-note">Companion Birth Record Issued ${escapeSafeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}</div>
    </div>
  </div>
</body>
</html>`;
}

export interface BreedingCertificateOptions {
  breederContactLine?: string;
  showBreederLogo?: boolean;
  breederLogoDataUrl?: string;
  studOwnerName?: string;
  damOwnerName?: string;
  serviceNotes?: string;
  colorPreset?: PedigreeColorPresetId;
}

export function buildBreedingCertificateFileName(breeding: BreedingRecord): string {
  const slug = `${breeding.sireName || 'sire'}-x-${breeding.damName || 'dam'}-${breeding.bredDateIso || 'service'}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `breeding-certificate-${slug || breeding.id}.htm`;
}

/**
 * Generates an official printable `.HTM` Breeding / Service Certificate directly from a `BreedingRecord`.
 */
export function generateBreedingCertificateHtml(
  breeding: BreedingRecord,
  sire: Animal | undefined,
  dam: Animal | undefined,
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: BreedingCertificateOptions
): string {
  const theme = resolvePedigreePrintTheme(
    { colorPreset: options?.colorPreset ?? 'classic_sage' },
    settings.customColors
  );
  const showLogo = options?.showBreederLogo ?? true;
  const rawLogo =
    options?.breederLogoDataUrl !== undefined
      ? options.breederLogoDataUrl
      : settings.breederLogoDataUrl;
  const safeLogo = showLogo ? sanitizeSafeRasterImageDataUrl(rawLogo) : '';
  const contactLine = (options?.breederContactLine || '').trim();
  const studOwner = (options?.studOwnerName || sire?.ownerName || settings.breederName || settings.barnName || '').trim();
  const damOwner = (options?.damOwnerName || dam?.ownerName || settings.breederName || settings.barnName || '').trim();
  const statusDisplay = formatBreedingStatusForSpecies(breeding.status, speciesProfile);
  const currency = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const serviceFeeDisplay =
    breeding.serviceFeeCents && breeding.serviceFeeCents > 0
      ? `${formatCurrencyCents(breeding.serviceFeeCents, currency)}${
          breeding.serviceFeeDirection === 'earned'
            ? ' (Stud Fee Received)'
            : breeding.serviceFeeDirection === 'paid'
            ? ' (Stud Fee Paid)'
            : ''
        }`
      : 'None / In-Barn Pairing';
  const notesDisplay = (options?.serviceNotes ?? breeding.notes ?? '').trim();

  const renderAnimalCard = (
    roleTitle: string,
    roleClass: 'sire' | 'dam',
    animal: Animal | undefined,
    fallbackName: string,
    ownerLabel: string
  ): string => `<div class="animal-card ${roleClass}">
    <div class="card-role">${escapeSafeHtml(roleTitle)}</div>
    <div class="card-name">${escapeSafeHtml(animal?.name || fallbackName || 'Unknown')}</div>
    <div class="card-meta"><strong>Tattoo / ID:</strong> ${escapeSafeHtml(animal?.tattoo || 'Unmarked')}</div>
    <div class="card-meta"><strong>Breed &amp; Variety:</strong> ${escapeSafeHtml([animal?.breed, animal?.variety].filter(Boolean).join(' · ') || '—')}</div>
    <div class="card-meta"><strong>Reg # / GC #:</strong> ${escapeSafeHtml([animal?.registrationNumber ? `Reg ${animal.registrationNumber}` : '', animal?.grandChampionNumber ? `GC ${animal.grandChampionNumber}` : ''].filter(Boolean).join(' · ') || 'Unregistered')}</div>
    <div class="card-meta"><strong>Breeder:</strong> ${escapeSafeHtml(animal?.breederName || '—')}</div>
    <div class="card-meta"><strong>Owner:</strong> ${escapeSafeHtml(ownerLabel || animal?.ownerName || '—')}</div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="portrait" />
<title>Breeding Certificate - ${escapeSafeHtml(breeding.sireName)} x ${escapeSafeHtml(breeding.damName)}</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: ${theme.inkHex}; margin: 0; padding: 0; }
  body { font-family: Georgia, "Times New Roman", serif; padding: 16px; max-width: 8.2in; margin: 0 auto; }
  .frame { border: 3px double ${theme.borderHex}; padding: 20px 24px; background: #ffffff; }
  .header { display: flex; justify-content: space-between; align-items: center; gap: 14px; border-bottom: 2px solid ${theme.borderHex}; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .logo { max-height: 48px; max-width: 120px; object-fit: contain; border-radius: 4px; }
  .title { font-size: 22px; font-weight: bold; color: ${theme.primaryHex}; margin: 0; }
  .subtitle { font-size: 12px; color: ${theme.mutedInkHex}; margin-top: 2px; }
  .animals-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
  .animal-card { border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 12px 14px; background: #ffffff; }
  .animal-card.sire { border-left: 4px solid ${theme.sireHex}; }
  .animal-card.dam { border-left: 4px solid ${theme.damHex}; }
  .card-role { font-family: Arial, Helvetica, sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: ${theme.mutedInkHex}; margin-bottom: 4px; }
  .card-name { font-size: 17px; font-weight: bold; color: ${theme.primaryHex}; margin-bottom: 6px; }
  .card-meta { font-size: 12px; line-height: 1.45; color: ${theme.inkHex}; }
  .facts-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 12px 14px; margin-bottom: 16px; }
  .fact-label { font-family: Arial, Helvetica, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: ${theme.mutedInkHex}; margin-bottom: 2px; }
  .fact-val { font-size: 13px; font-weight: bold; color: ${theme.inkHex}; }
  .notes-box { border: 1px solid ${theme.cellBorderHex}; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; font-size: 12px; line-height: 1.45; }
  .cert-clause { font-size: 12px; line-height: 1.5; color: ${theme.inkHex}; margin-bottom: 20px; }
  .sigs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 22px; }
  .sig-block { border-top: 1px solid ${theme.inkHex}; padding-top: 6px; font-size: 11px; color: ${theme.mutedInkHex}; }
  .footer-meta { margin-top: 16px; border-top: 1px solid ${theme.cellBorderHex}; padding-top: 8px; display: flex; justify-content: space-between; font-size: 10.5px; color: ${theme.mutedInkHex}; flex-wrap: wrap; gap: 8px; }
  @media print {
    body { padding: 0; max-width: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <div class="frame">
    <div class="header">
      <div class="brand">
        ${safeLogo ? `<img class="logo" src="${safeLogo}" alt="${escapeSafeHtml(settings.barnName || 'Barn Logo')}" />` : ''}
        <div>
          <h1 class="title">Official Breeding Certificate</h1>
          <div class="subtitle">${escapeSafeHtml(settings.barnName || 'Community Pedigree')} &middot; ${escapeSafeHtml(speciesProfile.name)} Service Record</div>
        </div>
      </div>
      <div class="subtitle">Record ID: ${escapeSafeHtml(breeding.id.slice(0, 12))}</div>
    </div>

    <div class="animals-grid">
      ${renderAnimalCard(
        `Sire (${speciesProfile.maleLabel})`,
        'sire',
        sire,
        breeding.sireName,
        studOwner
      )}
      ${renderAnimalCard(
        `Dam (${speciesProfile.femaleLabel})`,
        'dam',
        dam,
        breeding.damName,
        damOwner
      )}
    </div>

    <div class="facts-grid">
      <div>
        <div class="fact-label">Service / Bred Date</div>
        <div class="fact-val">${escapeSafeHtml(formatReadableDate(breeding.bredDateIso))}</div>
      </div>
      <div>
        <div class="fact-label">Expected Due Date</div>
        <div class="fact-val">${escapeSafeHtml(formatReadableDate(breeding.expectedDueDateIso))}</div>
      </div>
      <div>
        <div class="fact-label">Actual ${escapeSafeHtml(speciesProfile.birthEventLabel)} Date</div>
        <div class="fact-val">${breeding.actualBirthDateIso ? escapeSafeHtml(formatReadableDate(breeding.actualBirthDateIso)) : 'Pending / Not Recorded'}</div>
      </div>
      <div>
        <div class="fact-label">Breeding Status</div>
        <div class="fact-val">${escapeSafeHtml(statusDisplay)}</div>
      </div>
      <div>
        <div class="fact-label">Projected Pairing COI</div>
        <div class="fact-val">${(breeding.projectedCoiPercent || 0).toFixed(2)}%</div>
      </div>
      <div>
        <div class="fact-label">Stud / Service Fee</div>
        <div class="fact-val">${escapeSafeHtml(serviceFeeDisplay)}</div>
      </div>
      <div>
        <div class="fact-label">Offspring Outcome</div>
        <div class="fact-val">${
          breeding.actualBirthDateIso || breeding.liveCount > 0 || breeding.stillbornCount > 0
            ? `${breeding.liveCount} Live · ${breeding.stillbornCount} Stillborn · ${breeding.weanedCount} Weaned`
            : 'Awaiting Litter Outcome'
        }</div>
      </div>
      <div>
        <div class="fact-label">Gestation Window</div>
        <div class="fact-val">${speciesProfile.gestationDays} days</div>
      </div>
      <div>
        <div class="fact-label">Wean Target</div>
        <div class="fact-val">${speciesProfile.weanDaysAfterBirth} days post-${escapeSafeHtml(speciesProfile.birthEventLabel.toLowerCase())}</div>
      </div>
    </div>

    ${
      notesDisplay
        ? `<div class="notes-box"><strong>Service &amp; Pairing Notes:</strong> ${escapeSafeHtml(notesDisplay)}</div>`
        : ''
    }

    <div class="cert-clause">
      I hereby certify that the ${escapeSafeHtml(speciesProfile.femaleLabel.toLowerCase())} identified above was bred to the
      ${escapeSafeHtml(speciesProfile.maleLabel.toLowerCase())} listed above on
      <strong>${escapeSafeHtml(formatReadableDate(breeding.bredDateIso))}</strong>, and that the registration, tattoo, and parentage details recorded on this certificate are accurate to the best of my knowledge.
    </div>

    <div class="sigs">
      <div class="sig-block">
        ${escapeSafeHtml(speciesProfile.maleLabel)} / Stud Owner Signature (${escapeSafeHtml(studOwner || 'Authorized Breeder')}) &nbsp;&nbsp; Date: _____________
      </div>
      <div class="sig-block">
        ${escapeSafeHtml(speciesProfile.femaleLabel)} Owner / Witness Signature (${escapeSafeHtml(damOwner || 'Owner')}) &nbsp;&nbsp; Date: _____________
      </div>
    </div>

    <div class="footer-meta">
      <div>${contactLine ? escapeSafeHtml(contactLine) : escapeSafeHtml(settings.barnName || 'Community Pedigree')}</div>
      <div>Issued ${escapeSafeHtml(formatReadableDate(nowIsoUtc().slice(0, 10)))}</div>
    </div>
  </div>
</body>
</html>`;
}
