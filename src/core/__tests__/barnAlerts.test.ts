import { describe, expect, it } from 'vitest';
import {
  buildTaskAlertGroupSignature,
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesDueTasksAlert,
  evaluateSpeciesNeedsAttentionAlert,
  formatArrivalTimingLabel,
  getGestationSoonWindowDays,
} from '../barnAlerts';
import { BarnTask, BreedingRecord } from '../models';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

function makeTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: `Task ${id}`,
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-11-15',
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeBreeding(id: string, overrides: Partial<BreedingRecord> = {}): BreedingRecord {
  return {
    id,
    species: 'Rabbit',
    sireId: 's1',
    damId: 'd1',
    sireName: 'Buck One',
    damName: 'Doe One',
    bredDateIso: '2026-10-16',
    expectedDueDateIso: '2026-11-16',
    actualBirthDateIso: '',
    projectedCoiPercent: 0,
    liveCount: 0,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 0,
    offspringCreated: false,
    status: 'Bred',
    notes: '',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('barnAlerts — per-species due/overdue task alerts and babies arriving soon', () => {
  it('detects due today and overdue tasks strictly per species while excluding completed and future tasks', () => {
    const tasks: BarnTask[] = [
      makeTask('overdue-1', { dueDateIso: '2026-11-12', title: 'Overdue Nestbox' }),
      makeTask('due-today', { dueDateIso: '2026-11-15', title: 'Due Kindling Check' }),
      makeTask('future', { dueDateIso: '2026-11-20', title: 'Future Chore' }),
      makeTask('done', { dueDateIso: '2026-11-10', completed: true }),
      makeTask('goat-task', { species: 'Goat', dueDateIso: '2026-11-10' }),
    ];

    const evalRabbit = evaluateSpeciesDueTasksAlert(tasks, 'Rabbit', {
      todayIso: '2026-11-15',
    });

    expect(evalRabbit.shouldShow).toBe(true);
    expect(evalRabbit.overdueCount).toBe(1);
    expect(evalRabbit.dueTodayCount).toBe(1);
    expect(evalRabbit.tasks.map((t) => t.id)).toEqual(['overdue-1', 'due-today']);
  });

  it('permanently suppresses ignored task IDs and clears current group without ignoring tasks when group signature matches', () => {
    const t1 = makeTask('t1', { dueDateIso: '2026-11-10' });
    const t2 = makeTask('t2', { dueDateIso: '2026-11-14' });
    const t3New = makeTask('t3', { dueDateIso: '2026-11-15' });

    // 1) Clearing current group signature hides the alert while keeping both tasks active
    const firstEval = evaluateSpeciesDueTasksAlert([t1, t2], 'Rabbit', {
      todayIso: '2026-11-15',
    });
    expect(firstEval.shouldShow).toBe(true);

    const clearedEval = evaluateSpeciesDueTasksAlert([t1, t2], 'Rabbit', {
      todayIso: '2026-11-15',
      clearedGroupSignature: firstEval.groupSignature,
    });
    expect(clearedEval.shouldShow).toBe(false);
    expect(clearedEval.tasks).toHaveLength(2);

    // 2) Adding a new due task changes the group signature, so alert automatically reappears
    const newGroupEval = evaluateSpeciesDueTasksAlert([t1, t2, t3New], 'Rabbit', {
      todayIso: '2026-11-15',
      clearedGroupSignature: firstEval.groupSignature,
    });
    expect(newGroupEval.shouldShow).toBe(true);
    expect(newGroupEval.groupSignature).not.toBe(buildTaskAlertGroupSignature([t1, t2]));

    // 3) Permanently ignoring specific overdue tasks removes them and clears alert if none remain
    const ignoredEval = evaluateSpeciesDueTasksAlert([t1, t2], 'Rabbit', {
      todayIso: '2026-11-15',
      ignoredTaskIds: new Set(['t1', 't2']),
    });
    expect(ignoredEval.shouldShow).toBe(false);
    expect(ignoredEval.tasks).toHaveLength(0);
  });

  it('evaluates babies about to arrive when gestation is nearly complete and excludes born/missed litters', () => {
    const rabbitProfile = makeSpeciesProfile('Rabbit'); // 31d gestation -> 5d window
    const goatProfile = makeSpeciesProfile('Goat'); // 150d gestation -> capped at 7d window

    expect(getGestationSoonWindowDays(rabbitProfile.gestationDays)).toBe(5);
    expect(getGestationSoonWindowDays(goatProfile.gestationDays)).toBe(7);
    expect(formatArrivalTimingLabel(0)).toBe('Due today');
    expect(formatArrivalTimingLabel(1)).toBe('Due tomorrow');
    expect(formatArrivalTimingLabel(3)).toBe('Due in 3 days');
    expect(formatArrivalTimingLabel(-2)).toBe('2 days past due date');

    const breedings: BreedingRecord[] = [
      makeBreeding('due-in-4', { expectedDueDateIso: '2026-11-19', damName: 'Clover' }),
      makeBreeding('due-tomorrow', {
        expectedDueDateIso: '2026-11-16',
        damName: 'Maple',
        status: 'Palpated Positive',
      }),
      makeBreeding('too-early', { expectedDueDateIso: '2026-11-28', damName: 'Future Doe' }),
      makeBreeding('already-born', {
        expectedDueDateIso: '2026-11-16',
        status: 'Born',
        damName: 'Born Doe',
      }),
      makeBreeding('missed', {
        expectedDueDateIso: '2026-11-16',
        status: 'Missed',
        damName: 'Missed Doe',
      }),
      makeBreeding('too-old-overdue', {
        expectedDueDateIso: '2026-11-01',
        damName: 'Stale Breeding',
      }),
    ];

    const res = evaluateSpeciesArrivingBabiesAlert(breedings, rabbitProfile, {
      todayIso: '2026-11-15',
    });

    expect(res.shouldShow).toBe(true);
    expect(res.offspringPluralLabel).toBe('Kits');
    expect(res.items.map((i) => i.breeding.damName)).toEqual(['Maple', 'Clover']);
    expect(res.items[0].timingLabel).toBe('Due tomorrow');
    expect(res.items[1].timingLabel).toBe('Due in 4 days');
  });

  it('evaluates per-species Needs Attention animals cleanly and clears when resolved', () => {
    const animals = [
      makeAnimal('r1', { name: 'Zebra Buck', species: 'Rabbit', needsAttention: true }),
      makeAnimal('r2', { name: 'Alpha Buck', species: 'Rabbit', needsAttention: true }),
      makeAnimal('r3', { name: 'Resolved Doe', species: 'Rabbit', needsAttention: false }),
      makeAnimal('g1', { name: 'Outside Buck', species: 'Goat', needsAttention: true }),
    ];

    const rabbitRes = evaluateSpeciesNeedsAttentionAlert(animals, 'Rabbit');
    expect(rabbitRes.shouldShow).toBe(true);
    expect(rabbitRes.animals.map((a) => a.name)).toEqual(['Alpha Buck', 'Zebra Buck']);

    const clearedRes = evaluateSpeciesNeedsAttentionAlert(
      animals.map((a) => ({ ...a, needsAttention: false })),
      'Rabbit'
    );
    expect(clearedRes.shouldShow).toBe(false);
    expect(clearedRes.animals).toHaveLength(0);
  });
});
