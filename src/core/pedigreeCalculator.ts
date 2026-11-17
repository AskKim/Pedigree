/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Recursive Pedigree Tree & Exact Wright's Coefficient of Inbreeding (COI) Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero DOM or platform dependencies.
 *
 * Implements:
 * 1. Exact Wright coancestry/kinship recursion with topological ranking and cycle guards:
 *    - F(X) = kinship(sire(X), dam(X))
 *    - kinship(i, i) = 0.5 * (1 + F(i))
 *    - kinship(i, j) = 0.5 * (kinship(sire(i), j) + kinship(dam(i), j))
 * 2. Wright path-based common ancestor contribution breakdown for breeder transparency.
 * 3. Strict species-boundary enforcement so animals of one species can never pollute
 *    pedigrees or parent candidate lists of another species.
 */

import { Animal, BiologicalSex, isSameSpecies, SpeciesProfile } from './models';

export type CoiRiskCode = 'OUTCROSS' | 'LOW' | 'MODERATE' | 'LINEBRED' | 'HIGH';

export interface CoiRiskDescriptor {
  code: CoiRiskCode;
  label: string;
  guidance: string;
}

export interface AncestorContribution {
  ancestor: Animal;
  coiContributionPercent: number;
  sireAppearances: number;
  damAppearances: number;
}

export interface CoiAnalysis {
  coiFraction: number;
  coiPercent: number;
  risk: CoiRiskDescriptor;
  sharedAncestors: AncestorContribution[];
  knownAncestorsIn3Gen: number;
  knownAncestorsIn4Gen: number;
}

export interface PedigreeSlot {
  generation: number; // 0 = subject, 1 = parents, 2 = grandparents, 3 = great-grandparents, 4 = G4
  slotIndex: number; // 0..(2^generation - 1)
  animal: Animal | null;
  roleLabel: string;
  occurrenceCount: number;
  childAnimalId: string;
  expectedSex: BiologicalSex;
}

/**
 * Classifies a COI percentage into standard breeder risk tiers.
 */
export function describeCoiRisk(percent: number): CoiRiskDescriptor {
  if (percent <= 0.0001) {
    return {
      code: 'OUTCROSS',
      label: 'Outcross',
      guidance: 'Zero shared ancestry detected across recorded generations.',
    };
  }
  if (percent < 6.25) {
    return {
      code: 'LOW',
      label: 'Low Inbreeding',
      guidance: 'High genetic diversity (< 6.25%, lighter than first cousins).',
    };
  }
  if (percent < 12.5) {
    return {
      code: 'MODERATE',
      label: 'Mild Linebreeding',
      guidance: 'Comparable to first-cousin or great-grandparent linebreeding (6.25% – 12.4%).',
    };
  }
  if (percent < 25.0) {
    return {
      code: 'LINEBRED',
      label: 'Close Linebreeding',
      guidance: 'Comparable to half-sibling or grandparent pairing (12.5% – 24.9%). Monitor vigor.',
    };
  }
  return {
    code: 'HIGH',
    label: 'Close Inbreeding',
    guidance: 'Comparable to parent-offspring or full-sibling pairing (>= 25%). High homozygosity.',
  };
}

export interface PedigreeCompletenessSummary {
  known3Gen: number;
  max3Gen: number;
  known4Gen: number;
  max4Gen: number;
  percent3Gen: number;
  isSparsePedigree: boolean;
  isIncompleteZeroOutcross: boolean;
}

/**
 * Summarizes recorded pedigree depth alongside a `CoiAnalysis` so breeders can distinguish
 * a true outcross (complete 3-generation pedigree with 0% overlap) from an incomplete pedigree
 * that simply lacks ancestor records.
 */
export function getPedigreeCompletenessSummary(
  coi: Pick<CoiAnalysis, 'coiPercent' | 'knownAncestorsIn3Gen' | 'knownAncestorsIn4Gen'>
): PedigreeCompletenessSummary {
  const max3Gen = 14;
  const max4Gen = 30;
  const known3Gen = Math.max(0, Math.min(max3Gen, coi.knownAncestorsIn3Gen || 0));
  const known4Gen = Math.max(0, Math.min(max4Gen, coi.knownAncestorsIn4Gen || 0));
  const percent3Gen = Math.round((known3Gen / max3Gen) * 100);
  const isIncompleteZeroOutcross = (coi.coiPercent || 0) <= 0.0001 && known3Gen < max3Gen;
  return {
    known3Gen,
    max3Gen,
    known4Gen,
    max4Gen,
    percent3Gen,
    isSparsePedigree: known3Gen < 6,
    isIncompleteZeroOutcross,
  };
}

/**
 * Builds an ID lookup map strictly scoped to a single livestock species.
 */
export function buildSpeciesHerdMap(
  animals: Animal[],
  speciesName: string
): Map<string, Animal> {
  const map = new Map<string, Animal>();
  for (const animal of animals) {
    if (isSameSpecies(animal.species, speciesName)) {
      map.set(animal.id, animal);
    }
  }
  return map;
}

/**
 * Checks whether assigning `candidateAncestorId` as a parent of `childId` would introduce a cycle.
 */
export function wouldCreateCycle(
  childId: string,
  candidateAncestorId: string,
  herdById: Map<string, Animal>
): boolean {
  if (!childId || !candidateAncestorId) return false;
  if (childId === candidateAncestorId) return true;

  const visited = new Set<string>();
  const stack = [candidateAncestorId];

  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === childId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);

    const rec = herdById.get(curr);
    if (!rec) continue;
    if (rec.sireId && herdById.has(rec.sireId)) stack.push(rec.sireId);
    if (rec.damId && herdById.has(rec.damId)) stack.push(rec.damId);
  }
  return false;
}

/**
 * Internal memoized tabular coancestry engine with topological depth ordering.
 */
class CoancestryEngine {
  private readonly topoRank = new Map<string, number>();
  private readonly fMemo = new Map<string, number>();
  private readonly phiMemo = new Map<string, number>();

  constructor(private readonly herdById: Map<string, Animal>) {}

  private rankOf(id: string, visiting: Set<string> = new Set()): number {
    const cached = this.topoRank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard

    visiting.add(id);
    const animal = this.herdById.get(id);
    let rank = 0;
    if (animal) {
      const sRank = animal.sireId ? this.rankOf(animal.sireId, visiting) : -1;
      const dRank = animal.damId ? this.rankOf(animal.damId, visiting) : -1;
      rank = Math.max(sRank, dRank) + 1;
    }
    visiting.delete(id);
    this.topoRank.set(id, rank);
    return rank;
  }

  inbreeding(id: string, activeCalls: Set<string> = new Set()): number {
    if (!id) return 0;
    const cached = this.fMemo.get(id);
    if (cached !== undefined) return cached;

    const animal = this.herdById.get(id);
    const f =
      !animal || !animal.sireId || !animal.damId
        ? 0
        : this.kinship(animal.sireId, animal.damId, activeCalls);
    this.fMemo.set(id, f);
    return f;
  }

  kinship(a: string, b: string, activeCalls: Set<string> = new Set()): number {
    if (!a || !b) return 0;
    if (!this.herdById.has(a) || !this.herdById.has(b)) return 0;

    const key = a <= b ? `${a}|${b}` : `${b}|${a}`;
    const cached = this.phiMemo.get(key);
    if (cached !== undefined) return cached;
    if (activeCalls.has(key)) return 0; // cycle guard

    activeCalls.add(key);
    let result = 0;

    if (a === b) {
      result = 0.5 * (1 + this.inbreeding(a, activeCalls));
    } else {
      const rA = this.rankOf(a);
      const rB = this.rankOf(b);
      const expandId = rA > rB ? a : rB > rA ? b : a > b ? a : b;
      const otherId = expandId === a ? b : a;
      const animal = this.herdById.get(expandId);
      if (animal) {
        const s = animal.sireId ? this.kinship(animal.sireId, otherId, activeCalls) : 0;
        const d = animal.damId ? this.kinship(animal.damId, otherId, activeCalls) : 0;
        result = 0.5 * (s + d);
      }
    }

    activeCalls.delete(key);
    this.phiMemo.set(key, result);
    return result;
  }
}

function countDirectAncestors(
  animalId: string,
  herdById: Map<string, Animal>,
  depth: number,
  overrideAnimal?: Animal,
  visitedPath: Set<string> = new Set()
): number {
  if (depth <= 0) return 0;
  const effectiveId = overrideAnimal?.id || animalId;
  if (effectiveId && visitedPath.has(effectiveId)) return 0;
  const animal = overrideAnimal ?? herdById.get(animalId);
  if (!animal) return 0;

  if (effectiveId) visitedPath.add(effectiveId);
  let total = 0;
  if (animal.sireId && herdById.has(animal.sireId) && !visitedPath.has(animal.sireId)) {
    total += 1 + countDirectAncestors(animal.sireId, herdById, depth - 1, undefined, visitedPath);
  }
  if (animal.damId && herdById.has(animal.damId) && !visitedPath.has(animal.damId)) {
    total += 1 + countDirectAncestors(animal.damId, herdById, depth - 1, undefined, visitedPath);
  }
  if (effectiveId) visitedPath.delete(effectiveId);
  return total;
}

function countSubtree(rootId: string, herdById: Map<string, Animal>, depthRemaining: number): number {
  if (!rootId || !herdById.has(rootId)) return 0;
  return 1 + countDirectAncestors(rootId, herdById, depthRemaining - 1);
}

function collectSimplePaths(
  startId: string,
  herdById: Map<string, Animal>,
  maxDepth: number
): Map<string, string[][]> {
  const result = new Map<string, string[][]>();
  if (!herdById.has(startId)) return result;

  const dfs = (currId: string, path: string[]) => {
    const list = result.get(currId) ?? [];
    list.push([...path]);
    result.set(currId, list);

    if (path.length > maxDepth) return;
    const animal = herdById.get(currId);
    if (!animal) return;

    if (animal.sireId && herdById.has(animal.sireId) && !path.includes(animal.sireId)) {
      path.push(animal.sireId);
      dfs(animal.sireId, path);
      path.pop();
    }
    if (animal.damId && herdById.has(animal.damId) && !path.includes(animal.damId)) {
      path.push(animal.damId);
      dfs(animal.damId, path);
      path.pop();
    }
  };

  dfs(startId, [startId]);
  return result;
}

function computeCommonAncestorContributions(
  sireId: string,
  damId: string,
  herdById: Map<string, Animal>,
  engine: CoancestryEngine,
  sirePathsOverride?: Map<string, string[][]>,
  damPathsOverride?: Map<string, string[][]>
): AncestorContribution[] {
  const sirePaths = sirePathsOverride ?? collectSimplePaths(sireId, herdById, 8);
  const damPaths = damPathsOverride ?? collectSimplePaths(damId, herdById, 8);

  const contributions: AncestorContribution[] = [];
  for (const [ancestorId, sList] of sirePaths.entries()) {
    const dList = damPaths.get(ancestorId);
    if (!dList) continue;
    const ancestor = herdById.get(ancestorId);
    if (!ancestor) continue;

    const fA = engine.inbreeding(ancestorId);
    let sum = 0;

    for (const sp of sList) {
      const sInternal = new Set(sp.slice(0, -1));
      for (const dp of dList) {
        const dInternal = dp.slice(0, -1);
        const overlaps = dInternal.some((id) => sInternal.has(id));
        if (!overlaps) {
          const n1 = sp.length - 1;
          const n2 = dp.length - 1;
          sum += Math.pow(0.5, n1 + n2 + 1) * (1 + fA);
        }
      }
    }

    if (sum > 0) {
      contributions.push({
        ancestor,
        coiContributionPercent: sum * 100,
        sireAppearances: sList.length,
        damAppearances: dList.length,
      });
    }
  }

  return contributions.sort((a, b) => b.coiContributionPercent - a.coiContributionPercent);
}

export interface SpeciesCoiEvaluator {
  calculatePairingCoi: (
    sireId: string,
    damId: string,
    overrideSubject?: Animal
  ) => CoiAnalysis;
  calculateAnimalCoi: (animal: Animal) => CoiAnalysis;
}

/**
 * Creates a reusable per-species COI evaluator that shares one `CoancestryEngine`
 * and caches ancestor simple paths & subtree counts across batch calculations
 * (such as herd-wide COI maps or Breed-With pairing matrices).
 */
export function createSpeciesCoiEvaluator(
  herdById: Map<string, Animal>
): SpeciesCoiEvaluator {
  const engine = new CoancestryEngine(herdById);
  const pathsCache = new Map<string, Map<string, string[][]>>();
  const subtree3Cache = new Map<string, number>();
  const subtree4Cache = new Map<string, number>();

  const getPaths = (id: string): Map<string, string[][]> => {
    let cached = pathsCache.get(id);
    if (!cached) {
      cached = collectSimplePaths(id, herdById, 8);
      pathsCache.set(id, cached);
    }
    return cached;
  };

  const getSubtree3 = (id: string): number => {
    if (!id || !herdById.has(id)) return 0;
    let cached = subtree3Cache.get(id);
    if (cached === undefined) {
      cached = countSubtree(id, herdById, 3);
      subtree3Cache.set(id, cached);
    }
    return cached;
  };

  const getSubtree4 = (id: string): number => {
    if (!id || !herdById.has(id)) return 0;
    let cached = subtree4Cache.get(id);
    if (cached === undefined) {
      cached = countSubtree(id, herdById, 4);
      subtree4Cache.set(id, cached);
    }
    return cached;
  };

  const evalPairing = (
    sireId: string,
    damId: string,
    overrideSubject?: Animal
  ): CoiAnalysis => {
    const countKnown = (): [number, number] => {
      if (overrideSubject) {
        return [
          countDirectAncestors(overrideSubject.id, herdById, 3, overrideSubject),
          countDirectAncestors(overrideSubject.id, herdById, 4, overrideSubject),
        ];
      }
      return [
        getSubtree3(sireId) + getSubtree3(damId),
        getSubtree4(sireId) + getSubtree4(damId),
      ];
    };

    if (!sireId || !damId) {
      const [g3, g4] = countKnown();
      return {
        coiFraction: 0,
        coiPercent: 0,
        risk: describeCoiRisk(0),
        sharedAncestors: [],
        knownAncestorsIn3Gen: g3,
        knownAncestorsIn4Gen: g4,
      };
    }

    const fraction = Math.min(1, Math.max(0, engine.kinship(sireId, damId)));
    const percent = fraction * 100;
    const sharedAncestors = computeCommonAncestorContributions(
      sireId,
      damId,
      herdById,
      engine,
      getPaths(sireId),
      getPaths(damId)
    );
    const [g3, g4] = countKnown();

    return {
      coiFraction: fraction,
      coiPercent: percent,
      risk: describeCoiRisk(percent),
      sharedAncestors,
      knownAncestorsIn3Gen: g3,
      knownAncestorsIn4Gen: g4,
    };
  };

  return {
    calculatePairingCoi: evalPairing,
    calculateAnimalCoi: (animal: Animal): CoiAnalysis => {
      if (!animal.sireId || !animal.damId) {
        return evalPairing('', '', animal);
      }
      return evalPairing(animal.sireId, animal.damId, animal);
    },
  };
}

/**
 * Calculates projected Wright's COI for a hypothetical Sire × Dam pairing.
 */
export function calculatePairingCoi(
  sireId: string,
  damId: string,
  herdById: Map<string, Animal>,
  overrideSubject?: Animal
): CoiAnalysis {
  const countKnown = (): [number, number] => {
    if (overrideSubject) {
      return [
        countDirectAncestors(overrideSubject.id, herdById, 3, overrideSubject),
        countDirectAncestors(overrideSubject.id, herdById, 4, overrideSubject),
      ];
    }
    const g3 = countSubtree(sireId, herdById, 3) + countSubtree(damId, herdById, 3);
    const g4 = countSubtree(sireId, herdById, 4) + countSubtree(damId, herdById, 4);
    return [g3, g4];
  };

  if (!sireId || !damId) {
    const [g3, g4] = countKnown();
    return {
      coiFraction: 0,
      coiPercent: 0,
      risk: describeCoiRisk(0),
      sharedAncestors: [],
      knownAncestorsIn3Gen: g3,
      knownAncestorsIn4Gen: g4,
    };
  }

  const engine = new CoancestryEngine(herdById);
  const fraction = Math.min(1, Math.max(0, engine.kinship(sireId, damId)));
  const percent = fraction * 100;
  const sharedAncestors = computeCommonAncestorContributions(sireId, damId, herdById, engine);
  const [g3, g4] = countKnown();

  return {
    coiFraction: fraction,
    coiPercent: percent,
    risk: describeCoiRisk(percent),
    sharedAncestors,
    knownAncestorsIn3Gen: g3,
    knownAncestorsIn4Gen: g4,
  };
}

/**
 * Calculates Wright's COI for an existing individual animal.
 */
export function calculateAnimalCoi(
  animal: Animal,
  herdById: Map<string, Animal>
): CoiAnalysis {
  if (!animal.sireId || !animal.damId) {
    return calculatePairingCoi('', '', herdById, animal);
  }
  return calculatePairingCoi(animal.sireId, animal.damId, herdById, animal);
}

function slotRoleLabel(gen: number, idx: number, speciesProfile?: SpeciesProfile): string {
  const sireTitle = speciesProfile ? `Sire (${speciesProfile.maleLabel})` : 'Sire';
  const damTitle = speciesProfile ? `Dam (${speciesProfile.femaleLabel})` : 'Dam';

  if (gen === 0) return 'Subject';
  if (gen === 1) return idx === 0 ? sireTitle : damTitle;
  if (gen === 2) {
    switch (idx) {
      case 0:
        return 'Paternal Grandsire';
      case 1:
        return 'Paternal Granddam';
      case 2:
        return 'Maternal Grandsire';
      default:
        return 'Maternal Granddam';
    }
  }
  const side = idx < 1 << (gen - 1) ? 'Sire Line' : 'Dam Line';
  const parentRole = idx % 2 === 0 ? 'Sire' : 'Dam';
  if (gen === 3) return `Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 4) return `2nd Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 5) return `3rd Great-Grand${parentRole.toLowerCase()} (${side})`;
  if (gen === 6) return `4th Great-Grand${parentRole.toLowerCase()} (${side})`;
  return `G${gen} ${side} ${parentRole}`;
}

/**
 * Builds an ordered list of pedigree tree slots from Generation 0 (Subject) up to `maxGeneration` (3–6).
 * Tracks `occurrenceCount` so repeated linebred ancestors are highlighted automatically.
 */
export function buildPedigreeSlots(
  subject: Animal,
  herdById: Map<string, Animal>,
  maxGeneration: number = 3,
  speciesProfile?: SpeciesProfile
): PedigreeSlot[] {
  const cappedGen = Math.min(6, Math.max(1, maxGeneration));
  const rawGrid: (Animal | null)[][] = [];
  rawGrid[0] = [subject];

  for (let gen = 1; gen <= cappedGen; gen++) {
    const prevRow = rawGrid[gen - 1];
    const currRow: (Animal | null)[] = [];
    for (const parent of prevRow) {
      const sire = parent?.sireId ? herdById.get(parent.sireId) ?? null : null;
      const dam = parent?.damId ? herdById.get(parent.damId) ?? null : null;
      currRow.push(sire, dam);
    }
    rawGrid[gen] = currRow;
  }

  // Count ancestor occurrences across generations 1..cappedGen
  const counts = new Map<string, number>();
  for (let gen = 1; gen <= cappedGen; gen++) {
    for (const a of rawGrid[gen]) {
      if (a) {
        counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      }
    }
  }

  const slots: PedigreeSlot[] = [];
  for (let gen = 0; gen <= cappedGen; gen++) {
    const row = rawGrid[gen];
    for (let idx = 0; idx < row.length; idx++) {
      const animal = row[idx];
      const childAnimal = gen > 0 ? rawGrid[gen - 1][Math.floor(idx / 2)] : null;
      const expectedSex: BiologicalSex = gen === 0 ? subject.sex : idx % 2 === 0 ? 'Male' : 'Female';

      slots.push({
        generation: gen,
        slotIndex: idx,
        animal,
        roleLabel: slotRoleLabel(gen, idx, speciesProfile),
        occurrenceCount: animal && gen > 0 ? counts.get(animal.id) ?? 1 : 1,
        childAnimalId: childAnimal?.id ?? '',
        expectedSex,
      });
    }
  }

  return slots;
}

export interface PedigreeGen3BranchSummary {
  branchIndex: number; // 0..7 corresponding to generation 3 slotIndex
  slotKey: string; // "3:<branchIndex>"
  isExpanded: boolean;
  hiddenTotalSlots: number;
  hiddenKnownAncestors: number;
}

export interface PedigreeBranchViewportResult {
  visibleSlots: PedigreeSlot[];
  branchSummaries: Map<string, PedigreeGen3BranchSummary>;
  totalSlotsCount: number;
  visibleSlotsCount: number;
  hiddenSlotsCount: number;
  hiddenKnownAncestorsCount: number;
}

/**
 * Maps any slot at generation >= 4 back to its Generation-3 great-grandparent branch index (0..7).
 * Returns `null` for generations 0..3.
 */
export function getGen3BranchIndex(generation: number, slotIndex: number): number | null {
  if (generation < 4) return null;
  const shift = generation - 3;
  return Math.floor(slotIndex / (1 << shift));
}

/**
 * Keeps Generation 0–3 (`15` slots max) active in the pedigree chart DOM by default and filters
 * Generation 4–6 ancestor slots strictly to explicitly expanded Generation-3 branches.
 * Note: `buildPedigreeSlots` continues returning full depth for `.HTM` & Barn Binder printouts.
 */
export function buildPedigreeBranchViewport(
  slots: PedigreeSlot[],
  maxGeneration: number,
  expandedGen3Branches: ReadonlySet<number>
): PedigreeBranchViewportResult {
  const branchTotals = new Array<number>(8).fill(0);
  const branchKnowns = new Array<number>(8).fill(0);

  if (maxGeneration >= 4) {
    for (const slot of slots) {
      const branchIdx = getGen3BranchIndex(slot.generation, slot.slotIndex);
      if (branchIdx === null || branchIdx < 0 || branchIdx >= 8) continue;
      branchTotals[branchIdx] += 1;
      if (slot.animal) {
        branchKnowns[branchIdx] += 1;
      }
    }
  }

  const branchSummaries = new Map<string, PedigreeGen3BranchSummary>();
  if (maxGeneration >= 4) {
    for (let b = 0; b < 8; b++) {
      const isExpanded = expandedGen3Branches.has(b);
      branchSummaries.set(`3:${b}`, {
        branchIndex: b,
        slotKey: `3:${b}`,
        isExpanded,
        hiddenTotalSlots: isExpanded ? 0 : branchTotals[b],
        hiddenKnownAncestors: isExpanded ? 0 : branchKnowns[b],
      });
    }
  }

  const visibleSlots: PedigreeSlot[] = [];
  let hiddenKnownAncestorsCount = 0;

  for (const slot of slots) {
    if (slot.generation <= 3) {
      visibleSlots.push(slot);
      continue;
    }
    const branchIdx = getGen3BranchIndex(slot.generation, slot.slotIndex);
    if (branchIdx !== null && expandedGen3Branches.has(branchIdx)) {
      visibleSlots.push(slot);
    } else if (slot.animal) {
      hiddenKnownAncestorsCount += 1;
    }
  }

  return {
    visibleSlots,
    branchSummaries,
    totalSlotsCount: slots.length,
    visibleSlotsCount: visibleSlots.length,
    hiddenSlotsCount: slots.length - visibleSlots.length,
    hiddenKnownAncestorsCount,
  };
}

/**
 * Returns the Generation-3 branch indices (`0..7`) that have at least one recorded Generation 4+ ancestor.
 */
export function getGen3BranchesWithKnownAncestors(slots: PedigreeSlot[]): number[] {
  const active = new Set<number>();
  for (const slot of slots) {
    if (slot.generation >= 4 && slot.animal) {
      const b = getGen3BranchIndex(slot.generation, slot.slotIndex);
      if (b !== null) active.add(b);
    }
  }
  return Array.from(active).sort((a, b) => a - b);
}

