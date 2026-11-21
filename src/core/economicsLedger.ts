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
