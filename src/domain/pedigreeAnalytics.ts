/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Founder Loss, Ancestor Genetic Contribution & Heritability Analytics Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) or framework dependencies.
 * Implements:
 * 1. Exact path-summed founder & ancestor genetic contributions (0.5^depth), Sire/Dam line splits,
 *    Lacy (1989) Effective Number of Founders (fe = 1 / sum(p_i^2)), and unknown-origin accounting.
 * 2. Herd-wide Founder Loss & Bottleneck ledger comparing historical founders vs active stock.
 * 3. Mid-Parent–Offspring (and single-parent fallback) OLS regression heritability (h²) estimates
 *    and chronological birth-year cohort genetic diversity & trait trends.
 */

import {
  Animal,
  BreedingRecord,
  CareLog,
  isAnimalArchived,
  isSameSpecies,
} from './models';
import {
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  getPedigreeCompletenessSummary,
} from './pedigreeCalculator';

export interface AncestorGeneticContributionEntry {
  animal: Animal;
  isFounder: boolean;
  contributionPercent: number; // 0..100 (sum of 0.5^depth across paths)
  sireLinePercent: number;
  damLinePercent: number;
  appearances: number;
  minDepth: number;
  maxDepth: number;
}

export interface AnimalFounderAnalysis {
  subjectId: string;
  subjectName: string;
  maxDepthAnalyzed: number;
  founders: AncestorGeneticContributionEntry[];
  topAncestors: AncestorGeneticContributionEntry[];
  knownFounderCount: number;
  knownLineagePercent: number;
  unknownOriginPercent: number;
  effectiveFoundersFe: number;
  founderBalanceRatio: number; // fe / knownFounderCount (0..1)
  dominantFounderSharePercent: number; // highest normalized share among known founders
}

export interface PairingFounderShiftAnalysis {
  sireAnalysis: AnimalFounderAnalysis;
  damAnalysis: AnimalFounderAnalysis;
  projectedOffspring: AnimalFounderAnalysis;
  sharedFounderIds: string[];
  uniqueSireFounderIds: string[];
  uniqueDamFounderIds: string[];
  projectedCoiPercent: number;
  feGainVsMeanParent: number;
}

export type FounderStatusCode = 'Active Core' | 'Endangered' | 'Lost';

export interface SpeciesFounderLedgerEntry {
  founder: Animal;
  status: FounderStatusCode;
  activeDescendantsCount: number;
  meanActiveContributionPercent: number;
  maxActiveContributionPercent: number;
  historicalDescendantsCount: number;
  isActiveAnimalItself: boolean;
}

export interface SpeciesFounderLossReport {
  speciesName: string;
  totalAnimalsCount: number;
  activeAnimalsCount: number;
  totalFoundersCount: number;
  activeFoundersCount: number;
  lostFoundersCount: number;
  endangeredFoundersCount: number;
  founderLossPercent: number;
  pooledEffectiveFoundersFe: number;
  meanAnimalEffectiveFoundersFe: number;
  meanActiveKnownLineagePercent: number;
  topBottleneckFounder: SpeciesFounderLedgerEntry | null;
  founderLedger: SpeciesFounderLedgerEntry[];
}

export type HeritabilityMethod = 'mid_parent' | 'single_parent' | 'insufficient';

export interface HeritabilityTraitEstimate {
  traitKey: 'weight_grams' | 'adg_grams_per_day' | 'litter_live_born';
  label: string;
  unitLabel: string;
  method: HeritabilityMethod;
  heritabilityH2: number | null; // Clamped [0, 1] for quantitative interpretation
  rawSlope: number | null;
  rSquared: number | null;
  pairCount: number;
  meanOffspringValue: number | null;
  meanParentValue: number | null;
  confidenceNote: string;
}

export interface CohortGeneticTrendPoint {
  year: number;
  animalCount: number;
  meanCoiPercent: number;
  meanEffectiveFoundersFe: number;
  meanKnownLineagePercent: number;
  meanWeightGrams: number | null;
  meanAdgGramsPerDay: number | null;
  cumulativeWeightH2: number | null;
  weightPairCount: number;
}

export interface SpeciesHeritabilityReport {
  speciesName: string;
  traits: HeritabilityTraitEstimate[];
  cohorts: CohortGeneticTrendPoint[];
  totalEvaluatedAnimals: number;
}

function isFounderInHerd(animal: Animal, herdById: Map<string, Animal>): boolean {
  const hasSire = Boolean(animal.sireId && animal.sireId !== animal.id && herdById.has(animal.sireId));
  const hasDam = Boolean(animal.damId && animal.damId !== animal.id && herdById.has(animal.damId));
  return !hasSire && !hasDam;
}

function isBreedingActiveAnimal(animal: Animal): boolean {
  return (
    !isAnimalArchived(animal) &&
    animal.status !== 'Sold' &&
    animal.status !== 'Deceased' &&
    !animal.culled
  );
}

interface InternalContributionAccum {
  animal: Animal;
  isFounder: boolean;
  totalFraction: number;
  sireFraction: number;
  damFraction: number;
  appearances: number;
  minDepth: number;
  maxDepth: number;
}

function accumulateLineageContributions(
  startAnimalId: string | undefined,
  initialWeight: number,
  side: 'sire' | 'dam',
  startDepth: number,
  maxDepth: number,
  herdById: Map<string, Animal>,
  visitedPath: Set<string>,
  accumMap: Map<string, InternalContributionAccum>,
  unknownAcc: { fraction: number }
): void {
  if (!startAnimalId || !herdById.has(startAnimalId) || visitedPath.has(startAnimalId)) {
    unknownAcc.fraction += initialWeight;
    return;
  }

  const walk = (nodeId: string, weight: number, depth: number) => {
    const node = herdById.get(nodeId);
    if (!node || visitedPath.has(nodeId)) {
      unknownAcc.fraction += weight;
      return;
    }

    const sireRaw = Boolean(node.sireId && node.sireId !== nodeId && herdById.has(node.sireId));
    const damRaw = Boolean(node.damId && node.damId !== nodeId && herdById.has(node.damId));
    const sireValid = sireRaw && !visitedPath.has(node.sireId);
    const damValid = damRaw && !visitedPath.has(node.damId);
    const isTerminalFounder = !sireRaw && !damRaw;

    let entry = accumMap.get(nodeId);
    if (!entry) {
      entry = {
        animal: node,
        isFounder: isTerminalFounder,
        totalFraction: 0,
        sireFraction: 0,
        damFraction: 0,
        appearances: 0,
        minDepth: depth,
        maxDepth: depth,
      };
      accumMap.set(nodeId, entry);
    } else {
      entry.minDepth = Math.min(entry.minDepth, depth);
      entry.maxDepth = Math.max(entry.maxDepth, depth);
      if (!isTerminalFounder) entry.isFounder = false;
    }

    entry.totalFraction += weight;
    if (side === 'sire') {
      entry.sireFraction += weight;
    } else {
      entry.damFraction += weight;
    }
    entry.appearances += 1;

    if (isTerminalFounder) {
      return;
    }

    if (depth >= maxDepth) {
      // Depth cutoff reached while ancestors continue; mark remaining branch as founder-boundary proxy
      entry.isFounder = true;
      return;
    }

    visitedPath.add(nodeId);
    const half = weight * 0.5;
    if (sireValid && node.sireId) {
      walk(node.sireId, half, depth + 1);
    } else {
      unknownAcc.fraction += half;
    }

    if (damValid && node.damId) {
      walk(node.damId, half, depth + 1);
    } else {
      unknownAcc.fraction += half;
    }
    visitedPath.delete(nodeId);
  };

  walk(startAnimalId, initialWeight, startDepth);
}

function finalizeFounderAnalysis(
  subjectId: string,
  subjectName: string,
  maxDepthAnalyzed: number,
  accumMap: Map<string, InternalContributionAccum>,
  unknownFraction: number
): AnimalFounderAnalysis {
  const allEntries: AncestorGeneticContributionEntry[] = Array.from(accumMap.values()).map(
    (item) => ({
      animal: item.animal,
      isFounder: item.isFounder,
      contributionPercent: item.totalFraction * 100,
      sireLinePercent: item.sireFraction * 100,
      damLinePercent: item.damFraction * 100,
      appearances: item.appearances,
      minDepth: item.minDepth,
      maxDepth: item.maxDepth,
    })
  );

  const founders = allEntries
    .filter((e) => e.isFounder)
    .sort((a, b) => b.contributionPercent - a.contributionPercent || a.minDepth - b.minDepth);

  const topAncestors = [...allEntries].sort(
    (a, b) => b.contributionPercent - a.contributionPercent || a.minDepth - b.minDepth
  );

  const rawKnownPct = founders.reduce((sum, f) => sum + f.contributionPercent, 0);
  const knownLineagePercent = Math.min(100, Math.max(0, rawKnownPct));
  const unknownOriginPercent = Math.min(100, Math.max(0, 100 - knownLineagePercent));

  let effectiveFoundersFe = 0;
  let dominantFounderSharePercent = 0;
  if (rawKnownPct > 0.0001 && founders.length > 0) {
    let sumSquares = 0;
    for (const f of founders) {
      const p = f.contributionPercent / rawKnownPct;
      sumSquares += p * p;
      const sharePct = p * 100;
      if (sharePct > dominantFounderSharePercent) {
        dominantFounderSharePercent = sharePct;
      }
    }
    effectiveFoundersFe = sumSquares > 0 ? 1 / sumSquares : 0;
  }

  // Note: When unknownFraction accounts for missing records vs founder nodes, keep balance in [0, 1].
  void unknownFraction;
  const founderBalanceRatio =
    founders.length > 0 ? Math.min(1, effectiveFoundersFe / founders.length) : 0;

  return {
    subjectId,
    subjectName,
    maxDepthAnalyzed,
    founders,
    topAncestors,
    knownFounderCount: founders.length,
    knownLineagePercent,
    unknownOriginPercent,
    effectiveFoundersFe,
    founderBalanceRatio,
    dominantFounderSharePercent,
  };
}

/**
 * Computes exact path-summed founder & ancestor genetic contributions for an individual `Animal`.
 */
export function analyzeAnimalFounderContributions(
  subject: Animal,
  herdById: Map<string, Animal>,
  options?: { maxDepth?: number }
): AnimalFounderAnalysis {
  const maxDepth = Math.min(12, Math.max(3, Math.round(options?.maxDepth ?? 10)));
  const accumMap = new Map<string, InternalContributionAccum>();
  const unknownAcc = { fraction: 0 };
  const visited = new Set<string>([subject.id]);

  accumulateLineageContributions(
    subject.sireId,
    0.5,
    'sire',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );
  accumulateLineageContributions(
    subject.damId,
    0.5,
    'dam',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );

  return finalizeFounderAnalysis(subject.id, subject.name, maxDepth, accumMap, unknownAcc.fraction);
}

/**
 * Projects founder contributions, effective founders (fe), and unique/shared founder overlap
 * for a hypothetical Sire × Dam pairing.
 */
export function analyzePairingFounderShift(
  sire: Animal,
  dam: Animal,
  herdById: Map<string, Animal>,
  options?: { maxDepth?: number }
): PairingFounderShiftAnalysis {
  const maxDepth = Math.min(12, Math.max(3, Math.round(options?.maxDepth ?? 10)));
  const sireAnalysis = analyzeAnimalFounderContributions(sire, herdById, { maxDepth });
  const damAnalysis = analyzeAnimalFounderContributions(dam, herdById, { maxDepth });

  const accumMap = new Map<string, InternalContributionAccum>();
  const unknownAcc = { fraction: 0 };
  const visited = new Set<string>();

  accumulateLineageContributions(
    sire.id,
    0.5,
    'sire',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );
  accumulateLineageContributions(
    dam.id,
    0.5,
    'dam',
    1,
    maxDepth,
    herdById,
    visited,
    accumMap,
    unknownAcc
  );

  const projectedOffspring = finalizeFounderAnalysis(
    `pairing:${sire.id}x${dam.id}`,
    `${sire.name} × ${dam.name}`,
    maxDepth,
    accumMap,
    unknownAcc.fraction
  );

  const sireFounderIds = new Set(sireAnalysis.founders.map((f) => f.animal.id));
  const damFounderIds = new Set(damAnalysis.founders.map((f) => f.animal.id));
  const sharedFounderIds: string[] = [];
  const uniqueSireFounderIds: string[] = [];
  const uniqueDamFounderIds: string[] = [];

  for (const id of sireFounderIds) {
    if (damFounderIds.has(id)) {
      sharedFounderIds.push(id);
    } else {
      uniqueSireFounderIds.push(id);
    }
  }
  for (const id of damFounderIds) {
    if (!sireFounderIds.has(id)) {
      uniqueDamFounderIds.push(id);
    }
  }

  const coi = calculatePairingCoi(sire.id, dam.id, herdById);
  const parentFeSamples = [sireAnalysis.effectiveFoundersFe, damAnalysis.effectiveFoundersFe].filter(
    (v) => v > 0
  );
  const meanParentFe =
    parentFeSamples.length > 0
      ? parentFeSamples.reduce((a, b) => a + b, 0) / parentFeSamples.length
      : 0;

  return {
    sireAnalysis,
    damAnalysis,
    projectedOffspring,
    sharedFounderIds,
    uniqueSireFounderIds,
    uniqueDamFounderIds,
    projectedCoiPercent: coi.coiPercent,
    feGainVsMeanParent: projectedOffspring.effectiveFoundersFe - meanParentFe,
  };
}

/**
 * Evaluates herd-wide Founder Loss, Active Gene-Pool Retention, and Dominant Founder Bottlenecks
 * strictly scoped to a single species.
 */
export function analyzeSpeciesFounderLoss(
  animals: Animal[],
  speciesName: string,
  options?: { maxDepth?: number }
): SpeciesFounderLossReport {
  const herdById = buildSpeciesHerdMap(animals, speciesName);
  const speciesAnimals = Array.from(herdById.values());
  const activeAnimals = speciesAnimals.filter(isBreedingActiveAnimal);
  const maxDepth = Math.min(12, Math.max(3, Math.round(options?.maxDepth ?? 10)));

  // Identify all founders in the species (animals with no known parents in herdById)
  const founderIds = new Set<string>();
  for (const animal of speciesAnimals) {
    if (isFounderInHerd(animal, herdById)) {
      founderIds.add(animal.id);
    }
  }

  const activeDescendantSetByFounder = new Map<string, Set<string>>();
  const historicalDescendantSetByFounder = new Map<string, Set<string>>();
  const activeContributionSumByFounder = new Map<string, number>();
  const activeContributionMaxByFounder = new Map<string, number>();

  for (const fId of founderIds) {
    activeDescendantSetByFounder.set(fId, new Set());
    historicalDescendantSetByFounder.set(fId, new Set());
    activeContributionSumByFounder.set(fId, 0);
    activeContributionMaxByFounder.set(fId, 0);
  }

  // Evaluate historical descendants
  for (const animal of speciesAnimals) {
    const analysis = analyzeAnimalFounderContributions(animal, herdById, { maxDepth });
    for (const f of analysis.founders) {
      if (!founderIds.has(f.animal.id)) {
        founderIds.add(f.animal.id);
        activeDescendantSetByFounder.set(f.animal.id, new Set());
        historicalDescendantSetByFounder.set(f.animal.id, new Set());
        activeContributionSumByFounder.set(f.animal.id, 0);
        activeContributionMaxByFounder.set(f.animal.id, 0);
      }
      historicalDescendantSetByFounder.get(f.animal.id)!.add(animal.id);
    }
  }

  // Evaluate active breeding stock representation
  let activeFeSum = 0;
  let activeFeCount = 0;
  let activeKnownLineageSum = 0;

  for (const active of activeAnimals) {
    if (founderIds.has(active.id)) {
      // An active founder carries 100% of its own founding genome in the active pool
      activeDescendantSetByFounder.get(active.id)!.add(active.id);
      activeContributionSumByFounder.set(
        active.id,
        (activeContributionSumByFounder.get(active.id) ?? 0) + 100
      );
      activeContributionMaxByFounder.set(
        active.id,
        Math.max(activeContributionMaxByFounder.get(active.id) ?? 0, 100)
      );
      activeKnownLineageSum += 100;
      activeFeSum += 1;
      activeFeCount += 1;
      continue;
    }

    const analysis = analyzeAnimalFounderContributions(active, herdById, { maxDepth });
    activeKnownLineageSum += analysis.knownLineagePercent;
    if (analysis.effectiveFoundersFe > 0) {
      activeFeSum += analysis.effectiveFoundersFe;
      activeFeCount += 1;
    }

    for (const f of analysis.founders) {
      activeDescendantSetByFounder.get(f.animal.id)?.add(active.id);
      activeContributionSumByFounder.set(
        f.animal.id,
        (activeContributionSumByFounder.get(f.animal.id) ?? 0) + f.contributionPercent
      );
      activeContributionMaxByFounder.set(
        f.animal.id,
        Math.max(activeContributionMaxByFounder.get(f.animal.id) ?? 0, f.contributionPercent)
      );
    }
  }

  const activeDenom = Math.max(1, activeAnimals.length);
  const ledger: SpeciesFounderLedgerEntry[] = [];
  let activeFoundersCount = 0;
  let lostFoundersCount = 0;
  let endangeredFoundersCount = 0;
  let totalMeanContribAcrossFounders = 0;

  for (const fId of founderIds) {
    const founder = herdById.get(fId);
    if (!founder) continue;
    const activeDescCount = activeDescendantSetByFounder.get(fId)?.size ?? 0;
    const histDescCount = historicalDescendantSetByFounder.get(fId)?.size ?? 0;
    const isSelfActive = isBreedingActiveAnimal(founder);
    const meanActivePct = (activeContributionSumByFounder.get(fId) ?? 0) / activeDenom;
    const maxActivePct = activeContributionMaxByFounder.get(fId) ?? 0;

    let status: FounderStatusCode;
    if (activeDescCount === 0 && !isSelfActive) {
      status = 'Lost';
      lostFoundersCount += 1;
    } else if (activeDescCount <= 1 || meanActivePct < 2.0) {
      status = 'Endangered';
      activeFoundersCount += 1;
      endangeredFoundersCount += 1;
    } else {
      status = 'Active Core';
      activeFoundersCount += 1;
    }

    totalMeanContribAcrossFounders += meanActivePct;

    ledger.push({
      founder,
      status,
      activeDescendantsCount: activeDescCount,
      meanActiveContributionPercent: meanActivePct,
      maxActiveContributionPercent: maxActivePct,
      historicalDescendantsCount: histDescCount,
      isActiveAnimalItself: isSelfActive,
    });
  }

  ledger.sort(
    (a, b) =>
      b.meanActiveContributionPercent - a.meanActiveContributionPercent ||
      b.historicalDescendantsCount - a.historicalDescendantsCount ||
      a.founder.name.localeCompare(b.founder.name)
  );

  let pooledEffectiveFoundersFe = 0;
  if (totalMeanContribAcrossFounders > 0.0001) {
    let sumSq = 0;
    for (const row of ledger) {
      if (row.meanActiveContributionPercent <= 0) continue;
      const p = row.meanActiveContributionPercent / totalMeanContribAcrossFounders;
      sumSq += p * p;
    }
    pooledEffectiveFoundersFe = sumSq > 0 ? 1 / sumSq : 0;
  }

  const totalFoundersCount = ledger.length;
  const founderLossPercent =
    totalFoundersCount > 0 ? (lostFoundersCount / totalFoundersCount) * 100 : 0;

  return {
    speciesName,
    totalAnimalsCount: speciesAnimals.length,
    activeAnimalsCount: activeAnimals.length,
    totalFoundersCount,
    activeFoundersCount,
    lostFoundersCount,
    endangeredFoundersCount,
    founderLossPercent,
    pooledEffectiveFoundersFe,
    meanAnimalEffectiveFoundersFe: activeFeCount > 0 ? activeFeSum / activeFeCount : 0,
    meanActiveKnownLineagePercent:
      activeAnimals.length > 0 ? activeKnownLineageSum / activeAnimals.length : 0,
    topBottleneckFounder:
      ledger.find((entry) => entry.meanActiveContributionPercent > 0) ?? null,
    founderLedger: ledger,
  };
}

function parseIsoUtcMs(iso: string | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return null;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt.getTime();
}

function computeLinearRegression(
  xs: number[],
  ys: number[]
): { slope: number; rSquared: number | null } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX <= 1e-9) return null;
  const slope = cov / varX;
  const rSquared = varY > 1e-9 ? Math.min(1, Math.max(0, (cov * cov) / (varX * varY))) : null;
  return { slope, rSquared };
}

function resolveAnimalLatestWeightGrams(
  animal: Animal,
  careLogsByAnimalId: Map<string, CareLog[]>
): number | null {
  const logs = careLogsByAnimalId.get(animal.id) ?? [];
  for (let i = logs.length - 1; i >= 0; i--) {
    if (Number.isFinite(logs[i].weightGrams) && logs[i].weightGrams > 0) {
      return logs[i].weightGrams;
    }
  }
  if (Number.isFinite(animal.weightGrams) && animal.weightGrams > 0) {
    return animal.weightGrams;
  }
  return null;
}

function resolveAnimalAdgGramsPerDay(
  animal: Animal,
  careLogsByAnimalId: Map<string, CareLog[]>
): number | null {
  const logs = (careLogsByAnimalId.get(animal.id) ?? [])
    .filter((l) => Number.isFinite(l.weightGrams) && l.weightGrams > 0 && parseIsoUtcMs(l.dateIso) !== null)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  if (logs.length >= 2) {
    const first = logs[0];
    const last = logs[logs.length - 1];
    const t0 = parseIsoUtcMs(first.dateIso)!;
    const t1 = parseIsoUtcMs(last.dateIso)!;
    const days = Math.round((t1 - t0) / 86_400_000);
    if (days >= 7) {
      return (last.weightGrams - first.weightGrams) / days;
    }
  }

  const birthMs = parseIsoUtcMs(animal.birthDateIso);
  if (birthMs !== null && logs.length >= 1) {
    const last = logs[logs.length - 1];
    const t1 = parseIsoUtcMs(last.dateIso)!;
    const ageDays = Math.round((t1 - birthMs) / 86_400_000);
    if (ageDays >= 14) {
      return last.weightGrams / ageDays;
    }
  }

  return null;
}

function estimateTraitHeritability(params: {
  traitKey: HeritabilityTraitEstimate['traitKey'];
  label: string;
  unitLabel: string;
  animals: Animal[];
  herdById: Map<string, Animal>;
  getTraitValue: (animal: Animal) => number | null;
}): HeritabilityTraitEstimate {
  const midParentXs: number[] = [];
  const midParentYs: number[] = [];
  const singleParentXs: number[] = [];
  const singleParentYs: number[] = [];

  for (const offspring of params.animals) {
    const y = params.getTraitValue(offspring);
    if (y === null || !Number.isFinite(y)) continue;

    const sire = offspring.sireId ? params.herdById.get(offspring.sireId) : undefined;
    const dam = offspring.damId ? params.herdById.get(offspring.damId) : undefined;
    const sVal = sire ? params.getTraitValue(sire) : null;
    const dVal = dam ? params.getTraitValue(dam) : null;

    if (sVal !== null && dVal !== null) {
      midParentXs.push((sVal + dVal) * 0.5);
      midParentYs.push(y);
    } else if (dVal !== null) {
      singleParentXs.push(dVal);
      singleParentYs.push(y);
    } else if (sVal !== null) {
      singleParentXs.push(sVal);
      singleParentYs.push(y);
    }
  }

  if (midParentXs.length >= 3) {
    const reg = computeLinearRegression(midParentXs, midParentYs);
    if (reg) {
      const h2 = Math.min(1, Math.max(0, reg.slope));
      const meanP = midParentXs.reduce((a, b) => a + b, 0) / midParentXs.length;
      const meanO = midParentYs.reduce((a, b) => a + b, 0) / midParentYs.length;
      return {
        traitKey: params.traitKey,
        label: params.label,
        unitLabel: params.unitLabel,
        method: 'mid_parent',
        heritabilityH2: h2,
        rawSlope: reg.slope,
        rSquared: reg.rSquared,
        pairCount: midParentXs.length,
        meanOffspringValue: meanO,
        meanParentValue: meanP,
        confidenceNote:
          midParentXs.length >= 8
            ? `Observed mid-parent regression (${midParentXs.length} family pairs)`
            : `Provisional mid-parent regression (${midParentXs.length} pairs; 8+ recommended)`,
      };
    }
  }

  if (singleParentXs.length >= 3) {
    const reg = computeLinearRegression(singleParentXs, singleParentYs);
    if (reg) {
      const h2 = Math.min(1, Math.max(0, reg.slope * 2));
      const meanP = singleParentXs.reduce((a, b) => a + b, 0) / singleParentXs.length;
      const meanO = singleParentYs.reduce((a, b) => a + b, 0) / singleParentYs.length;
      return {
        traitKey: params.traitKey,
        label: params.label,
        unitLabel: params.unitLabel,
        method: 'single_parent',
        heritabilityH2: h2,
        rawSlope: reg.slope,
        rSquared: reg.rSquared,
        pairCount: singleParentXs.length,
        meanOffspringValue: meanO,
        meanParentValue: meanP,
        confidenceNote: `Single-parent regression 2b (${singleParentXs.length} pairs; mid-parent preferred)`,
      };
    }
  }

  const totalKnownPairs = Math.max(midParentXs.length, singleParentXs.length);
  return {
    traitKey: params.traitKey,
    label: params.label,
    unitLabel: params.unitLabel,
    method: 'insufficient',
    heritabilityH2: null,
    rawSlope: null,
    rSquared: null,
    pairCount: totalKnownPairs,
    meanOffspringValue: null,
    meanParentValue: null,
    confidenceNote:
      totalKnownPairs === 0
        ? 'No parent-offspring trait pairs recorded yet.'
        : `Need at least 3 parent-offspring pairs (${totalKnownPairs} recorded).`,
  };
}

/**
 * Computes narrow-sense heritability (h²) estimates and chronological birth-year cohort
 * diversity/trait trends for a species using recorded herd weights, CareLogs, and litter outcomes.
 */
export function analyzeSpeciesHeritabilityTrends(params: {
  animals: Animal[];
  breedings: BreedingRecord[];
  careLogs: CareLog[];
  speciesName: string;
}): SpeciesHeritabilityReport {
  const herdById = buildSpeciesHerdMap(params.animals, params.speciesName);
  const speciesAnimals = Array.from(herdById.values());

  const careLogsByAnimalId = new Map<string, CareLog[]>();
  for (const log of params.careLogs) {
    if (!isSameSpecies(log.species, params.speciesName)) continue;
    const list = careLogsByAnimalId.get(log.animalId) ?? [];
    list.push(log);
    careLogsByAnimalId.set(log.animalId, list);
  }
  for (const list of careLogsByAnimalId.values()) {
    list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  }

  // Build per-dam average live-born litter size map from Born/Weaned breedings
  const damLitterCounts = new Map<string, { sum: number; count: number }>();
  for (const b of params.breedings) {
    if (!isSameSpecies(b.species, params.speciesName)) continue;
    if (b.status !== 'Born' && b.status !== 'Weaned') continue;
    if (!b.damId) continue;
    const prev = damLitterCounts.get(b.damId) ?? { sum: 0, count: 0 };
    prev.sum += Math.max(0, b.liveCount || 0);
    prev.count += 1;
    damLitterCounts.set(b.damId, prev);
  }

  const weightCache = new Map<string, number | null>();
  const getWeight = (a: Animal): number | null => {
    if (weightCache.has(a.id)) return weightCache.get(a.id)!;
    const val = resolveAnimalLatestWeightGrams(a, careLogsByAnimalId);
    weightCache.set(a.id, val);
    return val;
  };

  const adgCache = new Map<string, number | null>();
  const getAdg = (a: Animal): number | null => {
    if (adgCache.has(a.id)) return adgCache.get(a.id)!;
    const val = resolveAnimalAdgGramsPerDay(a, careLogsByAnimalId);
    adgCache.set(a.id, val);
    return val;
  };

  const getLitterSize = (a: Animal): number | null => {
    const rec = damLitterCounts.get(a.id);
    if (!rec || rec.count === 0) return null;
    return rec.sum / rec.count;
  };

  const weightTrait = estimateTraitHeritability({
    traitKey: 'weight_grams',
    label: 'Adult / Recorded Weight',
    unitLabel: 'g',
    animals: speciesAnimals,
    herdById,
    getTraitValue: getWeight,
  });

  const adgTrait = estimateTraitHeritability({
    traitKey: 'adg_grams_per_day',
    label: 'Average Daily Gain (ADG)',
    unitLabel: 'g/day',
    animals: speciesAnimals,
    herdById,
    getTraitValue: getAdg,
  });

  const litterTrait = estimateTraitHeritability({
    traitKey: 'litter_live_born',
    label: 'Litter Size (Live Born)',
    unitLabel: 'offspring',
    animals: speciesAnimals,
    herdById,
    getTraitValue: getLitterSize,
  });

  // Group animals by birth year for chronological diversity & h² trend
  const byYear = new Map<number, Animal[]>();
  for (const a of speciesAnimals) {
    const match = /^(\d{4})-\d{2}-\d{2}$/.exec((a.birthDateIso || '').trim());
    if (!match) continue;
    const year = Number(match[1]);
    if (!Number.isFinite(year) || year < 1950 || year > 2100) continue;
    const arr = byYear.get(year) ?? [];
    arr.push(a);
    byYear.set(year, arr);
  }

  const sortedYears = Array.from(byYear.keys()).sort((a, b) => a - b);
  const cumulativeAnimals: Animal[] = [];
  const cohorts: CohortGeneticTrendPoint[] = [];

  for (const year of sortedYears) {
    const cohortAnimals = byYear.get(year)!;
    cumulativeAnimals.push(...cohortAnimals);

    let coiSum = 0;
    let knownPctSum = 0;
    let feSum = 0;
    let feCount = 0;
    let weightSum = 0;
    let weightCount = 0;
    let adgSum = 0;
    let adgCount = 0;

    for (const a of cohortAnimals) {
      const coi = calculateAnimalCoi(a, herdById);
      const comp = getPedigreeCompletenessSummary(coi);
      const founderInfo = analyzeAnimalFounderContributions(a, herdById, { maxDepth: 8 });
      coiSum += coi.coiPercent;
      knownPctSum += comp.percent3Gen;
      if (founderInfo.effectiveFoundersFe > 0) {
        feSum += founderInfo.effectiveFoundersFe;
        feCount += 1;
      }
      const w = getWeight(a);
      if (w !== null) {
        weightSum += w;
        weightCount += 1;
      }
      const adg = getAdg(a);
      if (adg !== null) {
        adgSum += adg;
        adgCount += 1;
      }
    }

    const cumulativeWeightEst = estimateTraitHeritability({
      traitKey: 'weight_grams',
      label: 'Weight',
      unitLabel: 'g',
      animals: cumulativeAnimals,
      herdById,
      getTraitValue: getWeight,
    });

    cohorts.push({
      year,
      animalCount: cohortAnimals.length,
      meanCoiPercent: coiSum / cohortAnimals.length,
      meanEffectiveFoundersFe: feCount > 0 ? feSum / feCount : 0,
      meanKnownLineagePercent: knownPctSum / cohortAnimals.length,
      meanWeightGrams: weightCount > 0 ? weightSum / weightCount : null,
      meanAdgGramsPerDay: adgCount > 0 ? adgSum / adgCount : null,
      cumulativeWeightH2: cumulativeWeightEst.heritabilityH2,
      weightPairCount: cumulativeWeightEst.pairCount,
    });
  }

  return {
    speciesName: params.speciesName,
    traits: [weightTrait, adgTrait, litterTrait],
    cohorts,
    totalEvaluatedAnimals: speciesAnimals.length,
  };
}
