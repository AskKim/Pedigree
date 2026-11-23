/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Engine for The Judge's Notebook (`src/core/judgeNotebook.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) calls.
 * Manages show judge assignments, club contacts, travel mileage, judging expenses,
 * bid statuses, judging contracts, date-conflict checks, CSV exports, and
 * XSS-escaped printable HTML contracts & tax/expense summaries.
 */

import { escapeCsvCell, UTF8_BOM } from './csvExport';
import { escapeSafeHtml, sanitizePlainText, sanitizeSingleLineText } from './inputSanitization';
import {
  BarnSettings,
  DEFAULT_IRS_MILEAGE_RATE_CENTS,
  formatCurrencyCents,
  formatReadableDate,
  generateUuid,
  JudgeAssignment,
  JudgeBidStatus,
  JudgeClubContact,
  JudgeContractStatus,
  JudgeExpense,
  MileageLog,
  normalizeCurrencyCode,
  normalizeJudgeBidStatus,
  normalizeJudgeContractStatus,
  normalizeJudgeExpenseCategory,
  nowIsoUtc,
  todayDateIso,
} from './models';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDateIso(raw: unknown, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  return ISO_DATE_RE.test(trimmed) ? trimmed : fallback;
}

export function normalizeJudgeClubContact(raw: unknown): JudgeClubContact | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 120) : '';
  const clubName = sanitizeSingleLineText(obj.clubName || '', 160);
  if (!id || !clubName) return null;

  const species = sanitizeSingleLineText(obj.species || 'Rabbit', 80) || 'Rabbit';
  const ts = nowIsoUtc();
  return {
    id,
    species,
    clubName,
    sanctioningBody: sanitizeSingleLineText(obj.sanctioningBody || 'ARBA', 80) || 'ARBA',
    contactPerson: sanitizeSingleLineText(obj.contactPerson || '', 120),
    roleTitle: sanitizeSingleLineText(obj.roleTitle || '', 100),
    email: sanitizeSingleLineText(obj.email || '', 160),
    phone: sanitizeSingleLineText(obj.phone || '', 60),
    cityState: sanitizeSingleLineText(obj.cityState || '', 140),
    venueName: sanitizeSingleLineText(obj.venueName || '', 160),
    notes: sanitizePlainText(obj.notes || '', 2000),
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev >= 0
      ? { _rev: Math.floor(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : ts,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : ts,
  };
}

export function normalizeJudgeAssignment(raw: unknown): JudgeAssignment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 120) : '';
  const showName = sanitizeSingleLineText(obj.showName || '', 180);
  if (!id || !showName) return null;

  const species = sanitizeSingleLineText(obj.species || 'Rabbit', 80) || 'Rabbit';
  const showDateIso = cleanDateIso(obj.showDateIso, todayDateIso());
  const rawEnd = cleanDateIso(obj.endDateIso, '');
  const endDateIso = rawEnd && rawEnd >= showDateIso ? rawEnd : '';

  const nonNegInt = (val: unknown, fallback = 0): number => {
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
  };
  const nonNegMiles = (val: unknown): number => {
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? Number(n.toFixed(1)) : 0;
  };

  const ts = nowIsoUtc();
  return {
    id,
    species,
    showName,
    ...(typeof obj.clubId === 'string' && obj.clubId.trim()
      ? { clubId: obj.clubId.trim().slice(0, 120) }
      : {}),
    clubName: sanitizeSingleLineText(obj.clubName || '', 160),
    sanctioningBody: sanitizeSingleLineText(obj.sanctioningBody || 'ARBA', 80) || 'ARBA',
    showDateIso,
    endDateIso,
    location: sanitizeSingleLineText(obj.location || '', 160),
    venueAddress: sanitizeSingleLineText(obj.venueAddress || '', 220),
    assignmentRole: sanitizeSingleLineText(obj.assignmentRole || '', 140),
    breedsAssigned: sanitizeSingleLineText(obj.breedsAssigned || '', 240),
    bidStatus: normalizeJudgeBidStatus(obj.bidStatus, 'Bid Submitted'),
    bidSubmittedDateIso: cleanDateIso(obj.bidSubmittedDateIso, ''),
    bidResponseDueIso: cleanDateIso(obj.bidResponseDueIso, ''),
    contractStatus: normalizeJudgeContractStatus(obj.contractStatus, 'Not Sent'),
    contractNumber: sanitizeSingleLineText(obj.contractNumber || '', 80),
    contractSignedDateIso: cleanDateIso(obj.contractSignedDateIso, ''),
    judgingFeeCents: nonNegInt(obj.judgingFeeCents, 0),
    perDiemCents: nonNegInt(obj.perDiemCents, 0),
    hotelProvided: Boolean(obj.hotelProvided),
    mileageReimbursementRateCents: nonNegInt(
      obj.mileageReimbursementRateCents,
      DEFAULT_IRS_MILEAGE_RATE_CENTS
    ),
    estimatedMiles: nonNegMiles(obj.estimatedMiles),
    actualMiles: nonNegMiles(obj.actualMiles),
    ...(typeof obj.linkedMileageLogId === 'string' && obj.linkedMileageLogId.trim()
      ? { linkedMileageLogId: obj.linkedMileageLogId.trim().slice(0, 120) }
      : {}),
    feePaid: Boolean(obj.feePaid),
    feePaidDateIso: cleanDateIso(obj.feePaidDateIso, ''),
    contractTermsSummary: sanitizePlainText(obj.contractTermsSummary || '', 3000),
    notes: sanitizePlainText(obj.notes || '', 3000),
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev >= 0
      ? { _rev: Math.floor(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : ts,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : ts,
  };
}

export function normalizeJudgeExpense(raw: unknown): JudgeExpense | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim().slice(0, 120) : '';
  const description = sanitizeSingleLineText(obj.description || '', 180);
  if (!id || !description) return null;

  const species = sanitizeSingleLineText(obj.species || 'Rabbit', 80) || 'Rabbit';
  const rawAmt = Number(obj.amountCents);
  const amountCents = Number.isFinite(rawAmt) && rawAmt >= 0 ? Math.round(rawAmt) : 0;
  const ts = nowIsoUtc();

  return {
    id,
    species,
    ...(typeof obj.assignmentId === 'string' && obj.assignmentId.trim()
      ? { assignmentId: obj.assignmentId.trim().slice(0, 120) }
      : {}),
    dateIso: cleanDateIso(obj.dateIso, todayDateIso()),
    category: normalizeJudgeExpenseCategory(obj.category, 'Other'),
    description,
    vendor: sanitizeSingleLineText(obj.vendor || '', 140),
    amountCents,
    reimbursable: Boolean(obj.reimbursable),
    reimbursed: Boolean(obj.reimbursed),
    reimbursedDateIso: cleanDateIso(obj.reimbursedDateIso, ''),
    taxDeductible: obj.taxDeductible !== false,
    notes: sanitizePlainText(obj.notes || '', 2000),
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev >= 0
      ? { _rev: Math.floor(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt ? obj.createdAt : ts,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt ? obj.updatedAt : ts,
  };
}

export function createJudgeClubDraft(
  species: string,
  overrides?: Partial<JudgeClubContact>
): JudgeClubContact {
  const ts = nowIsoUtc();
  return {
    id: generateUuid(),
    species: species || 'Rabbit',
    clubName: '',
    sanctioningBody: 'ARBA',
    contactPerson: '',
    roleTitle: 'Show Secretary',
    email: '',
    phone: '',
    cityState: '',
    venueName: '',
    notes: '',
    _rev: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

export function createJudgeAssignmentDraft(
  species: string,
  overrides?: Partial<JudgeAssignment>
): JudgeAssignment {
  const ts = nowIsoUtc();
  return {
    id: generateUuid(),
    species: species || 'Rabbit',
    showName: '',
    clubName: '',
    sanctioningBody: 'ARBA',
    showDateIso: todayDateIso(),
    endDateIso: '',
    location: '',
    venueAddress: '',
    assignmentRole: 'All-Breed Open',
    breedsAssigned: '',
    bidStatus: 'Bid Submitted',
    bidSubmittedDateIso: todayDateIso(),
    bidResponseDueIso: '',
    contractStatus: 'Not Sent',
    contractNumber: '',
    contractSignedDateIso: '',
    judgingFeeCents: 0,
    perDiemCents: 0,
    hotelProvided: false,
    mileageReimbursementRateCents: DEFAULT_IRS_MILEAGE_RATE_CENTS,
    estimatedMiles: 0,
    actualMiles: 0,
    feePaid: false,
    feePaidDateIso: '',
    contractTermsSummary: '',
    notes: '',
    _rev: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

export function createJudgeExpenseDraft(
  species: string,
  overrides?: Partial<JudgeExpense>
): JudgeExpense {
  const ts = nowIsoUtc();
  return {
    id: generateUuid(),
    species: species || 'Rabbit',
    dateIso: todayDateIso(),
    category: 'Lodging / Hotel',
    description: '',
    vendor: '',
    amountCents: 0,
    reimbursable: true,
    reimbursed: false,
    reimbursedDateIso: '',
    taxDeductible: true,
    notes: '',
    _rev: 1,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

export interface JudgeDateConflict {
  assignmentIdA: string;
  assignmentIdB: string;
  showNameA: string;
  showNameB: string;
  dateRangeA: string;
  dateRangeB: string;
}

const ACTIVE_BID_STATUSES_FOR_CONFLICT = new Set<JudgeBidStatus>([
  'Bid Submitted',
  'Bid Accepted',
  'Contracted',
]);

/**
 * Detects overlapping show dates between active/pending judging engagements.
 */
export function detectJudgeDateConflicts(
  assignments: JudgeAssignment[]
): JudgeDateConflict[] {
  const active = assignments
    .filter(
      (a) =>
        Boolean(a.showDateIso) &&
        ACTIVE_BID_STATUSES_FOR_CONFLICT.has(a.bidStatus) &&
        a.contractStatus !== 'Void'
    )
    .slice()
    .sort((a, b) => a.showDateIso.localeCompare(b.showDateIso));

  const conflicts: JudgeDateConflict[] = [];
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const startA = a.showDateIso;
    const endA = a.endDateIso && a.endDateIso >= startA ? a.endDateIso : startA;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      const startB = b.showDateIso;
      const endB = b.endDateIso && b.endDateIso >= startB ? b.endDateIso : startB;
      if (startB > endA) break;
      if (startA <= endB && startB <= endA) {
        conflicts.push({
          assignmentIdA: a.id,
          assignmentIdB: b.id,
          showNameA: a.showName,
          showNameB: b.showName,
          dateRangeA: endA !== startA ? `${startA} to ${endA}` : startA,
          dateRangeB: endB !== startB ? `${startB} to ${endB}` : startB,
        });
      }
    }
  }
  return conflicts;
}

export interface JudgeAssignmentFinancials {
  effectiveMiles: number;
  mileageAllowanceCents: number;
  grossFeeAndPerDiemCents: number;
  totalExpensesCents: number;
  reimbursableExpensesCents: number;
  reimbursedExpensesCents: number;
  pendingReimbursementCents: number;
  unreimbursedExpensesCents: number;
  taxDeductibleExpensesCents: number;
  outstandingClubBalanceCents: number;
  netJudgingIncomeCents: number;
}

export function evaluateJudgeAssignmentFinancials(
  assignment: JudgeAssignment,
  expenses: JudgeExpense[],
  mileageLogs: MileageLog[] = []
): JudgeAssignmentFinancials {
  const linkedExpenses = expenses.filter((e) => e.assignmentId === assignment.id);
  const linkedTrip = assignment.linkedMileageLogId
    ? mileageLogs.find((m) => m.id === assignment.linkedMileageLogId)
    : undefined;

  const effectiveMiles =
    assignment.actualMiles > 0
      ? assignment.actualMiles
      : linkedTrip && linkedTrip.miles > 0
        ? linkedTrip.miles
        : assignment.estimatedMiles > 0
          ? assignment.estimatedMiles
          : 0;

  const rate =
    assignment.mileageReimbursementRateCents >= 0
      ? assignment.mileageReimbursementRateCents
      : DEFAULT_IRS_MILEAGE_RATE_CENTS;
  const mileageAllowanceCents = Math.round(effectiveMiles * rate);
  const grossFeeAndPerDiemCents =
    Math.max(0, assignment.judgingFeeCents) + Math.max(0, assignment.perDiemCents);

  let totalExpensesCents = 0;
  let reimbursableExpensesCents = 0;
  let reimbursedExpensesCents = 0;
  let taxDeductibleExpensesCents = 0;

  for (const exp of linkedExpenses) {
    const amt = Math.max(0, exp.amountCents);
    totalExpensesCents += amt;
    if (exp.reimbursable) {
      reimbursableExpensesCents += amt;
      if (exp.reimbursed) {
        reimbursedExpensesCents += amt;
      }
    }
    if (exp.taxDeductible && (!exp.reimbursable || !exp.reimbursed)) {
      taxDeductibleExpensesCents += amt;
    }
  }

  const pendingReimbursementCents = Math.max(
    0,
    reimbursableExpensesCents - reimbursedExpensesCents
  );
  const unreimbursedExpensesCents = Math.max(0, totalExpensesCents - reimbursedExpensesCents);

  const isCancelledOrDeclined =
    assignment.bidStatus === 'Declined' || assignment.bidStatus === 'Cancelled';

  const feeDueCents =
    !isCancelledOrDeclined && !assignment.feePaid ? grossFeeAndPerDiemCents : 0;
  const outstandingClubBalanceCents = feeDueCents + pendingReimbursementCents;
  const netJudgingIncomeCents =
    (isCancelledOrDeclined ? 0 : grossFeeAndPerDiemCents) - unreimbursedExpensesCents;

  return {
    effectiveMiles: Number(effectiveMiles.toFixed(1)),
    mileageAllowanceCents,
    grossFeeAndPerDiemCents,
    totalExpensesCents,
    reimbursableExpensesCents,
    reimbursedExpensesCents,
    pendingReimbursementCents,
    unreimbursedExpensesCents,
    taxDeductibleExpensesCents,
    outstandingClubBalanceCents,
    netJudgingIncomeCents,
  };
}

export interface JudgeNotebookSummary {
  yearLabel: string;
  totalAssignments: number;
  upcomingAssignmentsCount: number;
  pendingBidsCount: number;
  unsignedContractsCount: number;
  completedShowsCount: number;
  totalClubsCount: number;
  totalMiles: number;
  mileageAllowanceCents: number;
  grossFeesCents: number;
  totalExpensesCents: number;
  pendingReimbursementCents: number;
  unpaidFeesCents: number;
  taxDeductibleExpensesCents: number;
  netJudgingEarningsCents: number;
}

export function getAvailableJudgeYears(
  assignments: JudgeAssignment[],
  expenses: JudgeExpense[]
): string[] {
  const years = new Set<string>();
  for (const a of assignments) {
    if (a.showDateIso.length >= 4) years.add(a.showDateIso.slice(0, 4));
  }
  for (const e of expenses) {
    if (e.dateIso.length >= 4) years.add(e.dateIso.slice(0, 4));
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

export function summarizeJudgeNotebook(
  assignments: JudgeAssignment[],
  expenses: JudgeExpense[],
  clubs: JudgeClubContact[],
  mileageLogs: MileageLog[] = [],
  todayIso: string = todayDateIso(),
  yearFilter = 'all'
): JudgeNotebookSummary {
  const scopedAssignments =
    yearFilter === 'all'
      ? assignments
      : assignments.filter((a) => a.showDateIso.startsWith(yearFilter));
  const scopedExpenses =
    yearFilter === 'all'
      ? expenses
      : expenses.filter((e) => e.dateIso.startsWith(yearFilter));

  const assignmentIdsInScope = new Set(scopedAssignments.map((a) => a.id));
  const orphanExpenses = scopedExpenses.filter(
    (e) => !e.assignmentId || !assignmentIdsInScope.has(e.assignmentId)
  );

  let upcomingAssignmentsCount = 0;
  let pendingBidsCount = 0;
  let unsignedContractsCount = 0;
  let completedShowsCount = 0;
  let totalMiles = 0;
  let mileageAllowanceCents = 0;
  let grossFeesCents = 0;
  let totalExpensesCents = 0;
  let pendingReimbursementCents = 0;
  let unpaidFeesCents = 0;
  let taxDeductibleExpensesCents = 0;
  let netJudgingEarningsCents = 0;

  for (const a of scopedAssignments) {
    const isCancelledOrDeclined = a.bidStatus === 'Declined' || a.bidStatus === 'Cancelled';
    if (
      !isCancelledOrDeclined &&
      a.bidStatus !== 'Completed' &&
      (a.endDateIso || a.showDateIso) >= todayIso
    ) {
      upcomingAssignmentsCount++;
    }
    if (a.bidStatus === 'Inquiry' || a.bidStatus === 'Bid Submitted') {
      pendingBidsCount++;
    }
    if (
      (a.bidStatus === 'Bid Accepted' || a.bidStatus === 'Contracted') &&
      (a.contractStatus === 'Not Sent' ||
        a.contractStatus === 'Draft' ||
        a.contractStatus === 'Sent to Club')
    ) {
      unsignedContractsCount++;
    }
    if (a.bidStatus === 'Completed') {
      completedShowsCount++;
    }

    const fin = evaluateJudgeAssignmentFinancials(a, scopedExpenses, mileageLogs);
    if (!isCancelledOrDeclined) {
      totalMiles += fin.effectiveMiles;
      mileageAllowanceCents += fin.mileageAllowanceCents;
      grossFeesCents += fin.grossFeeAndPerDiemCents;
      if (!a.feePaid) {
        unpaidFeesCents += fin.grossFeeAndPerDiemCents;
      }
    }
    totalExpensesCents += fin.totalExpensesCents;
    pendingReimbursementCents += fin.pendingReimbursementCents;
    taxDeductibleExpensesCents += fin.taxDeductibleExpensesCents;
    netJudgingEarningsCents += fin.netJudgingIncomeCents;
  }

  for (const exp of orphanExpenses) {
    const amt = Math.max(0, exp.amountCents);
    totalExpensesCents += amt;
    if (exp.reimbursable && !exp.reimbursed) {
      pendingReimbursementCents += amt;
    }
    if (exp.taxDeductible && (!exp.reimbursable || !exp.reimbursed)) {
      taxDeductibleExpensesCents += amt;
    }
    if (!exp.reimbursed) {
      netJudgingEarningsCents -= amt;
    }
  }

  return {
    yearLabel: yearFilter === 'all' ? 'All Years' : yearFilter,
    totalAssignments: scopedAssignments.length,
    upcomingAssignmentsCount,
    pendingBidsCount,
    unsignedContractsCount,
    completedShowsCount,
    totalClubsCount: clubs.length,
    totalMiles: Number(totalMiles.toFixed(1)),
    mileageAllowanceCents,
    grossFeesCents,
    totalExpensesCents,
    pendingReimbursementCents,
    unpaidFeesCents,
    taxDeductibleExpensesCents,
    netJudgingEarningsCents,
  };
}

export interface JudgeAssignmentFilter {
  query?: string;
  bidStatus?: 'all' | JudgeBidStatus;
  contractStatus?: 'all' | JudgeContractStatus;
  year?: string;
  timeframe?: 'all' | 'upcoming' | 'past' | 'unpaid';
  todayIso?: string;
}

export function filterJudgeAssignments(
  assignments: JudgeAssignment[],
  filter: JudgeAssignmentFilter = {}
): JudgeAssignment[] {
  const q = (filter.query || '').trim().toLowerCase();
  const today = filter.todayIso || todayDateIso();

  return assignments
    .filter((a) => {
      if (filter.year && filter.year !== 'all' && !a.showDateIso.startsWith(filter.year)) {
        return false;
      }
      if (filter.bidStatus && filter.bidStatus !== 'all' && a.bidStatus !== filter.bidStatus) {
        return false;
      }
      if (
        filter.contractStatus &&
        filter.contractStatus !== 'all' &&
        a.contractStatus !== filter.contractStatus
      ) {
        return false;
      }
      if (filter.timeframe === 'upcoming') {
        const end = a.endDateIso || a.showDateIso;
        if (
          end < today ||
          a.bidStatus === 'Declined' ||
          a.bidStatus === 'Cancelled' ||
          a.bidStatus === 'Completed'
        ) {
          return false;
        }
      } else if (filter.timeframe === 'past') {
        const end = a.endDateIso || a.showDateIso;
        if (end >= today && a.bidStatus !== 'Completed') return false;
      } else if (filter.timeframe === 'unpaid') {
        if (
          a.feePaid ||
          a.bidStatus === 'Declined' ||
          a.bidStatus === 'Cancelled' ||
          a.judgingFeeCents + a.perDiemCents <= 0
        ) {
          return false;
        }
      }

      if (!q) return true;
      const haystack = [
        a.showName,
        a.clubName,
        a.sanctioningBody,
        a.location,
        a.assignmentRole,
        a.breedsAssigned,
        a.contractNumber,
        a.bidStatus,
        a.contractStatus,
        a.notes,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice()
    .sort((a, b) => a.showDateIso.localeCompare(b.showDateIso));
}

export function buildJudgeContractFileName(assignment: Pick<JudgeAssignment, 'showName' | 'showDateIso'>): string {
  const slug = (assignment.showName || 'show-judging-contract')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const datePart = assignment.showDateIso || todayDateIso();
  return `judging-contract-${slug || 'show'}-${datePart}.htm`;
}

export function buildJudgeCsvFileName(kind: 'assignments' | 'expenses', speciesName: string): string {
  const slug = (speciesName || 'barn')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `judge-${kind}-${slug || 'barn'}-${todayDateIso()}.csv`;
}

export function exportJudgeAssignmentsCsv(
  assignments: JudgeAssignment[],
  expenses: JudgeExpense[],
  mileageLogs: MileageLog[] = [],
  currencyCode = 'USD'
): string {
  const code = normalizeCurrencyCode(currencyCode, 'USD');
  const headers = [
    'Show Date',
    'End Date',
    'Species',
    'Show Name',
    'Club / Host',
    'Sanctioning Body',
    'Location',
    'Role',
    'Breeds Assigned',
    'Bid Status',
    'Contract Status',
    'Contract #',
    `Judging Fee (${code})`,
    `Per Diem (${code})`,
    'Hotel Provided',
    'Effective Miles',
    `Mileage Rate (${code}/mi)`,
    `Mileage Value (${code})`,
    `Linked Expenses (${code})`,
    `Pending Reimb. (${code})`,
    'Fee Paid',
    'Fee Paid Date',
    'Notes',
  ];

  const rows = assignments.map((a) => {
    const fin = evaluateJudgeAssignmentFinancials(a, expenses, mileageLogs);
    return [
      a.showDateIso,
      a.endDateIso || '',
      a.species,
      a.showName,
      a.clubName,
      a.sanctioningBody,
      a.location,
      a.assignmentRole,
      a.breedsAssigned,
      a.bidStatus,
      a.contractStatus,
      a.contractNumber,
      (a.judgingFeeCents / 100).toFixed(2),
      (a.perDiemCents / 100).toFixed(2),
      a.hotelProvided ? 'Yes' : 'No',
      fin.effectiveMiles.toFixed(1),
      (a.mileageReimbursementRateCents / 100).toFixed(2),
      (fin.mileageAllowanceCents / 100).toFixed(2),
      (fin.totalExpensesCents / 100).toFixed(2),
      (fin.pendingReimbursementCents / 100).toFixed(2),
      a.feePaid ? 'Yes' : 'No',
      a.feePaidDateIso || '',
      a.notes,
    ];
  });

  const lines = [headers, ...rows].map((r) => r.map(escapeCsvCell).join(','));
  return `${UTF8_BOM}${lines.join('\r\n')}`;
}

export function exportJudgeExpensesCsv(
  expenses: JudgeExpense[],
  assignments: JudgeAssignment[],
  currencyCode = 'USD'
): string {
  const code = normalizeCurrencyCode(currencyCode, 'USD');
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  const headers = [
    'Date',
    'Species',
    'Category',
    'Description',
    'Vendor',
    'Show Assignment',
    `Amount (${code})`,
    'Reimbursable',
    'Reimbursed',
    'Reimbursed Date',
    'Tax Deductible',
    'Notes',
  ];

  const rows = expenses.map((e) => {
    const linked = e.assignmentId ? assignmentById.get(e.assignmentId) : undefined;
    return [
      e.dateIso,
      e.species,
      e.category,
      e.description,
      e.vendor,
      linked ? `${linked.showName} (${linked.showDateIso})` : '',
      (e.amountCents / 100).toFixed(2),
      e.reimbursable ? 'Yes' : 'No',
      e.reimbursed ? 'Yes' : 'No',
      e.reimbursedDateIso || '',
      e.taxDeductible ? 'Yes' : 'No',
      e.notes,
    ];
  });

  const lines = [headers, ...rows].map((r) => r.map(escapeCsvCell).join(','));
  return `${UTF8_BOM}${lines.join('\r\n')}`;
}

/**
 * Generates an XSS-escaped printable Judging Agreement / Contract document for `PrintPreviewModal`.
 */
export function generateJudgeContractHtml(
  assignment: JudgeAssignment,
  club: JudgeClubContact | undefined,
  settings: Pick<
    BarnSettings,
    'barnName' | 'breederName' | 'breederEmail' | 'breederPhone' | 'breederLocation' | 'currencyCode'
  >
): string {
  const code = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const judgeName = settings.breederName || settings.barnName || 'Show Judge';
  const dateRange =
    assignment.endDateIso && assignment.endDateIso !== assignment.showDateIso
      ? `${formatReadableDate(assignment.showDateIso)} – ${formatReadableDate(assignment.endDateIso)}`
      : formatReadableDate(assignment.showDateIso);
  const milesBasis =
    assignment.actualMiles > 0 ? assignment.actualMiles : assignment.estimatedMiles;
  const estMileageValue = Math.round(milesBasis * assignment.mileageReimbursementRateCents);

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="utf-8" />
<title>Judging Agreement — ${escapeSafeHtml(assignment.showName)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1f241f; margin: 28px auto; max-width: 780px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .subtitle { color: #525c52; font-size: 13px; margin-bottom: 18px; border-bottom: 2px solid #4f6d54; padding-bottom: 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; }
  .box { border: 1px solid #d5dcd3; border-radius: 8px; padding: 12px 14px; background: #fafbf9; }
  .box h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #4f6d54; margin: 0 0 6px; font-family: system-ui, sans-serif; }
  .row { font-size: 13px; margin: 3px 0; }
  .label { color: #5b655b; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
  th, td { border: 1px solid #d5dcd3; padding: 8px 10px; text-align: left; }
  th { background: #eef2ec; font-family: system-ui, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  .terms { border: 1px solid #d5dcd3; border-radius: 8px; padding: 12px 14px; margin: 16px 0; font-size: 13px; white-space: pre-wrap; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 34px; }
  .sig-line { border-top: 1px solid #2b322b; padding-top: 6px; font-size: 12px; color: #475047; }
  @media print { body { margin: 12px; } }
</style>
</head>
<body>
  <h1>Show Judging Agreement &amp; Engagement Contract</h1>
  <div class="subtitle">
    ${escapeSafeHtml(assignment.sanctioningBody)} · ${escapeSafeHtml(assignment.species)} Show
    ${assignment.contractNumber ? ` · Contract #${escapeSafeHtml(assignment.contractNumber)}` : ''}
    · Status: ${escapeSafeHtml(assignment.contractStatus)}
  </div>

  <div class="grid">
    <div class="box">
      <h2>Judge</h2>
      <div class="row"><span class="label">Name:</span> ${escapeSafeHtml(judgeName)}</div>
      ${settings.breederLocation ? `<div class="row"><span class="label">Home Base:</span> ${escapeSafeHtml(settings.breederLocation)}</div>` : ''}
      ${settings.breederEmail ? `<div class="row"><span class="label">Email:</span> ${escapeSafeHtml(settings.breederEmail)}</div>` : ''}
      ${settings.breederPhone ? `<div class="row"><span class="label">Phone:</span> ${escapeSafeHtml(settings.breederPhone)}</div>` : ''}
    </div>

    <div class="box">
      <h2>Host Club &amp; Contact</h2>
      <div class="row"><span class="label">Club:</span> ${escapeSafeHtml(club?.clubName || assignment.clubName || 'Unassigned Club')}</div>
      <div class="row"><span class="label">Contact:</span> ${escapeSafeHtml(club?.contactPerson || '—')}${club?.roleTitle ? ` (${escapeSafeHtml(club.roleTitle)})` : ''}</div>
      ${club?.email ? `<div class="row"><span class="label">Email:</span> ${escapeSafeHtml(club.email)}</div>` : ''}
      ${club?.phone ? `<div class="row"><span class="label">Phone:</span> ${escapeSafeHtml(club.phone)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Show Event</th>
        <th>Date(s)</th>
        <th>Location / Venue</th>
        <th>Assignment &amp; Breeds</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${escapeSafeHtml(assignment.showName)}</strong></td>
        <td>${escapeSafeHtml(dateRange)}</td>
        <td>${escapeSafeHtml(assignment.location || club?.cityState || '—')}${assignment.venueAddress ? `<br/><small>${escapeSafeHtml(assignment.venueAddress)}</small>` : ''}</td>
        <td>${escapeSafeHtml(assignment.assignmentRole || 'Show Judge')}${assignment.breedsAssigned ? `<br/><small>${escapeSafeHtml(assignment.breedsAssigned)}</small>` : ''}</td>
      </tr>
    </tbody>
  </table>

  <table>
    <thead>
      <tr>
        <th>Judging Fee</th>
        <th>Per Diem / Meals</th>
        <th>Travel Mileage Terms</th>
        <th>Lodging</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${escapeSafeHtml(formatCurrencyCents(assignment.judgingFeeCents, code))}</td>
        <td>${escapeSafeHtml(formatCurrencyCents(assignment.perDiemCents, code))}</td>
        <td>${escapeSafeHtml(formatCurrencyCents(assignment.mileageReimbursementRateCents, code))}/mi (${milesBasis.toFixed(1)} mi ≈ ${escapeSafeHtml(formatCurrencyCents(estMileageValue, code))})</td>
        <td>${assignment.hotelProvided ? 'Provided / Covered by Club' : 'Not Provided / Reimbursed Separately'}</td>
      </tr>
    </tbody>
  </table>

  <div class="terms"><strong>Terms &amp; Special Provisions:</strong>
${escapeSafeHtml(
    assignment.contractTermsSummary ||
      'Judge agrees to officiate assigned classes fairly under sanctioning body rules. Host club agrees to remit judging fee and agreed travel/lodging reimbursements upon completion of the show.'
  )}</div>

  <div class="sigs">
    <div>
      <div class="sig-line"><strong>Judge Signature</strong> (${escapeSafeHtml(judgeName)}) · Date: ${assignment.contractSignedDateIso ? escapeSafeHtml(formatReadableDate(assignment.contractSignedDateIso)) : '____________'}</div>
    </div>
    <div>
      <div class="sig-line"><strong>Club Representative</strong> (${escapeSafeHtml(club?.contactPerson || assignment.clubName || 'Show Secretary')}) · Date: ____________</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generates an XSS-escaped annual Judge's Notebook summary report (shows, fees, mileage & expenses).
 */
export function generateJudgeSummaryReportHtml(params: {
  summary: JudgeNotebookSummary;
  assignments: JudgeAssignment[];
  expenses: JudgeExpense[];
  mileageLogs?: MileageLog[];
  settings: Pick<BarnSettings, 'barnName' | 'breederName' | 'currencyCode'>;
  scopeLabel: string;
}): string {
  const { summary, assignments, expenses, mileageLogs = [], settings, scopeLabel } = params;
  const code = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const judgeName = settings.breederName || settings.barnName || 'Show Judge';

  const assignmentRows = assignments
    .map((a) => {
      const fin = evaluateJudgeAssignmentFinancials(a, expenses, mileageLogs);
      return `<tr>
        <td>${escapeSafeHtml(a.showDateIso)}</td>
        <td>${escapeSafeHtml(a.showName)}</td>
        <td>${escapeSafeHtml(a.clubName || '—')}</td>
        <td>${escapeSafeHtml(a.bidStatus)} / ${escapeSafeHtml(a.contractStatus)}</td>
        <td>${fin.effectiveMiles.toFixed(1)} mi</td>
        <td>${escapeSafeHtml(formatCurrencyCents(fin.grossFeeAndPerDiemCents, code))}</td>
        <td>${escapeSafeHtml(formatCurrencyCents(fin.totalExpensesCents, code))}</td>
        <td>${a.feePaid ? 'Paid' : 'Unpaid'}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="utf-8" />
<title>Judge's Notebook Summary — ${escapeSafeHtml(summary.yearLabel)}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #1e231e; margin: 24px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #566056; margin-bottom: 16px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid #d5dcd3; border-radius: 8px; padding: 10px; background: #f9faf8; }
  .kpi .k { font-size: 11px; color: #566056; }
  .kpi .v { font-size: 16px; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d5dcd3; padding: 6px 8px; text-align: left; }
  th { background: #eef2ec; font-size: 11px; text-transform: uppercase; }
</style>
</head>
<body>
  <h1>The Judge's Notebook — ${escapeSafeHtml(scopeLabel)} (${escapeSafeHtml(summary.yearLabel)})</h1>
  <div class="meta">Judge: ${escapeSafeHtml(judgeName)} · Generated ${escapeSafeHtml(formatReadableDate(todayDateIso()))}</div>
  <div class="kpis">
    <div class="kpi"><div class="k">Assignments</div><div class="v">${summary.totalAssignments} (${summary.completedShowsCount} done)</div></div>
    <div class="kpi"><div class="k">Travel Mileage</div><div class="v">${summary.totalMiles.toFixed(1)} mi (${escapeSafeHtml(formatCurrencyCents(summary.mileageAllowanceCents, code))})</div></div>
    <div class="kpi"><div class="k">Gross Fees &amp; Per Diem</div><div class="v">${escapeSafeHtml(formatCurrencyCents(summary.grossFeesCents, code))}</div></div>
    <div class="kpi"><div class="k">Net Judging Earnings</div><div class="v">${escapeSafeHtml(formatCurrencyCents(summary.netJudgingEarningsCents, code))}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Show</th>
        <th>Club</th>
        <th>Bid / Contract</th>
        <th>Miles</th>
        <th>Fee + Per Diem</th>
        <th>Expenses</th>
        <th>Payment</th>
      </tr>
    </thead>
    <tbody>
      ${assignmentRows || '<tr><td colspan="8">No judging assignments in selected scope.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}
