import { describe, expect, it } from 'vitest';
import {
  BARN_BENCH_SECTION_ALL,
  BARN_BENCH_SECTION_UNASSIGNED,
  buildBarnBenchCommitPlan,
  buildBarnBenchQueue,
  extractSpeciesCageSections,
  findNextBarnBenchIndex,
} from '../barnBench';
import { CageLocation, CareLog } from '../models';
import { makeAnimal } from './testFixtures';

const TS = '2026-06-15T14:30:00.000Z';

function makeCage(id: string, overrides: Partial<CageLocation> = {}): CageLocation {
  return {
    id,
    species: 'Rabbit',
    label: id,
    section: 'Row A',
    capacity: 1,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeCareLog(id: string, overrides: Partial<CareLog> = {}): CareLog {
  return {
    id,
    species: 'Rabbit',
    animalId: 'a1',
    dateIso: '2026-06-01',
    type: 'Weight Check',
    title: 'Weight Check',
    weightGrams: 0,
    showLegEarned: false,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('barnBench — Fast Sequential Batch Entry Engine', () => {
  it('extracts deduplicated, species-isolated cage sections in natural numeric order', () => {
    const cages: CageLocation[] = [
      makeCage('c1', { species: 'Rabbit', label: 'R-10', section: 'Row 10' }),
      makeCage('c2', { species: 'Rabbit', label: 'R-2', section: 'Row 2' }),
      makeCage('c3', { species: 'Rabbit', label: 'R-3', section: 'row 2' }),
      makeCage('c4', { species: 'Rabbit', label: 'R-4', section: '   ' }),
      makeCage('c5', { species: 'Goat', label: 'P-1', section: 'Pasture 1' }),
    ];

    expect(extractSpeciesCageSections(cages, 'Rabbit')).toEqual(['Row 2', 'Row 10']);
    expect(extractSpeciesCageSections(cages, 'Goat')).toEqual(['Pasture 1']);
  });

  it('builds a strictly species-isolated, naturally ordered cage walkthrough queue with latest BCS & nail trim dates', () => {
    const cages: CageLocation[] = [
      makeCage('c1', { species: 'Rabbit', label: 'Hutch R-2', section: 'Row A' }),
      makeCage('c2', { species: 'Rabbit', label: 'Hutch R-10', section: 'Row A' }),
      makeCage('c3', { species: 'Rabbit', label: 'Hutch B-1', section: 'Row B' }),
    ];

    const animals = [
      makeAnimal('a-r10', { name: 'Bramble', cageLocation: 'Hutch R-10', status: 'Active' }),
      makeAnimal('a-r2', { name: 'Clover', cageLocation: 'Hutch R-2', status: 'Active' }),
      makeAnimal('a-b1', { name: 'Thistle', cageLocation: 'Hutch B-1', status: 'Junior' }),
      makeAnimal('a-other', { name: 'Fern', cageLocation: 'Temp Carrier', status: 'Active' }),
      makeAnimal('a-unassigned', { name: 'Moss', cageLocation: '', status: 'Active' }),
      makeAnimal('a-sold', { name: 'Sold Bunny', cageLocation: 'Hutch R-2', status: 'Sold' }),
      makeAnimal('a-archived', {
        name: 'Archived Bunny',
        cageLocation: 'Hutch R-2',
        status: 'Active',
        archived: true,
      }),
      makeAnimal('a-stub', {
        name: 'Offloaded Stub',
        cageLocation: 'Hutch R-2',
        status: 'Active',
        offloadedArchiveKey: 'archive-1',
      }),
      makeAnimal('g-1', { species: 'Goat', name: 'Billy', cageLocation: 'Hutch R-2', status: 'Active' }),
    ];

    const careLogs: CareLog[] = [
      makeCareLog('l1', {
        animalId: 'a-r2',
        dateIso: '2026-05-01',
        type: 'Health Score / BCS',
        bodyConditionScore: 3,
      }),
      makeCareLog('l2', {
        animalId: 'a-r2',
        dateIso: '2026-06-10',
        type: 'Health Score / BCS',
        bodyConditionScore: 3.5,
      }),
      makeCareLog('l3', {
        animalId: 'a-r2',
        dateIso: '2026-05-20',
        type: 'Grooming & Hoof',
        title: 'Nail Trim',
      }),
      makeCareLog('l4', {
        animalId: 'a-r2',
        dateIso: '2026-06-12',
        type: 'Grooming & Hoof',
        title: 'Nail Trim',
      }),
      // Cross-species log must be ignored
      makeCareLog('l5', {
        species: 'Goat',
        animalId: 'a-r2',
        dateIso: '2026-06-14',
        type: 'Health Score / BCS',
        bodyConditionScore: 5,
      }),
    ];

    const queue = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', sectionFilter: BARN_BENCH_SECTION_ALL },
    });

    // Natural walkthrough order: Row A (R-2 before R-10) -> Row B -> Other Cages -> Unassigned
    expect(queue.map((r) => r.animal.id)).toEqual([
      'a-r2',
      'a-r10',
      'a-b1',
      'a-other',
      'a-unassigned',
    ]);
    expect(queue[0].latestBcs).toBe(3.5);
    expect(queue[0].latestBcsDateIso).toBe('2026-06-10');
    expect(queue[0].latestNailTrimDateIso).toBe('2026-06-12');
    expect(queue[3].sectionLabel).toBe('Other Cages');
    expect(queue[4].sectionLabel).toBe('Unassigned');
    expect(queue[4].hasAssignedCage).toBe(false);

    // Filter by section
    const rowAOnly = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', sectionFilter: 'Row A' },
    });
    expect(rowAOnly.map((r) => r.animal.id)).toEqual(['a-r2', 'a-r10']);

    // Filter by unassigned
    const unassignedOnly = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', sectionFilter: BARN_BENCH_SECTION_UNASSIGNED },
    });
    expect(unassignedOnly.map((r) => r.animal.id)).toEqual(['a-unassigned']);

    // Filter by junior_only
    const juniorsOnly = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', statusFilter: 'junior_only' },
    });
    expect(juniorsOnly.map((r) => r.animal.id)).toEqual(['a-b1']);

    // Search query matching cage label
    const searched = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', searchQuery: 'r-10' },
    });
    expect(searched.map((r) => r.animal.id)).toEqual(['a-r10']);
  });

  it('builds atomic CareLogs and a single _rev-bumped Animal patch for combined bench entries', () => {
    const animal = makeAnimal('a1', {
      name: 'Clover',
      weightGrams: 4000,
      cageLocation: 'R-1',
      _rev: 3,
    });

    const plan = buildBarnBenchCommitPlan(
      animal,
      {
        animalId: 'a1',
        dateIso: '2026-06-15',
        weightGrams: 4250.4,
        bodyConditionScore: 3.5,
        nailTrimDone: true,
        targetCageLocation: 'R-4',
        notes: 'Good coat condition',
      },
      TS
    );

    expect(plan.hasChanges).toBe(true);
    expect(plan.careLogs).toHaveLength(3);
    expect(plan.careLogs.map((l) => l.type)).toEqual([
      'Weight Check',
      'Health Score / BCS',
      'Grooming & Hoof',
    ]);
    expect(plan.careLogs[0].weightGrams).toBe(4250);
    expect(plan.careLogs[1].bodyConditionScore).toBe(3.5);
    expect(plan.careLogs.every((l) => l.dateIso === '2026-06-15' && l.notes === 'Good coat condition')).toBe(
      true
    );
    expect(plan.updatedAnimal).not.toBeNull();
    expect(plan.updatedAnimal?.weightGrams).toBe(4250);
    expect(plan.updatedAnimal?.cageLocation).toBe('R-4');
    expect(plan.updatedAnimal?._rev).toBe(4);
    expect(plan.updatedAnimal?.updatedAt).toBe(TS);
    expect(plan.summaryParts).toEqual(['Weight', 'BCS 3.5', 'Nail Trim', 'Moved → R-4']);
  });

  it('handles standalone notes, cage-only moves, unchanged-weight re-logs, and offloaded stubs safely', () => {
    const animal = makeAnimal('a1', { weightGrams: 4000, cageLocation: 'R-1', _rev: 2 });

    // Standalone note creates a Journal Note without patching animal
    const noteOnly = buildBarnBenchCommitPlan(
      animal,
      { animalId: 'a1', dateIso: '2026-06-15', notes: 'Slight molt on flanks' },
      TS
    );
    expect(noteOnly.hasChanges).toBe(true);
    expect(noteOnly.careLogs).toHaveLength(1);
    expect(noteOnly.careLogs[0].type).toBe('Journal Note');
    expect(noteOnly.updatedAnimal).toBeNull();

    // Unassigning cage updates animal without creating empty care logs
    const unassign = buildBarnBenchCommitPlan(
      animal,
      { animalId: 'a1', dateIso: '2026-06-15', targetCageLocation: '' },
      TS
    );
    expect(unassign.hasChanges).toBe(true);
    expect(unassign.careLogs).toHaveLength(0);
    expect(unassign.updatedAnimal?.cageLocation).toBe('');
    expect(unassign.updatedAnimal?._rev).toBe(3);
    expect(unassign.summaryParts).toEqual(['Unassigned Cage']);

    // Logging identical weight creates Weight Check CareLog without redundant Animal patch
    const sameWeight = buildBarnBenchCommitPlan(
      animal,
      { animalId: 'a1', dateIso: '2026-06-15', weightGrams: 4000 },
      TS
    );
    expect(sameWeight.hasChanges).toBe(true);
    expect(sameWeight.careLogs).toHaveLength(1);
    expect(sameWeight.updatedAnimal).toBeNull();

    // Offloaded archive stubs produce no changes
    const stub = makeAnimal('a-stub', { offloadedArchiveKey: 'arc-1' });
    const stubPlan = buildBarnBenchCommitPlan(
      stub,
      { animalId: 'a-stub', weightGrams: 4500, nailTrimDone: true },
      TS
    );
    expect(stubPlan.hasChanges).toBe(false);
    expect(stubPlan.careLogs).toHaveLength(0);
    expect(stubPlan.updatedAnimal).toBeNull();
  });

  it('advances smoothly to the next unlogged bench index and wraps cleanly when tail rows are logged', () => {
    const queue = buildBarnBenchQueue({
      animals: [
        makeAnimal('a1', { name: 'Alpha', cageLocation: 'R-1' }),
        makeAnimal('a2', { name: 'Beta', cageLocation: 'R-2' }),
        makeAnimal('a3', { name: 'Gamma', cageLocation: 'R-3' }),
        makeAnimal('a4', { name: 'Delta', cageLocation: 'R-4' }),
      ],
      cages: [],
      careLogs: [],
      options: { speciesName: 'Rabbit' },
    });

    // Skip already logged a2, jump to a3 (index 2)
    expect(
      findNextBarnBenchIndex({
        queue,
        currentIndex: 0,
        loggedAnimalIds: new Set(['a1', 'a2']),
        preferUnlogged: true,
      })
    ).toBe(2);

    // Tail rows logged -> wraps around to earlier unlogged row a1 (index 0)
    expect(
      findNextBarnBenchIndex({
        queue,
        currentIndex: 2,
        loggedAnimalIds: new Set(['a3', 'a4']),
        preferUnlogged: true,
      })
    ).toBe(0);

    // All rows logged -> steps forward sequentially clamped at end
    expect(
      findNextBarnBenchIndex({
        queue,
        currentIndex: 2,
        loggedAnimalIds: new Set(['a1', 'a2', 'a3', 'a4']),
        preferUnlogged: true,
      })
    ).toBe(3);

    // Empty queue returns 0 safely
    expect(
      findNextBarnBenchIndex({
        queue: [],
        currentIndex: 0,
        loggedAnimalIds: new Set(),
      })
    ).toBe(0);
  });
});
