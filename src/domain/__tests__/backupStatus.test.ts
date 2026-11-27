import { describe, expect, it } from 'vitest';
import {
  evaluateBackupStatus,
  formatLocalDateTimeReadable,
  formatRelativeBackupAge,
  getLatestSnapshotTimestamp,
  hasNonTestingBarnData,
  LastBackupMeta,
} from '../backupStatus';
import { makeAnimal, makeEmptySnapshot, makeSettings } from './testFixtures';

describe('backupStatus — freshness evaluation, sample gating & readable timestamps', () => {
  it('distinguishes sample-only testing herds from non-testing breeder data', () => {
    const sampleOnly = makeEmptySnapshot({
      animals: [makeAnimal('seed-rabbit-1', { name: 'Demo Buck' })],
    });
    expect(hasNonTestingBarnData(sampleOnly)).toBe(false);

    const withRealAnimal = makeEmptySnapshot({
      animals: [
        makeAnimal('seed-rabbit-1', { name: 'Demo Buck' }),
        makeAnimal('real-animal-1', { name: 'Barn Buck' }),
      ],
    });
    expect(hasNonTestingBarnData(withRealAnimal)).toBe(true);

    const withCustomSpecies = makeEmptySnapshot({
      speciesProfiles: [
        {
          id: 'sp-buffalo',
          name: 'Water Buffalo',
          sortOrder: 0,
          gestationDays: 315,
          rebreedDaysAfterBirth: 60,
          weanDaysAfterBirth: 180,
          birthEventLabel: 'Calving',
          maleLabel: 'Bull',
          femaleLabel: 'Cow',
          offspringLabel: 'Calf',
          exampleBreeds: ['Murrah'],
          milestones: [],
          createdAt: '2026-03-01T12:00:00.000Z',
          updatedAt: '2026-03-01T12:00:00.000Z',
        },
      ],
    });
    expect(hasNonTestingBarnData(withCustomSpecies)).toBe(true);
  });

  it('finds the newest ISO updatedAt timestamp across all collections and settings', () => {
    const snap = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-01-01T00:00:00.000Z' }),
      animals: [makeAnimal('a1', { updatedAt: '2026-04-10T08:30:00.000Z' })],
      shows: [
        {
          id: 'sh1',
          species: 'Rabbit',
          name: 'Spring Classic',
          location: 'Fairgrounds',
          sanctioningBody: 'ARBA',
          eventDateIso: '2026-05-01',
          entryDeadlineIso: '2026-04-20',
          enteredAnimalIds: ['a1'],
          notes: 'BOB',
          createdAt: '2026-05-01T08:00:00.000Z',
          updatedAt: '2026-05-02T14:15:00.000Z',
        },
      ],
    });

    expect(getLatestSnapshotTimestamp(snap)).toBe('2026-05-02T14:15:00.000Z');
  });

  it('evaluates never_backed_up, up_to_date, changes_pending, overdue, and 24h snooze states', () => {
    const nowMs = new Date('2026-06-15T12:00:00.000Z').getTime();
    const snap = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-06-14T10:00:00.000Z' }),
      animals: [makeAnimal('real-1', { updatedAt: '2026-06-14T11:00:00.000Z' })],
    });

    // 1. Never backed up -> needs reminder & shows banner for real data
    const never = evaluateBackupStatus(snap, null, nowMs, 0);
    expect(never.level).toBe('never_backed_up');
    expect(never.needsReminder).toBe(true);
    expect(never.showDismissibleBanner).toBe(true);

    // 2. Snoozed -> still needsReminder in Settings, but banner hidden
    const snoozed = evaluateBackupStatus(snap, null, nowMs, nowMs + 1000 * 60 * 60);
    expect(snoozed.needsReminder).toBe(true);
    expect(snoozed.showDismissibleBanner).toBe(false);

    // 3. Exported after latest edit -> up_to_date
    const recentBackup: LastBackupMeta = {
      exportedAtIso: '2026-06-14T12:00:00.000Z',
      format: 'json',
      fileName: 'barn-backup.json',
    };
    const upToDate = evaluateBackupStatus(snap, recentBackup, nowMs, 0);
    expect(upToDate.level).toBe('up_to_date');
    expect(upToDate.needsReminder).toBe(false);
    expect(upToDate.showDismissibleBanner).toBe(false);
    expect(upToDate.lastExportLabel).toContain('.JSON');

    // 4. Record edited after last export -> changes_pending
    const editedSnap = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-06-14T10:00:00.000Z' }),
      animals: [makeAnimal('real-1', { updatedAt: '2026-06-15T09:00:00.000Z' })],
    });
    const pending = evaluateBackupStatus(editedSnap, recentBackup, nowMs, 0);
    expect(pending.level).toBe('changes_pending');
    expect(pending.hasChangesSinceBackup).toBe(true);
    expect(pending.showDismissibleBanner).toBe(true);

    // 5. Export >= 7 days old -> overdue
    const oldBackup: LastBackupMeta = {
      exportedAtIso: '2026-06-01T12:00:00.000Z',
      format: 'sqlite',
    };
    const overdue = evaluateBackupStatus(editedSnap, oldBackup, nowMs, 0);
    expect(overdue.level).toBe('overdue');
    expect(overdue.ageDays).toBeGreaterThanOrEqual(7);
    expect(overdue.showDismissibleBanner).toBe(true);
  });

  it('formats readable relative and local timestamps safely', () => {
    const baseMs = new Date('2026-06-15T12:00:00.000Z').getTime();
    expect(formatRelativeBackupAge('2026-06-15T11:59:30.000Z', baseMs)).toBe('just now');
    expect(formatRelativeBackupAge('2026-06-15T11:45:00.000Z', baseMs)).toBe('15m ago');
    expect(formatRelativeBackupAge('2026-06-15T09:00:00.000Z', baseMs)).toBe('3h ago');
    expect(formatRelativeBackupAge('2026-06-10T12:00:00.000Z', baseMs)).toBe('5d ago');
    expect(formatLocalDateTimeReadable(null)).toBe('Not recorded');
  });
});
