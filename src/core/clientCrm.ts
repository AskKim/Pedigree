/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Client CRM, Buyer Waitlist, Reservations & Sales Agreements Engine (`src/core/clientCrm.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 * All monetary amounts are integer cents; all calendar dates are pure ISO `YYYY-MM-DD` strings.
 */

import { AnimalWithdrawalEvaluation, diffCalendarDaysIso } from './barnAlerts';
import { escapeCsvCell, UTF8_BOM } from './csvExport';
import { escapeSafeHtml, sanitizeSafeRasterImageDataUrl } from './inputSanitization';
import {
  Animal,
  AnimalReservation,
  BarnSettings,
  BreedingRecord,
  CLIENT_KINDS,
  ClientContact,
  ClientKind,
  formatCurrencyCents,
  formatReadableDate,
  formatSexForSpecies,
  isAnimalArchived,
  isSameSpecies,
  normalizeCurrencyCode,
  PREFERRED_CONTACT_METHODS,
  PreferredContactMethod,
  ReservationStatus,
  SpeciesProfile,
  TaskCategory,
  TaskPriority,
  todayDateIso,
  WaitlistEntry,
} from './models';

export interface ReservationFinancialEvaluation {
  totalPriceCents: number;
  depositRequiredCents: number;
  depositPaidCents: number;
  depositRemainingCents: number;
  balanceRemainingCents: number;
  depositCoveragePercent: number;
  totalPaidPercent: number;
  isDepositSatisfied: boolean;
  isPaidInFull: boolean;
  suggestedStatus: ReservationStatus;
}

export type CrmReminderKind =
  | 'deposit_overdue'
  | 'deposit_due_soon'
  | 'hold_expiring'
  | 'balance_due'
  | 'pickup_upcoming'
  | 'waitlist_follow_up';

export type CrmReminderUrgency = 'overdue' | 'due_soon' | 'upcoming';

export interface CrmFollowUpReminder {
  id: string;
  kind: CrmReminderKind;
  urgency: CrmReminderUrgency;
  entityType: 'reservation' | 'waitlist';
  entityId: string;
  clientId: string;
  clientName: string;
  title: string;
  detail: string;
  targetDateIso: string;
  daysDelta: number;
  linkedAnimalId?: string;
  linkedBreedingId?: string;
  suggestedTaskTitle: string;
  suggestedTaskCategory: TaskCategory;
  suggestedTaskPriority: TaskPriority;
}

export interface CrmDashboardSummary {
  totalClients: number;
  activeWaitlistCount: number;
  matchedWaitlistCount: number;
  activeReservationsCount: number;
  completedReservationsCount: number;
  reservedRevenueCents: number;
  collectedDepositsCents: number;
  outstandingDepositsCents: number;
  outstandingBalancesCents: number;
  reminders: CrmFollowUpReminder[];
  overdueReminderCount: number;
  dueSoonReminderCount: number;
}

export interface WaitlistMatchCandidate {
  kind: 'animal' | 'breeding';
  id: string;
  label: string;
  sublabel: string;
  score: number;
  reasons: string[];
}

const ACTIVE_WAITLIST_STATUSES = new Set<WaitlistEntry['status']>(['Active', 'Matched']);
const TERMINAL_RESERVATION_STATUSES = new Set<ReservationStatus>([
  'Picked Up / Completed',
  'Cancelled',
]);

export function formatClientKindLabel(kind: ClientKind): string {
  return CLIENT_KINDS.find((k) => k.value === kind)?.label ?? 'Buyer';
}

export function formatPreferredContactLabel(method: PreferredContactMethod): string {
  return PREFERRED_CONTACT_METHODS.find((m) => m.value === method)?.label ?? 'SMS';
}

/**
 * Evaluates deposit progress, remaining balance, and suggested status for a reservation.
 */
export function evaluateReservationFinancials(
  reservation: Pick<
    AnimalReservation,
    'status' | 'totalPriceCents' | 'depositRequiredCents' | 'depositPaidCents'
  >
): ReservationFinancialEvaluation {
  const totalPriceCents = Math.max(0, Math.round(Number(reservation.totalPriceCents) || 0));
  const depositRequiredCents = Math.max(
    0,
    Math.round(Number(reservation.depositRequiredCents) || 0)
  );
  const depositPaidCents = Math.max(0, Math.round(Number(reservation.depositPaidCents) || 0));

  const depositRemainingCents = Math.max(0, depositRequiredCents - depositPaidCents);
  const balanceRemainingCents = Math.max(0, totalPriceCents - depositPaidCents);

  const depositCoveragePercent =
    depositRequiredCents > 0
      ? Math.min(100, Math.round((depositPaidCents / depositRequiredCents) * 100))
      : depositPaidCents > 0
        ? 100
        : 0;

  const totalPaidPercent =
    totalPriceCents > 0
      ? Math.min(100, Math.round((depositPaidCents / totalPriceCents) * 100))
      : depositPaidCents > 0
        ? 100
        : 0;

  const isDepositSatisfied =
    depositRequiredCents > 0 ? depositPaidCents >= depositRequiredCents : depositPaidCents > 0;
  const isPaidInFull = totalPriceCents > 0 && depositPaidCents >= totalPriceCents;

  let suggestedStatus: ReservationStatus = reservation.status;
  if (!TERMINAL_RESERVATION_STATUSES.has(reservation.status)) {
    if (isPaidInFull) {
      suggestedStatus =
        reservation.status === 'Ready for Pickup' ? 'Ready for Pickup' : 'Paid in Full';
    } else if (isDepositSatisfied && (reservation.status === 'Inquiry Hold' || reservation.status === 'Pending Deposit')) {
      suggestedStatus = 'Deposit Paid';
    } else if (depositRequiredCents > 0 && depositPaidCents < depositRequiredCents && reservation.status === 'Inquiry Hold') {
      suggestedStatus = 'Pending Deposit';
    }
  }

  return {
    totalPriceCents,
    depositRequiredCents,
    depositPaidCents,
    depositRemainingCents,
    balanceRemainingCents,
    depositCoveragePercent,
    totalPaidPercent,
    isDepositSatisfied,
    isPaidInFull,
    suggestedStatus,
  };
}

/**
 * Resolves the next sequential Sales Agreement number (`SA-0001`, `SA-0002`, ...) for a species.
 */
export function buildSuggestedAgreementNumber(
  existingReservations: readonly Pick<AnimalReservation, 'agreementNumber'>[],
  prefix = 'SA'
): string {
  let maxNum = 0;
  for (const res of existingReservations) {
    const raw = (res.agreementNumber || '').trim();
    const match = raw.match(/(\d+)\s*$/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  const cleanPrefix = (prefix || 'SA').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'SA';
  return `${cleanPrefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Evaluates automated CRM follow-up reminders across buyer waitlists and reservations
 * using pure calendar date math (`YYYY-MM-DD`).
 */
export function evaluateCrmFollowUpReminders(params: {
  clients: readonly ClientContact[];
  waitlistEntries: readonly WaitlistEntry[];
  reservations: readonly AnimalReservation[];
  currencyCode?: string;
  todayIso?: string;
  depositLeadDays?: number;
  holdLeadDays?: number;
  pickupLeadDays?: number;
  waitlistLeadDays?: number;
}): CrmDashboardSummary {
  const todayIso = params.todayIso || todayDateIso();
  const currencyCode = normalizeCurrencyCode(params.currencyCode, 'USD');
  const depositLeadDays = params.depositLeadDays ?? 3;
  const holdLeadDays = params.holdLeadDays ?? 2;
  const pickupLeadDays = params.pickupLeadDays ?? 5;
  const waitlistLeadDays = params.waitlistLeadDays ?? 3;

  const clientById = new Map<string, ClientContact>();
  for (const c of params.clients) {
    clientById.set(c.id, c);
  }

  const resolveBuyerName = (clientId: string, fallbackName: string): string => {
    const found = clientById.get(clientId);
    if (found?.fullName?.trim()) return found.fullName.trim();
    return fallbackName?.trim() || 'Buyer';
  };

  const reminders: CrmFollowUpReminder[] = [];
  let reservedRevenueCents = 0;
  let collectedDepositsCents = 0;
  let outstandingDepositsCents = 0;
  let outstandingBalancesCents = 0;
  let activeReservationsCount = 0;
  let completedReservationsCount = 0;

  for (const res of params.reservations) {
    if (res.status === 'Cancelled') continue;
    const fin = evaluateReservationFinancials(res);
    const buyerName = resolveBuyerName(res.clientId, res.clientName);
    const itemDesc = res.itemLabel?.trim() || res.agreementNumber || 'Reserved stock';

    if (res.status === 'Picked Up / Completed') {
      completedReservationsCount += 1;
      reservedRevenueCents += Math.max(fin.totalPriceCents, fin.depositPaidCents);
      collectedDepositsCents += fin.depositPaidCents;
      continue;
    }

    activeReservationsCount += 1;
    reservedRevenueCents += fin.totalPriceCents;
    collectedDepositsCents += fin.depositPaidCents;
    outstandingDepositsCents += fin.depositRemainingCents;
    outstandingBalancesCents += fin.balanceRemainingCents;

    // 1. Deposit due / overdue reminder
    if (fin.depositRemainingCents > 0 && res.depositDueDateIso) {
      const delta = diffCalendarDaysIso(todayIso, res.depositDueDateIso);
      if (Number.isFinite(delta) && delta <= depositLeadDays) {
        const isOverdue = delta < 0;
        const kind: CrmReminderKind = isOverdue ? 'deposit_overdue' : 'deposit_due_soon';
        const urgency: CrmReminderUrgency = isOverdue
          ? 'overdue'
          : delta === 0
            ? 'due_soon'
            : 'upcoming';
        const formattedAmt = formatCurrencyCents(fin.depositRemainingCents, currencyCode);
        reminders.push({
          id: `rem-${kind}-${res.id}-${res.depositDueDateIso}`,
          kind,
          urgency,
          entityType: 'reservation',
          entityId: res.id,
          clientId: res.clientId,
          clientName: buyerName,
          title: isOverdue
            ? `Overdue Deposit (${Math.abs(delta)}d) — ${buyerName}`
            : delta === 0
              ? `Deposit Due Today — ${buyerName}`
              : `Deposit Due in ${delta}d — ${buyerName}`,
          detail: `${formattedAmt} deposit remaining on ${itemDesc} (${res.agreementNumber || 'Reservation'}).`,
          targetDateIso: res.depositDueDateIso,
          daysDelta: delta,
          linkedAnimalId: res.animalId,
          linkedBreedingId: res.breedingId,
          suggestedTaskTitle: `Follow up with ${buyerName}: ${formattedAmt} deposit for ${itemDesc}`,
          suggestedTaskCategory: 'Other',
          suggestedTaskPriority: isOverdue || delta === 0 ? 'High' : 'Normal',
        });
      }
    }

    // 2. Inquiry hold expiration reminder (when deposit isn't yet satisfied)
    if (!fin.isDepositSatisfied && res.holdExpiresDateIso) {
      const delta = diffCalendarDaysIso(todayIso, res.holdExpiresDateIso);
      if (Number.isFinite(delta) && delta <= holdLeadDays) {
        const urgency: CrmReminderUrgency =
          delta < 0 ? 'overdue' : delta === 0 ? 'due_soon' : 'upcoming';
        reminders.push({
          id: `rem-hold_expiring-${res.id}-${res.holdExpiresDateIso}`,
          kind: 'hold_expiring',
          urgency,
          entityType: 'reservation',
          entityId: res.id,
          clientId: res.clientId,
          clientName: buyerName,
          title:
            delta < 0
              ? `Hold Expired (${Math.abs(delta)}d ago) — ${buyerName}`
              : delta === 0
                ? `Hold Expires Today — ${buyerName}`
                : `Hold Expires in ${delta}d — ${buyerName}`,
          detail: `Confirm deposit or release temporary hold on ${itemDesc}.`,
          targetDateIso: res.holdExpiresDateIso,
          daysDelta: delta,
          linkedAnimalId: res.animalId,
          linkedBreedingId: res.breedingId,
          suggestedTaskTitle: `Confirm hold or release ${itemDesc} (${buyerName})`,
          suggestedTaskCategory: 'Other',
          suggestedTaskPriority: delta <= 0 ? 'High' : 'Normal',
        });
      }
    }

    // 3. Balance due reminder
    if (fin.balanceRemainingCents > 0 && res.balanceReminderDateIso) {
      const delta = diffCalendarDaysIso(todayIso, res.balanceReminderDateIso);
      if (Number.isFinite(delta) && delta <= depositLeadDays) {
        const urgency: CrmReminderUrgency =
          delta < 0 ? 'overdue' : delta === 0 ? 'due_soon' : 'upcoming';
        const balFmt = formatCurrencyCents(fin.balanceRemainingCents, currencyCode);
        reminders.push({
          id: `rem-balance_due-${res.id}-${res.balanceReminderDateIso}`,
          kind: 'balance_due',
          urgency,
          entityType: 'reservation',
          entityId: res.id,
          clientId: res.clientId,
          clientName: buyerName,
          title:
            delta < 0
              ? `Balance Follow-Up Overdue (${Math.abs(delta)}d) — ${buyerName}`
              : delta === 0
                ? `Balance Due Today — ${buyerName}`
                : `Balance Due in ${delta}d — ${buyerName}`,
          detail: `${balFmt} remaining balance on ${itemDesc}.`,
          targetDateIso: res.balanceReminderDateIso,
          daysDelta: delta,
          linkedAnimalId: res.animalId,
          linkedBreedingId: res.breedingId,
          suggestedTaskTitle: `Collect ${balFmt} balance from ${buyerName} (${itemDesc})`,
          suggestedTaskCategory: 'Other',
          suggestedTaskPriority: delta <= 0 ? 'High' : 'Normal',
        });
      }
    }

    // 4. Scheduled pickup / delivery reminder
    if (res.pickupScheduledDateIso) {
      const delta = diffCalendarDaysIso(todayIso, res.pickupScheduledDateIso);
      if (Number.isFinite(delta) && delta <= pickupLeadDays) {
        const urgency: CrmReminderUrgency =
          delta < 0 ? 'overdue' : delta <= 1 ? 'due_soon' : 'upcoming';
        reminders.push({
          id: `rem-pickup_upcoming-${res.id}-${res.pickupScheduledDateIso}`,
          kind: 'pickup_upcoming',
          urgency,
          entityType: 'reservation',
          entityId: res.id,
          clientId: res.clientId,
          clientName: buyerName,
          title:
            delta < 0
              ? `Missed Pickup (${Math.abs(delta)}d) — ${buyerName}`
              : delta === 0
                ? `Pickup Scheduled Today — ${buyerName}`
                : `Pickup in ${delta}d — ${buyerName}`,
          detail: `${itemDesc} (${res.status})${fin.balanceRemainingCents > 0 ? ` — ${formatCurrencyCents(fin.balanceRemainingCents, currencyCode)} balance at handoff` : ' — Paid in full'}.`,
          targetDateIso: res.pickupScheduledDateIso,
          daysDelta: delta,
          linkedAnimalId: res.animalId,
          linkedBreedingId: res.breedingId,
          suggestedTaskTitle: `Prepare ${itemDesc} handoff & sales agreement for ${buyerName}`,
          suggestedTaskCategory: 'Other',
          suggestedTaskPriority: delta <= 1 ? 'High' : 'Normal',
        });
      }
    }
  }

  let activeWaitlistCount = 0;
  let matchedWaitlistCount = 0;
  for (const w of params.waitlistEntries) {
    if (ACTIVE_WAITLIST_STATUSES.has(w.status)) {
      activeWaitlistCount += 1;
    }
    if (w.status === 'Matched') {
      matchedWaitlistCount += 1;
    }
    if (!ACTIVE_WAITLIST_STATUSES.has(w.status)) continue;
    if (w.followUpDateIso) {
      const delta = diffCalendarDaysIso(todayIso, w.followUpDateIso);
      if (Number.isFinite(delta) && delta <= waitlistLeadDays) {
        const buyerName = resolveBuyerName(w.clientId, w.clientName);
        const urgency: CrmReminderUrgency =
          delta < 0 ? 'overdue' : delta === 0 ? 'due_soon' : 'upcoming';
        const wishDesc =
          [w.desiredBreed, w.desiredVariety, w.preferredSex !== 'Any' ? w.preferredSex : '']
            .filter(Boolean)
            .join(' · ') || w.intent;
        reminders.push({
          id: `rem-waitlist_follow_up-${w.id}-${w.followUpDateIso}`,
          kind: 'waitlist_follow_up',
          urgency,
          entityType: 'waitlist',
          entityId: w.id,
          clientId: w.clientId,
          clientName: buyerName,
          title:
            delta < 0
              ? `Waitlist Follow-Up Overdue (${Math.abs(delta)}d) — ${buyerName}`
              : delta === 0
                ? `Waitlist Follow-Up Today — ${buyerName}`
                : `Waitlist Follow-Up in ${delta}d — ${buyerName}`,
          detail: `Queue #${w.priorityRank || 1} (${w.status}) seeking ${wishDesc}.`,
          targetDateIso: w.followUpDateIso,
          daysDelta: delta,
          linkedBreedingId: w.preferredBreedingId,
          suggestedTaskTitle: `Contact waitlist buyer ${buyerName} re: ${wishDesc}`,
          suggestedTaskCategory: 'Other',
          suggestedTaskPriority: delta < 0 ? 'High' : 'Normal',
        });
      }
    }
  }

  const urgencyWeight = (u: CrmReminderUrgency): number =>
    u === 'overdue' ? 0 : u === 'due_soon' ? 1 : 2;
  reminders.sort(
    (a, b) =>
      urgencyWeight(a.urgency) - urgencyWeight(b.urgency) ||
      a.daysDelta - b.daysDelta ||
      a.targetDateIso.localeCompare(b.targetDateIso)
  );

  return {
    totalClients: params.clients.length,
    activeWaitlistCount,
    matchedWaitlistCount,
    activeReservationsCount,
    completedReservationsCount,
    reservedRevenueCents,
    collectedDepositsCents,
    outstandingDepositsCents,
    outstandingBalancesCents,
    reminders,
    overdueReminderCount: reminders.filter((r) => r.urgency === 'overdue').length,
    dueSoonReminderCount: reminders.filter((r) => r.urgency === 'due_soon').length,
  };
}

/**
 * Matches an active waitlist request against unreserved live animals and planned/active breedings
 * within the same species.
 */
export function findWaitlistMatches(
  entry: WaitlistEntry,
  animals: readonly Animal[],
  breedings: readonly BreedingRecord[],
  existingReservations: readonly AnimalReservation[]
): WaitlistMatchCandidate[] {
  const reservedAnimalIds = new Set<string>();
  for (const res of existingReservations) {
    if (res.status === 'Cancelled') continue;
    if (res.animalId) reservedAnimalIds.add(res.animalId);
  }

  const wantBreed = entry.desiredBreed.trim().toLowerCase();
  const wantVariety = entry.desiredVariety.trim().toLowerCase();
  const wantSex = entry.preferredSex;
  const candidates: WaitlistMatchCandidate[] = [];

  for (const a of animals) {
    if (!isSameSpecies(a.species, entry.species)) continue;
    if (isAnimalArchived(a) || a.status === 'Sold' || a.status === 'Deceased' || a.culled) {
      continue;
    }
    if (reservedAnimalIds.has(a.id)) continue;

    let score = 0;
    const reasons: string[] = [];

    if (wantSex === 'Any' || a.sex === wantSex) {
      score += wantSex === 'Any' ? 1 : 25;
      if (wantSex !== 'Any') reasons.push(`Matches ${wantSex} sex`);
    } else {
      continue;
    }

    const aBreed = (a.breed || '').trim().toLowerCase();
    const aVariety = (a.variety || '').trim().toLowerCase();

    if (wantBreed) {
      if (aBreed === wantBreed) {
        score += 40;
        reasons.push('Exact breed match');
      } else if (aBreed.includes(wantBreed) || wantBreed.includes(aBreed)) {
        score += 20;
        reasons.push('Partial breed match');
      } else {
        continue;
      }
    }

    if (wantVariety) {
      if (aVariety === wantVariety) {
        score += 25;
        reasons.push('Exact variety match');
      } else if (aVariety.includes(wantVariety) || wantVariety.includes(aVariety)) {
        score += 12;
        reasons.push('Partial variety match');
      }
    }

    if (reasons.length === 0) {
      reasons.push('Available in herd');
    }

    candidates.push({
      kind: 'animal',
      id: a.id,
      label: `${a.name}${a.tattoo ? ` (#${a.tattoo})` : ''}`,
      sublabel: `${a.breed || 'Unlisted breed'}${a.variety ? ` · ${a.variety}` : ''} · ${a.sex}`,
      score,
      reasons,
    });
  }

  for (const b of breedings) {
    if (!isSameSpecies(b.species, entry.species)) continue;
    if (b.status === 'Missed' || b.status === 'Weaned') continue;
    let score = entry.preferredBreedingId === b.id ? 60 : 15;
    const reasons: string[] = [];
    if (entry.preferredBreedingId === b.id) {
      reasons.push('Preferred pairing');
    } else {
      reasons.push(`Active ${b.status.toLowerCase()} pairing`);
    }
    if (b.expectedDueDateIso) {
      reasons.push(`Due ${formatReadableDate(b.expectedDueDateIso)}`);
    }
    candidates.push({
      kind: 'breeding',
      id: b.id,
      label: `${b.sireName || 'Sire'} × ${b.damName || 'Dam'}`,
      sublabel: `${b.status}${b.expectedDueDateIso ? ` · Due ${formatReadableDate(b.expectedDueDateIso)}` : ''}`,
      score,
      reasons,
    });
  }

  return candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 8);
}

/**
 * Exports buyer contacts for one species to UTF-8 BOM RFC-4180 CSV.
 */
export function formatClientsCsv(clients: readonly ClientContact[]): string {
  const headers = [
    'Client Name',
    'Ranch / Herd Name',
    'Client Type',
    'Preferred Contact',
    'Phone',
    'Email',
    'City / State',
    'Address',
    'Tags',
    'Notes',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const c of clients) {
    lines.push(
      [
        c.fullName,
        c.ranchOrHerdName,
        formatClientKindLabel(c.clientKind),
        formatPreferredContactLabel(c.preferredContact),
        c.phone,
        c.email,
        c.cityState,
        c.shippingAddress,
        (c.tags ?? []).join('; '),
        c.notes,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return UTF8_BOM + lines.join('\r\n');
}

/**
 * Exports buyer waitlist entries for one species to UTF-8 BOM RFC-4180 CSV.
 */
export function formatWaitlistCsv(
  entries: readonly WaitlistEntry[],
  currencyCode = 'USD'
): string {
  const headers = [
    'Queue Rank',
    'Buyer Name',
    'Status',
    'Intent',
    'Desired Breed',
    'Desired Variety',
    'Preferred Sex',
    'Inquiry Date',
    'Follow-Up Date',
    'Requested By',
    'Max Budget',
    'Notes',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  const sorted = [...entries].sort(
    (a, b) => (a.priorityRank || 9999) - (b.priorityRank || 9999) || a.inquiryDateIso.localeCompare(b.inquiryDateIso)
  );
  for (const w of sorted) {
    lines.push(
      [
        w.priorityRank,
        w.clientName,
        w.status,
        w.intent,
        w.desiredBreed,
        w.desiredVariety,
        w.preferredSex,
        w.inquiryDateIso,
        w.followUpDateIso,
        w.requestedByDateIso,
        w.maxBudgetCents && w.maxBudgetCents > 0
          ? formatCurrencyCents(w.maxBudgetCents, currencyCode)
          : '',
        w.notes,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return UTF8_BOM + lines.join('\r\n');
}

/**
 * Exports reservations & deposit tracking rows for one species to UTF-8 BOM RFC-4180 CSV.
 */
export function formatReservationsCsv(
  reservations: readonly AnimalReservation[],
  currencyCode = 'USD'
): string {
  const headers = [
    'Agreement #',
    'Buyer Name',
    'Animal / Litter Pick',
    'Status',
    'Reserved Date',
    'Total Price',
    'Deposit Required',
    'Amount Paid',
    'Balance Remaining',
    'Deposit Due Date',
    'Hold Expires Date',
    'Pickup Date',
    'Payment Method',
    'Notes',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const r of reservations) {
    const fin = evaluateReservationFinancials(r);
    lines.push(
      [
        r.agreementNumber,
        r.clientName,
        r.itemLabel,
        r.status,
        r.reservedDateIso,
        formatCurrencyCents(fin.totalPriceCents, currencyCode),
        formatCurrencyCents(fin.depositRequiredCents, currencyCode),
        formatCurrencyCents(fin.depositPaidCents, currencyCode),
        formatCurrencyCents(fin.balanceRemainingCents, currencyCode),
        r.depositDueDateIso,
        r.holdExpiresDateIso,
        r.pickupScheduledDateIso,
        r.paymentMethod,
        r.notes,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return UTF8_BOM + lines.join('\r\n');
}

export interface SalesAgreementHtmlInput {
  reservation: AnimalReservation;
  client?: ClientContact | null;
  animal?: Animal | null;
  breeding?: BreedingRecord | null;
  sire?: Animal | null;
  dam?: Animal | null;
  settings: BarnSettings;
  speciesProfile?: SpeciesProfile | null;
  activeWithdrawal?: AnimalWithdrawalEvaluation | null;
  generatedDateIso?: string;
}

/**
 * Generates a white-paper printable Livestock Sales Agreement & Deposit Receipt HTML document
 * formatted cleanly for letter/A4 print & PDF export with full XSS sanitization.
 */
export function generateSalesAgreementHtml(input: SalesAgreementHtmlInput): string {
  const {
    reservation,
    client,
    animal,
    breeding,
    sire,
    dam,
    settings,
    speciesProfile,
    activeWithdrawal,
    generatedDateIso = todayDateIso(),
  } = input;

  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const fin = evaluateReservationFinancials(reservation);
  const safeLogoUrl = settings.breederLogoDataUrl
    ? sanitizeSafeRasterImageDataUrl(settings.breederLogoDataUrl)
    : '';
  const barnTitle = settings.barnName?.trim() || 'Community Pedigree Barn';
  const breederDisplay = settings.breederName?.trim() || barnTitle;
  const buyerName = client?.fullName?.trim() || reservation.clientName?.trim() || 'Buyer';
  const agreementRef = reservation.agreementNumber?.trim() || reservation.id.slice(0, 8).toUpperCase();

  const animalSexLabel = animal
    ? formatSexForSpecies(animal.sex, speciesProfile ?? undefined)
    : 'Unspecified';

  const defaultTerms =
    'A deposit holds the described animal or litter pick until the agreed pickup/balance date. Deposits are applied in full toward the total purchase price and are non-refundable if the buyer cancels, unless the animal becomes unavailable due to breeder illness or injury (in which case the deposit is refunded or transferred in full). Ownership and registration/pedigree paperwork transfer upon receipt of full payment.';

  const defaultHealthGuarantee =
    'Seller guarantees that the animal leaves the barn in apparent good health, free of visible signs of illness, injury, or parasites at the time of handoff. Seller does not guarantee future adult weight, show placements, or fertility once the animal leaves Seller custody.';

  const termsText = reservation.termsSummary?.trim() || defaultTerms;
  const healthText = reservation.healthGuaranteeNotes?.trim() || defaultHealthGuarantee;

  const sireDisplay = animal?.sireId && sire
    ? `${sire.name}${sire.tattoo ? ` (#${sire.tattoo})` : ''}`
    : breeding?.sireName || 'Unlisted';
  const damDisplay = animal?.damId && dam
    ? `${dam.name}${dam.tattoo ? ` (#${dam.tattoo})` : ''}`
    : breeding?.damName || 'Unlisted';

  const withdrawalBannerHtml =
    activeWithdrawal && activeWithdrawal.isActive
      ? `<div class="withdrawal-box">
          <strong>ACTIVE MEDICATION WITHDRAWAL DISCLOSURE:</strong>
          ${escapeSafeHtml(activeWithdrawal.medicationSummary)} — clears ${escapeSafeHtml(
            formatReadableDate(activeWithdrawal.clearDateIso)
          )} (${escapeSafeHtml(activeWithdrawal.countdownLabel)}). Animal must not be processed for meat until withdrawal clearance date.
        </div>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Sales Agreement ${escapeSafeHtml(agreementRef)} — ${escapeSafeHtml(buyerName)}</title>
<style>
  @page { size: letter portrait; margin: 0.45in; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1c2420;
    background: #ffffff;
    font-size: 12px;
    line-height: 1.45;
  }
  .sheet {
    max-width: 780px;
    margin: 0 auto;
    border: 1px solid #cbd5ce;
    border-radius: 6px;
    padding: 22px 26px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    border-bottom: 2px solid #2f4f3e;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand img {
    max-height: 52px;
    max-width: 90px;
    object-fit: contain;
    border-radius: 4px;
  }
  .brand h1 {
    margin: 0;
    font-size: 18px;
    color: #1d3327;
  }
  .brand p {
    margin: 2px 0 0;
    color: #4f5e56;
    font-size: 11px;
  }
  .meta-right {
    text-align: right;
    font-size: 11px;
  }
  .meta-right .doc-title {
    font-size: 15px;
    font-weight: 700;
    color: #1d3327;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  .status-badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    border: 1px solid #2f4f3e;
    border-radius: 4px;
    font-weight: 600;
    font-size: 11px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
  }
  .card {
    border: 1px solid #d5ded8;
    border-radius: 5px;
    padding: 10px 12px;
    background: #fafcfb;
  }
  .card h2 {
    margin: 0 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #3d5648;
    border-bottom: 1px solid #e2e9e4;
    padding-bottom: 4px;
  }
  .kv {
    margin: 3px 0;
  }
  .kv strong {
    color: #24332b;
  }
  table.finance {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
  }
  table.finance th,
  table.finance td {
    border: 1px solid #d5ded8;
    padding: 6px 9px;
    text-align: left;
  }
  table.finance th {
    background: #eef3ef;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #2c4437;
  }
  table.finance td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .withdrawal-box {
    border: 1.5px solid #b45309;
    background: #fffbeb;
    color: #78350f;
    padding: 9px 11px;
    border-radius: 5px;
    margin-bottom: 14px;
    font-size: 11.5px;
  }
  .clause {
    margin-bottom: 12px;
  }
  .clause h3 {
    margin: 0 0 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #3d5648;
  }
  .clause p {
    margin: 0;
    white-space: pre-wrap;
  }
  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 22px;
    padding-top: 10px;
  }
  .sig-line {
    border-top: 1px solid #2b3a32;
    padding-top: 5px;
    font-size: 11px;
    color: #3b4b42;
    display: flex;
    justify-content: space-between;
  }
  @media print {
    body { padding: 0; }
    .sheet { border: none; padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        ${safeLogoUrl ? `<img src="${safeLogoUrl}" alt="Barn Logo" />` : ''}
        <div>
          <h1>${escapeSafeHtml(barnTitle)}</h1>
          <p>Breeder / Seller: ${escapeSafeHtml(breederDisplay)} · Species: ${escapeSafeHtml(reservation.species)}</p>
        </div>
      </div>
      <div class="meta-right">
        <div class="doc-title">Sales Agreement &amp; Deposit Receipt</div>
        <div>Agreement #: <strong>${escapeSafeHtml(agreementRef)}</strong></div>
        <div>Issued: ${escapeSafeHtml(formatReadableDate(generatedDateIso))} · Reserved: ${escapeSafeHtml(formatReadableDate(reservation.reservedDateIso))}</div>
        <span class="status-badge">${escapeSafeHtml(reservation.status)}</span>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>Buyer Information</h2>
        <div class="kv"><strong>Name:</strong> ${escapeSafeHtml(buyerName)}</div>
        ${client?.ranchOrHerdName ? `<div class="kv"><strong>Ranch / Herd:</strong> ${escapeSafeHtml(client.ranchOrHerdName)}</div>` : ''}
        ${client?.phone ? `<div class="kv"><strong>Phone:</strong> ${escapeSafeHtml(client.phone)}</div>` : ''}
        ${client?.email ? `<div class="kv"><strong>Email:</strong> ${escapeSafeHtml(client.email)}</div>` : ''}
        ${client?.cityState ? `<div class="kv"><strong>Location:</strong> ${escapeSafeHtml(client.cityState)}</div>` : ''}
        ${client?.shippingAddress ? `<div class="kv"><strong>Address:</strong> ${escapeSafeHtml(client.shippingAddress)}</div>` : ''}
      </div>

      <div class="card">
        <h2>Animal / Litter Pick Details</h2>
        <div class="kv"><strong>Reserved Item:</strong> ${escapeSafeHtml(reservation.itemLabel || (animal ? animal.name : 'Litter Pick'))}</div>
        ${animal ? `<div class="kv"><strong>ID / Tattoo:</strong> ${escapeSafeHtml(animal.tattoo || 'Pending')} · <strong>Sex:</strong> ${escapeSafeHtml(animalSexLabel)}</div>` : ''}
        ${animal ? `<div class="kv"><strong>Breed / Variety:</strong> ${escapeSafeHtml([animal.breed, animal.variety].filter(Boolean).join(' · ') || 'Unspecified')}</div>` : ''}
        ${animal?.birthDateIso ? `<div class="kv"><strong>Date of Birth:</strong> ${escapeSafeHtml(formatReadableDate(animal.birthDateIso))}</div>` : ''}
        ${animal?.registrationNumber ? `<div class="kv"><strong>Registration #:</strong> ${escapeSafeHtml(animal.registrationNumber)}</div>` : ''}
        ${reservation.pickOrder ? `<div class="kv"><strong>Litter Pick Order:</strong> Pick #${escapeSafeHtml(String(reservation.pickOrder))}</div>` : ''}
        <div class="kv"><strong>Sire × Dam:</strong> ${escapeSafeHtml(sireDisplay)} × ${escapeSafeHtml(damDisplay)}</div>
      </div>
    </div>

    ${withdrawalBannerHtml}

    <table class="finance">
      <thead>
        <tr>
          <th>Payment &amp; Schedule Summary</th>
          <th>Date / Method</th>
          <th style="text-align:right;">Amount (${escapeSafeHtml(currencyCode)})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Agreed Purchase Price</td>
          <td>Reserved ${escapeSafeHtml(formatReadableDate(reservation.reservedDateIso))}</td>
          <td class="num">${escapeSafeHtml(formatCurrencyCents(fin.totalPriceCents, currencyCode))}</td>
        </tr>
        <tr>
          <td>Required Deposit to Hold Stock</td>
          <td>${reservation.depositDueDateIso ? `Due ${escapeSafeHtml(formatReadableDate(reservation.depositDueDateIso))}` : 'Upon Agreement'}</td>
          <td class="num">${escapeSafeHtml(formatCurrencyCents(fin.depositRequiredCents, currencyCode))}</td>
        </tr>
        <tr>
          <td>Total Payments / Deposit Received</td>
          <td>${[reservation.depositPaidDateIso ? formatReadableDate(reservation.depositPaidDateIso) : '', reservation.paymentMethod || ''].filter(Boolean).map(escapeSafeHtml).join(' · ') || 'Pending'}</td>
          <td class="num">${escapeSafeHtml(formatCurrencyCents(fin.depositPaidCents, currencyCode))}</td>
        </tr>
        <tr>
          <td><strong>Remaining Balance Due at Handoff</strong></td>
          <td>${reservation.pickupScheduledDateIso ? `Pickup ${escapeSafeHtml(formatReadableDate(reservation.pickupScheduledDateIso))}` : reservation.balanceReminderDateIso ? `Due ${escapeSafeHtml(formatReadableDate(reservation.balanceReminderDateIso))}` : 'Prior to / at Pickup'}</td>
          <td class="num"><strong>${escapeSafeHtml(formatCurrencyCents(fin.balanceRemainingCents, currencyCode))}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="clause">
      <h3>Agreement &amp; Deposit Terms</h3>
      <p>${escapeSafeHtml(termsText)}</p>
    </div>

    <div class="clause">
      <h3>Health &amp; Transfer Guarantee</h3>
      <p>${escapeSafeHtml(healthText)}</p>
    </div>

    ${reservation.notes?.trim() ? `<div class="clause"><h3>Additional Notes</h3><p>${escapeSafeHtml(reservation.notes)}</p></div>` : ''}

    <div class="signatures">
      <div>
        <div class="sig-line">
          <span>Seller Signature (${escapeSafeHtml(breederDisplay)})</span>
          <span>Date</span>
        </div>
      </div>
      <div>
        <div class="sig-line">
          <span>Buyer Signature (${escapeSafeHtml(buyerName)})</span>
          <span>Date</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
