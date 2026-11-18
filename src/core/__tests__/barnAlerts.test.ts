import { describe, expect, it } from 'vitest';
import {
  buildSpeciesMemoSignature,
  buildTaskAlertGroupSignature,
  buildWithdrawalByAnimalMap,
  evaluateAnimalActiveWithdrawal,
  evaluateShowWithdrawalConflicts,
  evaluateSpeciesActiveWithdrawalsAlert,
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesDueTasksAlert,
  evaluateSpeciesMemoReminderAlert,
  evaluateSpeciesNeedsAttentionAlert,
  evaluateWithdrawalDispositionWarning,
  formatArrivalTimingLabel,
  getGestationSoonWindowDays,
  resolveCareLogWithdrawalClearDateIso,
} from '../barnAlerts';
import { BarnTask, BreedingRecord, CareLog } from '../models';
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

  it('shows subtle memo pad reminder when memo has non-whitespace text, allows closing, and returns when edited', () => {
    const emptyEval = evaluateSpeciesMemoReminderAlert({ memoText: '   \n\t  ', memoUpdatedAt: '' });
    expect(emptyEval.hasMemo).toBe(false);
    expect(emptyEval.shouldShow).toBe(false);
    expect(emptyEval.signature).toBe('');

    const initialProfile = {
      ...makeSpeciesProfile('Rabbit'),
      memoText: '# Spring Notes\n- [ ] Weigh kits on Sunday',
      memoUpdatedAt: '2026-11-15T10:00:00.000Z',
    };
    const firstEval = evaluateSpeciesMemoReminderAlert(initialProfile);
    expect(firstEval.hasMemo).toBe(true);
    expect(firstEval.shouldShow).toBe(true);
    expect(firstEval.previewText).toBe('Spring Notes');
    expect(firstEval.signature).toBe(
      buildSpeciesMemoSignature(initialProfile.memoText, initialProfile.memoUpdatedAt)
    );

    // Dismissing with the matching signature hides the reminder
    const dismissedEval = evaluateSpeciesMemoReminderAlert(initialProfile, {
      dismissedSignature: firstEval.signature,
    });
    expect(dismissedEval.hasMemo).toBe(true);
    expect(dismissedEval.shouldShow).toBe(false);

    // Editing the memo pad text (or timestamp) changes the signature so the notice returns
    const editedByTextEval = evaluateSpeciesMemoReminderAlert(
      {
        memoText: '# Spring Notes\n- [ ] Weigh kits on Sunday\n- Check nestbox',
        memoUpdatedAt: '2026-11-15T10:00:00.000Z',
      },
      { dismissedSignature: firstEval.signature }
    );
    expect(editedByTextEval.shouldShow).toBe(true);
    expect(editedByTextEval.signature).not.toBe(firstEval.signature);

    const editedTimestampOnlyEval = evaluateSpeciesMemoReminderAlert(
      {
        memoText: initialProfile.memoText,
        memoUpdatedAt: '2026-11-16T08:30:00.000Z',
      },
      { dismissedSignature: firstEval.signature }
    );
    expect(editedTimestampOnlyEval.shouldShow).toBe(true);
    expect(editedTimestampOnlyEval.signature).not.toBe(firstEval.signature);
  });
});

function makeHealthLog(id: string, animalId: string, overrides: Partial<CareLog> = {}): CareLog {
  return {
    id,
    species: 'Rabbit',
    animalId,
    dateIso: '2026-11-10',
    type: 'Health / Vet',
    title: 'Vet Treatment',
    weightGrams: 0,
    showLegEarned: false,
    medicationName: 'Ivermectin',
    dosage: '0.2 mL',
    administrationRoute: 'SubQ',
    withdrawalDays: 14,
    withdrawalClearDateIso: '2026-11-24',
    notes: '',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('barnAlerts — active medication withdrawal countdowns & safety warnings', () => {
  it('resolves clear dates via explicit ISO or fallback dateIso + withdrawalDays and clears on the clear date itself', () => {
    const fallbackLog = makeHealthLog('l-fallback', 'a1', {
      dateIso: '2026-11-10',
      withdrawalDays: 10,
      withdrawalClearDateIso: '',
    });
    expect(resolveCareLogWithdrawalClearDateIso(fallbackLog)).toBe('2026-11-20');

    // Day before clear date -> active (1d left)
    const activeDayBefore = evaluateAnimalActiveWithdrawal([fallbackLog], 'a1', {
      todayIso: '2026-11-19',
    });
    expect(activeDayBefore.isActive).toBe(true);
    expect(activeDayBefore.clearDateIso).toBe('2026-11-20');
    expect(activeDayBefore.daysRemaining).toBe(1);
    expect(activeDayBefore.shortCountdownLabel).toBe('1d left');
    expect(activeDayBefore.countdownLabel).toBe('1 day remaining');

    // On the clear date itself -> cleared!
    const clearedOnDate = evaluateAnimalActiveWithdrawal([fallbackLog], 'a1', {
      todayIso: '2026-11-20',
    });
    expect(clearedOnDate.isActive).toBe(false);
    expect(clearedOnDate.daysRemaining).toBe(0);
    expect(clearedOnDate.activeLogs).toHaveLength(0);
  });

  it('picks the furthest clear date and deduplicates medications across overlapping logs', () => {
    const logs: CareLog[] = [
      makeHealthLog('l1', 'a1', {
        medicationName: 'Penicillin G',
        withdrawalClearDateIso: '2026-11-22',
      }),
      makeHealthLog('l2', 'a1', {
        medicationName: 'Ivermectin',
        withdrawalClearDateIso: '2026-11-29',
      }),
      makeHealthLog('l3', 'a1', {
        medicationName: 'Penicillin G',
        withdrawalClearDateIso: '2026-11-25',
      }),
    ];

    const byAnimal = buildWithdrawalByAnimalMap(logs, { todayIso: '2026-11-18' });
    const evalA1 = byAnimal.get('a1');
    expect(evalA1?.isActive).toBe(true);
    expect(evalA1?.clearDateIso).toBe('2026-11-29');
    expect(evalA1?.daysRemaining).toBe(11);
    expect(evalA1?.shortCountdownLabel).toBe('11d left');
    expect(evalA1?.medicationSummary).toBe('Ivermectin, Penicillin G');
  });

  it('evaluates per-species withdrawal alerts, excludes Deceased/Sold/Archived stock, and honors session dismissal', () => {
    const animals = [
      makeAnimal('r-active', { name: 'Clover', species: 'Rabbit', status: 'Active' }),
      makeAnimal('r-culled', { name: 'Bramble', species: 'Rabbit', status: 'Active', culled: true }),
      makeAnimal('r-sold', { name: 'Sold Doe', species: 'Rabbit', status: 'Sold', archived: true }),
      makeAnimal('r-dead', { name: 'Deceased Buck', species: 'Rabbit', status: 'Deceased', archived: true }),
      makeAnimal('g-active', { name: 'Goat Kid', species: 'Goat', status: 'Active' }),
    ];
    const logs: CareLog[] = [
      makeHealthLog('log-clover', 'r-active', { withdrawalClearDateIso: '2026-11-25' }),
      makeHealthLog('log-bramble', 'r-culled', { withdrawalClearDateIso: '2026-11-21' }),
      makeHealthLog('log-sold', 'r-sold', { withdrawalClearDateIso: '2026-11-28' }),
      makeHealthLog('log-dead', 'r-dead', { withdrawalClearDateIso: '2026-11-28' }),
      makeHealthLog('log-goat', 'g-active', { species: 'Goat', withdrawalClearDateIso: '2026-11-24' }),
    ];

    const byAnimal = buildWithdrawalByAnimalMap(logs, { todayIso: '2026-11-18' });
    const rabbitAlert = evaluateSpeciesActiveWithdrawalsAlert(animals, logs, 'Rabbit', {
      todayIso: '2026-11-18',
      withdrawalByAnimalId: byAnimal,
    });
    expect(rabbitAlert.shouldShow).toBe(true);
    expect(rabbitAlert.items.map((item) => item.animal.name)).toEqual(['Bramble', 'Clover']);
    expect(rabbitAlert.items[0].evaluation.daysRemaining).toBe(3);
    expect(rabbitAlert.items[1].evaluation.daysRemaining).toBe(7);

    // Dismissed for the current session hides shouldShow while keeping items inspected
    const dismissedAlert = evaluateSpeciesActiveWithdrawalsAlert(animals, logs, 'Rabbit', {
      todayIso: '2026-11-18',
      withdrawalByAnimalId: byAnimal,
      dismissedSpeciesKeys: new Set(['rabbit']),
    });
    expect(dismissedAlert.items).toHaveLength(2);
    expect(dismissedAlert.shouldShow).toBe(false);
  });

  it('triggers disposition soft confirmation only on Sold and Flagged for Cull', () => {
    const logs = [makeHealthLog('l1', 'a1', { withdrawalClearDateIso: '2026-11-24' })];
    const evalActive = evaluateAnimalActiveWithdrawal(logs, 'a1', { todayIso: '2026-11-18' });

    expect(
      evaluateWithdrawalDispositionWarning(evalActive, {
        animalName: 'Clover',
        isNewlySold: false,
        isNewlyCulled: false,
      })
    ).toBeNull();

    const soldWarning = evaluateWithdrawalDispositionWarning(evalActive, {
      animalName: 'Clover',
      isNewlySold: true,
      isNewlyCulled: false,
    });
    expect(soldWarning?.reasons).toEqual(['Sold']);
    expect(soldWarning?.detail).toContain('Ivermectin');
    expect(soldWarning?.detail).toContain('6 days remaining');

    const cullWarning = evaluateWithdrawalDispositionWarning(evalActive, {
      animalName: 'Clover',
      isNewlySold: false,
      isNewlyCulled: true,
    });
    expect(cullWarning?.reasons).toEqual(['Flagged for Cull']);
  });

  it('warns on Show entry when withdrawal overlaps the show event date and clears on the clear date itself', () => {
    const animals = [
      makeAnimal('a1', { name: 'Clover', species: 'Rabbit' }),
      makeAnimal('a2', { name: 'Maple', species: 'Rabbit' }),
    ];
    const logs = [
      makeHealthLog('l1', 'a1', { withdrawalClearDateIso: '2026-11-24' }),
      makeHealthLog('l2', 'a2', { withdrawalClearDateIso: '2026-11-20' }),
    ];

    // Show on Nov 23 -> a1 overlaps (clears Nov 24), a2 already cleared (Nov 20)
    const conflictEval = evaluateShowWithdrawalConflicts(animals, ['a1', 'a2'], logs, '2026-11-23');
    expect(conflictEval.hasConflict).toBe(true);
    expect(conflictEval.conflicts.map((c) => c.animal.name)).toEqual(['Clover']);

    // Show on Nov 24 (the exact clear date) -> cleared!
    const clearDayShow = evaluateShowWithdrawalConflicts(animals, ['a1', 'a2'], logs, '2026-11-24');
    expect(clearDayShow.hasConflict).toBe(false);
    expect(clearDayShow.conflicts).toHaveLength(0);
  });
});

