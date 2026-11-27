import { describe, expect, it } from 'vitest';
import {
  BarnTask,
  BreedScheduleOverride,
  BreedingRecord,
  normalizeBreedScheduleOverrides,
  SpeciesProfile,
} from '../models';
import {
  evaluateStalePostBirthTasksForBreeding,
  generateCascadedTasksForBreeding,
  getPendingBreedingCleanupTasks,
  identifyPostBirthTaskOffset,
  isBirthCheckTask,
  isPalpationTask,
  recalculatePostBirthTasksForBreeding,
  resolveEffectiveSpeciesProfileForBreed,
  resolveEffectiveSpeciesProfileForBreeding,
} from '../taskMaster';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

function makeRichRabbitProfile(overrides: Partial<SpeciesProfile> = {}): SpeciesProfile {
  const base = makeSpeciesProfile('Rabbit');
  return {
    ...base,
    gestationDays: 31,
    weanDaysAfterBirth: 42,
    rebreedDaysAfterBirth: 21,
    maturityDays: 180,
    milestones: [
      {
        label: 'Palpation Check',
        relativeTo: 'AFTER_BRED',
        daysOffset: 14,
        category: 'Palpation',
        priority: 'Normal',
      },
      {
        label: 'Place Nestbox',
        relativeTo: 'BEFORE_BIRTH',
        daysOffset: 3,
        category: 'Nestbox',
        priority: 'High',
      },
      {
        label: 'Check Nestbox for Kits',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 1,
        category: 'Birth Check',
        priority: 'High',
      },
      {
        label: 'Remove Nestbox',
        relativeTo: 'AFTER_BIRTH',
        daysOffset: 21,
        category: 'Care',
        priority: 'Normal',
      },
    ],
    ...overrides,
  };
}

function makeBreedingRecord(overrides: Partial<BreedingRecord> = {}): BreedingRecord {
  return {
    id: 'breed-1',
    species: 'Rabbit',
    damId: 'doe-1',
    damName: 'Daisy',
    sireId: 'buck-1',
    sireName: 'Thumper',
    bredDateIso: '2026-04-01',
    expectedDueDateIso: '2026-05-02',
    actualBirthDateIso: '',
    projectedCoiPercent: 0,
    liveCount: 0,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 0,
    offspringCreated: false,
    status: 'Bred',
    notes: '',
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeManualTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: `Task ${id}`,
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-05-10',
    linkedAnimalId: 'doe-1',
    linkedAnimalName: 'Daisy',
    linkedBreedingId: '',
    completed: false,
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('taskMaster — Per-Breed Overrides, Post-Birth Recalculation & Checkoff Cleanup', () => {
  it('normalizes breed overrides safely by trimming, deduplicating, clamping, and dropping empty rows', () => {
    const raw: BreedScheduleOverride[] = [
      { breed: '   ', gestationDays: 30 },
      { breed: 'Empty Line' }, // no numeric overrides -> dropped
      {
        breed: 'Holland Lop',
        gestationDays: 30,
        weanDaysAfterBirth: 56,
        rebreedDaysAfterBirth: 0,
        maturityDays: 2000, // clamped to 1500
        milestoneOverrides: [
          { label: 'Remove Nestbox', daysOffset: 24 },
          { label: 'remove nestbox', daysOffset: 25 }, // case-insensitive dedupe (last wins)
          { label: 'Bad', daysOffset: -5 }, // negative skipped
        ],
      },
      {
        breed: 'holland lop',
        gestationDays: 29,
        weanDaysAfterBirth: 49,
      },
      {
        breed: 'Flemish Giant',
        gestationDays: 32,
        weanDaysAfterBirth: 60,
        maturityDays: 240,
      },
    ];

    const normalized = normalizeBreedScheduleOverrides(raw);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual({
      breed: 'Flemish Giant',
      gestationDays: 32,
      weanDaysAfterBirth: 60,
      maturityDays: 240,
    });
    expect(normalized[1]).toEqual({
      breed: 'holland lop',
      gestationDays: 29,
      weanDaysAfterBirth: 49,
    });

    const singleWithMilestones = normalizeBreedScheduleOverrides([
      {
        breed: 'Netherland Dwarf',
        gestationDays: 30,
        rebreedDaysAfterBirth: 0,
        maturityDays: 2000,
        milestoneOverrides: [
          { label: 'Remove Nestbox', daysOffset: 24 },
          { label: 'remove nestbox', daysOffset: 25 },
          { label: 'Invalid', daysOffset: -1 },
        ],
      },
    ]);
    expect(singleWithMilestones).toEqual([
      {
        breed: 'Netherland Dwarf',
        gestationDays: 30,
        rebreedDaysAfterBirth: 0,
        maturityDays: 1500,
        milestoneOverrides: [{ label: 'remove nestbox', daysOffset: 25 }],
      },
    ]);
  });

  it('resolves dam breed overrides first, falls back to sire breed, and never mutates the base SpeciesProfile', () => {
    const profile = makeRichRabbitProfile({
      breedOverrides: [
        {
          breed: 'Holland Lop',
          gestationDays: 30,
          weanDaysAfterBirth: 56,
          rebreedDaysAfterBirth: 28,
          milestoneOverrides: [{ label: 'Remove Nestbox', daysOffset: 24 }],
        },
        {
          breed: 'Flemish Giant',
          gestationDays: 32,
          weanDaysAfterBirth: 60,
        },
      ],
    });
    const originalSnapshot = JSON.stringify(profile);

    const damLop = makeAnimal('doe-1', { breed: 'holland lop', sex: 'Female' });
    const sireGiant = makeAnimal('buck-1', { breed: 'Flemish Giant', sex: 'Male' });
    const damRex = makeAnimal('doe-2', { breed: 'Rex', sex: 'Female' });

    // Dam wins over sire when both have overrides
    const resolvedDam = resolveEffectiveSpeciesProfileForBreeding(profile, damLop, sireGiant);
    expect(resolvedDam.matchedBreed).toBe('Holland Lop');
    expect(resolvedDam.profile.gestationDays).toBe(30);
    expect(resolvedDam.profile.weanDaysAfterBirth).toBe(56);
    expect(resolvedDam.profile.rebreedDaysAfterBirth).toBe(28);
    expect(
      resolvedDam.profile.milestones.find((m) => m.label === 'Remove Nestbox')?.daysOffset
    ).toBe(24);
    expect(
      resolvedDam.profile.milestones.find((m) => m.label === 'Place Nestbox')?.daysOffset
    ).toBe(3);

    // Falls back to sire when dam breed has no override
    const resolvedSireFallback = resolveEffectiveSpeciesProfileForBreeding(
      profile,
      damRex,
      sireGiant
    );
    expect(resolvedSireFallback.matchedBreed).toBe('Flemish Giant');
    expect(resolvedSireFallback.profile.gestationDays).toBe(32);
    expect(resolvedSireFallback.profile.weanDaysAfterBirth).toBe(60);

    // Falls back cleanly to base profile when neither matches
    const resolvedDefault = resolveEffectiveSpeciesProfileForBreed(profile, 'Californian');
    expect(resolvedDefault.matchedBreed).toBeUndefined();
    expect(resolvedDefault.profile).toBe(profile);

    // Source profile unchanged
    expect(JSON.stringify(profile)).toBe(originalSnapshot);
  });

  it('cascades breeding tasks using breed-specific gestation/weaning/milestone offsets and skips Missed', () => {
    const baseProfile = makeRichRabbitProfile({
      breedOverrides: [
        {
          breed: 'Holland Lop',
          gestationDays: 30,
          weanDaysAfterBirth: 50,
          rebreedDaysAfterBirth: 28,
          milestoneOverrides: [{ label: 'Remove Nestbox', daysOffset: 25 }],
        },
      ],
    });
    const effective = resolveEffectiveSpeciesProfileForBreed(baseProfile, 'Holland Lop').profile;
    const breeding = makeBreedingRecord({
      bredDateIso: '2026-04-01',
      expectedDueDateIso: '2026-05-01', // 30 days
    });

    const tasks = generateCascadedTasksForBreeding(breeding, effective);
    const byPrefix = (prefix: string) => tasks.find((t) => t.title.startsWith(prefix));

    expect(byPrefix('Palpation Check:')?.dueDateIso).toBe('2026-04-15');
    expect(byPrefix('Place Nestbox:')?.dueDateIso).toBe('2026-04-28');
    expect(byPrefix('Check Nestbox for Kits:')?.dueDateIso).toBe('2026-05-02');
    expect(byPrefix('Remove Nestbox:')?.dueDateIso).toBe('2026-05-26'); // +25 instead of +21
    expect(byPrefix('Rebreed Readiness Check:')?.dueDateIso).toBe('2026-05-29'); // +28 instead of +21
    expect(byPrefix('Wean Kits:')?.dueDateIso).toBe('2026-06-20'); // +50 instead of +42

    expect(
      generateCascadedTasksForBreeding(makeBreedingRecord({ status: 'Missed' }), effective)
    ).toEqual([]);
  });

  it('evaluates and recalculates uncompleted AFTER_BIRTH chores to early/late actual birth date without touching completed or unrelated tasks', () => {
    const profile = makeRichRabbitProfile();
    // Bred 2026-04-01, expected 2026-05-02
    const breeding = makeBreedingRecord({
      id: 'b-shift',
      bredDateIso: '2026-04-01',
      expectedDueDateIso: '2026-05-02',
    });
    const generated = generateCascadedTasksForBreeding(breeding, profile);

    // Mark "Check Nestbox for Kits" (+1) completed & keep others open, plus add an unrelated chore
    const tasks: BarnTask[] = generated.map((t, idx) =>
      t.category === 'Birth Check'
        ? { ...t, completed: true, _rev: 2 }
        : { ...t, _rev: idx }
    );
    const unrelatedTask = makeManualTask('manual-1', {
      dueDateIso: '2026-05-20',
      title: 'Trim Nails: Daisy',
      category: 'Care',
      linkedBreedingId: 'b-shift',
    });
    tasks.push(unrelatedTask);

    // Doe kindled 2 days early on 2026-04-30
    const bornBreeding: BreedingRecord = {
      ...breeding,
      status: 'Born',
      actualBirthDateIso: '2026-04-30',
    };

    expect(identifyPostBirthTaskOffset(tasks.find((t) => t.category === 'Weaning')!, profile)).toBe(42);
    expect(identifyPostBirthTaskOffset(tasks.find((t) => t.category === 'Palpation')!, profile)).toBeNull();
    expect(identifyPostBirthTaskOffset(unrelatedTask, profile)).toBeNull();

    const preview = evaluateStalePostBirthTasksForBreeding(tasks, bornBreeding, profile);
    // Should include Remove Nestbox (+21 -> 2026-05-21), Rebreed (+21 -> 2026-05-21), Wean Kits (+42 -> 2026-06-11)
    // Excluded: Palpation (AFTER_BRED), Place Nestbox (BEFORE_BIRTH), completed Birth Check, unrelated Care chore
    expect(preview.staleEntries).toHaveLength(3);

    const { updatedTasks, shiftedCount } = recalculatePostBirthTasksForBreeding(
      tasks,
      bornBreeding,
      profile,
      '2026-04-30T15:00:00.000Z'
    );

    expect(shiftedCount).toBe(3);
    const updatedWean = updatedTasks.find((t) => t.category === 'Weaning');
    const updatedRebreed = updatedTasks.find((t) => t.category === 'Rebreed');
    const updatedRemove = updatedTasks.find((t) => t.title.startsWith('Remove Nestbox:'));
    expect(updatedWean?.dueDateIso).toBe('2026-06-11');
    expect(updatedRebreed?.dueDateIso).toBe('2026-05-21');
    expect(updatedRemove?.dueDateIso).toBe('2026-05-21');
    expect(updatedWean?.updatedAt).toBe('2026-04-30T15:00:00.000Z');
    const prevWeanRev = tasks.find((t) => t.category === 'Weaning')!._rev!;
    expect(updatedWean?._rev).toBe(prevWeanRev + 1);

    // Re-running after applying shifts yields zero stale tasks
    const mergedTasks = tasks.map((t) => updatedTasks.find((u) => u.id === t.id) ?? t);
    const recheck = evaluateStalePostBirthTasksForBreeding(mergedTasks, bornBreeding, profile);
    expect(recheck.staleEntries).toHaveLength(0);
  });

  it('identifies Palpation/Birth Check tasks and returns only pending downstream tasks for Missed cleanup', () => {
    const profile = makeRichRabbitProfile();
    const breeding = makeBreedingRecord({ id: 'b-missed' });
    const generated = generateCascadedTasksForBreeding(breeding, profile);

    const palpTask = generated.find((t) => t.category === 'Palpation')!;
    const birthTask = generated.find((t) => t.category === 'Birth Check')!;
    const nestTask = generated.find((t) => t.category === 'Nestbox')!;
    const weanTask = generated.find((t) => t.category === 'Weaning')!;
    const rebreedTask = generated.find((t) => t.category === 'Rebreed')!;
    const removeNestTask = generated.find((t) => t.title.startsWith('Remove Nestbox:'))!;

    expect(isPalpationTask(palpTask)).toBe(true);
    expect(isPalpationTask({ ...palpTask, linkedBreedingId: '' })).toBe(false);
    expect(isBirthCheckTask(birthTask)).toBe(true);
    expect(isBirthCheckTask(palpTask)).toBe(false);

    // Mark Place Nestbox already completed + add another breeding's task + manual unrelated chore
    const otherBreedingTask = makeManualTask('other-b-task', {
      linkedBreedingId: 'b-other',
      category: 'Birth Check',
      title: 'Check Nestbox for Kits: Other',
    });
    const manualLinkedTask = makeManualTask('manual-linked', {
      linkedBreedingId: 'b-missed',
      category: 'Care',
      title: 'Extra Vitamin Drop',
    });
    const allTasks = [
      ...generated.map((t) => (t.id === nestTask.id ? { ...t, completed: true } : t)),
      otherBreedingTask,
      manualLinkedTask,
    ];

    const cleanup = getPendingBreedingCleanupTasks(allTasks, 'b-missed', profile, [palpTask.id]);
    const cleanupIds = new Set(cleanup.map((t) => t.id));

    expect(cleanupIds.has(birthTask.id)).toBe(true);
    expect(cleanupIds.has(weanTask.id)).toBe(true);
    expect(cleanupIds.has(rebreedTask.id)).toBe(true);
    expect(cleanupIds.has(removeNestTask.id)).toBe(true);
    // Excluded: completed Nestbox task, excluded Palpation task, AFTER_BRED milestone, other breeding task, unrelated Care chore
    expect(cleanupIds.has(nestTask.id)).toBe(false);
    expect(cleanupIds.has(palpTask.id)).toBe(false);
    expect(cleanupIds.has(otherBreedingTask.id)).toBe(false);
    expect(cleanupIds.has(manualLinkedTask.id)).toBe(false);
  });
});
