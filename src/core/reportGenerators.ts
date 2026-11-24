/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Per-Species Report Generators (`src/core/reportGenerators.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 * Generates structured tables, summary metrics, UTF-8 CSVs, and printable `.HTM`
 * reports strictly scoped to species present in `snapshot.speciesProfiles`.
 */

import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisksFromAnalyses,
  AnimalCarrierLineageAnalysis,
} from './carrierGenetics';
import { escapeCsvCell, UTF8_BOM } from './csvExport';
import {
  addDaysIso,
  Animal,
  BarnDatabaseSnapshot,
  BarnSettings,
  BreedingRecord,
  CareLog,
  formatBreedingStatusForSpecies,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  formatWeight,
  getSpeciesIdentifierLabels,
  isAnimalActive,
  isAnimalNonAdult,
  isSameSpecies,
  normalizeCurrencyCode,
  normalizeOwnershipType,
  pluralizeSpeciesLabel,
  resolveSpeciesWeightUnit,
  ShowEvent,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from './models';
import { evaluateLitterSurvivalAndMilestones } from './growthAnalytics';
import {
  buildSpeciesHerdMap,
  createSpeciesCoiEvaluator,
} from './pedigreeCalculator';
import {
  calculateDressOutPercent,
  computeAnimalProfitMargins,
  evaluateProcessingSummary,
  evaluateSpeciesEconomicsSummary,
  evaluateYouthProjectSummary,
  getLedgerCategoryLabel,
} from './economicsLedger';
import { buildReportCatalogForSpecies, ReportCatalogEntrySpec } from './reportCatalog';
import { computeAnimalShowSummary } from './showResults';
import { evaluateReservationFinancials, formatPreferredContactLabel } from './clientCrm';

export type ReportAudienceFilter =
  | 'All'
  | 'Male'
  | 'Female'
  | 'Non-Adult Male'
  | 'Non-Adult Female';

export const REPORT_AUDIENCE_FILTERS: ReadonlyArray<{
  value: ReportAudienceFilter;
  label: string;
}> = [
  { value: 'All', label: 'All (Male & Female)' },
  { value: 'Male', label: 'Male (All Ages)' },
  { value: 'Female', label: 'Female (All Ages)' },
  { value: 'Non-Adult Male', label: 'Non-Adult Male' },
  { value: 'Non-Adult Female', label: 'Non-Adult Female' },
];

export interface ReportGenerationOptions {
  filter?: ReportAudienceFilter;
  dateFromIso?: string;
  dateToIso?: string;
  referenceDateIso?: string;
  subjectAnimalId?: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export interface ReportRow {
  id: string;
  cells: Record<string, string | number>;
  animalId?: string;
  highlightTone?: 'normal' | 'warning' | 'danger' | 'success';
}

export interface ReportSummaryMetric {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}

export interface GeneratedReport {
  reportId: string;
  title: string;
  category: string;
  description: string;
  speciesName: string;
  speciesAdded: boolean;
  audienceFilter: ReportAudienceFilter;
  generatedAtDateIso: string;
  weightUnit: WeightUnit;
  currencyCode: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summaryMetrics: ReportSummaryMetric[];
  emptyMessage: string;
}

function escapeHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifySegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function parseIsoUtcMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [yStr, mStr, dStr] = iso.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function diffDaysIso(fromIso: string | undefined, toIso: string | undefined): number | null {
  const a = parseIsoUtcMs(fromIso);
  const b = parseIsoUtcMs(toIso);
  if (a === null || b === null || b < a) return null;
  return Math.floor((b - a) / 86_400_000);
}

function formatAgeSummary(days: number | null): string {
  if (days === null) return 'Unknown';
  if (days < 60) return `${days} d`;
  if (days < 730) return `${(days / 30.4375).toFixed(1)} mo (${days} d)`;
  return `${(days / 365.25).toFixed(1)} yr (${days} d)`;
}

function isIsoWithinRange(
  dateIso: string | undefined,
  fromIso?: string,
  toIso?: string
): boolean {
  const f = (fromIso || '').trim();
  const t = (toIso || '').trim();
  if (!f && !t) return true;
  const target = (dateIso || '').trim();
  if (!target) return false;
  if (f && target < f) return false;
  if (t && target > t) return false;
  return true;
}

function matchesAudienceFilter(
  animal: Animal | undefined,
  filter: ReportAudienceFilter,
  speciesProfile: SpeciesProfile,
  referenceDateIso: string
): boolean {
  if (filter === 'All') return true;
  if (!animal) return false;
  if (filter === 'Male') return animal.sex === 'Male';
  if (filter === 'Female') return animal.sex === 'Female';
  if (filter === 'Non-Adult Male') {
    return animal.sex === 'Male' && isAnimalNonAdult(animal, speciesProfile, referenceDateIso);
  }
  if (filter === 'Non-Adult Female') {
    return animal.sex === 'Female' && isAnimalNonAdult(animal, speciesProfile, referenceDateIso);
  }
  return true;
}

function formatAnimalRef(animal: Animal | undefined, fallbackName = ''): string {
  if (!animal) return fallbackName || '—';
  const name = (animal.name || '').trim();
  const tattoo = (animal.tattoo || '').trim();
  if (name && tattoo) return `${name} (${tattoo})`;
  return name || tattoo || 'Unnamed';
}

function formatStageLabel(
  animal: Animal,
  speciesProfile: SpeciesProfile,
  referenceDateIso: string
): 'Adult' | 'Non-Adult' {
  return isAnimalNonAdult(animal, speciesProfile, referenceDateIso) ? 'Non-Adult' : 'Adult';
}

function formatWeightRatePerDay(gramsPerDay: number, unit: WeightUnit): string {
  if (!Number.isFinite(gramsPerDay)) return '—';
  const sign = gramsPerDay < 0 ? '-' : '';
  const abs = Math.abs(gramsPerDay);
  if (unit === 'grams') return `${sign}${abs.toFixed(1)} g/day`;
  if (unit === 'kg') return `${sign}${(abs / 1000).toFixed(3)} kg/day`;
  return `${sign}${(abs / 453.59237).toFixed(3)} lb/day (${sign}${abs.toFixed(1)} g/day)`;
}

function formatSignedWeightDelta(deltaGrams: number, unit: WeightUnit): string {
  if (!Number.isFinite(deltaGrams) || deltaGrams === 0) return '0';
  const prefix = deltaGrams > 0 ? '+' : '-';
  return `${prefix}${formatWeight(Math.abs(deltaGrams), unit)}`;
}

function buildMissingSpeciesReport(
  speciesName: string,
  reportId: string,
  filter: ReportAudienceFilter,
  referenceDateIso: string,
  currencyCode: string,
  preferredUnit: WeightUnit
): GeneratedReport {
  return {
    reportId,
    title: 'Species Not Added',
    category: 'Unavailable',
    description: `${speciesName || 'Requested species'} has not been added to this barn.`,
    speciesName,
    speciesAdded: false,
    audienceFilter: filter,
    generatedAtDateIso: referenceDateIso,
    weightUnit: preferredUnit,
    currencyCode,
    columns: [{ key: 'notice', label: 'Notice' }],
    rows: [],
    summaryMetrics: [
      { label: 'Species Status', value: 'Not Added to Barn', tone: 'warning' },
    ],
    emptyMessage: `${speciesName || 'This species'} has not been added to your barn. Only configured species reports can be generated.`,
  };
}

interface ReportContext {
  snapshot: BarnDatabaseSnapshot;
  speciesProfile: SpeciesProfile;
  spec: ReportCatalogEntrySpec;
  filter: ReportAudienceFilter;
  dateFromIso: string;
  dateToIso: string;
  referenceDateIso: string;
  subjectAnimalId: string;
  weightUnit: WeightUnit;
  currencyCode: string;
  idShortLabel: string;
  birthLabel: string;
  offspringPlural: string;
  speciesAnimals: Animal[];
  animalById: Map<string, Animal>;
  speciesBreedings: BreedingRecord[];
  speciesCareLogs: CareLog[];
  speciesShows: ShowEvent[];
  herdMap: Map<string, Animal>;
}

/**
 * Generates a complete structured report for a single species present in `snapshot.speciesProfiles`.
 * Strictly refuses to leak or invent data for unadded species.
 */
export function generateSpeciesReport(
  snapshot: BarnDatabaseSnapshot,
  speciesName: string,
  reportId: string,
  options: ReportGenerationOptions = {}
): GeneratedReport {
  const filter: ReportAudienceFilter = options.filter || 'All';
  const referenceDateIso = (options.referenceDateIso || '').trim() || todayDateIso();
  const dateFromIso = (options.dateFromIso || '').trim();
  const dateToIso = (options.dateToIso || '').trim();
  const subjectAnimalId = (options.subjectAnimalId || '').trim();
  const currencyCode = normalizeCurrencyCode(snapshot.settings.currencyCode, 'USD');

  const speciesProfile = snapshot.speciesProfiles.find((sp) =>
    isSameSpecies(sp.name, speciesName)
  );
  if (!speciesProfile) {
    return buildMissingSpeciesReport(
      speciesName,
      reportId,
      filter,
      referenceDateIso,
      currencyCode,
      snapshot.settings.preferredUnit
    );
  }

  const catalog = buildReportCatalogForSpecies(speciesProfile);
  const spec: ReportCatalogEntrySpec = catalog.find((entry) => entry.id === reportId) || {
    id: reportId,
    title: `${speciesProfile.name} Report`,
    category: 'General',
    description: `Generated ${speciesProfile.name.toLowerCase()} report`,
    scopeLabel: `${speciesProfile.name} Only`,
    iconKey: 'roster',
  };

  const weightUnit = resolveSpeciesWeightUnit(speciesProfile, snapshot.settings);
  const idShortLabel = getSpeciesIdentifierLabels(speciesProfile.name).shortLabel;
  const birthLabel = (speciesProfile.birthEventLabel || 'Birth').trim() || 'Birth';
  const offspringPlural = pluralizeSpeciesLabel(speciesProfile.offspringLabel || 'Offspring');

  const speciesAnimals = snapshot.animals.filter((a) =>
    isSameSpecies(a.species, speciesProfile.name)
  );
  const animalById = new Map<string, Animal>();
  for (const animal of speciesAnimals) {
    animalById.set(animal.id, animal);
  }

  const speciesBreedings = snapshot.breedings.filter((b) =>
    isSameSpecies(b.species, speciesProfile.name)
  );

  // Scope careLogs strictly to this species (never leak logs tagged with another species)
  const speciesCareLogs = snapshot.careLogs.filter((l) => {
    const hasLogSpecies = Boolean((l.species || '').trim());
    if (hasLogSpecies) {
      return isSameSpecies(l.species, speciesProfile.name);
    }
    return animalById.has(l.animalId);
  });

  const speciesShows = (snapshot.shows ?? []).filter((s) =>
    isSameSpecies(s.species, speciesProfile.name)
  );

  const herdMap = buildSpeciesHerdMap(speciesAnimals, speciesProfile.name);

  const ctx: ReportContext = {
    snapshot,
    speciesProfile,
    spec,
    filter,
    dateFromIso,
    dateToIso,
    referenceDateIso,
    subjectAnimalId,
    weightUnit,
    currencyCode,
    idShortLabel,
    birthLabel,
    offspringPlural,
    speciesAnimals,
    animalById,
    speciesBreedings,
    speciesCareLogs,
    speciesShows,
    herdMap,
  };

  const built = buildReportBody(ctx);

  return {
    reportId: spec.id,
    title: spec.title,
    category: spec.category,
    description: spec.description,
    speciesName: speciesProfile.name,
    speciesAdded: true,
    audienceFilter: filter,
    generatedAtDateIso: referenceDateIso,
    weightUnit,
    currencyCode,
    columns: built.columns,
    rows: built.rows,
    summaryMetrics: built.summaryMetrics,
    emptyMessage:
      built.emptyMessage ||
      `No ${speciesProfile.name.toLowerCase()} records matched this report${
        filter !== 'All' ? ` (${filter})` : ''
      }.`,
  };
}

interface ReportBody {
  columns: ReportColumn[];
  rows: ReportRow[];
  summaryMetrics: ReportSummaryMetric[];
  emptyMessage?: string;
}

function buildReportBody(ctx: ReportContext): ReportBody {
  const {
    speciesProfile,
    filter,
    dateFromIso,
    dateToIso,
    referenceDateIso,
    subjectAnimalId,
    weightUnit,
    currencyCode,
    idShortLabel,
    birthLabel,
    offspringPlural,
    speciesAnimals,
    animalById,
    speciesBreedings,
    speciesCareLogs,
    herdMap,
  } = ctx;

  const spShows = ctx.snapshot.shows.filter((s) =>
    isSameSpecies(s.species, speciesProfile.name)
  );

  const matchesFilter = (animal: Animal | undefined): boolean =>
    matchesAudienceFilter(animal, filter, speciesProfile, referenceDateIso);

  const matchesBreedingFilter = (b: BreedingRecord): boolean => {
    if (filter === 'All') return true;
    const sire = b.sireId ? animalById.get(b.sireId) : undefined;
    const dam = b.damId ? animalById.get(b.damId) : undefined;
    if (filter === 'Male' || filter === 'Non-Adult Male') {
      return matchesAudienceFilter(sire, filter, speciesProfile, referenceDateIso);
    }
    return matchesAudienceFilter(dam, filter, speciesProfile, referenceDateIso);
  };

  switch (ctx.spec.id) {
    // 1. Birth Calendar (By ID)
    case 'birth-calendar-marks': {
      const upcoming = speciesBreedings
        .filter((b) => {
          const isUpcoming =
            b.status === 'Planned' ||
            b.status === 'Bred' ||
            b.status === 'Palpated Positive' ||
            (b.ultrasoundResult === 'Positive' && b.status !== 'Born' && b.status !== 'Weaned' && b.status !== 'Missed');
          if (!isUpcoming) return false;
          const dueIso = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
          return (
            isIsoWithinRange(dueIso, dateFromIso, dateToIso) &&
            matchesBreedingFilter(b)
          );
        })
        .sort((a, b) => {
          const damA = animalById.get(a.damId);
          const damB = animalById.get(b.damId);
          const idCmp = (damA?.tattoo || '').localeCompare(damB?.tattoo || '');
          if (idCmp !== 0) return idCmp;
          return (a.expectedDueDateIso || '').localeCompare(b.expectedDueDateIso || '');
        });

      const rows: ReportRow[] = upcoming.map((b) => {
        const dam = animalById.get(b.damId);
        const sire = animalById.get(b.sireId);
        const projected = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
        const usSummary = b.ultrasoundResult
          ? `${b.ultrasoundResult}${b.ultrasoundFetalCount ? ` (${b.ultrasoundFetalCount})` : ''}`
          : '—';
        return {
          id: b.id,
          animalId: dam?.id,
          cells: {
            damIdTag: dam?.tattoo || 'Unmarked',
            damName: dam?.name || b.damName || 'Unknown',
            sireName: formatAnimalRef(sire, b.sireName),
            bredDate: formatReadableDate(b.bredDateIso),
            dueDate: formatReadableDate(projected),
            status: formatBreedingStatusForSpecies(b.status, speciesProfile),
            ultrasound: usSummary,
            housing: dam?.cageLocation || 'Unassigned',
          },
        };
      });

      const dueSoonCount = upcoming.filter((b) => {
        const due = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
        const delta = diffDaysIso(referenceDateIso, due);
        return delta !== null && delta <= 7;
      }).length;

      return {
        columns: [
          { key: 'damIdTag', label: `Female ${idShortLabel}` },
          { key: 'damName', label: 'Female Name' },
          { key: 'sireName', label: 'Paired Male' },
          { key: 'bredDate', label: 'Bred Date' },
          { key: 'dueDate', label: `Projected ${birthLabel}` },
          { key: 'status', label: 'Status' },
          { key: 'ultrasound', label: 'Ultrasound' },
          { key: 'housing', label: 'Housing' },
        ],
        rows,
        summaryMetrics: [
          { label: `Scheduled ${birthLabel}s`, value: String(rows.length) },
          {
            label: 'Due Within 7 Days',
            value: String(dueSoonCount),
            tone: dueSoonCount > 0 ? 'warning' : 'neutral',
          },
        ],
      };
    }

    // 2. Birth Calendar (Ultrasounds)
    case 'birth-calendar-ultrasounds': {
      const candidates = speciesBreedings
        .filter((b) => {
          const hasScan = Boolean(
            b.ultrasoundDateIso ||
              b.ultrasoundResult ||
              b.ultrasoundProjectedDueIso ||
              (b.ultrasoundFetalCount || 0) > 0
          );
          const isOpenPregnancy =
            b.status === 'Bred' || b.status === 'Palpated Positive' || b.status === 'Planned';
          if (!hasScan && !isOpenPregnancy) return false;
          if (b.ultrasoundResult === 'Negative' && !hasScan) return false;
          const projected = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
          return (
            isIsoWithinRange(projected, dateFromIso, dateToIso) &&
            matchesBreedingFilter(b)
          );
        })
        .sort((a, b) => {
          const dA = a.ultrasoundProjectedDueIso || a.expectedDueDateIso || '';
          const dB = b.ultrasoundProjectedDueIso || b.expectedDueDateIso || '';
          return dA.localeCompare(dB);
        });

      const rows: ReportRow[] = candidates.map((b) => {
        const dam = animalById.get(b.damId);
        const sire = animalById.get(b.sireId);
        const projected = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
        const confirmedPositive = b.ultrasoundResult === 'Positive';
        return {
          id: b.id,
          animalId: dam?.id,
          highlightTone:
            confirmedPositive
              ? 'success'
              : b.ultrasoundResult === 'Negative'
              ? 'warning'
              : 'normal',
          cells: {
            projectedDue: formatReadableDate(projected),
            calendarDue: formatReadableDate(b.expectedDueDateIso),
            damName: dam?.name || b.damName || 'Unknown',
            damTag: dam?.tattoo || 'Unmarked',
            sireName: sire?.name || b.sireName || 'Unknown',
            scanDate: b.ultrasoundDateIso ? formatReadableDate(b.ultrasoundDateIso) : 'Pending',
            scanResult: b.ultrasoundResult || 'Not scanned',
            estCount:
              b.ultrasoundFetalCount && b.ultrasoundFetalCount > 0
                ? String(b.ultrasoundFetalCount)
                : '—',
            notes: b.notes || '—',
          },
        };
      });

      const positiveCount = candidates.filter((b) => b.ultrasoundResult === 'Positive').length;
      const estOffspring = candidates.reduce((sum, b) => sum + (b.ultrasoundFetalCount || 0), 0);

      return {
        columns: [
          { key: 'projectedDue', label: `Projected ${birthLabel}` },
          { key: 'calendarDue', label: 'Calendar Due' },
          { key: 'damName', label: 'Female' },
          { key: 'damTag', label: idShortLabel },
          { key: 'sireName', label: 'Male' },
          { key: 'scanDate', label: 'Scan Date' },
          { key: 'scanResult', label: 'Scan Result' },
          { key: 'estCount', label: `Est. ${offspringPlural}`, align: 'right' },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Active Pregnancies / Scans', value: String(rows.length) },
          { label: 'Ultrasound Positive', value: String(positiveCount), tone: 'positive' },
          { label: `Est. Total ${offspringPlural}`, value: String(estOffspring) },
        ],
      };
    }

    // 3. Roster Report
    case 'roster-report': {
      const roster = speciesAnimals
        .filter((a) => isAnimalActive(a) && matchesFilter(a))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const adultCount = roster.filter(
        (a) => !isAnimalNonAdult(a, speciesProfile, referenceDateIso)
      ).length;
      const nonAdultCount = roster.length - adultCount;

      const rows: ReportRow[] = roster.map((a) => {
        const flags: string[] = [];
        if (a.culled) flags.push('Flagged for Cull');
        if (a.needsAttention) flags.push('Needs Attention');
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: a.culled ? 'warning' : 'normal',
          cells: {
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            breed: a.breed || '—',
            variety: a.variety || '—',
            dob: formatReadableDate(a.birthDateIso),
            weight: formatWeight(a.weightGrams, weightUnit),
            ownership: normalizeOwnershipType(a.ownershipType, 'Owned'),
            housing: a.cageLocation || 'Unassigned',
            regNo: a.registrationNumber || '—',
            status: a.status,
            flags: flags.length > 0 ? flags.join(', ') : '—',
          },
        };
      });

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'breed', label: 'Breed' },
          { key: 'variety', label: 'Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'housing', label: 'Housing' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'status', label: 'Status' },
          { key: 'flags', label: 'Flags' },
        ],
        rows,
        summaryMetrics: [
          { label: `Active ${speciesProfile.name}`, value: String(rows.length) },
          { label: 'Adults', value: String(adultCount) },
          { label: 'Non-Adults', value: String(nonAdultCount) },
        ],
      };
    }

    // 4. ID Tags & Housing Labels Report
    case 'label-report': {
      const labeled = speciesAnimals
        .filter((a) => isAnimalActive(a) && matchesFilter(a))
        .sort((a, b) => {
          const cageCmp = (a.cageLocation || 'zzz').localeCompare(b.cageLocation || 'zzz');
          if (cageCmp !== 0) return cageCmp;
          const tagCmp = (a.tattoo || '').localeCompare(b.tattoo || '');
          if (tagCmp !== 0) return tagCmp;
          return (a.name || '').localeCompare(b.name || '');
        });

      const rows: ReportRow[] = labeled.map((a) => {
        const sire = a.sireId ? animalById.get(a.sireId) : undefined;
        const dam = a.damId ? animalById.get(a.damId) : undefined;
        return {
          id: a.id,
          animalId: a.id,
          cells: {
            housing: a.cageLocation || 'Unassigned',
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
            dob: formatReadableDate(a.birthDateIso),
            weight: formatWeight(a.weightGrams, weightUnit),
            sire: formatAnimalRef(sire),
            dam: formatAnimalRef(dam),
            regNo: a.registrationNumber || '—',
            gcNo: a.grandChampionNumber || '—',
          },
        };
      });

      const assignedHousingCount = labeled.filter((a) => Boolean(a.cageLocation?.trim())).length;

      return {
        columns: [
          { key: 'housing', label: 'Housing / Cage' },
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Labels', value: String(rows.length) },
          { label: 'With Housing Assigned', value: String(assignedHousingCount) },
        ],
      };
    }

    // 5. Male Income Report
    case 'male-income-report': {
      const males = speciesAnimals.filter(
        (a) => a.sex === 'Male' && matchesFilter(a)
      );

      let grandStudEarnedCents = 0;
      let grandDirectSalesCents = 0;
      let grandFeesPaidCents = 0;

      const enriched = males
        .map((male) => {
          const siredBreedings = speciesBreedings.filter((b) => {
            if (b.sireId !== male.id) return false;
            return isIsoWithinRange(
              b.actualBirthDateIso || b.bredDateIso,
              dateFromIso,
              dateToIso
            );
          });

          const studEarnedCents = siredBreedings.reduce((sum, b) => {
            const fee = b.serviceFeeCents || 0;
            if (fee <= 0) return sum;
            return b.serviceFeeDirection === 'paid' ? sum : sum + fee;
          }, 0);

          const studPaidCents = siredBreedings.reduce((sum, b) => {
            const fee = b.serviceFeeCents || 0;
            if (fee <= 0) return sum;
            return b.serviceFeeDirection === 'paid' ? sum + fee : sum;
          }, 0);

          const directSaleMatch =
            (male.status === 'Sold' || (male.salePriceCents || 0) > 0) &&
            isIsoWithinRange(male.soldDateIso || male.updatedAt.slice(0, 10), dateFromIso, dateToIso);
          const directSaleCents = directSaleMatch ? male.salePriceCents || 0 : 0;

          const totalGrossCents = studEarnedCents + directSaleCents;
          return {
            male,
            siredCount: siredBreedings.length,
            studEarnedCents,
            studPaidCents,
            directSaleCents,
            totalGrossCents,
          };
        })
        .filter(
          (item) =>
            item.totalGrossCents > 0 ||
            item.studPaidCents > 0 ||
            item.siredCount > 0 ||
            isAnimalActive(item.male)
        )
        .sort((a, b) => b.totalGrossCents - a.totalGrossCents || a.male.name.localeCompare(b.male.name));

      const rows: ReportRow[] = enriched.map((item) => {
        grandStudEarnedCents += item.studEarnedCents;
        grandDirectSalesCents += item.directSaleCents;
        grandFeesPaidCents += item.studPaidCents;
        return {
          id: item.male.id,
          animalId: item.male.id,
          highlightTone: item.totalGrossCents > 0 ? 'success' : 'normal',
          cells: {
            idTag: item.male.tattoo || 'Unmarked',
            name: item.male.name,
            stage: formatStageLabel(item.male, speciesProfile, referenceDateIso),
            status: item.male.status,
            breedings: item.siredCount,
            studEarned: formatCurrencyCents(item.studEarnedCents, currencyCode),
            directSales: formatCurrencyCents(item.directSaleCents, currencyCode),
            totalIncome: formatCurrencyCents(item.totalGrossCents, currencyCode),
            feesPaid: formatCurrencyCents(item.studPaidCents, currencyCode),
          },
        };
      });

      const combinedCents = grandStudEarnedCents + grandDirectSalesCents;

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Male Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'status', label: 'Status' },
          { key: 'breedings', label: 'Breedings Sired', align: 'right' },
          { key: 'studEarned', label: 'Stud Fees Earned', align: 'right' },
          { key: 'directSales', label: 'Direct Sales', align: 'right' },
          { key: 'totalIncome', label: 'Total Income', align: 'right' },
          { key: 'feesPaid', label: 'Fees Paid', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Male Income', value: formatCurrencyCents(combinedCents, currencyCode), tone: combinedCents > 0 ? 'positive' : 'neutral' },
          { label: 'Stud Fees Earned', value: formatCurrencyCents(grandStudEarnedCents, currencyCode) },
          { label: 'Direct Male Sales', value: formatCurrencyCents(grandDirectSalesCents, currencyCode) },
          { label: 'Stud Fees Paid Out', value: formatCurrencyCents(grandFeesPaidCents, currencyCode) },
        ],
      };
    }

    // 6. Female Income Report
    case 'female-income-report': {
      const females = speciesAnimals.filter(
        (a) => a.sex === 'Female' && matchesFilter(a)
      );

      let grandOffspringSalesCents = 0;
      let grandDirectSalesCents = 0;
      let grandStudPaidCents = 0;

      const enriched = females
        .map((female) => {
          const offspringSold = speciesAnimals.filter((child) => {
            if (child.damId !== female.id) return false;
            if (child.status !== 'Sold' && (child.salePriceCents || 0) <= 0) return false;
            return isIsoWithinRange(
              child.soldDateIso || child.updatedAt.slice(0, 10),
              dateFromIso,
              dateToIso
            );
          });
          const offspringSalesCents = offspringSold.reduce(
            (sum, child) => sum + (child.salePriceCents || 0),
            0
          );

          const directSaleMatch =
            (female.status === 'Sold' || (female.salePriceCents || 0) > 0) &&
            isIsoWithinRange(female.soldDateIso || female.updatedAt.slice(0, 10), dateFromIso, dateToIso);
          const directSaleCents = directSaleMatch ? female.salePriceCents || 0 : 0;

          const damBreedings = speciesBreedings.filter((b) => {
            if (b.damId !== female.id) return false;
            return isIsoWithinRange(
              b.actualBirthDateIso || b.bredDateIso,
              dateFromIso,
              dateToIso
            );
          });
          const studPaidCents = damBreedings.reduce((sum, b) => {
            const fee = b.serviceFeeCents || 0;
            return fee > 0 && b.serviceFeeDirection === 'paid' ? sum + fee : sum;
          }, 0);
          const netCents = offspringSalesCents + directSaleCents - studPaidCents;

          return {
            female,
            litters: damBreedings.filter((b) => b.status === 'Born' || b.status === 'Weaned').length,
            offspringSoldCount: offspringSold.length,
            offspringSalesCents,
            directSaleCents,
            totalGrossCents: offspringSalesCents + directSaleCents,
            studPaidCents,
            netCents,
          };
        })
        .filter(
          (item) =>
            item.totalGrossCents > 0 ||
            item.studPaidCents > 0 ||
            item.offspringSoldCount > 0 ||
            item.litters > 0 ||
            isAnimalActive(item.female)
        )
        .sort((a, b) => b.totalGrossCents - a.totalGrossCents || a.female.name.localeCompare(b.female.name));

      const rows: ReportRow[] = enriched.map((item) => {
        grandOffspringSalesCents += item.offspringSalesCents;
        grandDirectSalesCents += item.directSaleCents;
        grandStudPaidCents += item.studPaidCents;
        return {
          id: item.female.id,
          animalId: item.female.id,
          highlightTone: item.totalGrossCents > 0 ? 'success' : 'normal',
          cells: {
            idTag: item.female.tattoo || 'Unmarked',
            name: item.female.name,
            stage: formatStageLabel(item.female, speciesProfile, referenceDateIso),
            litters: item.litters,
            offspringSold: item.offspringSoldCount,
            offspringRevenue: formatCurrencyCents(item.offspringSalesCents, currencyCode),
            directRevenue: formatCurrencyCents(item.directSaleCents, currencyCode),
            studPaid: formatCurrencyCents(item.studPaidCents, currencyCode),
            netIncome: formatCurrencyCents(item.netCents, currencyCode),
          },
        };
      });

      const grossTotal = grandOffspringSalesCents + grandDirectSalesCents;
      const netTotal = grossTotal - grandStudPaidCents;

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Female Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'litters', label: `${birthLabel}s`, align: 'right' },
          { key: 'offspringSold', label: `${offspringPlural} Sold`, align: 'right' },
          { key: 'offspringRevenue', label: `${offspringPlural} Sales`, align: 'right' },
          { key: 'directRevenue', label: 'Direct Sale', align: 'right' },
          { key: 'studPaid', label: 'Stud Fees Paid', align: 'right' },
          { key: 'netIncome', label: 'Net Income', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Gross Female Income', value: formatCurrencyCents(grossTotal, currencyCode), tone: grossTotal > 0 ? 'positive' : 'neutral' },
          { label: `${offspringPlural} Sales`, value: formatCurrencyCents(grandOffspringSalesCents, currencyCode) },
          { label: 'Stud Fees Paid', value: formatCurrencyCents(grandStudPaidCents, currencyCode) },
          { label: 'Net Revenue', value: formatCurrencyCents(netTotal, currencyCode) },
        ],
      };
    }

    // 7. Unidentified / Missing ID Report
    case 'unmarked-report': {
      const unmarked = speciesAnimals
        .filter((a) => {
          if (!isAnimalActive(a) || !matchesFilter(a)) return false;
          const missingPrimary = !(a.tattoo || '').trim();
          const missingReg = !(a.registrationNumber || '').trim();
          return missingPrimary || missingReg;
        })
        .sort((a, b) => {
          const missA = !(a.tattoo || '').trim() ? 0 : 1;
          const missB = !(b.tattoo || '').trim() ? 0 : 1;
          if (missA !== missB) return missA - missB;
          return (a.birthDateIso || '').localeCompare(b.birthDateIso || '');
        });

      let missingPrimaryCount = 0;
      let missingRegCount = 0;

      const rows: ReportRow[] = unmarked.map((a) => {
        const noPrimary = !(a.tattoo || '').trim();
        const noReg = !(a.registrationNumber || '').trim();
        if (noPrimary) missingPrimaryCount += 1;
        if (noReg) missingRegCount += 1;
        const missingList: string[] = [];
        if (noPrimary) missingList.push(`Missing ${idShortLabel}`);
        if (noReg) missingList.push('Missing Reg #');
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: noPrimary ? 'warning' : 'normal',
          cells: {
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            dob: formatReadableDate(a.birthDateIso),
            housing: a.cageLocation || 'Unassigned',
            primaryId: a.tattoo || 'Missing',
            regNo: a.registrationNumber || 'Missing',
            missing: missingList.join(' & '),
            sire: formatAnimalRef(animalById.get(a.sireId)),
            dam: formatAnimalRef(animalById.get(a.damId)),
          },
        };
      });

      return {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'dob', label: 'DOB' },
          { key: 'housing', label: 'Housing' },
          { key: 'primaryId', label: idShortLabel },
          { key: 'regNo', label: 'Reg #' },
          { key: 'missing', label: 'Missing Fields' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Records Missing IDs', value: String(rows.length), tone: rows.length > 0 ? 'warning' : 'positive' },
          { label: `Missing ${idShortLabel}`, value: String(missingPrimaryCount) },
          { label: 'Missing Reg #', value: String(missingRegCount) },
        ],
      };
    }

    // 8. Weight Gain Report
    case 'weight-gain-report': {
      const logsByAnimal = new Map<string, CareLog[]>();
      for (const l of speciesCareLogs) {
        if ((l.type !== 'Weight Check' && !(l.weightGrams > 0)) || l.weightGrams <= 0) continue;
        if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) continue;
        const arr = logsByAnimal.get(l.animalId) || [];
        arr.push(l);
        logsByAnimal.set(l.animalId, arr);
      }

      const items: Array<{
        animal: Animal;
        weighIns: number;
        startGrams: number;
        startDate: string;
        latestGrams: number;
        latestDate: string;
        gainGrams: number;
        daysElapsed: number | null;
        adgGramsPerDay: number | null;
      }> = [];

      for (const a of speciesAnimals) {
        if (!matchesFilter(a)) continue;
        const logs = (logsByAnimal.get(a.id) || []).sort((x, y) =>
          (x.dateIso || '').localeCompare(y.dateIso || '')
        );
        if (logs.length === 0 && a.weightGrams <= 0) continue;
        if (logs.length === 0 && !isAnimalActive(a)) continue;

        const startGrams = logs.length > 0 ? logs[0].weightGrams : a.weightGrams;
        const startDate = logs.length > 0 ? logs[0].dateIso : a.birthDateIso;
        const latestGrams = logs.length > 0 ? logs[logs.length - 1].weightGrams : a.weightGrams;
        const latestDate =
          logs.length > 0 ? logs[logs.length - 1].dateIso : a.updatedAt.slice(0, 10);
        const gainGrams = logs.length >= 2 ? latestGrams - startGrams : 0;
        const daysElapsed = logs.length >= 2 ? diffDaysIso(startDate, latestDate) : null;
        const adgGramsPerDay =
          daysElapsed && daysElapsed > 0 ? gainGrams / daysElapsed : null;

        items.push({
          animal: a,
          weighIns: logs.length,
          startGrams,
          startDate,
          latestGrams,
          latestDate,
          gainGrams,
          daysElapsed,
          adgGramsPerDay,
        });
      }

      items.sort((x, y) => {
        const adgX = x.adgGramsPerDay ?? -Infinity;
        const adgY = y.adgGramsPerDay ?? -Infinity;
        if (adgY !== adgX) return adgY - adgX;
        return y.latestGrams - x.latestGrams;
      });

      const adgValues = items
        .map((i) => i.adgGramsPerDay)
        .filter((v): v is number => v !== null);
      const avgAdg =
        adgValues.length > 0
          ? adgValues.reduce((s, v) => s + v, 0) / adgValues.length
          : null;

      const rows: ReportRow[] = items.map((item) => ({
        id: item.animal.id,
        animalId: item.animal.id,
        highlightTone:
          item.gainGrams < 0 ? 'warning' : item.gainGrams > 0 ? 'success' : 'normal',
        cells: {
          idTag: item.animal.tattoo || 'Unmarked',
          name: item.animal.name,
          stage: formatStageLabel(item.animal, speciesProfile, referenceDateIso),
          weighIns: item.weighIns,
          startWeight: `${formatWeight(item.startGrams, weightUnit)}${
            item.startDate ? ` (${formatReadableDate(item.startDate)})` : ''
          }`,
          latestWeight: `${formatWeight(item.latestGrams, weightUnit)}${
            item.latestDate ? ` (${formatReadableDate(item.latestDate)})` : ''
          }`,
          totalGain:
            item.weighIns >= 2 ? formatSignedWeightDelta(item.gainGrams, weightUnit) : '1 weigh-in',
          days: item.daysElapsed !== null ? String(item.daysElapsed) : '—',
          adg:
            item.adgGramsPerDay !== null
              ? formatWeightRatePerDay(item.adgGramsPerDay, weightUnit)
              : '—',
        },
      }));

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'weighIns', label: 'Weigh-Ins', align: 'right' },
          { key: 'startWeight', label: 'Start Weight' },
          { key: 'latestWeight', label: 'Latest Weight' },
          { key: 'totalGain', label: 'Total Gain', align: 'right' },
          { key: 'days', label: 'Days', align: 'right' },
          { key: 'adg', label: 'Avg Daily Gain', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Tracked Animals', value: String(rows.length) },
          { label: 'Multi-Point Series', value: String(adgValues.length) },
          {
            label: 'Mean ADG',
            value: avgAdg !== null ? formatWeightRatePerDay(avgAdg, weightUnit) : 'N/A',
          },
        ],
      };
    }

    // 9. Breeding History Report
    case 'breeding-history-report': {
      const history = speciesBreedings
        .filter(
          (b) =>
            isIsoWithinRange(
              b.actualBirthDateIso || b.bredDateIso,
              dateFromIso,
              dateToIso
            ) && matchesBreedingFilter(b)
        )
        .sort((a, b) => (b.bredDateIso || '').localeCompare(a.bredDateIso || ''));

      let totalLive = 0;
      let totalStillborn = 0;
      let totalWeaned = 0;
      let settledCount = 0;
      let positiveCount = 0;

      const rows: ReportRow[] = history.map((b) => {
        const sire = animalById.get(b.sireId);
        const dam = animalById.get(b.damId);
        totalLive += b.liveCount || 0;
        totalStillborn += b.stillbornCount || 0;
        totalWeaned += b.weanedCount || 0;

        if (b.status !== 'Planned') {
          settledCount += 1;
          if (b.status === 'Born' || b.status === 'Weaned' || b.status === 'Palpated Positive') {
            positiveCount += 1;
          }
        }

        const feeText =
          b.serviceFeeCents && b.serviceFeeCents > 0
            ? `${formatCurrencyCents(b.serviceFeeCents, currencyCode)} (${
                b.serviceFeeDirection === 'paid' ? 'Paid' : 'Earned'
              })`
            : '—';

        const usText = b.ultrasoundResult
          ? `${b.ultrasoundResult}${b.ultrasoundFetalCount ? ` (${b.ultrasoundFetalCount})` : ''}`
          : '—';

        return {
          id: b.id,
          animalId: dam?.id,
          highlightTone:
            b.status === 'Missed'
              ? 'warning'
              : b.status === 'Born' || b.status === 'Weaned'
              ? 'success'
              : 'normal',
          cells: {
            bredDate: formatReadableDate(b.bredDateIso),
            dam: formatAnimalRef(dam, b.damName),
            sire: formatAnimalRef(sire, b.sireName),
            status: formatBreedingStatusForSpecies(b.status, speciesProfile),
            dueDate: formatReadableDate(b.ultrasoundProjectedDueIso || b.expectedDueDateIso),
            actualBirth: b.actualBirthDateIso ? formatReadableDate(b.actualBirthDateIso) : '—',
            live: b.liveCount,
            stillborn: b.stillbornCount,
            fostered: b.fosteredCount,
            weaned: b.weanedCount,
            ultrasound: usText,
            serviceFee: feeText,
            coi: `${(b.projectedCoiPercent || 0).toFixed(2)}%`,
          },
        };
      });

      const conceptionRate =
        settledCount > 0 ? `${Math.round((positiveCount / settledCount) * 100)}%` : 'N/A';

      return {
        columns: [
          { key: 'bredDate', label: 'Bred Date' },
          { key: 'dam', label: 'Female' },
          { key: 'sire', label: 'Male' },
          { key: 'status', label: 'Outcome' },
          { key: 'dueDate', label: 'Due Date' },
          { key: 'actualBirth', label: `Actual ${birthLabel}` },
          { key: 'live', label: 'Live', align: 'right' },
          { key: 'stillborn', label: 'Stillborn', align: 'right' },
          { key: 'fostered', label: 'Fostered', align: 'right' },
          { key: 'weaned', label: 'Weaned', align: 'right' },
          { key: 'ultrasound', label: 'Ultrasound' },
          { key: 'serviceFee', label: 'Service Fee', align: 'right' },
          { key: 'coi', label: 'COI %', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Pairings', value: String(rows.length) },
          { label: 'Conception Rate', value: conceptionRate },
          { label: `Total Live ${offspringPlural}`, value: String(totalLive), tone: 'positive' },
          { label: `Total Weaned / Stillborn`, value: `${totalWeaned} / ${totalStillborn}` },
        ],
      };
    }

    // 9b. Litter Survival & Parent Performance Report
    case 'litter-survival-performance-report': {
      const filteredBreedings = speciesBreedings.filter((b) => {
        if (!isIsoWithinRange(b.actualBirthDateIso || b.bredDateIso, dateFromIso, dateToIso)) {
          return false;
        }
        if (filter === 'Male' || filter === 'Non-Adult Male') {
          return matchesFilter(animalById.get(b.sireId));
        }
        if (filter === 'Female' || filter === 'Non-Adult Female') {
          return matchesFilter(animalById.get(b.damId));
        }
        return true;
      });

      const evalRes = evaluateLitterSurvivalAndMilestones({
        speciesProfile,
        breedings: filteredBreedings,
        animals: speciesAnimals,
        careLogs: speciesCareLogs,
      });

      const summaries =
        filter === 'Male' || filter === 'Non-Adult Male'
          ? evalRes.sireSummaries
          : evalRes.damSummaries;

      const roleLabel =
        filter === 'Male' || filter === 'Non-Adult Male' ? 'Male' : 'Female';

      const rows: ReportRow[] = summaries.map((p) => ({
        id: `${p.role}-${p.parentId || p.parentName}`,
        animalId: p.parentId || undefined,
        highlightTone:
          p.weaningSurvivalRatePct !== null && p.weaningSurvivalRatePct >= 85
            ? 'success'
            : p.weaningSurvivalRatePct !== null && p.weaningSurvivalRatePct < 60
            ? 'warning'
            : 'normal',
        cells: {
          parent: p.parentName,
          idTag: p.parentTattoo || 'Unmarked',
          role: roleLabel,
          litters: String(p.littersBornCount),
          liveBorn: String(p.totalLiveBorn),
          stillborn: String(p.totalStillborn),
          weaned: String(p.totalWeaned),
          liveBirthPct: p.liveBirthRatePct !== null ? `${p.liveBirthRatePct.toFixed(1)}%` : '—',
          weanSurvivalPct:
            p.weaningSurvivalRatePct !== null ? `${p.weaningSurvivalRatePct.toFixed(1)}%` : '—',
          avg3w: p.avg3WeekGrams !== null ? formatWeight(p.avg3WeekGrams, weightUnit) : '—',
          avg6w: p.avg6WeekGrams !== null ? formatWeight(p.avg6WeekGrams, weightUnit) : '—',
          avg8w: p.avg8WeekGrams !== null ? formatWeight(p.avg8WeekGrams, weightUnit) : '—',
          litterAdg:
            p.meanLitterAdgGramsPerDay !== null
              ? formatWeightRatePerDay(p.meanLitterAdgGramsPerDay, weightUnit)
              : '—',
        },
      }));

      return {
        columns: [
          { key: 'parent', label: roleLabel },
          { key: 'idTag', label: idShortLabel },
          { key: 'litters', label: 'Litters', align: 'right' },
          { key: 'liveBorn', label: 'Live Born', align: 'right' },
          { key: 'stillborn', label: 'Stillborn', align: 'right' },
          { key: 'weaned', label: 'Weaned', align: 'right' },
          { key: 'liveBirthPct', label: 'Live Birth %', align: 'right' },
          { key: 'weanSurvivalPct', label: 'Wean Survival %', align: 'right' },
          { key: 'avg3w', label: '3w Avg', align: 'right' },
          { key: 'avg6w', label: '6w Avg', align: 'right' },
          { key: 'avg8w', label: '8w Avg', align: 'right' },
          { key: 'litterAdg', label: 'Litter ADG', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Litters Born', value: String(evalRes.overallSummary.littersBornCount) },
          {
            label: 'Live Birth Survival',
            value:
              evalRes.overallSummary.liveBirthRatePct !== null
                ? `${evalRes.overallSummary.liveBirthRatePct.toFixed(1)}%`
                : 'N/A',
            tone: 'positive',
          },
          {
            label: 'Weaning Survival',
            value:
              evalRes.overallSummary.weaningSurvivalRatePct !== null
                ? `${evalRes.overallSummary.weaningSurvivalRatePct.toFixed(1)}%`
                : 'N/A',
          },
          {
            label: 'Mean 8w Avg',
            value:
              evalRes.overallSummary.avg8WeekGrams !== null
                ? formatWeight(evalRes.overallSummary.avg8WeekGrams, weightUnit)
                : '—',
          },
        ],
      };
    }

    // 10. Medicine & Treatment Report
    case 'medicine-report': {
      const treatments = speciesCareLogs
        .filter((l) => {
          const isMed =
            l.type === 'Health / Vet' ||
            Boolean(l.medicationName?.trim()) ||
            Boolean(l.dosage?.trim()) ||
            Boolean(l.administrationRoute?.trim()) ||
            (l.withdrawalDays || 0) > 0 ||
            Boolean(l.withdrawalClearDateIso?.trim());
          if (!isMed) return false;
          if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) return false;
          const animal = animalById.get(l.animalId);
          return matchesFilter(animal);
        })
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      let activeHolds = 0;

      const rows: ReportRow[] = treatments.map((l) => {
        const animal = animalById.get(l.animalId);
        const wDays = l.withdrawalDays || 0;
        const clearIso =
          (l.withdrawalClearDateIso || '').trim() ||
          (wDays > 0 && l.dateIso ? addDaysIso(l.dateIso, wDays) : '');
        let wStatus = 'None';
        let tone: ReportRow['highlightTone'] = 'normal';
        if (clearIso) {
          if (clearIso > referenceDateIso) {
            wStatus = `Active Hold (until ${formatReadableDate(clearIso)})`;
            tone = 'warning';
            activeHolds += 1;
          } else {
            wStatus = 'Cleared';
            tone = 'success';
          }
        }
        return {
          id: l.id,
          animalId: animal?.id,
          highlightTone: tone,
          cells: {
            date: formatReadableDate(l.dateIso),
            animal: animal?.name || 'Unknown',
            idTag: animal?.tattoo || 'Unmarked',
            treatment: l.title || 'Health Entry',
            medication: l.medicationName || '—',
            dosage: l.dosage || '—',
            route: l.administrationRoute || '—',
            withdrawalDays: wDays > 0 ? `${wDays} d` : '0 d',
            clearDate: clearIso ? formatReadableDate(clearIso) : '—',
            withdrawalStatus: wStatus,
            notes: l.notes || '—',
          },
        };
      });

      return {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'animal', label: 'Animal' },
          { key: 'idTag', label: idShortLabel },
          { key: 'treatment', label: 'Treatment / Entry' },
          { key: 'medication', label: 'Medication' },
          { key: 'dosage', label: 'Dosage' },
          { key: 'route', label: 'Route' },
          { key: 'withdrawalDays', label: 'Withdrawal', align: 'right' },
          { key: 'clearDate', label: 'Clear Date' },
          { key: 'withdrawalStatus', label: 'Hold Status' },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Treatment Entries', value: String(rows.length) },
          {
            label: 'Active Withdrawal Holds',
            value: String(activeHolds),
            tone: activeHolds > 0 ? 'warning' : 'positive',
          },
        ],
      };
    }

    // 11. Body Condition & Parasite Score Report
    case 'health-score-report': {
      const scoreLogs = speciesCareLogs
        .filter((l) => {
          const isScore =
            l.type === 'Health Score / BCS' ||
            (l.bodyConditionScore || 0) > 0 ||
            (l.famachaScore || 0) > 0 ||
            (l.fecalEggCount || 0) > 0;
          if (!isScore) return false;
          if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) return false;
          return matchesFilter(animalById.get(l.animalId));
        })
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      const bcsList: number[] = [];
      let elevatedFamachaCount = 0;

      const rows: ReportRow[] = scoreLogs.map((l) => {
        const animal = animalById.get(l.animalId);
        const bcs = l.bodyConditionScore && l.bodyConditionScore > 0 ? l.bodyConditionScore : 0;
        const famacha = l.famachaScore && l.famachaScore > 0 ? l.famachaScore : 0;
        const fec = l.fecalEggCount && l.fecalEggCount > 0 ? l.fecalEggCount : 0;
        if (bcs > 0) bcsList.push(bcs);
        if (famacha >= 4) elevatedFamachaCount += 1;

        return {
          id: l.id,
          animalId: animal?.id,
          highlightTone: famacha >= 4 ? 'danger' : famacha === 3 ? 'warning' : 'normal',
          cells: {
            date: formatReadableDate(l.dateIso),
            animal: animal?.name || 'Unknown',
            idTag: animal?.tattoo || 'Unmarked',
            sex: animal ? formatSexForSpecies(animal.sex, speciesProfile) : '—',
            stage: animal ? formatStageLabel(animal, speciesProfile, referenceDateIso) : '—',
            bcs: bcs > 0 ? bcs.toFixed(1) : '—',
            famacha: famacha > 0 ? `${famacha} / 5` : '—',
            fec: fec > 0 ? `${fec} EPG` : '—',
            notes: [l.title, l.notes].filter(Boolean).join(' — ') || '—',
          },
        };
      });

      const meanBcs =
        bcsList.length > 0
          ? (bcsList.reduce((s, v) => s + v, 0) / bcsList.length).toFixed(2)
          : 'N/A';

      return {
        columns: [
          { key: 'date', label: 'Check Date' },
          { key: 'animal', label: 'Animal' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'bcs', label: 'BCS', align: 'right' },
          { key: 'famacha', label: 'FAMACHA / Eye', align: 'right' },
          { key: 'fec', label: 'FEC (EPG)', align: 'right' },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Score Checks', value: String(rows.length) },
          { label: 'Average BCS', value: meanBcs },
          {
            label: 'FAMACHA ≥ 4 Alerts',
            value: String(elevatedFamachaCount),
            tone: elevatedFamachaCount > 0 ? 'danger' : 'positive',
          },
        ],
      };
    }

    // 12. Ultrasound & Pregnancy Scan Report
    case 'ultrasound-report': {
      interface ScanEntry {
        id: string;
        sortDate: string;
        animalId?: string;
        animalName: string;
        idTag: string;
        partner: string;
        source: 'Breeding' | 'Care Log';
        result: string;
        fetalCount: number;
        projectedDueIso: string;
        notes: string;
      }

      const combined: ScanEntry[] = [];

      for (const b of speciesBreedings) {
        const hasScan = Boolean(
          b.ultrasoundDateIso ||
            b.ultrasoundResult ||
            b.ultrasoundProjectedDueIso ||
            (b.ultrasoundFetalCount || 0) > 0
        );
        if (!hasScan) continue;
        const scanDate = b.ultrasoundDateIso || b.bredDateIso;
        if (!isIsoWithinRange(scanDate, dateFromIso, dateToIso)) continue;
        if (!matchesBreedingFilter(b)) continue;
        const dam = animalById.get(b.damId);
        const sire = animalById.get(b.sireId);
        combined.push({
          id: `br-${b.id}`,
          sortDate: scanDate,
          animalId: dam?.id,
          animalName: dam?.name || b.damName || 'Unknown',
          idTag: dam?.tattoo || 'Unmarked',
          partner: formatAnimalRef(sire, b.sireName),
          source: 'Breeding',
          result: b.ultrasoundResult || 'Recorded',
          fetalCount: b.ultrasoundFetalCount || 0,
          projectedDueIso: b.ultrasoundProjectedDueIso || b.expectedDueDateIso || '',
          notes: b.notes || '',
        });
      }

      for (const l of speciesCareLogs) {
        const hasUltrasound =
          l.type === 'Ultrasound' ||
          Boolean(l.ultrasoundResult) ||
          (l.ultrasoundFetalCount || 0) > 0;
        if (!hasUltrasound) continue;
        if (!isIsoWithinRange(l.dateIso, dateFromIso, dateToIso)) continue;
        const animal = animalById.get(l.animalId);
        if (!matchesFilter(animal)) continue;
        combined.push({
          id: `cl-${l.id}`,
          sortDate: l.dateIso,
          animalId: animal?.id,
          animalName: animal?.name || 'Unknown',
          idTag: animal?.tattoo || 'Unmarked',
          partner: '—',
          source: 'Care Log',
          result: l.ultrasoundResult || l.title || 'Recorded',
          fetalCount: l.ultrasoundFetalCount || 0,
          projectedDueIso: '',
          notes: l.notes || l.title || '',
        });
      }

      combined.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));

      const positiveCount = combined.filter((c) => c.result === 'Positive').length;
      const negativeCount = combined.filter((c) => c.result === 'Negative').length;

      const rows: ReportRow[] = combined.map((c) => ({
        id: c.id,
        animalId: c.animalId,
        highlightTone:
          c.result === 'Positive'
            ? 'success'
            : c.result === 'Negative'
            ? 'warning'
            : 'normal',
        cells: {
          scanDate: formatReadableDate(c.sortDate),
          animal: c.animalName,
          idTag: c.idTag,
          partner: c.partner,
          source: c.source,
          result: c.result,
          estCount: c.fetalCount > 0 ? String(c.fetalCount) : '—',
          projectedDue: c.projectedDueIso ? formatReadableDate(c.projectedDueIso) : '—',
          notes: c.notes || '—',
        },
      }));

      return {
        columns: [
          { key: 'scanDate', label: 'Scan Date' },
          { key: 'animal', label: 'Animal' },
          { key: 'idTag', label: idShortLabel },
          { key: 'partner', label: 'Paired Sire' },
          { key: 'source', label: 'Source' },
          { key: 'result', label: 'Scan Result' },
          { key: 'estCount', label: `Est. ${offspringPlural}`, align: 'right' },
          { key: 'projectedDue', label: `Projected ${birthLabel}` },
          { key: 'notes', label: 'Notes' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Scans', value: String(rows.length) },
          { label: 'Positive', value: String(positiveCount), tone: 'positive' },
          { label: 'Negative', value: String(negativeCount) },
        ],
      };
    }

    // 13. Mortality / Loss Report
    case 'death-report': {
      const deceased = speciesAnimals
        .filter((a) => {
          const isLoss =
            a.status === 'Deceased' ||
            Boolean(a.deceasedDateIso?.trim()) ||
            Boolean(a.deathCause?.trim());
          if (!isLoss || !matchesFilter(a)) return false;
          return isIsoWithinRange(
            a.deceasedDateIso || a.updatedAt.slice(0, 10),
            dateFromIso,
            dateToIso
          );
        })
        .sort((a, b) =>
          (b.deceasedDateIso || b.updatedAt).localeCompare(a.deceasedDateIso || a.updatedAt)
        );

      let adultLosses = 0;
      let nonAdultLosses = 0;
      const causeCounts = new Map<string, number>();

      const rows: ReportRow[] = deceased.map((a) => {
        const deathDate = (a.deceasedDateIso || '').trim();
        const evalRefDate = deathDate || referenceDateIso;
        const wasNonAdult = isAnimalNonAdult(a, speciesProfile, evalRefDate);
        if (wasNonAdult) nonAdultLosses += 1;
        else adultLosses += 1;

        const cause = (a.deathCause || '').trim() || 'Not recorded';
        causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);

        const ageDays = deathDate ? diffDaysIso(a.birthDateIso, deathDate) : null;

        return {
          id: a.id,
          animalId: a.id,
          highlightTone: 'danger',
          cells: {
            deceasedDate: deathDate ? formatReadableDate(deathDate) : 'Unset',
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stageAtDeath: wasNonAdult ? 'Non-Adult' : 'Adult',
            ageAtDeath: formatAgeSummary(ageDays),
            dob: formatReadableDate(a.birthDateIso),
            cause,
            sire: formatAnimalRef(animalById.get(a.sireId)),
            dam: formatAnimalRef(animalById.get(a.damId)),
          },
        };
      });

      const topCauseEntry = Array.from(causeCounts.entries()).sort((a, b) => b[1] - a[1])[0];

      return {
        columns: [
          { key: 'deceasedDate', label: 'Deceased Date' },
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'stageAtDeath', label: 'Stage at Loss' },
          { key: 'ageAtDeath', label: 'Age at Loss' },
          { key: 'dob', label: 'DOB' },
          { key: 'cause', label: 'Cause' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Losses', value: String(rows.length), tone: rows.length > 0 ? 'danger' : 'neutral' },
          { label: 'Adults / Non-Adults', value: `${adultLosses} / ${nonAdultLosses}` },
          { label: 'Top Recorded Cause', value: topCauseEntry ? `${topCauseEntry[0]} (${topCauseEntry[1]})` : 'N/A' },
        ],
      };
    }

    // 14. Sold Stock Report
    case 'sold-stock-report': {
      const sold = speciesAnimals
        .filter((a) => {
          const isSold =
            a.status === 'Sold' ||
            Boolean(a.soldDateIso?.trim()) ||
            (a.salePriceCents || 0) > 0 ||
            Boolean(a.buyerName?.trim());
          if (!isSold || !matchesFilter(a)) return false;
          return isIsoWithinRange(
            a.soldDateIso || a.updatedAt.slice(0, 10),
            dateFromIso,
            dateToIso
          );
        })
        .sort((a, b) =>
          (b.soldDateIso || b.updatedAt).localeCompare(a.soldDateIso || a.updatedAt)
        );

      let grossCents = 0;
      let pricedCount = 0;

      const rows: ReportRow[] = sold.map((a) => {
        const saleCents = a.salePriceCents || 0;
        const costCents = a.purchaseCostCents || 0;
        if (saleCents > 0) {
          grossCents += saleCents;
          pricedCount += 1;
        }
        const netCents = saleCents - costCents;
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: saleCents > 0 ? 'success' : 'normal',
          cells: {
            soldDate: a.soldDateIso ? formatReadableDate(a.soldDateIso) : 'Unset',
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
            salePrice: saleCents > 0 ? formatCurrencyCents(saleCents, currencyCode) : '—',
            purchaseCost: costCents > 0 ? formatCurrencyCents(costCents, currencyCode) : '—',
            netMargin:
              saleCents > 0 || costCents > 0
                ? formatCurrencyCents(netCents, currencyCode)
                : '—',
            buyer: a.buyerName || '—',
            weight: formatWeight(a.weightGrams, weightUnit),
          },
        };
      });

      const avgPriceCents = pricedCount > 0 ? Math.round(grossCents / pricedCount) : 0;

      return {
        columns: [
          { key: 'soldDate', label: 'Sold Date' },
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'salePrice', label: 'Sale Price', align: 'right' },
          { key: 'purchaseCost', label: 'Acquisition Cost', align: 'right' },
          { key: 'netMargin', label: 'Net Margin', align: 'right' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'weight', label: 'Weight', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: `${speciesProfile.name} Sold`, value: String(rows.length) },
          { label: 'Total Gross Sales', value: formatCurrencyCents(grossCents, currencyCode), tone: grossCents > 0 ? 'positive' : 'neutral' },
          { label: 'Average Sale Price', value: pricedCount > 0 ? formatCurrencyCents(avgPriceCents, currencyCode) : 'N/A' },
        ],
      };
    }

    // 15. Non-Adults (Male & Female) Report
    case 'non-adult-report': {
      const nonAdults = speciesAnimals
        .filter(
          (a) =>
            isAnimalActive(a) &&
            isAnimalNonAdult(a, speciesProfile, referenceDateIso) &&
            matchesFilter(a)
        )
        .sort((a, b) => (b.birthDateIso || '').localeCompare(a.birthDateIso || ''));

      let maleCount = 0;
      let femaleCount = 0;
      const weanCutoff = speciesProfile.weanDaysAfterBirth || 42;

      const rows: ReportRow[] = nonAdults.map((a) => {
        if (a.sex === 'Male') maleCount += 1;
        else if (a.sex === 'Female') femaleCount += 1;

        const ageDays = diffDaysIso(a.birthDateIso, referenceDateIso);
        const weanStatus =
          ageDays === null
            ? a.status === 'Junior'
              ? 'Junior'
              : 'Unknown'
            : ageDays >= weanCutoff
            ? `Weaned / Weaning Ready (>= ${weanCutoff}d)`
            : `Nursing (${weanCutoff - ageDays}d to wean)`;

        return {
          id: a.id,
          animalId: a.id,
          cells: {
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            dob: formatReadableDate(a.birthDateIso),
            ageDays: ageDays !== null ? String(ageDays) : '—',
            weanStatus,
            weight: formatWeight(a.weightGrams, weightUnit),
            housing: a.cageLocation || 'Unassigned',
            sire: formatAnimalRef(animalById.get(a.sireId)),
            dam: formatAnimalRef(animalById.get(a.damId)),
            status: a.status,
          },
        };
      });

      return {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'dob', label: 'DOB' },
          { key: 'ageDays', label: 'Age (Days)', align: 'right' },
          { key: 'weanStatus', label: 'Weaning Status' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'housing', label: 'Housing' },
          { key: 'sire', label: 'Sire' },
          { key: 'dam', label: 'Dam' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Non-Adults', value: String(rows.length) },
          { label: 'Males / Females', value: `${maleCount} / ${femaleCount}` },
          { label: 'Wean Window', value: `${weanCutoff} d` },
        ],
      };
    }

    // 16. Male Report
    case 'male-report': {
      const males = speciesAnimals
        .filter(
          (a) =>
            a.sex === 'Male' &&
            a.status !== 'Sold' &&
            a.status !== 'Deceased' &&
            matchesFilter(a)
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let activeOwned = 0;
      let totalLegs = 0;
      let gcOrEligibleCount = 0;
      let totalShowPoints = 0;

      const rows: ReportRow[] = males.map((m) => {
        if (isAnimalActive(m) && normalizeOwnershipType(m.ownershipType, 'Owned') === 'Owned') {
          activeOwned += 1;
        }
        const showSummary = computeAnimalShowSummary(m, ctx.speciesShows, speciesCareLogs);
        totalLegs += showSummary.effectiveLegs;
        totalShowPoints += showSummary.totalPoints;
        if (showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible) {
          gcOrEligibleCount += 1;
        }
        const siredBreedings = speciesBreedings.filter((b) => b.sireId === m.id);
        const siredOffspring = siredBreedings.reduce((sum, b) => sum + (b.liveCount || 0), 0);

        return {
          id: m.id,
          animalId: m.id,
          highlightTone:
            showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible
              ? 'success'
              : 'normal',
          cells: {
            idTag: m.tattoo || 'Unmarked',
            name: m.name,
            stage: formatStageLabel(m, speciesProfile, referenceDateIso),
            ownership: normalizeOwnershipType(m.ownershipType, 'Owned'),
            breedVariety: [m.breed, m.variety].filter(Boolean).join(' · ') || '—',
            weight: formatWeight(m.weightGrams, weightUnit),
            breedings: siredBreedings.length,
            liveOffspring: siredOffspring,
            legs: showSummary.effectiveLegs,
            showWins: showSummary.awardsSummaryText || '—',
            showPoints: showSummary.totalPoints > 0 ? showSummary.totalPoints : 0,
            gcProgress: showSummary.gcProgress.shortLabel,
            regNo: m.registrationNumber || '—',
            gcNo: m.grandChampionNumber || '—',
            status: m.status,
          },
        };
      });

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'breedings', label: 'Breedings', align: 'right' },
          { key: 'liveOffspring', label: `Live ${offspringPlural}`, align: 'right' },
          { key: 'legs', label: 'Show Legs', align: 'right' },
          { key: 'showWins', label: 'Show Wins' },
          { key: 'showPoints', label: 'Points', align: 'right' },
          { key: 'gcProgress', label: 'GC Progress' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: `Total ${speciesProfile.name} Males`, value: String(rows.length) },
          { label: 'Active Owned Males', value: String(activeOwned) },
          { label: 'Combined Show Legs', value: String(totalLegs) },
          {
            label: 'GC / Eligible Males',
            value: String(gcOrEligibleCount),
            tone: gcOrEligibleCount > 0 ? 'positive' : 'neutral',
          },
          ...(totalShowPoints > 0
            ? [{ label: 'Total Show Points', value: String(Math.round(totalShowPoints * 100) / 100) }]
            : []),
        ],
      };
    }

    // 17. Female Report
    case 'female-report': {
      const females = speciesAnimals
        .filter(
          (a) =>
            a.sex === 'Female' &&
            a.status !== 'Sold' &&
            a.status !== 'Deceased' &&
            matchesFilter(a)
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let activeOwned = 0;
      let totalWeaned = 0;
      let totalLegs = 0;
      let gcOrEligibleCount = 0;

      const rows: ReportRow[] = females.map((f) => {
        if (isAnimalActive(f) && normalizeOwnershipType(f.ownershipType, 'Owned') === 'Owned') {
          activeOwned += 1;
        }
        const showSummary = computeAnimalShowSummary(f, ctx.speciesShows, speciesCareLogs);
        totalLegs += showSummary.effectiveLegs;
        if (showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible) {
          gcOrEligibleCount += 1;
        }
        const damBreedings = speciesBreedings.filter((b) => b.damId === f.id);
        const birthCount = damBreedings.filter(
          (b) => b.status === 'Born' || b.status === 'Weaned'
        ).length;
        const liveOffspring = damBreedings.reduce((sum, b) => sum + (b.liveCount || 0), 0);
        const weanedOffspring = damBreedings.reduce((sum, b) => sum + (b.weanedCount || 0), 0);
        totalWeaned += weanedOffspring;

        return {
          id: f.id,
          animalId: f.id,
          highlightTone:
            showSummary.gcProgress.isGrandChampion || showSummary.gcProgress.isEligible
              ? 'success'
              : 'normal',
          cells: {
            idTag: f.tattoo || 'Unmarked',
            name: f.name,
            stage: formatStageLabel(f, speciesProfile, referenceDateIso),
            ownership: normalizeOwnershipType(f.ownershipType, 'Owned'),
            breedVariety: [f.breed, f.variety].filter(Boolean).join(' · ') || '—',
            weight: formatWeight(f.weightGrams, weightUnit),
            breedings: damBreedings.length,
            births: birthCount,
            liveOffspring,
            weaned: weanedOffspring,
            legs: showSummary.effectiveLegs,
            showWins: showSummary.awardsSummaryText || '—',
            showPoints: showSummary.totalPoints > 0 ? showSummary.totalPoints : 0,
            gcProgress: showSummary.gcProgress.shortLabel,
            regNo: f.registrationNumber || '—',
            gcNo: f.grandChampionNumber || '—',
            status: f.status,
          },
        };
      });

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'stage', label: 'Stage' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'breedings', label: 'Breedings', align: 'right' },
          { key: 'births', label: `${birthLabel}s`, align: 'right' },
          { key: 'liveOffspring', label: `Live ${offspringPlural}`, align: 'right' },
          { key: 'weaned', label: 'Weaned', align: 'right' },
          { key: 'legs', label: 'Show Legs', align: 'right' },
          { key: 'showWins', label: 'Show Wins' },
          { key: 'showPoints', label: 'Points', align: 'right' },
          { key: 'gcProgress', label: 'GC Progress' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: `Total ${speciesProfile.name} Females`, value: String(rows.length) },
          { label: 'Active Owned Females', value: String(activeOwned) },
          { label: `Total ${offspringPlural} Weaned`, value: String(totalWeaned) },
          { label: 'Combined Show Legs', value: String(totalLegs) },
          {
            label: 'GC / Eligible Females',
            value: String(gcOrEligibleCount),
            tone: gcOrEligibleCount > 0 ? 'positive' : 'neutral',
          },
        ],
      };
    }

    // 18. Cull Decision Report
    case 'cull-report': {
      const flagged = speciesAnimals
        .filter((a) => {
          const isCull =
            Boolean(a.culled) ||
            Boolean(a.cullDateIso?.trim()) ||
            Boolean(a.cullReason?.trim());
          if (!isCull || !matchesFilter(a)) return false;
          return isIsoWithinRange(
            a.cullDateIso || a.updatedAt.slice(0, 10),
            dateFromIso,
            dateToIso
          );
        })
        .sort((a, b) =>
          (b.cullDateIso || b.updatedAt).localeCompare(a.cullDateIso || a.updatedAt)
        );

      const pendingCount = flagged.filter((a) => isAnimalActive(a)).length;

      const rows: ReportRow[] = flagged.map((a) => {
        const stillActive = isAnimalActive(a);
        return {
          id: a.id,
          animalId: a.id,
          highlightTone: stillActive ? 'warning' : 'normal',
          cells: {
            cullDate: a.cullDateIso ? formatReadableDate(a.cullDateIso) : 'Unset',
            name: a.name,
            idTag: a.tattoo || 'Unmarked',
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            disposition: stillActive ? `Pending (${a.status})` : `Removed (${a.status})`,
            reason: a.cullReason || 'No reason noted',
            housing: a.cageLocation || 'Unassigned',
            weight: formatWeight(a.weightGrams, weightUnit),
          },
        };
      });

      return {
        columns: [
          { key: 'cullDate', label: 'Flag Date' },
          { key: 'name', label: 'Name' },
          { key: 'idTag', label: idShortLabel },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'disposition', label: 'Disposition' },
          { key: 'reason', label: 'Cull Reason' },
          { key: 'housing', label: 'Housing' },
          { key: 'weight', label: 'Weight', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Total Flagged', value: String(rows.length) },
          {
            label: 'Still Active / Pending',
            value: String(pendingCount),
            tone: pendingCount > 0 ? 'warning' : 'neutral',
          },
        ],
      };
    }

    // 19. ID Cross-Reference Report
    case 'id-mark-crossref-report': {
      const sorted = speciesAnimals
        .filter((a) => matchesFilter(a))
        .sort((a, b) => {
          const tA = (a.tattoo || '').trim() || 'zzz';
          const tB = (b.tattoo || '').trim() || 'zzz';
          const tCmp = tA.localeCompare(tB);
          if (tCmp !== 0) return tCmp;
          return (a.name || '').localeCompare(b.name || '');
        });

      const regCount = sorted.filter((a) => Boolean(a.registrationNumber?.trim())).length;

      const rows: ReportRow[] = sorted.map((a) => ({
        id: a.id,
        animalId: a.id,
        cells: {
          primaryId: a.tattoo || 'Unmarked',
          regNo: a.registrationNumber || '—',
          gcNo: a.grandChampionNumber || '—',
          name: a.name,
          sex: formatSexForSpecies(a.sex, speciesProfile),
          breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
          dob: formatReadableDate(a.birthDateIso),
          ownership: normalizeOwnershipType(a.ownershipType, 'Owned'),
          status: a.status,
          housing: a.cageLocation || 'Unassigned',
        },
      }));

      return {
        columns: [
          { key: 'primaryId', label: idShortLabel },
          { key: 'regNo', label: 'Reg #' },
          { key: 'gcNo', label: 'GC #' },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'ownership', label: 'Ownership' },
          { key: 'status', label: 'Status' },
          { key: 'housing', label: 'Housing' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Cross-Referenced Records', value: String(rows.length) },
          { label: 'With Registration #', value: String(regCount) },
        ],
      };
    }

    // 20. Breed With Compatibility Report
    case 'breed-with-report': {
      const eligible = speciesAnimals.filter((a) => isAnimalActive(a) && !a.culled);
      const subject = subjectAnimalId ? animalById.get(subjectAnimalId) : undefined;

      let candidateSires = eligible.filter((a) => a.sex === 'Male');
      let candidateDams = eligible.filter((a) => a.sex === 'Female');

      if (subject) {
        if (subject.sex === 'Male') {
          candidateSires = [subject];
        } else if (subject.sex === 'Female') {
          candidateDams = [subject];
        }
      }

      if (filter === 'Male' || filter === 'Non-Adult Male') {
        candidateSires = candidateSires.filter((s) => matchesFilter(s));
      } else if (filter === 'Female' || filter === 'Non-Adult Female') {
        candidateDams = candidateDams.filter((d) => matchesFilter(d));
      }

      interface PairEval {
        id: string;
        sire: Animal;
        dam: Animal;
        coiPercent: number;
        riskLabel: string;
        carrierWarnings: string;
        dangerCount: number;
        warningCount: number;
        sameBreed: boolean;
      }

      const coiEvaluator = createSpeciesCoiEvaluator(herdMap);
      const sireCarrierCache = new Map<string, AnimalCarrierLineageAnalysis>();
      for (const s of candidateSires) {
        sireCarrierCache.set(s.id, analyzeAnimalCarrierLineage(s, herdMap));
      }
      const damCarrierCache = new Map<string, AnimalCarrierLineageAnalysis>();
      for (const d of candidateDams) {
        damCarrierCache.set(
          d.id,
          sireCarrierCache.get(d.id) ?? analyzeAnimalCarrierLineage(d, herdMap)
        );
      }

      const pairs: PairEval[] = [];
      for (const sire of candidateSires) {
        const sireAnalysis = sireCarrierCache.get(sire.id)!;
        for (const dam of candidateDams) {
          if (sire.id === dam.id) continue;
          const coi = coiEvaluator.calculatePairingCoi(sire.id, dam.id);
          const damAnalysis = damCarrierCache.get(dam.id)!;
          const risks = analyzePairingCarrierRisksFromAnalyses(sireAnalysis, damAnalysis);
          const dangerCount = risks.filter((r) => r.severity === 'danger').length;
          const warningCount = risks.filter((r) => r.severity === 'warning').length;
          const carrierText =
            risks.length > 0
              ? risks
                  .slice(0, 3)
                  .map((r) => `${r.trait} (${r.severity.toUpperCase()})`)
                  .join('; ') + (risks.length > 3 ? ` +${risks.length - 3}` : '')
              : 'None detected';
          pairs.push({
            id: `${sire.id}__${dam.id}`,
            sire,
            dam,
            coiPercent: coi.coiPercent,
            riskLabel: coi.risk.label,
            carrierWarnings: carrierText,
            dangerCount,
            warningCount,
            sameBreed:
              Boolean(sire.breed && dam.breed) &&
              sire.breed.trim().toLowerCase() === dam.breed.trim().toLowerCase(),
          });
        }
      }

      pairs.sort((a, b) => {
        if (a.dangerCount !== b.dangerCount) return a.dangerCount - b.dangerCount;
        if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) return a.coiPercent - b.coiPercent;
        if (a.warningCount !== b.warningCount) return a.warningCount - b.warningCount;
        return a.sire.name.localeCompare(b.sire.name) || a.dam.name.localeCompare(b.dam.name);
      });

      const capped = pairs.slice(0, 100);
      const lowCoiCount = pairs.filter((p) => p.coiPercent < 6.25 && p.dangerCount === 0).length;

      const rows: ReportRow[] = capped.map((p) => ({
        id: p.id,
        animalId: p.dam.id,
        highlightTone:
          p.dangerCount > 0 || p.coiPercent >= 25
            ? 'danger'
            : p.warningCount > 0 || p.coiPercent >= 12.5
            ? 'warning'
            : 'success',
        cells: {
          sire: p.sire.name,
          sireId: p.sire.tattoo || 'Unmarked',
          dam: p.dam.name,
          damId: p.dam.tattoo || 'Unmarked',
          coi: `${p.coiPercent.toFixed(2)}%`,
          riskTier: p.riskLabel,
          carriers: p.carrierWarnings,
          breedMatch: p.sameBreed
            ? `${p.sire.breed} (Matched)`
            : `${p.sire.breed || '—'} × ${p.dam.breed || '—'}`,
        },
      }));

      return {
        columns: [
          { key: 'sire', label: 'Male' },
          { key: 'sireId', label: `Male ${idShortLabel}` },
          { key: 'dam', label: 'Female' },
          { key: 'damId', label: `Female ${idShortLabel}` },
          { key: 'coi', label: 'Projected COI', align: 'right' },
          { key: 'riskTier', label: 'COI Tier' },
          { key: 'carriers', label: 'Shared Carrier Alerts' },
          { key: 'breedMatch', label: 'Breed Compatibility' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Pairings Evaluated', value: String(pairs.length) },
          { label: 'Low COI & Clear (<6.25%)', value: String(lowCoiCount), tone: 'positive' },
        ],
      };
    }

    // 21. My Owned Stock Report
    case 'my-owned-stock-report': {
      const owned = speciesAnimals
        .filter(
          (a) =>
            normalizeOwnershipType(a.ownershipType, 'Owned') === 'Owned' &&
            a.status !== 'Sold' &&
            a.status !== 'Deceased' &&
            matchesFilter(a)
        )
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      let totalPurchaseCents = 0;

      const rows: ReportRow[] = owned.map((a) => {
        const costCents = a.purchaseCostCents || 0;
        totalPurchaseCents += costCents;
        return {
          id: a.id,
          animalId: a.id,
          cells: {
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            stage: formatStageLabel(a, speciesProfile, referenceDateIso),
            breed: a.breed || '—',
            variety: a.variety || '—',
            dob: formatReadableDate(a.birthDateIso),
            weight: formatWeight(a.weightGrams, weightUnit),
            housing: a.cageLocation || 'Unassigned',
            purchaseCost: costCents > 0 ? formatCurrencyCents(costCents, currencyCode) : '—',
            regNo: a.registrationNumber || '—',
            status: a.status,
          },
        };
      });

      const showEligibleCount = spShows.length;
      const summaryMetrics: ReportSummaryMetric[] = [
        { label: `Owned ${speciesProfile.name}`, value: String(rows.length) },
        {
          label: 'Recorded Acquisition Cost',
          value: formatCurrencyCents(totalPurchaseCents, currencyCode),
        },
      ];
      if (showEligibleCount > 0) {
        summaryMetrics.push({ label: 'Shows Recorded', value: String(showEligibleCount) });
      }

      return {
        columns: [
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'stage', label: 'Stage' },
          { key: 'breed', label: 'Breed' },
          { key: 'variety', label: 'Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'weight', label: 'Weight', align: 'right' },
          { key: 'housing', label: 'Housing' },
          { key: 'purchaseCost', label: 'Acquisition Cost', align: 'right' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics,
      };
    }

    // 22. Outside / Reference Stock Report
    case 'outside-reference-stock-report': {
      const outside = speciesAnimals
        .filter((a) => {
          const own = normalizeOwnershipType(a.ownershipType, 'Owned');
          return own !== 'Owned' && matchesFilter(a);
        })
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const outsideCount = outside.filter(
        (a) => normalizeOwnershipType(a.ownershipType, 'Owned') === 'Outside'
      ).length;
      const refCount = outside.length - outsideCount;

      const coiEvaluator = createSpeciesCoiEvaluator(herdMap);
      const rows: ReportRow[] = outside.map((a) => {
        const own = normalizeOwnershipType(a.ownershipType, 'Owned');
        const coi = coiEvaluator.calculateAnimalCoi(a);
        return {
          id: a.id,
          animalId: a.id,
          cells: {
            ownership: own,
            idTag: a.tattoo || 'Unmarked',
            name: a.name,
            sex: formatSexForSpecies(a.sex, speciesProfile),
            breedVariety: [a.breed, a.variety].filter(Boolean).join(' · ') || '—',
            dob: formatReadableDate(a.birthDateIso),
            ownerName: a.ownerName || '—',
            breederName: a.breederName || '—',
            regNo: a.registrationNumber || '—',
            coi: `${coi.coiPercent.toFixed(2)}%`,
            status: a.status,
          },
        };
      });

      return {
        columns: [
          { key: 'ownership', label: 'Type' },
          { key: 'idTag', label: idShortLabel },
          { key: 'name', label: 'Name' },
          { key: 'sex', label: 'Sex' },
          { key: 'breedVariety', label: 'Breed & Variety' },
          { key: 'dob', label: 'DOB' },
          { key: 'ownerName', label: 'Owner' },
          { key: 'breederName', label: 'Breeder' },
          { key: 'regNo', label: 'Reg #' },
          { key: 'coi', label: 'COI %', align: 'right' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Outside / Reference Total', value: String(rows.length) },
          { label: 'Outside Stock / Reference', value: `${outsideCount} / ${refCount}` },
        ],
      };
    }

    // 23. Barn Economics & P&L Margin Report
    case 'barn-economics-report': {
      const speciesLedger = (ctx.snapshot.ledgerEntries ?? []).filter((e) =>
        isSameSpecies(e.species, speciesProfile.name)
      );
      const speciesFeedBatches = (ctx.snapshot.feedBatches ?? []).filter((fb) =>
        isSameSpecies(fb.species, speciesProfile.name)
      );
      const speciesFeedAllocations = (ctx.snapshot.feedAllocations ?? []).filter((fa) =>
        isSameSpecies(fa.species, speciesProfile.name)
      );
      const speciesProcessing = (ctx.snapshot.processingLogs ?? []).filter((pl) =>
        isSameSpecies(pl.species, speciesProfile.name)
      );

      const econSummary = evaluateSpeciesEconomicsSummary({
        animals: speciesAnimals,
        breedings: speciesBreedings,
        ledgerEntries: speciesLedger,
        feedBatches: speciesFeedBatches,
        processingLogs: speciesProcessing,
        currencyCode,
        dateFromIso,
        dateToIso,
      });

      const filteredLedger = speciesLedger
        .filter((e) => {
          if (!isIsoWithinRange(e.dateIso, dateFromIso, dateToIso)) return false;
          if (e.linkedAnimalId) {
            return matchesFilter(animalById.get(e.linkedAnimalId));
          }
          return filter === 'All';
        })
        .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

      const rows: ReportRow[] = filteredLedger.map((e) => {
        const linkedAnimal = e.linkedAnimalId ? animalById.get(e.linkedAnimalId) : undefined;
        return {
          id: e.id,
          animalId: linkedAnimal?.id,
          highlightTone: e.entryType === 'income' ? 'success' : 'normal',
          cells: {
            date: formatReadableDate(e.dateIso),
            type: e.entryType === 'income' ? 'Income' : 'Expense',
            category: getLedgerCategoryLabel(e.category),
            title: e.title,
            party: e.vendorOrParty || '—',
            linkedAnimal: linkedAnimal ? formatAnimalRef(linkedAnimal) : '—',
            receipt: e.receiptPhotoDataUrl || e.receiptPhotoThumbnailDataUrl ? 'Yes' : 'No',
            amount: formatCurrencyCents(e.amountCents, currencyCode),
          },
        };
      });

      // Also append computed animal P&L highlights when no manual ledger entries matched
      const animalMargins = computeAnimalProfitMargins({
        animals: speciesAnimals.filter((a) => matchesFilter(a)),
        breedings: speciesBreedings,
        ledgerEntries: speciesLedger,
        feedBatches: speciesFeedBatches,
        feedAllocations: speciesFeedAllocations,
        processingLogs: speciesProcessing,
        dateFromIso,
        dateToIso,
      });

      return {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'type', label: 'Type' },
          { key: 'category', label: 'Category' },
          { key: 'title', label: 'Description' },
          { key: 'party', label: 'Vendor / Party' },
          { key: 'linkedAnimal', label: 'Linked Animal' },
          { key: 'receipt', label: 'Receipt' },
          { key: 'amount', label: 'Amount', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          {
            label: 'Gross Revenue',
            value: formatCurrencyCents(econSummary.totalRevenueCents, currencyCode),
            tone: econSummary.totalRevenueCents > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'Total Expenses',
            value: formatCurrencyCents(econSummary.totalExpenseCents, currencyCode),
          },
          {
            label: 'Net Profit / Loss',
            value: formatCurrencyCents(econSummary.netProfitCents, currencyCode),
            tone: econSummary.netProfitCents >= 0 ? 'positive' : 'danger',
          },
          {
            label: 'Profit Margin',
            value:
              econSummary.marginPercent !== null
                ? `${econSummary.marginPercent.toFixed(1)}%`
                : 'N/A',
          },
          {
            label: 'Animals with P&L',
            value: String(animalMargins.length),
          },
        ],
      };
    }

    // 24. Meat & Pelt Processing Yield Report
    case 'meat-pelt-yield-report': {
      const speciesProcessing = (ctx.snapshot.processingLogs ?? [])
        .filter((pl) => {
          if (!isSameSpecies(pl.species, speciesProfile.name)) return false;
          const dateVal = pl.harvestDateIso || pl.scheduledDateIso;
          if (!isIsoWithinRange(dateVal, dateFromIso, dateToIso)) return false;
          if (pl.linkedAnimalId) {
            return matchesFilter(animalById.get(pl.linkedAnimalId));
          }
          return filter === 'All';
        })
        .sort((a, b) =>
          (b.harvestDateIso || b.scheduledDateIso || '').localeCompare(
            a.harvestDateIso || a.scheduledDateIso || ''
          )
        );

      const procSummary = evaluateProcessingSummary(speciesProcessing, referenceDateIso);

      const rows: ReportRow[] = speciesProcessing.map((pl) => {
        const linkedAnimal = pl.linkedAnimalId ? animalById.get(pl.linkedAnimalId) : undefined;
        const pct =
          pl.dressOutPercent ?? calculateDressOutPercent(pl.liveWeightGrams, pl.dressedWeightGrams);
        const totalValueCents = (pl.meatValueCents || 0) + (pl.peltValueCents || 0);
        return {
          id: pl.id,
          animalId: linkedAnimal?.id,
          highlightTone:
            pl.status === 'Scheduled' && pl.scheduledDateIso && pl.scheduledDateIso < referenceDateIso
              ? 'warning'
              : pl.status === 'Processed'
              ? 'success'
              : 'normal',
          cells: {
            title: pl.title,
            status: pl.status,
            date: formatReadableDate(pl.harvestDateIso || pl.scheduledDateIso),
            headCount: pl.animalCount,
            liveWeight: pl.liveWeightGrams > 0 ? formatWeight(pl.liveWeightGrams, weightUnit) : '—',
            dressedWeight:
              pl.dressedWeightGrams > 0 ? formatWeight(pl.dressedWeightGrams, weightUnit) : '—',
            dressOut: pct !== undefined ? `${pct.toFixed(1)}%` : '—',
            pelts:
              pl.peltCount > 0 || pl.peltGrade
                ? `${pl.peltCount} (${pl.peltGrade || 'Unspecified'})`
                : '—',
            value: totalValueCents > 0 ? formatCurrencyCents(totalValueCents, currencyCode) : '—',
            cost: pl.processingCostCents
              ? formatCurrencyCents(pl.processingCostCents, currencyCode)
              : '—',
          },
        };
      });

      return {
        columns: [
          { key: 'title', label: 'Batch / Animal' },
          { key: 'status', label: 'Status' },
          { key: 'date', label: 'Harvest / Scheduled' },
          { key: 'headCount', label: 'Count', align: 'right' },
          { key: 'liveWeight', label: 'Live Weight', align: 'right' },
          { key: 'dressedWeight', label: 'Dressed Weight', align: 'right' },
          { key: 'dressOut', label: 'Dress-Out %', align: 'right' },
          { key: 'pelts', label: 'Pelts & Grade' },
          { key: 'value', label: 'Meat + Pelt Value', align: 'right' },
          { key: 'cost', label: 'Processing Cost', align: 'right' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Animals Processed', value: String(procSummary.totalAnimalsProcessed) },
          {
            label: 'Scheduled Harvests',
            value: String(procSummary.scheduledCount),
            tone: procSummary.overdueScheduledLogs.length > 0 ? 'warning' : 'neutral',
          },
          {
            label: 'Avg Dress-Out %',
            value:
              procSummary.averageDressOutPercent !== null
                ? `${procSummary.averageDressOutPercent.toFixed(1)}%`
                : 'N/A',
            tone: procSummary.averageDressOutPercent !== null ? 'positive' : 'neutral',
          },
          { label: 'Pelts Logged', value: String(procSummary.totalPelts) },
          {
            label: 'Meat & Pelt Value',
            value: formatCurrencyCents(
              procSummary.totalMeatValueCents + procSummary.totalPeltValueCents,
              currencyCode
            ),
          },
        ],
      };
    }

    // 25. 4-H / FFA Youth Project Books Report
    case 'youth-project-report': {
      const speciesLedger = (ctx.snapshot.ledgerEntries ?? []).filter((e) =>
        isSameSpecies(e.species, speciesProfile.name)
      );
      const speciesProjects = (ctx.snapshot.youthProjectBooks ?? [])
        .filter((yp) => {
          if (!isSameSpecies(yp.species, speciesProfile.name)) return false;
          if (!isIsoWithinRange(yp.startDateIso, dateFromIso, dateToIso)) return false;
          if (filter !== 'All' && (yp.linkedAnimalIds ?? []).length > 0) {
            return yp.linkedAnimalIds.some((id) => matchesFilter(animalById.get(id)));
          }
          return true;
        })
        .sort((a, b) => (b.projectYear || '').localeCompare(a.projectYear || ''));

      let totalIncomeCents = 0;
      let totalExpenseCents = 0;
      let totalNetCents = 0;

      const rows: ReportRow[] = speciesProjects.map((yp) => {
        const sum = evaluateYouthProjectSummary(yp, {
          animals: speciesAnimals,
          breedings: speciesBreedings,
          ledgerEntries: speciesLedger,
        });
        totalIncomeCents += sum.totalIncomeCents;
        totalExpenseCents += sum.totalExpenseCents;
        totalNetCents += sum.netProjectProfitCents;
        return {
          id: yp.id,
          animalId: sum.enrolledAnimals[0]?.id,
          highlightTone:
            yp.status === 'Completed'
              ? sum.netProjectProfitCents >= 0
                ? 'success'
                : 'warning'
              : 'normal',
          cells: {
            org: yp.organization,
            year: yp.projectYear,
            title: yp.projectTitle,
            member: yp.memberName || '—',
            club: yp.clubOrChapter || '—',
            animals: sum.enrolledAnimals.length,
            feedCost: formatCurrencyCents(sum.totalFeedLogCostCents, currencyCode),
            income: formatCurrencyCents(sum.totalIncomeCents, currencyCode),
            expense: formatCurrencyCents(sum.totalExpenseCents, currencyCode),
            netReturn: formatCurrencyCents(sum.netProjectProfitCents, currencyCode),
            status: yp.status,
          },
        };
      });

      return {
        columns: [
          { key: 'org', label: 'Org' },
          { key: 'year', label: 'Year' },
          { key: 'title', label: 'Project Title' },
          { key: 'member', label: 'Youth Member' },
          { key: 'club', label: 'Club / Chapter' },
          { key: 'animals', label: 'Animals', align: 'right' },
          { key: 'feedCost', label: 'Feed Log Cost', align: 'right' },
          { key: 'income', label: 'Total Income', align: 'right' },
          { key: 'expense', label: 'Total Expense', align: 'right' },
          { key: 'netReturn', label: 'Net Return', align: 'right' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Project Books', value: String(rows.length) },
          {
            label: 'Total Project Income',
            value: formatCurrencyCents(totalIncomeCents, currencyCode),
            tone: totalIncomeCents > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'Total Project Expenses',
            value: formatCurrencyCents(totalExpenseCents, currencyCode),
          },
          {
            label: 'Combined Net Return',
            value: formatCurrencyCents(totalNetCents, currencyCode),
            tone: totalNetCents >= 0 ? 'positive' : 'danger',
          },
        ],
      };
    }

    // 26. CRM Buyer Waitlist Queue Report
    case 'crm-waitlist-report': {
      const speciesClients = (ctx.snapshot.clientContacts ?? []).filter((cc) =>
        isSameSpecies(cc.species, speciesProfile.name)
      );
      const clientMap = new Map(speciesClients.map((c) => [c.id, c]));
      const speciesWaitlist = (ctx.snapshot.waitlistEntries ?? [])
        .filter((wl) => {
          if (!isSameSpecies(wl.species, speciesProfile.name)) return false;
          if (!isIsoWithinRange(wl.inquiryDateIso, dateFromIso, dateToIso)) return false;
          return true;
        })
        .sort(
          (a, b) =>
            (a.priorityRank || 9999) - (b.priorityRank || 9999) ||
            a.inquiryDateIso.localeCompare(b.inquiryDateIso)
        );

      const activeCount = speciesWaitlist.filter(
        (w) => w.status === 'Active' || w.status === 'Matched'
      ).length;
      const overdueFollowUps = speciesWaitlist.filter(
        (w) =>
          (w.status === 'Active' || w.status === 'Matched') &&
          Boolean(w.followUpDateIso) &&
          w.followUpDateIso < referenceDateIso
      ).length;

      const rows: ReportRow[] = speciesWaitlist.map((w) => {
        const client = clientMap.get(w.clientId);
        const contactInfo = client
          ? `${formatPreferredContactLabel(client.preferredContact)}: ${client.phone || client.email || '—'}`
          : '—';
        return {
          id: w.id,
          highlightTone:
            (w.status === 'Active' || w.status === 'Matched') &&
            Boolean(w.followUpDateIso) &&
            w.followUpDateIso < referenceDateIso
              ? 'warning'
              : w.status === 'Deposited' || w.status === 'Fulfilled'
                ? 'success'
                : 'normal',
          cells: {
            rank: `#${w.priorityRank || 1}`,
            buyer: client?.fullName || w.clientName || 'Buyer',
            status: w.status,
            intent: w.intent,
            preferences:
              [w.desiredBreed, w.desiredVariety, w.preferredSex !== 'Any' ? w.preferredSex : '']
                .filter(Boolean)
                .join(' · ') || 'Any',
            inquiryDate: formatReadableDate(w.inquiryDateIso),
            followUp: w.followUpDateIso ? formatReadableDate(w.followUpDateIso) : '—',
            budget:
              w.maxBudgetCents && w.maxBudgetCents > 0
                ? formatCurrencyCents(w.maxBudgetCents, currencyCode)
                : '—',
            contact: contactInfo,
          },
        };
      });

      return {
        columns: [
          { key: 'rank', label: 'Rank', align: 'right' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'status', label: 'Status' },
          { key: 'intent', label: 'Intent' },
          { key: 'preferences', label: 'Desired Stock' },
          { key: 'inquiryDate', label: 'Inquiry Date' },
          { key: 'followUp', label: 'Follow-Up' },
          { key: 'budget', label: 'Max Budget', align: 'right' },
          { key: 'contact', label: 'Contact' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Waitlist Entries', value: String(rows.length) },
          { label: 'Active / Matched', value: String(activeCount), tone: activeCount > 0 ? 'positive' : 'neutral' },
          {
            label: 'Overdue Follow-Ups',
            value: String(overdueFollowUps),
            tone: overdueFollowUps > 0 ? 'danger' : 'neutral',
          },
        ],
      };
    }

    // 27. CRM Reservations & Deposit Tracking Report
    case 'crm-reservations-deposits-report': {
      const speciesReservations = (ctx.snapshot.animalReservations ?? [])
        .filter((ar) => {
          if (!isSameSpecies(ar.species, speciesProfile.name)) return false;
          if (!isIsoWithinRange(ar.reservedDateIso, dateFromIso, dateToIso)) return false;
          if (filter !== 'All' && ar.animalId) {
            return matchesFilter(animalById.get(ar.animalId));
          }
          return true;
        })
        .sort((a, b) => (b.reservedDateIso || '').localeCompare(a.reservedDateIso || ''));

      let totalAgreedCents = 0;
      let totalPaidCents = 0;
      let totalRemainingCents = 0;
      let overdueDepositsCount = 0;

      const rows: ReportRow[] = speciesReservations.map((r) => {
        const fin = evaluateReservationFinancials(r);
        if (r.status !== 'Cancelled') {
          totalAgreedCents += fin.totalPriceCents;
          totalPaidCents += fin.depositPaidCents;
          if (r.status !== 'Picked Up / Completed') {
            totalRemainingCents += fin.balanceRemainingCents;
          }
        }
        const depositOverdue =
          r.status !== 'Cancelled' &&
          r.status !== 'Picked Up / Completed' &&
          fin.depositRemainingCents > 0 &&
          Boolean(r.depositDueDateIso) &&
          r.depositDueDateIso < referenceDateIso;
        if (depositOverdue) overdueDepositsCount += 1;
        return {
          id: r.id,
          animalId: r.animalId,
          highlightTone: depositOverdue
            ? 'danger'
            : r.status === 'Picked Up / Completed' || fin.isPaidInFull
              ? 'success'
              : 'normal',
          cells: {
            agreement: r.agreementNumber || '—',
            buyer: r.clientName || 'Buyer',
            item: r.itemLabel || 'Reserved Stock',
            status: r.status,
            reservedDate: formatReadableDate(r.reservedDateIso),
            totalPrice: formatCurrencyCents(fin.totalPriceCents, currencyCode),
            depositReq: formatCurrencyCents(fin.depositRequiredCents, currencyCode),
            paid: formatCurrencyCents(fin.depositPaidCents, currencyCode),
            balanceDue: formatCurrencyCents(fin.balanceRemainingCents, currencyCode),
            pickupDate: r.pickupScheduledDateIso ? formatReadableDate(r.pickupScheduledDateIso) : '—',
          },
        };
      });

      return {
        columns: [
          { key: 'agreement', label: 'Agreement #' },
          { key: 'buyer', label: 'Buyer' },
          { key: 'item', label: 'Animal / Pick' },
          { key: 'status', label: 'Status' },
          { key: 'reservedDate', label: 'Reserved' },
          { key: 'totalPrice', label: 'Price', align: 'right' },
          { key: 'depositReq', label: 'Deposit Req', align: 'right' },
          { key: 'paid', label: 'Paid', align: 'right' },
          { key: 'balanceDue', label: 'Balance Due', align: 'right' },
          { key: 'pickupDate', label: 'Pickup Date' },
        ],
        rows,
        summaryMetrics: [
          { label: 'Reservations', value: String(rows.length) },
          { label: 'Total Price Value', value: formatCurrencyCents(totalAgreedCents, currencyCode) },
          {
            label: 'Deposits / Payments Collected',
            value: formatCurrencyCents(totalPaidCents, currencyCode),
            tone: totalPaidCents > 0 ? 'positive' : 'neutral',
          },
          {
            label: 'Open Balance Due',
            value: formatCurrencyCents(totalRemainingCents, currencyCode),
          },
          {
            label: 'Overdue Deposits',
            value: String(overdueDepositsCount),
            tone: overdueDepositsCount > 0 ? 'danger' : 'neutral',
          },
        ],
      };
    }

    default: {
      return {
        columns: [{ key: 'notice', label: 'Notice' }],
        rows: [],
        summaryMetrics: [{ label: 'Report ID', value: ctx.spec.id, tone: 'warning' }],
        emptyMessage: `Unknown report template "${ctx.spec.id}".`,
      };
    }
  }
}

/**
 * Exports any `GeneratedReport` as a UTF-8 BOM RFC-4180 CSV string suitable for Excel / Sheets.
 */
export function exportReportToCsv(report: GeneratedReport): string {
  const headerLine = report.columns.map((c) => escapeCsvCell(c.label)).join(',');
  const rowLines = report.rows.map((row) =>
    report.columns.map((c) => escapeCsvCell(row.cells[c.key] ?? '')).join(',')
  );
  return `${UTF8_BOM}${[headerLine, ...rowLines].join('\r\n')}`;
}

/**
 * Builds a clean, dated export filename for a generated report CSV or HTML print file.
 */
export function buildReportFileName(
  report: GeneratedReport,
  ext: 'csv' | 'htm',
  barnName?: string
): string {
  const trimmed = (barnName || '').trim();
  const isDefault = !trimmed || trimmed.toLowerCase() === 'my barn';
  const barnSlug = isDefault ? 'pedigree' : slugifySegment(trimmed, 'pedigree');
  const spSlug = slugifySegment(report.speciesName, 'species');
  const repSlug = slugifySegment(report.reportId, 'report');
  const stamp = report.generatedAtDateIso || todayDateIso();
  return `${barnSlug}-${spSlug}-${repSlug}-${stamp}.${ext}`;
}

/**
 * Builds a clean, standalone printable `.HTM` document for `PrintPreviewModal` and PDF export.
 * Enforces white paper print rules (`color-scheme: light only`, `#ffffff` background) matching
 * the app's pedigree & cage-card print standards.
 */
export function buildPrintableReportHtml(
  report: GeneratedReport,
  settings: Pick<BarnSettings, 'barnName' | 'breederName'>
): string {
  const barnTitle = (settings.barnName || '').trim() || 'Pedigree';
  const breeder = (settings.breederName || '').trim();

  const summaryHtml =
    report.summaryMetrics.length > 0
      ? `<div class="metrics">
          ${report.summaryMetrics
            .map(
              (m) => `<div class="metric">
                <div class="metric-label">${escapeHtml(m.label)}</div>
                <div class="metric-val">${escapeHtml(m.value)}</div>
              </div>`
            )
            .join('')}
        </div>`
      : '';

  const tableHtml =
    report.rows.length > 0
      ? `<table>
          <thead>
            <tr>
              ${report.columns
                .map(
                  (col) =>
                    `<th class="${col.align === 'right' ? 'num' : ''}">${escapeHtml(col.label)}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${report.rows
              .map(
                (row) => `<tr class="tone-${escapeHtml(row.highlightTone || 'normal')}">
                  ${report.columns
                    .map(
                      (col) =>
                        `<td class="${col.align === 'right' ? 'num' : ''}">${escapeHtml(
                          row.cells[col.key] ?? ''
                        )}</td>`
                    )
                    .join('')}
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`
      : `<div class="empty">${escapeHtml(report.emptyMessage)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="color-scheme" content="light only" />
<title>${escapeHtml(report.speciesName)} — ${escapeHtml(report.title)}</title>
<style>
  @page { size: landscape; margin: 10mm; }
  :root, html, body { color-scheme: light only; background: #ffffff; color: #1e241e; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 16px; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2d5a3d; padding-bottom: 8px; margin-bottom: 12px; gap: 16px; }
  .title { font-family: Georgia, "Times New Roman", serif; font-size: 20px; font-weight: bold; color: #1e3f2a; margin: 0 0 2px; }
  .sub { font-size: 11px; color: #4a534a; }
  .meta-right { text-align: right; font-size: 11px; color: #4a534a; }
  .metrics { display: flex; flex-wrap: wrap; gap: 10px 24px; padding: 8px 12px; border: 1px solid #d5d0c5; border-radius: 6px; margin-bottom: 12px; background: #faf9f6; }
  .metric-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b635b; }
  .metric-val { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; color: #1e241e; }
  table { width: 100%; border-collapse: collapse; background: #ffffff; }
  th { background: #f4f2ec; color: #1e3f2a; font-size: 11px; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #c9c3b6; border-bottom: 2px solid #2d5a3d; }
  td { padding: 5px 8px; border: 1px solid #d9d4c8; font-size: 11px; vertical-align: top; }
  tbody tr:nth-child(even) { background: #fbfaf7; }
  th.num, td.num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.tone-warning td:first-child { border-left: 3px solid #b86b2b; }
  tr.tone-danger td:first-child { border-left: 3px solid #9f2d2d; }
  tr.tone-success td:first-child { border-left: 3px solid #2d5a3d; }
  .empty { padding: 20px; border: 1px dashed #c9c3b6; border-radius: 6px; text-align: center; color: #5b635b; }
  @media print {
    :root, html, body, .metrics, table, th, td, tbody tr {
      color-scheme: light only !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
    * { -webkit-print-color-adjust: economy !important; print-color-adjust: economy !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${escapeHtml(report.title)}</div>
      <div class="sub">${escapeHtml(barnTitle)}${breeder ? ` &middot; Breeder: ${escapeHtml(breeder)}` : ''} &middot; Species: ${escapeHtml(report.speciesName)} Only &middot; Filter: ${escapeHtml(report.audienceFilter)}</div>
    </div>
    <div class="meta-right">
      <div>Category: ${escapeHtml(report.category)}</div>
      <div>Generated: ${escapeHtml(formatReadableDate(report.generatedAtDateIso))} &middot; Rows: ${report.rows.length}</div>
    </div>
  </div>
  ${summaryHtml}
  ${tableHtml}
</body>
</html>`;
}
