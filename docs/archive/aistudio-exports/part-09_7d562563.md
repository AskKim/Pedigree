# Codebase Export: AskKim/Pedigree (Part 9 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 12 (`src/core/clientCrm.ts` -> `src/core/imageOptimizationSpec.ts`)
- **Index:** [index.md](./index.md)

---
## `src/core/clientCrm.ts`

```typescript
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
```

## `src/core/csvExport.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Human-Readable CSV Export Utility (`src/core/csvExport.ts`).
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
import { sanitizeCsvFormulaCell, sanitizePlainText } from './inputSanitization';
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
export const UTF8_BOM = '\uFEFF';

function slugifyFileSegment(value: string, fallback: string): string {
  const clean = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return clean || fallback;
}

/**
 * Escapes a single CSV cell according to RFC 4180 so commas, double quotes,
 * and CR/LF line breaks inside fields (such as multi-line notes) stay intact in one cell,
 * while neutralizing formula-injection prefixes and control characters.
 */
export function escapeCsvCell(value: unknown): string {
  const s = sanitizeCsvFormulaCell(sanitizePlainText(String(value ?? '')));
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

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
```

## `src/core/dataHealthCheck.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Self-Service Database Health Analyzer & Non-Destructive Auto-Repair Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `indexedDB`) dependencies.
 * Can run identically on Web PWA, Node.js, or React Native / Expo (`expo-sqlite`).
 *
 * ZERO-DATA-LOSS DESIGN:
 * - Never deletes user animals, photos, breedings, tasks, or care logs.
 * - Restores missing SpeciesProfile entries if imported/legacy records belong to an unconfigured species.
 * - Merges duplicate species profiles cleanly.
 * - Records cleared dangling/cross-species/cyclic parent IDs in `animal.notes` before unlinking
 *   so pedigree charts and Wright's COI math recover without destroying audit history.
 * - Ensures every animal with photos has exactly one `isPrimary` photo.
 */

import { analyzeBarnAnimalConflicts } from './animalConflicts';
import {
  Animal,
  AnimalPhoto,
  AnimalReservation,
  BarnDatabaseSnapshot,
  BarnSettings,
  ClientContact,
  FeedAllocation,
  FeedBatch,
  isSameSpecies,
  LedgerEntry,
  normalizeYouthProjectFeedLogs,
  nowIsoUtc,
  ProcessingLog,
  resolveSpeciesProfile,
  SpeciesProfile,
  WaitlistEntry,
  YouthProjectBook,
} from './models';
import { buildSpeciesHerdMap, wouldCreateCycle } from './pedigreeCalculator';

export type HealthIssueSeverity = 'warn' | 'error';

export type HealthIssueCode =
  | 'ORPHANED_SPECIES'
  | 'DUPLICATE_SPECIES_PROFILE'
  | 'DANGLING_PARENT_LINK'
  | 'CROSS_SPECIES_PARENT_LINK'
  | 'CYCLIC_PARENT_LINK'
  | 'PARENT_SEX_MISMATCH'
  | 'DUPLICATE_SPECIES_TATTOO'
  | 'PHOTO_PRIMARY_MISMATCH'
  | 'ORPHANED_PHOTO'
  | 'INVALID_SETTINGS_SPECIES'
  | 'NEGATIVE_NUMERIC_FIELD';

export interface BarnHealthIssue {
  code: HealthIssueCode;
  severity: HealthIssueSeverity;
  autoRepairable: boolean;
  count: number;
  title: string;
  detail: string;
}

export interface BarnHealthReport {
  scannedAtIso: string;
  healthy: boolean;
  autoRepairableCount: number;
  totalIssueCount: number;
  issues: BarnHealthIssue[];
}

export interface BarnHealthRepairResult {
  nextSnapshot: BarnDatabaseSnapshot;
  repairsApplied: string[];
  reportBefore: BarnHealthReport;
  reportAfter: BarnHealthReport;
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v);
}

function collectUsedSpeciesNames(snapshot: BarnDatabaseSnapshot): string[] {
  const seen = new Map<string, string>();
  const add = (raw?: unknown) => {
    const clean = safeStr(raw).trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  };

  for (const a of Array.isArray(snapshot.animals) ? snapshot.animals : []) {
    if (isPlainObject(a)) add(a.species);
  }
  for (const b of Array.isArray(snapshot.breedings) ? snapshot.breedings : []) {
    if (isPlainObject(b)) add(b.species);
  }
  for (const c of Array.isArray(snapshot.cages) ? snapshot.cages : []) {
    if (isPlainObject(c)) add(c.species);
  }
  for (const t of Array.isArray(snapshot.tasks) ? snapshot.tasks : []) {
    if (isPlainObject(t)) add(t.species);
  }
  for (const l of Array.isArray(snapshot.careLogs) ? snapshot.careLogs : []) {
    if (isPlainObject(l)) add(l.species);
  }
  for (const s of Array.isArray(snapshot.shows) ? snapshot.shows : []) {
    if (isPlainObject(s)) add(s.species);
  }
  for (const p of Array.isArray(snapshot.animalPhotos) ? snapshot.animalPhotos : []) {
    if (isPlainObject(p)) add(p.species);
  }
  for (const f of Array.isArray(snapshot.feedBatches) ? snapshot.feedBatches : []) {
    if (isPlainObject(f)) add(f.species);
  }
  for (const fa of Array.isArray(snapshot.feedAllocations) ? snapshot.feedAllocations : []) {
    if (isPlainObject(fa)) add(fa.species);
  }
  for (const le of Array.isArray(snapshot.ledgerEntries) ? snapshot.ledgerEntries : []) {
    if (isPlainObject(le)) add(le.species);
  }
  for (const pl of Array.isArray(snapshot.processingLogs) ? snapshot.processingLogs : []) {
    if (isPlainObject(pl)) add(pl.species);
  }
  for (const yp of Array.isArray(snapshot.youthProjectBooks) ? snapshot.youthProjectBooks : []) {
    if (isPlainObject(yp)) add(yp.species);
  }
  for (const cc of Array.isArray(snapshot.clientContacts) ? snapshot.clientContacts : []) {
    if (isPlainObject(cc)) add(cc.species);
  }
  for (const wl of Array.isArray(snapshot.waitlistEntries) ? snapshot.waitlistEntries : []) {
    if (isPlainObject(wl)) add(wl.species);
  }
  for (const ar of Array.isArray(snapshot.animalReservations) ? snapshot.animalReservations : []) {
    if (isPlainObject(ar)) add(ar.species);
  }
  for (const wh of Array.isArray(snapshot.woolHarvests) ? snapshot.woolHarvests : []) {
    if (isPlainObject(wh)) add(wh.species);
  }

  return Array.from(seen.values());
}

/**
 * Scans the entire local database snapshot for hidden structural jams that could hide records
 * or break pedigree/COI rendering.
 */
export function analyzeBarnDataHealth(snapshot: BarnDatabaseSnapshot): BarnHealthReport {
  const issues: BarnHealthIssue[] = [];
  const rawSpeciesProfiles = (Array.isArray(snapshot.speciesProfiles) ? snapshot.speciesProfiles : []).filter(
    (sp): sp is SpeciesProfile => isPlainObject(sp)
  );
  const rawAnimals = (Array.isArray(snapshot.animals) ? snapshot.animals : []).filter(
    (a): a is Animal => isPlainObject(a) && typeof a.id === 'string' && a.id.trim().length > 0
  );

  // 1. Duplicate species profiles (case-insensitive)
  const seenSpeciesKeys = new Map<string, SpeciesProfile[]>();
  for (const sp of rawSpeciesProfiles) {
    const key = safeStr(sp.name).trim().toLowerCase();
    if (!key) continue;
    const arr = seenSpeciesKeys.get(key) || [];
    arr.push(sp);
    seenSpeciesKeys.set(key, arr);
  }
  const duplicateSpeciesNames: string[] = [];
  for (const arr of seenSpeciesKeys.values()) {
    if (arr.length > 1) {
      duplicateSpeciesNames.push(safeStr(arr[0].name).trim());
    }
  }
  if (duplicateSpeciesNames.length > 0) {
    issues.push({
      code: 'DUPLICATE_SPECIES_PROFILE',
      severity: 'warn',
      autoRepairable: true,
      count: duplicateSpeciesNames.length,
      title: `Duplicate species profile(s): ${duplicateSpeciesNames.join(', ')}`,
      detail: 'Two species profiles share the same name; merging keeps records unified under one hub.',
    });
  }

  // 2. Records belonging to a species missing from speciesProfiles (hidden from Home / UI)
  const configuredKeys = new Set(
    rawSpeciesProfiles.map((sp) => safeStr(sp.name).trim().toLowerCase()).filter(Boolean)
  );
  const usedSpecies = collectUsedSpeciesNames(snapshot);
  const missingSpecies = usedSpecies.filter((name) => !configuredKeys.has(name.toLowerCase()));
  if (missingSpecies.length > 0) {
    issues.push({
      code: 'ORPHANED_SPECIES',
      severity: 'error',
      autoRepairable: true,
      count: missingSpecies.length,
      title: `Records found for unconfigured species: ${missingSpecies.join(', ')}`,
      detail: 'Creating missing species hubs makes those hidden animals, breedings, and chores visible again.',
    });
  }

  // 3. Animal parent links (dangling, cross-species, or cyclic) + negative/non-finite numeric values
  const allById = new Map(rawAnimals.map((a) => [a.id, a]));
  const herdMapsBySpecies = new Map<string, Map<string, Animal>>();
  for (const a of rawAnimals) {
    const spName = safeStr(a.species);
    const key = spName.trim().toLowerCase();
    if (!herdMapsBySpecies.has(key)) {
      herdMapsBySpecies.set(key, buildSpeciesHerdMap(rawAnimals, spName));
    }
  }

  let danglingCount = 0;
  let crossSpeciesCount = 0;
  let cyclicCount = 0;
  let negativeFieldCount = 0;

  for (const animal of rawAnimals) {
    const w = Number(animal.weightGrams);
    const l = Number(animal.legsCount);
    const s = Number(animal.salePriceCents ?? 0);
    const p = Number(animal.purchaseCostCents ?? 0);
    if (
      !Number.isFinite(w) ||
      w < 0 ||
      !Number.isFinite(l) ||
      l < 0 ||
      !Number.isFinite(s) ||
      s < 0 ||
      !Number.isFinite(p) ||
      p < 0
    ) {
      negativeFieldCount++;
    }
    const herdMap = herdMapsBySpecies.get(safeStr(animal.species).trim().toLowerCase()) || new Map();

    for (const parentId of [animal.sireId, animal.damId]) {
      if (!parentId || typeof parentId !== 'string') continue;
      const parent = allById.get(parentId);
      if (!parent) {
        danglingCount++;
      } else if (!isSameSpecies(safeStr(parent.species), safeStr(animal.species))) {
        crossSpeciesCount++;
      } else if (parent.id === animal.id || wouldCreateCycle(animal.id, parent.id, herdMap)) {
        // Because animal already points to parent, if parent's ancestors reach animal.id, a cycle exists!
        cyclicCount++;
      }
    }
  }

  if (danglingCount > 0) {
    issues.push({
      code: 'DANGLING_PARENT_LINK',
      severity: 'warn',
      autoRepairable: true,
      count: danglingCount,
      title: `${danglingCount} dangling parent link(s) pointing to deleted/missing animals`,
      detail: 'Auto-repair saves the old ID into Barn Notes and clears the broken pointer cleanly.',
    });
  }
  if (crossSpeciesCount > 0) {
    issues.push({
      code: 'CROSS_SPECIES_PARENT_LINK',
      severity: 'error',
      autoRepairable: true,
      count: crossSpeciesCount,
      title: `${crossSpeciesCount} cross-species parent link(s)`,
      detail: 'Auto-repair documents the mismatched parent in Barn Notes and unlinks it safely.',
    });
  }
  if (cyclicCount > 0) {
    issues.push({
      code: 'CYCLIC_PARENT_LINK',
      severity: 'error',
      autoRepairable: true,
      count: cyclicCount,
      title: `${cyclicCount} circular ancestor loop(s) in pedigree links`,
      detail: 'Circular ancestry loops break tree rendering; auto-repair breaks the loop safely with a note.',
    });
  }
  if (negativeFieldCount > 0) {
    issues.push({
      code: 'NEGATIVE_NUMERIC_FIELD',
      severity: 'warn',
      autoRepairable: true,
      count: negativeFieldCount,
      title: `${negativeFieldCount} animal(s) with negative weight or leg count`,
      detail: 'Resets negative numbers to 0 so weight & leg summaries compute properly.',
    });
  }

  // 3b. Warning-only checks: Duplicate within-species IDs/tattoos & parent sex mismatches
  const conflictSummaries = analyzeBarnAnimalConflicts(rawAnimals);
  const dupGroups = new Map<string, { species: string; tattoo: string; count: number; sameSexCollision: boolean }>();
  let duplicateTattooAnimalsCount = 0;
  let parentSexMismatchCount = 0;
  let femaleSireCount = 0;
  let maleDamCount = 0;
  let unknownParentSexCount = 0;

  for (const animal of rawAnimals) {
    const summary = conflictSummaries.get(animal.id);
    if (!summary) continue;

    if (summary.duplicateTattooPeers.length > 0) {
      duplicateTattooAnimalsCount++;
      const cleanTat = safeStr(animal.tattoo).trim();
      const groupKey = `${safeStr(animal.species).trim().toLowerCase()}::${cleanTat.toLowerCase()}`;
      const existingGroup = dupGroups.get(groupKey);
      const hasSameSex = summary.duplicateTattooPeers.some((p) => p.sameSex);
      if (existingGroup) {
        existingGroup.count++;
        if (hasSameSex) existingGroup.sameSexCollision = true;
      } else {
        dupGroups.set(groupKey, {
          species: safeStr(animal.species).trim() || 'Unknown',
          tattoo: cleanTat,
          count: 1,
          sameSexCollision: hasSameSex,
        });
      }
    }

    if (summary.sireSexMismatch) {
      parentSexMismatchCount++;
      if (summary.sireSexMismatch.actualSex === 'Female') femaleSireCount++;
      else unknownParentSexCount++;
    }
    if (summary.damSexMismatch) {
      parentSexMismatchCount++;
      if (summary.damSexMismatch.actualSex === 'Male') maleDamCount++;
      else unknownParentSexCount++;
    }
  }

  if (duplicateTattooAnimalsCount > 0) {
    const sampleGroups = Array.from(dupGroups.values())
      .slice(0, 3)
      .map((g) => `${g.species}: "${g.tattoo}" (${g.count}x)`)
      .join(', ');
    issues.push({
      code: 'DUPLICATE_SPECIES_TATTOO',
      severity: 'warn',
      autoRepairable: false,
      count: dupGroups.size,
      title: `${dupGroups.size} duplicate ID/tattoo group(s) across ${duplicateTattooAnimalsCount} animal(s) within the same species`,
      detail: `Left untouched for zero data loss (${sampleGroups}${dupGroups.size > 3 ? ', ...' : ''}). Review or filter by Conflicts in Herd to verify or ignore.`,
    });
  }

  if (parentSexMismatchCount > 0) {
    const mismatchParts: string[] = [];
    if (femaleSireCount > 0) mismatchParts.push(`${femaleSireCount} female recorded as Sire`);
    if (maleDamCount > 0) mismatchParts.push(`${maleDamCount} male recorded as Dam`);
    if (unknownParentSexCount > 0) mismatchParts.push(`${unknownParentSexCount} Unknown-sex parent link(s)`);
    issues.push({
      code: 'PARENT_SEX_MISMATCH',
      severity: 'warn',
      autoRepairable: false,
      count: parentSexMismatchCount,
      title: `${parentSexMismatchCount} parent sex mismatch(es) (${mismatchParts.join(', ')})`,
      detail:
        'Left untouched so imported pedigrees stay intact. Open Herd -> Conflicts to correct parent sex or unlink mismatched parents.',
    });
  }

  // 4. Photos primary flag & orphaned photos
  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  let orphanedPhotoCount = 0;
  for (const photo of Array.isArray(snapshot.animalPhotos) ? snapshot.animalPhotos : []) {
    if (!isPlainObject(photo)) continue;
    if (!allById.has(photo.animalId)) {
      orphanedPhotoCount++;
      continue;
    }
    const list = photosByAnimal.get(photo.animalId) || [];
    list.push(photo);
    photosByAnimal.set(photo.animalId, list);
  }

  let primaryMismatchAnimals = 0;
  for (const list of photosByAnimal.values()) {
    const primaryCount = list.filter((p) => p.isPrimary).length;
    if (list.length > 0 && primaryCount !== 1) {
      primaryMismatchAnimals++;
    }
  }
  if (primaryMismatchAnimals > 0) {
    issues.push({
      code: 'PHOTO_PRIMARY_MISMATCH',
      severity: 'warn',
      autoRepairable: true,
      count: primaryMismatchAnimals,
      title: `${primaryMismatchAnimals} animal gallery/galleries missing a single Cover Photo`,
      detail: 'Assigns a deterministic primary photo so herd thumbnails and pedigrees display cleanly.',
    });
  }
  if (orphanedPhotoCount > 0) {
    issues.push({
      code: 'ORPHANED_PHOTO',
      severity: 'warn',
      autoRepairable: false,
      count: orphanedPhotoCount,
      title: `${orphanedPhotoCount} photo(s) whose parent animal record no longer exists`,
      detail: 'Kept untouched to guarantee zero data loss; export a Complete Archive (.ZIP) if you want raw files.',
    });
  }

  // 5. Settings species validity
  const effectiveConfigured = new Set([
    ...configuredKeys,
    ...missingSpecies.map((s) => s.toLowerCase()),
  ]);
  const defaultSpeciesNorm = safeStr(snapshot.settings?.defaultSpecies).trim().toLowerCase();
  const pinnedSpeciesNorm = safeStr(snapshot.settings?.pinnedLandingSpecies).trim().toLowerCase();
  const defaultInvalid =
    effectiveConfigured.size > 0 &&
    (!defaultSpeciesNorm || !effectiveConfigured.has(defaultSpeciesNorm));
  const pinnedInvalid =
    Boolean(pinnedSpeciesNorm) && !effectiveConfigured.has(pinnedSpeciesNorm);

  if (defaultInvalid || pinnedInvalid) {
    issues.push({
      code: 'INVALID_SETTINGS_SPECIES',
      severity: 'warn',
      autoRepairable: true,
      count: (defaultInvalid ? 1 : 0) + (pinnedInvalid ? 1 : 0),
      title: 'Startup or default species setting points to a missing species',
      detail: 'Resets default/pinned species to a valid configured livestock species.',
    });
  }

  const autoRepairableCount = issues
    .filter((i) => i.autoRepairable)
    .reduce((acc, i) => acc + i.count, 0);
  const totalIssueCount = issues.reduce((acc, i) => acc + i.count, 0);

  return {
    scannedAtIso: nowIsoUtc(),
    healthy: issues.length === 0,
    autoRepairableCount,
    totalIssueCount,
    issues,
  };
}

function appendRepairNote(existingNotes: string, noteLine: string): string {
  const cleanExisting = (existingNotes || '').trim();
  if (cleanExisting.includes(noteLine)) return existingNotes;
  return cleanExisting ? `${cleanExisting}\n${noteLine}` : noteLine;
}

/**
 * Safely repairs all structural database jams with ZERO record deletion.
 */
export function repairBarnDataHealth(snapshot: BarnDatabaseSnapshot): BarnHealthRepairResult {
  const reportBefore = analyzeBarnDataHealth(snapshot);
  const ts = nowIsoUtc();
  const repairsApplied: string[] = [];

  // 1. Deduplicate speciesProfiles
  const dedupedSpecies: SpeciesProfile[] = [];
  const speciesByKey = new Map<string, SpeciesProfile>();
  for (const sp of Array.isArray(snapshot.speciesProfiles) ? snapshot.speciesProfiles : []) {
    if (!isPlainObject(sp)) continue;
    const cleanName = safeStr(sp.name).trim();
    const key = cleanName.toLowerCase();
    if (!key) continue;
    if (!speciesByKey.has(key)) {
      const normalized = { ...sp, name: cleanName };
      speciesByKey.set(key, normalized);
      dedupedSpecies.push(normalized);
    } else {
      repairsApplied.push(`Merged duplicate "${cleanName}" species profile.`);
    }
  }

  // 2. Restore missing speciesProfiles for orphaned records
  const usedSpecies = collectUsedSpeciesNames(snapshot);
  for (const spName of usedSpecies) {
    const key = spName.toLowerCase();
    if (!speciesByKey.has(key)) {
      const created = {
        ...resolveSpeciesProfile(spName, dedupedSpecies),
        sortOrder: dedupedSpecies.length,
        updatedAt: ts,
      };
      speciesByKey.set(key, created);
      dedupedSpecies.push(created);
      repairsApplied.push(`Created missing "${created.name}" species hub so existing records appear.`);
    }
  }

  // 3. Repair dangling, cross-species, and cyclic parent links + negative/non-finite numeric values
  const workingAnimals: Animal[] = (Array.isArray(snapshot.animals) ? snapshot.animals : [])
    .filter((a): a is Animal => isPlainObject(a) && typeof a.id === 'string' && a.id.trim().length > 0)
    .map((a) => ({
      ...a,
      name: safeStr(a.name, 'Unnamed'),
      species: safeStr(a.species, 'Rabbit'),
      notes: safeStr(a.notes, ''),
      sireId: typeof a.sireId === 'string' ? a.sireId : '',
      damId: typeof a.damId === 'string' ? a.damId : '',
    }));
  const workingById = new Map(workingAnimals.map((a) => [a.id, a]));
  // Prebuild per-species maps once (O(N)); animal objects mutate in place so maps stay current!
  const herdMapsBySpecies = new Map<string, Map<string, Animal>>();
  for (const a of workingAnimals) {
    const key = a.species.trim().toLowerCase();
    if (!herdMapsBySpecies.has(key)) {
      herdMapsBySpecies.set(key, buildSpeciesHerdMap(workingAnimals, a.species));
    }
  }

  for (const animal of workingAnimals) {
    let changed = false;

    const w = Number(animal.weightGrams);
    if (!Number.isFinite(w) || w < 0) {
      animal.weightGrams = 0;
      changed = true;
      repairsApplied.push(`Reset invalid/negative weight on "${animal.name}" to 0.`);
    }
    const legs = Number(animal.legsCount);
    if (!Number.isFinite(legs) || legs < 0) {
      animal.legsCount = 0;
      changed = true;
      repairsApplied.push(`Reset invalid/negative leg count on "${animal.name}" to 0.`);
    }
    if (
      animal.salePriceCents !== undefined &&
      (!Number.isFinite(Number(animal.salePriceCents)) || Number(animal.salePriceCents) < 0)
    ) {
      animal.salePriceCents = 0;
      changed = true;
    }
    if (
      animal.purchaseCostCents !== undefined &&
      (!Number.isFinite(Number(animal.purchaseCostCents)) || Number(animal.purchaseCostCents) < 0)
    ) {
      animal.purchaseCostCents = 0;
      changed = true;
    }

    const herdMap = herdMapsBySpecies.get(animal.species.trim().toLowerCase()) || new Map<string, Animal>();

    // Check Sire
    if (animal.sireId) {
      const sire = workingById.get(animal.sireId);
      if (!sire) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked missing sire ID ${animal.sireId}]`
        );
        animal.sireId = '';
        changed = true;
        repairsApplied.push(`Unlinked missing sire ID on "${animal.name}" (saved ID in Barn Notes).`);
      } else if (!isSameSpecies(sire.species, animal.species)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked cross-species sire "${sire.name}" (${sire.species})]`
        );
        animal.sireId = '';
        changed = true;
        repairsApplied.push(`Unlinked cross-species sire "${sire.name}" on "${animal.name}".`);
      } else if (sire.id === animal.id || wouldCreateCycle(animal.id, sire.id, herdMap)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: broke circular sire loop with "${sire.name}"]`
        );
        animal.sireId = '';
        changed = true;
        repairsApplied.push(`Broke circular sire loop on "${animal.name}".`);
      }
    }

    // Check Dam
    if (animal.damId) {
      const dam = workingById.get(animal.damId);
      if (!dam) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked missing dam ID ${animal.damId}]`
        );
        animal.damId = '';
        changed = true;
        repairsApplied.push(`Unlinked missing dam ID on "${animal.name}" (saved ID in Barn Notes).`);
      } else if (!isSameSpecies(dam.species, animal.species)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: unlinked cross-species dam "${dam.name}" (${dam.species})]`
        );
        animal.damId = '';
        changed = true;
        repairsApplied.push(`Unlinked cross-species dam "${dam.name}" on "${animal.name}".`);
      } else if (dam.id === animal.id || wouldCreateCycle(animal.id, dam.id, herdMap)) {
        animal.notes = appendRepairNote(
          animal.notes,
          `[Health Repair: broke circular dam loop with "${dam.name}"]`
        );
        animal.damId = '';
        changed = true;
        repairsApplied.push(`Broke circular dam loop on "${animal.name}".`);
      }
    }

    if (changed) {
      animal.updatedAt = ts;
    }
  }

  // 4. Repair AnimalPhoto primary flags deterministically
  const workingPhotos: AnimalPhoto[] = (Array.isArray(snapshot.animalPhotos) ? snapshot.animalPhotos : [])
    .filter((p): p is AnimalPhoto => isPlainObject(p) && typeof p.id === 'string')
    .map((p) => ({ ...p }));
  const photosByAnimal = new Map<string, AnimalPhoto[]>();
  for (const photo of workingPhotos) {
    if (!workingById.has(photo.animalId)) continue;
    const list = photosByAnimal.get(photo.animalId) || [];
    list.push(photo);
    photosByAnimal.set(photo.animalId, list);
  }
  for (const [animalId, list] of photosByAnimal.entries()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
    const primaries = list.filter((p) => p.isPrimary);
    if (primaries.length !== 1 && list.length > 0) {
      const winnerId = (primaries[0] || list[0]).id;
      for (const p of list) {
        const nextPrimary = p.id === winnerId;
        if (p.isPrimary !== nextPrimary) {
          p.isPrimary = nextPrimary;
          p.updatedAt = ts;
        }
      }
      const ownerName = workingById.get(animalId)?.name || animalId;
      repairsApplied.push(`Normalized Cover Photo selection for "${ownerName}".`);
    }
  }

  // 5. Repair invalid default/pinned species in BarnSettings
  let nextSettings: BarnSettings = { ...snapshot.settings };
  let settingsChanged = false;
  if (dedupedSpecies.length > 0) {
    const validKeys = new Set(dedupedSpecies.map((s) => s.name.toLowerCase()));
    if (!nextSettings.defaultSpecies || !validKeys.has(nextSettings.defaultSpecies.trim().toLowerCase())) {
      nextSettings.defaultSpecies = dedupedSpecies[0].name;
      settingsChanged = true;
      repairsApplied.push(`Set default species to "${dedupedSpecies[0].name}".`);
    }
    if (
      (nextSettings.pinnedLandingSpecies || '').trim() &&
      !validKeys.has(nextSettings.pinnedLandingSpecies.trim().toLowerCase())
    ) {
      nextSettings.pinnedLandingSpecies = '';
      settingsChanged = true;
      repairsApplied.push('Cleared invalid startup pinned species (app will open safely on Home).');
    }
  }
  if (settingsChanged) {
    nextSettings = { ...nextSettings, updatedAt: ts };
  }

  // 6. Sanitize FeedBatch & FeedAllocation numeric fields without deleting user ledger records
  const workingFeedBatches: FeedBatch[] = (Array.isArray(snapshot.feedBatches) ? snapshot.feedBatches : [])
    .filter((f): f is FeedBatch => isPlainObject(f) && typeof f.id === 'string' && f.id.trim().length > 0)
    .map((f) => {
      const next = { ...f };
      let changed = false;
      for (const key of ['bagCount', 'bagWeightValue', 'totalQuantity', 'remainingQuantity', 'lowStockThreshold'] as const) {
        const val = Number(next[key]);
        if (!Number.isFinite(val) || val < 0) {
          next[key] = 0;
          changed = true;
        }
      }
      if (next.totalCostCents !== undefined && (!Number.isFinite(Number(next.totalCostCents)) || Number(next.totalCostCents) < 0)) {
        next.totalCostCents = 0;
        changed = true;
      }
      if (changed) {
        next.updatedAt = ts;
        repairsApplied.push(`Normalized negative/invalid numeric quantity on feed batch "${next.productName || next.lotNumber || next.id}".`);
      }
      return next;
    });

  const workingFeedAllocations: FeedAllocation[] = (Array.isArray(snapshot.feedAllocations) ? snapshot.feedAllocations : [])
    .filter((fa): fa is FeedAllocation => isPlainObject(fa) && typeof fa.id === 'string' && fa.id.trim().length > 0)
    .map((fa) => {
      const val = Number(fa.quantity);
      if (!Number.isFinite(val) || val < 0) {
        repairsApplied.push(`Reset negative/invalid feed allocation quantity for "${fa.targetLabel || fa.id}" to 0.`);
        return { ...fa, quantity: 0, updatedAt: ts };
      }
      return { ...fa };
    });

  const workingLedgerEntries: LedgerEntry[] = (Array.isArray(snapshot.ledgerEntries) ? snapshot.ledgerEntries : [])
    .filter((le): le is LedgerEntry => isPlainObject(le) && typeof le.id === 'string' && le.id.trim().length > 0)
    .map((le) => {
      const amt = Number(le.amountCents);
      if (!Number.isFinite(amt) || amt < 0) {
        repairsApplied.push(`Reset negative/invalid amount on ledger entry "${le.title || le.id}" to 0.`);
        return { ...le, amountCents: 0, updatedAt: ts };
      }
      return { ...le };
    });

  const workingProcessingLogs: ProcessingLog[] = (Array.isArray(snapshot.processingLogs) ? snapshot.processingLogs : [])
    .filter((pl): pl is ProcessingLog => isPlainObject(pl) && typeof pl.id === 'string' && pl.id.trim().length > 0)
    .map((pl) => {
      const next = { ...pl };
      let changed = false;
      for (const key of ['animalCount', 'liveWeightGrams', 'dressedWeightGrams', 'peltCount'] as const) {
        const val = Number(next[key]);
        if (!Number.isFinite(val) || val < 0) {
          next[key] = key === 'animalCount' ? 1 : 0;
          changed = true;
        }
      }
      if (changed) {
        next.updatedAt = ts;
        repairsApplied.push(`Normalized negative/invalid numeric weight or count on processing log "${next.title || next.id}".`);
      }
      return next;
    });

  const workingYouthBooks: YouthProjectBook[] = (Array.isArray(snapshot.youthProjectBooks) ? snapshot.youthProjectBooks : [])
    .filter((yp): yp is YouthProjectBook => isPlainObject(yp) && typeof yp.id === 'string' && yp.id.trim().length > 0)
    .map((yp) => ({
      ...yp,
      linkedAnimalIds: Array.isArray(yp.linkedAnimalIds) ? yp.linkedAnimalIds.filter((id) => typeof id === 'string') : [],
      linkedBreedingIds: Array.isArray(yp.linkedBreedingIds) ? yp.linkedBreedingIds.filter((id) => typeof id === 'string') : [],
      feedLogs: normalizeYouthProjectFeedLogs(yp.feedLogs),
    }));

  const workingClientContacts: ClientContact[] = (Array.isArray(snapshot.clientContacts) ? snapshot.clientContacts : [])
    .filter((cc): cc is ClientContact => isPlainObject(cc) && typeof cc.id === 'string' && cc.id.trim().length > 0)
    .map((cc) => ({
      ...cc,
      tags: Array.isArray(cc.tags) ? cc.tags.filter((t): t is string => typeof t === 'string') : [],
    }));

  const workingWaitlistEntries: WaitlistEntry[] = (Array.isArray(snapshot.waitlistEntries) ? snapshot.waitlistEntries : [])
    .filter((wl): wl is WaitlistEntry => isPlainObject(wl) && typeof wl.id === 'string' && wl.id.trim().length > 0)
    .map((wl) => {
      const rank = Number(wl.priorityRank);
      if (!Number.isFinite(rank) || rank < 1) {
        repairsApplied.push(`Normalized waitlist priority rank for "${wl.clientName || wl.id}" to 1.`);
        return { ...wl, priorityRank: 1, updatedAt: ts };
      }
      return { ...wl };
    });

  const workingReservations: AnimalReservation[] = (Array.isArray(snapshot.animalReservations) ? snapshot.animalReservations : [])
    .filter((ar): ar is AnimalReservation => isPlainObject(ar) && typeof ar.id === 'string' && ar.id.trim().length > 0)
    .map((ar) => {
      const next = { ...ar };
      let changed = false;
      for (const key of ['totalPriceCents', 'depositRequiredCents', 'depositPaidCents'] as const) {
        const val = Number(next[key]);
        if (!Number.isFinite(val) || val < 0) {
          next[key] = 0;
          changed = true;
        }
      }
      if (changed) {
        next.updatedAt = ts;
        repairsApplied.push(`Reset negative/invalid price or deposit field on reservation "${next.agreementNumber || next.id}".`);
      }
      return next;
    });

  const workingWoolHarvests = (Array.isArray(snapshot.woolHarvests) ? snapshot.woolHarvests : [])
    .filter((wh) => isPlainObject(wh) && typeof wh.id === 'string' && wh.id.trim().length > 0)
    .map((wh) => {
      const next = { ...wh };
      let changed = false;
      for (const key of ['primeWeightGrams', 'gradeWeightGrams', 'shearingIntervalDays', 'stapleLengthMm'] as const) {
        if (next[key] !== undefined) {
          const val = Number(next[key]);
          if (!Number.isFinite(val) || val < 0) {
            next[key] = 0;
            changed = true;
          }
        }
      }
      if (changed) {
        next.updatedAt = ts;
        repairsApplied.push(`Reset negative/invalid fiber measurement on wool harvest "${next.id}".`);
      }
      return next;
    });

  const nextSnapshot: BarnDatabaseSnapshot = {
    ...snapshot,
    settings: nextSettings,
    speciesProfiles: dedupedSpecies,
    animals: workingAnimals,
    animalPhotos: workingPhotos,
    feedBatches: workingFeedBatches,
    feedAllocations: workingFeedAllocations,
    ledgerEntries: workingLedgerEntries,
    processingLogs: workingProcessingLogs,
    youthProjectBooks: workingYouthBooks,
    clientContacts: workingClientContacts,
    waitlistEntries: workingWaitlistEntries,
    animalReservations: workingReservations,
    woolHarvests: workingWoolHarvests,
  };

  const reportAfter = analyzeBarnDataHealth(nextSnapshot);

  return {
    nextSnapshot,
    repairsApplied,
    reportBefore,
    reportAfter,
  };
}
```

## `src/core/deviceCapability.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Device Capability Tiers, Hardware Detection & Memory Handling Engine
 * (`src/core/deviceCapability.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node dependencies.
 * Runs identically in Web PWA, Node.js tests, and React Native / Expo.
 *
 * Classifies the host device into 5 practical pedigree-workload tiers:
 * - Tier 1: Critical Memory Limit — locked visible on Home & Settings
 * - Tier 2: Low-Memory Baseline (Survival Mode) — closable on Home, persistent in Settings
 * - Tier 3: Mid-Tier Mobile & Tablet — closable on Home & Settings, reopenable from Settings
 * - Tier 4: Modern Mobile & Pro Tablet — closable on Home & Settings, reopenable from Settings
 * - Tier 5: Desktop & Laptop Class — closable on Home & Settings, reopenable from Settings
 */

import type { ImageOptimizationPresetId } from './imageOptimizationSpec';
import type { BarnSettings } from './models';

export type DeviceCapabilityTierNumber = 1 | 2 | 3 | 4 | 5;

export type DeviceTierSeverity = 'danger' | 'warn' | 'neutral' | 'good';

export type DeviceFormFactor = 'phone' | 'tablet' | 'desktop';

export interface DeviceHardwareSignals {
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
  jsHeapLimitBytes: number | null;
  usedHeapBytes: number | null;
  userAgent: string;
  maxTouchPoints: number;
  coarsePointer: boolean;
  screenWidthPx: number | null;
  screenHeightPx: number | null;
  devicePixelRatio: number | null;
}

export interface DeviceTierDefinition {
  tier: DeviceCapabilityTierNumber;
  slug:
    | 'critical-low-memory'
    | 'survival-baseline'
    | 'standard-mobile'
    | 'modern-mobile'
    | 'desktop-powerhouse';
  shortLabel: string;
  title: string;
  badgeLabel: string;
  severity: DeviceTierSeverity;
  targetHardware: string;
  browserReality: string;
  workloadProfile: string;
  cautionNotice: string;
  maxRecommendedRecords: number | null;
  recommendedImagePreset: ImageOptimizationPresetId;
  recommendedDefaultGenerations: 3 | 4 | 5 | 6;
  homeClosable: boolean;
  settingsClosable: boolean;
  canReopenInSettings: boolean;
}

export interface DeviceCapabilityAssessment {
  tier: DeviceCapabilityTierNumber;
  definition: DeviceTierDefinition;
  formFactor: DeviceFormFactor;
  confidence: 'measured' | 'estimated';
  signalSummary: string;
  signals: DeviceHardwareSignals;
  shouldApplyLowMemoryHandling: boolean;
}

export interface BarnWorkloadEvaluation {
  totalRecords: number;
  maxRecommendedRecords: number | null;
  utilizationPercent: number | null;
  status: 'ok' | 'approaching_limit' | 'over_limit';
  guidance: string | null;
}

export interface TierStoragePolicy {
  tier: DeviceCapabilityTierNumber;
  /** Cap for automated monthly snapshots in OPFS `/backups`. */
  monthlyCap: number;
  /** Cap for pre-upgrade safety snapshots in OPFS `/backups`. */
  preUpgradeCap: number;
  /** Cap for pre-reset / pre-destructive safety snapshots in OPFS `/backups`. */
  preResetCap: number;
  /** Cap for manual snapshots in OPFS `/backups`. */
  manualCap: number;
  /** Cap for migration failure recovery dumps in OPFS `/backups`. */
  recoveryDumpCap: number;
  /** Cap for IndexedDB rolling fallback snapshots. */
  rollingIdbCap: number;
  /** When true (Tiers 1–2), strip full-res `dataUrl` from 15s IDB fallback mirror & rolling snapshots to cut RAM 3–4x while preserving thumbnails & primary SQLite full-res. */
  dehydrateMirrorPhotos: boolean;
  /** Compress OPFS vault `/backups` payloads as `.vault.zip` to reduce browser disk quota pressure. */
  compressVaultBackups: boolean;
  /** Comfort ceiling (in bytes) above which raw `.JSON` / `.ZIP` / `.SQLITE` restore/import triggers a pre-flight caution on this tier. */
  maxSafeImportBytesHint: number;
  /** Keep heavy ZIP canary round-trips disabled on sub-minimum devices. */
  skipHeavyCanaryZip: boolean;
}

export const TIER_STORAGE_POLICIES: Record<DeviceCapabilityTierNumber, TierStoragePolicy> = {
  1: {
    tier: 1,
    monthlyCap: 2,
    preUpgradeCap: 1,
    preResetCap: 2,
    manualCap: 3,
    recoveryDumpCap: 2,
    rollingIdbCap: 1,
    dehydrateMirrorPhotos: true,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 8 * 1024 * 1024,
    skipHeavyCanaryZip: true,
  },
  2: {
    tier: 2,
    monthlyCap: 3,
    preUpgradeCap: 2,
    preResetCap: 3,
    manualCap: 5,
    recoveryDumpCap: 2,
    rollingIdbCap: 2,
    dehydrateMirrorPhotos: true,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 18 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
  3: {
    tier: 3,
    monthlyCap: 6,
    preUpgradeCap: 3,
    preResetCap: 8,
    manualCap: 12,
    recoveryDumpCap: 4,
    rollingIdbCap: 3,
    dehydrateMirrorPhotos: false,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 32 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
  4: {
    tier: 4,
    monthlyCap: 6,
    preUpgradeCap: 3,
    preResetCap: 8,
    manualCap: 12,
    recoveryDumpCap: 4,
    rollingIdbCap: 3,
    dehydrateMirrorPhotos: false,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 64 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
  5: {
    tier: 5,
    monthlyCap: 6,
    preUpgradeCap: 3,
    preResetCap: 8,
    manualCap: 12,
    recoveryDumpCap: 4,
    rollingIdbCap: 3,
    dehydrateMirrorPhotos: false,
    compressVaultBackups: true,
    maxSafeImportBytesHint: 64 * 1024 * 1024,
    skipHeavyCanaryZip: false,
  },
};

export function getTierStoragePolicy(tier: DeviceCapabilityTierNumber): TierStoragePolicy {
  return TIER_STORAGE_POLICIES[tier] || TIER_STORAGE_POLICIES[3];
}

export const DEVICE_CAPABILITY_TIERS: Record<DeviceCapabilityTierNumber, DeviceTierDefinition> = {
  1: {
    tier: 1,
    slug: 'critical-low-memory',
    shortLabel: 'Tier 1 · Below Minimum',
    title: 'Critical Memory Limit',
    badgeLabel: 'Tier 1 · High Crash Risk',
    severity: 'danger',
    targetHardware:
      '≤1 GB RAM · Legacy or kids phones & tablets (e.g., Fire 7, older 1 GB Android/iPad).',
    browserReality:
      '~50–100 MB JS heap; capped to 1 rolling IDB snapshot, 2 monthly vault copies, and thumbnail-only mirror redundancy.',
    workloadProfile:
      'Up to ~1,000 records. Heavy .ZIP imports, large raw DB restores, or high-res photos will likely freeze or crash the tab.',
    cautionNotice:
      'Below minimum hardware requirements. Tight vault retention (2 monthly · 3 manual · 1 rolling IDB) and thumbnail-light mirrors are enforced; connect a Backup Sync Folder or export backups off-device before heavy imports.',
    maxRecommendedRecords: 1000,
    recommendedImagePreset: 'compact',
    recommendedDefaultGenerations: 3,
    homeClosable: false,
    settingsClosable: false,
    canReopenInSettings: false,
  },
  2: {
    tier: 2,
    slug: 'survival-baseline',
    shortLabel: 'Tier 2 · Survival Mode',
    title: 'Low-Memory Baseline (Survival Mode)',
    badgeLabel: 'Tier 2 · Low Memory',
    severity: 'warn',
    targetHardware:
      '2–3 GB RAM · Budget/older phones & tablets (e.g., Galaxy S7/J-series, iPhone 6, Fire HD 8/10, Galaxy Tab A7 Lite, iPad 6th Gen).',
    browserReality:
      '~150–250 MB JS heap; uses compressed vault snapshots, thumbnail-light mirrors, and 2 rolling IDB copies.',
    workloadProfile:
      'Up to ~3,000 records (~4–5 base animals, 8-gen trees, ~25% compact photos).',
    cautionNotice:
      'Low-memory device detected. Keep local records under ~3,000, use Compact photos, and keep a Backup Sync Folder or off-device export synced (vault trims locally to 3 monthly · 5 manual copies).',
    maxRecommendedRecords: 3000,
    recommendedImagePreset: 'compact',
    recommendedDefaultGenerations: 3,
    homeClosable: true,
    settingsClosable: false,
    canReopenInSettings: false,
  },
  3: {
    tier: 3,
    slug: 'standard-mobile',
    shortLabel: 'Tier 3 · Mid-Tier Mobile',
    title: 'Mid-Tier Mobile & Tablet',
    badgeLabel: 'Tier 3 · Mid-Tier Mobile',
    severity: 'neutral',
    targetHardware:
      '4 GB RAM · Mainstream phones & mid-range tablets (e.g., Galaxy A10–A20, iPhone 7/8/SE 2, Galaxy Tab A8/A9, iPad 9th Gen).',
    browserReality:
      '~500 MB JS heap; steady performance for daily barn logs and pedigree trees.',
    workloadProfile:
      'Up to ~10,000 records (15–20 base animals, 8-gen trees, compressed photos).',
    cautionNotice:
      'Mid-tier mobile hardware detected. Multi-generation pedigrees and compressed photos run reliably; large .ZIP imports may pause briefly.',
    maxRecommendedRecords: 10000,
    recommendedImagePreset: 'balanced',
    recommendedDefaultGenerations: 4,
    homeClosable: true,
    settingsClosable: true,
    canReopenInSettings: true,
  },
  4: {
    tier: 4,
    slug: 'modern-mobile',
    shortLabel: 'Tier 4 · Modern Mobile',
    title: 'Modern Mobile & Pro Tablet',
    badgeLabel: 'Tier 4 · Modern Mobile',
    severity: 'good',
    targetHardware:
      '6–8 GB+ RAM · Modern phones & flagship tablets (e.g., Galaxy S20+/A15+, iPhone 11+, Galaxy Tab S8/S9, iPad Air/Pro M-series).',
    browserReality:
      'Generous mobile JS heap with hardware-accelerated image canvas scaling.',
    workloadProfile:
      '25,000+ records (50+ base animals, 8-gen trees, full compressed photo galleries).',
    cautionNotice:
      'Modern mobile or pro tablet hardware detected. Full herds, COI math, and compressed photo galleries run smoothly.',
    maxRecommendedRecords: 25000,
    recommendedImagePreset: 'balanced',
    recommendedDefaultGenerations: 4,
    homeClosable: true,
    settingsClosable: true,
    canReopenInSettings: true,
  },
  5: {
    tier: 5,
    slug: 'desktop-powerhouse',
    shortLabel: 'Tier 5 · Desktop / Laptop',
    title: 'Desktop & Laptop Class',
    badgeLabel: 'Tier 5 · Desktop / Laptop',
    severity: 'good',
    targetHardware:
      '8–16 GB+ RAM · Windows, Mac, Linux & Chromebook PCs with desktop-class CPUs.',
    browserReality:
      'Full desktop browser memory headroom for SQLite, IndexedDB, and bulk archives.',
    workloadProfile:
      'Commercial-scale herds, multi-species photo backups, and bulk .ZIP imports across hundreds of animals.',
    cautionNotice:
      'Desktop or laptop environment detected. Large commercial imports, full photo archives, and deep pedigree lookups run with ample headroom.',
    maxRecommendedRecords: null,
    recommendedImagePreset: 'balanced',
    recommendedDefaultGenerations: 5,
    homeClosable: true,
    settingsClosable: true,
    canReopenInSettings: true,
  },
};

export const DEVICE_CAPABILITY_TIER_LIST: DeviceTierDefinition[] = [
  DEVICE_CAPABILITY_TIERS[1],
  DEVICE_CAPABILITY_TIERS[2],
  DEVICE_CAPABILITY_TIERS[3],
  DEVICE_CAPABILITY_TIERS[4],
  DEVICE_CAPABILITY_TIERS[5],
];

const MB = 1024 * 1024;

function inferFormFactor(signals: DeviceHardwareSignals): DeviceFormFactor {
  const ua = (signals.userAgent || '').toLowerCase();
  const minScreen =
    signals.screenWidthPx !== null && signals.screenHeightPx !== null
      ? Math.min(signals.screenWidthPx, signals.screenHeightPx)
      : null;
  const maxScreen =
    signals.screenWidthPx !== null && signals.screenHeightPx !== null
      ? Math.max(signals.screenWidthPx, signals.screenHeightPx)
      : null;

  if (/ipad/.test(ua) || (/macintosh/.test(ua) && signals.maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(ua)) {
    return 'phone';
  }
  if (/android/.test(ua)) {
    // Non-mobile Android UA generally indicates a tablet or Chromebook/large screen
    if (minScreen !== null && minScreen < 600) {
      return 'phone';
    }
    return 'tablet';
  }
  if (
    /windows nt|macintosh|x11|cros/.test(ua) ||
    (!signals.coarsePointer && signals.maxTouchPoints === 0)
  ) {
    return 'desktop';
  }
  if (minScreen !== null && minScreen >= 700 && (maxScreen ?? 0) >= 960) {
    return 'tablet';
  }
  return signals.coarsePointer || signals.maxTouchPoints > 0 ? 'phone' : 'desktop';
}

function parseIosMajorVersion(ua: string): number | null {
  const match = ua.match(/(?:iphone|ipad|ipod).*os\s+(\d+)[._]/i);
  if (!match) return null;
  const ver = Number(match[1]);
  return Number.isFinite(ver) ? ver : null;
}

function parseAndroidMajorVersion(ua: string): number | null {
  const match = ua.match(/android\s+(\d+)/i);
  if (!match) return null;
  const ver = Number(match[1]);
  return Number.isFinite(ver) ? ver : null;
}

function formatSignalSummary(
  signals: DeviceHardwareSignals,
  formFactor: DeviceFormFactor
): string {
  const parts: string[] = [];
  parts.push(
    formFactor === 'desktop' ? 'Desktop/Laptop' : formFactor === 'tablet' ? 'Tablet' : 'Phone'
  );
  if (signals.deviceMemoryGb !== null) {
    parts.push(`~${signals.deviceMemoryGb} GB browser RAM`);
  }
  if (signals.hardwareConcurrency !== null) {
    parts.push(`${signals.hardwareConcurrency} CPU threads`);
  }
  if (signals.jsHeapLimitBytes !== null && signals.jsHeapLimitBytes > 0) {
    parts.push(`${Math.round(signals.jsHeapLimitBytes / MB)} MB JS heap limit`);
  }
  return parts.join(' · ');
}

/**
 * Classifies browser + hardware signals into one of the 5 Community Pedigree device tiers.
 * Never throws, and degrades gracefully to conservative mobile defaults if telemetry is missing.
 */
export function classifyDeviceCapability(
  signals: DeviceHardwareSignals
): DeviceCapabilityAssessment {
  const formFactor = inferFormFactor(signals);
  const ramGb =
    signals.deviceMemoryGb !== null && Number.isFinite(signals.deviceMemoryGb)
      ? signals.deviceMemoryGb
      : null;
  const cores =
    signals.hardwareConcurrency !== null && Number.isFinite(signals.hardwareConcurrency)
      ? signals.hardwareConcurrency
      : null;
  const heapMb =
    signals.jsHeapLimitBytes !== null && Number.isFinite(signals.jsHeapLimitBytes)
      ? signals.jsHeapLimitBytes / MB
      : null;
  const ua = signals.userAgent || '';

  let tier: DeviceCapabilityTierNumber;
  let confidence: 'measured' | 'estimated' =
    ramGb !== null || heapMb !== null ? 'measured' : 'estimated';

  if (formFactor === 'desktop') {
    if ((ramGb !== null && ramGb <= 1) || (heapMb !== null && heapMb < 130)) {
      tier = 1;
    } else if ((ramGb !== null && ramGb <= 2) || (heapMb !== null && heapMb < 280)) {
      tier = 2;
    } else if (ramGb !== null && ramGb <= 4 && cores !== null && cores <= 2) {
      tier = 3;
    } else {
      tier = 5;
    }
  } else if (formFactor === 'tablet') {
    const iosMajor = parseIosMajorVersion(ua);
    const androidMajor = parseAndroidMajorVersion(ua);
    if (ramGb !== null) {
      if (ramGb <= 1) {
        tier = 1;
      } else if (ramGb <= 3) {
        tier = 2;
      } else if (ramGb < 6) {
        tier = 3;
      } else {
        tier = 4;
      }
    } else if (iosMajor !== null) {
      if (iosMajor <= 10 || (cores !== null && cores <= 1)) {
        tier = 1;
      } else if (iosMajor <= 13 || (cores !== null && cores <= 2)) {
        tier = 2;
      } else if (iosMajor <= 15 || (cores !== null && cores <= 4)) {
        tier = 3;
      } else {
        tier = 4;
      }
    } else if (androidMajor !== null) {
      if (androidMajor <= 6 || (cores !== null && cores <= 2)) {
        tier = 1;
      } else if (androidMajor <= 9 || (cores !== null && cores <= 4)) {
        tier = 2;
      } else if (androidMajor <= 12 || (cores !== null && cores <= 6)) {
        tier = 3;
      } else {
        tier = 4;
      }
    } else if (cores !== null) {
      if (cores <= 2) tier = 1;
      else if (cores <= 4) tier = 2;
      else if (cores <= 6) tier = 3;
      else tier = 4;
    } else {
      tier = 3;
    }

    if (heapMb !== null) {
      if (heapMb < 130) {
        tier = 1;
      } else if (heapMb < 300 && tier > 2) {
        tier = 2;
      } else if (heapMb < 650 && tier > 3) {
        tier = 3;
      }
    }
  } else {
    // Phone / handheld mobile
    if (ramGb !== null) {
      if (ramGb <= 1) {
        tier = 1;
      } else if (ramGb <= 3) {
        tier = 2;
      } else if (ramGb < 6) {
        tier = 3;
      } else {
        tier = 4;
      }
    } else {
      // Safari iOS, Firefox Android, or privacy-restricted browser without navigator.deviceMemory
      confidence = heapMb !== null ? 'measured' : 'estimated';
      const iosMajor = parseIosMajorVersion(ua);
      const androidMajor = parseAndroidMajorVersion(ua);
      const minPx =
        signals.screenWidthPx !== null && signals.screenHeightPx !== null
          ? Math.min(signals.screenWidthPx, signals.screenHeightPx)
          : null;
      const dpr = signals.devicePixelRatio ?? null;

      if (iosMajor !== null) {
        // iOS does not expose deviceMemory; combine OS generation, viewport/DPR, and cores
        if (iosMajor <= 10 || (cores !== null && cores <= 1)) {
          tier = 1;
        } else if (
          iosMajor <= 13 ||
          (cores !== null && cores <= 2) ||
          (minPx !== null && minPx <= 375 && dpr !== null && dpr <= 2 && iosMajor <= 15)
        ) {
          tier = 2;
        } else if (
          iosMajor === 14 ||
          (cores !== null && cores <= 4) ||
          (minPx !== null && minPx <= 375 && dpr !== null && dpr <= 2)
        ) {
          tier = 3;
        } else {
          tier = 4;
        }
      } else if (androidMajor !== null) {
        if (androidMajor <= 6 || (cores !== null && cores <= 2)) {
          tier = 1;
        } else if (androidMajor <= 9 || (cores !== null && cores <= 4)) {
          tier = 2;
        } else if (androidMajor <= 11 || (cores !== null && cores <= 6)) {
          tier = 3;
        } else {
          tier = 4;
        }
      } else if (cores !== null) {
        if (cores <= 2) tier = 1;
        else if (cores <= 4) tier = 2;
        else if (cores <= 6) tier = 3;
        else tier = 4;
      } else {
        tier = 3;
      }
    }

    // Apply hard JS heap guardrails when performance.memory exposes a tight ceiling
    if (heapMb !== null) {
      if (heapMb < 130) {
        tier = 1;
      } else if (heapMb < 300 && tier > 2) {
        tier = 2;
      } else if (heapMb < 650 && tier > 3) {
        tier = 3;
      }
    }
  }

  const definition = DEVICE_CAPABILITY_TIERS[tier];
  return {
    tier,
    definition,
    formFactor,
    confidence,
    signalSummary: formatSignalSummary(signals, formFactor),
    signals,
    shouldApplyLowMemoryHandling: tier <= 2,
  };
}

/**
 * Evaluates current barn record counts (or projected post-import counts) against the
 * detected tier's safe working threshold.
 */
export function evaluateBarnWorkloadForTier(
  totalRecords: number,
  assessment: DeviceCapabilityAssessment
): BarnWorkloadEvaluation {
  const safeTotal = Math.max(0, Math.round(Number(totalRecords) || 0));
  const limit = assessment.definition.maxRecommendedRecords;
  if (limit === null || limit <= 0) {
    return {
      totalRecords: safeTotal,
      maxRecommendedRecords: null,
      utilizationPercent: null,
      status: 'ok',
      guidance: null,
    };
  }

  const pct = Math.min(999, Math.round((safeTotal / limit) * 100));
  if (safeTotal > limit) {
    return {
      totalRecords: safeTotal,
      maxRecommendedRecords: limit,
      utilizationPercent: pct,
      status: 'over_limit',
      guidance: `Local database size (${safeTotal.toLocaleString()} records) exceeds this ${assessment.definition.shortLabel} device's ~${limit.toLocaleString()}-record comfort limit. Enable Compact photos, avoid loading unnecessary photos on printed pedigrees, and keep recent backups exported.`,
    };
  }
  if (safeTotal >= Math.round(limit * 0.75)) {
    return {
      totalRecords: safeTotal,
      maxRecommendedRecords: limit,
      utilizationPercent: pct,
      status: 'approaching_limit',
      guidance: `Local database (${safeTotal.toLocaleString()} / ~${limit.toLocaleString()} recommended records) is approaching this device's memory ceiling (${pct}%). Compact photo optimization is recommended.`,
    };
  }
  return {
    totalRecords: safeTotal,
    maxRecommendedRecords: limit,
    utilizationPercent: pct,
    status: 'ok',
    guidance: null,
  };
}

/**
 * Returns a settings patch when a Tier 1 or Tier 2 device is not yet using
 * low-memory presets, or `null` if low-memory settings are already active.
 */
export function buildLowMemorySettingsPatch(
  settings: Pick<
    BarnSettings,
    'imageOptimizationPreset' | 'defaultGenerations' | 'includePhotoOnPedigree'
  >,
  assessment: DeviceCapabilityAssessment
): Partial<BarnSettings> | null {
  if (!assessment.shouldApplyLowMemoryHandling) return null;

  const patch: Partial<BarnSettings> = {};
  if (settings.imageOptimizationPreset !== 'compact') {
    patch.imageOptimizationPreset = 'compact';
  }
  if (settings.defaultGenerations > 3) {
    patch.defaultGenerations = 3;
  }
  if (settings.includePhotoOnPedigree) {
    patch.includePhotoOnPedigree = false;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export type OptionalBrowserFeatureKey =
  | 'wasm'
  | 'worker'
  | 'opfs'
  | 'directoryPicker'
  | 'persistStorage'
  | 'clipboard'
  | 'webShare'
  | 'webp';

export interface BrowserFeatureSignals {
  userAgent: string;
  promiseSupported: boolean;
  indexedDbSupported: boolean;
  wasmSupported: boolean;
  moduleWorkerSupported: boolean;
  opfsSupported: boolean;
  directoryPickerSupported: boolean;
  persistStorageSupported: boolean;
  clipboardWriteSupported: boolean;
  webShareFilesSupported: boolean;
  webpEncodeSupported: boolean;
  createImageBitmapSupported: boolean;
  workerRuntimeDisabled?: boolean;
}

export interface UnavailableBrowserFeature {
  key: OptionalBrowserFeatureKey;
  label: string;
  reason: string;
  fallback: string;
}

export interface BrowserCompatibilityAssessment {
  isOutdatedBrowser: boolean;
  outdatedReasons: string[];
  wasmFallbackActive: boolean;
  shouldConfirmHeavyZipExport: boolean;
  heavyZipCautionReason: string | null;
  signals: BrowserFeatureSignals;
  unavailableFeatures: UnavailableBrowserFeature[];
}

export interface HeavyZipExportGate {
  requiresConfirmation: boolean;
  title: string;
  body: string;
  advice: string;
}

function parseBrowserEngineMajors(ua: string): {
  chromeMajor: number | null;
  firefoxMajor: number | null;
  safariMajor: number | null;
  iosMajor: number | null;
  androidMajor: number | null;
} {
  const iosMajor = parseIosMajorVersion(ua);
  const androidMajor = parseAndroidMajorVersion(ua);

  const fxMatch = ua.match(/firefox\/(\d+)/i);
  const firefoxMajor = fxMatch ? Number(fxMatch[1]) : null;

  const crMatch = ua.match(/(?:chrome|crios|edg|edga|edgios)\/(\d+)/i);
  const chromeMajor = crMatch ? Number(crMatch[1]) : null;

  const isSafariLike =
    /safari/i.test(ua) && !/chrome|crios|chromium|edg|edga|edgios|fxios|firefox|opr\//i.test(ua);
  const sfMatch = isSafariLike ? ua.match(/version\/(\d+)/i) : null;
  const safariMajor = sfMatch ? Number(sfMatch[1]) : null;

  return {
    chromeMajor: chromeMajor !== null && Number.isFinite(chromeMajor) ? chromeMajor : null,
    firefoxMajor: firefoxMajor !== null && Number.isFinite(firefoxMajor) ? firefoxMajor : null,
    safariMajor: safariMajor !== null && Number.isFinite(safariMajor) ? safariMajor : null,
    iosMajor,
    androidMajor,
  };
}

/**
 * Pure TypeScript classifier evaluating browser engine age, optional API gaps,
 * WebAssembly SQLite fallback state, and memory-risk confirmation gates.
 */
export function assessBrowserCompatibility(
  signals: BrowserFeatureSignals,
  deviceTier: DeviceCapabilityTierNumber
): BrowserCompatibilityAssessment {
  const ua = signals.userAgent || '';
  const { chromeMajor, firefoxMajor, safariMajor, iosMajor, androidMajor } =
    parseBrowserEngineMajors(ua);

  const outdatedReasons: string[] = [];

  if (iosMajor !== null && iosMajor < 15) {
    outdatedReasons.push(`Older iOS version (iOS ${iosMajor}) with tighter WebKit limits`);
  }
  if (safariMajor !== null && safariMajor < 15) {
    outdatedReasons.push(`Older Safari engine (Safari ${safariMajor})`);
  }
  if (chromeMajor !== null && chromeMajor < 95) {
    outdatedReasons.push(`Older Chromium-based browser (v${chromeMajor})`);
  }
  if (firefoxMajor !== null && firefoxMajor < 102) {
    outdatedReasons.push(`Older Firefox version (v${firefoxMajor})`);
  }
  if (androidMajor !== null && androidMajor < 10) {
    outdatedReasons.push(`Older Android WebView/OS (Android ${androidMajor})`);
  }
  if (!signals.webpEncodeSupported) {
    outdatedReasons.push('Browser canvas lacks WebP encoding (falling back to JPEG compression)');
  }
  if (!signals.createImageBitmapSupported) {
    outdatedReasons.push('Browser lacks hardware createImageBitmap (using classic image decoder)');
  }

  const isOutdatedBrowser = outdatedReasons.length > 0;
  const wasmFallbackActive = !signals.wasmSupported;
  const workerFallbackActive =
    !signals.moduleWorkerSupported || Boolean(signals.workerRuntimeDisabled);

  const unavailableFeatures: UnavailableBrowserFeature[] = [];

  if (!signals.wasmSupported) {
    unavailableFeatures.push({
      key: 'wasm',
      label: 'WebAssembly SQLite Engine',
      reason: 'WebAssembly is disabled or unsupported in this browser environment.',
      fallback: 'Running safely in IndexedDB JSON mode; use Timestamped Backup (.JSON).',
    });
  }
  if (workerFallbackActive) {
    unavailableFeatures.push({
      key: 'worker',
      label: 'Background Archive Worker',
      reason: 'Background module Web Workers are unavailable or blocked here.',
      fallback: 'Processing archives asynchronously on the main browser tab thread.',
    });
  }
  if (!signals.opfsSupported) {
    unavailableFeatures.push({
      key: 'opfs',
      label: 'OPFS On-Device Vault',
      reason: 'Origin Private File System storage is unsupported in this browser version.',
      fallback: 'Retaining rolling fallback snapshots inside IndexedDB instead.',
    });
  }
  if (!signals.directoryPickerSupported) {
    unavailableFeatures.push({
      key: 'directoryPicker',
      label: 'Direct Local Folder Picker',
      reason: 'Direct folder access (showDirectoryPicker) is unsupported in this browser.',
      fallback: 'Use Share / Export Worker Delta and Timestamped Backup (.JSON) files instead.',
    });
  }
  if (!signals.persistStorageSupported) {
    unavailableFeatures.push({
      key: 'persistStorage',
      label: 'Persistent Storage Lock',
      reason: 'Manual persistent storage locking is not exposed by this browser.',
      fallback: 'Storage eviction protection is managed automatically by your browser/OS.',
    });
  }
  if (!signals.clipboardWriteSupported) {
    unavailableFeatures.push({
      key: 'clipboard',
      label: 'One-Tap Clipboard Access',
      reason: 'Programmatic clipboard access is blocked or unsupported in this context.',
      fallback: 'Download the text/Markdown report file or copy from the inline text box.',
    });
  }
  if (!signals.webShareFilesSupported) {
    unavailableFeatures.push({
      key: 'webShare',
      label: 'Native Share Sheet (Files)',
      reason: 'Native file sharing is unavailable on this browser.',
      fallback: 'Buttons automatically trigger a standard file download instead.',
    });
  }
  if (!signals.webpEncodeSupported) {
    unavailableFeatures.push({
      key: 'webp',
      label: 'WebP Photo Compression',
      reason: 'Canvas WebP encoding is unavailable on this browser version.',
      fallback: 'Automatically compressing photos to compatible JPEG format.',
    });
  }

  const shouldConfirmHeavyZipExport =
    deviceTier === 1 || isOutdatedBrowser || workerFallbackActive;

  let heavyZipCautionReason: string | null = null;
  if (shouldConfirmHeavyZipExport) {
    if (deviceTier === 1 && isOutdatedBrowser) {
      heavyZipCautionReason =
        'You appear to be on a lower-memory (Tier 1) device with an older browser version, so building a compressed .ZIP photo archive may run out of memory and close the tab.';
    } else if (deviceTier === 1) {
      heavyZipCautionReason =
        'This Tier 1 device has very limited memory (≤1 GB RAM), so building a compressed .ZIP archive with photos may exhaust tab memory.';
    } else if (isOutdatedBrowser) {
      heavyZipCautionReason =
        'You appear to be using an older browser version, where building large compressed .ZIP photo archives is more likely to run out of memory.';
    } else {
      heavyZipCautionReason =
        'Background archive Workers are unavailable in this browser, so .ZIP compression runs inside the main page tab and may struggle on large photo sets.';
    }
  }

  return {
    isOutdatedBrowser,
    outdatedReasons,
    wasmFallbackActive,
    shouldConfirmHeavyZipExport,
    heavyZipCautionReason,
    signals,
    unavailableFeatures,
  };
}

/**
 * Computes the polite confirmation prompt shown before heavy `.ZIP` exports on Tier 1
 * devices, outdated browsers, or restricted no-Worker contexts.
 */
export function getHeavyZipExportGate(
  assessment: DeviceCapabilityAssessment,
  browserCompat: BrowserCompatibilityAssessment
): HeavyZipExportGate {
  const requiresConfirmation =
    assessment.tier === 1 || browserCompat.shouldConfirmHeavyZipExport;

  if (!requiresConfirmation) {
    return {
      requiresConfirmation: false,
      title: '',
      body: '',
      advice: '',
    };
  }

  return {
    requiresConfirmation: true,
    title: 'Memory Caution for Older or Lower-Memory Device',
    body:
      browserCompat.heavyZipCautionReason ||
      'Your device or browser may have limited memory for building large compressed .ZIP files.',
    advice:
      'You can still try creating the .ZIP archive below. If it fails or reloads the page, please use Timestamped Backup (.JSON) instead — it safely backs up your herd using much less memory because of your older device or browser.',
  };
}

```

## `src/core/economicsLedger.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Local Economic Ledger, Meat/Pelt Processing Yields &
 * 4-H/FFA Youth Project Record Book Analytics Engine (`src/core/economicsLedger.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 * All monetary amounts are integer cents; all weights are integer grams; all dates
 * are pure ISO `YYYY-MM-DD` strings.
 */

import { escapeCsvCell, UTF8_BOM } from './csvExport';
import { escapeSafeHtml } from './inputSanitization';
import {
  Animal,
  BarnSettings,
  BreedingRecord,
  FeedAllocation,
  FeedBatch,
  formatCurrencyCents,
  formatReadableDate,
  formatWeight,
  isSameSpecies,
  LEDGER_CATEGORY_OPTIONS,
  LedgerCategory,
  LedgerEntry,
  normalizeCurrencyCode,
  PeltGrade,
  ProcessingLog,
  resolveSpeciesWeightUnit,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
  YouthProjectBook,
} from './models';

export interface AnimalProfitMarginRow {
  animal: Animal;
  directSaleCents: number;
  studFeesEarnedCents: number;
  ledgerIncomeCents: number;
  processingRevenueCents: number;
  totalRevenueCents: number;
  purchaseCostCents: number;
  studFeesPaidCents: number;
  allocatedFeedCostCents: number;
  ledgerExpenseCents: number;
  processingCostCents: number;
  totalCostCents: number;
  netProfitCents: number;
  marginPercent: number | null;
}

export interface LitterProfitMarginRow {
  breeding: BreedingRecord;
  label: string;
  offspringMatchedCount: number;
  offspringSalesCents: number;
  studFeesEarnedCents: number;
  ledgerIncomeCents: number;
  processingRevenueCents: number;
  totalRevenueCents: number;
  studFeesPaidCents: number;
  allocatedFeedCostCents: number;
  ledgerExpenseCents: number;
  processingCostCents: number;
  totalCostCents: number;
  netProfitCents: number;
  marginPercent: number | null;
  costPerWeanedCents: number | null;
}

export interface ExpenseCategoryBreakdownItem {
  categoryKey: string;
  label: string;
  amountCents: number;
  sharePercent: number;
}

export interface SpeciesEconomicsSummary {
  currencyCode: string;
  totalRevenueCents: number;
  totalExpenseCents: number;
  netProfitCents: number;
  marginPercent: number | null;
  animalSalesRevenueCents: number;
  studFeesEarnedCents: number;
  ledgerIncomeCents: number;
  processingRevenueCents: number;
  animalPurchaseCostsCents: number;
  studFeesPaidCents: number;
  unlinkedFeedBatchCostCents: number;
  ledgerExpensesCents: number;
  processingCostCents: number;
  receiptAttachedCount: number;
  expenseBreakdown: ExpenseCategoryBreakdownItem[];
}

export interface ProcessingSummary {
  totalLogs: number;
  scheduledCount: number;
  processedCount: number;
  cancelledCount: number;
  upcomingScheduledLogs: ProcessingLog[];
  overdueScheduledLogs: ProcessingLog[];
  totalAnimalsProcessed: number;
  totalLiveWeightGrams: number;
  totalDressedWeightGrams: number;
  averageDressOutPercent: number | null;
  totalPelts: number;
  peltGradeCounts: Record<string, number>;
  totalMeatValueCents: number;
  totalPeltValueCents: number;
  totalProcessingCostCents: number;
}

export interface YouthProjectSummary {
  project: YouthProjectBook;
  enrolledAnimals: Animal[];
  enrolledBreedings: BreedingRecord[];
  linkedLedgerEntries: LedgerEntry[];
  feedLogCount: number;
  totalFeedQuantity: number;
  totalFeedLogCostCents: number;
  ledgerIncomeCents: number;
  ledgerExpenseCents: number;
  enrolledAnimalSalesCents: number;
  enrolledAnimalPurchaseCents: number;
  totalIncomeCents: number;
  totalExpenseCents: number;
  cashNetCents: number;
  inventoryDeltaCents: number;
  netProjectProfitCents: number;
}

export function getLedgerCategoryLabel(category: LedgerCategory | string): string {
  const found = LEDGER_CATEGORY_OPTIONS.find((opt) => opt.value === category);
  return found ? found.label : category || 'Other';
}

/**
 * Computes live-to-dressed carcass yield percentage rounded to 1 decimal place.
 */
export function calculateDressOutPercent(
  liveWeightGrams: number,
  dressedWeightGrams: number
): number | undefined {
  if (
    !Number.isFinite(liveWeightGrams) ||
    !Number.isFinite(dressedWeightGrams) ||
    liveWeightGrams <= 0 ||
    dressedWeightGrams <= 0
  ) {
    return undefined;
  }
  const pct = (dressedWeightGrams / liveWeightGrams) * 100;
  return Math.round(pct * 10) / 10;
}

/**
 * Estimates proportional cost in cents for a single `FeedAllocation` from its parent `FeedBatch`.
 */
export function computeFeedAllocationCostCents(
  allocation: FeedAllocation,
  batchById: Map<string, FeedBatch>
): number {
  const batch = batchById.get(allocation.feedBatchId);
  if (!batch || !batch.totalCostCents || batch.totalCostCents <= 0) return 0;
  if (!batch.totalQuantity || batch.totalQuantity <= 0) return 0;
  if (!allocation.quantity || allocation.quantity <= 0) return 0;
  return Math.round((batch.totalCostCents * allocation.quantity) / batch.totalQuantity);
}

/**
 * Computes net profit/loss margins per individual animal within a species.
 */
export function computeAnimalProfitMargins(params: {
  animals: readonly Animal[];
  breedings: readonly BreedingRecord[];
  ledgerEntries: readonly LedgerEntry[];
  feedBatches: readonly FeedBatch[];
  feedAllocations: readonly FeedAllocation[];
  processingLogs: readonly ProcessingLog[];
  dateFromIso?: string;
  dateToIso?: string;
}): AnimalProfitMarginRow[] {
  const { animals, breedings, ledgerEntries, feedBatches, feedAllocations, processingLogs } = params;
  const from = (params.dateFromIso || '').trim();
  const to = (params.dateToIso || '').trim();
  const inRange = (d: string | undefined) => {
    if (!from && !to) return true;
    const clean = (d || '').trim();
    if (!clean) return false;
    if (from && clean < from) return false;
    if (to && clean > to) return false;
    return true;
  };

  const batchById = new Map(feedBatches.map((b) => [b.id, b]));
  const rows: AnimalProfitMarginRow[] = [];

  for (const animal of animals) {
    const directSaleCents =
      (animal.status === 'Sold' || (animal.salePriceCents || 0) > 0) &&
      inRange(animal.soldDateIso || animal.updatedAt.slice(0, 10))
        ? Math.max(0, Math.round(animal.salePriceCents || 0))
        : 0;

    const purchaseCostCents =
      (animal.purchaseCostCents || 0) > 0 &&
      inRange(animal.birthDateIso || animal.createdAt.slice(0, 10))
        ? Math.max(0, Math.round(animal.purchaseCostCents || 0))
        : 0;

    let studFeesEarnedCents = 0;
    let studFeesPaidCents = 0;
    for (const b of breedings) {
      if (!inRange(b.actualBirthDateIso || b.bredDateIso)) continue;
      const fee = Math.max(0, Math.round(b.serviceFeeCents || 0));
      if (fee <= 0) continue;
      if (b.sireId === animal.id && b.serviceFeeDirection !== 'paid') {
        studFeesEarnedCents += fee;
      }
      if (b.damId === animal.id && b.serviceFeeDirection === 'paid') {
        studFeesPaidCents += fee;
      }
    }

    let ledgerIncomeCents = 0;
    let ledgerExpenseCents = 0;
    for (const entry of ledgerEntries) {
      if (entry.linkedAnimalId !== animal.id) continue;
      if (!inRange(entry.dateIso)) continue;
      const amt = Math.max(0, Math.round(entry.amountCents || 0));
      if (entry.entryType === 'income') {
        ledgerIncomeCents += amt;
      } else {
        ledgerExpenseCents += amt;
      }
    }

    let allocatedFeedCostCents = 0;
    for (const alloc of feedAllocations) {
      if (alloc.targetType !== 'animal' || alloc.targetId !== animal.id) continue;
      if (!inRange(alloc.dateIso)) continue;
      allocatedFeedCostCents += computeFeedAllocationCostCents(alloc, batchById);
    }

    let processingRevenueCents = 0;
    let processingCostCents = 0;
    for (const log of processingLogs) {
      if (log.linkedAnimalId !== animal.id || log.status === 'Cancelled') continue;
      if (!inRange(log.harvestDateIso || log.scheduledDateIso)) continue;
      processingCostCents += Math.max(0, Math.round(log.processingCostCents || 0));
      if (log.status === 'Processed') {
        processingRevenueCents +=
          Math.max(0, Math.round(log.meatValueCents || 0)) +
          Math.max(0, Math.round(log.peltValueCents || 0));
      }
    }

    const totalRevenueCents =
      directSaleCents + studFeesEarnedCents + ledgerIncomeCents + processingRevenueCents;
    const totalCostCents =
      purchaseCostCents +
      studFeesPaidCents +
      allocatedFeedCostCents +
      ledgerExpenseCents +
      processingCostCents;
    const netProfitCents = totalRevenueCents - totalCostCents;
    const marginPercent =
      totalRevenueCents > 0
        ? Math.round(((netProfitCents / totalRevenueCents) * 100) * 10) / 10
        : null;

    if (totalRevenueCents === 0 && totalCostCents === 0) continue;

    rows.push({
      animal,
      directSaleCents,
      studFeesEarnedCents,
      ledgerIncomeCents,
      processingRevenueCents,
      totalRevenueCents,
      purchaseCostCents,
      studFeesPaidCents,
      allocatedFeedCostCents,
      ledgerExpenseCents,
      processingCostCents,
      totalCostCents,
      netProfitCents,
      marginPercent,
    });
  }

  return rows.sort(
    (a, b) =>
      b.netProfitCents - a.netProfitCents ||
      b.totalRevenueCents - a.totalRevenueCents ||
      a.animal.name.localeCompare(b.animal.name)
  );
}

/**
 * Computes net profit/loss margins per litter / breeding pairing within a species.
 */
export function computeLitterProfitMargins(params: {
  animals: readonly Animal[];
  breedings: readonly BreedingRecord[];
  ledgerEntries: readonly LedgerEntry[];
  feedBatches: readonly FeedBatch[];
  feedAllocations: readonly FeedAllocation[];
  processingLogs: readonly ProcessingLog[];
  dateFromIso?: string;
  dateToIso?: string;
}): LitterProfitMarginRow[] {
  const { animals, breedings, ledgerEntries, feedBatches, feedAllocations, processingLogs } = params;
  const from = (params.dateFromIso || '').trim();
  const to = (params.dateToIso || '').trim();
  const inRange = (d: string | undefined) => {
    if (!from && !to) return true;
    const clean = (d || '').trim();
    if (!clean) return false;
    if (from && clean < from) return false;
    if (to && clean > to) return false;
    return true;
  };

  const batchById = new Map(feedBatches.map((b) => [b.id, b]));
  const rows: LitterProfitMarginRow[] = [];

  for (const b of breedings) {
    const birthDate = (b.actualBirthDateIso || '').trim();
    if (!inRange(birthDate || b.bredDateIso)) continue;

    const matchedOffspring = birthDate
      ? animals.filter(
          (a) =>
            a.sireId === b.sireId &&
            a.damId === b.damId &&
            (a.birthDateIso || '').trim() === birthDate
        )
      : [];

    const offspringSalesCents = matchedOffspring.reduce((sum, child) => {
      if (child.status !== 'Sold' && (child.salePriceCents || 0) <= 0) return sum;
      return sum + Math.max(0, Math.round(child.salePriceCents || 0));
    }, 0);

    const fee = Math.max(0, Math.round(b.serviceFeeCents || 0));
    const studFeesEarnedCents = b.serviceFeeDirection === 'paid' ? 0 : fee;
    const studFeesPaidCents = b.serviceFeeDirection === 'paid' ? fee : 0;

    let ledgerIncomeCents = 0;
    let ledgerExpenseCents = 0;
    for (const entry of ledgerEntries) {
      if (entry.linkedBreedingId !== b.id) continue;
      const amt = Math.max(0, Math.round(entry.amountCents || 0));
      if (entry.entryType === 'income') {
        ledgerIncomeCents += amt;
      } else {
        ledgerExpenseCents += amt;
      }
    }

    let allocatedFeedCostCents = 0;
    for (const alloc of feedAllocations) {
      if (alloc.targetType !== 'litter' || alloc.targetId !== b.id) continue;
      allocatedFeedCostCents += computeFeedAllocationCostCents(alloc, batchById);
    }

    let processingRevenueCents = 0;
    let processingCostCents = 0;
    for (const log of processingLogs) {
      if (log.linkedBreedingId !== b.id || log.status === 'Cancelled') continue;
      processingCostCents += Math.max(0, Math.round(log.processingCostCents || 0));
      if (log.status === 'Processed') {
        processingRevenueCents +=
          Math.max(0, Math.round(log.meatValueCents || 0)) +
          Math.max(0, Math.round(log.peltValueCents || 0));
      }
    }

    const totalRevenueCents =
      offspringSalesCents + studFeesEarnedCents + ledgerIncomeCents + processingRevenueCents;
    const totalCostCents =
      studFeesPaidCents + allocatedFeedCostCents + ledgerExpenseCents + processingCostCents;
    const netProfitCents = totalRevenueCents - totalCostCents;
    const marginPercent =
      totalRevenueCents > 0
        ? Math.round(((netProfitCents / totalRevenueCents) * 100) * 10) / 10
        : null;
    const denominator = b.weanedCount > 0 ? b.weanedCount : b.liveCount > 0 ? b.liveCount : 0;
    const costPerWeanedCents =
      denominator > 0 && totalCostCents > 0 ? Math.round(totalCostCents / denominator) : null;

    const dateLabel = birthDate || b.bredDateIso;
    const label = `${b.damName || 'Dam'} × ${b.sireName || 'Sire'} (${dateLabel})`;

    rows.push({
      breeding: b,
      label,
      offspringMatchedCount: matchedOffspring.length,
      offspringSalesCents,
      studFeesEarnedCents,
      ledgerIncomeCents,
      processingRevenueCents,
      totalRevenueCents,
      studFeesPaidCents,
      allocatedFeedCostCents,
      ledgerExpenseCents,
      processingCostCents,
      totalCostCents,
      netProfitCents,
      marginPercent,
      costPerWeanedCents,
    });
  }

  return rows.sort(
    (a, b) =>
      (b.breeding.actualBirthDateIso || b.breeding.bredDateIso).localeCompare(
        a.breeding.actualBirthDateIso || a.breeding.bredDateIso
      ) || b.netProfitCents - a.netProfitCents
  );
}

/**
 * Evaluates aggregate species-level revenue, expenses, category breakdown, and net profit/loss.
 * Avoids double-counting FeedBatch purchase costs when a LedgerEntry already references `linkedFeedBatchId`.
 */
export function evaluateSpeciesEconomicsSummary(params: {
  animals: readonly Animal[];
  breedings: readonly BreedingRecord[];
  ledgerEntries: readonly LedgerEntry[];
  feedBatches: readonly FeedBatch[];
  processingLogs: readonly ProcessingLog[];
  currencyCode?: string;
  dateFromIso?: string;
  dateToIso?: string;
}): SpeciesEconomicsSummary {
  const currencyCode = normalizeCurrencyCode(params.currencyCode, 'USD');
  const from = (params.dateFromIso || '').trim();
  const to = (params.dateToIso || '').trim();
  const inRange = (d: string | undefined) => {
    if (!from && !to) return true;
    const clean = (d || '').trim();
    if (!clean) return false;
    if (from && clean < from) return false;
    if (to && clean > to) return false;
    return true;
  };

  let animalSalesRevenueCents = 0;
  let animalPurchaseCostsCents = 0;
  for (const a of params.animals) {
    if (
      (a.status === 'Sold' || (a.salePriceCents || 0) > 0) &&
      inRange(a.soldDateIso || a.updatedAt.slice(0, 10))
    ) {
      animalSalesRevenueCents += Math.max(0, Math.round(a.salePriceCents || 0));
    }
    if (
      (a.purchaseCostCents || 0) > 0 &&
      inRange(a.birthDateIso || a.createdAt.slice(0, 10))
    ) {
      animalPurchaseCostsCents += Math.max(0, Math.round(a.purchaseCostCents || 0));
    }
  }

  let studFeesEarnedCents = 0;
  let studFeesPaidCents = 0;
  for (const b of params.breedings) {
    if (!inRange(b.actualBirthDateIso || b.bredDateIso)) continue;
    const fee = Math.max(0, Math.round(b.serviceFeeCents || 0));
    if (fee <= 0) continue;
    if (b.serviceFeeDirection === 'paid') {
      studFeesPaidCents += fee;
    } else {
      studFeesEarnedCents += fee;
    }
  }

  let ledgerIncomeCents = 0;
  let ledgerExpensesCents = 0;
  let receiptAttachedCount = 0;
  const linkedFeedBatchIdsInLedger = new Set<string>();
  const expenseByCat = new Map<string, { label: string; amountCents: number }>();

  const addCatExpense = (categoryKey: string, label: string, cents: number) => {
    if (cents <= 0) return;
    const existing = expenseByCat.get(categoryKey);
    if (existing) {
      existing.amountCents += cents;
    } else {
      expenseByCat.set(categoryKey, { label, amountCents: cents });
    }
  };

  for (const entry of params.ledgerEntries) {
    if (entry.receiptPhotoDataUrl || entry.receiptPhotoThumbnailDataUrl) {
      receiptAttachedCount += 1;
    }
    if (!inRange(entry.dateIso)) continue;
    const amt = Math.max(0, Math.round(entry.amountCents || 0));
    if (entry.entryType === 'income') {
      ledgerIncomeCents += amt;
    } else {
      ledgerExpensesCents += amt;
      if (entry.linkedFeedBatchId) {
        linkedFeedBatchIdsInLedger.add(entry.linkedFeedBatchId);
      }
      addCatExpense(entry.category, getLedgerCategoryLabel(entry.category), amt);
    }
  }

  let unlinkedFeedBatchCostCents = 0;
  for (const batch of params.feedBatches) {
    if (linkedFeedBatchIdsInLedger.has(batch.id)) continue;
    if (!inRange(batch.purchaseDateIso)) continue;
    const cost = Math.max(0, Math.round(batch.totalCostCents || 0));
    if (cost > 0) {
      unlinkedFeedBatchCostCents += cost;
    }
  }
  addCatExpense('feed', 'Feed & Supplements', unlinkedFeedBatchCostCents);
  addCatExpense('animal_purchase', 'Stock Purchases', animalPurchaseCostsCents);
  addCatExpense('stud_fee_paid', 'Stud Fees Paid', studFeesPaidCents);

  let processingRevenueCents = 0;
  let processingCostCents = 0;
  for (const log of params.processingLogs) {
    if (log.status === 'Cancelled') continue;
    if (!inRange(log.harvestDateIso || log.scheduledDateIso)) continue;
    const pCost = Math.max(0, Math.round(log.processingCostCents || 0));
    processingCostCents += pCost;
    if (log.status === 'Processed') {
      processingRevenueCents +=
        Math.max(0, Math.round(log.meatValueCents || 0)) +
        Math.max(0, Math.round(log.peltValueCents || 0));
    }
  }
  addCatExpense('processing', 'Butcher & Pelt Processing', processingCostCents);

  const totalRevenueCents =
    animalSalesRevenueCents + studFeesEarnedCents + ledgerIncomeCents + processingRevenueCents;
  const totalExpenseCents =
    animalPurchaseCostsCents +
    studFeesPaidCents +
    unlinkedFeedBatchCostCents +
    ledgerExpensesCents +
    processingCostCents;
  const netProfitCents = totalRevenueCents - totalExpenseCents;
  const marginPercent =
    totalRevenueCents > 0
      ? Math.round(((netProfitCents / totalRevenueCents) * 100) * 10) / 10
      : null;

  const expenseBreakdown: ExpenseCategoryBreakdownItem[] = Array.from(expenseByCat.entries())
    .map(([categoryKey, info]) => ({
      categoryKey,
      label: info.label,
      amountCents: info.amountCents,
      sharePercent:
        totalExpenseCents > 0
          ? Math.round(((info.amountCents / totalExpenseCents) * 100) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.amountCents - a.amountCents);

  return {
    currencyCode,
    totalRevenueCents,
    totalExpenseCents,
    netProfitCents,
    marginPercent,
    animalSalesRevenueCents,
    studFeesEarnedCents,
    ledgerIncomeCents,
    processingRevenueCents,
    animalPurchaseCostsCents,
    studFeesPaidCents,
    unlinkedFeedBatchCostCents,
    ledgerExpensesCents,
    processingCostCents,
    receiptAttachedCount,
    expenseBreakdown,
  };
}

/**
 * Summarizes meat and pelt processing yields, scheduled butcher dates, and pelt grades.
 */
export function evaluateProcessingSummary(
  logs: readonly ProcessingLog[],
  referenceDateIso: string = todayDateIso()
): ProcessingSummary {
  let scheduledCount = 0;
  let processedCount = 0;
  let cancelledCount = 0;
  const upcomingScheduledLogs: ProcessingLog[] = [];
  const overdueScheduledLogs: ProcessingLog[] = [];
  let totalAnimalsProcessed = 0;
  let totalLiveWeightGrams = 0;
  let totalDressedWeightGrams = 0;
  let totalPelts = 0;
  const peltGradeCounts: Record<string, number> = {};
  let totalMeatValueCents = 0;
  let totalPeltValueCents = 0;
  let totalProcessingCostCents = 0;

  for (const log of logs) {
    if (log.status === 'Cancelled') {
      cancelledCount += 1;
      continue;
    }
    if (log.status === 'Scheduled') {
      scheduledCount += 1;
      if (log.scheduledDateIso && log.scheduledDateIso < referenceDateIso) {
        overdueScheduledLogs.push(log);
      } else {
        upcomingScheduledLogs.push(log);
      }
      continue;
    }
    processedCount += 1;
    totalAnimalsProcessed += Math.max(1, Math.round(log.animalCount || 1));
    if (log.liveWeightGrams > 0 && log.dressedWeightGrams > 0) {
      totalLiveWeightGrams += Math.round(log.liveWeightGrams);
      totalDressedWeightGrams += Math.round(log.dressedWeightGrams);
    } else if (log.dressedWeightGrams > 0) {
      totalDressedWeightGrams += Math.round(log.dressedWeightGrams);
    }
    const pCount = Math.max(0, Math.round(log.peltCount || 0));
    totalPelts += pCount;
    const gradeKey: PeltGrade | 'Unspecified' = log.peltGrade || 'Unspecified';
    if (pCount > 0 || log.peltGrade) {
      peltGradeCounts[gradeKey] = (peltGradeCounts[gradeKey] || 0) + Math.max(1, pCount);
    }
    totalMeatValueCents += Math.max(0, Math.round(log.meatValueCents || 0));
    totalPeltValueCents += Math.max(0, Math.round(log.peltValueCents || 0));
    totalProcessingCostCents += Math.max(0, Math.round(log.processingCostCents || 0));
  }

  upcomingScheduledLogs.sort((a, b) =>
    (a.scheduledDateIso || '9999-12-31').localeCompare(b.scheduledDateIso || '9999-12-31')
  );
  overdueScheduledLogs.sort((a, b) =>
    (a.scheduledDateIso || '').localeCompare(b.scheduledDateIso || '')
  );

  const averageDressOutPercent = calculateDressOutPercent(
    totalLiveWeightGrams,
    totalDressedWeightGrams
  ) ?? null;

  return {
    totalLogs: logs.length,
    scheduledCount,
    processedCount,
    cancelledCount,
    upcomingScheduledLogs,
    overdueScheduledLogs,
    totalAnimalsProcessed,
    totalLiveWeightGrams,
    totalDressedWeightGrams,
    averageDressOutPercent,
    totalPelts,
    peltGradeCounts,
    totalMeatValueCents,
    totalPeltValueCents,
    totalProcessingCostCents,
  };
}

/**
 * Evaluates a single 4-H / FFA Youth Project Record Book's feed logs, expenses,
 * income, inventory value delta, and net project return.
 */
export function evaluateYouthProjectSummary(
  project: YouthProjectBook,
  params: {
    animals: readonly Animal[];
    breedings: readonly BreedingRecord[];
    ledgerEntries: readonly LedgerEntry[];
  }
): YouthProjectSummary {
  const animalIdSet = new Set(project.linkedAnimalIds ?? []);
  const breedingIdSet = new Set(project.linkedBreedingIds ?? []);

  const enrolledAnimals = params.animals.filter((a) => animalIdSet.has(a.id));
  const enrolledBreedings = params.breedings.filter((b) => breedingIdSet.has(b.id));
  const linkedLedgerEntries = params.ledgerEntries
    .filter((e) => e.linkedProjectId === project.id)
    .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

  const feedLogs = project.feedLogs ?? [];
  const totalFeedQuantity = feedLogs.reduce((s, f) => s + (f.quantity || 0), 0);
  const totalFeedLogCostCents = feedLogs.reduce(
    (s, f) => s + Math.max(0, Math.round(f.costCents || 0)),
    0
  );

  let ledgerIncomeCents = 0;
  let ledgerExpenseCents = 0;
  const animalsWithLedgerSale = new Set<string>();
  for (const e of linkedLedgerEntries) {
    const amt = Math.max(0, Math.round(e.amountCents || 0));
    if (e.entryType === 'income') {
      ledgerIncomeCents += amt;
      if (e.linkedAnimalId && e.category === 'animal_sale') {
        animalsWithLedgerSale.add(e.linkedAnimalId);
      }
    } else {
      ledgerExpenseCents += amt;
    }
  }

  let enrolledAnimalSalesCents = 0;
  let enrolledAnimalPurchaseCents = 0;
  for (const a of enrolledAnimals) {
    if (!animalsWithLedgerSale.has(a.id) && (a.salePriceCents || 0) > 0) {
      enrolledAnimalSalesCents += Math.round(a.salePriceCents || 0);
    }
    if ((a.purchaseCostCents || 0) > 0) {
      enrolledAnimalPurchaseCents += Math.round(a.purchaseCostCents || 0);
    }
  }

  const totalIncomeCents = ledgerIncomeCents + enrolledAnimalSalesCents;
  const totalExpenseCents =
    totalFeedLogCostCents + ledgerExpenseCents + enrolledAnimalPurchaseCents;
  const cashNetCents = totalIncomeCents - totalExpenseCents;
  const inventoryDeltaCents =
    Math.round(project.endingInventoryValueCents || 0) -
    Math.round(project.startingInventoryValueCents || 0);
  const netProjectProfitCents = cashNetCents + inventoryDeltaCents;

  return {
    project,
    enrolledAnimals,
    enrolledBreedings,
    linkedLedgerEntries,
    feedLogCount: feedLogs.length,
    totalFeedQuantity: Number(totalFeedQuantity.toFixed(2)),
    totalFeedLogCostCents,
    ledgerIncomeCents,
    ledgerExpenseCents,
    enrolledAnimalSalesCents,
    enrolledAnimalPurchaseCents,
    totalIncomeCents,
    totalExpenseCents,
    cashNetCents,
    inventoryDeltaCents,
    netProjectProfitCents,
  };
}

/**
 * Formats species Economic Ledger entries into a UTF-8 CSV spreadsheet.
 */
export function formatEconomicsLedgerCsv(
  entries: readonly LedgerEntry[],
  currencyCode = 'USD'
): string {
  const header = [
    'Species',
    'Date',
    'Type',
    'Category',
    'Title',
    'Vendor / Party',
    'Amount',
    'Has Receipt Photo',
    'Linked Animal ID',
    'Linked Breeding ID',
    'Linked Project ID',
    'Notes',
  ];

  const rows = [...entries]
    .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''))
    .map((e) => [
      e.species,
      e.dateIso,
      e.entryType === 'income' ? 'Income' : 'Expense',
      getLedgerCategoryLabel(e.category),
      e.title,
      e.vendorOrParty,
      formatCurrencyCents(e.amountCents, currencyCode),
      e.receiptPhotoDataUrl || e.receiptPhotoThumbnailDataUrl ? 'Yes' : 'No',
      e.linkedAnimalId || '',
      e.linkedBreedingId || '',
      e.linkedProjectId || '',
      e.notes,
    ]);

  return (
    UTF8_BOM +
    [header, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n')
  );
}

/**
 * Formats Meat & Pelt Processing Logs into a UTF-8 CSV spreadsheet.
 */
export function formatProcessingLogsCsv(
  logs: readonly ProcessingLog[],
  weightUnit: WeightUnit = 'lbs_oz',
  currencyCode = 'USD'
): string {
  const header = [
    'Species',
    'Title / Batch',
    'Status',
    'Scheduled Date',
    'Harvest Date',
    'Animal Count',
    'Live Weight',
    'Dressed Weight',
    'Dress-Out %',
    'Pelts Saved',
    'Pelt Grade',
    'Pelt Notes',
    'Processing Cost',
    'Meat Value',
    'Pelt Value',
    'Notes',
  ];

  const rows = [...logs]
    .sort((a, b) =>
      (b.harvestDateIso || b.scheduledDateIso).localeCompare(
        a.harvestDateIso || a.scheduledDateIso
      )
    )
    .map((l) => {
      const pct =
        l.dressOutPercent ?? calculateDressOutPercent(l.liveWeightGrams, l.dressedWeightGrams);
      return [
        l.species,
        l.title,
        l.status,
        l.scheduledDateIso,
        l.harvestDateIso,
        l.animalCount,
        l.liveWeightGrams > 0 ? formatWeight(l.liveWeightGrams, weightUnit) : '',
        l.dressedWeightGrams > 0 ? formatWeight(l.dressedWeightGrams, weightUnit) : '',
        pct !== undefined ? `${pct.toFixed(1)}%` : '',
        l.peltCount,
        l.peltGrade || '',
        l.peltColorNotes,
        l.processingCostCents ? formatCurrencyCents(l.processingCostCents, currencyCode) : '',
        l.meatValueCents ? formatCurrencyCents(l.meatValueCents, currencyCode) : '',
        l.peltValueCents ? formatCurrencyCents(l.peltValueCents, currencyCode) : '',
        l.notes,
      ];
    });

  return (
    UTF8_BOM +
    [header, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n')
  );
}

/**
 * Generates a white-paper printable `.HTM` 4-H / FFA Youth Project Completion Report
 * ready for Print / Save-as-PDF via `PrintPreviewModal`.
 */
export function generateYouthProjectReportHtml(params: {
  summary: YouthProjectSummary;
  settings: BarnSettings;
  speciesProfile?: SpeciesProfile;
  generatedDateIso?: string;
}): string {
  const { summary, settings, speciesProfile } = params;
  const project = summary.project;
  const currency = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const weightUnit = resolveSpeciesWeightUnit(speciesProfile, settings);
  const generatedDate = params.generatedDateIso || todayDateIso();

  const animalRows =
    summary.enrolledAnimals.length > 0
      ? summary.enrolledAnimals
          .map(
            (a) => `<tr>
              <td>${escapeSafeHtml(a.tattoo || '—')}</td>
              <td>${escapeSafeHtml(a.name)}</td>
              <td>${escapeSafeHtml([a.breed, a.variety].filter(Boolean).join(' · ') || '—')}</td>
              <td>${escapeSafeHtml(a.sex)}</td>
              <td>${escapeSafeHtml(a.status)}</td>
              <td class="num">${escapeSafeHtml(formatWeight(a.weightGrams, weightUnit))}</td>
              <td class="num">${escapeSafeHtml(
                a.purchaseCostCents ? formatCurrencyCents(a.purchaseCostCents, currency) : '—'
              )}</td>
              <td class="num">${escapeSafeHtml(
                a.salePriceCents ? formatCurrencyCents(a.salePriceCents, currency) : '—'
              )}</td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="8" class="empty">No animals enrolled in this project book yet.</td></tr>`;

  const feedRows =
    (project.feedLogs ?? []).length > 0
      ? project.feedLogs
          .map(
            (fl) => `<tr>
              <td>${escapeSafeHtml(formatReadableDate(fl.dateIso))}</td>
              <td>${escapeSafeHtml(fl.feedType)}</td>
              <td class="num">${escapeSafeHtml(`${fl.quantity} ${fl.unit}`)}</td>
              <td class="num">${escapeSafeHtml(formatCurrencyCents(fl.costCents, currency))}</td>
              <td>${escapeSafeHtml(fl.notes || '—')}</td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="5" class="empty">No feed log entries recorded.</td></tr>`;

  const ledgerRows =
    summary.linkedLedgerEntries.length > 0
      ? summary.linkedLedgerEntries
          .map(
            (le) => `<tr>
              <td>${escapeSafeHtml(formatReadableDate(le.dateIso))}</td>
              <td>${escapeSafeHtml(le.entryType === 'income' ? 'Income' : 'Expense')}</td>
              <td>${escapeSafeHtml(getLedgerCategoryLabel(le.category))}</td>
              <td>${escapeSafeHtml(le.title)}</td>
              <td>${escapeSafeHtml(le.vendorOrParty || '—')}</td>
              <td class="num">${escapeSafeHtml(formatCurrencyCents(le.amountCents, currency))}</td>
            </tr>`
          )
          .join('')
      : `<tr><td colspan="6" class="empty">No project-linked ledger transactions recorded.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeSafeHtml(project.organization)} Project Book — ${escapeSafeHtml(project.projectTitle)}</title>
<style>
  @page { size: letter portrait; margin: 0.55in; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1f241f; background: #fff; margin: 0; padding: 20px; font-size: 12px; line-height: 1.45; }
  .sheet { max-width: 820px; margin: 0 auto; }
  .header { border-bottom: 2px solid #2b412e; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .org-badge { font-family: system-ui, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #2b412e; }
  h1 { margin: 2px 0 4px; font-size: 20px; color: #1a211b; }
  .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; background: #f6f7f5; border: 1px solid #d5dbd3; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-family: system-ui, sans-serif; font-size: 11px; }
  .meta-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #5b655c; font-weight: 700; }
  .meta-val { font-weight: 600; color: #1f241f; }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; font-family: system-ui, sans-serif; }
  .kpi { border: 1px solid #d5dbd3; border-radius: 6px; padding: 8px 10px; }
  .kpi-label { font-size: 9px; text-transform: uppercase; color: #5b655c; font-weight: 700; }
  .kpi-val { font-size: 14px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  h2 { font-family: system-ui, sans-serif; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #2b412e; border-bottom: 1px solid #d5dbd3; padding-bottom: 4px; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-family: system-ui, sans-serif; font-size: 11px; }
  th, td { border: 1px solid #d5dbd3; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #eef1ed; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #364137; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { text-align: center; color: #6b726c; font-style: italic; padding: 10px; }
  .box { border: 1px solid #d5dbd3; border-radius: 6px; padding: 9px 11px; margin-bottom: 10px; background: #fcfdfc; white-space: pre-wrap; }
  .sigs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-top: 28px; font-family: system-ui, sans-serif; font-size: 10px; color: #4a534b; }
  .sig-line { border-top: 1px solid #364137; padding-top: 4px; margin-top: 26px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="org-badge">${escapeSafeHtml(project.organization)} Livestock Project Record Book</div>
        <h1>${escapeSafeHtml(project.projectTitle)}</h1>
        <div>${escapeSafeHtml(settings.barnName || 'Barn')} · ${escapeSafeHtml(project.species)} Project (${escapeSafeHtml(project.projectYear)})</div>
      </div>
      <div style="text-align:right; font-family:system-ui,sans-serif; font-size:10px; color:#5b655c;">
        <div>Status: <strong>${escapeSafeHtml(project.status)}</strong></div>
        <div>Printed: ${escapeSafeHtml(formatReadableDate(generatedDate))}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div><div class="meta-label">Youth Member</div><div class="meta-val">${escapeSafeHtml(project.memberName || '—')}</div></div>
      <div><div class="meta-label">Club / FFA Chapter</div><div class="meta-val">${escapeSafeHtml(project.clubOrChapter || '—')}</div></div>
      <div><div class="meta-label">Leader / Advisor</div><div class="meta-val">${escapeSafeHtml(project.leaderOrAdvisor || '—')}</div></div>
      <div><div class="meta-label">Project Period</div><div class="meta-val">${escapeSafeHtml(formatReadableDate(project.startDateIso))} – ${escapeSafeHtml(project.endDateIso ? formatReadableDate(project.endDateIso) : 'Present')}</div></div>
      <div><div class="meta-label">Starting Inventory</div><div class="meta-val">${escapeSafeHtml(formatCurrencyCents(project.startingInventoryValueCents, currency))}</div></div>
      <div><div class="meta-label">Ending Inventory</div><div class="meta-val">${escapeSafeHtml(formatCurrencyCents(project.endingInventoryValueCents, currency))}</div></div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Total Income</div><div class="kpi-val">${escapeSafeHtml(formatCurrencyCents(summary.totalIncomeCents, currency))}</div></div>
      <div class="kpi"><div class="kpi-label">Feed &amp; Expenses</div><div class="kpi-val">${escapeSafeHtml(formatCurrencyCents(summary.totalExpenseCents, currency))}</div></div>
      <div class="kpi"><div class="kpi-label">Inventory Change</div><div class="kpi-val">${escapeSafeHtml(formatCurrencyCents(summary.inventoryDeltaCents, currency))}</div></div>
      <div class="kpi"><div class="kpi-label">Net Project Return</div><div class="kpi-val">${escapeSafeHtml(formatCurrencyCents(summary.netProjectProfitCents, currency))}</div></div>
    </div>

    <h2>1. Enrolled Project Livestock (${summary.enrolledAnimals.length})</h2>
    <table>
      <thead>
        <tr>
          <th>ID / Tattoo</th><th>Name</th><th>Breed &amp; Variety</th><th>Sex</th><th>Status</th>
          <th class="num">Weight</th><th class="num">Purchase Cost</th><th class="num">Sale Price</th>
        </tr>
      </thead>
      <tbody>${animalRows}</tbody>
    </table>

    <h2>2. Project Feed Record Log (${summary.feedLogCount} entries · ${escapeSafeHtml(String(summary.totalFeedQuantity))} total units · ${escapeSafeHtml(formatCurrencyCents(summary.totalFeedLogCostCents, currency))})</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Feed / Ration</th><th class="num">Quantity</th><th class="num">Cost</th><th>Notes</th></tr>
      </thead>
      <tbody>${feedRows}</tbody>
    </table>

    <h2>3. Project Income &amp; Expense Ledger (${summary.linkedLedgerEntries.length})</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Type</th><th>Category</th><th>Description</th><th>Vendor / Buyer</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${ledgerRows}</tbody>
    </table>

    <h2>4. Goals, Skills Gained &amp; Fair / Showmanship Notes</h2>
    <div class="box"><strong>Project Goals &amp; Reflection:</strong>\n${escapeSafeHtml(project.goalsAndReflection || 'Not recorded.')}</div>
    <div class="box"><strong>Fairs, Showmanship &amp; Community Service:</strong>\n${escapeSafeHtml(project.showAndCommunityNotes || 'Not recorded.')}</div>
    ${project.notes ? `<div class="box"><strong>Additional Notes:</strong>\n${escapeSafeHtml(project.notes)}</div>` : ''}

    <div class="sigs">
      <div class="sig-line">Member Signature &amp; Date</div>
      <div class="sig-line">Parent / Guardian Signature &amp; Date</div>
      <div class="sig-line">Leader / FFA Advisor Signature &amp; Date</div>
    </div>
  </div>
</body>
</html>`;
}
```

## `src/core/encryptedExport.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Encrypted Export Envelope Format & ZIP Wrapper (`src/core/encryptedExport.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Zero browser DOM or WebCrypto calls live here — only schema definitions, validation,
 * and `fflate` `.zip` envelope framing so encrypted exports work cleanly across Web PWA
 * (paired with `src/storage/passphraseCrypto.ts`) and React Native / Expo.
 */

import { strFromU8, strToU8, zipSync } from 'fflate';
import {
  MAX_JSON_BACKUP_BYTES,
  safeUnzipArchive,
} from './inputSanitization';

export const ENCRYPTED_ENVELOPE_FORMAT = 'community-pedigree-encrypted-v1' as const;
export const ENCRYPTED_ZIP_PAYLOAD_ENTRY = 'ENCRYPTED-PAYLOAD.json';
export const DEFAULT_PBKDF2_ITERATIONS = 210_000;

export type EncryptedPayloadKind =
  | 'json_backup'
  | 'zip_archive'
  | 'delta_log'
  | 'vault_backup';

export interface EncryptedPayloadEnvelope {
  format: typeof ENCRYPTED_ENVELOPE_FORMAT;
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  payloadKind: EncryptedPayloadKind;
  originalFileName?: string;
  createdAtIso: string;
  ciphertextBase64: string;
}

export function isEncryptedPayloadEnvelope(
  value: unknown
): value is EncryptedPayloadEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.format === ENCRYPTED_ENVELOPE_FORMAT &&
    obj.cipher === 'AES-256-GCM' &&
    obj.kdf === 'PBKDF2-SHA256' &&
    typeof obj.iterations === 'number' &&
    Number.isFinite(obj.iterations) &&
    obj.iterations >= 10_000 &&
    typeof obj.saltBase64 === 'string' &&
    obj.saltBase64.length > 0 &&
    typeof obj.ivBase64 === 'string' &&
    obj.ivBase64.length > 0 &&
    typeof obj.ciphertextBase64 === 'string' &&
    obj.ciphertextBase64.length > 0
  );
}

export function tryParseEncryptedEnvelopeJson(
  text: string
): EncryptedPayloadEnvelope | null {
  if (!text || !text.includes(ENCRYPTED_ENVELOPE_FORMAT)) return null;
  try {
    const parsed = JSON.parse(text);
    return isEncryptedPayloadEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Wraps an `EncryptedPayloadEnvelope` inside a standard `.ZIP` container with a
 * plain-text README explaining how to restore it inside Community Pedigree.
 */
export function wrapEncryptedZipContainer(
  envelope: EncryptedPayloadEnvelope,
  originalArchiveName = 'archive.zip'
): Uint8Array {
  const readme = [
    'Community Pedigree — Passphrase-Encrypted Backup Archive',
    `Created: ${envelope.createdAtIso}`,
    `Cipher: ${envelope.cipher} (${envelope.kdf}, ${envelope.iterations.toLocaleString()} iterations)`,
    `Original File: ${originalArchiveName}`,
    '',
    'To restore or merge this encrypted backup:',
    'Open Community Pedigree -> Settings -> Open Data Portability & Backups',
    '-> Restore (.JSON / .ZIP) or Merge (.JSON / .ZIP), then enter your passphrase.',
  ].join('\n');

  return zipSync({
    [ENCRYPTED_ZIP_PAYLOAD_ENTRY]: [strToU8(JSON.stringify(envelope, null, 2)), { level: 6 }],
    'README-ENCRYPTED.txt': [strToU8(readme), { level: 6 }],
  });
}

function isZipHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Checks whether raw `.ZIP` bytes are an encrypted Community Pedigree container wrapping
 * `ENCRYPTED-PAYLOAD.json` and extracts the validated envelope without modifying it.
 */
export function tryExtractEncryptedEnvelopeFromZip(
  bytes: Uint8Array,
  fileName = 'encrypted.zip'
): EncryptedPayloadEnvelope | null {
  if (!isZipHeader(bytes)) return null;
  try {
    const unzipped = safeUnzipArchive(bytes, {
      archiveName: fileName,
      maxEntries: 16,
      entryFilter: (p) =>
        p.replace(/\\/g, '/').toLowerCase() === ENCRYPTED_ZIP_PAYLOAD_ENTRY.toLowerCase(),
    });
    const entryBytes =
      unzipped[ENCRYPTED_ZIP_PAYLOAD_ENTRY] ||
      Object.values(unzipped)[0];
    if (!entryBytes || entryBytes.byteLength > MAX_JSON_BACKUP_BYTES) {
      return null;
    }
    return tryParseEncryptedEnvelopeJson(strFromU8(entryBytes));
  } catch {
    return null;
  }
}
```

## `src/core/facilityBoard.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Facility Pen Board & Hutch-Row Domain Engine (`src/core/facilityBoard.ts`).
 *
 * Groups physical housing units (`CageLocation`) by barn section / row / pasture,
 * links each pen to its active occupants (`IMP-028`), feedlot inventory stock/thresholds,
 * recurring maintenance schedules (pure UTC calendar math via `Date.UTC`), open linked tasks,
 * unassigned active animals, and unregistered housing labels.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import {
  CageOccupancyEvaluation,
  evaluateSpeciesCagesOccupancy,
  isCageOccupyingAnimal,
  normalizeCageLabelKey,
  SpeciesCagesOccupancySummary,
} from './barnAlerts';
import {
  addDaysIso,
  Animal,
  BarnTask,
  CageLocation,
  HousingUnitType,
  isSameSpecies,
  todayDateIso,
} from './models';

export type MaintenanceDueState =
  | 'none'
  | 'unlogged'
  | 'ok'
  | 'due_soon'
  | 'due_today'
  | 'overdue';

export interface CageMaintenanceEvaluation {
  hasSchedule: boolean;
  intervalDays: number;
  taskLabel: string;
  lastCompletedDateIso: string;
  nextDueDateIso: string;
  daysUntilDue: number | null;
  state: MaintenanceDueState;
  needsAttention: boolean;
  statusText: string;
}

export interface CageFeedEvaluation {
  hasFeedLink: boolean;
  feedLotName: string;
  stockRemaining: number;
  stockUnit: string;
  dailyRationNote: string;
  lowThreshold: number;
  isLowStock: boolean;
  isDepleted: boolean;
  stockSummaryLabel: string;
}

export interface FacilityPenCardModel {
  cage: CageLocation;
  unitType: HousingUnitType;
  sectionName: string;
  occupancy: CageOccupancyEvaluation;
  maintenance: CageMaintenanceEvaluation;
  feed: CageFeedEvaluation;
  openLinkedTasks: BarnTask[];
}

export interface FacilitySectionGroup {
  sectionKey: string;
  sectionName: string;
  pens: FacilityPenCardModel[];
  totalPens: number;
  occupiedPens: number;
  totalOccupants: number;
  totalCapacity: number;
  overCapacityCount: number;
  maintenanceAttentionCount: number;
  lowFeedCount: number;
  occupantAnimals: Animal[];
}

export interface FacilityFeedLotRollup {
  lotKey: string;
  feedLotName: string;
  penIds: string[];
  penLabels: string[];
  penCount: number;
  animalCount: number;
  totalStockRemaining: number;
  stockUnit: string;
  lowStockPenCount: number;
  hasLowStock: boolean;
}

export interface UnregisteredCageGroup {
  labelKey: string;
  label: string;
  animals: Animal[];
}

export interface FacilityBoardModel {
  speciesName: string;
  todayIso: string;
  occupancySummary: SpeciesCagesOccupancySummary;
  sections: FacilitySectionGroup[];
  allPens: FacilityPenCardModel[];
  byCageId: Map<string, FacilityPenCardModel>;
  feedLots: FacilityFeedLotRollup[];
  unassignedActiveAnimals: Animal[];
  unregisteredCages: UnregisteredCageGroup[];
  totals: {
    totalPens: number;
    occupiedPens: number;
    emptyPens: number;
    totalOccupants: number;
    totalCapacity: number;
    overCapacityPens: number;
    maintenanceDueOrOverdue: number;
    lowFeedPens: number;
    unassignedCount: number;
    unregisteredLabelsCount: number;
  };
}

export type FacilityBoardFilter =
  | 'all'
  | 'over_capacity'
  | 'maintenance_due'
  | 'low_feed'
  | 'open'
  | 'occupied';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateToUtcDayNumber(iso: string): number | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(ms / 86_400_000);
}

/**
 * Pure calendar day difference (`targetIso - baseIso`) using `Date.UTC` (zero DST/timezone drift).
 */
export function diffCalendarDaysIso(baseIso: string, targetIso: string): number | null {
  const a = parseIsoDateToUtcDayNumber(baseIso);
  const b = parseIsoDateToUtcDayNumber(targetIso);
  if (a === null || b === null) return null;
  return b - a;
}

/**
 * Natural alphanumeric comparator (`Row 2` before `Row 10`, `Hutch R-02` before `Hutch R-10`).
 */
export function compareNaturalLabels(a: string, b: string): number {
  const tokensA = a.trim().split(/(\d+)/);
  const tokensB = b.trim().split(/(\d+)/);
  const len = Math.max(tokensA.length, tokensB.length);
  for (let i = 0; i < len; i++) {
    const ta = tokensA[i] ?? '';
    const tb = tokensB[i] ?? '';
    if (ta === tb) continue;
    const isNumA = /^\d+$/.test(ta);
    const isNumB = /^\d+$/.test(tb);
    if (isNumA && isNumB) {
      const diff = Number(ta) - Number(tb);
      if (diff !== 0) return diff;
    }
    const cmp = ta.localeCompare(tb, undefined, { sensitivity: 'base' });
    if (cmp !== 0) return cmp;
  }
  return a.localeCompare(b);
}

/**
 * Infers a clean default housing unit type when legacy `CageLocation` rows lack `unitType`.
 */
export function inferHousingUnitType(cage: Pick<CageLocation, 'unitType' | 'label' | 'section'>): HousingUnitType {
  if (cage.unitType) return cage.unitType;
  const combined = `${cage.label || ''} ${cage.section || ''}`.toLowerCase();
  if (/\b(?:pasture|paddock|field|grazing|lot)\b/.test(combined)) return 'pasture';
  if (/\b(?:stall|barn\s+bay|box\s+stall)\b/.test(combined)) return 'stall';
  if (/\b(?:colony|run|tractor)\b/.test(combined)) return 'colony';
  if (/\b(?:pen|kidding|lambing|farrowing|growout)\b/.test(combined)) return 'pen';
  if (/\b(?:hutch)\b/.test(combined)) return 'hutch';
  return 'cage';
}

export function formatHousingUnitTypeLabel(unitType: HousingUnitType): string {
  switch (unitType) {
    case 'hutch':
      return 'Hutch';
    case 'cage':
      return 'Cage';
    case 'pen':
      return 'Pen';
    case 'stall':
      return 'Stall';
    case 'pasture':
      return 'Pasture';
    case 'colony':
      return 'Colony';
    default:
      return 'Cage';
  }
}

/**
 * Evaluates recurring maintenance status for a single pen using pure calendar dates.
 */
export function evaluateCageMaintenanceStatus(
  cage: CageLocation,
  todayIso: string = todayDateIso()
): CageMaintenanceEvaluation {
  const intervalDays = Math.max(0, Math.round(Number(cage.maintenanceIntervalDays) || 0));
  const taskLabel = (cage.maintenanceTaskLabel || '').trim() || 'Sanitize & clean pen';
  const lastCompletedDateIso = (cage.lastMaintenanceDateIso || '').trim();

  if (intervalDays <= 0) {
    return {
      hasSchedule: false,
      intervalDays: 0,
      taskLabel: '',
      lastCompletedDateIso,
      nextDueDateIso: '',
      daysUntilDue: null,
      state: 'none',
      needsAttention: false,
      statusText: 'No recurring schedule',
    };
  }

  if (!ISO_DATE_RE.test(lastCompletedDateIso)) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso: '',
      nextDueDateIso: todayIso,
      daysUntilDue: 0,
      state: 'unlogged',
      needsAttention: true,
      statusText: `Every ${intervalDays}d · Never logged`,
    };
  }

  const nextDueDateIso = addDaysIso(lastCompletedDateIso, intervalDays);
  const daysUntilDue = diffCalendarDaysIso(todayIso, nextDueDateIso);

  if (daysUntilDue === null) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso: '',
      daysUntilDue: null,
      state: 'unlogged',
      needsAttention: true,
      statusText: `Every ${intervalDays}d · Check date`,
    };
  }

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso,
      daysUntilDue,
      state: 'overdue',
      needsAttention: true,
      statusText: `Overdue by ${overdueDays}d (due ${nextDueDateIso})`,
    };
  }

  if (daysUntilDue === 0) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso,
      daysUntilDue,
      state: 'due_today',
      needsAttention: true,
      statusText: `Due today (${nextDueDateIso})`,
    };
  }

  if (daysUntilDue <= 2) {
    return {
      hasSchedule: true,
      intervalDays,
      taskLabel,
      lastCompletedDateIso,
      nextDueDateIso,
      daysUntilDue,
      state: 'due_soon',
      needsAttention: false,
      statusText: `Due in ${daysUntilDue}d (${nextDueDateIso})`,
    };
  }

  return {
    hasSchedule: true,
    intervalDays,
    taskLabel,
    lastCompletedDateIso,
    nextDueDateIso,
    daysUntilDue,
    state: 'ok',
    needsAttention: false,
    statusText: `Next due ${nextDueDateIso} (in ${daysUntilDue}d)`,
  };
}

/**
 * Evaluates feedlot inventory linkage and low-stock status for a single pen.
 */
export function evaluateCageFeedStatus(cage: CageLocation): CageFeedEvaluation {
  const feedLotName = (cage.feedLotName || '').trim();
  const dailyRationNote = (cage.dailyRationNote || '').trim();
  const stockUnit = (cage.feedStockUnit || '').trim() || 'lbs';
  const stockRemaining =
    Number.isFinite(Number(cage.feedStockRemaining)) && Number(cage.feedStockRemaining) > 0
      ? Math.round(Number(cage.feedStockRemaining) * 100) / 100
      : 0;
  const lowThreshold =
    Number.isFinite(Number(cage.feedLowThreshold)) && Number(cage.feedLowThreshold) > 0
      ? Math.round(Number(cage.feedLowThreshold) * 100) / 100
      : 0;

  const hasFeedLink = Boolean(feedLotName || dailyRationNote || stockRemaining > 0 || lowThreshold > 0);
  const isDepleted = hasFeedLink && lowThreshold > 0 && stockRemaining <= 0;
  const isLowStock = hasFeedLink && lowThreshold > 0 && stockRemaining <= lowThreshold;

  let stockSummaryLabel = '';
  if (hasFeedLink) {
    if (stockRemaining > 0 || lowThreshold > 0) {
      stockSummaryLabel = `${stockRemaining} ${stockUnit} on hand`;
      if (isDepleted) {
        stockSummaryLabel += ' (Out)';
      } else if (isLowStock) {
        stockSummaryLabel += ` (Low ≤ ${lowThreshold})`;
      }
    } else if (dailyRationNote) {
      stockSummaryLabel = dailyRationNote;
    } else {
      stockSummaryLabel = feedLotName;
    }
  }

  return {
    hasFeedLink,
    feedLotName,
    stockRemaining,
    stockUnit,
    dailyRationNote,
    lowThreshold,
    isLowStock,
    isDepleted,
    stockSummaryLabel,
  };
}

/**
 * Builds a complete, single-pass visual Facility Pen Board model for a single species.
 */
export function buildFacilityBoardModel(params: {
  cages: readonly CageLocation[];
  animals: readonly Animal[];
  tasks: readonly BarnTask[];
  speciesName: string;
  todayIso?: string;
}): FacilityBoardModel {
  const todayIso = params.todayIso || todayDateIso();
  const speciesCages = params.cages.filter((c) => isSameSpecies(c.species, params.speciesName));
  const speciesAnimals = params.animals.filter((a) => isSameSpecies(a.species, params.speciesName));
  const openSpeciesTasks = params.tasks.filter(
    (t) => !t.completed && isSameSpecies(t.species, params.speciesName)
  );

  const occupancySummary = evaluateSpeciesCagesOccupancy(
    speciesCages,
    speciesAnimals,
    params.speciesName
  );

  // Index open tasks by linkedAnimalId for O(1) attachment to pens
  const openTasksByAnimalId = new Map<string, BarnTask[]>();
  for (const task of openSpeciesTasks) {
    if (!task.linkedAnimalId) continue;
    const bucket = openTasksByAnimalId.get(task.linkedAnimalId);
    if (bucket) bucket.push(task);
    else openTasksByAnimalId.set(task.linkedAnimalId, [task]);
  }

  const allPens: FacilityPenCardModel[] = [];
  const byCageId = new Map<string, FacilityPenCardModel>();
  const sectionBuckets = new Map<string, { name: string; pens: FacilityPenCardModel[] }>();
  const feedLotMap = new Map<
    string,
    {
      feedLotName: string;
      penIds: string[];
      penLabels: string[];
      animalCount: number;
      totalStockRemaining: number;
      stockUnit: string;
      lowStockPenCount: number;
    }
  >();

  let occupiedPens = 0;
  let emptyPens = 0;
  let totalOccupants = 0;
  let totalCapacity = 0;
  let overCapacityPens = 0;
  let maintenanceDueOrOverdue = 0;
  let lowFeedPens = 0;

  for (const cage of speciesCages) {
    const occupancy = occupancySummary.byCageId.get(cage.id);
    if (!occupancy) continue;

    const maintenance = evaluateCageMaintenanceStatus(cage, todayIso);
    const feed = evaluateCageFeedStatus(cage);
    const unitType = inferHousingUnitType(cage);
    const sectionName = (cage.section || '').trim() || 'General Barn';
    const sectionKey = sectionName.toLowerCase();

    // Collect open tasks tied to occupants OR referencing `[CageLabel]` in task title
    const seenTaskIds = new Set<string>();
    const openLinkedTasks: BarnTask[] = [];
    const cageBracketNeedle = `[${cage.label.trim().toLowerCase()}]`;
    for (const occ of occupancy.occupants) {
      const animalTasks = openTasksByAnimalId.get(occ.id);
      if (!animalTasks) continue;
      for (const t of animalTasks) {
        if (!seenTaskIds.has(t.id)) {
          seenTaskIds.add(t.id);
          openLinkedTasks.push(t);
        }
      }
    }
    if (cage.label.trim()) {
      for (const t of openSpeciesTasks) {
        if (seenTaskIds.has(t.id)) continue;
        if (t.title.toLowerCase().includes(cageBracketNeedle)) {
          seenTaskIds.add(t.id);
          openLinkedTasks.push(t);
        }
      }
    }
    openLinkedTasks.sort((a, b) => (a.dueDateIso || '9999').localeCompare(b.dueDateIso || '9999'));

    const card: FacilityPenCardModel = {
      cage,
      unitType,
      sectionName,
      occupancy,
      maintenance,
      feed,
      openLinkedTasks,
    };

    allPens.push(card);
    byCageId.set(cage.id, card);

    if (occupancy.occupantCount > 0) occupiedPens += 1;
    else emptyPens += 1;
    totalOccupants += occupancy.occupantCount;
    totalCapacity += occupancy.capacity;
    if (occupancy.isOverCapacity) overCapacityPens += 1;
    if (maintenance.needsAttention) maintenanceDueOrOverdue += 1;
    if (feed.isLowStock) lowFeedPens += 1;

    let sec = sectionBuckets.get(sectionKey);
    if (!sec) {
      sec = { name: sectionName, pens: [] };
      sectionBuckets.set(sectionKey, sec);
    }
    sec.pens.push(card);

    if (feed.feedLotName) {
      const lotKey = feed.feedLotName.toLowerCase();
      let lot = feedLotMap.get(lotKey);
      if (!lot) {
        lot = {
          feedLotName: feed.feedLotName,
          penIds: [],
          penLabels: [],
          animalCount: 0,
          totalStockRemaining: 0,
          stockUnit: feed.stockUnit,
          lowStockPenCount: 0,
        };
        feedLotMap.set(lotKey, lot);
      }
      lot.penIds.push(cage.id);
      lot.penLabels.push(cage.label);
      lot.animalCount += occupancy.occupantCount;
      lot.totalStockRemaining =
        Math.round((lot.totalStockRemaining + feed.stockRemaining) * 100) / 100;
      if (feed.isLowStock) {
        lot.lowStockPenCount += 1;
      }
    }
  }

  // Sort pens within each section naturally, and sort sections naturally with General Barn last
  const sections: FacilitySectionGroup[] = Array.from(sectionBuckets.entries())
    .map(([sectionKey, bucket]) => {
      const sortedPens = [...bucket.pens].sort((a, b) =>
        compareNaturalLabels(a.cage.label, b.cage.label)
      );
      const seenOcc = new Set<string>();
      const occupantAnimals: Animal[] = [];
      let secOccupied = 0;
      let secOccupants = 0;
      let secCap = 0;
      let secOver = 0;
      let secMaint = 0;
      let secLowFeed = 0;
      for (const pen of sortedPens) {
        if (pen.occupancy.occupantCount > 0) secOccupied += 1;
        secOccupants += pen.occupancy.occupantCount;
        secCap += pen.occupancy.capacity;
        if (pen.occupancy.isOverCapacity) secOver += 1;
        if (pen.maintenance.needsAttention) secMaint += 1;
        if (pen.feed.isLowStock) secLowFeed += 1;
        for (const a of pen.occupancy.occupants) {
          if (!seenOcc.has(a.id)) {
            seenOcc.add(a.id);
            occupantAnimals.push(a);
          }
        }
      }
      return {
        sectionKey,
        sectionName: bucket.name,
        pens: sortedPens,
        totalPens: sortedPens.length,
        occupiedPens: secOccupied,
        totalOccupants: secOccupants,
        totalCapacity: secCap,
        overCapacityCount: secOver,
        maintenanceAttentionCount: secMaint,
        lowFeedCount: secLowFeed,
        occupantAnimals,
      };
    })
    .sort((a, b) => {
      if (a.sectionKey === 'general barn' && b.sectionKey !== 'general barn') return 1;
      if (b.sectionKey === 'general barn' && a.sectionKey !== 'general barn') return -1;
      return compareNaturalLabels(a.sectionName, b.sectionName);
    });

  // Identify unassigned active animals & animals sitting in unregistered cageLocation strings
  const unassignedActiveAnimals: Animal[] = [];
  const unregisteredMap = new Map<string, { label: string; animals: Animal[] }>();

  for (const animal of speciesAnimals) {
    if (!isCageOccupyingAnimal(animal)) continue;
    const rawLabel = (animal.cageLocation || '').trim();
    if (!rawLabel) {
      unassignedActiveAnimals.push(animal);
      continue;
    }
    const key = normalizeCageLabelKey(rawLabel);
    if (!occupancySummary.byLabelKey.has(key)) {
      let bucket = unregisteredMap.get(key);
      if (!bucket) {
        bucket = { label: rawLabel, animals: [] };
        unregisteredMap.set(key, bucket);
      }
      bucket.animals.push(animal);
    }
  }

  unassignedActiveAnimals.sort((a, b) =>
    (a.name || '').localeCompare(b.name || '') || (a.tattoo || '').localeCompare(b.tattoo || '')
  );

  const unregisteredCages: UnregisteredCageGroup[] = Array.from(unregisteredMap.entries())
    .map(([labelKey, entry]) => ({
      labelKey,
      label: entry.label,
      animals: [...entry.animals].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    }))
    .sort((a, b) => compareNaturalLabels(a.label, b.label));

  const feedLots: FacilityFeedLotRollup[] = Array.from(feedLotMap.entries())
    .map(([lotKey, entry]) => ({
      lotKey,
      feedLotName: entry.feedLotName,
      penIds: entry.penIds,
      penLabels: [...entry.penLabels].sort(compareNaturalLabels),
      penCount: entry.penIds.length,
      animalCount: entry.animalCount,
      totalStockRemaining: entry.totalStockRemaining,
      stockUnit: entry.stockUnit,
      lowStockPenCount: entry.lowStockPenCount,
      hasLowStock: entry.lowStockPenCount > 0,
    }))
    .sort((a, b) => Number(b.hasLowStock) - Number(a.hasLowStock) || compareNaturalLabels(a.feedLotName, b.feedLotName));

  return {
    speciesName: params.speciesName,
    todayIso,
    occupancySummary,
    sections,
    allPens,
    byCageId,
    feedLots,
    unassignedActiveAnimals,
    unregisteredCages,
    totals: {
      totalPens: allPens.length,
      occupiedPens,
      emptyPens,
      totalOccupants,
      totalCapacity,
      overCapacityPens,
      maintenanceDueOrOverdue,
      lowFeedPens,
      unassignedCount: unassignedActiveAnimals.length,
      unregisteredLabelsCount: unregisteredCages.length,
    },
  };
}

/**
 * Filters a pen card against a Facility Board quick-filter pill.
 */
export function matchesFacilityBoardFilter(
  pen: FacilityPenCardModel,
  filter: FacilityBoardFilter
): boolean {
  switch (filter) {
    case 'over_capacity':
      return pen.occupancy.isOverCapacity;
    case 'maintenance_due':
      return pen.maintenance.needsAttention || pen.maintenance.state === 'due_soon';
    case 'low_feed':
      return pen.feed.isLowStock;
    case 'open':
      return pen.occupancy.occupantCount === 0 || pen.occupancy.availableSpots > 0;
    case 'occupied':
      return pen.occupancy.occupantCount > 0;
    case 'all':
    default:
      return true;
  }
}

/**
 * Builds a Master Task List recurring maintenance reminder draft for the next cycle
 * after logging maintenance on a pen.
 */
export function buildCageMaintenanceTaskDraft(
  cage: CageLocation,
  completedDateIso: string = todayDateIso()
): Omit<BarnTask, 'id' | 'createdAt' | 'updatedAt'> | null {
  const intervalDays = Math.max(0, Math.round(Number(cage.maintenanceIntervalDays) || 0));
  if (intervalDays <= 0) return null;
  const nextDue = addDaysIso(completedDateIso, intervalDays);
  if (!nextDue) return null;
  const label = (cage.maintenanceTaskLabel || '').trim() || 'Sanitize & clean pen';
  return {
    species: cage.species,
    title: `[${cage.label}] ${label}`,
    category: 'Care',
    priority: 'Normal',
    dueDateIso: nextDue,
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
  };
}
```

## `src/core/feedInventory.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Feed Inventory Ledger, Tag OCR Parser & Biosecurity Auto-Purge Engine
 * (`src/core/feedInventory.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 * Uses explicit `Date.UTC` calendar math via `diffCalendarDaysIso` for 30/60/90-day
 * biosecurity image purge eligibility.
 */

import { diffCalendarDaysIso } from './facilityBoard';
import { FEED_MANUFACTURER_DIRECTORY } from './feedManufacturerDirectory';
import {
  Animal,
  BreedingRecord,
  CageLocation,
  FeedAllocation,
  FeedBatch,
  FeedPurgeWindowDays,
  formatCurrencyCents,
  isSameSpecies,
  nowIsoUtc,
  todayDateIso,
} from './models';

export interface FeedTagOcrParseResult {
  lotCandidates: string[];
  bestLotNumber: string;
  millCode: string;
  manufactureDateIso: string;
  detectedBrand: string;
  detectedBagWeight?: {
    value: number;
    unit: string;
  };
  detectedProteinPercent?: number;
  sanitizedRawText: string;
}

const LOT_BLACKLIST = new Set([
  'NUMBER',
  'CODE',
  'DATE',
  'GUARANTEED',
  'ANALYSIS',
  'PROTEIN',
  'CRUDE',
  'FIBER',
  'FAT',
  'RABBIT',
  'PELLET',
  'PELLETS',
  'FEED',
  'WEIGHT',
  'NET',
  'LBS',
  'TOTAL',
  'BATCH',
  'PLANT',
  'MILL',
  'STAMP',
  'BEST',
  'BEFORE',
  'EXPIRES',
  'USA',
]);

function normalizeLotToken(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '')
    .slice(0, 32);
}

function isPlausibleLotCode(token: string): boolean {
  if (token.length < 4 || token.length > 28) return false;
  if (LOT_BLACKLIST.has(token)) return false;
  // Must contain at least one digit so plain words aren't treated as mill lot codes
  if (!/\d/.test(token)) return false;
  // Avoid pure prices or percentages
  if (/^\d+\.\d{2}$/.test(token)) return false;
  return /^[A-Z0-9][A-Z0-9\-/._]{2,27}[A-Z0-9]$/.test(token);
}

function parseTagDateToIso(rawDate: string): string {
  const clean = rawDate.trim();
  const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(clean);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const mdy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(clean);
  if (mdy) {
    const m = Number(mdy[1]);
    const d = Number(mdy[2]);
    let y = Number(mdy[3]);
    if (y < 100) y += 2000;
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}

/**
 * Extracts structured mill lot numbers, mill/plant codes, weights, protein %,
 * manufacture dates, and feed manufacturer names from raw OCR or pasted tag text.
 */
export function extractFeedTagDetailsFromOcrText(rawText: string): FeedTagOcrParseResult {
  const sanitizedRawText = (rawText || '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, 4000);

  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (rawToken: string) => {
    const clean = normalizeLotToken(rawToken);
    if (!clean || seen.has(clean) || !isPlausibleLotCode(clean)) return;
    seen.add(clean);
    candidates.push(clean);
  };

  // 1. Explicit LOT / BATCH / RUN / CODE markers (highest confidence)
  const explicitLotRegexes = [
    /\b(?:LOT|BATCH|RUN|LOTE|LOT\s*NO\.?|LOT\s*#|BATCH\s*#)\s*[:#=-]?\s*([A-Z0-9][A-Z0-9\-/._]{3,24})/gi,
    /\bL\s*[:#-]\s*([A-Z0-9][A-Z0-9\-/._]{3,22})/gi,
  ];
  for (const re of explicitLotRegexes) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(sanitizedRawText)) !== null) {
      if (match[1]) pushCandidate(match[1]);
    }
  }

  // 2. Mill / Plant code extraction
  let millCode = '';
  const millMatch = /\b(?:MILL|PLANT|PLT|FACILITY)\s*(?:CODE|ID|NO\.?|#)?\s*[:#=-]?\s*([A-Z0-9\-]{2,14})/i.exec(
    sanitizedRawText
  );
  if (millMatch?.[1]) {
    millCode = normalizeLotToken(millMatch[1]);
  }

  // 3. Common alphanumeric mill stamp tokens (letters + digits, e.g., 4291A-0814, 26JAN14B, P12-26104, 26088A)
  const stampPatterns = [
    /\b([A-Z]{1,4}\d{2,6}[A-Z0-9\-]{1,12})\b/gi,
    /\b(\d{4,6}[A-Z]{1,3}(?:-[A-Z0-9]{1,8})?)\b/gi,
    /\b(\d{2}[A-Z]{3}\d{2}[A-Z0-9]{0,4})\b/gi,
  ];
  for (const re of stampPatterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(sanitizedRawText)) !== null) {
      if (match[1]) pushCandidate(match[1]);
    }
  }

  // 4. Manufacture / Stamp date
  let manufactureDateIso = '';
  const mfgDateMatch =
    /\b(?:MFG|MFD|PROD|PACKED|STAMP(?:ED)?|DATE)\s*(?:DATE)?\s*[:#=-]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i.exec(
      sanitizedRawText
    );
  if (mfgDateMatch?.[1]) {
    manufactureDateIso = parseTagDateToIso(mfgDateMatch[1]);
  }
  if (!manufactureDateIso) {
    const anyDate = /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/.exec(
      sanitizedRawText
    );
    if (anyDate?.[1]) {
      manufactureDateIso = parseTagDateToIso(anyDate[1]);
    }
  }

  // 5. Net weight detection (e.g. 50 LB, 50#, 40 LBS, 25 KG)
  let detectedBagWeight: { value: number; unit: string } | undefined;
  const weightMatch =
    /\b(?:NET\s*WT\.?\s*[:#=-]?\s*)?(\d{1,3}(?:\.\d{1,2})?)\s*(LBS?|POUNDS?|#|KG|KILOGRAMS?)\b/i.exec(
      sanitizedRawText
    );
  if (weightMatch) {
    const val = Number(weightMatch[1]);
    const rawUnit = weightMatch[2].toLowerCase();
    if (Number.isFinite(val) && val > 0 && val <= 2500) {
      const unit = rawUnit.startsWith('k') ? 'kg' : 'lbs';
      detectedBagWeight = { value: Math.round(val * 100) / 100, unit };
    }
  }

  // 6. Crude protein % detection (e.g. "Crude Protein (Min) 16.0%" or "18% Pellet")
  let detectedProteinPercent: number | undefined;
  const proteinLabelMatch =
    /CRUDE\s*PROTEIN(?:\s*\(?MIN\.?\)?)?\s*[:#=-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i.exec(
      sanitizedRawText
    );
  const pctMatch =
    proteinLabelMatch || /\b(\d{2}(?:\.\d)?)\s*%\s*(?:PROTEIN|PELLET|SHOW|RABBIT|FEED)\b/i.exec(sanitizedRawText);
  if (pctMatch?.[1]) {
    const pct = Number(pctMatch[1]);
    if (Number.isFinite(pct) && pct >= 5 && pct <= 55) {
      detectedProteinPercent = Math.round(pct * 10) / 10;
    }
  }

  // 7. Manufacturer / Brand detection against bundled offline directory
  let detectedBrand = '';
  const lowerText = sanitizedRawText.toLowerCase();
  for (const entry of FEED_MANUFACTURER_DIRECTORY) {
    if (entry.category !== 'manufacturer') continue;
    if (entry.aliases.some((alias) => lowerText.includes(alias))) {
      detectedBrand = entry.name.split(' (')[0].split(' /')[0];
      break;
    }
  }

  return {
    lotCandidates: candidates,
    bestLotNumber: candidates[0] || '',
    millCode,
    manufactureDateIso,
    detectedBrand,
    detectedBagWeight,
    detectedProteinPercent,
    sanitizedRawText,
  };
}

export interface FeedPurgeCandidate {
  batch: FeedBatch;
  capturedDateIso: string;
  daysSinceCapture: number;
  bytesToReclaim: number;
}

/**
 * Finds feed batches whose attached raw/compressed tag photo has exceeded the configured
 * 30/60/90-day biosecurity retention window AND already has a lot number indexed.
 */
export function findPurgeEligibleFeedTagPhotos(
  batches: readonly FeedBatch[],
  purgeWindowDays: FeedPurgeWindowDays,
  todayIso: string = todayDateIso()
): FeedPurgeCandidate[] {
  if (!purgeWindowDays || purgeWindowDays <= 0) return [];
  const candidates: FeedPurgeCandidate[] = [];

  for (const batch of batches) {
    const hasPhoto = Boolean(batch.tagPhotoDataUrl || batch.tagPhotoThumbnailDataUrl);
    if (!hasPhoto) continue;
    // Never auto-purge before a lot number has been indexed
    if (!batch.lotNumber || !batch.lotNumber.trim()) continue;
    const capturedDateIso =
      batch.tagPhotoCapturedDateIso ||
      batch.purchaseDateIso ||
      (batch.createdAt ? batch.createdAt.slice(0, 10) : '');
    if (!capturedDateIso) continue;
    const ageDays = diffCalendarDaysIso(capturedDateIso, todayIso);
    if (ageDays === null || ageDays < purgeWindowDays) continue;

    const bytesToReclaim =
      batch.tagPhotoBytes ||
      (batch.tagPhotoDataUrl?.length || 0) + (batch.tagPhotoThumbnailDataUrl?.length || 0);

    candidates.push({
      batch,
      capturedDateIso,
      daysSinceCapture: ageDays,
      bytesToReclaim,
    });
  }

  return candidates.sort((a, b) => b.daysSinceCapture - a.daysSinceCapture);
}

/**
 * Pure biosecurity auto-purge transform: clears heavy tag photo payloads from eligible batches
 * while keeping indexed `lotNumber`, `millCode`, `ocrRawText`, and purchase metadata intact.
 */
export function purgeExpiredFeedTagPhotosPure(
  batches: readonly FeedBatch[],
  purgeWindowDays: FeedPurgeWindowDays,
  options?: {
    todayIso?: string;
    nowIso?: string;
  }
): {
  nextBatches: FeedBatch[];
  purgedBatchIds: string[];
  purgedCount: number;
  reclaimedBytes: number;
} {
  const todayIso = options?.todayIso || todayDateIso();
  const nowIso = options?.nowIso || nowIsoUtc();
  const eligible = findPurgeEligibleFeedTagPhotos(batches, purgeWindowDays, todayIso);
  if (eligible.length === 0) {
    return {
      nextBatches: [...batches],
      purgedBatchIds: [],
      purgedCount: 0,
      reclaimedBytes: 0,
    };
  }

  const eligibleMap = new Map<string, FeedPurgeCandidate>();
  for (const item of eligible) {
    eligibleMap.set(item.batch.id, item);
  }

  const purgedBatchIds: string[] = [];
  let reclaimedBytes = 0;

  const nextBatches = batches.map((batch) => {
    const match = eligibleMap.get(batch.id);
    if (!match) return batch;
    purgedBatchIds.push(batch.id);
    reclaimedBytes += match.bytesToReclaim;
    return {
      ...batch,
      tagPhotoDataUrl: undefined,
      tagPhotoThumbnailDataUrl: undefined,
      tagPhotoPurgedAtIso: nowIso,
      tagPhotoBytesReclaimed: (batch.tagPhotoBytesReclaimed || 0) + match.bytesToReclaim,
      _rev: (batch._rev ?? 0) + 1,
      updatedAt: nowIso,
    };
  });

  return {
    nextBatches,
    purgedBatchIds,
    purgedCount: purgedBatchIds.length,
    reclaimedBytes,
  };
}

/**
 * Deducts allocated quantity from the linked `FeedBatch` without dropping below 0.
 */
export function applyFeedAllocationToBatch(
  batch: FeedBatch,
  allocatedQuantity: number,
  nowIso: string = nowIsoUtc()
): FeedBatch {
  const qty = Number.isFinite(allocatedQuantity) && allocatedQuantity > 0 ? allocatedQuantity : 0;
  const nextRemaining = Math.max(
    0,
    Math.round((Math.max(0, Number(batch.remainingQuantity) || 0) - qty) * 100) / 100
  );
  return {
    ...batch,
    remainingQuantity: nextRemaining,
    _rev: (batch._rev ?? 0) + 1,
    updatedAt: nowIso,
  };
}

/**
 * Restores allocated quantity back to the linked `FeedBatch` when an allocation row is deleted,
 * capped cleanly at `totalQuantity` when `totalQuantity > 0`.
 */
export function reverseFeedAllocationFromBatch(
  batch: FeedBatch,
  allocatedQuantity: number,
  nowIso: string = nowIsoUtc()
): FeedBatch {
  const qty = Number.isFinite(allocatedQuantity) && allocatedQuantity > 0 ? allocatedQuantity : 0;
  const rawNext = Math.round((Math.max(0, Number(batch.remainingQuantity) || 0) + qty) * 100) / 100;
  const capped =
    batch.totalQuantity > 0 ? Math.min(batch.totalQuantity, rawNext) : rawNext;
  return {
    ...batch,
    remainingQuantity: capped,
    _rev: (batch._rev ?? 0) + 1,
    updatedAt: nowIso,
  };
}

export interface FeedUnitTotal {
  unit: string;
  remaining: number;
  total: number;
}

export interface FeedLotTraceSummary {
  lotKey: string;
  lotNumber: string;
  batches: FeedBatch[];
  allocations: FeedAllocation[];
  linkedCages: CageLocation[];
  linkedBreedings: BreedingRecord[];
  linkedAnimals: Animal[];
  totalAllocated: number;
  hasRecallFlag: boolean;
}

export interface FeedInventorySummary {
  speciesName: string;
  totalBatches: number;
  activeBatches: number;
  depletedBatches: number;
  lowStockBatches: FeedBatch[];
  recallFlaggedBatches: FeedBatch[];
  lotsIndexedCount: number;
  retainedTagPhotosCount: number;
  retainedTagPhotoBytes: number;
  purgedTagPhotosCount: number;
  purgeEligibleCandidates: FeedPurgeCandidate[];
  totalsByUnit: FeedUnitTotal[];
  totalSpendCents: number;
  totalAllocationsCount: number;
}

export function isFeedBatchLowStock(batch: FeedBatch): boolean {
  const threshold = Number(batch.lowStockThreshold) || 0;
  const remaining = Math.max(0, Number(batch.remainingQuantity) || 0);
  if (remaining <= 0) return true;
  return threshold > 0 && remaining <= threshold;
}

/**
 * Computes single-species feed ledger KPIs, stock by unit, low-stock warnings,
 * and biosecurity purge readiness.
 */
export function evaluateFeedInventorySummary(params: {
  batches: readonly FeedBatch[];
  allocations: readonly FeedAllocation[];
  speciesName: string;
  purgeWindowDays: FeedPurgeWindowDays;
  todayIso?: string;
}): FeedInventorySummary {
  const todayIso = params.todayIso || todayDateIso();
  const speciesBatches = params.batches.filter((b) =>
    isSameSpecies(b.species, params.speciesName)
  );
  const speciesAllocations = params.allocations.filter((a) =>
    isSameSpecies(a.species, params.speciesName)
  );

  const unitTotalsMap = new Map<string, FeedUnitTotal>();
  const lowStockBatches: FeedBatch[] = [];
  const recallFlaggedBatches: FeedBatch[] = [];
  let activeBatches = 0;
  let depletedBatches = 0;
  let lotsIndexedCount = 0;
  let retainedTagPhotosCount = 0;
  let retainedTagPhotoBytes = 0;
  let purgedTagPhotosCount = 0;
  let totalSpendCents = 0;

  for (const batch of speciesBatches) {
    const rem = Math.max(0, Number(batch.remainingQuantity) || 0);
    const tot = Math.max(0, Number(batch.totalQuantity) || 0);
    const unit = (batch.bagWeightUnit || 'lbs').trim() || 'lbs';

    if (rem > 0) activeBatches += 1;
    else depletedBatches += 1;

    if (rem > 0 && batch.lowStockThreshold > 0 && rem <= batch.lowStockThreshold) {
      lowStockBatches.push(batch);
    }
    if (batch.recallFlagged) {
      recallFlaggedBatches.push(batch);
    }
    if (batch.lotNumber.trim()) {
      lotsIndexedCount += 1;
    }
    if (batch.tagPhotoDataUrl || batch.tagPhotoThumbnailDataUrl) {
      retainedTagPhotosCount += 1;
      retainedTagPhotoBytes +=
        batch.tagPhotoBytes ||
        (batch.tagPhotoDataUrl?.length || 0) + (batch.tagPhotoThumbnailDataUrl?.length || 0);
    } else if (batch.tagPhotoPurgedAtIso) {
      purgedTagPhotosCount += 1;
    }
    if (typeof batch.totalCostCents === 'number' && batch.totalCostCents > 0) {
      totalSpendCents += Math.round(batch.totalCostCents);
    }

    const uKey = unit.toLowerCase();
    const prev = unitTotalsMap.get(uKey);
    if (prev) {
      prev.remaining = Math.round((prev.remaining + rem) * 100) / 100;
      prev.total = Math.round((prev.total + tot) * 100) / 100;
    } else {
      unitTotalsMap.set(uKey, {
        unit,
        remaining: Math.round(rem * 100) / 100,
        total: Math.round(tot * 100) / 100,
      });
    }
  }

  const purgeEligibleCandidates = findPurgeEligibleFeedTagPhotos(
    speciesBatches,
    params.purgeWindowDays,
    todayIso
  );

  return {
    speciesName: params.speciesName,
    totalBatches: speciesBatches.length,
    activeBatches,
    depletedBatches,
    lowStockBatches,
    recallFlaggedBatches,
    lotsIndexedCount,
    retainedTagPhotosCount,
    retainedTagPhotoBytes,
    purgedTagPhotosCount,
    purgeEligibleCandidates,
    totalsByUnit: Array.from(unitTotalsMap.values()),
    totalSpendCents,
    totalAllocationsCount: speciesAllocations.length,
  };
}

/**
 * Traces a lot number (substring or exact match) across feed batches, allocations,
 * cages/pens, active litters, and animals for rapid biosecurity recall tracing.
 */
export function traceFeedLotToCagesAndLitters(params: {
  lotQuery: string;
  batches: readonly FeedBatch[];
  allocations: readonly FeedAllocation[];
  cages: readonly CageLocation[];
  breedings: readonly BreedingRecord[];
  animals: readonly Animal[];
}): FeedLotTraceSummary[] {
  const q = (params.lotQuery || '').trim().toLowerCase();
  const matchingBatches = params.batches.filter((b) => {
    const lot = (b.lotNumber || '').trim();
    if (!lot) return false;
    if (!q) return Boolean(b.recallFlagged);
    return (
      lot.toLowerCase().includes(q) ||
      (b.millCode || '').toLowerCase().includes(q) ||
      (b.brand || '').toLowerCase().includes(q)
    );
  });

  const groups = new Map<string, FeedBatch[]>();
  for (const b of matchingBatches) {
    const key = b.lotNumber.trim().toUpperCase();
    const arr = groups.get(key) || [];
    arr.push(b);
    groups.set(key, arr);
  }

  const cageById = new Map(params.cages.map((c) => [c.id, c]));
  const breedingById = new Map(params.breedings.map((br) => [br.id, br]));
  const animalById = new Map(params.animals.map((a) => [a.id, a]));

  const out: FeedLotTraceSummary[] = [];
  for (const [lotKey, batchList] of groups.entries()) {
    const batchIds = new Set(batchList.map((b) => b.id));
    const lotAllocs = params.allocations.filter((a) => batchIds.has(a.feedBatchId));
    const linkedCages: CageLocation[] = [];
    const seenCages = new Set<string>();
    const linkedBreedings: BreedingRecord[] = [];
    const seenBreedings = new Set<string>();
    const linkedAnimals: Animal[] = [];
    const seenAnimals = new Set<string>();
    let totalAllocated = 0;

    for (const alloc of lotAllocs) {
      totalAllocated = Math.round((totalAllocated + (Number(alloc.quantity) || 0)) * 100) / 100;
      if (alloc.targetType === 'cage' && alloc.targetId && !seenCages.has(alloc.targetId)) {
        const cage = cageById.get(alloc.targetId);
        if (cage) {
          seenCages.add(cage.id);
          linkedCages.push(cage);
        }
      } else if (
        alloc.targetType === 'litter' &&
        alloc.targetId &&
        !seenBreedings.has(alloc.targetId)
      ) {
        const br = breedingById.get(alloc.targetId);
        if (br) {
          seenBreedings.add(br.id);
          linkedBreedings.push(br);
        }
      } else if (
        alloc.targetType === 'animal' &&
        alloc.targetId &&
        !seenAnimals.has(alloc.targetId)
      ) {
        const anim = animalById.get(alloc.targetId);
        if (anim) {
          seenAnimals.add(anim.id);
          linkedAnimals.push(anim);
        }
      }
    }

    // Also match cages linked via CageLocation.feedLotName mentioning the lotNumber
    for (const cage of params.cages) {
      if (seenCages.has(cage.id)) continue;
      const lotName = (cage.feedLotName || '').trim().toUpperCase();
      if (lotName && lotName.includes(lotKey)) {
        seenCages.add(cage.id);
        linkedCages.push(cage);
      }
    }

    out.push({
      lotKey,
      lotNumber: batchList[0].lotNumber,
      batches: batchList,
      allocations: lotAllocs,
      linkedCages,
      linkedBreedings,
      linkedAnimals,
      totalAllocated,
      hasRecallFlag: batchList.some((b) => Boolean(b.recallFlagged)),
    });
  }

  return out.sort(
    (a, b) => Number(b.hasRecallFlag) - Number(a.hasRecallFlag) || a.lotNumber.localeCompare(b.lotNumber)
  );
}

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Formats the species Feed Inventory & Lot Ledger into a spreadsheet-ready CSV string.
 */
export function formatFeedLedgerCsv(
  batches: readonly FeedBatch[],
  allocations: readonly FeedAllocation[],
  currencyCode = 'USD'
): string {
  const allocCountByBatch = new Map<string, number>();
  for (const a of allocations) {
    allocCountByBatch.set(a.feedBatchId, (allocCountByBatch.get(a.feedBatchId) || 0) + 1);
  }

  const header = [
    'Species',
    'Purchase Date',
    'Brand',
    'Product Name',
    'Lot Number',
    'Mill Code',
    'Manufacture Date',
    'Bags',
    'Bag Weight',
    'Unit',
    'Total Qty',
    'Remaining Qty',
    'Protein %',
    'Cost',
    'Supplier',
    'Allocations',
    'Tag Photo Status',
    'Recall Flag',
    'Notes',
  ];

  const rows = batches.map((b) => {
    const tagStatus = b.tagPhotoDataUrl
      ? `Retained (${b.tagPhotoCapturedDateIso || b.purchaseDateIso})`
      : b.tagPhotoPurgedAtIso
        ? `Purged ${b.tagPhotoPurgedAtIso.slice(0, 10)}`
        : 'No Photo';
    return [
      b.species,
      b.purchaseDateIso,
      b.brand,
      b.productName,
      b.lotNumber,
      b.millCode,
      b.manufactureDateIso,
      b.bagCount,
      b.bagWeightValue,
      b.bagWeightUnit,
      b.totalQuantity,
      b.remainingQuantity,
      b.proteinPercent ?? '',
      b.totalCostCents ? formatCurrencyCents(b.totalCostCents, currencyCode) : '',
      b.supplierName,
      allocCountByBatch.get(b.id) || 0,
      tagStatus,
      b.recallFlagged ? `FLAGGED: ${b.recallNote || 'Watch'}` : 'Normal',
      b.notes,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [header.map(escapeCsvCell).join(','), ...rows].join('\r\n');
}
```

## `src/core/feedManufacturerDirectory.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline-Ready Feed Manufacturer Emergency & Biosecurity Directory
 * (`src/core/feedManufacturerDirectory.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 * Bundled statically so breeders have hotlines, recall links, lot-code decoding hints,
 * and regulatory reporting contacts even in zero-signal barns.
 */

export type FeedDirectoryCategory =
  | 'manufacturer'
  | 'regulatory'
  | 'community_watch';

export interface FeedManufacturerContact {
  id: string;
  name: string;
  parentCompany: string;
  category: FeedDirectoryCategory;
  hotlinePhone: string;
  hotlineHours: string;
  qualityReportUrl: string;
  recallWatchUrl: string;
  communityWatchNote: string;
  lotCodeHint: string;
  speciesFocus: string[];
  aliases: string[];
}

export const FEED_MANUFACTURER_DIRECTORY: ReadonlyArray<FeedManufacturerContact> = [
  {
    id: 'purina-animal-nutrition',
    name: 'Purina Animal Nutrition',
    parentCompany: "Land O'Lakes / Purina Mills",
    category: 'manufacturer',
    hotlinePhone: '1-800-227-8941',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://www.purinamills.com/contact-us',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Keep the sewn paper feed tag & mill stamp photo ready; Purina tracks plant ID + Julian date stamps on the white tag tape.',
    lotCodeHint:
      'Look on the white bottom/top stitched tag or inked gusset for plant code + Julian date (e.g. 24185 or 4291A-0814).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['purina', 'purina mills', 'land o lakes', 'show chow', 'fibre3', 'complete rabbit'],
  },
  {
    id: 'nutrena-cargill',
    name: 'Nutrena (Cargill Animal Nutrition)',
    parentCompany: 'Cargill',
    category: 'manufacturer',
    hotlinePhone: '1-800-367-4894',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM CT',
    qualityReportUrl: 'https://www.nutrenaworld.com/contact-us',
    recallWatchUrl: 'https://www.nutrenaworld.com/safety-quality',
    communityWatchNote:
      'Record both the lot code and the mill/plant number stamped on the bag seam before reporting refusal, mold, or off-odor.',
    lotCodeHint:
      'Usually printed on the stitched bag tag or bag seam in YYDDD + plant/shift format (e.g. L26045-03).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['nutrena', 'cargill', 'country feeds', 'naturewise', 'safechoice'],
  },
  {
    id: 'kent-blue-seal',
    name: 'Kent Nutrition Group / Blue Seal',
    parentCompany: 'Kent Corporation',
    category: 'manufacturer',
    hotlinePhone: '1-866-647-1212',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://kentfeeds.com/contact/',
    recallWatchUrl: 'https://blueseal.com/contact-us/',
    communityWatchNote:
      'Covers Kent, Blue Seal, and Home Fresh lines. Retain a sealed 1–2 lb sample in a clean zip bag if a lab assay is requested.',
    lotCodeHint:
      'Printed on the sewn feed tag or inkjet bag edge as a batch/run number + date code.',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['kent', 'blue seal', 'home fresh', 'show rabbit', 'kent nutrition'],
  },
  {
    id: 'kalmbach-feeds',
    name: 'Kalmbach Feeds',
    parentCompany: 'Kalmbach Feeds, Inc.',
    category: 'manufacturer',
    hotlinePhone: '1-888-771-1250',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM ET',
    qualityReportUrl: 'https://www.kalmbachfeeds.com/pages/contact-us',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Popular among ARBA rabbitries and small ruminants; customer care can verify lot retain samples directly from the mill.',
    lotCodeHint:
      'Stamped on the white guarantee tag or bottom closure tape (e.g. LOT 26088A or 0326-K1).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Poultry'],
    aliases: ['kalmbach', 'heinz', 'tribute', 'formula of champions'],
  },
  {
    id: 'manna-pro',
    name: 'Manna Pro Products',
    parentCompany: 'Compana Pet Brands',
    category: 'manufacturer',
    hotlinePhone: '1-800-690-9908',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM CT',
    qualityReportUrl: 'https://www.mannapro.com/contact-us',
    recallWatchUrl: 'https://www.mannapro.com/recall-information',
    communityWatchNote:
      'Covers Pro Formula, Sho, Select Series, and Calf-Manna supplements. Keep UPC + best-by / lot stamp together.',
    lotCodeHint:
      'Inkjet lot stamp near bottom gusset or back panel (e.g. LOT 4192M / Best By MM/DD/YY).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Guinea Pig', 'Chinchilla'],
    aliases: ['manna pro', 'mannapro', 'calf-manna', 'sho', 'select series'],
  },
  {
    id: 'adm-pen-pals',
    name: 'ADM Animal Nutrition (Pen Pals)',
    parentCompany: 'Archer Daniels Midland',
    category: 'manufacturer',
    hotlinePhone: '1-800-217-2007',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://www.admanimalnutrition.com/webcenter/portal/ADMAnimalNutrition/pages_contact',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Covers Pen Pals Rabbit, MoorMan’s ShowTec, and Patriot lines. Include dealer city/state when reporting a lot.',
    lotCodeHint:
      'Look on the white tag or lot sticker for Plant ID + Date/Batch (e.g. QU-26102-4).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle'],
    aliases: ['adm', 'pen pals', 'penpals', 'moormans', 'showtec'],
  },
  {
    id: 'tractor-supply-producers-pride',
    name: "Tractor Supply (Producer's Pride / Dumor)",
    parentCompany: 'Tractor Supply Co.',
    category: 'manufacturer',
    hotlinePhone: '1-877-718-6750',
    hotlineHours: 'Daily 7:00 AM–9:00 PM CT',
    qualityReportUrl: 'https://www.tractorsupply.com/tsc/cms/customer-solutions',
    recallWatchUrl: 'https://www.tractorsupply.com/tsc/cms/product-recall',
    communityWatchNote:
      'Store-brand bags are co-packed regionally—both the lot stamp AND store receipt/city help trace the exact contract mill.',
    lotCodeHint:
      'Stamped on the white bottom tape or rear seam alongside a 3-letter mill/plant code.',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['tractor supply', 'tsc', 'producers pride', "producer's pride", 'dumor'],
  },
  {
    id: 'mazuri-exotic',
    name: 'Mazuri Exotic Animal Nutrition',
    parentCompany: "PMI Nutrition International / Land O'Lakes",
    category: 'manufacturer',
    hotlinePhone: '1-800-227-8941',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://mazuri.com/pages/contact-us',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Commonly fed to Guinea Pigs, Chinchillas, and small exotics; check Vitamin C stabilization / mill date carefully.',
    lotCodeHint:
      'Printed near top or bottom seal with MFG / Best By date and 5–7 character lot code.',
    speciesFocus: ['Guinea Pig', 'Chinchilla', 'Ferret', 'Rabbit'],
    aliases: ['mazuri', 'pmi nutrition'],
  },
  {
    id: 'standlee-forage',
    name: 'Standlee Premium Products',
    parentCompany: 'Standlee Hay Company',
    category: 'manufacturer',
    hotlinePhone: '1-800-398-0819',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM MT',
    qualityReportUrl: 'https://www.standleeforage.com/contact/',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Covers timothy/alfalfa compressed bales, cubes, and forage pellets. Photograph bale wrap lot stickers before discarding.',
    lotCodeHint:
      'White adhesive barcode/lot sticker on plastic bale sleeve or bag gusset (e.g. ST-26071).',
    speciesFocus: ['Rabbit', 'Guinea Pig', 'Chinchilla', 'Goat', 'Sheep', 'Cattle', 'Alpaca'],
    aliases: ['standlee', 'hay', 'timothy', 'alfalfa'],
  },
  {
    id: 'fda-cvm-safety-portal',
    name: 'FDA CVM Safety Reporting & Feed Recall Watch',
    parentCompany: 'U.S. Food & Drug Administration (Center for Veterinary Medicine)',
    category: 'regulatory',
    hotlinePhone: '1-888-463-6332',
    hotlineHours: '24/7 Online Portal · Phone Mon–Fri 8:00 AM–4:30 PM ET',
    qualityReportUrl: 'https://www.safetyreporting.hhs.gov/',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Submit adverse livestock feed events directly to FDA CVM with your indexed lot number, mill code, bag photos, and affected pen records.',
    lotCodeHint:
      'Have Manufacturer, Product Name, Lot/Batch Code, Purchase Date, and Vet/Mortality notes ready before filing.',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Guinea Pig', 'Chinchilla', 'Ferret', 'Alpaca', 'Dog', 'Cat'],
    aliases: ['fda', 'cvm', 'recall', 'safety reporting', 'government', 'adverse event'],
  },
  {
    id: 'arba-community-feed-watch',
    name: 'ARBA & Barn Biosecurity Feed-Issue Watch',
    parentCompany: 'Community & Specialty Breeder Biosecurity Resources',
    category: 'community_watch',
    hotlinePhone: '1-309-664-7500',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT (ARBA Office)',
    qualityReportUrl: 'https://arba.net/',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/recalls-withdrawals/animal-feed-recalls',
    communityWatchNote:
      'Cross-check regional mill alerts with local breeders, freeze a 1 lb labeled retain sample from suspect lots, and flag the lot in your ledger to trace exposed cages & litters.',
    lotCodeHint:
      'Always log both the mill code and lot string so multi-barn growers can compare exact plant/shift batches.',
    speciesFocus: ['Rabbit', 'Guinea Pig', 'Goat', 'Sheep'],
    aliases: ['arba', 'community', 'watch', 'biosecurity', 'mycotoxin', 'feed issue'],
  },
];

/**
 * Pure search & filter helper for the offline manufacturer directory.
 */
export function filterFeedManufacturerDirectory(params: {
  query?: string;
  speciesName?: string;
  category?: FeedDirectoryCategory | 'all';
}): FeedManufacturerContact[] {
  const q = (params.query || '').trim().toLowerCase();
  const species = (params.speciesName || '').trim().toLowerCase();
  const category = params.category || 'all';

  return FEED_MANUFACTURER_DIRECTORY.filter((entry) => {
    if (category !== 'all' && entry.category !== category) {
      return false;
    }
    if (
      species &&
      species !== 'all' &&
      entry.category === 'manufacturer' &&
      !entry.speciesFocus.some((s) => s.toLowerCase() === species)
    ) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      entry.name,
      entry.parentCompany,
      entry.hotlinePhone,
      entry.lotCodeHint,
      entry.communityWatchNote,
      ...entry.aliases,
      ...entry.speciesFocus,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Finds the best matching bundled manufacturer contact for a typed or OCR-detected feed brand.
 */
export function matchManufacturerForBrand(brandText: string): FeedManufacturerContact | null {
  const clean = (brandText || '').trim().toLowerCase();
  if (!clean) return null;
  for (const entry of FEED_MANUFACTURER_DIRECTORY) {
    if (entry.category !== 'manufacturer') continue;
    if (entry.name.toLowerCase().includes(clean) || clean.includes(entry.name.toLowerCase())) {
      return entry;
    }
    if (entry.aliases.some((alias) => clean.includes(alias) || alias.includes(clean))) {
      return entry;
    }
  }
  return null;
}
```

## `src/core/geneticsEngine.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Multi-Species Coat Color Genetics, Allele Inference & Test-Breeding Punnett Engine.
 *
 * @status UNDER DEVELOPMENT / INCOMPLETE — All UI and export surfaces rendering coat color
 * genotypes, Rufus intensity, allele inference, or Punnett predictions must display an
 * under-development / unverified notice until each species ruleset is verified by a domain expert.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same genetics logic runs offline in Web PWAs and native mobile apps.
 *
 * Key Safety & Accuracy Rules:
 * 1. Species-scoped registry across all 11 predefined species (`Rabbit`, `Cat`, `Dog`, `Goat`,
 *    `Sheep`, `Cattle`, `Swine / Pig`, `Alpaca`, `Guinea Pig`, `Chinchilla`, `Ferret`), with
 *    strict `null` plain-text fallback for user-created custom species (zero Rabbit bleed-through).
 * 2. Conservative variety presets (e.g., Rabbit `Red` / `New Zealand Red` = `A_ B_ C_ D_ ee __`)
 *    never silently assume unverified Wide-Band (`ww`); breeders verify `ww` explicitly.
 * 3. Unknown `_` slots never synthesize fake homozygous blank (`__`) certainty in Punnett outputs.
 */

import { Animal, BiologicalSex, GenotypeAllelePair } from './models';

export type InheritanceMode = 'autosomal' | 'x_linked' | 'incomplete_dominant' | 'codominant';

export interface LocusDefinition {
  locus: string;
  name: string;
  alleles: string[]; // Ordered from most dominant to most recessive
  inheritanceMode?: InheritanceMode;
  description: string;
}

export interface VarietyPresetOption {
  locus: string;
  suggestedAlleles: string;
  label: string;
  explanation: string;
}

export interface VarietyPresetDefinition {
  variety: string;
  conservativeGenotype: string;
  optionalConfirmations?: VarietyPresetOption[];
  note?: string;
}

export interface BreedingGeneticAlert {
  severity: 'danger' | 'warning' | 'info';
  title: string;
  detail: string;
  locus?: string;
}

export interface SpeciesGeneticsSpec {
  speciesKey: string;
  displayName: string;
  aliases: string[];
  loci: LocusDefinition[];
  corePhenotypeLoci: string[];
  varietyPresets: VarietyPresetDefinition[];
  supportsRufusIntensity?: boolean;
  classifyPhenotype: (loci: Record<string, string>, sex?: BiologicalSex) => string;
  evaluatePairingAlerts?: (
    breakdownsByLocus: Map<string, LocusPunnettOutcome>,
    sire: Animal,
    dam: Animal
  ) => BreedingGeneticAlert[];
}

// ─── 1. RABBIT (ARBA Coat Color Genetics) ──────────────────────────────────────

export const RABBIT_COLOR_LOCI: LocusDefinition[] = [
  {
    locus: 'A',
    name: 'Agouti',
    alleles: ['A', 'at', 'a'],
    description: 'A = Agouti/Red/Chestnut, at = Tan/Otter/Silver Marten, a = Self (Black/Blue/Chocolate)',
  },
  {
    locus: 'B',
    name: 'Black / Brown',
    alleles: ['B', 'b'],
    description: 'B = Black pigment base, b = Chocolate/Brown pigment base',
  },
  {
    locus: 'C',
    name: 'Color / Fullness',
    alleles: ['C', 'chd', 'chl', 'ch', 'c'],
    description: 'C = Full color, chd = Chinchilla, chl = Sable/Seal, ch = Himalayan/Pointed, c = REW',
  },
  {
    locus: 'D',
    name: 'Dense / Dilute',
    alleles: ['D', 'd'],
    description: 'D = Dense pigment (Red/Black/Chocolate), d = Dilute (Fawn/Blue/Lilac)',
  },
  {
    locus: 'E',
    name: 'Extension',
    alleles: ['Es', 'E', 'ej', 'e'],
    description:
      'Es = Steel, E = Normal extension, ej = Harlequin/Japanese, e = Non-extension red/orange/tort',
  },
  {
    locus: 'W',
    name: 'Wide Band',
    alleles: ['W', 'w'],
    description:
      'W = Normal agouti band, w = Wide-band red belly/undercolor (ww verified separately from Rufus depth)',
  },
  {
    locus: 'En',
    name: 'English / Broken',
    alleles: ['En', 'en'],
    inheritanceMode: 'incomplete_dominant',
    description: 'Enen = Broken pattern, EnEn = Charlie (megacolon risk), enen = Solid coat',
  },
  {
    locus: 'V',
    name: 'Vienna',
    alleles: ['V', 'v'],
    description: 'VV = Non-Vienna, Vv = Vienna carrier (blue-eyed marks), vv = Blue-Eyed White (BEW)',
  },
  {
    locus: 'Du',
    name: 'Dutch',
    alleles: ['Du', 'du'],
    description: 'Du = Non-Dutch solid, du = Dutch belted markings',
  },
];

const WIDE_BAND_CONFIRM_OPTION: VarietyPresetOption = {
  locus: 'W',
  suggestedAlleles: 'ww',
  label: 'Confirm Wide-Band (ww)',
  explanation:
    'Many show Reds are Ww or WW with Rufus polygenes rather than true ww. Only check if Wide-Band (ww) is proven by pedigree or test breeding.',
};

export const RABBIT_VARIETY_PRESET_DEFS: VarietyPresetDefinition[] = [
  {
    variety: 'Red',
    conservativeGenotype: 'A_ B_ C_ D_ ee __',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
    note: 'Rufus intensity is tracked separately on the profile selector.',
  },
  {
    variety: 'New Zealand Red',
    conservativeGenotype: 'A_ B_ C_ D_ ee __',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
    note: 'Leaves Wide-Band (__ / W) open unless confirmed ww.',
  },
  {
    variety: 'Broken Red',
    conservativeGenotype: 'A_ B_ C_ D_ ee __ Enen',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
  },
  {
    variety: 'White',
    conservativeGenotype: '__ __ cc __ __',
  },
  {
    variety: 'Ruby-Eyed White (REW)',
    conservativeGenotype: '__ __ cc __ __',
  },
  {
    variety: 'Blue-Eyed White (BEW)',
    conservativeGenotype: '__ __ __ __ __ vv',
  },
  {
    variety: 'Black',
    conservativeGenotype: 'aa B_ C_ D_ E_',
  },
  {
    variety: 'Broken',
    conservativeGenotype: 'A_ B_ C_ D_ E_ Enen',
  },
  {
    variety: 'Chestnut',
    conservativeGenotype: 'A_ B_ C_ D_ E_ W_',
  },
  {
    variety: 'Chocolate',
    conservativeGenotype: 'aa bb C_ D_ E_',
  },
  {
    variety: 'Blue',
    conservativeGenotype: 'aa B_ C_ dd E_',
  },
  {
    variety: 'Fawn',
    conservativeGenotype: 'A_ B_ C_ dd ee __',
    optionalConfirmations: [WIDE_BAND_CONFIRM_OPTION],
  },
  {
    variety: 'Chinchilla',
    conservativeGenotype: 'A_ B_ chd_ D_ E_',
  },
  {
    variety: 'Black Otter',
    conservativeGenotype: 'at_ B_ C_ D_ E_',
  },
  {
    variety: 'Siamese Sable',
    conservativeGenotype: 'aa B_ chl_ D_ E_',
  },
  {
    variety: 'Californian / Himalayan',
    conservativeGenotype: 'aa B_ chch D_ E_',
  },
  {
    variety: 'Dutch',
    conservativeGenotype: 'aa B_ C_ D_ E_ dudu',
  },
  {
    variety: 'Harlequin',
    conservativeGenotype: 'A_ B_ C_ D_ ej_',
  },
];

/**
 * Backward-compatible flat map of conservative baseline presets (never assumes unverified `ww`).
 */
export const RABBIT_VARIETY_GENOTYPE_PRESETS: Record<string, string> = Object.fromEntries(
  RABBIT_VARIETY_PRESET_DEFS.map((d) => [d.variety, d.conservativeGenotype])
);

function classifyRabbitPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  const v = loci['V'] || 'V_';
  if (v === 'vv') return 'Blue-Eyed White (BEW)';
  if (c === 'cc') return 'Ruby-Eyed White (REW)';

  const a = loci['A'] || 'A_';
  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const e = loci['E'] || 'E_';
  const w = loci['W'] || '__';
  const en = loci['En'] || 'enen';
  const du = loci['Du'] || 'Du_';

  const patternParts: string[] = [];
  if (en === 'EnEn') patternParts.push('Charlie');
  else if (en.startsWith('En')) patternParts.push('Broken');
  if (du === 'dudu') patternParts.push('Dutch');
  const patternPrefix = patternParts.length > 0 ? `${patternParts.join(' ')} ` : '';

  const isSelf = a === 'aa';
  const isTan = a === 'at_' || a === 'atat' || a === 'ata';
  const isChocolate = b === 'bb';
  const isDilute = d === 'dd';
  const isNonExtension = e === 'ee';
  const isHarlequin = e === 'ejej' || e === 'eje' || e === 'ej_';
  const isSteel = e.startsWith('Es');
  const isConfirmedWideBand = w === 'ww';
  const isConfirmedNormalBand = w.startsWith('W') && w !== 'W_';
  const hasUnknownWideBand = w.includes('_');

  if (c === 'chch' || c === 'chc' || c === 'ch_') {
    if (isChocolate && isDilute) return `${patternPrefix}Lilac Himalayan / Pointed White`;
    if (isChocolate) return `${patternPrefix}Chocolate Himalayan / Pointed White`;
    if (isDilute) return `${patternPrefix}Blue Himalayan / Pointed White`;
    return `${patternPrefix}Black Himalayan / Californian Pointed`;
  }

  if (c.startsWith('chl')) {
    if (isDilute && isSelf) return `${patternPrefix}Smoke Pearl`;
    if (isSelf) return `${patternPrefix}${c === 'chlchl' ? 'Seal / ' : ''}Siamese Sable`;
    if (isTan) return `${patternPrefix}Sable Marten`;
    if (isNonExtension) return `${patternPrefix}Sable Point`;
    return `${patternPrefix}Sable Chinchilla`;
  }

  if (isHarlequin) {
    return `${patternPrefix}${en.startsWith('En') ? 'Tricolor' : 'Harlequin'}`;
  }

  if (isNonExtension) {
    if (isSelf) {
      if (isChocolate && isDilute) return `${patternPrefix}Lilac Tortoise`;
      if (isChocolate) return `${patternPrefix}Chocolate Tortoise`;
      if (isDilute) return `${patternPrefix}Blue Tortoise`;
      return `${patternPrefix}Black Tortoise`;
    }
    if (isDilute) return `${patternPrefix}Fawn / Cream`;
    if (isChocolate) return `${patternPrefix}Chocolate Orange / Amber`;
    if (isConfirmedWideBand) return `${patternPrefix}New Zealand Red (Wide-Band ww)`;
    if (hasUnknownWideBand) return `${patternPrefix}Red / Orange (Wide-Band Unverified)`;
    if (isConfirmedNormalBand || w === 'W_') {
      return `${patternPrefix}Orange / Non-Wide-Band Red (W_)`;
    }
    return `${patternPrefix}Red / Orange`;
  }

  if (isSteel) {
    if (c.startsWith('chd')) return `${patternPrefix}Silver-Tipped Steel`;
    if (isDilute) return `${patternPrefix}Blue Steel`;
    return `${patternPrefix}Gold-Tipped Steel`;
  }

  if (isSelf) {
    if (c.startsWith('chd')) return `${patternPrefix}${isDilute ? 'Blue' : 'Black'} Self Chinchilla`;
    if (isChocolate && isDilute) return `${patternPrefix}Lilac`;
    if (isChocolate) return `${patternPrefix}Chocolate`;
    if (isDilute) return `${patternPrefix}Blue`;
    return `${patternPrefix}Black`;
  }

  if (isTan) {
    const colorName = isChocolate && isDilute ? 'Lilac' : isChocolate ? 'Chocolate' : isDilute ? 'Blue' : 'Black';
    if (c.startsWith('chd')) return `${patternPrefix}${colorName} Silver Marten`;
    return `${patternPrefix}${colorName} Otter / Tan`;
  }

  if (c.startsWith('chd')) {
    if (isDilute) return `${patternPrefix}Squirrel (Blue Chinchilla)`;
    return `${patternPrefix}Chinchilla`;
  }

  if (isChocolate && isDilute) return `${patternPrefix}Lynx`;
  if (isChocolate) return `${patternPrefix}Chocolate Agouti`;
  if (isDilute) return `${patternPrefix}Opal`;
  return `${patternPrefix}Chestnut Agouti`;
}

// ─── 2. CAT (X-Linked Orange O/o & Feline Loci) ───────────────────────────────

const CAT_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti / Tabby', alleles: ['A', 'a'], description: 'A = Tabby expressed, a = Solid non-agouti' },
  { locus: 'B', name: 'Black / Chocolate / Cinnamon', alleles: ['B', 'b', 'b1'], description: 'B = Black, b = Chocolate, b1 = Cinnamon' },
  { locus: 'C', name: 'Colorpoint / Albino', alleles: ['C', 'cb', 'cs', 'c'], description: 'C = Full, cb = Burmese sepia, cs = Siamese point, cbcs = Mink, c = Albino' },
  { locus: 'D', name: 'Dense / Dilute', alleles: ['D', 'd'], description: 'D = Dense, d = Dilute (Blue, Lilac, Fawn, Cream)' },
  {
    locus: 'O',
    name: 'Red / Orange (X-Linked)',
    alleles: ['O', 'o'],
    inheritanceMode: 'x_linked',
    description: 'X-linked: O = Red/Orange, o = Non-Red. Oo females produce Tortoiseshell / Calico; males carry 1 allele (OY / oY).',
  },
  { locus: 'W', name: 'White / Spotting', alleles: ['W', 'Ws', 'w'], description: 'W = Dominant White, Ws = White Spotting / Bicolor, w = Solid' },
  { locus: 'Ta', name: 'Tabby Pattern', alleles: ['Ta', 'Mc', 'mc'], description: 'Ta = Ticked, Mc = Mackerel, mc = Classic blotched' },
  { locus: 'I', name: 'Inhibitor (Silver / Smoke)', alleles: ['I', 'i'], description: 'I = Silver/Smoke undercoat, i = Non-silver' },
];

function classifyCatPhenotype(loci: Record<string, string>, sex?: BiologicalSex): string {
  const w = loci['W'] || 'w_';
  if (w.startsWith('W') && !w.startsWith('Ws')) return 'Dominant White';
  const c = loci['C'] || 'C_';
  if (c === 'c' || c === 'cc') return 'Albino (Pink-Eyed White)';

  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const a = loci['A'] || 'A_';
  const o = loci['O'] || 'o_';
  const i = loci['I'] || 'i_';

  const isDilute = d === 'dd';
  const hasSilver = i.startsWith('I');
  const hasBicolor = w.startsWith('Ws');
  const pointSuffix =
    c === 'cbcs' || c === 'cscb'
      ? ' Mink'
      : c === 'cscs' || c === 'csc' || c === 'cs_'
      ? ' Point'
      : c === 'cbcb' || c === 'cbc' || c === 'cb_'
      ? ' Sepia'
      : '';

  const baseDark =
    b === 'b1b1'
      ? isDilute
        ? 'Fawn'
        : 'Cinnamon'
      : b.startsWith('b') && b !== 'Bb1' && !b.startsWith('B')
      ? isDilute
        ? 'Lilac'
        : 'Chocolate'
      : isDilute
      ? 'Blue'
      : 'Black';

  const orangeColor = isDilute ? 'Cream' : 'Red / Orange';
  const cleanO = o.replace(/Y/gi, '');
  const isAllOrange = cleanO === 'O' || cleanO === 'OO';
  const isTortie = cleanO === 'Oo' || cleanO === 'oO';

  const sexTag = sex === 'Male' ? 'Male ' : sex === 'Female' ? 'Female ' : '';
  const bicolorTag = hasBicolor ? (isTortie ? ' Calico' : ' & White Bicolor') : '';
  const silverTag = hasSilver ? (a === 'aa' ? ' Smoke' : ' Silver') : '';

  if (isTortie) {
    return `${sexTag}${isDilute ? 'Dilute ' : ''}${hasBicolor ? 'Calico' : 'Tortoiseshell'}${pointSuffix}`;
  }
  if (isAllOrange) {
    return `${sexTag}${orangeColor}${silverTag} Tabby${pointSuffix}${hasBicolor ? ' & White' : ''}`;
  }
  const tabbyTag = a === 'aa' ? '' : ' Tabby';
  return `${sexTag}${baseDark}${silverTag}${tabbyTag}${pointSuffix}${bicolorTag}`;
}

// ─── 3. DOG (K / A / E Epistasis & Double Merle Alert) ─────────────────────────

const DOG_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti', alleles: ['ay', 'aw', 'at', 'a'], description: 'ay = Sable/Fawn, aw = Wolf Sable, at = Tan Points, a = Recessive Black' },
  { locus: 'K', name: 'Dominant Black / Brindle', alleles: ['KB', 'kbr', 'ky'], description: 'KB = Dominant Black, kbr = Brindle, kyky = Expresses A locus' },
  { locus: 'E', name: 'Extension', alleles: ['Em', 'Eg', 'E', 'e'], description: 'Em = Mask, E = Normal, ee = Recessive Red/Cream (epistatic over K/A)' },
  { locus: 'B', name: 'Black / Liver (Brown)', alleles: ['B', 'b'], description: 'B = Black nose/coat pigment, b = Liver/Chocolate' },
  { locus: 'D', name: 'Dense / Dilute', alleles: ['D', 'd'], description: 'D = Dense, d = Dilute (Blue / Isabella)' },
  { locus: 'M', name: 'Merle', alleles: ['M', 'm'], inheritanceMode: 'incomplete_dominant', description: 'Mm = Merle pattern, MM = Double Merle (deafness/eye risk), mm = Non-merle' },
  { locus: 'S', name: 'White Spotting', alleles: ['S', 'si', 'sp'], description: 'S = Solid, si = Irish Spotting, sp = Piebald' },
  { locus: 'H', name: 'Harlequin (Merle Mod.)', alleles: ['H', 'h'], description: 'Hh on Merle lightens background to white' },
  { locus: 'I', name: 'Phaeomelanin Intensity', alleles: ['I', 'i'], description: 'I = Rich Red/Fawn, ii = Cream/White' },
];

function classifyDogPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E_';
  const k = loci['K'] || 'kyky';
  const a = loci['A'] || 'at_';
  const b = loci['B'] || 'B_';
  const d = loci['D'] || 'D_';
  const m = loci['M'] || 'mm';
  const s = loci['S'] || 'S_';
  const intensity = loci['I'] || 'I_';

  const isLiver = b === 'bb';
  const isDilute = d === 'dd';
  const whiteNote = s === 'spsp' ? ' Piebald' : s === 'sisi' ? ' (Irish Trim)' : '';
  const merlePrefix = m === 'MM' ? 'Double Merle ' : m.startsWith('M') ? 'Merle ' : '';

  if (e === 'ee') {
    const shade = intensity === 'ii' ? 'Cream' : 'Red / Gold';
    return `${merlePrefix}${shade}${isLiver ? ' (Liver Nose)' : ''}${whiteNote}`;
  }

  const baseColor =
    isLiver && isDilute
      ? 'Isabella / Lilac'
      : isLiver
      ? 'Chocolate / Liver'
      : isDilute
      ? 'Blue'
      : 'Black';

  if (k.startsWith('KB')) return `${merlePrefix}Solid ${baseColor}${whiteNote}`;
  if (k.startsWith('kbr')) return `${merlePrefix}${baseColor} Brindle${whiteNote}`;

  if (a === 'aa') return `${merlePrefix}Recessive ${baseColor}${whiteNote}`;
  if (a === 'at_' || a === 'atat' || a === 'ata') return `${merlePrefix}${baseColor} & Tan Point${whiteNote}`;
  if (a.startsWith('aw')) return `${merlePrefix}${baseColor} Wolf Sable / Agouti${whiteNote}`;
  return `${merlePrefix}${intensity === 'ii' ? 'Cream' : 'Fawn / Red'} Sable${whiteNote}`;
}

// ─── 4. GOAT (Caprine Codominant Agouti Series) ────────────────────────────────

const GOAT_COLOR_LOCI: LocusDefinition[] = [
  {
    locus: 'A',
    name: 'Agouti (Codominant)',
    alleles: ['Awt', 'Ab', 'As', 'At', 'A', 'a'],
    inheritanceMode: 'codominant',
    description: 'Awt = White/Tan, Ab = Badgerface, As = Swiss Markings, At = Black & Tan, A = Bezoar, a = Recessive Black',
  },
  { locus: 'B', name: 'Brown / Black', alleles: ['B', 'b'], description: 'B = Black pigment, b = Chocolate/Brown' },
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+', 'e'], description: 'ED = Dominant Black, E+ = Wild-type (allows Agouti), e = Recessive Red' },
  { locus: 'Sp', name: 'White Spotting', alleles: ['Sp', 'sp'], description: 'Sp = Spotted / Piebald, sp = Solid' },
  { locus: 'Ms', name: 'Moonspots', alleles: ['Ms', 'ms'], description: 'Ms = Moonspots present, ms = None' },
  { locus: 'Rn', name: 'Roan', alleles: ['Rn', 'rn'], description: 'Rn = Roaning, rn = Solid pigment' },
];

function classifyGoatPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E+_';
  const a = loci['A'] || 'Awt_';
  const b = loci['B'] || 'B_';
  const sp = loci['Sp'] || 'sp_';
  const ms = loci['Ms'] || 'ms_';
  const rn = loci['Rn'] || 'rn_';

  const modSuffix = [
    ms.startsWith('Ms') ? 'with Moonspots' : '',
    rn.startsWith('Rn') ? 'Roan' : '',
    sp.startsWith('Sp') ? 'Spotted' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const tail = modSuffix ? ` (${modSuffix})` : '';
  const baseDark = b === 'bb' ? 'Chocolate / Brown' : 'Black';

  if (e === 'ee') return `Red / Tan Goat${tail}`;
  if (e.startsWith('ED')) return `Dominant ${baseDark}${tail}`;
  if (a === 'aa') return `Recessive Solid ${baseDark}${tail}`;
  if (a.includes('Awt') && !a.startsWith('a')) return `White / Buckskin Tan${tail}`;
  if (a.includes('Ab') && a.includes('As')) return `Codominant Badgerface + Swiss Markings${tail}`;
  if (a.includes('Ab')) return `Badgerface (${baseDark})${tail}`;
  if (a.includes('As')) return `Swiss Marked / Sundgau (${baseDark})${tail}`;
  if (a.includes('At')) return `${baseDark} & Tan${tail}`;
  return `Wild Bezoar / Chamoisee${tail}`;
}

// ─── 5. SHEEP ──────────────────────────────────────────────────────────────────

const SHEEP_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti', alleles: ['Awt', 'Ab', 'At', 'Aa'], inheritanceMode: 'codominant', description: 'Awt = White/Tan, Ab = Badgerface, At = Black & Tan / Mouflon, Aa = Self Black' },
  { locus: 'B', name: 'Black / Moorit', alleles: ['B', 'b'], description: 'B = Black pigment, b = Moorit / Brown' },
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+'], description: 'ED = Dominant Black, E+ = Normal (Agouti expressed)' },
  { locus: 'S', name: 'Spotting', alleles: ['S', 's'], description: 'S = Solid fleece, s = Piebald / Spotted' },
];

function classifySheepPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E+_';
  const a = loci['A'] || 'Awt_';
  const b = loci['B'] || 'B_';
  const s = loci['S'] || 'S_';
  const base = b === 'bb' ? 'Moorit Brown' : 'Black';
  const spot = s === 'ss' ? ' Piebald / Spotted' : '';

  if (e.startsWith('ED')) return `Dominant ${base}${spot}`;
  if (a.includes('Awt')) return `White / Tan Fleece${spot}`;
  if (a.includes('Ab')) return `Badgerface (${base})${spot}`;
  if (a.includes('At')) return `Mouflon / ${base} & Tan${spot}`;
  return `Solid ${base}${spot}`;
}

// ─── 6. CATTLE ─────────────────────────────────────────────────────────────────

const CATTLE_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+', 'e'], description: 'ED = Dominant Black, E+ = Wild/Agouti, e = Recessive Red' },
  { locus: 'D', name: 'Dun Dilution', alleles: ['D', 'd'], inheritanceMode: 'incomplete_dominant', description: 'DD/Dd = Dun/Diluted coat, dd = Non-dilute (wild pigment)' },
  { locus: 'R', name: 'Roan', alleles: ['R', 'r'], inheritanceMode: 'codominant', description: 'RR = White, Rr = Roan (Blue/Red Roan), rr = Solid' },
  { locus: 'S', name: 'Spotting / Belt', alleles: ['SH', 'SB', 'S', 's'], description: 'SH = Hereford Whiteface, SB = Belted, S = Solid, s = Recessive Spotted' },
];

function classifyCattlePhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E_';
  const d = loci['D'] || 'dd';
  const r = loci['R'] || 'rr';
  const s = loci['S'] || 'S_';

  const whiteMark = s.startsWith('SH')
    ? ' Whiteface'
    : s.startsWith('SB')
    ? ' Belted'
    : s === 'ss'
    ? ' Spotted'
    : '';
  const base = e === 'ee' ? 'Red' : e.startsWith('ED') ? 'Black' : 'Wild Red/Brown';
  if (r === 'RR') return `Roan-White${whiteMark}`;
  if (r.startsWith('R')) return `${base} Roan${whiteMark}`;
  if (d.startsWith('D')) return `${base === 'Red' ? 'Yellow / Palomino' : 'Dun'}${whiteMark}`;
  return `${base}${whiteMark}`;
}

// ─── 7. SWINE / PIG ────────────────────────────────────────────────────────────

const SWINE_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'E', name: 'Extension', alleles: ['ED', 'E+', 'ep', 'e'], description: 'ED = Dominant Black, E+ = Wild, ep = Spotted-Red, e = Red (Duroc)' },
  { locus: 'I', name: 'Dominant White', alleles: ['I', 'i'], description: 'I = Dominant White (Yorkshire/Landrace), ii = Colored' },
  { locus: 'Be', name: 'Belt', alleles: ['Be', 'be'], description: 'Be = Hampshire White Belt, bebe = Unbelted' },
  { locus: 'Rn', name: 'Roan', alleles: ['Rn', 'rn'], description: 'Rn = Blue/Red Roan' },
];

function classifySwinePhenotype(loci: Record<string, string>): string {
  const i = loci['I'] || 'ii';
  if (i.startsWith('I')) return 'Dominant White';
  const e = loci['E'] || 'E+_';
  const be = loci['Be'] || 'bebe';
  const rn = loci['Rn'] || 'rnrn';
  const belt = be.startsWith('Be') ? ' Hampshire Belted' : '';
  const roan = rn.startsWith('Rn') ? ' Roan' : '';
  if (e === 'ee') return `Red${belt}${roan}`;
  if (e.startsWith('ep')) return `Black-Spotted Red${belt}${roan}`;
  if (e.startsWith('ED')) return `Black${belt}${roan}`;
  return `Agouti / Wild Pattern${belt}${roan}`;
}

// ─── 8. ALPACA ─────────────────────────────────────────────────────────────────

const ALPACA_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'E', name: 'Extension', alleles: ['E', 'e'], description: 'E = Eumelanin pigment allowed, ee = Light Fawn / White (pheomelanin)' },
  { locus: 'A', name: 'Agouti', alleles: ['A', 'at', 'a'], description: 'A = Bay / Fawn-Brown, at = Black & Tan / Brown, aa = True Black' },
  { locus: 'G', name: 'Grey', alleles: ['G', 'g'], description: 'G = Classic Silver/Rose Grey' },
  { locus: 'S', name: 'Spotting / Tuxedo', alleles: ['S', 's'], description: 's = Appaloosa / Pinto / Tuxedo pattern' },
];

function classifyAlpacaPhenotype(loci: Record<string, string>): string {
  const e = loci['E'] || 'E_';
  const a = loci['A'] || 'A_';
  const g = loci['G'] || 'gg';
  const s = loci['S'] || 'S_';
  const mod = [g.startsWith('G') ? 'Grey' : '', s === 'ss' ? 'Pinto/Appaloosa' : ''].filter(Boolean).join(' ');
  const tail = mod ? ` (${mod})` : '';
  if (e === 'ee') return `White / Light Fawn${tail}`;
  if (a === 'aa') return `True Black${tail}`;
  if (a.startsWith('at')) return `Dark Brown / Bay Black${tail}`;
  return `Medium / Dark Fawn${tail}`;
}

// ─── 9. GUINEA PIG (Cavy) ──────────────────────────────────────────────────────

const GUINEA_PIG_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'A', name: 'Agouti', alleles: ['A', 'ar', 'a'], description: 'A = Agouti, ar = Solid ticked, a = Self' },
  { locus: 'B', name: 'Black / Chocolate', alleles: ['B', 'b'], description: 'B = Black pigment, b = Chocolate' },
  { locus: 'C', name: 'Color / Dilution', alleles: ['C', 'ck', 'cd', 'cr', 'ca'], description: 'C = Full, ck = Dark-dilute, cd = Cream/Buff, cr = Red-eyed Himalayan, ca = Albino (PEW)' },
  { locus: 'E', name: 'Extension', alleles: ['E', 'ep', 'e'], description: 'E = Normal, ep = Tortoiseshell/Brindle, e = Red/Gold/White' },
  { locus: 'P', name: 'Pink-Eyed Dilution', alleles: ['P', 'p'], description: 'P = Dark eye, p = Pink-eye (Lilac, Beige, Saffron)' },
  { locus: 'S', name: 'Dutch / White Spotting', alleles: ['S', 's'], description: 'S = Solid, ss = Dutch / Broken white' },
  { locus: 'Rn', name: 'Roan / Dalmatian', alleles: ['Rn', 'rn'], inheritanceMode: 'incomplete_dominant', description: 'Rn = Roan/Dalmatian (RnRn Lethal White risk!)' },
];

function classifyGuineaPigPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  if (c === 'ca' || c === 'caca') return 'Pink-Eyed White (Albino)';
  const a = loci['A'] || 'A_';
  const b = loci['B'] || 'B_';
  const e = loci['E'] || 'E_';
  const p = loci['P'] || 'P_';
  const rn = loci['Rn'] || 'rnrn';
  const s = loci['S'] || 'S_';

  const roan = rn === 'RnRn' ? 'Lethal White (RnRn) ' : rn.startsWith('Rn') ? 'Roan / Dalmatian ' : '';
  const white = s === 'ss' ? ' & White' : '';
  const pinkEye = p === 'pp';

  if (c === 'cr' || c === 'crcr' || c === 'crca' || c === 'cr_') return `${roan}Himalayan / California Pointed${white}`;
  if (e === 'ee') return `${roan}${pinkEye ? 'Saffron / Gold (Pink-Eyed)' : c.startsWith('cd') ? 'Cream' : 'Red / Golden'}${white}`;
  if (e.startsWith('ep')) return `${roan}Tortoiseshell / Brindle${white}`;

  const base =
    b === 'bb'
      ? pinkEye
        ? 'Beige'
        : 'Chocolate'
      : pinkEye
      ? 'Lilac'
      : 'Black';
  if (a === 'aa') return `${roan}Self ${base}${white}`;
  if (a.startsWith('ar')) return `${roan}${base} Solid Ticked Agouti${white}`;
  return `${roan}${base} Agouti${white}`;
}

// ─── 10. CHINCHILLA (Lethal Wh / TO tracking) ─────────────────────────────────

const CHINCHILLA_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'Wh', name: 'Wilson White (Lethal)', alleles: ['Wh', 'wh'], inheritanceMode: 'incomplete_dominant', description: 'Whwh = Wilson White / Mosaic; WhWh = Embryonic Lethal' },
  { locus: 'TO', name: 'Black Velvet / TOV (Lethal)', alleles: ['TO', 'to'], inheritanceMode: 'incomplete_dominant', description: 'TOto = Black Velvet; TOTO = Embryonic Lethal' },
  { locus: 'Bg', name: 'Beige', alleles: ['Bg', 'bg'], inheritanceMode: 'incomplete_dominant', description: 'Bgbg = Hetero Beige, BgBg = Homo Beige' },
  { locus: 'V', name: 'Violet', alleles: ['V', 'v'], description: 'vv = Afro/Deutsch Violet' },
  { locus: 'S', name: 'Sapphire', alleles: ['S', 's'], description: 'ss = Sapphire' },
  { locus: 'Eb', name: 'Ebony / Charcoal', alleles: ['Eb', 'eb'], inheritanceMode: 'incomplete_dominant', description: 'eb = Ebony / Extra Dark Charcoal' },
  { locus: 'Al', name: 'Albino', alleles: ['Al', 'al'], description: 'alal = Recessive Albino' },
];

function classifyChinchillaPhenotype(loci: Record<string, string>): string {
  const wh = loci['Wh'] || 'whwh';
  const to = loci['TO'] || 'toto';
  if (wh === 'WhWh') return 'Embryonic Lethal (WhWh)';
  if (to === 'TOTO') return 'Embryonic Lethal (TOTO)';

  const al = loci['Al'] || 'Al_';
  if (al === 'alal') return 'Pink-Eyed White / Albino';

  const bg = loci['Bg'] || 'bgbg';
  const v = loci['V'] || 'V_';
  const s = loci['S'] || 'S_';
  const eb = loci['Eb'] || 'Eb_';

  const mods: string[] = [];
  if (wh.startsWith('Wh')) mods.push('White');
  if (to.startsWith('TO')) mods.push('Velvet / TOV');
  if (bg === 'BgBg') mods.push('Homozygous Beige');
  else if (bg.startsWith('Bg')) mods.push('Beige');
  if (v === 'vv') mods.push('Violet');
  if (s === 'ss') mods.push('Sapphire');
  if (eb === 'ebeb') mods.push('Ebony');

  return mods.length > 0 ? mods.join(' ') : 'Standard Grey';
}

// ─── 11. FERRET (Waardenburg Blaze/Panda Deafness Tracking) ─────────────────────

const FERRET_COLOR_LOCI: LocusDefinition[] = [
  { locus: 'B', name: 'Sable / Chocolate', alleles: ['B', 'b'], description: 'B = Sable base, bb = Chocolate / Champagne' },
  { locus: 'C', name: 'Albino', alleles: ['C', 'c'], description: 'cc = Albino (Ruby-Eyed White)' },
  { locus: 'Pa', name: 'Panda', alleles: ['Pa', 'pa'], description: 'Pa = Panda head/bib white (Waardenburg deafness risk)' },
  { locus: 'Bl', name: 'Blaze', alleles: ['Bl', 'bl'], description: 'Bl = White head blaze (Waardenburg deafness risk)' },
  { locus: 'Ro', name: 'Roan / Silver', alleles: ['Ro', 'ro'], description: 'Ro = Silver / Roan guard hairs' },
  { locus: 'Mt', name: 'Mitts', alleles: ['Mt', 'mt'], description: 'Mt = White paws / mitts' },
];

function classifyFerretPhenotype(loci: Record<string, string>): string {
  const c = loci['C'] || 'C_';
  if (c === 'cc') return 'Albino (REW)';
  const b = loci['B'] || 'B_';
  const pa = loci['Pa'] || 'papa';
  const bl = loci['Bl'] || 'blbl';
  const ro = loci['Ro'] || 'roro';
  const mt = loci['Mt'] || 'mtmt';

  const base = b === 'bb' ? 'Chocolate / Champagne' : 'Sable';
  const pattern = [
    pa.startsWith('Pa') ? 'Panda' : '',
    bl.startsWith('Bl') ? 'Blaze' : '',
    ro.startsWith('Ro') ? 'Silver / Roan' : '',
    mt.startsWith('Mt') ? 'Mitts' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return pattern ? `${base} (${pattern})` : base;
}

// ─── SPECIES REGISTRY ──────────────────────────────────────────────────────────

export const SPECIES_GENETICS_SPECS: SpeciesGeneticsSpec[] = [
  {
    speciesKey: 'rabbit',
    displayName: 'Rabbit',
    aliases: ['rabbit', 'rabbits', 'oryctolagus'],
    loci: RABBIT_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'C', 'D', 'E', 'W', 'En', 'V', 'Du'],
    varietyPresets: RABBIT_VARIETY_PRESET_DEFS,
    supportsRufusIntensity: true,
    classifyPhenotype: classifyRabbitPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const en = byLocus.get('En');
      const enEn = en?.outcomes.find((o) => o.genotype === 'EnEn');
      if (enEn && enEn.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'En',
          title: `Charlie / Megacolon Risk (${enEn.probabilityPercent}% EnEn)`,
          detail:
            'Crossing two Broken/English carriers (En_) can produce EnEn Charlie kits predisposed to megacolon digestive syndrome.',
        });
      }
      const w = byLocus.get('W');
      if (w && (w.sirePair.includes('_') || w.damPair.includes('_'))) {
        alerts.push({
          severity: 'info',
          locus: 'W',
          title: 'Wide-Band (W/w) Unverified on One or Both Parents',
          detail:
            'Because W_ / __ leaves Wide-Band open, Red crosses may produce non-wideband (W_) or variable undercolor offspring until ww is verified.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'cat',
    displayName: 'Cat',
    aliases: ['cat', 'cats', 'feline'],
    loci: CAT_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'C', 'D', 'O', 'W', 'I'],
    varietyPresets: [
      { variety: 'Black / Solid', conservativeGenotype: 'aa B_ C_ D_ oo ww ii' },
      { variety: 'Blue / Russian Blue', conservativeGenotype: 'aa B_ C_ dd oo ww ii' },
      { variety: 'Red Tabby (Male)', conservativeGenotype: 'A_ B_ C_ D_ OY ww ii' },
      { variety: 'Tortoiseshell (Female)', conservativeGenotype: 'A_ B_ C_ D_ Oo ww ii' },
      { variety: 'Siamese Seal Point', conservativeGenotype: 'aa B_ cscs D_ oo ww ii' },
    ],
    classifyPhenotype: classifyCatPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const w = byLocus.get('W');
      if (w && w.outcomes.some((o) => o.genotype.startsWith('W') && !o.genotype.startsWith('Ws'))) {
        alerts.push({
          severity: 'warning',
          locus: 'W',
          title: 'Dominant White (W) Sensory Screening Note',
          detail:
            'Dominant White cats (especially blue-eyed kittens) carry elevated congenital deafness screening needs (BAER testing recommended).',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'dog',
    displayName: 'Dog',
    aliases: ['dog', 'dogs', 'canine'],
    loci: DOG_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'K', 'E', 'B', 'D', 'M', 'S', 'I'],
    varietyPresets: [
      { variety: 'Black & Tan', conservativeGenotype: 'atat kyky E_ B_ D_ mm S_' },
      { variety: 'Recessive Red / Yellow', conservativeGenotype: 'A_ K_ ee B_ D_ mm S_' },
      { variety: 'Blue Merle', conservativeGenotype: 'A_ KB_ E_ B_ D_ Mm S_' },
      { variety: 'Solid Black', conservativeGenotype: 'A_ KB_ E_ B_ D_ mm S_' },
    ],
    classifyPhenotype: classifyDogPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const m = byLocus.get('M');
      const mm = m?.outcomes.find((o) => o.genotype === 'MM');
      if (mm && mm.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'M',
          title: `Double Merle Alert (${mm.probabilityPercent}% MM)`,
          detail:
            'Merle × Merle pairings carry a high risk of Double Merle (MM) puppies with congenital deafness and microphthalmia / blindness.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'goat',
    displayName: 'Goat',
    aliases: ['goat', 'goats', 'caprine'],
    loci: GOAT_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'E', 'Sp', 'Ms', 'Rn'],
    varietyPresets: [
      { variety: 'Swiss / Oberhasli Markings', conservativeGenotype: 'As_ B_ E+_ spsp' },
      { variety: 'Badgerface / Chamoisee', conservativeGenotype: 'Ab_ B_ E+_ spsp' },
      { variety: 'Solid Black', conservativeGenotype: 'aa B_ E+_ spsp' },
      { variety: 'Gold / Red', conservativeGenotype: 'A_ B_ ee spsp' },
    ],
    classifyPhenotype: classifyGoatPhenotype,
  },
  {
    speciesKey: 'sheep',
    displayName: 'Sheep',
    aliases: ['sheep', 'ovine'],
    loci: SHEEP_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'E', 'S'],
    varietyPresets: [
      { variety: 'White Wool', conservativeGenotype: 'Awt_ B_ E+_ S_' },
      { variety: 'Black Self', conservativeGenotype: 'AaAa B_ E+_ S_' },
      { variety: 'Moorit Brown', conservativeGenotype: 'AaAa bb E+_ S_' },
      { variety: 'Badgerface', conservativeGenotype: 'Ab_ B_ E+_ S_' },
    ],
    classifyPhenotype: classifySheepPhenotype,
  },
  {
    speciesKey: 'cattle',
    displayName: 'Cattle',
    aliases: ['cattle', 'cow', 'bovine'],
    loci: CATTLE_COLOR_LOCI,
    corePhenotypeLoci: ['E', 'D', 'R', 'S'],
    varietyPresets: [
      { variety: 'Black Angus', conservativeGenotype: 'ED_ dd rr S_' },
      { variety: 'Red', conservativeGenotype: 'ee dd rr S_' },
      { variety: 'Blue Roan', conservativeGenotype: 'ED_ dd Rr S_' },
      { variety: 'Hereford Whiteface', conservativeGenotype: 'ee dd rr SH_' },
    ],
    classifyPhenotype: classifyCattlePhenotype,
  },
  {
    speciesKey: 'swine',
    displayName: 'Swine / Pig',
    aliases: ['swine / pig', 'swine', 'pig', 'pigs', 'porcine'],
    loci: SWINE_COLOR_LOCI,
    corePhenotypeLoci: ['E', 'I', 'Be', 'Rn'],
    varietyPresets: [
      { variety: 'Duroc Red', conservativeGenotype: 'ee ii bebe' },
      { variety: 'Hampshire Belted', conservativeGenotype: 'ED_ ii Be_' },
      { variety: 'Yorkshire White', conservativeGenotype: 'E+_ I_ bebe' },
    ],
    classifyPhenotype: classifySwinePhenotype,
  },
  {
    speciesKey: 'alpaca',
    displayName: 'Alpaca',
    aliases: ['alpaca', 'alpacas'],
    loci: ALPACA_COLOR_LOCI,
    corePhenotypeLoci: ['E', 'A', 'G', 'S'],
    varietyPresets: [
      { variety: 'White / Light Fawn', conservativeGenotype: 'ee A_ gg S_' },
      { variety: 'True Black', conservativeGenotype: 'E_ aa gg S_' },
      { variety: 'Silver / Rose Grey', conservativeGenotype: 'E_ A_ G_ S_' },
    ],
    classifyPhenotype: classifyAlpacaPhenotype,
  },
  {
    speciesKey: 'guinea_pig',
    displayName: 'Guinea Pig',
    aliases: ['guinea pig', 'guinea pigs', 'cavy', 'cavies'],
    loci: GUINEA_PIG_COLOR_LOCI,
    corePhenotypeLoci: ['A', 'B', 'C', 'E', 'P', 'S', 'Rn'],
    varietyPresets: [
      { variety: 'Golden Agouti', conservativeGenotype: 'A_ B_ C_ E_ P_ S_ rnrn' },
      { variety: 'Self Black', conservativeGenotype: 'aa B_ C_ E_ P_ S_ rnrn' },
      { variety: 'Roan / Dalmatian', conservativeGenotype: 'aa B_ C_ E_ P_ S_ Rnrn' },
    ],
    classifyPhenotype: classifyGuineaPigPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const rn = byLocus.get('Rn');
      const rnrn = rn?.outcomes.find((o) => o.genotype === 'RnRn');
      if (rnrn && rnrn.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'Rn',
          title: `Lethal White Risk (${rnrn.probabilityPercent}% RnRn)`,
          detail:
            'Roan × Roan or Dalmatian crosses carry a 25%+ risk of Lethal White (RnRn) pups with severe eye/ear/dental defects.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'chinchilla',
    displayName: 'Chinchilla',
    aliases: ['chinchilla', 'chinchillas'],
    loci: CHINCHILLA_COLOR_LOCI,
    corePhenotypeLoci: ['Wh', 'TO', 'Bg', 'V', 'S', 'Eb', 'Al'],
    varietyPresets: [
      { variety: 'Standard Grey', conservativeGenotype: 'whwh toto bgbg V_ S_ Eb_ Al_' },
      { variety: 'Wilson White', conservativeGenotype: 'Whwh toto bgbg V_ S_ Eb_ Al_' },
      { variety: 'Black Velvet', conservativeGenotype: 'whwh TOto bgbg V_ S_ Eb_ Al_' },
      { variety: 'Afro Violet', conservativeGenotype: 'whwh toto bgbg vv S_ Eb_ Al_' },
    ],
    classifyPhenotype: classifyChinchillaPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const wh = byLocus.get('Wh');
      const whWh = wh?.outcomes.find((o) => o.genotype === 'WhWh');
      if (whWh && whWh.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'Wh',
          title: `Wilson White Lethal Factor (${whWh.probabilityPercent}% WhWh)`,
          detail:
            'Wilson White × Wilson White produces ~25% homozygous WhWh embryonic lethal kits (reduced litter size / resorption risk).',
        });
      }
      const to = byLocus.get('TO');
      const toTo = to?.outcomes.find((o) => o.genotype === 'TOTO');
      if (toTo && toTo.probabilityPercent > 0) {
        alerts.push({
          severity: 'danger',
          locus: 'TO',
          title: `Black Velvet / TOV Lethal Factor (${toTo.probabilityPercent}% TOTO)`,
          detail:
            'Velvet × Velvet pairings carry ~25% homozygous TOTO embryonic lethality.',
        });
      }
      return alerts;
    },
  },
  {
    speciesKey: 'ferret',
    displayName: 'Ferret',
    aliases: ['ferret', 'ferrets'],
    loci: FERRET_COLOR_LOCI,
    corePhenotypeLoci: ['B', 'C', 'Pa', 'Bl', 'Ro', 'Mt'],
    varietyPresets: [
      { variety: 'Sable', conservativeGenotype: 'B_ C_ papa blbl roro mtmt' },
      { variety: 'Albino (REW)', conservativeGenotype: 'B_ cc papa blbl roro mtmt' },
      { variety: 'Blaze', conservativeGenotype: 'B_ C_ papa Blbl roro mtmt' },
      { variety: 'Panda', conservativeGenotype: 'B_ C_ Papa blbl roro mtmt' },
    ],
    classifyPhenotype: classifyFerretPhenotype,
    evaluatePairingAlerts: (byLocus) => {
      const alerts: BreedingGeneticAlert[] = [];
      const pa = byLocus.get('Pa');
      const bl = byLocus.get('Bl');
      const paRisk =
        pa &&
        pa.sirePair.toLowerCase().includes('pa') &&
        !pa.sirePair.includes('papa') &&
        pa.damPair.toLowerCase().includes('pa') &&
        !pa.damPair.includes('papa');
      const blRisk =
        bl &&
        bl.sirePair.toLowerCase().includes('bl') &&
        !bl.sirePair.includes('blbl') &&
        bl.damPair.toLowerCase().includes('bl') &&
        !bl.damPair.includes('blbl');
      const crossPatternRisk =
        ((pa && !pa.sirePair.includes('papa')) || (bl && !bl.sirePair.includes('blbl'))) &&
        ((pa && !pa.damPair.includes('papa')) || (bl && !bl.damPair.includes('blbl')));

      if (paRisk || blRisk || crossPatternRisk) {
        alerts.push({
          severity: 'warning',
          title: 'Waardenburg Syndrome / Deafness Risk (Blaze / Panda Cross)',
          detail:
            'Pairing Blaze or Panda patterned ferrets elevates neural-crest Waardenburg deafness risk in kits.',
        });
      }
      return alerts;
    },
  },
];

/**
 * Looks up the coat color genetics ruleset for any species name.
 * Returns `null` for manually created / custom species so Rabbit rules never leak into custom livestock.
 */
export function getGeneticsSpecForSpecies(speciesName?: string): SpeciesGeneticsSpec | null {
  const clean = (speciesName || '').trim().toLowerCase();
  if (!clean) return SPECIES_GENETICS_SPECS[0]; // Default legacy calls without species param to Rabbit
  for (const spec of SPECIES_GENETICS_SPECS) {
    if (spec.speciesKey === clean || spec.aliases.includes(clean)) {
      return spec;
    }
  }
  return null;
}

/**
 * Returns conservative variety presets + optional confirmation prompts for the requested species.
 */
export function getSpeciesVarietyPresets(speciesName?: string): VarietyPresetDefinition[] {
  const spec = getGeneticsSpecForSpecies(speciesName);
  return spec ? spec.varietyPresets : [];
}

/**
 * Resolves a VarietyPresetDefinition with breeder-checked optional locus confirmations
 * (e.g. only replacing Wide-Band `__` with `ww` if the user explicitly confirms `W`).
 */
export function buildPresetGenotypeWithConfirmations(
  preset: VarietyPresetDefinition,
  confirmedLoci: string[],
  speciesName?: string
): string {
  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return preset.conservativeGenotype;

  const basePairs = parseGenotypeString(preset.conservativeGenotype, spec.displayName);
  const byLocus = new Map<string, GenotypeAllelePair>(basePairs.map((p) => [p.locus, { ...p }]));
  const confirmedSet = new Set(confirmedLoci.map((l) => l.trim().toLowerCase()));

  for (const opt of preset.optionalConfirmations || []) {
    if (!confirmedSet.has(opt.locus.trim().toLowerCase())) continue;
    const parsedOpt = parseGenotypeString(opt.suggestedAlleles, spec.displayName);
    for (const pair of parsedOpt) {
      byLocus.set(pair.locus, pair);
    }
  }

  return formatGenotypeArray(Array.from(byLocus.values()));
}

/**
 * Normalizes an allele pair so any unknown `'_'` slot is always placed second (`allele_`, never `_allele`).
 */
function normalizePairWithSpec(
  locusDef: LocusDefinition | undefined,
  rawA1: string,
  rawA2: string
): { allele1: string; allele2: string } {
  const a1 = (rawA1 || '_').trim() || '_';
  const a2 = (rawA2 || '_').trim() || '_';
  if (a1 === '_' && a2 === '_') return { allele1: '_', allele2: '_' };
  if (a1 === '_') return { allele1: a2, allele2: '_' };
  if (a2 === '_') return { allele1: a1, allele2: '_' };

  if (locusDef?.inheritanceMode === 'x_linked') {
    if (a2 === 'Y') return { allele1: a1, allele2: 'Y' };
    if (a1 === 'Y') return { allele1: a2, allele2: 'Y' };
  }

  if (!locusDef) {
    return a1 <= a2 ? { allele1: a1, allele2: a2 } : { allele1: a2, allele2: a1 };
  }
  const i1 = locusDef.alleles.indexOf(a1);
  const i2 = locusDef.alleles.indexOf(a2);
  if (i1 === -1 || i2 === -1) return { allele1: a1, allele2: a2 };
  return i1 <= i2 ? { allele1: a1, allele2: a2 } : { allele1: a2, allele2: a1 };
}

/**
 * Formats a `GenotypeAllelePair[]` array into a clean shorthand string (e.g., `"A_ B_ C_ D_ ee __"`).
 */
export function formatGenotypeArray(pairs: GenotypeAllelePair[]): string {
  if (!pairs || pairs.length === 0) return '';
  return pairs
    .filter((p) => p.allele1 || p.allele2)
    .map((p) => {
      const a1 = p.allele1 || '_';
      const a2 = p.allele2 || '_';
      if (a1 === '_' && a2 !== '_') return `${a2}_`;
      return `${a1}${a2}`;
    })
    .join(' ');
}

/**
 * Updates a single locus within a shorthand genotype string while preserving canonical species
 * locus ordering and positional `'__'` alignment for preceding blank loci.
 */
export function setLocusInGenotypeString(
  raw: string,
  locusCode: string,
  rawAllele1: string,
  rawAllele2: string,
  speciesName?: string,
  sex?: BiologicalSex
): string {
  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return (raw || '').trim();

  const locusDef = spec.loci.find((l) => l.locus === locusCode);
  if (!locusDef) return (raw || '').trim();

  const existingPairs = parseGenotypeString(raw, speciesName);
  const byLocus = new Map<string, GenotypeAllelePair>();
  for (const p of existingPairs) {
    byLocus.set(p.locus, { ...p });
  }

  const cleanA1 = (rawAllele1 || '_').trim() || '_';
  const cleanA2 =
    locusDef.inheritanceMode === 'x_linked' && sex === 'Male'
      ? 'Y'
      : (rawAllele2 || '_').trim() || '_';

  const normalized = normalizePairWithSpec(locusDef, cleanA1, cleanA2);
  const isUnsetXMale =
    locusDef.inheritanceMode === 'x_linked' &&
    normalized.allele2 === 'Y' &&
    normalized.allele1 === '_';
  const isUnsetPair = normalized.allele1 === '_' && normalized.allele2 === '_';

  if (isUnsetPair || isUnsetXMale) {
    byLocus.delete(locusCode);
  } else {
    byLocus.set(locusCode, {
      locus: locusCode,
      allele1: normalized.allele1,
      allele2: normalized.allele2,
    });
  }

  let lastActiveIdx = -1;
  spec.loci.forEach((def, idx) => {
    const pair = byLocus.get(def.locus);
    if (pair && (pair.allele1 !== '_' || (pair.allele2 !== '_' && pair.allele2 !== 'Y'))) {
      lastActiveIdx = idx;
    }
  });

  if (lastActiveIdx === -1) return '';

  const ordered: GenotypeAllelePair[] = [];
  for (let i = 0; i <= lastActiveIdx; i++) {
    const def = spec.loci[i];
    const existing = byLocus.get(def.locus);
    if (existing) {
      ordered.push(existing);
    } else {
      ordered.push({
        locus: def.locus,
        allele1: '_',
        allele2: def.inheritanceMode === 'x_linked' && sex === 'Male' ? 'Y' : '_',
      });
    }
  }

  return formatGenotypeArray(ordered);
}

/**
 * Parses a shorthand genotype string into structured `GenotypeAllelePair[]` for the given species.
 * Returns `[]` when `speciesName` is a custom/unrecognized species (zero Rabbit cross-bleed).
 */
export function parseGenotypeString(raw: string, speciesName?: string): GenotypeAllelePair[] {
  const clean = (raw || '').trim();
  if (!clean) return [];

  const spec = getGeneticsSpecForSpecies(speciesName);
  if (!spec) return [];

  const tokens = clean.split(/\s+/);
  const result: GenotypeAllelePair[] = [];

  const knownTokens = spec.loci.map((l) => ({
    def: l,
    locus: l.locus,
    alleles: [...l.alleles].sort((a, b) => b.length - a.length),
  }));

  tokens.forEach((token, index) => {
    let matched = false;

    if (token === '__' || token === '_') {
      const positional = knownTokens[index];
      result.push({
        locus: positional ? positional.locus : `L${index + 1}`,
        allele1: '_',
        allele2: '_',
      });
      return;
    }

    const positionalEntry = knownTokens[index];
    const searchOrder = positionalEntry
      ? [positionalEntry, ...knownTokens.filter((_, i) => i !== index)]
      : knownTokens;

    // Special handling for single-allele or hemizygous Y tokens on X-linked loci (e.g. Cat `O`, `OY`, `oY`, `o-`)
    for (const entry of searchOrder) {
      if (entry.def.inheritanceMode === 'x_linked') {
        for (const a1 of [...entry.alleles, '_']) {
          if (token === a1 || token === `${a1}Y` || token === `${a1}-`) {
            result.push({
              locus: entry.locus,
              allele1: a1,
              allele2: 'Y',
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      const validSingles = [...entry.alleles, '_'];
      for (const a1 of validSingles) {
        if (token.startsWith(a1)) {
          const rest = token.slice(a1.length);
          if (validSingles.includes(rest)) {
            const norm = normalizePairWithSpec(entry.def, a1, rest);
            result.push({ locus: entry.locus, allele1: norm.allele1, allele2: norm.allele2 });
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }

    if (!matched && token.length >= 2) {
      const half = Math.ceil(token.length / 2);
      const norm = normalizePairWithSpec(undefined, token.slice(0, half), token.slice(half) || '_');
      result.push({
        locus: `L${index + 1}`,
        allele1: norm.allele1,
        allele2: norm.allele2,
      });
    }
  });

  return result;
}

export interface InferredGenotypeNote {
  locus: string;
  before: string;
  after: string;
  reason: string;
}

export interface GenotypeInferenceResult {
  updatedPairs: GenotypeAllelePair[];
  formatted: string;
  notes: InferredGenotypeNote[];
  conflicts: string[];
}

function getAnimalPairsForSpecies(animal: Animal, speciesName: string): GenotypeAllelePair[] {
  if (animal.genotype && animal.genotype.length > 0 && !animal.genotypeRaw) {
    return animal.genotype;
  }
  const parsedFromRaw = parseGenotypeString(animal.genotypeRaw, speciesName);
  if (parsedFromRaw.length > 0) return parsedFromRaw;
  return animal.genotype ?? [];
}

/**
 * Infers hidden alleles on a subject animal using its parents AND its recorded offspring.
 * - Supports homozygous dominant AND homozygous recessive parental inference (and catches conflicts)
 * - Normalizes partial slots to `allele_` (never `_allele`)
 * - Expands offspring inference across intermediate recessive alleles (e.g. `atat`, `chdchd`, `cbcb`)
 */
export function inferHiddenAlleles(
  subject: Animal,
  herdById: Map<string, Animal>,
  allSpeciesAnimals: Animal[],
  speciesName?: string
): GenotypeInferenceResult {
  const effectiveSpecies = speciesName || subject.species || 'Rabbit';
  const spec = getGeneticsSpecForSpecies(effectiveSpecies);
  if (!spec) {
    return {
      updatedPairs: [],
      formatted: subject.genotypeRaw || '',
      notes: [],
      conflicts: [],
    };
  }

  const basePairs = getAnimalPairsForSpecies(subject, effectiveSpecies);
  const byLocus = new Map<string, GenotypeAllelePair>();
  for (const p of basePairs) {
    byLocus.set(p.locus, { ...p });
  }

  const sire = subject.sireId ? herdById.get(subject.sireId) : undefined;
  const dam = subject.damId ? herdById.get(subject.damId) : undefined;
  const offspring = allSpeciesAnimals.filter(
    (a) => a.sireId === subject.id || a.damId === subject.id
  );

  const notes: InferredGenotypeNote[] = [];
  const conflicts: string[] = [];

  for (const locusDef of spec.loci) {
    const current = byLocus.get(locusDef.locus);
    if (!current) continue;

    // Normalize initial ordering so `'_'` is always allele2
    const initNorm = normalizePairWithSpec(locusDef, current.allele1, current.allele2);
    current.allele1 = initNorm.allele1;
    current.allele2 = initNorm.allele2;

    if (locusDef.inheritanceMode === 'x_linked') {
      // X-linked inference:
      // 1) Male XY gets his single X allele from Dam; Female XX gets Sire's single X allele
      if (subject.sex === 'Male' && dam) {
        const damPairs = getAnimalPairsForSpecies(dam, effectiveSpecies);
        const damLocus = damPairs.find((x) => x.locus === locusDef.locus);
        if (damLocus && damLocus.allele1 !== '_' && damLocus.allele1 === damLocus.allele2) {
          const dAllele = damLocus.allele1;
          if (current.allele1 === '_') {
            const before = `${current.allele1}${current.allele2}`;
            current.allele1 = dAllele;
            notes.push({
              locus: locusDef.locus,
              before,
              after: `${current.allele1}${current.allele2}`,
              reason: `Dam (${dam.name}) is homozygous ${dAllele}${dAllele} and must pass '${dAllele}' to male offspring.`,
            });
          } else if (current.allele1 !== dAllele) {
            conflicts.push(
              `${locusDef.name} (${locusDef.locus}): Dam ${dam.name} is ${dAllele}${dAllele}, conflicting with male ${subject.name}'s recorded ${current.allele1}Y.`
            );
          }
        }
      } else if (subject.sex === 'Female' && sire) {
        const sirePairs = getAnimalPairsForSpecies(sire, effectiveSpecies);
        const sireLocus = sirePairs.find((x) => x.locus === locusDef.locus);
        if (sireLocus && sireLocus.allele1 !== '_') {
          const sAllele = sireLocus.allele1;
          const hasAllele = current.allele1 === sAllele || current.allele2 === sAllele;
          if ((current.allele1 === '_' || current.allele2 === '_') && !hasAllele) {
            const before = `${current.allele1}${current.allele2}`;
            const filled = normalizePairWithSpec(
              locusDef,
              current.allele1 === '_' ? sAllele : current.allele1,
              current.allele2 === '_' ? sAllele : current.allele2
            );
            current.allele1 = filled.allele1;
            current.allele2 = filled.allele2;
            notes.push({
              locus: locusDef.locus,
              before,
              after: `${current.allele1}${current.allele2}`,
              reason: `Sire (${sire.name}) is ${sAllele}Y and must pass '${sAllele}' to female offspring.`,
            });
          } else if (current.allele1 !== '_' && current.allele2 !== '_' && !hasAllele) {
            conflicts.push(
              `${locusDef.name} (${locusDef.locus}): Sire ${sire.name} is ${sAllele}Y, conflicting with female ${subject.name}'s recorded ${current.allele1}${current.allele2}.`
            );
          }
        }
      }

      // 2) Dam gets proven X-linked allele from any recorded Male offspring (kY -> Dam carries k)
      if (subject.sex === 'Female') {
        for (const kit of offspring) {
          if (kit.sex !== 'Male') continue;
          const kLocus = getAnimalPairsForSpecies(kit, effectiveSpecies).find(
            (x) => x.locus === locusDef.locus
          );
          if (!kLocus || kLocus.allele1 === '_') continue;
          const sonAllele = kLocus.allele1;
          const hasAllele = current.allele1 === sonAllele || current.allele2 === sonAllele;
          if ((current.allele1 === '_' || current.allele2 === '_') && !hasAllele) {
            const before = `${current.allele1}${current.allele2}`;
            const filled = normalizePairWithSpec(
              locusDef,
              current.allele1 === '_' ? sonAllele : current.allele1,
              current.allele2 === '_' ? sonAllele : current.allele2
            );
            current.allele1 = filled.allele1;
            current.allele2 = filled.allele2;
            notes.push({
              locus: locusDef.locus,
              before,
              after: `${current.allele1}${current.allele2}`,
              reason: `Son ${kit.name} expresses ${sonAllele}Y, proving Dam ${subject.name} carries '${sonAllele}'.`,
            });
          } else if (current.allele1 !== '_' && current.allele2 !== '_' && !hasAllele) {
            conflicts.push(
              `${locusDef.name} (${locusDef.locus}): Son ${kit.name} is ${sonAllele}Y, impossible if Dam ${subject.name} is ${current.allele1}${current.allele2}.`
            );
          }
        }
      }
      continue;
    }

    const sireLocus = sire
      ? getAnimalPairsForSpecies(sire, effectiveSpecies).find((x) => x.locus === locusDef.locus)
      : undefined;
    const damLocus = dam
      ? getAnimalPairsForSpecies(dam, effectiveSpecies).find((x) => x.locus === locusDef.locus)
      : undefined;

    // 1A. Dual homozygous parent guarantee (e.g., AA × AA on subject A_ -> AA)
    if (
      sireLocus &&
      damLocus &&
      sireLocus.allele1 !== '_' &&
      sireLocus.allele1 === sireLocus.allele2 &&
      damLocus.allele1 !== '_' &&
      damLocus.allele1 === damLocus.allele2
    ) {
      const sAllele = sireLocus.allele1;
      const dAllele = damLocus.allele1;
      const expected = normalizePairWithSpec(locusDef, sAllele, dAllele);
      if (current.allele1 === '_' || current.allele2 === '_') {
        if (
          current.allele1 === '_' ||
          current.allele1 === expected.allele1 ||
          current.allele1 === expected.allele2
        ) {
          const before = `${current.allele1}${current.allele2}`;
          current.allele1 = expected.allele1;
          current.allele2 = expected.allele2;
          notes.push({
            locus: locusDef.locus,
            before,
            after: `${current.allele1}${current.allele2}`,
            reason: `Sire (${sire!.name}, ${sAllele}${sAllele}) and Dam (${dam!.name}, ${dAllele}${dAllele}) uniquely determine ${expected.allele1}${expected.allele2}.`,
          });
        }
      }
    }

    // 1B. Single Homozygous Parent Inference & Conflict Check (works for AA, cc, chdchd, atat, ww, DD, etc.)
    for (const [parentLabel, parent, pLocus] of [
      ['Sire', sire, sireLocus],
      ['Dam', dam, damLocus],
    ] as const) {
      if (!parent || !pLocus) continue;
      if (pLocus.allele1 === '_' || pLocus.allele1 !== pLocus.allele2) continue;

      const passedAllele = pLocus.allele1;
      const hasAlleleAlready =
        current.allele1 === passedAllele || current.allele2 === passedAllele;

      if ((current.allele1 === '_' || current.allele2 === '_') && !hasAlleleAlready) {
        const before = `${current.allele1}${current.allele2}`;
        const filled = normalizePairWithSpec(
          locusDef,
          current.allele1 === '_' ? passedAllele : current.allele1,
          current.allele2 === '_' ? passedAllele : current.allele2
        );
        current.allele1 = filled.allele1;
        current.allele2 = filled.allele2;
        notes.push({
          locus: locusDef.locus,
          before,
          after: `${current.allele1}${current.allele2}`,
          reason: `${parentLabel} (${parent.name}) is homozygous ${passedAllele}${passedAllele} and must pass '${passedAllele}'.`,
        });
      } else if (
        current.allele1 !== '_' &&
        current.allele2 !== '_' &&
        !hasAlleleAlready
      ) {
        conflicts.push(
          `${locusDef.name} (${locusDef.locus}): ${parentLabel} ${parent.name} is ${passedAllele}${passedAllele}, which conflicts with ${subject.name}'s recorded ${current.allele1}${current.allele2}.`
        );
      }
    }

    // 2. Offspring-to-Subject Inference: ANY homozygous non-top-dominant offspring (k/k, including intermediates like `atat` or `chdchd`)
    // proves BOTH parents carry at least one copy of `k`.
    const topDominant = locusDef.alleles[0];
    for (const kit of offspring) {
      const kLocus = getAnimalPairsForSpecies(kit, effectiveSpecies).find(
        (x) => x.locus === locusDef.locus
      );
      if (!kLocus) continue;

      if (
        kLocus.allele1 !== '_' &&
        kLocus.allele1 === kLocus.allele2 &&
        kLocus.allele1 !== topDominant
      ) {
        const homAllele = kLocus.allele1;
        const subjectHasAllele = current.allele1 === homAllele || current.allele2 === homAllele;

        if ((current.allele1 === '_' || current.allele2 === '_') && !subjectHasAllele) {
          const before = `${current.allele1}${current.allele2}`;
          const filled = normalizePairWithSpec(
            locusDef,
            current.allele1 === '_' ? homAllele : current.allele1,
            current.allele2 === '_' ? homAllele : current.allele2
          );
          current.allele1 = filled.allele1;
          current.allele2 = filled.allele2;
          notes.push({
            locus: locusDef.locus,
            before,
            after: `${current.allele1}${current.allele2}`,
            reason: `Offspring ${kit.name} expresses ${homAllele}${homAllele}, proving ${subject.name} carries '${homAllele}'.`,
          });
        } else if (
          current.allele1 !== '_' &&
          current.allele2 !== '_' &&
          !subjectHasAllele
        ) {
          conflicts.push(
            `${locusDef.name} (${locusDef.locus}): Offspring ${kit.name} is ${homAllele}${homAllele}, impossible if ${subject.name} is ${current.allele1}${current.allele2}.`
          );
        }
      }
    }
  }

  const updatedPairs = Array.from(byLocus.values());
  return {
    updatedPairs,
    formatted: formatGenotypeArray(updatedPairs),
    notes,
    conflicts,
  };
}

export type AlleleProvenanceSource = 'sire' | 'dam' | 'offspring' | 'manual' | 'unknown';

export interface AnnotatedAllele {
  allele: string;
  source: AlleleProvenanceSource;
  detail: string;
  isInferredUncommitted?: boolean;
}

export interface AnnotatedLocusPair {
  locus: string;
  locusName: string;
  allele1: AnnotatedAllele;
  allele2: AnnotatedAllele;
}

export interface AnimalAlleleProvenanceResult {
  speciesName: string;
  isCustomSpeciesFallback: boolean;
  rawFallback: string;
  loci: AnnotatedLocusPair[];
  counts: Record<AlleleProvenanceSource, number>;
  hasAnyProvenance: boolean;
}

function parentHasAllele(pair: GenotypeAllelePair | undefined, allele: string): boolean {
  if (!pair || !allele || allele === '_') return false;
  return pair.allele1 === allele || pair.allele2 === allele;
}

function parentIsHomozygousFor(pair: GenotypeAllelePair | undefined, allele: string): boolean {
  if (!pair || !allele || allele === '_') return false;
  return pair.allele1 === allele && pair.allele2 === allele;
}

function parentCanSupplyAllele(pair: GenotypeAllelePair | undefined, allele: string): boolean {
  if (!pair || !allele || allele === '_') return false;
  return (
    pair.allele1 === allele ||
    pair.allele2 === allele ||
    pair.allele1 === '_' ||
    pair.allele2 === '_'
  );
}

function parentFullyKnownWithout(pair: GenotypeAllelePair | undefined, allele: string): boolean {
  if (!pair || !allele || allele === '_') return false;
  return (
    pair.allele1 !== '_' &&
    pair.allele2 !== '_' &&
    pair.allele1 !== allele &&
    pair.allele2 !== allele
  );
}

/**
 * Classifies per-allele provenance (`sire`, `dam`, `offspring`, `manual`, or `unknown`)
 * across all recorded (and optionally uncommitted inferred) coat-color loci for an animal.
 * Strictly species-scoped with zero DOM dependencies.
 */
export function analyzeAlleleProvenance(
  subject: Animal,
  herdById: Map<string, Animal>,
  allSpeciesAnimals: Animal[],
  speciesName?: string,
  options?: { includeInferred?: boolean }
): AnimalAlleleProvenanceResult {
  const effectiveSpecies = speciesName || subject.species || 'Rabbit';
  const spec = getGeneticsSpecForSpecies(effectiveSpecies);
  const emptyCounts: Record<AlleleProvenanceSource, number> = {
    sire: 0,
    dam: 0,
    offspring: 0,
    manual: 0,
    unknown: 0,
  };

  if (!spec) {
    return {
      speciesName: effectiveSpecies,
      isCustomSpeciesFallback: true,
      rawFallback: (subject.genotypeRaw || '').trim(),
      loci: [],
      counts: emptyCounts,
      hasAnyProvenance: false,
    };
  }

  const savedPairs = getAnimalPairsForSpecies(subject, effectiveSpecies);
  const savedByLocus = new Map<string, GenotypeAllelePair>();
  for (const p of savedPairs) {
    savedByLocus.set(p.locus, p);
  }

  const workingPairs = options?.includeInferred
    ? inferHiddenAlleles(subject, herdById, allSpeciesAnimals, effectiveSpecies).updatedPairs
    : savedPairs;

  if (workingPairs.length === 0) {
    return {
      speciesName: spec.displayName,
      isCustomSpeciesFallback: false,
      rawFallback: (subject.genotypeRaw || '').trim(),
      loci: [],
      counts: emptyCounts,
      hasAnyProvenance: false,
    };
  }

  const sire = subject.sireId ? herdById.get(subject.sireId) : undefined;
  const dam = subject.damId ? herdById.get(subject.damId) : undefined;
  const sireByLocus = new Map<string, GenotypeAllelePair>();
  const damByLocus = new Map<string, GenotypeAllelePair>();

  if (sire) {
    for (const p of getAnimalPairsForSpecies(sire, effectiveSpecies)) {
      sireByLocus.set(p.locus, p);
    }
  }
  if (dam) {
    for (const p of getAnimalPairsForSpecies(dam, effectiveSpecies)) {
      damByLocus.set(p.locus, p);
    }
  }

  const offspring = allSpeciesAnimals.filter(
    (a) => a.id !== subject.id && (a.sireId === subject.id || a.damId === subject.id)
  );
  const offspringPairsList = offspring.map((kid) => ({
    kid,
    byLocus: new Map(
      getAnimalPairsForSpecies(kid, effectiveSpecies).map((p) => [p.locus, p] as const)
    ),
  }));

  const loci: AnnotatedLocusPair[] = [];
  const counts: Record<AlleleProvenanceSource, number> = { ...emptyCounts };

  for (const rawPair of workingPairs) {
    const locusDef = spec.loci.find((l) => l.locus === rawPair.locus);
    const norm = normalizePairWithSpec(locusDef, rawPair.allele1, rawPair.allele2);
    const a1 = norm.allele1;
    const a2 = norm.allele2;

    const savedPair = savedByLocus.get(rawPair.locus);
    const savedNorm = savedPair
      ? normalizePairWithSpec(locusDef, savedPair.allele1, savedPair.allele2)
      : null;

    let uncommitted1 = false;
    let uncommitted2 = false;
    if (options?.includeInferred && savedNorm) {
      const savedSlots = [savedNorm.allele1, savedNorm.allele2].filter((x) => x !== '_');
      const consumeSaved = (al: string): boolean => {
        if (al === '_') return false;
        const idx = savedSlots.indexOf(al);
        if (idx !== -1) {
          savedSlots.splice(idx, 1);
          return false;
        }
        return true;
      };
      uncommitted1 = consumeSaved(a1);
      uncommitted2 = consumeSaved(a2);
    }

    const sireLocus = sireByLocus.get(rawPair.locus);
    const damLocus = damByLocus.get(rawPair.locus);

    let ann1: AnnotatedAllele =
      a1 === '_'
        ? { allele: '_', source: 'unknown', detail: 'Unverified allele slot (_)' }
        : { allele: a1, source: 'manual', detail: 'Manually recorded allele' };
    let ann2: AnnotatedAllele =
      a2 === '_'
        ? { allele: '_', source: 'unknown', detail: 'Unverified allele slot (_)' }
        : { allele: a2, source: 'manual', detail: 'Manually recorded allele' };

    if (locusDef?.inheritanceMode === 'x_linked') {
      if (subject.sex === 'Male' || a2 === 'Y') {
        if (a2 === 'Y') {
          ann2 = {
            allele: 'Y',
            source: 'sire',
            detail: sire
              ? `Y chromosome inherited from Sire (${sire.name})`
              : 'Y chromosome (inherited from Sire)',
          };
        }
        if (a1 !== '_') {
          if (dam && parentHasAllele(damLocus, a1)) {
            ann1 = {
              allele: a1,
              source: 'dam',
              detail: `X-linked '${a1}' inherited from Dam (${dam.name})`,
            };
          } else {
            ann1 = {
              allele: a1,
              source: 'manual',
              detail: 'Manually recorded X-linked allele',
            };
          }
        }
      } else {
        // Female XX (or unknown sex) X-linked locus
        const sonProofByAllele = new Map<string, string>();
        for (const { kid, byLocus } of offspringPairsList) {
          if (kid.sex !== 'Male') continue;
          const kLocus = byLocus.get(rawPair.locus);
          if (kLocus && kLocus.allele1 !== '_' && !sonProofByAllele.has(kLocus.allele1)) {
            sonProofByAllele.set(kLocus.allele1, kid.name);
          }
        }

        const sireX = sire && sireLocus && sireLocus.allele1 !== '_' ? sireLocus.allele1 : null;
        let sireAssignedIdx: 1 | 2 | null = null;
        if (sireX) {
          if (a1 === sireX) {
            ann1 = {
              allele: a1,
              source: 'sire',
              detail: `X-linked '${sireX}' inherited from Sire (${sire!.name})`,
            };
            sireAssignedIdx = 1;
          } else if (a2 === sireX) {
            ann2 = {
              allele: a2,
              source: 'sire',
              detail: `X-linked '${sireX}' inherited from Sire (${sire!.name})`,
            };
            sireAssignedIdx = 2;
          }
        }

        const resolveFemaleOther = (al: string, isUncommitted: boolean): AnnotatedAllele => {
          if (al === '_') {
            return { allele: '_', source: 'unknown', detail: 'Unverified allele slot (_)' };
          }
          if (dam && parentHasAllele(damLocus, al)) {
            return {
              allele: al,
              source: 'dam',
              detail: `X-linked '${al}' inherited from Dam (${dam.name})`,
            };
          }
          const sonName = sonProofByAllele.get(al);
          if (sonName && (a1 !== a2 || isUncommitted)) {
            return {
              allele: al,
              source: 'offspring',
              detail: `Inferred from son ${sonName} (${al}Y)`,
            };
          }
          return { allele: al, source: 'manual', detail: 'Manually recorded X-linked allele' };
        };

        if (sireAssignedIdx === 1) {
          ann2 = resolveFemaleOther(a2, uncommitted2);
        } else if (sireAssignedIdx === 2) {
          ann1 = resolveFemaleOther(a1, uncommitted1);
        } else {
          // Neither matched a recorded Sire X; check homozygous Dam or son proof
          if (dam && a1 !== '_' && parentIsHomozygousFor(damLocus, a1)) {
            ann1 = {
              allele: a1,
              source: 'dam',
              detail: `Dam (${dam.name}) is homozygous ${a1}${a1} and passes '${a1}'`,
            };
            if (a2 !== '_') {
              const sonName = sonProofByAllele.get(a2);
              if (sonName && (a1 !== a2 || uncommitted2)) {
                ann2 = {
                  allele: a2,
                  source: 'offspring',
                  detail: `Inferred from son ${sonName} (${a2}Y)`,
                };
              }
            }
          } else if (dam && a2 !== '_' && parentIsHomozygousFor(damLocus, a2)) {
            ann2 = {
              allele: a2,
              source: 'dam',
              detail: `Dam (${dam.name}) is homozygous ${a2}${a2} and passes '${a2}'`,
            };
            if (a1 !== '_') {
              const sonName = sonProofByAllele.get(a1);
              if (sonName && (a1 !== a2 || uncommitted1)) {
                ann1 = {
                  allele: a1,
                  source: 'offspring',
                  detail: `Inferred from son ${sonName} (${a1}Y)`,
                };
              }
            }
          } else {
            if (a1 !== '_' && sonProofByAllele.has(a1) && (a1 !== a2 || uncommitted1)) {
              ann1 = {
                allele: a1,
                source: 'offspring',
                detail: `Inferred from son ${sonProofByAllele.get(a1)} (${a1}Y)`,
              };
            }
            if (a2 !== '_' && sonProofByAllele.has(a2) && (a1 !== a2 || uncommitted2)) {
              ann2 = {
                allele: a2,
                source: 'offspring',
                detail: `Inferred from son ${sonProofByAllele.get(a2)} (${a2}Y)`,
              };
            }
          }
        }
      }
    } else {
      // Autosomal locus provenance
      const topDominant = locusDef?.alleles[0];
      const offspringProofByAllele = new Map<string, string>();
      for (const { kid, byLocus } of offspringPairsList) {
        const kLocus = byLocus.get(rawPair.locus);
        if (
          kLocus &&
          kLocus.allele1 !== '_' &&
          kLocus.allele1 === kLocus.allele2 &&
          kLocus.allele1 !== topDominant &&
          !offspringProofByAllele.has(kLocus.allele1)
        ) {
          offspringProofByAllele.set(kLocus.allele1, kid.name);
        }
      }

      if (a1 !== '_' && a2 === '_') {
        const sireGuar = Boolean(sire && parentIsHomozygousFor(sireLocus, a1));
        const damGuar = Boolean(dam && parentIsHomozygousFor(damLocus, a1));

        if (sireGuar && !damGuar) {
          ann1 = {
            allele: a1,
            source: 'sire',
            detail: `Inherited from homozygous Sire (${sire!.name}, ${a1}${a1})`,
          };
        } else if (damGuar && !sireGuar) {
          ann1 = {
            allele: a1,
            source: 'dam',
            detail: `Inherited from homozygous Dam (${dam!.name}, ${a1}${a1})`,
          };
        } else if (sireGuar && damGuar) {
          ann1 = {
            allele: a1,
            source: 'sire',
            detail: `Inherited from homozygous Sire (${sire!.name}) & Dam (${dam!.name})`,
          };
        } else if (
          sire &&
          dam &&
          parentHasAllele(sireLocus, a1) &&
          parentFullyKnownWithout(damLocus, a1)
        ) {
          ann1 = {
            allele: a1,
            source: 'sire',
            detail: `Inherited from Sire (${sire.name}); Dam (${dam.name}) does not carry '${a1}'`,
          };
        } else if (
          sire &&
          dam &&
          parentHasAllele(damLocus, a1) &&
          parentFullyKnownWithout(sireLocus, a1)
        ) {
          ann1 = {
            allele: a1,
            source: 'dam',
            detail: `Inherited from Dam (${dam.name}); Sire (${sire.name}) does not carry '${a1}'`,
          };
        } else if (offspringProofByAllele.has(a1)) {
          ann1 = {
            allele: a1,
            source: 'offspring',
            detail: `Proven by offspring ${offspringProofByAllele.get(a1)} (${a1}${a1})`,
          };
        }
      } else if (a1 !== '_' && a2 !== '_') {
        if (a1 === a2) {
          // Homozygous pair: one allele came from Sire and one from Dam
          const sireMatch = Boolean(sire && parentHasAllele(sireLocus, a1));
          const damMatch = Boolean(dam && parentHasAllele(damLocus, a2));
          if (sireMatch && damMatch) {
            ann1 = {
              allele: a1,
              source: 'sire',
              detail: `Inherited from Sire (${sire!.name})`,
            };
            ann2 = {
              allele: a2,
              source: 'dam',
              detail: `Inherited from Dam (${dam!.name})`,
            };
          } else if (sireMatch) {
            ann1 = {
              allele: a1,
              source: 'sire',
              detail: `Inherited from Sire (${sire!.name})`,
            };
            if (uncommitted2 && offspringProofByAllele.has(a2)) {
              ann2 = {
                allele: a2,
                source: 'offspring',
                detail: `Inferred from offspring ${offspringProofByAllele.get(a2)} (${a2}${a2})`,
              };
            }
          } else if (damMatch) {
            ann1 = {
              allele: a1,
              source: 'dam',
              detail: `Inherited from Dam (${dam!.name})`,
            };
            if (uncommitted2 && offspringProofByAllele.has(a2)) {
              ann2 = {
                allele: a2,
                source: 'offspring',
                detail: `Inferred from offspring ${offspringProofByAllele.get(a2)} (${a2}${a2})`,
              };
            }
          } else if (uncommitted2 && offspringProofByAllele.has(a2)) {
            ann2 = {
              allele: a2,
              source: 'offspring',
              detail: `Inferred from offspring ${offspringProofByAllele.get(a2)} (${a2}${a2})`,
            };
          }
        } else {
          // Heterozygous pair (a1 !== a2)
          let assigned1 = false;
          let assigned2 = false;

          if (sire && sireLocus && dam && damLocus) {
            const validS1D2 =
              parentCanSupplyAllele(sireLocus, a1) && parentCanSupplyAllele(damLocus, a2);
            const validD1S2 =
              parentCanSupplyAllele(damLocus, a1) && parentCanSupplyAllele(sireLocus, a2);

            if (validS1D2 && !validD1S2) {
              if (parentHasAllele(sireLocus, a1) || parentFullyKnownWithout(damLocus, a1)) {
                ann1 = {
                  allele: a1,
                  source: 'sire',
                  detail: `Inherited from Sire (${sire.name})`,
                };
                assigned1 = true;
              }
              if (parentHasAllele(damLocus, a2) || parentFullyKnownWithout(sireLocus, a2)) {
                ann2 = {
                  allele: a2,
                  source: 'dam',
                  detail: `Inherited from Dam (${dam.name})`,
                };
                assigned2 = true;
              }
            } else if (validD1S2 && !validS1D2) {
              if (parentHasAllele(damLocus, a1) || parentFullyKnownWithout(sireLocus, a1)) {
                ann1 = {
                  allele: a1,
                  source: 'dam',
                  detail: `Inherited from Dam (${dam.name})`,
                };
                assigned1 = true;
              }
              if (parentHasAllele(sireLocus, a2) || parentFullyKnownWithout(damLocus, a2)) {
                ann2 = {
                  allele: a2,
                  source: 'sire',
                  detail: `Inherited from Sire (${sire.name})`,
                };
                assigned2 = true;
              }
            }
          } else if (sire && sireLocus) {
            if (
              parentIsHomozygousFor(sireLocus, a1) ||
              (parentHasAllele(sireLocus, a1) && parentFullyKnownWithout(sireLocus, a2))
            ) {
              ann1 = {
                allele: a1,
                source: 'sire',
                detail: `Inherited from Sire (${sire.name})`,
              };
              assigned1 = true;
            } else if (
              parentIsHomozygousFor(sireLocus, a2) ||
              (parentHasAllele(sireLocus, a2) && parentFullyKnownWithout(sireLocus, a1))
            ) {
              ann2 = {
                allele: a2,
                source: 'sire',
                detail: `Inherited from Sire (${sire.name})`,
              };
              assigned2 = true;
            }
          } else if (dam && damLocus) {
            if (
              parentIsHomozygousFor(damLocus, a1) ||
              (parentHasAllele(damLocus, a1) && parentFullyKnownWithout(damLocus, a2))
            ) {
              ann1 = {
                allele: a1,
                source: 'dam',
                detail: `Inherited from Dam (${dam.name})`,
              };
              assigned1 = true;
            } else if (
              parentIsHomozygousFor(damLocus, a2) ||
              (parentHasAllele(damLocus, a2) && parentFullyKnownWithout(damLocus, a1))
            ) {
              ann2 = {
                allele: a2,
                source: 'dam',
                detail: `Inherited from Dam (${dam.name})`,
              };
              assigned2 = true;
            }
          }

          if (!assigned1 && offspringProofByAllele.has(a1)) {
            ann1 = {
              allele: a1,
              source: 'offspring',
              detail: `Inferred from offspring ${offspringProofByAllele.get(a1)} (${a1}${a1})`,
            };
          }
          if (!assigned2 && offspringProofByAllele.has(a2)) {
            ann2 = {
              allele: a2,
              source: 'offspring',
              detail: `Inferred from offspring ${offspringProofByAllele.get(a2)} (${a2}${a2})`,
            };
          }
        }
      }
    }

    if (uncommitted1) ann1.isInferredUncommitted = true;
    if (uncommitted2) ann2.isInferredUncommitted = true;

    counts[ann1.source] += 1;
    counts[ann2.source] += 1;

    loci.push({
      locus: rawPair.locus,
      locusName: locusDef?.name ?? `Locus ${rawPair.locus}`,
      allele1: ann1,
      allele2: ann2,
    });
  }

  const hasAnyProvenance =
    counts.sire > 0 || counts.dam > 0 || counts.offspring > 0;

  return {
    speciesName: spec.displayName,
    isCustomSpeciesFallback: false,
    rawFallback: formatGenotypeArray(workingPairs),
    loci,
    counts,
    hasAnyProvenance,
  };
}

export interface LocusOutcomeEntry {
  genotype: string;
  probabilityPercent: number;
  hasUnknownCarrier: boolean;
  displayLabel?: string;
}

export interface LocusPunnettOutcome {
  locus: string;
  locusName: string;
  inheritanceMode?: InheritanceMode;
  sirePair: string;
  damPair: string;
  outcomes: LocusOutcomeEntry[];
  sexSplitOutcomes?: {
    male: LocusOutcomeEntry[];
    female: LocusOutcomeEntry[];
  };
  uncertaintyNote?: string;
}

export interface PredictedPhenotypeRow {
  label: string;
  genotypeSummary: string;
  probabilityPercent: number;
  hasUnknownCarrier?: boolean;
  sexGroup?: 'Male' | 'Female';
}

export interface PunnettSimulationSummary {
  speciesName: string;
  isCustomSpeciesFallback: boolean;
  sireRaw?: string;
  damRaw?: string;
  locusBreakdowns: LocusPunnettOutcome[];
  predictedPhenotypes: PredictedPhenotypeRow[];
  hasUnknownAlleles: boolean;
  uncertainLociNotes: string[];
  lethalOrHealthAlerts: BreedingGeneticAlert[];
}

function formatOutcomeDisplay(locusDef: LocusDefinition | undefined, genotype: string): string {
  if (!genotype.includes('_')) return genotype;
  if (genotype === '__') return 'Unverified (unknown at both slots)';
  const a1 = genotype.replace(/_/g, '');
  if (!locusDef) return `${genotype} (unverified carrier slot)`;
  const otherPossibilities = locusDef.alleles.filter((a) => a !== a1).slice(0, 3).join('/');
  return `${genotype} (known ${a1}; could be ${otherPossibilities || 'recessive'} carrier)`;
}

function orderPairString(locusDef: LocusDefinition | undefined, a1: string, a2: string): string {
  const norm = normalizePairWithSpec(locusDef, a1, a2);
  return `${norm.allele1}${norm.allele2}`;
}

/**
 * Simulates a Sire × Dam test-breeding across shared coat-color loci for the active species.
 * - Custom species (`getGeneticsSpecForSpecies(sp) === null`) isolate safely to raw side-by-side notes.
 * - Unknown `_` slots never fabricate homozygous blank `__` certainty in UI summaries.
 * - X-linked loci (`Cat O/o`) compute sex-stratified Male (`XY`) vs Female (`XX`) probabilities.
 */
export function simulatePairingGenetics(
  sire: Animal,
  dam: Animal,
  speciesName?: string
): PunnettSimulationSummary {
  const effectiveSpecies = speciesName || sire.species || dam.species || 'Rabbit';
  const spec = getGeneticsSpecForSpecies(effectiveSpecies);

  if (!spec) {
    return {
      speciesName: effectiveSpecies,
      isCustomSpeciesFallback: true,
      sireRaw: sire.genotypeRaw || '',
      damRaw: dam.genotypeRaw || '',
      locusBreakdowns: [],
      predictedPhenotypes: [],
      hasUnknownAlleles: false,
      uncertainLociNotes: [],
      lethalOrHealthAlerts: [],
    };
  }

  const sirePairs = getAnimalPairsForSpecies(sire, effectiveSpecies);
  const damPairs = getAnimalPairsForSpecies(dam, effectiveSpecies);

  const sireMap = new Map(sirePairs.map((p) => [p.locus, p]));
  const damMap = new Map(damPairs.map((p) => [p.locus, p]));

  const allLoci = Array.from(new Set([...sireMap.keys(), ...damMap.keys()]));
  const locusBreakdowns: LocusPunnettOutcome[] = [];
  const uncertainLociNotes: string[] = [];
  let hasUnknownAlleles = false;

  for (const locus of allLoci) {
    const s = sireMap.get(locus);
    const d = damMap.get(locus);
    const locusDef = spec.loci.find((l) => l.locus === locus);
    if (!s || !d) {
      if (sirePairs.length > 0 && damPairs.length > 0) {
        hasUnknownAlleles = true;
        uncertainLociNotes.push(
          `${locusDef?.name ?? `Locus ${locus}`} (${locus}): Recorded on ${s ? sire.name : dam.name} only — enter ${locus} on ${s ? dam.name : sire.name} to simulate this locus.`
        );
      }
      continue;
    }

    if (locusDef?.inheritanceMode === 'x_linked') {
      const sX = s.allele1 || '_';
      const dGametes = [d.allele1 || '_', d.allele2 || '_'];
      if (sX === '_' || dGametes.includes('_')) {
        hasUnknownAlleles = true;
        uncertainLociNotes.push(
          `${locusDef.name} (${locus}): Unverified X-linked slot ('_') leaves sex-linked percentages tentative.`
        );
      }

      const maleTally = new Map<string, number>();
      const femaleTally = new Map<string, number>();

      for (const dg of dGametes) {
        const mGeno = `${dg}Y`;
        maleTally.set(mGeno, (maleTally.get(mGeno) ?? 0) + 50);

        const fGeno = orderPairString(locusDef, sX, dg);
        femaleTally.set(fGeno, (femaleTally.get(fGeno) ?? 0) + 50);
      }

      const toOutcomeList = (tally: Map<string, number>, scaleOverall: number): LocusOutcomeEntry[] =>
        Array.from(tally.entries())
          .map(([genotype, pct]) => ({
            genotype,
            probabilityPercent: Math.round(pct * scaleOverall * 10) / 10,
            hasUnknownCarrier: genotype.includes('_'),
            displayLabel: genotype.includes('_') ? formatOutcomeDisplay(locusDef, genotype) : undefined,
          }))
          .sort((a, b) => b.probabilityPercent - a.probabilityPercent);

      const maleOutcomes = toOutcomeList(maleTally, 1);
      const femaleOutcomes = toOutcomeList(femaleTally, 1);

      const overallMap = new Map<string, number>();
      for (const m of maleOutcomes) {
        overallMap.set(m.genotype, (overallMap.get(m.genotype) ?? 0) + m.probabilityPercent * 0.5);
      }
      for (const f of femaleOutcomes) {
        overallMap.set(f.genotype, (overallMap.get(f.genotype) ?? 0) + f.probabilityPercent * 0.5);
      }
      const combinedOutcomes = toOutcomeList(overallMap, 1);

      locusBreakdowns.push({
        locus,
        locusName: locusDef.name,
        inheritanceMode: 'x_linked',
        sirePair: `${sX}Y`,
        damPair: `${d.allele1 || '_'}${d.allele2 || '_'}`,
        outcomes: combinedOutcomes,
        sexSplitOutcomes: {
          male: maleOutcomes,
          female: femaleOutcomes,
        },
        uncertaintyNote:
          sX === '_' || dGametes.includes('_')
            ? 'Contains unverified allele slot (_); split male/female odds are provisional.'
            : undefined,
      });
      continue;
    }

    const sGametes = [s.allele1 || '_', s.allele2 || '_'];
    const dGametes = [d.allele1 || '_', d.allele2 || '_'];
    const hasBlank = sGametes.includes('_') || dGametes.includes('_');
    if (hasBlank) {
      hasUnknownAlleles = true;
      uncertainLociNotes.push(
        `${locusDef?.name ?? `Locus ${locus}`} (${locus}): Contains unverified allele slot ('_') — carrier outcomes cannot confirm homozygosity.`
      );
    }

    const tally = new Map<string, number>();
    for (const sg of sGametes) {
      for (const dg of dGametes) {
        const combo = orderPairString(locusDef, sg, dg);
        tally.set(combo, (tally.get(combo) ?? 0) + 25);
      }
    }

    const outcomes: LocusOutcomeEntry[] = Array.from(tally.entries())
      .map(([genotype, probabilityPercent]) => ({
        genotype,
        probabilityPercent,
        hasUnknownCarrier: genotype.includes('_'),
        displayLabel: genotype.includes('_')
          ? formatOutcomeDisplay(locusDef, genotype)
          : undefined,
      }))
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent);

    locusBreakdowns.push({
      locus,
      locusName: locusDef?.name ?? `Locus ${locus}`,
      inheritanceMode: locusDef?.inheritanceMode ?? 'autosomal',
      sirePair: orderPairString(locusDef, s.allele1, s.allele2),
      damPair: orderPairString(locusDef, d.allele1, d.allele2),
      outcomes,
      uncertaintyNote: hasBlank
        ? 'Unverified slot (_) included: dashed outcomes indicate unconfirmed second-allele possibilities.'
        : undefined,
    });
  }

  const breakdownsByLocus = new Map(locusBreakdowns.map((b) => [b.locus, b]));
  const lethalOrHealthAlerts = spec.evaluatePairingAlerts
    ? spec.evaluatePairingAlerts(breakdownsByLocus, sire, dam)
    : [];

  // Compute combined top phenotype predictions across core phenotype loci
  const coreLoci = spec.corePhenotypeLoci;
  const activeBreakdowns = locusBreakdowns.filter((b) => coreLoci.includes(b.locus));

  if (activeBreakdowns.length === 0) {
    return {
      speciesName: spec.displayName,
      isCustomSpeciesFallback: false,
      locusBreakdowns,
      predictedPhenotypes: [],
      hasUnknownAlleles,
      uncertainLociNotes,
      lethalOrHealthAlerts,
    };
  }

  const hasXLinkedActive = activeBreakdowns.some((b) => b.inheritanceMode === 'x_linked');

  type ComboAcc = { map: Record<string, string>; prob: number; hasUncertain: boolean };

  const computePhenotypesForSex = (targetSex?: BiologicalSex): PredictedPhenotypeRow[] => {
    let combinations: ComboAcc[] = [{ map: {}, prob: 1, hasUncertain: false }];

    for (const b of activeBreakdowns) {
      const outcomesForRun =
        b.inheritanceMode === 'x_linked' && b.sexSplitOutcomes
          ? targetSex === 'Male'
            ? b.sexSplitOutcomes.male
            : targetSex === 'Female'
            ? b.sexSplitOutcomes.female
            : b.outcomes
          : b.outcomes;

      const next: ComboAcc[] = [];
      for (const existing of combinations) {
        for (const out of outcomesForRun) {
          next.push({
            map: { ...existing.map, [b.locus]: out.genotype },
            prob: existing.prob * (out.probabilityPercent / 100),
            hasUncertain: existing.hasUncertain || out.hasUnknownCarrier,
          });
        }
      }
      combinations = next;
    }

    const phenotypeMap = new Map<
      string,
      { prob: number; sampleGenotype: string; hasUnknownCarrier: boolean }
    >();

    for (const c of combinations) {
      const label = spec.classifyPhenotype(c.map, targetSex);
      const genoStr = coreLoci
        .filter((l) => c.map[l])
        .map((l) => c.map[l])
        .join(' ');
      const prev = phenotypeMap.get(label);
      if (prev) {
        prev.prob += c.prob;
        prev.hasUnknownCarrier = prev.hasUnknownCarrier || c.hasUncertain;
      } else {
        phenotypeMap.set(label, {
          prob: c.prob,
          sampleGenotype: genoStr,
          hasUnknownCarrier: c.hasUncertain,
        });
      }
    }

    const scale = hasXLinkedActive && targetSex ? 0.5 : 1;
    return Array.from(phenotypeMap.entries()).map(([label, info]) => ({
      label,
      genotypeSummary: info.sampleGenotype,
      probabilityPercent: Math.round(info.prob * scale * 1000) / 10,
      hasUnknownCarrier: info.hasUnknownCarrier,
      sexGroup: targetSex === 'Male' || targetSex === 'Female' ? targetSex : undefined,
    }));
  };

  let predictedPhenotypes: PredictedPhenotypeRow[] = [];
  if (hasXLinkedActive) {
    predictedPhenotypes = [
      ...computePhenotypesForSex('Female'),
      ...computePhenotypesForSex('Male'),
    ]
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent)
      .slice(0, 8);
  } else {
    predictedPhenotypes = computePhenotypesForSex(undefined)
      .sort((a, b) => b.probabilityPercent - a.probabilityPercent)
      .slice(0, 6);
  }

  return {
    speciesName: spec.displayName,
    isCustomSpeciesFallback: false,
    locusBreakdowns,
    predictedPhenotypes,
    hasUnknownAlleles,
    uncertainLociNotes,
    lethalOrHealthAlerts,
  };
}

export interface SingleGenotypeCarrierNote {
  locus: string;
  locusName: string;
  allele: string;
  pair: string;
  description: string;
}

export interface SingleGenotypeEvaluation {
  speciesName: string;
  isCustomSpeciesFallback: boolean;
  rawInput: string;
  normalizedGenotype: string;
  pairs: GenotypeAllelePair[];
  predictedVariety: string;
  hasInsufficientLoci: boolean;
  hasUnknownAlleles: boolean;
  unverifiedCoreLoci: string[];
  recessiveCarriers: SingleGenotypeCarrierNote[];
  healthAlerts: BreedingGeneticAlert[];
}

function evaluateSingleAnimalHealthAlerts(
  spec: SpeciesGeneticsSpec,
  lociMap: Record<string, string>
): BreedingGeneticAlert[] {
  const alerts: BreedingGeneticAlert[] = [];
  if (spec.speciesKey === 'rabbit') {
    if (lociMap['En'] === 'EnEn') {
      alerts.push({
        severity: 'danger',
        locus: 'En',
        title: 'Homozygous Charlie (EnEn) — Megacolon Risk',
        detail:
          'EnEn Charlie rabbits are predisposed to megacolon digestive syndrome; crossing EnEn × enen produces 100% Broken (Enen) offspring.',
      });
    }
    if (lociMap['E'] === 'ee' && (!lociMap['W'] || lociMap['W'].includes('_'))) {
      alerts.push({
        severity: 'info',
        locus: 'W',
        title: 'Wide-Band (W/w) Unverified',
        detail:
          'Leaving Wide-Band as __ or W_ does not assume ww; verify ww via pedigree or test breeding.',
      });
    }
  } else if (spec.speciesKey === 'cat') {
    const w = lociMap['W'] || '';
    if (w.startsWith('W') && !w.startsWith('Ws')) {
      alerts.push({
        severity: 'warning',
        locus: 'W',
        title: 'Dominant White (W) Sensory Screening Note',
        detail:
          'Dominant White cats (especially blue-eyed) carry elevated congenital deafness screening needs (BAER testing recommended).',
      });
    }
  } else if (spec.speciesKey === 'dog') {
    if (lociMap['M'] === 'MM') {
      alerts.push({
        severity: 'danger',
        locus: 'M',
        title: 'Homozygous Double Merle (MM) — Deafness / Eye Risk',
        detail:
          'MM Double Merle dogs carry high risk of congenital deafness and microphthalmia / ocular defects.',
      });
    }
  } else if (spec.speciesKey === 'guinea_pig') {
    if (lociMap['Rn'] === 'RnRn') {
      alerts.push({
        severity: 'danger',
        locus: 'Rn',
        title: 'Homozygous Lethal White (RnRn)',
        detail:
          'RnRn Lethal White cavies suffer severe congenital eye, ear, and dental defects.',
      });
    }
  } else if (spec.speciesKey === 'chinchilla') {
    if (lociMap['Wh'] === 'WhWh') {
      alerts.push({
        severity: 'danger',
        locus: 'Wh',
        title: 'Homozygous Wilson White Lethal Factor (WhWh)',
        detail: 'WhWh is an embryonic lethal combination in chinchillas.',
      });
    }
    if (lociMap['TO'] === 'TOTO') {
      alerts.push({
        severity: 'danger',
        locus: 'TO',
        title: 'Homozygous Black Velvet / TOV Lethal Factor (TOTO)',
        detail: 'TOTO is an embryonic lethal combination in chinchillas.',
      });
    }
  } else if (spec.speciesKey === 'ferret') {
    const pa = lociMap['Pa'] || '';
    const bl = lociMap['Bl'] || '';
    if ((pa && !pa.includes('papa') && !pa.includes('__')) || (bl && !bl.includes('blbl') && !bl.includes('__'))) {
      alerts.push({
        severity: 'warning',
        title: 'Waardenburg Syndrome / Deafness Marker (Blaze / Panda)',
        detail:
          'Blaze (Bl) and Panda (Pa) white-pattern alleles correlate with elevated neural-crest Waardenburg deafness risk.',
      });
    }
  }
  return alerts;
}

/**
 * Evaluates a single hypothetical shorthand genotype string for the Coat Explorer Sandbox.
 * - Zero DOM dependencies and zero persistence side effects.
 * - Custom species (`getGeneticsSpecForSpecies(sp) === null`) isolate strictly to plain-text fallback.
 */
export function evaluateSingleGenotypeSandbox(
  rawGenotype: string,
  speciesName?: string,
  sex?: BiologicalSex
): SingleGenotypeEvaluation {
  const cleanRaw = (rawGenotype || '').trim();
  const spec = getGeneticsSpecForSpecies(speciesName);

  if (!spec) {
    return {
      speciesName: (speciesName || '').trim() || 'Custom Species',
      isCustomSpeciesFallback: true,
      rawInput: cleanRaw,
      normalizedGenotype: cleanRaw,
      pairs: [],
      predictedVariety: '',
      hasInsufficientLoci: false,
      hasUnknownAlleles: false,
      unverifiedCoreLoci: [],
      recessiveCarriers: [],
      healthAlerts: [],
    };
  }

  const parsedPairs = parseGenotypeString(cleanRaw, spec.displayName);
  const byLocus = new Map<string, GenotypeAllelePair>();
  for (const rawPair of parsedPairs) {
    const locusDef = spec.loci.find((l) => l.locus === rawPair.locus);
    const cleanA1 = rawPair.allele1 || '_';
    const cleanA2 =
      locusDef?.inheritanceMode === 'x_linked' && sex === 'Male'
        ? 'Y'
        : rawPair.allele2 || '_';
    const norm = normalizePairWithSpec(locusDef, cleanA1, cleanA2);
    byLocus.set(rawPair.locus, {
      locus: rawPair.locus,
      allele1: norm.allele1,
      allele2: norm.allele2,
    });
  }

  const normalizedPairs = Array.from(byLocus.values());
  const normalizedGenotype = formatGenotypeArray(normalizedPairs);

  const hasAnyKnownAllele = normalizedPairs.some((p) => {
    const locusDef = spec.loci.find((l) => l.locus === p.locus);
    const isXMale = locusDef?.inheritanceMode === 'x_linked' && sex === 'Male';
    return p.allele1 !== '_' || (!isXMale && p.allele2 !== '_' && p.allele2 !== 'Y');
  });

  if (!hasAnyKnownAllele) {
    return {
      speciesName: spec.displayName,
      isCustomSpeciesFallback: false,
      rawInput: cleanRaw,
      normalizedGenotype,
      pairs: normalizedPairs,
      predictedVariety: 'Insufficient Loci (Select alleles or load a variety preset)',
      hasInsufficientLoci: true,
      hasUnknownAlleles: true,
      unverifiedCoreLoci: [...spec.corePhenotypeLoci],
      recessiveCarriers: [],
      healthAlerts: [],
    };
  }

  const lociMap: Record<string, string> = {};
  for (const [locus, pair] of byLocus.entries()) {
    lociMap[locus] = `${pair.allele1}${pair.allele2}`;
  }

  const unverifiedCoreLoci: string[] = [];
  for (const coreLocus of spec.corePhenotypeLoci) {
    const locusDef = spec.loci.find((l) => l.locus === coreLocus);
    const pair = byLocus.get(coreLocus);
    const isXMale = locusDef?.inheritanceMode === 'x_linked' && sex === 'Male';
    if (!pair || pair.allele1 === '_' || (!isXMale && pair.allele2 === '_')) {
      unverifiedCoreLoci.push(coreLocus);
    }
  }

  const hasUnknownAnyPair = normalizedPairs.some((p) => {
    const locusDef = spec.loci.find((l) => l.locus === p.locus);
    const isXMale = locusDef?.inheritanceMode === 'x_linked' && sex === 'Male';
    return p.allele1 === '_' || (!isXMale && p.allele2 === '_');
  });

  const recessiveCarriers: SingleGenotypeCarrierNote[] = [];
  for (const locusDef of spec.loci) {
    const pair = byLocus.get(locusDef.locus);
    if (!pair) continue;
    if (locusDef.inheritanceMode === 'x_linked' && (sex === 'Male' || pair.allele2 === 'Y')) {
      continue;
    }
    if (
      pair.allele1 !== '_' &&
      pair.allele2 !== '_' &&
      pair.allele2 !== 'Y' &&
      pair.allele1 !== pair.allele2
    ) {
      recessiveCarriers.push({
        locus: locusDef.locus,
        locusName: locusDef.name,
        allele: pair.allele2,
        pair: `${pair.allele1}${pair.allele2}`,
        description: locusDef.description,
      });
    }
  }

  return {
    speciesName: spec.displayName,
    isCustomSpeciesFallback: false,
    rawInput: cleanRaw,
    normalizedGenotype,
    pairs: normalizedPairs,
    predictedVariety: spec.classifyPhenotype(lociMap, sex),
    hasInsufficientLoci: false,
    hasUnknownAlleles: unverifiedCoreLoci.length > 0 || hasUnknownAnyPair,
    unverifiedCoreLoci,
    recessiveCarriers,
    healthAlerts: evaluateSingleAnimalHealthAlerts(spec, lociMap),
  };
}

/**
 * Builds an ephemeral, non-persisted `Animal` shell for hypothetical What-If Punnett crosses
 * in the Breeding Lab Coat Explorer Sandbox without writing temporary records to storage.
 */
export function buildSandboxHypotheticalAnimal(params: {
  id: string;
  name: string;
  speciesName: string;
  sex: BiologicalSex;
  genotypeRaw: string;
}): Animal {
  const cleanRaw = (params.genotypeRaw || '').trim();
  return {
    id: params.id,
    tattoo: '',
    name: params.name,
    species: params.speciesName,
    breed: '',
    variety: '',
    sex: params.sex,
    status: 'Active',
    archived: false,
    needsAttention: false,
    birthDateIso: '',
    weightGrams: 0,
    genotype: parseGenotypeString(cleanRaw, params.speciesName),
    genotypeRaw: cleanRaw,
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: '',
    breederName: '',
    ownerName: '',
    sireId: '',
    damId: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

```

## `src/core/growthAnalytics.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Growth, Rate of Gain, Comparative Weight & Litter Survival Analytics Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) or framework dependencies.
 * Computes litter survival rates, seasonal maternal/sire milestone curves (3w/6w/8w),
 * multi-animal Rate of Gain (ADG) age-in-days series, and cohort/goal curve comparisons.
 */

import {
  Animal,
  BreedingRecord,
  CareLog,
  formatWeight,
  isSameSpecies,
  LitterWeightMilestone,
  normalizeLitterWeightMilestones,
  normalizeTargetWeightCurve,
  SpeciesProfile,
  TargetWeightPoint,
  todayDateIso,
  WeightUnit,
} from './models';

export interface SeasonBucket {
  seasonKey: string;
  seasonName: 'Winter' | 'Spring' | 'Summer' | 'Fall';
  year: number;
  sortOrder: number;
}

export interface ResolvedLitterMilestone {
  id: string;
  ageDays: number;
  dateIso?: string;
  label: string;
  liveCount?: number;
  totalWeightGrams: number;
  avgWeightGrams: number;
  source: 'litter_milestone' | 'offspring_logs';
  offspringSampleCount?: number;
}

export interface LitterSurvivalMetrics {
  breeding: BreedingRecord;
  birthDateIso: string;
  season: SeasonBucket | null;
  totalBorn: number;
  liveCount: number;
  stillbornCount: number;
  fosteredCount: number;
  rearingBase: number;
  weanedCount: number;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  milestones: ResolvedLitterMilestone[];
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
  avgWeanGrams: number | null;
  litterAdgGramsPerDay: number | null;
}

export interface ParentSurvivalPerformanceSummary {
  parentId: string;
  parentName: string;
  parentTattoo: string;
  role: 'dam' | 'sire';
  totalBreedings: number;
  settledBreedings: number;
  missedCount: number;
  conceptionRatePct: number | null;
  littersBornCount: number;
  littersWeanedCount: number;
  totalLiveBorn: number;
  totalStillborn: number;
  totalFostered: number;
  totalWeaned: number;
  avgLivePerLitter: number | null;
  avgWeanedPerLitter: number | null;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
  avgWeanGrams: number | null;
  meanLitterAdgGramsPerDay: number | null;
  litters: LitterSurvivalMetrics[];
}

export interface SeasonalSurvivalSummary {
  seasonKey: string;
  seasonName: SeasonBucket['seasonName'];
  year: number;
  sortOrder: number;
  littersBornCount: number;
  missedCount: number;
  totalLiveBorn: number;
  totalStillborn: number;
  totalFostered: number;
  totalWeaned: number;
  liveBirthRatePct: number | null;
  weaningSurvivalRatePct: number | null;
  avg3WeekGrams: number | null;
  avg6WeekGrams: number | null;
  avg8WeekGrams: number | null;
  avgWeanGrams: number | null;
}

export interface LitterSurvivalEvaluationResult {
  speciesName: string;
  litters: LitterSurvivalMetrics[];
  damSummaries: ParentSurvivalPerformanceSummary[];
  sireSummaries: ParentSurvivalPerformanceSummary[];
  seasonalSummaries: SeasonalSurvivalSummary[];
  overallSummary: {
    littersBornCount: number;
    missedCount: number;
    totalLiveBorn: number;
    totalStillborn: number;
    totalWeaned: number;
    liveBirthRatePct: number | null;
    weaningSurvivalRatePct: number | null;
    avg3WeekGrams: number | null;
    avg6WeekGrams: number | null;
    avg8WeekGrams: number | null;
  };
}

export interface AnimalGrowthPoint {
  ageDays: number;
  dateIso: string;
  weightGrams: number;
  segmentAdgGramsPerDay: number | null;
  label: string;
  source: 'care_log' | 'profile_weight';
}

export interface AnimalGrowthSeries {
  animal: Animal;
  hasBirthDate: boolean;
  points: AnimalGrowthPoint[];
  startAgeDays: number | null;
  startWeightGrams: number | null;
  latestAgeDays: number | null;
  latestWeightGrams: number | null;
  totalGainGrams: number | null;
  spanDays: number | null;
  overallAdgGramsPerDay: number | null;
  peakAdgGramsPerDay: number | null;
  targetDeltaGrams: number | null;
  targetDeltaPct: number | null;
}

export interface CohortBenchmarkPoint {
  ageDays: number;
  meanWeightGrams: number;
  minWeightGrams: number;
  maxWeightGrams: number;
  sampleCount: number;
}

export interface ComparativeGrowthChartModel {
  series: AnimalGrowthSeries[];
  targetCurve: TargetWeightPoint[];
  cohortCurve: CohortBenchmarkPoint[];
  minAgeDays: number;
  maxAgeDays: number;
  maxWeightGrams: number;
  maxAdgGramsPerDay: number;
  minAdgGramsPerDay: number;
}

export const GROWTH_CHART_COLORS: ReadonlyArray<string> = [
  '#2d5a3d', // Barn sage
  '#b85d3b', // Terracotta
  '#2e5c78', // Slate blue
  '#8c6239', // Warm chestnut
  '#6a4c93', // Plum
  '#198276', // Deep teal
  '#a63d40', // Crimson
  '#526a40', // Olive
];

function parseIsoUtcMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [yStr, mStr, dStr] = iso.trim().split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Computes exact signed UTC calendar day difference (`toIso - fromIso`), or `null` if invalid.
 */
export function diffCalendarDaysSigned(
  fromIso: string | undefined,
  toIso: string | undefined
): number | null {
  const a = parseIsoUtcMs(fromIso);
  const b = parseIsoUtcMs(toIso);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Computes non-negative calendar day difference (`toIso - fromIso`), returning `null` if `toIso < fromIso`.
 */
export function diffCalendarDaysNonNeg(
  fromIso: string | undefined,
  toIso: string | undefined
): number | null {
  const diff = diffCalendarDaysSigned(fromIso, toIso);
  if (diff === null || diff < 0) return null;
  return diff;
}

/**
 * Classifies a `YYYY-MM-DD` date into a chronological meteorological season bucket.
 */
export function resolveMeteorologicalSeason(dateIso: string | undefined): SeasonBucket | null {
  if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso.trim())) return null;
  const parts = dateIso.trim().split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  let seasonName: SeasonBucket['seasonName'];
  let intraYearRank: number;
  if (month >= 3 && month <= 5) {
    seasonName = 'Spring';
    intraYearRank = 1;
  } else if (month >= 6 && month <= 8) {
    seasonName = 'Summer';
    intraYearRank = 2;
  } else if (month >= 9 && month <= 11) {
    seasonName = 'Fall';
    intraYearRank = 3;
  } else {
    seasonName = 'Winter';
    intraYearRank = month === 12 ? 4 : 0;
  }

  return {
    seasonKey: `${seasonName} ${year}`,
    seasonName,
    year,
    sortOrder: year * 10 + intraYearRank,
  };
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function meanNullable(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

function pickClosestMilestoneAvg(
  milestones: ResolvedLitterMilestone[],
  targetDays: number,
  toleranceDays: number
): number | null {
  let best: ResolvedLitterMilestone | null = null;
  let bestDist = Infinity;
  for (const m of milestones) {
    if (m.avgWeightGrams <= 0) continue;
    const dist = Math.abs(m.ageDays - targetDays);
    if (dist <= toleranceDays && dist < bestDist) {
      best = m;
      bestDist = dist;
    }
  }
  return best ? best.avgWeightGrams : null;
}

/**
 * Evaluates litter survival rates, 3/6/8-week & weaning litter weight milestones,
 * per-dam/per-sire performance tables, and seasonal maternal curves for one species.
 */
export function evaluateLitterSurvivalAndMilestones(params: {
  speciesProfile: SpeciesProfile;
  breedings: BreedingRecord[];
  animals: Animal[];
  careLogs: CareLog[];
  seasonFilter?: string;
}): LitterSurvivalEvaluationResult {
  const { speciesProfile, breedings, animals, careLogs, seasonFilter } = params;
  const spName = speciesProfile.name;
  const weanTargetDays = Math.max(7, speciesProfile.weanDaysAfterBirth || 42);

  const speciesBreedings = breedings.filter((b) => isSameSpecies(b.species, spName));
  const speciesAnimals = animals.filter((a) => isSameSpecies(a.species, spName));
  const animalById = new Map<string, Animal>();
  for (const a of speciesAnimals) {
    animalById.set(a.id, a);
  }

  // Index weight checks per animal for offspring fallback milestones
  const weightLogsByAnimalId = new Map<string, CareLog[]>();
  for (const l of careLogs) {
    if (l.weightGrams <= 0) continue;
    if (l.species && !isSameSpecies(l.species, spName)) continue;
    const arr = weightLogsByAnimalId.get(l.animalId) || [];
    arr.push(l);
    weightLogsByAnimalId.set(l.animalId, arr);
  }

  // Index offspring by parent-pair + birthDate key for fast lookup
  const offspringByLitterKey = new Map<string, Animal[]>();
  for (const a of speciesAnimals) {
    if (!a.birthDateIso || (!a.sireId && !a.damId)) continue;
    const key = `${a.sireId || ''}::${a.damId || ''}::${a.birthDateIso}`;
    const arr = offspringByLitterKey.get(key) || [];
    arr.push(a);
    offspringByLitterKey.set(key, arr);
  }

  const allLitters: LitterSurvivalMetrics[] = [];
  const missedBreedings: BreedingRecord[] = [];

  for (const b of speciesBreedings) {
    const isBornOrWeaned =
      b.status === 'Born' ||
      b.status === 'Weaned' ||
      Boolean(b.actualBirthDateIso) ||
      b.liveCount > 0 ||
      b.stillbornCount > 0 ||
      (b.litterWeightMilestones?.length ?? 0) > 0;

    if (b.status === 'Missed') {
      missedBreedings.push(b);
      continue;
    }
    if (!isBornOrWeaned) continue;

    const birthDateIso = b.actualBirthDateIso || b.expectedDueDateIso || b.bredDateIso;
    const season = resolveMeteorologicalSeason(birthDateIso || b.bredDateIso);
    if (seasonFilter && seasonFilter !== 'all' && season?.seasonKey !== seasonFilter) {
      continue;
    }

    const liveCount = Math.max(0, b.liveCount || 0);
    const stillbornCount = Math.max(0, b.stillbornCount || 0);
    const fosteredCount = b.fosteredCount || 0;
    const weanedCount = Math.max(0, b.weanedCount || 0);
    const totalBorn = liveCount + stillbornCount;
    const rearingBase = Math.max(0, liveCount + fosteredCount);

    const liveBirthRatePct =
      totalBorn > 0 ? round1((liveCount / totalBorn) * 100) : null;
    const weaningSurvivalRatePct =
      (b.status === 'Weaned' || weanedCount > 0) && rearingBase > 0
        ? Math.min(100, round1((weanedCount / rearingBase) * 100))
        : null;

    const explicitMilestones: LitterWeightMilestone[] = normalizeLitterWeightMilestones(
      b.litterWeightMilestones
    );
    const resolvedMilestones: ResolvedLitterMilestone[] = [];

    for (const m of explicitMilestones) {
      const denomCount =
        m.liveCount !== undefined && m.liveCount > 0
          ? m.liveCount
          : rearingBase > 0
          ? rearingBase
          : liveCount > 0
          ? liveCount
          : 1;
      const avgWeightGrams =
        m.avgWeightGrams && m.avgWeightGrams > 0
          ? m.avgWeightGrams
          : m.totalWeightGrams > 0
          ? Math.round(m.totalWeightGrams / denomCount)
          : 0;
      const totalWeightGrams =
        m.totalWeightGrams > 0
          ? m.totalWeightGrams
          : avgWeightGrams > 0
          ? Math.round(avgWeightGrams * denomCount)
          : 0;
      resolvedMilestones.push({
        id: m.id,
        ageDays: m.ageDays,
        dateIso: m.dateIso,
        label: m.label,
        liveCount: m.liveCount,
        totalWeightGrams,
        avgWeightGrams,
        source: 'litter_milestone',
      });
    }

    // Supplement with linked offspring CareLog weights when no explicit milestone covers that age
    if (b.actualBirthDateIso) {
      const litterKey = `${b.sireId || ''}::${b.damId || ''}::${b.actualBirthDateIso}`;
      const linkedOffspring = offspringByLitterKey.get(litterKey) || [];
      if (linkedOffspring.length > 0) {
        const byAgeBucket = new Map<number, number[]>();
        for (const kit of linkedOffspring) {
          const logs = weightLogsByAnimalId.get(kit.id) || [];
          for (const log of logs) {
            const age = diffCalendarDaysNonNeg(b.actualBirthDateIso, log.dateIso);
            if (age === null || age > 365) continue;
            const list = byAgeBucket.get(age) || [];
            list.push(log.weightGrams);
            byAgeBucket.set(age, list);
          }
        }
        for (const [ageDays, weights] of byAgeBucket.entries()) {
          const alreadyCovered = resolvedMilestones.some(
            (em) => Math.abs(em.ageDays - ageDays) <= 2
          );
          if (alreadyCovered || weights.length === 0) continue;
          const totalWeightGrams = Math.round(weights.reduce((s, w) => s + w, 0));
          const avgWeightGrams = Math.round(totalWeightGrams / weights.length);
          resolvedMilestones.push({
            id: `auto-${b.id}-${ageDays}`,
            ageDays,
            label: `${ageDays}-Day Offspring Logs`,
            liveCount: weights.length,
            totalWeightGrams,
            avgWeightGrams,
            source: 'offspring_logs',
            offspringSampleCount: weights.length,
          });
        }
      }
    }

    resolvedMilestones.sort((x, y) => x.ageDays - y.ageDays);

    const avg3WeekGrams = pickClosestMilestoneAvg(resolvedMilestones, 21, 4);
    const avg6WeekGrams = pickClosestMilestoneAvg(resolvedMilestones, 42, 4);
    const avg8WeekGrams = pickClosestMilestoneAvg(resolvedMilestones, 56, 4);
    const avgWeanGrams = pickClosestMilestoneAvg(resolvedMilestones, weanTargetDays, 7);

    const weighedPoints = resolvedMilestones.filter((m) => m.avgWeightGrams > 0);
    let litterAdgGramsPerDay: number | null = null;
    if (weighedPoints.length >= 2) {
      const first = weighedPoints[0];
      const last = weighedPoints[weighedPoints.length - 1];
      const span = last.ageDays - first.ageDays;
      if (span > 0) {
        litterAdgGramsPerDay = round1((last.avgWeightGrams - first.avgWeightGrams) / span);
      }
    } else if (weighedPoints.length === 1 && weighedPoints[0].ageDays > 0) {
      litterAdgGramsPerDay = round1(weighedPoints[0].avgWeightGrams / weighedPoints[0].ageDays);
    }

    allLitters.push({
      breeding: b,
      birthDateIso,
      season,
      totalBorn,
      liveCount,
      stillbornCount,
      fosteredCount,
      rearingBase,
      weanedCount,
      liveBirthRatePct,
      weaningSurvivalRatePct,
      milestones: resolvedMilestones,
      avg3WeekGrams,
      avg6WeekGrams,
      avg8WeekGrams,
      avgWeanGrams,
      litterAdgGramsPerDay,
    });
  }

  allLitters.sort((a, b) => (b.birthDateIso || '').localeCompare(a.birthDateIso || ''));

  const buildParentSummaries = (role: 'dam' | 'sire'): ParentSurvivalPerformanceSummary[] => {
    const grouped = new Map<
      string,
      {
        parentId: string;
        parentName: string;
        parentTattoo: string;
        litters: LitterSurvivalMetrics[];
        missedCount: number;
        totalBreedings: number;
        settledBreedings: number;
        positiveBreedings: number;
      }
    >();

    const ensureBucket = (id: string, fallbackName: string) => {
      const key = id || `name:${fallbackName.trim().toLowerCase()}`;
      let bucket = grouped.get(key);
      if (!bucket) {
        const animal = id ? animalById.get(id) : undefined;
        bucket = {
          parentId: id,
          parentName: animal?.name || fallbackName || 'Unknown',
          parentTattoo: animal?.tattoo || '',
          litters: [],
          missedCount: 0,
          totalBreedings: 0,
          settledBreedings: 0,
          positiveBreedings: 0,
        };
        grouped.set(key, bucket);
      }
      return bucket;
    };

    for (const b of speciesBreedings) {
      const bSeason = resolveMeteorologicalSeason(b.actualBirthDateIso || b.expectedDueDateIso || b.bredDateIso);
      if (seasonFilter && seasonFilter !== 'all' && bSeason?.seasonKey !== seasonFilter) {
        continue;
      }
      const pId = role === 'dam' ? b.damId : b.sireId;
      const pName = role === 'dam' ? b.damName : b.sireName;
      if (!pId && !pName) continue;
      const bucket = ensureBucket(pId, pName);
      bucket.totalBreedings += 1;
      if (b.status !== 'Planned') {
        bucket.settledBreedings += 1;
      }
      if (b.status === 'Missed') {
        bucket.missedCount += 1;
      } else if (b.status === 'Born' || b.status === 'Weaned' || b.status === 'Palpated Positive') {
        bucket.positiveBreedings += 1;
      }
    }

    for (const litter of allLitters) {
      const pId = role === 'dam' ? litter.breeding.damId : litter.breeding.sireId;
      const pName = role === 'dam' ? litter.breeding.damName : litter.breeding.sireName;
      if (!pId && !pName) continue;
      const bucket = ensureBucket(pId, pName);
      bucket.litters.push(litter);
    }

    const out: ParentSurvivalPerformanceSummary[] = [];
    for (const bucket of grouped.values()) {
      if (bucket.litters.length === 0 && bucket.missedCount === 0) continue;

      const totalLiveBorn = bucket.litters.reduce((s, l) => s + l.liveCount, 0);
      const totalStillborn = bucket.litters.reduce((s, l) => s + l.stillbornCount, 0);
      const totalFostered = bucket.litters.reduce((s, l) => s + l.fosteredCount, 0);
      const totalWeaned = bucket.litters.reduce((s, l) => s + l.weanedCount, 0);
      const totalBornAll = totalLiveBorn + totalStillborn;

      const weanedLitters = bucket.litters.filter(
        (l) => l.breeding.status === 'Weaned' || l.weanedCount > 0
      );
      const weanedRearingBase = weanedLitters.reduce((s, l) => s + l.rearingBase, 0);
      const weanedInWeanedLitters = weanedLitters.reduce((s, l) => s + l.weanedCount, 0);

      const liveBirthRatePct =
        totalBornAll > 0 ? round1((totalLiveBorn / totalBornAll) * 100) : null;
      const weaningSurvivalRatePct =
        weanedRearingBase > 0
          ? Math.min(100, round1((weanedInWeanedLitters / weanedRearingBase) * 100))
          : null;
      const conceptionRatePct =
        bucket.settledBreedings > 0
          ? round1((bucket.positiveBreedings / bucket.settledBreedings) * 100)
          : null;

      const avg3 = meanNullable(bucket.litters.map((l) => l.avg3WeekGrams));
      const avg6 = meanNullable(bucket.litters.map((l) => l.avg6WeekGrams));
      const avg8 = meanNullable(bucket.litters.map((l) => l.avg8WeekGrams));
      const avgW = meanNullable(bucket.litters.map((l) => l.avgWeanGrams));
      const avgAdg = meanNullable(bucket.litters.map((l) => l.litterAdgGramsPerDay));

      out.push({
        parentId: bucket.parentId,
        parentName: bucket.parentName,
        parentTattoo: bucket.parentTattoo,
        role,
        totalBreedings: bucket.totalBreedings,
        settledBreedings: bucket.settledBreedings,
        missedCount: bucket.missedCount,
        conceptionRatePct,
        littersBornCount: bucket.litters.length,
        littersWeanedCount: weanedLitters.length,
        totalLiveBorn,
        totalStillborn,
        totalFostered,
        totalWeaned,
        avgLivePerLitter:
          bucket.litters.length > 0 ? round1(totalLiveBorn / bucket.litters.length) : null,
        avgWeanedPerLitter:
          weanedLitters.length > 0 ? round1(weanedInWeanedLitters / weanedLitters.length) : null,
        liveBirthRatePct,
        weaningSurvivalRatePct,
        avg3WeekGrams: avg3 !== null ? Math.round(avg3) : null,
        avg6WeekGrams: avg6 !== null ? Math.round(avg6) : null,
        avg8WeekGrams: avg8 !== null ? Math.round(avg8) : null,
        avgWeanGrams: avgW !== null ? Math.round(avgW) : null,
        meanLitterAdgGramsPerDay: avgAdg !== null ? round1(avgAdg) : null,
        litters: bucket.litters,
      });
    }

    return out.sort(
      (a, b) =>
        b.littersBornCount - a.littersBornCount ||
        (b.weaningSurvivalRatePct ?? -1) - (a.weaningSurvivalRatePct ?? -1) ||
        a.parentName.localeCompare(b.parentName)
    );
  };

  // Seasonal aggregation
  const seasonMap = new Map<
    string,
    {
      bucket: SeasonBucket;
      litters: LitterSurvivalMetrics[];
      missedCount: number;
    }
  >();

  for (const l of allLitters) {
    if (!l.season) continue;
    let entry = seasonMap.get(l.season.seasonKey);
    if (!entry) {
      entry = { bucket: l.season, litters: [], missedCount: 0 };
      seasonMap.set(l.season.seasonKey, entry);
    }
    entry.litters.push(l);
  }
  for (const mb of missedBreedings) {
    const s = resolveMeteorologicalSeason(mb.expectedDueDateIso || mb.bredDateIso);
    if (!s) continue;
    if (seasonFilter && seasonFilter !== 'all' && s.seasonKey !== seasonFilter) continue;
    let entry = seasonMap.get(s.seasonKey);
    if (!entry) {
      entry = { bucket: s, litters: [], missedCount: 0 };
      seasonMap.set(s.seasonKey, entry);
    }
    entry.missedCount += 1;
  }

  const seasonalSummaries: SeasonalSurvivalSummary[] = Array.from(seasonMap.values())
    .sort((a, b) => a.bucket.sortOrder - b.bucket.sortOrder)
    .map(({ bucket, litters, missedCount }) => {
      const totalLiveBorn = litters.reduce((s, l) => s + l.liveCount, 0);
      const totalStillborn = litters.reduce((s, l) => s + l.stillbornCount, 0);
      const totalFostered = litters.reduce((s, l) => s + l.fosteredCount, 0);
      const totalWeaned = litters.reduce((s, l) => s + l.weanedCount, 0);
      const totalBornAll = totalLiveBorn + totalStillborn;
      const weanedLitters = litters.filter(
        (l) => l.breeding.status === 'Weaned' || l.weanedCount > 0
      );
      const weanedBase = weanedLitters.reduce((s, l) => s + l.rearingBase, 0);
      const weanedSum = weanedLitters.reduce((s, l) => s + l.weanedCount, 0);
      const avg3 = meanNullable(litters.map((l) => l.avg3WeekGrams));
      const avg6 = meanNullable(litters.map((l) => l.avg6WeekGrams));
      const avg8 = meanNullable(litters.map((l) => l.avg8WeekGrams));
      const avgW = meanNullable(litters.map((l) => l.avgWeanGrams));
      return {
        seasonKey: bucket.seasonKey,
        seasonName: bucket.seasonName,
        year: bucket.year,
        sortOrder: bucket.sortOrder,
        littersBornCount: litters.length,
        missedCount,
        totalLiveBorn,
        totalStillborn,
        totalFostered,
        totalWeaned,
        liveBirthRatePct:
          totalBornAll > 0 ? round1((totalLiveBorn / totalBornAll) * 100) : null,
        weaningSurvivalRatePct:
          weanedBase > 0 ? Math.min(100, round1((weanedSum / weanedBase) * 100)) : null,
        avg3WeekGrams: avg3 !== null ? Math.round(avg3) : null,
        avg6WeekGrams: avg6 !== null ? Math.round(avg6) : null,
        avg8WeekGrams: avg8 !== null ? Math.round(avg8) : null,
        avgWeanGrams: avgW !== null ? Math.round(avgW) : null,
      };
    });

  const overallLive = allLitters.reduce((s, l) => s + l.liveCount, 0);
  const overallStillborn = allLitters.reduce((s, l) => s + l.stillbornCount, 0);
  const overallBornAll = overallLive + overallStillborn;
  const overallWeanedLitters = allLitters.filter(
    (l) => l.breeding.status === 'Weaned' || l.weanedCount > 0
  );
  const overallWeanedBase = overallWeanedLitters.reduce((s, l) => s + l.rearingBase, 0);
  const overallWeanedSum = overallWeanedLitters.reduce((s, l) => s + l.weanedCount, 0);
  const overallAvg3 = meanNullable(allLitters.map((l) => l.avg3WeekGrams));
  const overallAvg6 = meanNullable(allLitters.map((l) => l.avg6WeekGrams));
  const overallAvg8 = meanNullable(allLitters.map((l) => l.avg8WeekGrams));

  return {
    speciesName: spName,
    litters: allLitters,
    damSummaries: buildParentSummaries('dam'),
    sireSummaries: buildParentSummaries('sire'),
    seasonalSummaries,
    overallSummary: {
      littersBornCount: allLitters.length,
      missedCount: missedBreedings.filter((mb) => {
        if (!seasonFilter || seasonFilter === 'all') return true;
        const s = resolveMeteorologicalSeason(mb.expectedDueDateIso || mb.bredDateIso);
        return s?.seasonKey === seasonFilter;
      }).length,
      totalLiveBorn: overallLive,
      totalStillborn: overallStillborn,
      totalWeaned: allLitters.reduce((s, l) => s + l.weanedCount, 0),
      liveBirthRatePct:
        overallBornAll > 0 ? round1((overallLive / overallBornAll) * 100) : null,
      weaningSurvivalRatePct:
        overallWeanedBase > 0
          ? Math.min(100, round1((overallWeanedSum / overallWeanedBase) * 100))
          : null,
      avg3WeekGrams: overallAvg3 !== null ? Math.round(overallAvg3) : null,
      avg6WeekGrams: overallAvg6 !== null ? Math.round(overallAvg6) : null,
      avg8WeekGrams: overallAvg8 !== null ? Math.round(overallAvg8) : null,
    },
  };
}

/**
 * Linearly interpolates a target weight curve at a given `ageDays`, or `null` if outside range.
 */
export function interpolateTargetWeightAtAge(
  curve: TargetWeightPoint[],
  ageDays: number
): number | null {
  if (!curve || curve.length === 0 || !Number.isFinite(ageDays)) return null;
  const sorted = normalizeTargetWeightCurve(curve);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) {
    return ageDays === sorted[0].ageDays ? sorted[0].weightGrams : null;
  }
  if (ageDays < sorted[0].ageDays || ageDays > sorted[sorted.length - 1].ageDays) {
    return null;
  }
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i].ageDays === ageDays) return sorted[i].weightGrams;
    if (i < sorted.length - 1 && ageDays > sorted[i].ageDays && ageDays < sorted[i + 1].ageDays) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const t = (ageDays - a.ageDays) / Math.max(1, b.ageDays - a.ageDays);
      return Math.round(a.weightGrams + t * (b.weightGrams - a.weightGrams));
    }
  }
  return null;
}

/**
 * Builds chronological age-in-days growth and Rate of Gain (ADG) points for a single animal.
 */
export function buildAnimalGrowthSeries(params: {
  animal: Animal;
  careLogs: CareLog[];
  targetCurve?: TargetWeightPoint[];
  referenceDateIso?: string;
}): AnimalGrowthSeries {
  const { animal, careLogs, targetCurve = [], referenceDateIso = todayDateIso() } = params;
  const hasBirthDate = Boolean(parseIsoUtcMs(animal.birthDateIso));

  const animalLogs = careLogs
    .filter((l) => l.animalId === animal.id && l.weightGrams > 0)
    .sort((a, b) => (a.dateIso || '').localeCompare(b.dateIso || ''));

  // Deduplicate logs on the exact same dateIso (keep latest entry in array)
  const byDate = new Map<
    string,
    { dateIso: string; weightGrams: number; label: string; source: 'care_log' | 'profile_weight' }
  >();
  for (const l of animalLogs) {
    if (!parseIsoUtcMs(l.dateIso)) continue;
    byDate.set(l.dateIso, {
      dateIso: l.dateIso,
      weightGrams: Math.round(l.weightGrams),
      label: l.title || 'Weight Check',
      source: 'care_log',
    });
  }

  // If animal has a current profile weight > 0 and either no logs or a different weight than the last log,
  // include current profile weight at referenceDateIso (when no log exists on/after it or when 0 logs exist)
  if (animal.weightGrams > 0 && byDate.size === 0 && parseIsoUtcMs(referenceDateIso)) {
    byDate.set(referenceDateIso, {
      dateIso: referenceDateIso,
      weightGrams: Math.round(animal.weightGrams),
      label: 'Current Weight',
      source: 'profile_weight',
    });
  }

  const rawPoints = Array.from(byDate.values()).sort((a, b) =>
    a.dateIso.localeCompare(b.dateIso)
  );

  const points: AnimalGrowthPoint[] = [];
  if (hasBirthDate) {
    for (const p of rawPoints) {
      const ageDays = diffCalendarDaysNonNeg(animal.birthDateIso, p.dateIso);
      if (ageDays === null) continue;
      const prev = points.length > 0 ? points[points.length - 1] : null;
      const segmentSpan = prev ? ageDays - prev.ageDays : 0;
      const segmentAdgGramsPerDay =
        prev && segmentSpan > 0
          ? round1((p.weightGrams - prev.weightGrams) / segmentSpan)
          : null;
      points.push({
        ageDays,
        dateIso: p.dateIso,
        weightGrams: p.weightGrams,
        segmentAdgGramsPerDay,
        label: p.label,
        source: p.source,
      });
    }
  }

  if (points.length === 0) {
    return {
      animal,
      hasBirthDate,
      points: [],
      startAgeDays: null,
      startWeightGrams: null,
      latestAgeDays: null,
      latestWeightGrams: null,
      totalGainGrams: null,
      spanDays: null,
      overallAdgGramsPerDay: null,
      peakAdgGramsPerDay: null,
      targetDeltaGrams: null,
      targetDeltaPct: null,
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = last.ageDays - first.ageDays;
  const totalGainGrams = points.length >= 2 ? last.weightGrams - first.weightGrams : null;
  const overallAdgGramsPerDay =
    spanDays > 0 && totalGainGrams !== null ? round1(totalGainGrams / spanDays) : null;
  const segmentAdgs = points
    .map((p) => p.segmentAdgGramsPerDay)
    .filter((v): v is number => v !== null);
  const peakAdgGramsPerDay =
    segmentAdgs.length > 0 ? Math.max(...segmentAdgs) : overallAdgGramsPerDay;

  const targetAtLatest = interpolateTargetWeightAtAge(targetCurve, last.ageDays);
  const targetDeltaGrams =
    targetAtLatest !== null ? last.weightGrams - targetAtLatest : null;
  const targetDeltaPct =
    targetAtLatest !== null && targetAtLatest > 0 && targetDeltaGrams !== null
      ? round1((targetDeltaGrams / targetAtLatest) * 100)
      : null;

  return {
    animal,
    hasBirthDate,
    points,
    startAgeDays: first.ageDays,
    startWeightGrams: first.weightGrams,
    latestAgeDays: last.ageDays,
    latestWeightGrams: last.weightGrams,
    totalGainGrams,
    spanDays: spanDays > 0 ? spanDays : null,
    overallAdgGramsPerDay,
    peakAdgGramsPerDay,
    targetDeltaGrams,
    targetDeltaPct,
  };
}

/**
 * Computes a native Barn Cohort Benchmark curve by grouping actual weighed species observations
 * into 7-day age buckets (zero invented weights).
 */
export function buildBarnCohortBenchmarkCurve(params: {
  animals: Animal[];
  careLogs: CareLog[];
  speciesName: string;
  bucketSizeDays?: number;
  maxAgeDays?: number;
  referenceDateIso?: string;
}): CohortBenchmarkPoint[] {
  const {
    animals,
    careLogs,
    speciesName,
    bucketSizeDays = 7,
    maxAgeDays = 365,
    referenceDateIso = todayDateIso(),
  } = params;
  const spAnimals = animals.filter((a) => isSameSpecies(a.species, speciesName));
  const buckets = new Map<number, number[]>();

  for (const a of spAnimals) {
    const series = buildAnimalGrowthSeries({ animal: a, careLogs, referenceDateIso });
    if (!series.hasBirthDate) continue;
    for (const pt of series.points) {
      if (pt.ageDays < 0 || pt.ageDays > maxAgeDays) continue;
      const bucketAge = Math.round(pt.ageDays / bucketSizeDays) * bucketSizeDays;
      const arr = buckets.get(bucketAge) || [];
      arr.push(pt.weightGrams);
      buckets.set(bucketAge, arr);
    }
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ageDays, weights]) => ({
      ageDays,
      meanWeightGrams: Math.round(weights.reduce((s, w) => s + w, 0) / weights.length),
      minWeightGrams: Math.min(...weights),
      maxWeightGrams: Math.max(...weights),
      sampleCount: weights.length,
    }));
}

/**
 * Builds the complete multi-animal Comparative Rate of Gain chart model on an age-in-days axis
 * with optional Target/Goal curve and Barn Cohort Benchmark overlays.
 */
export function buildComparativeGrowthChartModel(params: {
  animals: Animal[];
  selectedAnimalIds: string[];
  careLogs: CareLog[];
  speciesProfile: SpeciesProfile;
  includeCohortBenchmark?: boolean;
  referenceDateIso?: string;
}): ComparativeGrowthChartModel {
  const {
    animals,
    selectedAnimalIds,
    careLogs,
    speciesProfile,
    includeCohortBenchmark = true,
    referenceDateIso = todayDateIso(),
  } = params;

  const targetCurve = normalizeTargetWeightCurve(speciesProfile.targetWeightCurve);
  const speciesAnimals = animals.filter((a) => isSameSpecies(a.species, speciesProfile.name));
  const byId = new Map(speciesAnimals.map((a) => [a.id, a]));

  const series: AnimalGrowthSeries[] = [];
  for (const id of selectedAnimalIds) {
    const animal = byId.get(id);
    if (!animal) continue;
    series.push(
      buildAnimalGrowthSeries({
        animal,
        careLogs,
        targetCurve,
        referenceDateIso,
      })
    );
  }

  const cohortCurve = includeCohortBenchmark
    ? buildBarnCohortBenchmarkCurve({
        animals: speciesAnimals,
        careLogs,
        speciesName: speciesProfile.name,
        referenceDateIso,
      })
    : [];

  const allAges: number[] = [];
  const allWeights: number[] = [];
  const allAdgs: number[] = [];

  for (const s of series) {
    for (const pt of s.points) {
      allAges.push(pt.ageDays);
      allWeights.push(pt.weightGrams);
      if (pt.segmentAdgGramsPerDay !== null) {
        allAdgs.push(pt.segmentAdgGramsPerDay);
      }
    }
  }
  for (const tp of targetCurve) {
    allAges.push(tp.ageDays);
    allWeights.push(tp.weightGrams);
  }
  for (const cp of cohortCurve) {
    allAges.push(cp.ageDays);
    allWeights.push(cp.meanWeightGrams);
  }

  const minAgeDays = allAges.length > 0 ? Math.min(0, ...allAges) : 0;
  const maxAgeDays = allAges.length > 0 ? Math.max(21, ...allAges) : 90;
  const maxWeightGrams = allWeights.length > 0 ? Math.max(500, ...allWeights) : 4536;
  const maxAdgGramsPerDay = allAdgs.length > 0 ? Math.max(10, ...allAdgs) : 50;
  const minAdgGramsPerDay = allAdgs.length > 0 ? Math.min(0, ...allAdgs) : 0;

  return {
    series,
    targetCurve,
    cohortCurve,
    minAgeDays,
    maxAgeDays,
    maxWeightGrams,
    maxAdgGramsPerDay,
    minAdgGramsPerDay,
  };
}

/**
 * Formats Rate of Gain (`grams/day`) cleanly in the active `WeightUnit`.
 */
export function formatRateOfGain(
  gramsPerDay: number | null | undefined,
  unit: WeightUnit
): string {
  if (gramsPerDay === null || gramsPerDay === undefined || !Number.isFinite(gramsPerDay)) {
    return '—';
  }
  const sign = gramsPerDay < 0 ? '-' : gramsPerDay > 0 ? '+' : '';
  const abs = Math.abs(gramsPerDay);
  if (unit === 'grams') return `${sign}${abs.toFixed(1)} g/d`;
  if (unit === 'kg') return `${sign}${(abs / 1000).toFixed(3)} kg/d`;
  if (unit === 'lbs') return `${sign}${(abs / 453.59237).toFixed(3)} lb/d`;
  const ozPerDay = abs / 28.349523125;
  return `${sign}${ozPerDay.toFixed(2)} oz/d (${sign}${abs.toFixed(1)} g/d)`;
}

/**
 * Converts integer grams to a clean numeric axis value in the active `WeightUnit`.
 */
export function gramsToAxisNumeric(grams: number, unit: WeightUnit): number {
  if (unit === 'grams') return Math.round(grams);
  if (unit === 'kg') return Math.round((grams / 1000) * 100) / 100;
  return Math.round((grams / 453.59237) * 100) / 100;
}

/**
 * Formats a chart axis weight tick compactly in the active `WeightUnit`.
 */
export function formatCompactWeightAxisTick(grams: number, unit: WeightUnit): string {
  if (grams <= 0) return '0';
  if (unit === 'grams') return `${Math.round(grams)}g`;
  if (unit === 'kg') return `${(grams / 1000).toFixed(1)}kg`;
  if (unit === 'lbs') return `${(grams / 453.59237).toFixed(1)}lb`;
  return formatWeight(grams, 'lbs_oz').replace(' lb ', '.').replace(' oz', '');
}
```

## `src/core/imageOptimizationSpec.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Image Optimization Policy & Dimension Math (`src/core/imageOptimizationSpec.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`, `canvas`) dependencies.
 * Shared identically by:
 * - Web / PWA (`src/storage/webImageOptimizer.ts` via Canvas/WebP/JPEG)
 * - React Native / Expo (`expo-image-manipulator` via `SaveFormat.WEBP` / `SaveFormat.JPEG`)
 * - Direct user uploads on an animal's page AND batch archives from any External Platform Importer.
 */

export type ImageOptimizationPresetId = 'compact' | 'balanced' | 'high_detail';

export interface ImageOptimizationPreset {
  id: ImageOptimizationPresetId;
  label: string;
  shortBadge: string;
  description: string;
  maxDimension: number;
  quality: number;
  thumbnailDimension: number;
  thumbnailQuality: number;
  typicalSizeHint: string;
}

export const IMAGE_OPTIMIZATION_PRESETS: Record<
  ImageOptimizationPresetId,
  ImageOptimizationPreset
> = {
  compact: {
    id: 'compact',
    label: 'Compact Barn · 960px',
    shortBadge: '960px · Max Space Savings',
    description:
      'Best for large 200+ animal herds and cloud-folder sync on slow rural connections.',
    maxDimension: 960,
    quality: 0.72,
    thumbnailDimension: 224,
    thumbnailQuality: 0.68,
    typicalSizeHint: '~45–85 KB / photo',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced HD · 1280px (Recommended)',
    shortBadge: '1280px · Crisp & Lean',
    description:
      'Retains sharp coat color, conformation, and ear-tattoo clarity while cutting smartphone photo size by ~95%.',
    maxDimension: 1280,
    quality: 0.8,
    thumbnailDimension: 256,
    thumbnailQuality: 0.74,
    typicalSizeHint: '~85–150 KB / photo',
  },
  high_detail: {
    id: 'high_detail',
    label: 'Show & Tattoo Detail · 1600px',
    shortBadge: '1600px · High Detail',
    description:
      'Higher pixel ceiling for zooming into fine ear tattoos, fiber crimp, or show table portraits.',
    maxDimension: 1600,
    quality: 0.85,
    thumbnailDimension: 288,
    thumbnailQuality: 0.78,
    typicalSizeHint: '~145–240 KB / photo',
  },
};

export const DEFAULT_IMAGE_OPTIMIZATION_PRESET: ImageOptimizationPresetId = 'balanced';

/** Hard single-canvas backing store area ceiling (16M px) to avoid WebKit/mobile OOM crashes. */
export const MAX_CANVAS_AREA_PX = 16_000_000;
/** Tighter single-canvas area ceiling (3M px) for Low-Memory / constrained tier devices. */
export const MAX_CONSTRAINED_CANVAS_AREA_PX = 3_000_000;

export function getCanvasAreaCeiling(isConstrained: boolean): number {
  return isConstrained ? MAX_CONSTRAINED_CANVAS_AREA_PX : MAX_CANVAS_AREA_PX;
}

/**
 * Proportionally clamps canvas dimensions so `width * height <= maxAreaPx` (never returning < 1px).
 */
export function clampCanvasDimensionsToAreaCeiling(
  width: number,
  height: number,
  maxAreaPx: number = MAX_CANVAS_AREA_PX
): { width: number; height: number; wasClamped: boolean } {
  const safeW = Number.isFinite(width) ? Math.max(1, Math.round(width)) : 1;
  const safeH = Number.isFinite(height) ? Math.max(1, Math.round(height)) : 1;
  const ceiling = Number.isFinite(maxAreaPx)
    ? Math.max(1, Math.floor(maxAreaPx))
    : MAX_CANVAS_AREA_PX;

  if (safeW * safeH <= ceiling) {
    return { width: safeW, height: safeH, wasClamped: false };
  }

  const scale = Math.sqrt(ceiling / (safeW * safeH));
  let outW = Math.max(1, Math.floor(safeW * scale));
  let outH = Math.max(1, Math.floor(safeH * scale));
  while (outW * outH > ceiling && (outW > 1 || outH > 1)) {
    if (outW >= outH && outW > 1) {
      outW -= 1;
    } else if (outH > 1) {
      outH -= 1;
    } else {
      break;
    }
  }
  return { width: outW, height: outH, wasClamped: true };
}

/**
 * Caps canvas backing-store DPR at `Math.min(2, dpr || 1)`, or `1` in Low-Memory / constrained mode.
 */
export function capCanvasDevicePixelRatio(
  rawDevicePixelRatio: number | null | undefined,
  isConstrained: boolean
): number {
  if (isConstrained) return 1;
  const dpr =
    typeof rawDevicePixelRatio === 'number' &&
    Number.isFinite(rawDevicePixelRatio) &&
    rawDevicePixelRatio > 0
      ? rawDevicePixelRatio
      : 1;
  return Math.min(2, dpr);
}

export function resolveImageOptimizationPreset(
  presetId?: string | null
): ImageOptimizationPreset {
  if (presetId === 'compact' || presetId === 'balanced' || presetId === 'high_detail') {
    return IMAGE_OPTIMIZATION_PRESETS[presetId];
  }
  return IMAGE_OPTIMIZATION_PRESETS[DEFAULT_IMAGE_OPTIMIZATION_PRESET];
}

/**
 * Computes proportional output dimensions capped to `maxDimension` on the longest edge
 * and clamped to `maxAreaPx` total canvas pixels. Never upscales images that are smaller.
 */
export function computeScaledDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxDimension: number,
  maxAreaPx: number = MAX_CANVAS_AREA_PX
): { width: number; height: number; wasResized: boolean } {
  const safeW = Number.isFinite(sourceWidth) ? Math.max(1, Math.round(sourceWidth)) : 1;
  const safeH = Number.isFinite(sourceHeight) ? Math.max(1, Math.round(sourceHeight)) : 1;
  const longest = Math.max(safeW, safeH);

  let targetW = safeW;
  let targetH = safeH;
  let wasResized = false;

  if (longest > maxDimension) {
    const scale = maxDimension / longest;
    targetW = Math.max(1, Math.round(safeW * scale));
    targetH = Math.max(1, Math.round(safeH * scale));
    wasResized = true;
  }

  const clamped = clampCanvasDimensionsToAreaCeiling(targetW, targetH, maxAreaPx);
  return {
    width: clamped.width,
    height: clamped.height,
    wasResized: wasResized || clamped.wasClamped,
  };
}

/**
 * Estimates actual binary payload bytes stored inside a `data:image/...;base64,...` URI.
 */
export function estimateDataUrlByteLength(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return dataUrl.length;
  const base64Len = dataUrl.length - commaIdx - 1;
  return Math.max(0, Math.floor((base64Len * 3) / 4));
}

/**
 * Pure percentage space saved (`0` to `99`). Returns `0` if stored >= original.
 */
export function calculateSavingsPercent(originalBytes: number, storedBytes: number): number {
  if (!originalBytes || originalBytes <= 0 || storedBytes >= originalBytes) return 0;
  return Math.min(99, Math.max(0, Math.round(((originalBytes - storedBytes) / originalBytes) * 100)));
}

/**
 * Pure human-readable byte formatter (`118.4 KB`, `4.12 MB`).
 */
export function formatByteSizePure(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface OptimizedImagePayload {
  originalFileName: string;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
  savingsPercent: number;
  thumbnailDataUrl: string;
  dataUrl: string;
}
```

<!-- END OF PART 09 OF 16 (12 files) -->
