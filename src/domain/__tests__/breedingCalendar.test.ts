import { describe, expect, it } from 'vitest';
import {
  buildBreedingCalendarMonth,
  computeGregorianEasterDateIso,
  computeMoonPhaseForDateIso,
  describeWmoWeatherCode,
  formatTemperatureForUnit,
  getHolidaysForDateIso,
  getHolidaysForYear,
  normalizeWeatherForecastBundle,
  shiftMonthKey,
} from '../breedingCalendar';
import { BarnTask, BreedingRecord, ShowEvent } from '../models';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

describe('breedingCalendar — offline moon phases, holidays, month grid & weather modeling', () => {
  it('computes accurate offline moon phases, primary quarters, and illumination bounds', () => {
    // Scan a full 31-day month and verify all 4 primary quarters appear cleanly
    const quartersSeen = new Set<string>();
    for (let day = 1; day <= 31; day += 1) {
      const dateIso = `2026-03-${String(day).padStart(2, '0')}`;
      const moon = computeMoonPhaseForDateIso(dateIso);
      expect(moon.ageDays).toBeGreaterThanOrEqual(0);
      expect(moon.ageDays).toBeLessThanOrEqual(30);
      expect(moon.illuminationPercent).toBeGreaterThanOrEqual(0);
      expect(moon.illuminationPercent).toBeLessThanOrEqual(100);
      expect(moon.label.length).toBeGreaterThan(2);
      if (moon.isPrimaryQuarterDay && moon.primaryQuarterId) {
        quartersSeen.add(moon.primaryQuarterId);
      }
    }
    expect(quartersSeen.has('new_moon')).toBe(true);
    expect(quartersSeen.has('first_quarter')).toBe(true);
    expect(quartersSeen.has('full_moon')).toBe(true);
    expect(quartersSeen.has('last_quarter')).toBe(true);

    // Reference epoch New Moon 2000-01-06 must resolve as New Moon with near-0% illumination
    const epochMoon = computeMoonPhaseForDateIso('2000-01-06');
    expect(epochMoon.phaseId).toBe('new_moon');
    expect(epochMoon.illuminationPercent).toBeLessThanOrEqual(2);
  });

  it('computes Gregorian Easter and seasonal/US holidays deterministically', () => {
    expect(computeGregorianEasterDateIso(2026)).toBe('2026-04-05');
    expect(computeGregorianEasterDateIso(2027)).toBe('2027-03-28');

    const holidays2026 = getHolidaysForYear(2026);
    expect(holidays2026.some((h) => h.dateIso === '2026-01-01' && h.name === "New Year's Day")).toBe(true);
    expect(holidays2026.some((h) => h.dateIso === '2026-04-05' && h.name === 'Easter Sunday')).toBe(true);
    expect(holidays2026.some((h) => h.dateIso === '2026-05-25' && h.name === 'Memorial Day')).toBe(true);
    expect(holidays2026.some((h) => h.dateIso === '2026-11-26' && h.name === 'Thanksgiving Day')).toBe(true);
    expect(getHolidaysForDateIso('2026-12-25')[0]?.shortLabel).toBe('Christmas');
  });

  it('builds a Sunday–Saturday calendar month with Dec/Jan holiday wraparound, breeding/task/show events, and weather strip', () => {
    const rabbit = makeSpeciesProfile('Rabbit');
    const doe = makeAnimal('d1', { name: 'Clover', sex: 'Female' });
    const buck = makeAnimal('s1', { name: 'Bramble', sex: 'Male' });

    const breedings: BreedingRecord[] = [
      {
        id: 'br-active',
        species: 'Rabbit',
        sireId: buck.id,
        sireName: buck.name,
        damId: doe.id,
        damName: doe.name,
        bredDateIso: '2026-12-01',
        expectedDueDateIso: '2027-01-01',
        actualBirthDateIso: '',
        ultrasoundProjectedDueIso: '2026-12-30',
        status: 'Palpated Positive',
        projectedCoiPercent: 0,
        liveCount: 0,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        offspringCreated: false,
        notes: '',
        createdAt: '2026-12-01T12:00:00Z',
        updatedAt: '2026-12-01T12:00:00Z',
      },
      {
        id: 'br-born',
        species: 'Rabbit',
        sireId: buck.id,
        sireName: buck.name,
        damId: doe.id,
        damName: doe.name,
        bredDateIso: '2026-11-10',
        expectedDueDateIso: '2026-12-11',
        actualBirthDateIso: '2026-12-12',
        status: 'Born',
        projectedCoiPercent: 0,
        liveCount: 7,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        offspringCreated: true,
        notes: '',
        createdAt: '2026-11-10T12:00:00Z',
        updatedAt: '2026-12-12T12:00:00Z',
      },
    ];

    const tasks: BarnTask[] = [
      {
        id: 't-1',
        species: 'Rabbit',
        title: 'Place nestbox for Clover',
        category: 'Nestbox',
        dueDateIso: '2026-12-27',
        priority: 'High',
        completed: false,
        linkedBreedingId: 'br-active',
        linkedAnimalId: doe.id,
        linkedAnimalName: doe.name,
        createdAt: '2026-12-01T12:00:00Z',
        updatedAt: '2026-12-01T12:00:00Z',
      },
    ];

    const shows: ShowEvent[] = [
      {
        id: 'sh-1',
        species: 'Rabbit',
        name: 'Winter Classic',
        eventDateIso: '2026-12-19',
        entryDeadlineIso: '2026-12-10',
        location: 'Columbus, OH',
        sanctioningBody: 'ARBA',
        enteredAnimalIds: [doe.id],
        notes: '',
        createdAt: '2026-11-01T12:00:00Z',
        updatedAt: '2026-11-01T12:00:00Z',
      },
    ];

    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');

    const model = buildBreedingCalendarMonth({
      monthKey: '2026-12',
      speciesProfile: rabbit,
      breedings,
      tasks,
      shows,
      animals: [doe, buck],
      weatherDays: [
        {
          dateIso: '2026-12-19',
          tempMaxC: 5,
          tempMinC: -2,
          precipitationProbabilityMax: 15,
          weatherCode: 2,
          label: 'Partly Cloudy',
          iconEmoji: '⛅',
        },
      ],
      showMoonPhases: true,
      showHolidays: true,
      todayIso: '2026-12-19',
    });

    expect(model.monthLabel).toBe('December 2026');
    expect(model.prevMonthKey).toBe('2026-11');
    expect(model.nextMonthKey).toBe('2027-01');
    expect(model.dueCount).toBe(1);
    expect(model.birthCount).toBe(1);
    expect(model.taskCount).toBe(1);
    expect(model.showCount).toBe(1);

    const allCells = model.weeks.flat();
    // January 1 2027 appears inside the trailing week of December 2026 grid
    const jan1Cell = allCells.find((c) => c.dateIso === '2027-01-01');
    expect(jan1Cell).toBeDefined();
    expect(jan1Cell?.inCurrentMonth).toBe(false);
    expect(jan1Cell?.holidays.some((h) => h.name === "New Year's Day")).toBe(true);

    const dec19 = allCells.find((c) => c.dateIso === '2026-12-19');
    expect(dec19?.isToday).toBe(true);
    expect(dec19?.weather?.label).toBe('Partly Cloudy');
    expect(dec19?.events.some((e) => e.kind === 'show')).toBe(true);

    const dec30 = allCells.find((c) => c.dateIso === '2026-12-30');
    expect(dec30?.events.some((e) => e.kind === 'breeding_due')).toBe(true);

    // Toggling moon phases and holidays off omits quarter highlights & holiday markers
    const suppressed = buildBreedingCalendarMonth({
      monthKey: '2026-12',
      speciesProfile: rabbit,
      breedings: [],
      tasks: [],
      shows: [],
      animals: [],
      showMoonPhases: false,
      showHolidays: false,
    });
    expect(suppressed.weeks.flat().every((c) => c.holidays.length === 0)).toBe(true);
    expect(suppressed.weeks.flat().every((c) => !c.moonPhase.isPrimaryQuarterDay)).toBe(true);
  });

  it('formats F/C temperatures, describes WMO weather codes, and normalizes forecast bundles safely', () => {
    expect(formatTemperatureForUnit(0, 'F')).toBe('32°F');
    expect(formatTemperatureForUnit(20, 'C')).toBe('20°C');
    expect(formatTemperatureForUnit(Number.NaN, 'F')).toBe('—');
    expect(describeWmoWeatherCode(95).label).toBe('Thunderstorm');

    expect(normalizeWeatherForecastBundle(null)).toBeNull();
    const valid = normalizeWeatherForecastBundle({
      fetchedAtIso: '2026-11-23T12:00:00Z',
      locationLabel: 'Columbus, OH',
      latitude: 39.9612,
      longitude: -82.9988,
      days: [
        { dateIso: '2026-11-23', tempMaxC: 10.44, tempMinC: 1.24, precipitationProbabilityMax: 120, weatherCode: 61 },
        { dateIso: 'bad-date', tempMaxC: 10, tempMinC: 2, weatherCode: 0 },
      ],
    });
    expect(valid).not.toBeNull();
    expect(valid?.days).toHaveLength(1);
    expect(valid?.days[0].precipitationProbabilityMax).toBe(100);
    expect(valid?.days[0].label).toBe('Rain');
  });
});
