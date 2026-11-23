/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Multi-Candidate Pairing Comparison Matrix Engine (`src/core/pairingMatrix.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies so the exact
 * same comparison matrix runs offline in Web PWAs and native mobile apps.
 *
 * Design:
 * - Compares 1 anchor Dam against multiple candidate Sires, OR 1 anchor Sire against multiple
 *   candidate Dams, strictly scoped to a single species.
 * - Shares one `createSpeciesCoiEvaluator(herdById)` instance across all candidate evaluations
 *   and pre-computes anchor carrier lineage once so multi-candidate matrices stay fast on mobile.
 */

import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisksFromAnalyses,
  AnimalCarrierLineageAnalysis,
  PairingCarrierRisk,
} from './carrierGenetics';
import {
  BreedingGeneticAlert,
  PredictedPhenotypeRow,
  PunnettSimulationSummary,
  simulatePairingGenetics,
} from './geneticsEngine';
import { Animal, isAnimalArchived, isSameSpecies } from './models';
import {
  AncestorContribution,
  CoiRiskDescriptor,
  createSpeciesCoiEvaluator,
  getPedigreeCompletenessSummary,
  PedigreeCompletenessSummary,
} from './pedigreeCalculator';

export type PairingAnchorRole = 'dam' | 'sire';

export type PairingMatrixSortBy =
  | 'best_match'
  | 'coi_asc'
  | 'coi_desc'
  | 'risk_asc'
  | 'name_asc';

export const MAX_MATRIX_CANDIDATES = 40;
export const DEFAULT_MATRIX_INITIAL_SELECTION = 6;
export const TOP_BOTTLENECK_LIMIT = 3;
export const TOP_VARIETY_LIMIT = 3;

export interface PairingBottleneckSummary {
  ancestorId: string;
  name: string;
  tattoo: string;
  coiContributionPercent: number;
  sireAppearances: number;
  damAppearances: number;
}

export interface PairingRiskBadgeSummary {
  carrierDangerCount: number;
  carrierWarningCount: number;
  carrierInfoCount: number;
  geneticDangerCount: number;
  geneticWarningCount: number;
  totalDangerCount: number;
  totalWarningCount: number;
  carrierRisks: PairingCarrierRisk[];
  geneticAlerts: BreedingGeneticAlert[];
}

export interface PairingMatrixRow {
  pairKey: string;
  candidate: Animal;
  sire: Animal;
  dam: Animal;
  coiPercent: number;
  coiRisk: CoiRiskDescriptor;
  completeness: PedigreeCompletenessSummary;
  sharedAncestors: AncestorContribution[];
  topBottlenecks: PairingBottleneckSummary[];
  totalSharedAncestorCount: number;
  riskSummary: PairingRiskBadgeSummary;
  genetics: PunnettSimulationSummary;
  topVarieties: PredictedPhenotypeRow[];
  sameBreed: boolean;
  isRecommendedLowestRisk: boolean;
}

export interface PairingMatrixSummary {
  totalRequested: number;
  totalEvaluated: number;
  totalMatchingFilters: number;
  truncatedCount: number;
  lowCoiCount: number;
  dangerRiskCount: number;
  lowestCoiPercent: number | null;
  highestCoiPercent: number | null;
}

export interface PairingMatrixResult {
  anchorRole: PairingAnchorRole;
  anchor: Animal;
  speciesName: string;
  rows: PairingMatrixRow[];
  summary: PairingMatrixSummary;
}

export interface BuildPairingMatrixParams {
  anchor: Animal;
  anchorRole: PairingAnchorRole;
  candidates: Animal[];
  herdById: Map<string, Animal>;
  speciesName?: string;
  sortBy?: PairingMatrixSortBy;
  hideDangerRisks?: boolean;
  maxCoiPercent?: number | null;
  maxCandidates?: number;
}

function normalizeBreedKey(breed?: string): string {
  return (breed || '').trim().toLowerCase();
}

/**
 * Selects a sensible default candidate ID list for an anchor animal:
 * prioritizes active same-breed candidates first, then other active candidates,
 * then archived candidates, sorted alphabetically and capped at `maxInitial`.
 */
export function selectDefaultMatrixCandidateIds(
  anchor: Animal | null | undefined,
  candidates: Animal[],
  maxInitial: number = DEFAULT_MATRIX_INITIAL_SELECTION
): string[] {
  if (!anchor || candidates.length === 0 || maxInitial <= 0) return [];
  const anchorBreed = normalizeBreedKey(anchor.breed);
  const seen = new Set<string>();
  const eligible: Animal[] = [];

  for (const c of candidates) {
    if (!c || !c.id || c.id === anchor.id || seen.has(c.id)) continue;
    if (!isSameSpecies(c.species, anchor.species)) continue;
    seen.add(c.id);
    eligible.push(c);
  }

  eligible.sort((a, b) => {
    const aArchived = isAnimalArchived(a) ? 1 : 0;
    const bArchived = isAnimalArchived(b) ? 1 : 0;
    if (aArchived !== bArchived) return aArchived - bArchived;

    if (anchorBreed) {
      const aSame = normalizeBreedKey(a.breed) === anchorBreed ? 0 : 1;
      const bSame = normalizeBreedKey(b.breed) === anchorBreed ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;
    }

    return a.name.localeCompare(b.name) || a.tattoo.localeCompare(b.tattoo);
  });

  return eligible.slice(0, maxInitial).map((c) => c.id);
}

function compareMatrixRows(
  a: PairingMatrixRow,
  b: PairingMatrixRow,
  sortBy: PairingMatrixSortBy
): number {
  const byName = () =>
    a.candidate.name.localeCompare(b.candidate.name) ||
    a.candidate.tattoo.localeCompare(b.candidate.tattoo);

  if (sortBy === 'name_asc') {
    return byName();
  }
  if (sortBy === 'coi_asc') {
    if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) return a.coiPercent - b.coiPercent;
    if (a.riskSummary.totalDangerCount !== b.riskSummary.totalDangerCount) {
      return a.riskSummary.totalDangerCount - b.riskSummary.totalDangerCount;
    }
    return byName();
  }
  if (sortBy === 'coi_desc') {
    if (Math.abs(b.coiPercent - a.coiPercent) > 0.0001) return b.coiPercent - a.coiPercent;
    return byName();
  }
  if (sortBy === 'risk_asc') {
    if (a.riskSummary.totalDangerCount !== b.riskSummary.totalDangerCount) {
      return a.riskSummary.totalDangerCount - b.riskSummary.totalDangerCount;
    }
    if (a.riskSummary.totalWarningCount !== b.riskSummary.totalWarningCount) {
      return a.riskSummary.totalWarningCount - b.riskSummary.totalWarningCount;
    }
    if (a.riskSummary.carrierInfoCount !== b.riskSummary.carrierInfoCount) {
      return a.riskSummary.carrierInfoCount - b.riskSummary.carrierInfoCount;
    }
    if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) return a.coiPercent - b.coiPercent;
    return byName();
  }

  // Default: 'best_match' — safety first (zero danger flags), then lower COI %, then fewer warnings, then breed match
  if (a.riskSummary.totalDangerCount !== b.riskSummary.totalDangerCount) {
    return a.riskSummary.totalDangerCount - b.riskSummary.totalDangerCount;
  }
  if (Math.abs(a.coiPercent - b.coiPercent) > 0.0001) {
    return a.coiPercent - b.coiPercent;
  }
  if (a.riskSummary.totalWarningCount !== b.riskSummary.totalWarningCount) {
    return a.riskSummary.totalWarningCount - b.riskSummary.totalWarningCount;
  }
  if (a.sameBreed !== b.sameBreed) {
    return a.sameBreed ? -1 : 1;
  }
  return byName();
}

/**
 * Evaluates a single anchor animal (Dam or Sire) against multiple opposite-sex candidates
 * side by side, returning COI %, shared bottleneck ancestors, carrier/genetic risk flags,
 * and predicted coat varieties for each pairing.
 */
export function buildPairingComparisonMatrix(
  params: BuildPairingMatrixParams
): PairingMatrixResult {
  const {
    anchor,
    anchorRole,
    candidates,
    herdById,
    sortBy = 'best_match',
    hideDangerRisks = false,
    maxCoiPercent = null,
  } = params;

  const effectiveSpecies = params.speciesName || anchor.species || 'Rabbit';
  const candidateCap = Math.max(1, Math.min(MAX_MATRIX_CANDIDATES, params.maxCandidates ?? MAX_MATRIX_CANDIDATES));

  // Deduplicate, enforce same-species boundary, and exclude self
  const seenIds = new Set<string>();
  const validCandidates: Animal[] = [];
  for (const c of candidates) {
    if (!c || !c.id || c.id === anchor.id || seenIds.has(c.id)) continue;
    if (!isSameSpecies(c.species, effectiveSpecies)) continue;
    seenIds.add(c.id);
    validCandidates.push(c);
  }

  const totalRequested = validCandidates.length;
  const boundedCandidates = validCandidates.slice(0, candidateCap);
  const truncatedCount = Math.max(0, totalRequested - boundedCandidates.length);

  // Build species-safe map ensuring anchor and all selected candidates are present
  const evalMap = new Map<string, Animal>(herdById);
  if (!evalMap.has(anchor.id)) {
    evalMap.set(anchor.id, anchor);
  }
  for (const c of boundedCandidates) {
    if (!evalMap.has(c.id)) {
      evalMap.set(c.id, c);
    }
  }

  const coiEvaluator = createSpeciesCoiEvaluator(evalMap);
  const anchorCarrierAnalysis: AnimalCarrierLineageAnalysis = analyzeAnimalCarrierLineage(
    anchor,
    evalMap
  );
  const anchorBreedKey = normalizeBreedKey(anchor.breed);

  const allEvaluatedRows: PairingMatrixRow[] = [];

  for (const candidate of boundedCandidates) {
    const sire = anchorRole === 'dam' ? candidate : anchor;
    const dam = anchorRole === 'dam' ? anchor : candidate;

    const coi = coiEvaluator.calculatePairingCoi(sire.id, dam.id);
    const completeness = getPedigreeCompletenessSummary(coi);

    const candidateCarrierAnalysis = analyzeAnimalCarrierLineage(candidate, evalMap);
    const carrierRisks =
      anchorRole === 'dam'
        ? analyzePairingCarrierRisksFromAnalyses(candidateCarrierAnalysis, anchorCarrierAnalysis)
        : analyzePairingCarrierRisksFromAnalyses(anchorCarrierAnalysis, candidateCarrierAnalysis);

    const genetics = simulatePairingGenetics(sire, dam, effectiveSpecies);

    const carrierDangerCount = carrierRisks.filter((r) => r.severity === 'danger').length;
    const carrierWarningCount = carrierRisks.filter((r) => r.severity === 'warning').length;
    const carrierInfoCount = carrierRisks.filter((r) => r.severity === 'info').length;
    const geneticDangerCount = genetics.lethalOrHealthAlerts.filter(
      (a) => a.severity === 'danger'
    ).length;
    const geneticWarningCount = genetics.lethalOrHealthAlerts.filter(
      (a) => a.severity === 'warning'
    ).length;

    const riskSummary: PairingRiskBadgeSummary = {
      carrierDangerCount,
      carrierWarningCount,
      carrierInfoCount,
      geneticDangerCount,
      geneticWarningCount,
      totalDangerCount: carrierDangerCount + geneticDangerCount,
      totalWarningCount: carrierWarningCount + geneticWarningCount,
      carrierRisks,
      geneticAlerts: genetics.lethalOrHealthAlerts,
    };

    const topBottlenecks: PairingBottleneckSummary[] = coi.sharedAncestors
      .slice(0, TOP_BOTTLENECK_LIMIT)
      .map((sa) => ({
        ancestorId: sa.ancestor.id,
        name: sa.ancestor.name,
        tattoo: sa.ancestor.tattoo,
        coiContributionPercent: sa.coiContributionPercent,
        sireAppearances: sa.sireAppearances,
        damAppearances: sa.damAppearances,
      }));

    const candBreedKey = normalizeBreedKey(candidate.breed);
    const sameBreed = Boolean(anchorBreedKey && candBreedKey && anchorBreedKey === candBreedKey);

    allEvaluatedRows.push({
      pairKey: `${sire.id}__${dam.id}`,
      candidate,
      sire,
      dam,
      coiPercent: coi.coiPercent,
      coiRisk: coi.risk,
      completeness,
      sharedAncestors: coi.sharedAncestors,
      topBottlenecks,
      totalSharedAncestorCount: coi.sharedAncestors.length,
      riskSummary,
      genetics,
      topVarieties: genetics.predictedPhenotypes.slice(0, TOP_VARIETY_LIMIT),
      sameBreed,
      isRecommendedLowestRisk: false,
    });
  }

  // Apply optional filters
  const filteredRows = allEvaluatedRows.filter((row) => {
    if (hideDangerRisks && row.riskSummary.totalDangerCount > 0) return false;
    if (
      typeof maxCoiPercent === 'number' &&
      Number.isFinite(maxCoiPercent) &&
      row.coiPercent > maxCoiPercent + 0.0001
    ) {
      return false;
    }
    return true;
  });

  // Identify lowest-risk recommended candidate(s) across filtered rows when comparing >= 2
  if (filteredRows.length >= 2) {
    const safePool = filteredRows.filter(
      (r) => r.riskSummary.totalDangerCount === 0 && r.coiPercent < 12.5
    );
    if (safePool.length > 0) {
      const sortedSafe = [...safePool].sort((a, b) => compareMatrixRows(a, b, 'best_match'));
      const best = sortedSafe[0];
      for (const row of safePool) {
        if (
          Math.abs(row.coiPercent - best.coiPercent) <= 0.0001 &&
          row.riskSummary.totalWarningCount === best.riskSummary.totalWarningCount
        ) {
          row.isRecommendedLowestRisk = true;
        }
      }
    }
  }

  filteredRows.sort((a, b) => compareMatrixRows(a, b, sortBy));

  let lowestCoiPercent: number | null = null;
  let highestCoiPercent: number | null = null;
  let lowCoiCount = 0;
  let dangerRiskCount = 0;

  for (const row of filteredRows) {
    if (lowestCoiPercent === null || row.coiPercent < lowestCoiPercent) {
      lowestCoiPercent = row.coiPercent;
    }
    if (highestCoiPercent === null || row.coiPercent > highestCoiPercent) {
      highestCoiPercent = row.coiPercent;
    }
    if (row.coiPercent < 6.25 && row.riskSummary.totalDangerCount === 0) {
      lowCoiCount += 1;
    }
    if (row.riskSummary.totalDangerCount > 0) {
      dangerRiskCount += 1;
    }
  }

  return {
    anchorRole,
    anchor,
    speciesName: effectiveSpecies,
    rows: filteredRows,
    summary: {
      totalRequested,
      totalEvaluated: allEvaluatedRows.length,
      totalMatchingFilters: filteredRows.length,
      truncatedCount,
      lowCoiCount,
      dangerRiskCount,
      lowestCoiPercent,
      highestCoiPercent,
    },
  };
}
