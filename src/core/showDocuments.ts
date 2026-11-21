/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript ARBA Show Entry Form & Show Remark Card Generators (`src/core/showDocuments.ts`).
 *
 * Generates printable `.HTM` forms and emailable plain-text / `mailto:` summaries directly from
 * `ShowEvent` rosters and structured `ShowAnimalResult` placements.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 */

import { escapeSafeHtml } from './inputSanitization';
import {
  Animal,
  BarnSettings,
  computeDaysBetweenDateIso,
  formatReadableDate,
  formatSexForSpecies,
  nowIsoUtc,
  ShowAnimalResult,
  ShowEvent,
  SpeciesProfile,
} from './models';

export type ShowEntryDivision = 'Open' | 'Youth';
export type RemarkCardLayoutMode = '4up' | '1up';

export interface ShowEntryFormOptions {
  exhibitorName?: string;
  exhibitorBarn?: string;
  exhibitorAddress?: string;
  exhibitorPhone?: string;
  exhibitorEmail?: string;
  exhibitorArbaNumber?: string;
  division?: ShowEntryDivision;
  entryFeePerAnimal?: string;
  furWoolFeePerAnimal?: string;
  defaultEnterFurWool?: boolean;
  coopByAnimalId?: Record<string, string>;
  classOverrideByAnimalId?: Record<string, string>;
  furWoolOverrideByAnimalId?: Record<string, boolean>;
  secretaryEmail?: string;
}

export interface ShowRemarkCardsOptions {
  layoutMode?: RemarkCardLayoutMode;
  division?: ShowEntryDivision;
  exhibitorName?: string;
  coopByAnimalId?: Record<string, string>;
  classOverrideByAnimalId?: Record<string, string>;
  includeExistingJudgeNotes?: boolean;
}

export function buildShowDocumentFileName(show: ShowEvent, kind: 'entry-form' | 'remark-cards'): string {
  const slug = (show.name || show.id || 'show')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const datePart = show.eventDateIso ? `-${show.eventDateIso}` : '';
  return `${kind}-${slug || 'show'}${datePart}.htm`;
}

/**
 * Neutral age-bracket helper based on calendar months at show date (editable via override).
 * Does not hardcode breed-specific weight tables.
 */
export function suggestShowClassLabel(
  animal: Animal,
  showDateIso?: string
): 'Senior' | 'Intermediate' | 'Junior' | 'Pre-Junior' | 'Open / Verify' {
  if (!animal.birthDateIso) {
    return animal.status === 'Junior' ? 'Junior' : 'Open / Verify';
  }
  const refDate =
    showDateIso && /^\d{4}-\d{2}-\d{2}$/.test(showDateIso)
      ? showDateIso
      : nowIsoUtc().slice(0, 10);
  const days = computeDaysBetweenDateIso(animal.birthDateIso, refDate);
  if (days === null || days < 0) {
    return 'Open / Verify';
  }
  const approxMonths = days / 30.4375;
  if (approxMonths >= 8) return 'Senior';
  if (approxMonths >= 6) return 'Intermediate';
  if (approxMonths >= 3) return 'Junior';
  return 'Pre-Junior';
}

export function resolveShowRosterAnimals(show: ShowEvent, speciesAnimals: Animal[]): Animal[] {
  const byId = new Map(speciesAnimals.map((a) => [a.id, a]));
  const ids = new Set<string>(show.enteredAnimalIds ?? []);
  for (const r of show.results ?? []) {
    if (r.animalId) ids.add(r.animalId);
  }
  const list: Animal[] = [];
  for (const id of ids) {
    const animal = byId.get(id);
    if (animal) list.push(animal);
  }
  return list.sort(
    (a, b) =>
      a.breed.localeCompare(b.breed) ||
      a.variety.localeCompare(b.variety) ||
      (a.tattoo || a.name).localeCompare(b.tattoo || b.name)
  );
}

function parseFeeDollars(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

/**
 * Generates a printable official ARBA-style Show Entry Form `.HTM` document from a `ShowEvent`.
 */
export function generateShowEntryFormHtml(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowEntryFormOptions
): string {
  const roster = resolveShowRosterAnimals(show, speciesAnimals);
  const division: ShowEntryDivision = options?.division === 'Youth' ? 'Youth' : 'Open';
  const exhibitorName = (options?.exhibitorName ?? settings.breederName ?? '').trim() || '__________________';
  const exhibitorBarn = (options?.exhibitorBarn ?? settings.barnName ?? '').trim();
  const exhibitorPhone = (options?.exhibitorPhone ?? '').trim();
  const exhibitorEmail = (options?.exhibitorEmail ?? '').trim();
  const exhibitorAddress = (options?.exhibitorAddress ?? '').trim();
  const exhibitorArba = (options?.exhibitorArbaNumber ?? '').trim();
  const defaultFurWool = Boolean(options?.defaultEnterFurWool);
  const baseFeeEach = parseFeeDollars(options?.entryFeePerAnimal);
  const furFeeEach = parseFeeDollars(options?.furWoolFeePerAnimal);

  let furEntriesCount = 0;
  const rowsHtml = roster
    .map((animal, idx) => {
      const coop = (options?.coopByAnimalId?.[animal.id] ?? '').trim() || String(idx + 1);
      const cls = (options?.classOverrideByAnimalId?.[animal.id] ?? '').trim() || suggestShowClassLabel(animal, show.eventDateIso);
      const furChecked =
        options?.furWoolOverrideByAnimalId?.[animal.id] !== undefined
          ? Boolean(options.furWoolOverrideByAnimalId[animal.id])
          : defaultFurWool;
      if (furChecked) furEntriesCount += 1;
      const rowFee = baseFeeEach + (furChecked ? furFeeEach : 0);

      return `<tr>
        <td class="center">${idx + 1}</td>
        <td class="mono">${escapeSafeHtml(coop)}</td>
        <td class="mono strong">${escapeSafeHtml(animal.tattoo || 'UNMARKED')}</td>
        <td>${escapeSafeHtml(animal.breed || speciesProfile.name)}</td>
        <td>${escapeSafeHtml(animal.variety || '—')}</td>
        <td class="center">${escapeSafeHtml(formatSexForSpecies(animal.sex, speciesProfile))}</td>
        <td>${escapeSafeHtml(cls)}</td>
        <td class="mono">${escapeSafeHtml(animal.registrationNumber || '—')}</td>
        <td class="center">${furChecked ? 'YES' : '—'}</td>
        <td class="right mono">${baseFeeEach > 0 || furChecked ? `$${rowFee.toFixed(2)}` : ''}</td>
      </tr>`;
    })
    .join('\n');

  const totalFees = roster.length * baseFeeEach + furEntriesCount * furFeeEach;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="portrait" />
<title>Show Entry Form - ${escapeSafeHtml(show.name)}</title>
<style>
  @page { size: letter portrait; margin: 11mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111827; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 14px; max-width: 8.3in; margin: 0 auto; font-size: 11px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; gap: 12px; }
  .title { font-size: 18px; font-weight: bold; margin: 0; letter-spacing: 0.02em; }
  .subtitle { font-size: 11px; color: #374151; margin-top: 2px; }
  .division-badge { border: 2px solid #111827; padding: 4px 12px; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  .exhibitor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; border: 1px solid #9ca3af; padding: 8px 10px; margin-bottom: 10px; background: #ffffff; }
  .ex-field { line-height: 1.4; }
  .ex-label { font-size: 9.5px; text-transform: uppercase; color: #4b5563; font-weight: bold; }
  table.entries { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  table.entries th, table.entries td { border: 1px solid #6b7280; padding: 4.5px 6px; text-align: left; }
  table.entries th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; color: #111827; }
  .center { text-align: center !important; }
  .right { text-align: right !important; }
  .mono { font-family: "Courier New", monospace; }
  .strong { font-weight: bold; }
  .summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border: 1px solid #9ca3af; padding: 8px 10px; margin-bottom: 14px; }
  .fees-box { text-align: right; min-width: 180px; font-size: 11.5px; }
  .sig-row { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 18px; }
  .sig-line { border-top: 1px solid #111827; padding-top: 4px; font-size: 10px; color: #374151; }
  @media print {
    body { padding: 0; max-width: none; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Official ${escapeSafeHtml(show.sanctioningBody || 'ARBA')} Show Entry Form</h1>
      <div class="subtitle">
        <strong>${escapeSafeHtml(show.name)}</strong> &middot; Date: ${escapeSafeHtml(formatReadableDate(show.eventDateIso))}
        ${show.location ? ` &middot; ${escapeSafeHtml(show.location)}` : ''}
      </div>
      ${show.entryDeadlineIso ? `<div class="subtitle">Entry Deadline: ${escapeSafeHtml(formatReadableDate(show.entryDeadlineIso))}</div>` : ''}
    </div>
    <div class="division-badge">${escapeSafeHtml(division)} Division</div>
  </div>

  <div class="exhibitor-grid">
    <div class="ex-field"><span class="ex-label">Exhibitor Name:</span> ${escapeSafeHtml(exhibitorName)}</div>
    <div class="ex-field"><span class="ex-label">Rabbitry / Barn:</span> ${escapeSafeHtml(exhibitorBarn || '__________________')}</div>
    <div class="ex-field"><span class="ex-label">Address:</span> ${escapeSafeHtml(exhibitorAddress || '___________________________')}</div>
    <div class="ex-field"><span class="ex-label">Phone / Email:</span> ${escapeSafeHtml([exhibitorPhone, exhibitorEmail].filter(Boolean).join(' · ') || '___________________________')}</div>
    <div class="ex-field"><span class="ex-label">Sanction / Reg Member #:</span> ${escapeSafeHtml(exhibitorArba || '______________')}</div>
    <div class="ex-field"><span class="ex-label">Species / Breed Group:</span> ${escapeSafeHtml(speciesProfile.name)}</div>
  </div>

  <table class="entries">
    <thead>
      <tr>
        <th class="center" style="width:28px;">#</th>
        <th style="width:52px;">Coop</th>
        <th style="width:92px;">Ear Tattoo</th>
        <th>Breed</th>
        <th>Variety / Color</th>
        <th class="center" style="width:58px;">Sex</th>
        <th style="width:88px;">Class</th>
        <th style="width:76px;">Reg #</th>
        <th class="center" style="width:54px;">Fur/Wool</th>
        <th class="right" style="width:62px;">Fee</th>
      </tr>
    </thead>
    <tbody>
      ${
        rowsHtml ||
        '<tr><td colspan="10" class="center">No entered animals attached to this show event yet.</td></tr>'
      }
    </tbody>
  </table>

  <div class="summary-row">
    <div style="flex:1;">
      <strong>Exhibitor Declaration:</strong> I agree to abide by all rules of the sponsoring club and
      sanctioning organization (${escapeSafeHtml(show.sanctioningBody || 'ARBA')}). All animals listed above are healthy
      and accurately identified by permanent ear number/tag.
      ${show.notes ? `<div style="margin-top:4px; color:#374151;"><strong>Show Notes:</strong> ${escapeSafeHtml(show.notes)}</div>` : ''}
    </div>
    <div class="fees-box">
      <div>Total Entries: <strong>${roster.length}</strong></div>
      <div>Fur / Wool Entries: <strong>${furEntriesCount}</strong></div>
      <div>Total Entry Fees: <strong>${totalFees > 0 ? `$${totalFees.toFixed(2)}` : '__________'}</strong></div>
    </div>
  </div>

  <div class="sig-row">
    <div class="sig-line">Exhibitor Signature (or Parent/Guardian for Youth)</div>
    <div class="sig-line">Date Signed</div>
  </div>
</body>
</html>`;
}

/**
 * Generates an emailable plain-text Show Entry summary ready for copy/paste or `mailto:` dispatch.
 */
export function buildShowEntryPlainTextSummary(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowEntryFormOptions
): string {
  const roster = resolveShowRosterAnimals(show, speciesAnimals);
  const division: ShowEntryDivision = options?.division === 'Youth' ? 'Youth' : 'Open';
  const exhibitorName = (options?.exhibitorName ?? settings.breederName ?? '').trim() || 'Exhibitor';
  const exhibitorBarn = (options?.exhibitorBarn ?? settings.barnName ?? '').trim();
  const lines: string[] = [
    `${show.sanctioningBody || 'ARBA'} SHOW ENTRY - ${show.name}`,
    `Show Date: ${formatReadableDate(show.eventDateIso)}${show.location ? ` | Location: ${show.location}` : ''}`,
    `Division: ${division}`,
    `Exhibitor: ${exhibitorName}${exhibitorBarn ? ` (${exhibitorBarn})` : ''}`,
    options?.exhibitorArbaNumber ? `Member #: ${options.exhibitorArbaNumber}` : '',
    options?.exhibitorPhone || options?.exhibitorEmail
      ? `Contact: ${[options.exhibitorPhone, options.exhibitorEmail].filter(Boolean).join(' | ')}`
      : '',
    '',
    `ENTRIES (${roster.length}):`,
  ].filter((l) => l !== '');

  const baseFeeEach = parseFeeDollars(options?.entryFeePerAnimal);
  const furFeeEach = parseFeeDollars(options?.furWoolFeePerAnimal);
  const defaultFurWool = Boolean(options?.defaultEnterFurWool);
  let furCount = 0;

  roster.forEach((animal, idx) => {
    const coop = (options?.coopByAnimalId?.[animal.id] ?? '').trim();
    const cls =
      (options?.classOverrideByAnimalId?.[animal.id] ?? '').trim() ||
      suggestShowClassLabel(animal, show.eventDateIso);
    const furChecked =
      options?.furWoolOverrideByAnimalId?.[animal.id] !== undefined
        ? Boolean(options.furWoolOverrideByAnimalId[animal.id])
        : defaultFurWool;
    if (furChecked) furCount += 1;
    lines.push(
      `${idx + 1}. Tattoo: ${animal.tattoo || 'UNMARKED'} | ${animal.breed || speciesProfile.name} | ${animal.variety || 'Variety Unset'} | ${formatSexForSpecies(animal.sex, speciesProfile)} | ${cls}${furChecked ? ' | +Fur/Wool' : ''}${coop ? ` | Coop: ${coop}` : ''}${animal.registrationNumber ? ` | Reg: ${animal.registrationNumber}` : ''}`
    );
  });

  if (baseFeeEach > 0 || furCount > 0) {
    const totalFees = roster.length * baseFeeEach + furCount * furFeeEach;
    lines.push('');
    lines.push(`Total Animals: ${roster.length} | Fur/Wool: ${furCount} | Est. Fees: $${totalFees.toFixed(2)}`);
  }

  return lines.join('\n');
}

export function buildShowEntryMailtoUrl(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowEntryFormOptions
): string {
  const to = encodeURIComponent((options?.secretaryEmail || '').trim());
  const subject = encodeURIComponent(
    `Show Entry: ${show.name} (${show.eventDateIso || 'Upcoming'}) - ${
      (options?.exhibitorName ?? settings.breederName ?? settings.barnName ?? 'Exhibitor').trim()
    }`
  );
  const body = encodeURIComponent(
    buildShowEntryPlainTextSummary(show, speciesAnimals, speciesProfile, settings, options)
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/**
 * Generates printable ARBA-style Show Remark Card labels directly from a `ShowEvent`.
 * Supports 4-up US Letter sheets (`4up`) or individual `4"x6"` index/thermal cards (`1up`).
 */
export function generateShowRemarkCardsHtml(
  show: ShowEvent,
  speciesAnimals: Animal[],
  speciesProfile: SpeciesProfile,
  settings: BarnSettings,
  options?: ShowRemarkCardsOptions
): string {
  const roster = resolveShowRosterAnimals(show, speciesAnimals);
  const layoutMode: RemarkCardLayoutMode = options?.layoutMode === '1up' ? '1up' : '4up';
  const division: ShowEntryDivision = options?.division === 'Youth' ? 'Youth' : 'Open';
  const exhibitorName = (options?.exhibitorName ?? settings.breederName ?? settings.barnName ?? '').trim();
  const includeExisting = options?.includeExistingJudgeNotes ?? true;
  const resultsByAnimalId = new Map<string, ShowAnimalResult>();
  for (const r of show.results ?? []) {
    if (r.animalId) resultsByAnimalId.set(r.animalId, r);
  }

  const cards = roster.map((animal, idx) => {
    const coop = (options?.coopByAnimalId?.[animal.id] ?? '').trim() || String(idx + 1);
    const cls =
      (options?.classOverrideByAnimalId?.[animal.id] ?? '').trim() ||
      suggestShowClassLabel(animal, show.eventDateIso);
    const result = includeExisting ? resultsByAnimalId.get(animal.id) : undefined;
    const awardBadges = result
      ? [
          result.classPlacement ? result.classPlacement : '',
          ...result.awards,
          result.legsEarned > 0 ? `${result.legsEarned} Leg(s)` : '',
        ].filter(Boolean)
      : [];

    return `<div class="remark-card">
      <div class="rc-top">
        <div>
          <div class="rc-show">${escapeSafeHtml(show.name)} &middot; ${escapeSafeHtml(formatReadableDate(show.eventDateIso))}</div>
          <div class="rc-sub">${escapeSafeHtml(show.sanctioningBody || 'ARBA')} &middot; ${escapeSafeHtml(division)} Division${exhibitorName ? ` &middot; ${escapeSafeHtml(exhibitorName)}` : ''}</div>
        </div>
        <div class="rc-coop">Coop ${escapeSafeHtml(coop)}</div>
      </div>

      <div class="rc-animal-grid">
        <div><span class="lbl">Ear #</span> <strong class="mono">${escapeSafeHtml(animal.tattoo || 'UNMARKED')}</strong></div>
        <div><span class="lbl">Sex</span> <strong>${escapeSafeHtml(formatSexForSpecies(animal.sex, speciesProfile))}</strong></div>
        <div><span class="lbl">Breed</span> <strong>${escapeSafeHtml(animal.breed || speciesProfile.name)}</strong></div>
        <div><span class="lbl">Variety</span> <strong>${escapeSafeHtml(animal.variety || '—')}</strong></div>
        <div><span class="lbl">Class</span> <strong>${escapeSafeHtml(cls)}</strong></div>
        <div><span class="lbl">Name</span> <strong>${escapeSafeHtml(animal.name || '—')}</strong></div>
      </div>

      <div class="rc-rubric">
        <div>&#9744; Type / Balance</div>
        <div>&#9744; Head / Ears / Crown</div>
        <div>&#9744; Fur / Wool Quality</div>
        <div>&#9744; Color / Markings</div>
        <div>&#9744; Bone / Feet / Hocks</div>
        <div>&#9744; Condition / Flesh</div>
      </div>

      <div class="rc-remarks">
        <div class="lbl">Judge Remarks &amp; Placings</div>
        ${
          result?.judgeNotes
            ? `<div class="judge-notes">${escapeSafeHtml(result.judgeNotes)}</div>`
            : '<div class="write-lines"><div></div><div></div><div></div></div>'
        }
      </div>

      <div class="rc-footer">
        <div><strong>Placed:</strong> ${escapeSafeHtml(awardBadges.join(' · ') || '________')}</div>
        <div><strong>Judge:</strong> ${escapeSafeHtml(result?.judgeName || '________________')}</div>
      </div>
    </div>`;
  });

  const pagesHtml =
    layoutMode === '1up'
      ? cards.map((card) => `<div class="page single-page">${card}</div>`).join('\n')
      : (() => {
          const chunks: string[] = [];
          for (let i = 0; i < cards.length; i += 4) {
            chunks.push(`<div class="page grid-4up">${cards.slice(i, i + 4).join('\n')}</div>`);
          }
          return chunks.join('\n');
        })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="barn-page-orientation" content="landscape" />
<title>Show Remark Cards - ${escapeSafeHtml(show.name)}</title>
<style>
  @page { size: ${layoutMode === '1up' ? '6in 4in' : 'letter landscape'}; margin: ${layoutMode === '1up' ? '4mm' : '8mm'}; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #111827; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; padding: ${layoutMode === '1up' ? '4px' : '10px'}; }
  .page { page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .grid-4up { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .single-page { max-width: 5.8in; margin: 0 auto; }
  .remark-card { border: 2px solid #111827; border-radius: 6px; padding: 10px 12px; background: #ffffff; box-sizing: border-box; min-height: 3.35in; display: flex; flex-direction: column; justify-content: space-between; break-inside: avoid; }
  .rc-top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid #111827; padding-bottom: 5px; margin-bottom: 6px; gap: 8px; }
  .rc-show { font-size: 11px; font-weight: bold; }
  .rc-sub { font-size: 9.5px; color: #4b5563; }
  .rc-coop { border: 1.5px solid #111827; padding: 2px 7px; font-size: 11px; font-weight: bold; white-space: nowrap; }
  .rc-animal-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 8px; font-size: 10.5px; margin-bottom: 6px; border-bottom: 1px solid #d1d5db; padding-bottom: 5px; }
  .lbl { font-size: 8.5px; text-transform: uppercase; color: #4b5563; display: block; }
  .mono { font-family: "Courier New", monospace; }
  .rc-rubric { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px 6px; font-size: 9.5px; margin-bottom: 6px; }
  .rc-remarks { flex: 1; display: flex; flex-direction: column; margin-bottom: 6px; }
  .judge-notes { font-size: 10.5px; line-height: 1.35; border: 1px solid #d1d5db; padding: 5px 6px; border-radius: 4px; min-height: 46px; }
  .write-lines div { border-bottom: 1px solid #9ca3af; height: 18px; }
  .rc-footer { display: flex; justify-content: space-between; font-size: 10px; border-top: 1px solid #111827; padding-top: 5px; gap: 8px; }
  @media print {
    body { padding: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  ${pagesHtml || '<p>No entered animals attached to this show event yet.</p>'}
</body>
</html>`;
}
