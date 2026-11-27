import { describe, expect, it } from 'vitest';
import {
  buildCageMaintenanceTaskDraft,
  buildFacilityBoardModel,
  compareNaturalLabels,
  diffCalendarDaysIso,
  evaluateCageFeedStatus,
  evaluateCageMaintenanceStatus,
  inferHousingUnitType,
  matchesFacilityBoardFilter,
} from '../facilityBoard';
import { BarnTask, CageLocation } from '../models';
import { makeAnimal } from './testFixtures';

const TS = '2026-11-01T00:00:00.000Z';

function makeCage(id: string, overrides: Partial<CageLocation> = {}): CageLocation {
  return {
    id,
    species: 'Rabbit',
    label: `Hutch ${id}`,
    section: 'Row A',
    capacity: 1,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: 'Clean hutch',
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-11-21',
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('facilityBoard — visual hutch-row board, feedlot rollups & maintenance schedules', () => {
  it('computes pure UTC calendar day differences and natural alphanumeric sorting', () => {
    expect(diffCalendarDaysIso('2026-11-20', '2026-11-27')).toBe(7);
    expect(diffCalendarDaysIso('2026-11-20', '2026-11-18')).toBe(-2);
    expect(diffCalendarDaysIso('2026-11-20', '2026-11-20')).toBe(0);
    expect(diffCalendarDaysIso('bad-date', '2026-11-20')).toBeNull();

    const unsorted = ['Row 10', 'Row 2', 'Row 1', 'North Pasture'];
    expect([...unsorted].sort(compareNaturalLabels)).toEqual([
      'North Pasture',
      'Row 1',
      'Row 2',
      'Row 10',
    ]);
  });

  it('infers sensible housing unit types from label and section hints', () => {
    expect(inferHousingUnitType({ label: 'North Pasture', section: 'Field' })).toBe('pasture');
    expect(inferHousingUnitType({ label: 'Colony Run 1', section: 'East Yard' })).toBe('colony');
    expect(inferHousingUnitType({ label: 'Stall 4', section: 'Main Barn' })).toBe('stall');
    expect(inferHousingUnitType({ label: 'Hutch R-01', section: 'Row A' })).toBe('hutch');
    expect(inferHousingUnitType({ label: 'Growout Pen 2', section: 'West Wall' })).toBe('pen');
    expect(inferHousingUnitType({ label: 'R-01', section: 'Row A', unitType: 'stall' })).toBe('stall');
  });

  it('evaluates recurring maintenance statuses accurately across overdue, due_today, due_soon, ok, unlogged, and none', () => {
    const today = '2026-11-20';

    expect(evaluateCageMaintenanceStatus(makeCage('c0'), today).state).toBe('none');

    const unlogged = evaluateCageMaintenanceStatus(
      makeCage('c1', { maintenanceIntervalDays: 7, maintenanceTaskLabel: 'Sanitize pan' }),
      today
    );
    expect(unlogged.state).toBe('unlogged');
    expect(unlogged.nextDueDateIso).toBe(today);

    const overdue = evaluateCageMaintenanceStatus(
      makeCage('c2', { maintenanceIntervalDays: 7, lastMaintenanceDateIso: '2026-11-10' }),
      today
    );
    expect(overdue.state).toBe('overdue');
    expect(overdue.nextDueDateIso).toBe('2026-11-17');
    expect(overdue.daysUntilDue).toBe(-3);

    const dueToday = evaluateCageMaintenanceStatus(
      makeCage('c3', { maintenanceIntervalDays: 7, lastMaintenanceDateIso: '2026-11-13' }),
      today
    );
    expect(dueToday.state).toBe('due_today');
    expect(dueToday.daysUntilDue).toBe(0);

    const dueSoon = evaluateCageMaintenanceStatus(
      makeCage('c4', { maintenanceIntervalDays: 7, lastMaintenanceDateIso: '2026-11-15' }),
      today
    );
    expect(dueSoon.state).toBe('due_soon');
    expect(dueSoon.daysUntilDue).toBe(2);

    const ok = evaluateCageMaintenanceStatus(
      makeCage('c5', { maintenanceIntervalDays: 14, lastMaintenanceDateIso: '2026-11-18' }),
      today
    );
    expect(ok.state).toBe('ok');
    expect(ok.daysUntilDue).toBe(12);
  });

  it('evaluates feedlot stock statuses (none, depleted, low, ok)', () => {
    const none = evaluateCageFeedStatus(makeCage('f0'));
    expect(none.hasFeedLink).toBe(false);
    expect(none.isLowStock).toBe(false);

    const depleted = evaluateCageFeedStatus(
      makeCage('f1', { feedLotName: 'Pellet Bin', feedStockRemaining: 0, feedLowThreshold: 10 })
    );
    expect(depleted.hasFeedLink).toBe(true);
    expect(depleted.isDepleted).toBe(true);
    expect(depleted.isLowStock).toBe(true);

    const low = evaluateCageFeedStatus(
      makeCage('f2', { feedLotName: 'Pellet Bin', feedStockRemaining: 8, feedLowThreshold: 10 })
    );
    expect(low.hasFeedLink).toBe(true);
    expect(low.isDepleted).toBe(false);
    expect(low.isLowStock).toBe(true);

    const ok = evaluateCageFeedStatus(
      makeCage('f3', { feedLotName: 'Pellet Bin', feedStockRemaining: 25, feedLowThreshold: 10 })
    );
    expect(ok.hasFeedLink).toBe(true);
    expect(ok.isDepleted).toBe(false);
    expect(ok.isLowStock).toBe(false);
  });

  it('groups pens by physical section, rolls up feedlots, detects unregistered pens and unassigned animals, and enforces species isolation', () => {
    const cages: CageLocation[] = [
      makeCage('c-10', {
        label: 'Hutch A-10',
        section: 'Row 10',
        capacity: 1,
        feedLotName: '16% Pellet Bin',
        feedStockRemaining: 5,
        feedStockUnit: 'lbs',
        feedLowThreshold: 10,
        maintenanceIntervalDays: 7,
        lastMaintenanceDateIso: '2026-11-10',
      }),
      makeCage('c-2', {
        label: 'Hutch A-2',
        section: 'Row 2',
        capacity: 2,
        feedLotName: '16% Pellet Bin',
        feedStockRemaining: 5,
        feedStockUnit: 'lbs',
        feedLowThreshold: 10,
      }),
      makeCage('c-general', {
        label: 'Colony Q-1',
        section: '',
        capacity: 1,
        unitType: 'colony',
      }),
      makeCage('c-sheep', {
        species: 'Sheep',
        label: 'Pasture S-1',
        section: 'South Field',
        capacity: 10,
      }),
    ];

    const animals = [
      makeAnimal('a1', { name: 'Clover', cageLocation: 'Hutch A-10' }),
      makeAnimal('a2', { name: 'Maple', cageLocation: 'Hutch A-10' }), // causes over-capacity 2/1
      makeAnimal('a3', { name: 'Thistle', cageLocation: 'Hutch A-2' }),
      makeAnimal('a4', { name: 'Unassigned Kit', cageLocation: '' }),
      makeAnimal('a5', { name: 'Growout Kit', cageLocation: 'Growout Pen G-1' }), // unregistered cage
      makeAnimal('sh1', { species: 'Sheep', name: 'Ewe 1', cageLocation: 'Pasture S-1' }),
    ];

    const tasks: BarnTask[] = [
      makeTask('t1', { title: 'Hutch A-10: Sanitize & refill', linkedAnimalId: 'a1' }),
      makeTask('t2', { title: 'Unrelated chore', linkedAnimalId: 'a4' }),
      makeTask('t3', { species: 'Sheep', title: 'Pasture S-1: Fence check' }),
    ];

    const board = buildFacilityBoardModel({
      cages,
      animals,
      tasks,
      speciesName: 'Rabbit',
      todayIso: '2026-11-20',
    });

    // Natural section ordering with General Barn last
    expect(board.sections.map((s) => s.sectionName)).toEqual(['Row 2', 'Row 10', 'General Barn']);
    expect(board.totals.totalPens).toBe(3);
    expect(board.totals.overCapacityPens).toBe(1);
    expect(board.totals.maintenanceDueOrOverdue).toBe(1);
    expect(board.totals.lowFeedPens).toBe(2);
    expect(board.unassignedActiveAnimals.map((a) => a.id)).toEqual(['a4']);
    expect(board.unregisteredCages).toHaveLength(1);
    expect(board.unregisteredCages[0].label).toBe('Growout Pen G-1');
    expect(board.unregisteredCages[0].animals.map((a) => a.id)).toEqual(['a5']);

    // Feedlot rollup merges both pens sharing "16% Pellet Bin"
    expect(board.feedLots).toHaveLength(1);
    expect(board.feedLots[0].penCount).toBe(2);
    expect(board.feedLots[0].animalCount).toBe(3);
    expect(board.feedLots[0].hasLowStock).toBe(true);

    // Filter checks
    const row10Pen = board.sections[1].pens[0];
    expect(row10Pen.openLinkedTasks.map((t) => t.id)).toEqual(['t1']);
    expect(matchesFacilityBoardFilter(row10Pen, 'over_capacity')).toBe(true);
    expect(matchesFacilityBoardFilter(row10Pen, 'maintenance_due')).toBe(true);
    expect(matchesFacilityBoardFilter(row10Pen, 'low_feed')).toBe(true);
    expect(matchesFacilityBoardFilter(row10Pen, 'open')).toBe(false);

    const row2Pen = board.sections[0].pens[0];
    expect(matchesFacilityBoardFilter(row2Pen, 'open')).toBe(true);
    expect(matchesFacilityBoardFilter(row2Pen, 'over_capacity')).toBe(false);
  });

  it('builds recurring maintenance Master Task List drafts using pure UTC calendar math', () => {
    const cage = makeCage('c1', {
      label: 'Hutch B-04',
      maintenanceIntervalDays: 14,
      maintenanceTaskLabel: 'Deep clean wire & trays',
    });
    const draft = buildCageMaintenanceTaskDraft(cage, '2026-11-20');
    expect(draft).not.toBeNull();
    expect(draft!.species).toBe('Rabbit');
    expect(draft!.title).toBe('[Hutch B-04] Deep clean wire & trays');
    expect(draft!.dueDateIso).toBe('2026-12-04');
    expect(draft!.completed).toBe(false);
  });
});
