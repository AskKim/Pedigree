/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { repairBarnDataHealth } from '../dataHealthCheck';
import {
  calculateDressOutPercent,
  computeAnimalProfitMargins,
  computeFeedAllocationCostCents,
  computeLitterProfitMargins,
  evaluateProcessingSummary,
  evaluateSpeciesEconomicsSummary,
  evaluateYouthProjectSummary,
  formatEconomicsLedgerCsv,
  formatProcessingLogsCsv,
  generateYouthProjectReportHtml,
} from '../economicsLedger';
import {
  BreedingRecord,
  FeedAllocation,
  FeedBatch,
  LedgerEntry,
  ProcessingLog,
  YouthProjectBook,
} from '../models';
import { migrateAnimalsToSpecies } from '../speciesMigration';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

const TS = '2026-10-01T12:00:00.000Z';

describe('economicsLedger — P&L margins, processing yields & 4-H/FFA project books', () => {
  it('computes live-to-dressed carcass yield percentage accurately and handles invalid inputs safely', () => {
    expect(calculateDressOutPercent(2500, 1450)).toBe(58);
    expect(calculateDressOutPercent(3000, 1750)).toBe(58.3);
    expect(calculateDressOutPercent(0, 1200)).toBeUndefined();
    expect(calculateDressOutPercent(2500, 0)).toBeUndefined();
    expect(calculateDressOutPercent(Number.NaN, 1200)).toBeUndefined();
  });

  it('computes per-animal and per-litter profit margins across sales, purchases, stud fees, allocated feed, and processing', () => {
    const buck = makeAnimal('a-buck', {
      name: 'OakridgeRex',
      sex: 'Male',
      purchaseCostCents: 6500,
    });
    const doe = makeAnimal('a-doe', {
      name: 'CloverBelle',
      sex: 'Female',
      purchaseCostCents: 5000,
    });
    const kitSold = makeAnimal('a-kit-1', {
      name: 'Clover Kit 1',
      status: 'Sold',
      sireId: 'a-buck',
      damId: 'a-doe',
      birthDateIso: '2026-06-01',
      soldDateIso: '2026-08-15',
      salePriceCents: 7500,
    });

    const breeding: BreedingRecord = {
      id: 'br-1',
      species: 'Rabbit',
      sireId: 'a-buck',
      damId: 'a-doe',
      sireName: 'OakridgeRex',
      damName: 'CloverBelle',
      bredDateIso: '2026-05-01',
      expectedDueDateIso: '2026-06-01',
      actualBirthDateIso: '2026-06-01',
      projectedCoiPercent: 0,
      liveCount: 6,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 5,
      offspringCreated: true,
      status: 'Weaned',
      serviceFeeCents: 2500,
      serviceFeeDirection: 'earned',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const feedBatch: FeedBatch = {
      id: 'fb-1',
      species: 'Rabbit',
      brand: 'Purina',
      productName: 'Show Pellet',
      lotNumber: 'LOT-9',
      millCode: 'M1',
      manufactureDateIso: '2026-06-01',
      purchaseDateIso: '2026-06-02',
      bagCount: 2,
      bagWeightValue: 50,
      bagWeightUnit: 'lbs',
      totalQuantity: 100,
      remainingQuantity: 50,
      lowStockThreshold: 20,
      totalCostCents: 5000,
      supplierName: 'Local Co-op',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const allocations: FeedAllocation[] = [
      {
        id: 'fa-1',
        species: 'Rabbit',
        feedBatchId: 'fb-1',
        targetType: 'litter',
        targetId: 'br-1',
        targetLabel: 'CloverBelle × OakridgeRex',
        quantity: 20,
        unit: 'lbs',
        dateIso: '2026-06-20',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'fa-2',
        species: 'Rabbit',
        feedBatchId: 'fb-1',
        targetType: 'animal',
        targetId: 'a-buck',
        targetLabel: 'OakridgeRex',
        quantity: 10,
        unit: 'lbs',
        dateIso: '2026-06-22',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const batchMap = new Map([[feedBatch.id, feedBatch]]);
    expect(computeFeedAllocationCostCents(allocations[0], batchMap)).toBe(1000);
    expect(computeFeedAllocationCostCents(allocations[1], batchMap)).toBe(500);

    const ledgerEntries: LedgerEntry[] = [
      {
        id: 'le-bedding',
        species: 'Rabbit',
        dateIso: '2026-06-15',
        entryType: 'expense',
        category: 'bedding',
        amountCents: 1200,
        title: 'Pine Shavings',
        vendorOrParty: 'Tractor Supply',
        linkedBreedingId: 'br-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'le-vet-buck',
        species: 'Rabbit',
        dateIso: '2026-07-01',
        entryType: 'expense',
        category: 'vet',
        amountCents: 1500,
        title: 'Nail & Ear Check',
        vendorOrParty: 'Barn Vet',
        linkedAnimalId: 'a-buck',
        receiptPhotoDataUrl: 'data:image/webp;base64,AAA',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'le-feed-linked',
        species: 'Rabbit',
        dateIso: '2026-06-02',
        entryType: 'expense',
        category: 'feed',
        amountCents: 5000,
        title: 'Show Pellet Bags',
        vendorOrParty: 'Local Co-op',
        linkedFeedBatchId: 'fb-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const processingLogs: ProcessingLog[] = [
      {
        id: 'pl-1',
        species: 'Rabbit',
        title: 'Litter Fryer Harvest',
        linkedBreedingId: 'br-1',
        scheduledDateIso: '2026-08-20',
        harvestDateIso: '2026-08-20',
        status: 'Processed',
        animalCount: 2,
        liveWeightGrams: 5000,
        dressedWeightGrams: 2900,
        dressOutPercent: 58,
        peltCount: 2,
        peltGrade: 'Prime',
        peltColorNotes: 'Dense glossy coat',
        processingCostCents: 800,
        meatValueCents: 3200,
        peltValueCents: 1400,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const animalRows = computeAnimalProfitMargins({
      animals: [buck, doe, kitSold],
      breedings: [breeding],
      ledgerEntries,
      feedBatches: [feedBatch],
      feedAllocations: allocations,
      processingLogs,
    });

    const buckRow = animalRows.find((r) => r.animal.id === 'a-buck');
    expect(buckRow).toBeDefined();
    expect(buckRow?.studFeesEarnedCents).toBe(2500);
    expect(buckRow?.purchaseCostCents).toBe(6500);
    expect(buckRow?.allocatedFeedCostCents).toBe(500);
    expect(buckRow?.ledgerExpenseCents).toBe(1500);
    expect(buckRow?.netProfitCents).toBe(2500 - (6500 + 500 + 1500));

    const litterRows = computeLitterProfitMargins({
      animals: [buck, doe, kitSold],
      breedings: [breeding],
      ledgerEntries,
      feedBatches: [feedBatch],
      feedAllocations: allocations,
      processingLogs,
    });
    expect(litterRows).toHaveLength(1);
    const litter = litterRows[0];
    expect(litter.offspringSalesCents).toBe(7500);
    expect(litter.studFeesEarnedCents).toBe(2500);
    expect(litter.processingRevenueCents).toBe(4600); // 3200 + 1400
    expect(litter.totalRevenueCents).toBe(14600);
    expect(litter.allocatedFeedCostCents).toBe(1000);
    expect(litter.ledgerExpenseCents).toBe(1200);
    expect(litter.processingCostCents).toBe(800);
    expect(litter.totalCostCents).toBe(3000);
    expect(litter.netProfitCents).toBe(11600);
    expect(litter.costPerWeanedCents).toBe(600); // 3000 / 5 weaned

    // Species economics summary must avoid double-counting feedBatch fb-1 already linked by le-feed-linked
    const summary = evaluateSpeciesEconomicsSummary({
      animals: [buck, doe, kitSold],
      breedings: [breeding],
      ledgerEntries,
      feedBatches: [feedBatch],
      processingLogs,
      currencyCode: 'USD',
    });
    expect(summary.unlinkedFeedBatchCostCents).toBe(0);
    expect(summary.ledgerExpensesCents).toBe(7700); // 1200 + 1500 + 5000
    expect(summary.totalRevenueCents).toBe(7500 + 2500 + 4600);
    expect(summary.totalExpenseCents).toBe(11500 + 7700 + 800); // purchases 11500 + ledger 7700 + proc 800
    expect(summary.receiptAttachedCount).toBe(1);
    expect(summary.expenseBreakdown.length).toBeGreaterThan(0);
  });

  it('summarizes scheduled vs overdue vs processed meat/pelt yields and pelt grade tallies', () => {
    const logs: ProcessingLog[] = [
      {
        id: 'p-1',
        species: 'Rabbit',
        title: 'Batch A',
        scheduledDateIso: '2026-09-01',
        harvestDateIso: '2026-09-01',
        status: 'Processed',
        animalCount: 4,
        liveWeightGrams: 10000,
        dressedWeightGrams: 5800,
        peltCount: 4,
        peltGrade: 'Prime',
        peltColorNotes: 'Castor',
        processingCostCents: 1000,
        meatValueCents: 6400,
        peltValueCents: 2000,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'p-2',
        species: 'Rabbit',
        title: 'Batch Overdue',
        scheduledDateIso: '2026-10-05',
        harvestDateIso: '',
        status: 'Scheduled',
        animalCount: 3,
        liveWeightGrams: 0,
        dressedWeightGrams: 0,
        peltCount: 0,
        peltGrade: '',
        peltColorNotes: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'p-3',
        species: 'Rabbit',
        title: 'Batch Upcoming',
        scheduledDateIso: '2026-10-25',
        harvestDateIso: '',
        status: 'Scheduled',
        animalCount: 2,
        liveWeightGrams: 0,
        dressedWeightGrams: 0,
        peltCount: 0,
        peltGrade: '',
        peltColorNotes: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'p-4',
        species: 'Rabbit',
        title: 'Batch Cancelled',
        scheduledDateIso: '2026-10-02',
        harvestDateIso: '',
        status: 'Cancelled',
        animalCount: 1,
        liveWeightGrams: 0,
        dressedWeightGrams: 0,
        peltCount: 0,
        peltGrade: 'Cull',
        peltColorNotes: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const summary = evaluateProcessingSummary(logs, '2026-10-10');
    expect(summary.totalLogs).toBe(4);
    expect(summary.processedCount).toBe(1);
    expect(summary.scheduledCount).toBe(2);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.overdueScheduledLogs.map((l) => l.id)).toEqual(['p-2']);
    expect(summary.upcomingScheduledLogs.map((l) => l.id)).toEqual(['p-3']);
    expect(summary.averageDressOutPercent).toBe(58);
    expect(summary.totalPelts).toBe(4);
    expect(summary.peltGradeCounts).toEqual({ Prime: 4 });
    expect(summary.totalMeatValueCents).toBe(6400);
    expect(summary.totalPeltValueCents).toBe(2000);
  });

  it('evaluates 4-H/FFA Youth Project books without double counting sales and escapes HTML safely', () => {
    const projectAnimal = makeAnimal('a-4h', {
      name: 'Fair Champion',
      purchaseCostCents: 4000,
      salePriceCents: 9000,
    });
    const projectBook: YouthProjectBook = {
      id: 'yp-1',
      species: 'Rabbit',
      organization: '4-H',
      projectTitle: '<script>alert(1)</script>Market Rabbit SAE',
      memberName: 'Alex Mercer',
      clubOrChapter: 'Valley Clover 4-H',
      leaderOrAdvisor: 'Coach Kim',
      projectYear: '2026',
      startDateIso: '2026-01-15',
      endDateIso: '2026-09-30',
      status: 'Completed',
      linkedAnimalIds: ['a-4h'],
      linkedBreedingIds: [],
      startingInventoryValueCents: 5000,
      endingInventoryValueCents: 7500,
      feedLogs: [
        {
          id: 'fl-1',
          dateIso: '2026-03-01',
          feedType: '18% Show Pellet',
          quantity: 50,
          unit: 'lbs',
          costCents: 2200,
        },
      ],
      goalsAndReflection: 'Learned tattooing and daily condition scoring.',
      showAndCommunityNotes: 'Won Best of Breed & Youth Showmanship.',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const linkedLedger: LedgerEntry[] = [
      {
        id: 'le-sale',
        species: 'Rabbit',
        dateIso: '2026-09-15',
        entryType: 'income',
        category: 'animal_sale',
        amountCents: 9000, // matches a-4h salePriceCents; must not double-count
        title: 'Fair Auction Sale',
        vendorOrParty: 'County Fair Auction',
        linkedAnimalId: 'a-4h',
        linkedProjectId: 'yp-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'le-show',
        species: 'Rabbit',
        dateIso: '2026-08-20',
        entryType: 'expense',
        category: 'show_entry',
        amountCents: 800,
        title: 'Fair Entry Fee',
        vendorOrParty: 'County Fair',
        linkedProjectId: 'yp-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const summary = evaluateYouthProjectSummary(projectBook, {
      animals: [projectAnimal],
      breedings: [],
      ledgerEntries: linkedLedger,
    });

    expect(summary.totalFeedLogCostCents).toBe(2200);
    expect(summary.ledgerIncomeCents).toBe(9000);
    expect(summary.enrolledAnimalSalesCents).toBe(0); // deduplicated via le-sale
    expect(summary.totalIncomeCents).toBe(9000);
    expect(summary.totalExpenseCents).toBe(4000 + 2200 + 800); // 7000
    expect(summary.cashNetCents).toBe(2000);
    expect(summary.inventoryDeltaCents).toBe(2500); // 7500 - 5000
    expect(summary.netProjectProfitCents).toBe(4500);

    const html = generateYouthProjectReportHtml({
      summary,
      settings: makeSettings(),
      speciesProfile: makeSpeciesProfile('Rabbit'),
      generatedDateIso: '2026-10-01',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Market Rabbit SAE');
    expect(html).toContain('18% Show Pellet');

    const ledgerCsv = formatEconomicsLedgerCsv(linkedLedger, 'USD');
    expect(ledgerCsv.startsWith('\uFEFF')).toBe(true);
    expect(ledgerCsv).toContain('Fair Auction Sale');

    const procCsv = formatProcessingLogsCsv([], 'lbs_oz', 'USD');
    expect(procCsv.startsWith('\uFEFF')).toBe(true);
    expect(procCsv).toContain('Dress-Out %');
  });

  it('keeps ledger, processing, and project book records healthy across repair & species migration', () => {
    const animal = makeAnimal('a-1', { species: 'Rabbit' });
    const snapshot = makeEmptySnapshot({
      animals: [animal],
      ledgerEntries: [
        {
          id: 'le-1',
          species: 'Rabbit',
          dateIso: '2026-08-01',
          entryType: 'expense',
          category: 'supplies',
          amountCents: -500,
          title: 'Water Crocks',
          vendorOrParty: 'Supply Store',
          linkedAnimalId: 'a-1',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      processingLogs: [
        {
          id: 'pl-neg',
          species: 'Rabbit',
          title: 'Bad Weight',
          scheduledDateIso: '2026-08-05',
          harvestDateIso: '',
          status: 'Scheduled',
          animalCount: 0,
          liveWeightGrams: -100,
          dressedWeightGrams: -50,
          peltCount: -1,
          peltGrade: '',
          peltColorNotes: '',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });

    const repaired = repairBarnDataHealth(snapshot);
    expect(repaired.nextSnapshot.ledgerEntries?.[0]?.amountCents).toBe(0);
    expect(repaired.nextSnapshot.processingLogs?.[0]?.liveWeightGrams).toBe(0);

    const migrated = migrateAnimalsToSpecies(
      repaired.nextSnapshot,
      ['a-1'],
      'Meat Rabbit',
      { migrateEntireSpecies: true, sourceSpeciesName: 'Rabbit' }
    );
    expect(migrated.snapshot.ledgerEntries?.[0]?.species).toBe('Meat Rabbit');
    expect(migrated.snapshot.processingLogs?.[0]?.species).toBe('Meat Rabbit');
  });
});
