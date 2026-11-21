import { describe, expect, it } from 'vitest';
import { repairBarnDataHealth } from '../dataHealthCheck';
import {
  applyFeedAllocationToBatch,
  evaluateFeedInventorySummary,
  extractFeedTagDetailsFromOcrText,
  findPurgeEligibleFeedTagPhotos,
  formatFeedLedgerCsv,
  isFeedBatchLowStock,
  purgeExpiredFeedTagPhotosPure,
  reverseFeedAllocationFromBatch,
  traceFeedLotToCagesAndLitters,
} from '../feedInventory';
import {
  FEED_MANUFACTURER_DIRECTORY,
  filterFeedManufacturerDirectory,
  matchManufacturerForBrand,
} from '../feedManufacturerDirectory';
import {
  BreedingRecord,
  CageLocation,
  FeedAllocation,
  FeedBatch,
  normalizeFeedPurgeWindowDays,
} from '../models';
import { countAllSpeciesRecords, purgeAllSpeciesRecordsPure } from '../sampleData';
import {
  exportBarnBackupJson,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot } from './testFixtures';

const TS = '2026-04-01T12:00:00.000Z';

function makeBatch(id: string, overrides: Partial<FeedBatch> = {}): FeedBatch {
  return {
    id,
    species: 'Rabbit',
    brand: 'Purina',
    productName: 'Show Hutch 17%',
    lotNumber: '4291A-0814',
    millCode: 'P12',
    manufactureDateIso: '2026-03-10',
    purchaseDateIso: '2026-03-15',
    bagCount: 2,
    bagWeightValue: 50,
    bagWeightUnit: 'lbs',
    totalQuantity: 100,
    remainingQuantity: 100,
    lowStockThreshold: 25,
    totalCostCents: 4800,
    supplierName: 'Valley Feed Co-op',
    proteinPercent: 17,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeAllocation(id: string, overrides: Partial<FeedAllocation> = {}): FeedAllocation {
  return {
    id,
    species: 'Rabbit',
    feedBatchId: 'fb-1',
    targetType: 'cage',
    targetId: 'cage-1',
    targetLabel: 'Hutch R-01',
    dateIso: '2026-03-20',
    quantity: 15,
    unit: 'lbs',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('feedInventory — OCR parsing, biosecurity purge, allocations & traceability', () => {
  it('extracts lot numbers, mill code, weights, protein %, dates, and brands from feed tag OCR text', () => {
    const sampleTag = `
      PURINA ANIMAL NUTRITION - COMPLETE SHOW RABBIT PELLET
      GUARANTEED ANALYSIS: Crude Protein (Min) 17.5%
      NET WT. 50 LB (22.68 KG)
      PLANT CODE: P12  MFG DATE: 03/14/2026
      LOT: 4291A-0814   ALT RUN: 26073K
    `;
    const parsed = extractFeedTagDetailsFromOcrText(sampleTag);
    expect(parsed.bestLotNumber).toBe('4291A-0814');
    expect(parsed.lotCandidates).toContain('26073K');
    expect(parsed.millCode).toBe('P12');
    expect(parsed.manufactureDateIso).toBe('2026-03-14');
    expect(parsed.detectedBrand).toBe('Purina Animal Nutrition');
    expect(parsed.detectedBagWeight).toEqual({ value: 50, unit: 'lbs' });
    expect(parsed.detectedProteinPercent).toBe(17.5);
  });

  it('never purges tag photos without an indexed lot number and respects 30/60/90/0 windows', () => {
    const photoUrl = 'data:image/webp;base64,' + 'A'.repeat(240);
    const thumbUrl = 'data:image/webp;base64,' + 'B'.repeat(80);

    const indexedOld = makeBatch('fb-old-indexed', {
      lotNumber: '26010A',
      millCode: 'K04',
      ocrRawText: 'LOT 26010A KALMBACH',
      tagPhotoDataUrl: photoUrl,
      tagPhotoThumbnailDataUrl: thumbUrl,
      tagPhotoBytes: 320,
      tagPhotoCapturedDateIso: '2026-01-01',
    });
    const indexedRecent = makeBatch('fb-recent-indexed', {
      lotNumber: '26085B',
      tagPhotoDataUrl: photoUrl,
      tagPhotoThumbnailDataUrl: thumbUrl,
      tagPhotoBytes: 320,
      tagPhotoCapturedDateIso: '2026-03-25',
    });
    const unindexedOld = makeBatch('fb-old-unindexed', {
      lotNumber: '',
      tagPhotoDataUrl: photoUrl,
      tagPhotoThumbnailDataUrl: thumbUrl,
      tagPhotoBytes: 320,
      tagPhotoCapturedDateIso: '2025-12-01',
    });

    const batches = [indexedOld, indexedRecent, unindexedOld];

    // Manual-only (0) disables auto-purge
    expect(normalizeFeedPurgeWindowDays(0)).toBe(0);
    expect(findPurgeEligibleFeedTagPhotos(batches, 0, '2026-04-10')).toHaveLength(0);

    // On 2026-02-15 (45 days since 2026-01-01): eligible at 30d, NOT at 60d/90d
    expect(findPurgeEligibleFeedTagPhotos(batches, 30, '2026-02-15').map((c) => c.batch.id)).toEqual([
      'fb-old-indexed',
    ]);
    expect(findPurgeEligibleFeedTagPhotos(batches, 60, '2026-02-15')).toHaveLength(0);

    // Run pure 60-day purge on 2026-04-10 (99 days old)
    const purged = purgeExpiredFeedTagPhotosPure(batches, 60, {
      todayIso: '2026-04-10',
      nowIso: '2026-04-10T10:00:00.000Z',
    });
    expect(purged.purgedCount).toBe(1);
    expect(purged.purgedBatchIds).toEqual(['fb-old-indexed']);
    expect(purged.reclaimedBytes).toBe(320);

    const updatedOld = purged.nextBatches.find((b) => b.id === 'fb-old-indexed')!;
    expect(updatedOld.tagPhotoDataUrl).toBeUndefined();
    expect(updatedOld.tagPhotoThumbnailDataUrl).toBeUndefined();
    expect(updatedOld.tagPhotoPurgedAtIso).toBe('2026-04-10T10:00:00.000Z');
    expect(updatedOld.tagPhotoBytesReclaimed).toBe(320);
    // Critical biosecurity invariant: lot metadata stays permanently intact
    expect(updatedOld.lotNumber).toBe('26010A');
    expect(updatedOld.millCode).toBe('K04');
    expect(updatedOld.ocrRawText).toBe('LOT 26010A KALMBACH');

    // Unindexed photo must remain untouched so user never loses ability to read stamp later
    const untouchedUnindexed = purged.nextBatches.find((b) => b.id === 'fb-old-unindexed')!;
    expect(untouchedUnindexed.tagPhotoDataUrl).toBe(photoUrl);
  });

  it('deducts and restores batch inventory cleanly on allocation and reversal', () => {
    const batch = makeBatch('fb-1', { totalQuantity: 100, remainingQuantity: 40, lowStockThreshold: 25 });
    const afterAlloc = applyFeedAllocationToBatch(batch, 20, '2026-04-02T00:00:00.000Z');
    expect(afterAlloc.remainingQuantity).toBe(20);
    expect(isFeedBatchLowStock(afterAlloc)).toBe(true);

    // Never drops below 0
    const overAlloc = applyFeedAllocationToBatch(afterAlloc, 50, '2026-04-02T00:01:00.000Z');
    expect(overAlloc.remainingQuantity).toBe(0);

    // Reversal caps cleanly at totalQuantity
    const restored = reverseFeedAllocationFromBatch(afterAlloc, 20, '2026-04-02T00:02:00.000Z');
    expect(restored.remainingQuantity).toBe(40);
    const capped = reverseFeedAllocationFromBatch(batch, 500, '2026-04-02T00:03:00.000Z');
    expect(capped.remainingQuantity).toBe(100);
  });

  it('isolates summary metrics per species and traces flagged lots across cages, litters, and animals', () => {
    const rabbitBatch = makeBatch('fb-r', {
      species: 'Rabbit',
      lotNumber: 'LOT-8842R',
      remainingQuantity: 20,
      lowStockThreshold: 25,
      recallFlagged: true,
      recallNote: 'Mold odor watch',
    });
    const sheepBatch = makeBatch('fb-s', {
      species: 'Sheep',
      lotNumber: 'LOT-9901S',
      totalQuantity: 200,
      remainingQuantity: 180,
    });

    const cages: CageLocation[] = [
      {
        id: 'c1',
        species: 'Rabbit',
        label: 'Hutch A-1',
        section: 'Row A',
        capacity: 1,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'c2',
        species: 'Rabbit',
        label: 'Hutch A-2',
        section: 'Row A',
        capacity: 2,
        feedLotName: 'Purina Show (LOT-8842R)',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const breedings: BreedingRecord[] = [
      {
        id: 'br1',
        species: 'Rabbit',
        femaleId: 'doe-1',
        maleId: 'buck-1',
        bredDateIso: '2026-03-01',
        expectedBirthDateIso: '2026-04-01',
        status: 'Born',
        liveCount: 6,
        stillbornCount: 0,
        fosteredCount: 0,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const animals = [makeAnimal('doe-1'), makeAnimal('buck-1')];

    const allocations: FeedAllocation[] = [
      makeAllocation('al-1', { feedBatchId: 'fb-r', targetType: 'cage', targetId: 'c1', quantity: 10 }),
      makeAllocation('al-2', {
        feedBatchId: 'fb-r',
        targetType: 'litter',
        targetId: 'br1',
        targetLabel: 'Doe 1 × Buck 1',
        quantity: 12,
      }),
      makeAllocation('al-3', {
        feedBatchId: 'fb-r',
        targetType: 'animal',
        targetId: 'doe-1',
        targetLabel: 'Doe 1',
        quantity: 5,
      }),
    ];

    const summary = evaluateFeedInventorySummary({
      batches: [rabbitBatch, sheepBatch],
      allocations,
      speciesName: 'Rabbit',
      purgeWindowDays: 60,
    });
    expect(summary.totalBatches).toBe(1);
    expect(summary.lowStockBatches).toHaveLength(1);
    expect(summary.recallFlaggedBatches).toHaveLength(1);
    expect(summary.totalAllocationsCount).toBe(3);

    const traces = traceFeedLotToCagesAndLitters({
      lotQuery: '8842R',
      batches: [rabbitBatch],
      allocations,
      cages,
      breedings,
      animals,
    });
    expect(traces).toHaveLength(1);
    expect(traces[0].hasRecallFlag).toBe(true);
    expect(traces[0].linkedCages.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(traces[0].linkedBreedings.map((b) => b.id)).toEqual(['br1']);
    expect(traces[0].linkedAnimals.map((a) => a.id)).toEqual(['doe-1']);
    expect(traces[0].totalAllocated).toBe(27);

    const csv = formatFeedLedgerCsv([rabbitBatch], allocations, 'USD');
    expect(csv).toContain('LOT-8842R');
    expect(csv).toContain('FLAGGED: Mold odor watch');
  });

  it('searches bundled offline manufacturer emergency contacts and preserves feed records in backups & health repair', () => {
    expect(FEED_MANUFACTURER_DIRECTORY.length).toBeGreaterThanOrEqual(8);
    expect(matchManufacturerForBrand('Nutrena Country Feeds')?.id).toBe('nutrena-cargill');
    expect(
      filterFeedManufacturerDirectory({ query: 'kalmbach', speciesName: 'Rabbit' }).some(
        (c) => c.id === 'kalmbach-feeds'
      )
    ).toBe(true);
    expect(
      filterFeedManufacturerDirectory({ category: 'regulatory' }).some(
        (c) => c.id === 'fda-cvm-safety-portal'
      )
    ).toBe(true);

    const batch = makeBatch('fb-backup', { lotNumber: 'K12-9012', proteinPercent: 18 });
    const alloc = makeAllocation('al-backup', { feedBatchId: 'fb-backup' });
    const snap = makeEmptySnapshot({
      settings: {
        ...makeEmptySnapshot().settings,
        feedTagPurgeWindowDays: 90,
      },
      feedBatches: [batch],
      feedAllocations: [alloc],
    });

    const json = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(json, snap.settings);
    expect(parsed.settings.feedTagPurgeWindowDays).toBe(90);
    expect(parsed.feedBatches).toHaveLength(1);
    expect(parsed.feedBatches[0].lotNumber).toBe('K12-9012');
    expect(parsed.feedAllocations).toHaveLength(1);

    const merged = mergeBarnSnapshots(makeEmptySnapshot(), parsed);
    expect(merged.snapshot.feedBatches).toHaveLength(1);
    expect(merged.snapshot.feedAllocations).toHaveLength(1);

    const repaired = repairBarnDataHealth(parsed);
    expect(repaired.nextSnapshot.feedBatches).toHaveLength(1);
    expect(countAllSpeciesRecords(parsed, 'Rabbit')).toBe(2);

    const purgedSpecies = purgeAllSpeciesRecordsPure(parsed, 'Rabbit');
    expect(purgedSpecies.nextSnapshot.feedBatches).toHaveLength(0);
    expect(purgedSpecies.nextSnapshot.feedAllocations).toHaveLength(0);
  });
});
