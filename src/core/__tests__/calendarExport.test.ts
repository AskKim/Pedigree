import { describe, expect, it } from 'vitest';
import {
  buildExternalCalendarWebUrls,
  buildGoogleCalendarEventPayload,
  buildIcsCalendarForTasks,
  buildTaskAppDeepLink,
  formatExternalCalendarTaskSummary,
  formatIcsAlarmTrigger,
} from '../calendarExport';
import {
  Animal,
  BarnTask,
  BreedingRecord,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  normalizeCalendarSyncSettings,
  SpeciesProfile,
  stripAnimalNamePrefix,
} from '../models';

function makeTask(overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id: 'task-1',
    species: 'Rabbit',
    title: 'Palpation Check: Copper Creek Briar (× Copper Creek Marshal)',
    category: 'Palpation',
    priority: 'High',
    dueDateIso: '2026-11-29',
    linkedAnimalId: 'a1',
    linkedAnimalName: 'Copper Creek Briar',
    linkedBreedingId: 'b1',
    completed: false,
    createdAt: '2026-11-15T12:00:00.000Z',
    updatedAt: '2026-11-15T12:00:00.000Z',
    ...overrides,
  };
}

const rabbitSpecies: SpeciesProfile = {
  id: 'sp-rabbit',
  name: 'Rabbit',
  defaultAnimalPrefix: 'Copper Creek',
  gestationDays: 31,
  rebreedDaysAfterBirth: 28,
  weanDaysAfterBirth: 42,
  birthEventLabel: 'Kindling',
  maleLabel: 'Buck',
  femaleLabel: 'Doe',
  offspringLabel: 'Kit',
  exampleBreeds: ['New Zealand'],
  milestones: [],
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

const damAnimal: Animal = {
  id: 'a1',
  tattoo: 'NZR-102',
  name: 'Copper Creek Briar',
  species: 'Rabbit',
  breed: 'New Zealand',
  variety: 'Red',
  sex: 'Female',
  status: 'Active',
  birthDateIso: '2024-01-01',
  weightGrams: 4200,
  genotype: [],
  genotypeRaw: '',
  registrationNumber: '',
  grandChampionNumber: '',
  legsCount: 0,
  cageLocation: 'R-01',
  breederName: '',
  ownerName: '',
  sireId: '',
  damId: '',
  notes: '',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

const sireAnimal: Animal = {
  ...damAnimal,
  id: 'a2',
  tattoo: 'NZR-051',
  name: 'Copper Creek Marshal',
  sex: 'Male',
};

const sampleBreeding: BreedingRecord = {
  id: 'b1',
  species: 'Rabbit',
  sireId: 'a2',
  damId: 'a1',
  sireName: 'Copper Creek Marshal',
  damName: 'Copper Creek Briar',
  bredDateIso: '2026-11-15',
  expectedDueDateIso: '2026-12-16',
  actualBirthDateIso: '',
  projectedCoiPercent: 0,
  liveCount: 0,
  stillbornCount: 0,
  fosteredCount: 0,
  weanedCount: 0,
  offspringCreated: false,
  status: 'Bred',
  notes: '',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

describe('calendarExport (.ics + VALARM)', () => {
  it('formats RFC 5545 VALARM trigger durations cleanly', () => {
    expect(formatIcsAlarmTrigger(0)).toBe('PT0S');
    expect(formatIcsAlarmTrigger(15)).toBe('-PT15M');
    expect(formatIcsAlarmTrigger(60)).toBe('-PT1H');
    expect(formatIcsAlarmTrigger(1440)).toBe('-P1D');
    expect(formatIcsAlarmTrigger(2880)).toBe('-P2D');
  });

  it('normalizes invalid calendar sync settings safely', () => {
    const norm = normalizeCalendarSyncSettings({
      autoAddNewTasks: true,
      reminderTimeLocal: 'bad-time',
      alarmMinutesBefore: -50,
      includeAnimalPrefix: false,
      includeAnimalName: false,
    });
    expect(norm.autoAddNewTasks).toBe(true);
    expect(norm.reminderTimeLocal).toBe(DEFAULT_CALENDAR_SYNC_SETTINGS.reminderTimeLocal);
    expect(norm.alarmMinutesBefore).toBe(DEFAULT_CALENDAR_SYNC_SETTINGS.alarmMinutesBefore);
    expect(norm.includeAnimalPrefix).toBe(false);
    expect(norm.includeAnimalName).toBe(false);
  });

  it('strips configured prefixes cleanly without returning empty strings', () => {
    expect(stripAnimalNamePrefix('Copper Creek Briar', 'Copper Creek')).toBe('Briar');
    expect(stripAnimalNamePrefix('OR-Ruby', 'OR-')).toBe('Ruby');
    expect(stripAnimalNamePrefix('CC: Snowball', 'CC:')).toBe('Snowball');
    expect(stripAnimalNamePrefix('Copper Creek', 'Copper Creek')).toBe('Copper Creek');
    expect(stripAnimalNamePrefix('Briar', 'Copper Creek')).toBe('Briar');
  });

  it('formats external calendar summaries for prefix, ear number, and appended species', () => {
    const ctx = {
      animals: [damAnimal, sireAnimal],
      breedings: [sampleBreeding],
      speciesProfiles: [rabbitSpecies],
    };
    const task = makeTask();

    expect(
      formatExternalCalendarTaskSummary(
        task,
        { includeAnimalPrefix: true, includeAnimalName: true },
        ctx
      )
    ).toBe('Palpation Check: Copper Creek Briar (× Copper Creek Marshal) [Rabbit]');

    expect(
      formatExternalCalendarTaskSummary(
        task,
        { includeAnimalPrefix: false, includeAnimalName: true },
        ctx
      )
    ).toBe('Palpation Check: Briar (× Marshal) [Rabbit]');

    expect(
      formatExternalCalendarTaskSummary(
        task,
        { includeAnimalPrefix: true, includeAnimalName: false },
        ctx
      )
    ).toBe('Palpation Check: NZR-102 (× NZR-051) [Rabbit]');

    // Manual task linked to an animal without animal name typed in title
    const manualLinkedTask = makeTask({
      id: 'task-manual',
      title: 'Trim front nails',
      linkedBreedingId: '',
      linkedAnimalId: 'a1',
      linkedAnimalName: 'Copper Creek Briar',
    });
    expect(
      formatExternalCalendarTaskSummary(
        manualLinkedTask,
        { includeAnimalPrefix: false, includeAnimalName: true },
        ctx
      )
    ).toBe('Trim front nails — Briar [Rabbit]');
    expect(
      formatExternalCalendarTaskSummary(
        manualLinkedTask,
        { includeAnimalName: false },
        ctx
      )
    ).toBe('Trim front nails — NZR-102 [Rabbit]');
  });

  it('builds valid multi-event .ics with VALARM and task deep links', () => {
    const res = buildIcsCalendarForTasks(
      [
        makeTask({ id: 't1', dueDateIso: '2026-11-29' }),
        makeTask({
          id: 't2',
          title: 'Place Nestbox: Copper Creek Briar',
          category: 'Nestbox',
          dueDateIso: '2026-12-13',
        }),
        makeTask({ id: 't-undated', dueDateIso: '' }),
      ],
      {
        autoAddNewTasks: true,
        includeBreedingTasks: true,
        includeManualTasks: true,
        reminderTimeLocal: '07:30',
        alarmEnabled: true,
        alarmMinutesBefore: 30,
        includeAnimalPrefix: false,
        includeAnimalName: false,
      },
      'Copper Creek Barn',
      'briar-litter-chores',
      {
        animals: [damAnimal, sireAnimal],
        breedings: [sampleBreeding],
        speciesProfiles: [rabbitSpecies],
        appBaseUrl: 'https://barn.local/',
      }
    );

    expect(res).not.toBeNull();
    expect(res!.eventCount).toBe(2);
    expect(res!.filename).toMatch(/^briar-litter-chores-\d{4}-\d{2}-\d{2}\.ics$/);
    expect(res!.icsContent).toContain('\r\n');
    expect(res!.icsContent).toContain('BEGIN:VCALENDAR');
    expect(res!.icsContent).toContain('DTSTART:20261129T073000');
    expect(res!.icsContent).toContain('DTEND:20261129T080000');
    expect(res!.icsContent).toContain('SUMMARY:Palpation Check: NZR-102 (× NZR-051) [Rabbit]');
    expect(res!.icsContent).toContain('Animal Ear #: NZR-102');
    expect(res!.icsContent).not.toContain('Copper Creek Briar');
    expect(res!.icsContent).toContain(
      `URL;VALUE=URI:${buildTaskAppDeepLink('https://barn.local/', { id: 't1', species: 'Rabbit' })}`
    );
    expect(res!.icsContent).toContain('Open Task in App: https://barn.local/?route=dashboard');
    expect(res!.icsContent).toContain('BEGIN:VALARM');
    expect(res!.icsContent).toContain('TRIGGER:-PT30M');
    expect(res!.icsContent).toContain('PRIORITY:1');
    expect(res!.icsContent).not.toContain('t-undated');
  });

  it('omits VALARM when alarmEnabled is false and rolls over midnight end times cleanly', () => {
    const res = buildIcsCalendarForTasks(
      [makeTask({ id: 't-late', dueDateIso: '2026-11-30' })],
      {
        reminderTimeLocal: '23:45',
        alarmEnabled: false,
      },
      'Barn; North, Field'
    );

    expect(res).not.toBeNull();
    expect(res!.icsContent).toContain('DTSTART:20261130T234500');
    expect(res!.icsContent).toContain('DTEND:20261201T001500');
    expect(res!.icsContent).toContain('Barn\\; North\\, Field');
    expect(res!.icsContent).not.toContain('BEGIN:VALARM');
  });

  it('returns null when no tasks have due dates', () => {
    expect(buildIcsCalendarForTasks([makeTask({ dueDateIso: '' })])).toBeNull();
  });

  it('builds Google Calendar event payloads and web template fallback URLs', () => {
    const task = makeTask({ id: 'g1', dueDateIso: '2026-11-29' });
    const ctx = {
      animals: [damAnimal, sireAnimal],
      breedings: [sampleBreeding],
      speciesProfiles: [rabbitSpecies],
      appBaseUrl: 'https://barn.local/',
    };
    const payload = buildGoogleCalendarEventPayload(
      task,
      {
        reminderTimeLocal: '08:15',
        alarmEnabled: true,
        alarmMinutesBefore: 30,
        includeAnimalPrefix: false,
        includeAnimalName: true,
      },
      'Copper Creek Barn',
      'America/Los_Angeles',
      ctx
    );

    expect(payload).not.toBeNull();
    expect(payload!.summary).toBe('Palpation Check: Briar (× Marshal) [Rabbit]');
    expect(payload!.start).toEqual({
      dateTime: '2026-11-29T08:15:00',
      timeZone: 'America/Los_Angeles',
    });
    expect(payload!.end).toEqual({
      dateTime: '2026-11-29T08:45:00',
      timeZone: 'America/Los_Angeles',
    });
    expect(payload!.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    });
    expect(payload!.source?.url).toBe(
      'https://barn.local/?route=dashboard&species=Rabbit&taskId=g1'
    );

    const urls = buildExternalCalendarWebUrls(
      task,
      { reminderTimeLocal: '08:15', includeAnimalName: false },
      'Copper Creek Barn',
      ctx
    );
    expect(urls).not.toBeNull();
    expect(urls!.googleWebUrl).toContain('https://calendar.google.com/calendar/render');
    expect(urls!.googleWebUrl).toContain(encodeURIComponent('Palpation Check: NZR-102 (× NZR-051) [Rabbit]'));
    expect(urls!.outlookWebUrl).toContain('https://outlook.live.com/calendar/0/deeplink/compose');
  });
});
