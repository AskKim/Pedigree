/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Barn & Livestock Mileage & Tax Report Engine (`src/domain/mileageTaxLog.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 * Stores deductions in integer cents and exports IRS-ready CSV and printable HTML reports.
 */

import { escapeCsvCell, UTF8_BOM } from './csvExport';
import { escapeSafeHtml, sanitizeSingleLineText } from './inputSanitization';
import {
  ClientContact,
  DEFAULT_IRS_MILEAGE_RATE_CENTS,
  formatCurrencyCents,
  formatReadableDate,
  generateUuid,
  MILEAGE_TRIP_PURPOSES,
  MileageLog,
  MileageTripPurpose,
  normalizeMileageTripPurpose,
  nowIsoUtc,
  ShowEvent,
  todayDateIso,
} from './models';

export const MILEAGE_RATE_PRESETS: ReadonlyArray<{
  label: string;
  rateCentsPerMile: number;
  note: string;
}> = [
  { label: '2025/2026 IRS Business ($0.70/mi)', rateCentsPerMile: 70, note: 'Standard Schedule F / C business travel' },
  { label: '2024 IRS Business ($0.67/mi)', rateCentsPerMile: 67, note: 'Prior tax year business rate' },
  { label: 'Medical / Moving ($0.21/mi)', rateCentsPerMile: 21, note: 'Reduced statutory rate' },
  { label: '4-H / Charitable Volunteer ($0.14/mi)', rateCentsPerMile: 14, note: 'Charitable organization travel' },
];

export interface MileageDeductionBreakdown {
  miles: number;
  rateCentsPerMile: number;
  mileageAllowanceCents: number;
  parkingAndTollsCents: number;
  totalTripValueCents: number;
  deductibleCents: number;
}

export interface MileagePurposeBreakdown {
  purpose: MileageTripPurpose;
  tripCount: number;
  totalMiles: number;
  deductibleMiles: number;
  deductibleCents: number;
}

export interface MileageMonthBreakdown {
  monthKey: string;
  tripCount: number;
  totalMiles: number;
  deductibleCents: number;
}

export interface AnnualMileageTaxSummary {
  yearLabel: string;
  totalTrips: number;
  deductibleTrips: number;
  totalMiles: number;
  deductibleMiles: number;
  nonDeductibleMiles: number;
  mileageDeductionCents: number;
  parkingAndTollsCents: number;
  totalDeductibleCents: number;
  byPurpose: MileagePurposeBreakdown[];
  byMonth: MileageMonthBreakdown[];
}

export function normalizeMileageLog(raw: unknown): MileageLog | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 120) : '';
  const species =
    typeof obj.species === 'string' && obj.species.trim() ? obj.species.trim().slice(0, 80) : 'Rabbit';
  if (!id) return null;

  const dateIso =
    typeof obj.dateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateIso.trim())
      ? obj.dateIso.trim()
      : todayDateIso();

  const rawMiles = Number(obj.miles);
  const miles = Number.isFinite(rawMiles) && rawMiles >= 0 ? Number(rawMiles.toFixed(1)) : 0;

  const rawRate = Number(obj.rateCentsPerMile);
  const rateCentsPerMile =
    Number.isFinite(rawRate) && rawRate >= 0
      ? Math.round(rawRate)
      : DEFAULT_IRS_MILEAGE_RATE_CENTS;

  const rawTolls = Number(obj.parkingAndTollsCents);
  const parkingAndTollsCents =
    Number.isFinite(rawTolls) && rawTolls > 0 ? Math.round(rawTolls) : 0;

  const odoStartRaw = Number(obj.odometerStart);
  const odoEndRaw = Number(obj.odometerEnd);
  const odometerStart =
    obj.odometerStart !== undefined &&
    obj.odometerStart !== null &&
    obj.odometerStart !== '' &&
    Number.isFinite(odoStartRaw) &&
    odoStartRaw >= 0
      ? Number(odoStartRaw.toFixed(1))
      : undefined;
  const odometerEnd =
    obj.odometerEnd !== undefined &&
    obj.odometerEnd !== null &&
    obj.odometerEnd !== '' &&
    Number.isFinite(odoEndRaw) &&
    odoEndRaw >= 0
      ? Number(odoEndRaw.toFixed(1))
      : undefined;

  const ts = nowIsoUtc();
  return {
    id,
    species,
    dateIso,
    purpose: normalizeMileageTripPurpose(obj.purpose),
    origin: sanitizeSingleLineText(obj.origin || '', 160),
    destination: sanitizeSingleLineText(obj.destination || '', 160),
    roundTrip: Boolean(obj.roundTrip),
    miles,
    ...(odometerStart !== undefined ? { odometerStart } : {}),
    ...(odometerEnd !== undefined ? { odometerEnd } : {}),
    rateCentsPerMile,
    ...(parkingAndTollsCents > 0 ? { parkingAndTollsCents } : {}),
    ...(typeof obj.linkedShowId === 'string' && obj.linkedShowId.trim()
      ? { linkedShowId: obj.linkedShowId.trim() }
      : {}),
    ...(typeof obj.linkedClientId === 'string' && obj.linkedClientId.trim()
      ? { linkedClientId: obj.linkedClientId.trim() }
      : {}),
    ...(typeof obj.vehicleLabel === 'string' && obj.vehicleLabel.trim()
      ? { vehicleLabel: sanitizeSingleLineText(obj.vehicleLabel, 80) }
      : {}),
    taxDeductible: obj.taxDeductible !== false,
    notes: typeof obj.notes === 'string' ? obj.notes.slice(0, 1500) : '',
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev >= 0
      ? { _rev: Math.floor(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : ts,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : ts,
  };
}

export function createMileageLogDraft(
  species: string,
  overrides?: Partial<MileageLog>
): MileageLog {
  const ts = nowIsoUtc();
  return {
    id: generateUuid(),
    species: species || 'Rabbit',
    dateIso: todayDateIso(),
    purpose: 'Show Travel',
    origin: '',
    destination: '',
    roundTrip: true,
    miles: 0,
    rateCentsPerMile: DEFAULT_IRS_MILEAGE_RATE_CENTS,
    parkingAndTollsCents: 0,
    vehicleLabel: '',
    taxDeductible: true,
    notes: '',
    _rev: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

export function computeMileageLogDeductionCents(
  entry: Pick<MileageLog, 'miles' | 'rateCentsPerMile' | 'parkingAndTollsCents' | 'taxDeductible'>
): MileageDeductionBreakdown {
  const miles = Number.isFinite(entry.miles) && entry.miles > 0 ? Number(entry.miles) : 0;
  const rateCentsPerMile =
    Number.isFinite(entry.rateCentsPerMile) && entry.rateCentsPerMile >= 0
      ? Math.round(entry.rateCentsPerMile)
      : 0;
  const mileageAllowanceCents = Math.round(miles * rateCentsPerMile);
  const parkingAndTollsCents =
    Number.isFinite(Number(entry.parkingAndTollsCents)) && Number(entry.parkingAndTollsCents) > 0
      ? Math.round(Number(entry.parkingAndTollsCents))
      : 0;
  const totalTripValueCents = mileageAllowanceCents + parkingAndTollsCents;
  const deductibleCents = entry.taxDeductible !== false ? totalTripValueCents : 0;

  return {
    miles,
    rateCentsPerMile,
    mileageAllowanceCents,
    parkingAndTollsCents,
    totalTripValueCents,
    deductibleCents,
  };
}

export function getAvailableMileageTaxYears(logs: MileageLog[]): string[] {
  const years = new Set<string>();
  for (const log of logs) {
    if (log.dateIso && /^\d{4}/.test(log.dateIso)) {
      years.add(log.dateIso.slice(0, 4));
    }
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

export function evaluateAnnualMileageTaxSummary(
  logs: MileageLog[],
  yearFilter?: string
): AnnualMileageTaxSummary {
  const cleanYear = (yearFilter || '').trim();
  const scoped = cleanYear && cleanYear !== 'all'
    ? logs.filter((l) => l.dateIso.startsWith(`${cleanYear}-`))
    : logs;

  let deductibleTrips = 0;
  let totalMiles = 0;
  let deductibleMiles = 0;
  let nonDeductibleMiles = 0;
  let mileageDeductionCents = 0;
  let parkingAndTollsCents = 0;

  const byPurposeMap = new Map<MileageTripPurpose, MileagePurposeBreakdown>();
  for (const purpose of MILEAGE_TRIP_PURPOSES) {
    byPurposeMap.set(purpose, {
      purpose,
      tripCount: 0,
      totalMiles: 0,
      deductibleMiles: 0,
      deductibleCents: 0,
    });
  }

  const byMonthMap = new Map<string, MileageMonthBreakdown>();

  for (const log of scoped) {
    const bd = computeMileageLogDeductionCents(log);
    totalMiles += bd.miles;
    const isDeductible = log.taxDeductible !== false;
    if (isDeductible) {
      deductibleTrips += 1;
      deductibleMiles += bd.miles;
      mileageDeductionCents += bd.mileageAllowanceCents;
      parkingAndTollsCents += bd.parkingAndTollsCents;
    } else {
      nonDeductibleMiles += bd.miles;
    }

    const pBucket = byPurposeMap.get(log.purpose) || {
      purpose: log.purpose,
      tripCount: 0,
      totalMiles: 0,
      deductibleMiles: 0,
      deductibleCents: 0,
    };
    pBucket.tripCount += 1;
    pBucket.totalMiles = Number((pBucket.totalMiles + bd.miles).toFixed(1));
    if (isDeductible) {
      pBucket.deductibleMiles = Number((pBucket.deductibleMiles + bd.miles).toFixed(1));
      pBucket.deductibleCents += bd.deductibleCents;
    }
    byPurposeMap.set(log.purpose, pBucket);

    const monthKey = log.dateIso && log.dateIso.length >= 7 ? log.dateIso.slice(0, 7) : 'Unknown';
    const mBucket = byMonthMap.get(monthKey) || {
      monthKey,
      tripCount: 0,
      totalMiles: 0,
      deductibleCents: 0,
    };
    mBucket.tripCount += 1;
    mBucket.totalMiles = Number((mBucket.totalMiles + bd.miles).toFixed(1));
    mBucket.deductibleCents += bd.deductibleCents;
    byMonthMap.set(monthKey, mBucket);
  }

  return {
    yearLabel: cleanYear && cleanYear !== 'all' ? cleanYear : 'All Years',
    totalTrips: scoped.length,
    deductibleTrips,
    totalMiles: Number(totalMiles.toFixed(1)),
    deductibleMiles: Number(deductibleMiles.toFixed(1)),
    nonDeductibleMiles: Number(nonDeductibleMiles.toFixed(1)),
    mileageDeductionCents,
    parkingAndTollsCents,
    totalDeductibleCents: mileageDeductionCents + parkingAndTollsCents,
    byPurpose: Array.from(byPurposeMap.values()).filter((p) => p.tripCount > 0),
    byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
  };
}

export function exportMileageTaxCsv(params: {
  logs: MileageLog[];
  shows?: ShowEvent[];
  clients?: ClientContact[];
  currencyCode?: string;
}): string {
  const showById = new Map((params.shows ?? []).map((s) => [s.id, s]));
  const clientById = new Map((params.clients ?? []).map((c) => [c.id, c]));
  const currency = params.currencyCode || 'USD';

  const header = [
    'Date',
    'Species',
    'Purpose',
    'Origin',
    'Destination',
    'Round Trip',
    'Miles',
    'Odometer Start',
    'Odometer End',
    'Rate (per mile)',
    'Mileage Deduction',
    'Parking & Tolls',
    'Total Deductible',
    'Tax Deductible',
    'Vehicle',
    'Linked Show',
    'Linked Client',
    'Notes',
  ];

  const sorted = [...params.logs].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  const lines = [header.map(escapeCsvCell).join(',')];

  for (const log of sorted) {
    const bd = computeMileageLogDeductionCents(log);
    const linkedShow = log.linkedShowId ? showById.get(log.linkedShowId)?.name || '' : '';
    const linkedClient = log.linkedClientId ? clientById.get(log.linkedClientId)?.fullName || '' : '';
    const row = [
      log.dateIso,
      log.species,
      log.purpose,
      log.origin,
      log.destination,
      log.roundTrip ? 'Yes' : 'No',
      bd.miles.toFixed(1),
      log.odometerStart !== undefined ? String(log.odometerStart) : '',
      log.odometerEnd !== undefined ? String(log.odometerEnd) : '',
      formatCurrencyCents(bd.rateCentsPerMile, currency),
      formatCurrencyCents(bd.mileageAllowanceCents, currency),
      formatCurrencyCents(bd.parkingAndTollsCents, currency),
      formatCurrencyCents(bd.deductibleCents, currency),
      log.taxDeductible !== false ? 'Yes' : 'No',
      log.vehicleLabel || '',
      linkedShow,
      linkedClient,
      log.notes || '',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  }

  return UTF8_BOM + lines.join('\r\n');
}

export function generateAnnualMileageTaxHtml(params: {
  logs: MileageLog[];
  barnName: string;
  breederName: string;
  speciesName: string;
  yearLabel: string;
  currencyCode?: string;
  shows?: ShowEvent[];
  clients?: ClientContact[];
}): string {
  const currency = params.currencyCode || 'USD';
  const summary = evaluateAnnualMileageTaxSummary(
    params.logs,
    params.yearLabel === 'All Years' ? 'all' : params.yearLabel
  );
  const filtered =
    params.yearLabel && params.yearLabel !== 'All Years'
      ? params.logs.filter((l) => l.dateIso.startsWith(`${params.yearLabel}-`))
      : params.logs;
  const sorted = [...filtered].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  const showById = new Map((params.shows ?? []).map((s) => [s.id, s]));
  const clientById = new Map((params.clients ?? []).map((c) => [c.id, c]));

  const tripRows = sorted
    .map((log) => {
      const bd = computeMileageLogDeductionCents(log);
      const refParts: string[] = [];
      if (log.linkedShowId && showById.get(log.linkedShowId)) {
        refParts.push(`Show: ${showById.get(log.linkedShowId)!.name}`);
      }
      if (log.linkedClientId && clientById.get(log.linkedClientId)) {
        refParts.push(`Client: ${clientById.get(log.linkedClientId)!.fullName}`);
      }
      if (log.vehicleLabel) {
        refParts.push(`Vehicle: ${log.vehicleLabel}`);
      }
      return `<tr>
        <td>${escapeSafeHtml(formatReadableDate(log.dateIso))}</td>
        <td>${escapeSafeHtml(log.purpose)}</td>
        <td>${escapeSafeHtml(log.origin || 'Barn')} → ${escapeSafeHtml(log.destination || '—')}${
        log.roundTrip ? ' (RT)' : ''
      }</td>
        <td class="num">${escapeSafeHtml(bd.miles.toFixed(1))}</td>
        <td class="num">${escapeSafeHtml(formatCurrencyCents(bd.rateCentsPerMile, currency))}</td>
        <td class="num">${escapeSafeHtml(formatCurrencyCents(bd.parkingAndTollsCents, currency))}</td>
        <td class="num">${escapeSafeHtml(formatCurrencyCents(bd.deductibleCents, currency))}</td>
        <td>${escapeSafeHtml(refParts.concat(log.notes ? [log.notes] : []).join(' · ') || '—')}</td>
      </tr>`;
    })
    .join('\n');

  const purposeRows = summary.byPurpose
    .map(
      (p) => `<tr>
        <td>${escapeSafeHtml(p.purpose)}</td>
        <td class="num">${p.tripCount}</td>
        <td class="num">${p.totalMiles.toFixed(1)} mi</td>
        <td class="num">${p.deductibleMiles.toFixed(1)} mi</td>
        <td class="num">${escapeSafeHtml(formatCurrencyCents(p.deductibleCents, currency))}</td>
      </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeSafeHtml(params.barnName)} — ${escapeSafeHtml(params.yearLabel)} Mileage &amp; Tax Report</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1c1917; margin: 28px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  h2 { font-size: 15px; margin: 20px 0 8px 0; border-bottom: 1px solid #d6d3d1; padding-bottom: 4px; }
  .meta { font-size: 12px; color: #57534e; margin-bottom: 16px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi { border: 1px solid #d6d3d1; border-radius: 6px; padding: 10px; background: #fafaf9; }
  .kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #57534e; }
  .kpi-value { font-size: 17px; font-weight: bold; margin-top: 2px; font-family: monospace; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 14px; }
  th, td { border: 1px solid #d6d3d1; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f5f5f4; font-weight: 600; }
  td.num, th.num { text-align: right; font-family: monospace; }
  .note { font-size: 11px; color: #57534e; margin-top: 18px; border-top: 1px dashed #d6d3d1; padding-top: 10px; }
  @media print { body { margin: 14mm; } }
</style>
</head>
<body>
  <h1>${escapeSafeHtml(params.barnName || 'Barn')} — Annual Mileage &amp; Tax Deduction Log</h1>
  <div class="meta">
    Tax Period: <strong>${escapeSafeHtml(params.yearLabel)}</strong> ·
    Species Scope: <strong>${escapeSafeHtml(params.speciesName)}</strong> ·
    Preparer / Breeder: <strong>${escapeSafeHtml(params.breederName || '—')}</strong> ·
    Generated: <strong>${escapeSafeHtml(formatReadableDate(todayDateIso()))}</strong>
  </div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Deductible Trips</div>
      <div class="kpi-value">${summary.deductibleTrips} / ${summary.totalTrips}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Deductible Miles</div>
      <div class="kpi-value">${summary.deductibleMiles.toFixed(1)} mi</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Parking &amp; Tolls</div>
      <div class="kpi-value">${escapeSafeHtml(formatCurrencyCents(summary.parkingAndTollsCents, currency))}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Tax Deduction</div>
      <div class="kpi-value">${escapeSafeHtml(formatCurrencyCents(summary.totalDeductibleCents, currency))}</div>
    </div>
  </div>

  <h2>Deduction Breakdown by Business Purpose</h2>
  <table>
    <thead>
      <tr>
        <th>Purpose</th>
        <th class="num">Trips</th>
        <th class="num">Total Miles</th>
        <th class="num">Deductible Miles</th>
        <th class="num">Deductible Total</th>
      </tr>
    </thead>
    <tbody>
      ${purposeRows || '<tr><td colspan="5">No trips logged in this period.</td></tr>'}
    </tbody>
  </table>

  <h2>Contemporaneous Trip Ledger</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Purpose</th>
        <th>Route</th>
        <th class="num">Miles</th>
        <th class="num">Rate</th>
        <th class="num">Tolls/Pkg</th>
        <th class="num">Deductible</th>
        <th>Details &amp; Notes</th>
      </tr>
    </thead>
    <tbody>
      ${tripRows || '<tr><td colspan="8">No mileage records for this period.</td></tr>'}
    </tbody>
  </table>

  <p class="note">
    Prepared for farm/breeder bookkeeping (e.g., IRS Schedule F / Schedule C standard mileage documentation).
    Verify applicable annual IRS standard mileage rates and tax eligibility with your tax professional.
  </p>
</body>
</html>`;
}
