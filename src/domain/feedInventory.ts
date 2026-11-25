/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Feed Inventory Ledger, Tag OCR Parser & Biosecurity Auto-Purge Engine
 * (`src/domain/feedInventory.ts`).
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
