/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Breeding Calendar Engine with Offline Moon Phases,
 * Calendar Holidays, and Optional Weekly Weather Forecast Strip Modeling.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 * All date arithmetic uses `Date.UTC` over `YYYY-MM-DD` strings so DST/local timezone
 * boundaries never drift a moon phase, holiday, or breeding due date.
 */

import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedingRecord,
  ShowEvent,
  SpeciesProfile,
  TemperatureUnit,
  todayDateIso,
} from './models';

export function isValidYmdIso(iso: string | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return false;
  const [y, m, d] = iso.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Reference astronomical New Moon: 2000-01-06T18:14:00Z
const EPOCH_NEW_MOON_UTC_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
export const SYNODIC_MONTH_DAYS = 29.53058867;
const SYNODIC_MONTH_MS = SYNODIC_MONTH_DAYS * 86_400_000;

export type MoonPhaseId =
  | 'new_moon'
  | 'waxing_crescent'
  | 'first_quarter'
  | 'waxing_gibbous'
  | 'full_moon'
  | 'waning_gibbous'
  | 'last_quarter'
  | 'waning_crescent';

export type MoonPrimaryQuarterId =
  | 'new_moon'
  | 'first_quarter'
  | 'full_moon'
  | 'last_quarter';

export interface MoonPhaseInfo {
  dateIso: string;
  phaseId: MoonPhaseId;
  label: string;
  emoji: string;
  ageDays: number;
  illuminationPercent: number;
  isPrimaryQuarterDay: boolean;
  primaryQuarterId: MoonPrimaryQuarterId | null;
}

export interface CalendarHolidayMarker {
  id: string;
  dateIso: string;
  name: string;
  shortLabel: string;
  category: 'holiday' | 'seasonal';
}

export interface WeatherForecastDay {
  dateIso: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbabilityMax: number | null;
  weatherCode: number;
  label: string;
  iconEmoji: string;
}

export interface WeatherForecastBundle {
  fetchedAtIso: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  days: WeatherForecastDay[];
}

export type BreedingCalendarEventKind =
  | 'breeding_bred'
  | 'breeding_due'
  | 'breeding_birth'
  | 'breeding_wean'
  | 'task'
  | 'show'
  | 'show_deadline';

export interface BreedingCalendarEvent {
  id: string;
  dateIso: string;
  kind: BreedingCalendarEventKind;
  title: string;
  subtitle: string;
  tone: 'sage' | 'terracotta' | 'amber' | 'sky' | 'neutral';
  completed?: boolean;
  breedingId?: string;
  taskId?: string;
  showId?: string;
}

export interface BreedingCalendarDayCell {
  dateIso: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  moonPhase: MoonPhaseInfo;
  holidays: CalendarHolidayMarker[];
  weather: WeatherForecastDay | null;
  events: BreedingCalendarEvent[];
}

export interface BreedingCalendarMonthModel {
  year: number;
  month: number; // 1..12
  monthKey: string; // YYYY-MM
  monthLabel: string;
  prevMonthKey: string;
  nextMonthKey: string;
  weeks: BreedingCalendarDayCell[][];
  eventCount: number;
  dueCount: number;
  birthCount: number;
  taskCount: number;
  showCount: number;
}

function parseYmdParts(dateIso: string): { year: number; month: number; day: number } | null {
  if (!isValidYmdIso(dateIso)) return null;
  const [y, m, d] = dateIso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function formatYmd(year: number, month: number, day: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function positiveMod(value: number, modulus: number): number {
  const rem = value % modulus;
  return rem < 0 ? rem + modulus : rem;
}

/**
 * Computes offline lunar age, illumination %, 8-stage classification, and exact UTC
 * calendar-day quarter transitions (`New Moon`, `First Quarter`, `Full Moon`, `Last Quarter`).
 */
export function computeMoonPhaseForDateIso(dateIso: string): MoonPhaseInfo {
  const parts = parseYmdParts(dateIso);
  if (!parts) {
    return {
      dateIso,
      phaseId: 'new_moon',
      label: 'New Moon',
      emoji: '🌑',
      ageDays: 0,
      illuminationPercent: 0,
      isPrimaryQuarterDay: false,
      primaryQuarterId: null,
    };
  }

  const dayStartMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  const dayNoonMs = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
  const dayEndMs = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0);

  const cycleStart = (dayStartMs - EPOCH_NEW_MOON_UTC_MS) / SYNODIC_MONTH_MS;
  const cycleEnd = (dayEndMs - EPOCH_NEW_MOON_UTC_MS) / SYNODIC_MONTH_MS;
  const cycleNoon = (dayNoonMs - EPOCH_NEW_MOON_UTC_MS) / SYNODIC_MONTH_MS;

  const fraction = positiveMod(cycleNoon, 1);
  const ageDays = Number((fraction * SYNODIC_MONTH_DAYS).toFixed(1));
  const illuminationPercent = Math.round(((1 - Math.cos(2 * Math.PI * fraction)) / 2) * 100);

  // Determine if one of the 4 exact astronomical quarters occurs during this UTC calendar day.
  const qStart = Math.floor(cycleStart * 4);
  const qEnd = Math.floor(cycleEnd * 4);
  let primaryQuarterId: MoonPrimaryQuarterId | null = null;
  if (qEnd > qStart) {
    const crossedQuarter = positiveMod(qEnd, 4);
    if (crossedQuarter === 0) primaryQuarterId = 'new_moon';
    else if (crossedQuarter === 1) primaryQuarterId = 'first_quarter';
    else if (crossedQuarter === 2) primaryQuarterId = 'full_moon';
    else primaryQuarterId = 'last_quarter';
  }

  let phaseId: MoonPhaseId;
  let label: string;
  let emoji: string;

  if (primaryQuarterId === 'new_moon') {
    phaseId = 'new_moon';
    label = 'New Moon';
    emoji = '🌑';
  } else if (primaryQuarterId === 'first_quarter') {
    phaseId = 'first_quarter';
    label = 'First Quarter';
    emoji = '🌓';
  } else if (primaryQuarterId === 'full_moon') {
    phaseId = 'full_moon';
    label = 'Full Moon';
    emoji = '🌕';
  } else if (primaryQuarterId === 'last_quarter') {
    phaseId = 'last_quarter';
    label = 'Last Quarter';
    emoji = '🌗';
  } else {
    const octant = Math.floor(positiveMod(fraction + 0.0625, 1) * 8);
    switch (octant) {
      case 0:
        phaseId = 'new_moon';
        label = 'New Moon';
        emoji = '🌑';
        break;
      case 1:
        phaseId = 'waxing_crescent';
        label = 'Waxing Crescent';
        emoji = '🌒';
        break;
      case 2:
        phaseId = 'first_quarter';
        label = 'First Quarter';
        emoji = '🌓';
        break;
      case 3:
        phaseId = 'waxing_gibbous';
        label = 'Waxing Gibbous';
        emoji = '🌔';
        break;
      case 4:
        phaseId = 'full_moon';
        label = 'Full Moon';
        emoji = '🌕';
        break;
      case 5:
        phaseId = 'waning_gibbous';
        label = 'Waning Gibbous';
        emoji = '🌖';
        break;
      case 6:
        phaseId = 'last_quarter';
        label = 'Last Quarter';
        emoji = '🌗';
        break;
      default:
        phaseId = 'waning_crescent';
        label = 'Waning Crescent';
        emoji = '🌘';
        break;
    }
  }

  return {
    dateIso,
    phaseId,
    label,
    emoji,
    ageDays,
    illuminationPercent,
    isPrimaryQuarterDay: primaryQuarterId !== null,
    primaryQuarterId,
  };
}

/**
 * Computes Gregorian Easter Sunday (Meeus/Jones/Butcher computus algorithm).
 */
export function computeGregorianEasterDateIso(year: number): string {
  const y = Math.floor(year);
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatYmd(y, month, day);
}

function getNthWeekdayOfMonthIso(
  year: number,
  month: number,
  weekday: number, // 0=Sun..6=Sat
  nth: number // 1-based, or -1 for last
): string {
  if (nth < 0) {
    const lastDay = new Date(Date.UTC(year, month, 0));
    const lastDow = lastDay.getUTCDay();
    const diff = positiveMod(lastDow - weekday, 7);
    return formatYmd(year, month, lastDay.getUTCDate() - diff);
  }
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = positiveMod(weekday - firstDow, 7);
  const day = 1 + offset + (nth - 1) * 7;
  return formatYmd(year, month, day);
}

/**
 * Computes standard US/general holidays and seasonal equinox/solstice markers for `year`.
 */
export function getHolidaysForYear(year: number): CalendarHolidayMarker[] {
  const y = Math.floor(year);
  const easterIso = computeGregorianEasterDateIso(y);
  const list: CalendarHolidayMarker[] = [
    { id: `nyd-${y}`, dateIso: formatYmd(y, 1, 1), name: "New Year's Day", shortLabel: "New Year's", category: 'holiday' },
    { id: `mlk-${y}`, dateIso: getNthWeekdayOfMonthIso(y, 1, 1, 3), name: 'Martin Luther King Jr. Day', shortLabel: 'MLK Day', category: 'holiday' },
    { id: `val-${y}`, dateIso: formatYmd(y, 2, 14), name: "Valentine's Day", shortLabel: "Valentine's", category: 'holiday' },
    { id: `pres-${y}`, dateIso: getNthWeekdayOfMonthIso(y, 2, 1, 3), name: "Presidents' Day", shortLabel: "Presidents' Day", category: 'holiday' },
    { id: `vernal-${y}`, dateIso: formatYmd(y, 3, 20), name: 'Spring Equinox', shortLabel: 'Spring Equinox', category: 'seasonal' },
    { id: `easter-${y}`, dateIso: easterIso, name: 'Easter Sunday', shortLabel: 'Easter', category: 'holiday' },
    { id: `memorial-${y}`, dateIso: getNthWeekdayOfMonthIso(y, 5, 1, -1), name: 'Memorial Day', shortLabel: 'Memorial Day', category: 'holiday' },
    { id: `juneteenth-${y}`, dateIso: formatYmd(y, 6, 19), name: 'Juneteenth', shortLabel: 'Juneteenth', category: 'holiday' },
    { id: `summer-${y}`, dateIso: formatYmd(y, 6, 21), name: 'Summer Solstice', shortLabel: 'Summer Solstice', category: 'seasonal' },
    { id: `july4-${y}`, dateIso: formatYmd(y, 7, 4), name: 'Independence Day', shortLabel: 'July 4th', category: 'holiday' },
    { id: `labor-${y}`, dateIso: getNthWeekdayOfMonthIso(y, 9, 1, 1), name: 'Labor Day', shortLabel: 'Labor Day', category: 'holiday' },
    { id: `autumn-${y}`, dateIso: formatYmd(y, 9, 22), name: 'Autumn Equinox', shortLabel: 'Autumn Equinox', category: 'seasonal' },
    { id: `columbus-${y}`, dateIso: getNthWeekdayOfMonthIso(y, 10, 1, 2), name: 'Indigenous Peoples / Columbus Day', shortLabel: 'Oct Holiday', category: 'holiday' },
    { id: `halloween-${y}`, dateIso: formatYmd(y, 10, 31), name: 'Halloween', shortLabel: 'Halloween', category: 'holiday' },
    { id: `veterans-${y}`, dateIso: formatYmd(y, 11, 11), name: 'Veterans Day', shortLabel: 'Veterans Day', category: 'holiday' },
    { id: `thanksgiving-${y}`, dateIso: getNthWeekdayOfMonthIso(y, 11, 4, 4), name: 'Thanksgiving Day', shortLabel: 'Thanksgiving', category: 'holiday' },
    { id: `winter-${y}`, dateIso: formatYmd(y, 12, 21), name: 'Winter Solstice', shortLabel: 'Winter Solstice', category: 'seasonal' },
    { id: `christmas-${y}`, dateIso: formatYmd(y, 12, 25), name: 'Christmas Day', shortLabel: 'Christmas', category: 'holiday' },
    { id: `nye-${y}`, dateIso: formatYmd(y, 12, 31), name: "New Year's Eve", shortLabel: "New Year's Eve", category: 'holiday' },
  ];
  return list.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

export function getHolidaysForDateIso(dateIso: string): CalendarHolidayMarker[] {
  const parts = parseYmdParts(dateIso);
  if (!parts) return [];
  return getHolidaysForYear(parts.year).filter((h) => h.dateIso === dateIso);
}

/**
 * Formats Celsius temperature into `°F` or `°C` cleanly.
 */
export function formatTemperatureForUnit(tempC: number, unit: TemperatureUnit = 'F'): string {
  if (!Number.isFinite(tempC)) return '—';
  if (unit === 'C') {
    return `${Math.round(tempC)}°C`;
  }
  const f = (tempC * 9) / 5 + 32;
  return `${Math.round(f)}°F`;
}

/**
 * Maps standard WMO Open-Meteo weather codes into concise plain-text labels and icons.
 */
export function describeWmoWeatherCode(code: number): { label: string; iconEmoji: string } {
  const c = Number.isFinite(code) ? Math.round(code) : -1;
  if (c === 0) return { label: 'Clear Sky', iconEmoji: '☀️' };
  if (c === 1) return { label: 'Mainly Clear', iconEmoji: '🌤️' };
  if (c === 2) return { label: 'Partly Cloudy', iconEmoji: '⛅' };
  if (c === 3) return { label: 'Overcast', iconEmoji: '☁️' };
  if (c === 45 || c === 48) return { label: 'Fog', iconEmoji: '🌫️' };
  if (c >= 51 && c <= 57) return { label: 'Drizzle', iconEmoji: '🌦️' };
  if (c >= 61 && c <= 67) return { label: 'Rain', iconEmoji: '🌧️' };
  if (c >= 71 && c <= 77) return { label: 'Snow', iconEmoji: '❄️' };
  if (c >= 80 && c <= 82) return { label: 'Rain Showers', iconEmoji: '🌦️' };
  if (c === 85 || c === 86) return { label: 'Snow Showers', iconEmoji: '🌨️' };
  if (c >= 95 && c <= 99) return { label: 'Thunderstorm', iconEmoji: '⛈️' };
  return { label: 'Forecast', iconEmoji: '🌡️' };
}

export function normalizeWeatherForecastBundle(raw: unknown): WeatherForecastBundle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const lat = Number(obj.latitude);
  const lon = Number(obj.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const days: WeatherForecastDay[] = [];
  for (const item of rawDays) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const d = item as Record<string, unknown>;
    const dateIso = typeof d.dateIso === 'string' && isValidYmdIso(d.dateIso) ? d.dateIso : '';
    const tempMaxC = Number(d.tempMaxC);
    const tempMinC = Number(d.tempMinC);
    if (!dateIso || !Number.isFinite(tempMaxC) || !Number.isFinite(tempMinC)) continue;
    const precipRaw = d.precipitationProbabilityMax;
    const precipitationProbabilityMax =
      precipRaw === null || precipRaw === undefined || !Number.isFinite(Number(precipRaw))
        ? null
        : Math.max(0, Math.min(100, Math.round(Number(precipRaw))));
    const weatherCode = Number.isFinite(Number(d.weatherCode)) ? Math.round(Number(d.weatherCode)) : 0;
    const described = describeWmoWeatherCode(weatherCode);
    days.push({
      dateIso,
      tempMaxC: Number(tempMaxC.toFixed(1)),
      tempMinC: Number(tempMinC.toFixed(1)),
      precipitationProbabilityMax,
      weatherCode,
      label: typeof d.label === 'string' && d.label.trim() ? d.label.trim().slice(0, 40) : described.label,
      iconEmoji:
        typeof d.iconEmoji === 'string' && d.iconEmoji.trim()
          ? d.iconEmoji.trim().slice(0, 8)
          : described.iconEmoji,
    });
  }
  if (days.length === 0) return null;
  return {
    fetchedAtIso:
      typeof obj.fetchedAtIso === 'string' && obj.fetchedAtIso ? obj.fetchedAtIso : '',
    locationLabel:
      typeof obj.locationLabel === 'string' && obj.locationLabel.trim()
        ? obj.locationLabel.trim().slice(0, 120)
        : `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    latitude: Number(lat.toFixed(4)),
    longitude: Number(lon.toFixed(4)),
    days: days.slice(0, 14),
  };
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec((monthKey || '').trim());
  if (m) {
    const year = Math.max(1970, Math.min(2100, Number(m[1])));
    const month = Math.max(1, Math.min(12, Number(m[2])));
    return { year, month };
  }
  const today = todayDateIso();
  const [yStr, mStr] = today.split('-');
  return { year: Number(yStr) || 2026, month: Number(mStr) || 1 };
}

export function formatMonthKey(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month - 1, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const dt = new Date(Date.UTC(year, month - 1 + Math.round(deltaMonths), 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Builds a complete Sunday–Saturday monthly Breeding Calendar model containing
 * breeding pairings, due dates, births, weaning targets, BarnTasks, Shows,
 * offline moon phases, offline holidays, and any cached/live weather forecast days.
 */
export function buildBreedingCalendarMonth(params: {
  monthKey: string;
  speciesProfile: SpeciesProfile;
  breedings: BreedingRecord[];
  tasks: BarnTask[];
  shows: ShowEvent[];
  animals: Animal[];
  weatherDays?: WeatherForecastDay[];
  showMoonPhases?: boolean;
  showHolidays?: boolean;
  todayIso?: string;
}): BreedingCalendarMonthModel {
  const { year, month } = parseMonthKey(params.monthKey);
  const todayIso = params.todayIso && isValidYmdIso(params.todayIso) ? params.todayIso : todayDateIso();
  const showMoonPhases = params.showMoonPhases !== false;
  const showHolidays = params.showHolidays !== false;

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startDow = firstOfMonth.getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  const gridStartIso = formatYmd(year, month, 1 - startDow);
  const gridEndIso = addDaysIso(gridStartIso, totalCells - 1);

  const weatherByDate = new Map<string, WeatherForecastDay>();
  for (const w of params.weatherDays ?? []) {
    weatherByDate.set(w.dateIso, w);
  }

  // Gather holidays for all years touched by this grid (handles Dec/Jan wraparound)
  const touchedYears = new Set<number>([
    Number(gridStartIso.slice(0, 4)),
    year,
    Number(gridEndIso.slice(0, 4)),
  ]);
  const holidaysByDate = new Map<string, CalendarHolidayMarker[]>();
  if (showHolidays) {
    for (const yr of touchedYears) {
      for (const h of getHolidaysForYear(yr)) {
        const bucket = holidaysByDate.get(h.dateIso) || [];
        bucket.push(h);
        holidaysByDate.set(h.dateIso, bucket);
      }
    }
  }

  const eventsByDate = new Map<string, BreedingCalendarEvent[]>();
  const addEvent = (ev: BreedingCalendarEvent) => {
    if (!isValidYmdIso(ev.dateIso)) return;
    if (ev.dateIso < gridStartIso || ev.dateIso > gridEndIso) return;
    const list = eventsByDate.get(ev.dateIso) || [];
    list.push(ev);
    eventsByDate.set(ev.dateIso, list);
  };

  let dueCount = 0;
  let birthCount = 0;
  let taskCount = 0;
  let showCount = 0;

  const birthLabel = params.speciesProfile.birthEventLabel || 'Birth';
  const taskBreedingWeanKeys = new Set<string>();
  for (const t of params.tasks) {
    if (t.linkedBreedingId && t.category === 'Weaning' && t.dueDateIso) {
      taskBreedingWeanKeys.add(`${t.linkedBreedingId}::${t.dueDateIso}`);
    }
    if (t.dueDateIso) {
      if (t.dueDateIso.startsWith(formatMonthKey(year, month))) {
        taskCount += 1;
      }
      addEvent({
        id: `task-${t.id}`,
        dateIso: t.dueDateIso,
        kind: 'task',
        title: t.title,
        subtitle: t.linkedAnimalName
          ? `${t.category} · ${t.linkedAnimalName}`
          : `${t.category} (${t.priority})`,
        tone: t.completed ? 'neutral' : t.priority === 'High' ? 'terracotta' : 'sage',
        completed: t.completed,
        taskId: t.id,
        breedingId: t.linkedBreedingId || undefined,
      });
    }
  }

  for (const b of params.breedings) {
    const pairTitle = `${b.damName || 'Dam'} × ${b.sireName || 'Sire'}`;
    if (b.bredDateIso) {
      addEvent({
        id: `bred-${b.id}`,
        dateIso: b.bredDateIso,
        kind: 'breeding_bred',
        title: `Bred: ${pairTitle}`,
        subtitle: `Status: ${b.status}`,
        tone: 'sky',
        breedingId: b.id,
      });
    }

    const effectiveDue = b.ultrasoundProjectedDueIso || b.expectedDueDateIso;
    if (effectiveDue && b.status !== 'Born' && b.status !== 'Weaned' && b.status !== 'Missed') {
      if (effectiveDue.startsWith(formatMonthKey(year, month))) {
        dueCount += 1;
      }
      addEvent({
        id: `due-${b.id}`,
        dateIso: effectiveDue,
        kind: 'breeding_due',
        title: `Due (${birthLabel}): ${pairTitle}`,
        subtitle: b.ultrasoundProjectedDueIso
          ? 'Ultrasound projected due date'
          : `Gestation ${params.speciesProfile.gestationDays}d`,
        tone: 'terracotta',
        breedingId: b.id,
      });
    }

    if (b.actualBirthDateIso) {
      if (b.actualBirthDateIso.startsWith(formatMonthKey(year, month))) {
        birthCount += 1;
      }
      addEvent({
        id: `birth-${b.id}`,
        dateIso: b.actualBirthDateIso,
        kind: 'breeding_birth',
        title: `${birthLabel}: ${pairTitle}`,
        subtitle: `${b.liveCount} live${b.stillbornCount > 0 ? `, ${b.stillbornCount} stillborn` : ''}`,
        tone: 'sage',
        breedingId: b.id,
      });

      const estimatedWean = addDaysIso(
        b.actualBirthDateIso,
        params.speciesProfile.weanDaysAfterBirth
      );
      if (estimatedWean && !taskBreedingWeanKeys.has(`${b.id}::${estimatedWean}`)) {
        addEvent({
          id: `wean-${b.id}`,
          dateIso: estimatedWean,
          kind: 'breeding_wean',
          title: `Wean Target: ${pairTitle}`,
          subtitle: `${params.speciesProfile.weanDaysAfterBirth}d post-${birthLabel.toLowerCase()}`,
          tone: 'amber',
          breedingId: b.id,
        });
      }
    }
  }

  for (const s of params.shows) {
    if (s.eventDateIso) {
      if (s.eventDateIso.startsWith(formatMonthKey(year, month))) {
        showCount += 1;
      }
      addEvent({
        id: `show-${s.id}`,
        dateIso: s.eventDateIso,
        kind: 'show',
        title: `Show: ${s.name}`,
        subtitle: `${s.location || s.sanctioningBody || 'Show Event'} (${s.enteredAnimalIds.length} entered)`,
        tone: 'amber',
        showId: s.id,
      });
    }
    if (s.entryDeadlineIso) {
      addEvent({
        id: `show-deadline-${s.id}`,
        dateIso: s.entryDeadlineIso,
        kind: 'show_deadline',
        title: `Entry Deadline: ${s.name}`,
        subtitle: s.sanctioningBody || 'Show Entry Cutoff',
        tone: 'amber',
        showId: s.id,
      });
    }
  }

  const weeks: BreedingCalendarDayCell[][] = [];
  const currentMonthKey = formatMonthKey(year, month);
  let eventCount = 0;

  for (let i = 0; i < totalCells; i += 1) {
    const dateIso = addDaysIso(gridStartIso, i);
    const inCurrentMonth = dateIso.startsWith(currentMonthKey);
    const dayOfMonth = Number(dateIso.slice(8, 10));
    const rawMoon = computeMoonPhaseForDateIso(dateIso);
    const moonPhase: MoonPhaseInfo = showMoonPhases
      ? rawMoon
      : {
          ...rawMoon,
          isPrimaryQuarterDay: false,
          primaryQuarterId: null,
        };
    const events = (eventsByDate.get(dateIso) || []).slice().sort((a, b) => {
      const order: Record<BreedingCalendarEventKind, number> = {
        breeding_due: 0,
        breeding_birth: 1,
        show: 2,
        breeding_bred: 3,
        task: 4,
        breeding_wean: 5,
        show_deadline: 6,
      };
      return order[a.kind] - order[b.kind] || a.title.localeCompare(b.title);
    });
    if (inCurrentMonth) {
      eventCount += events.length;
    }
    const weekIdx = Math.floor(i / 7);
    if (!weeks[weekIdx]) weeks[weekIdx] = [];
    weeks[weekIdx].push({
      dateIso,
      dayOfMonth,
      inCurrentMonth,
      isToday: dateIso === todayIso,
      moonPhase,
      holidays: showHolidays ? holidaysByDate.get(dateIso) || [] : [],
      weather: weatherByDate.get(dateIso) || null,
      events,
    });
  }

  return {
    year,
    month,
    monthKey: currentMonthKey,
    monthLabel: `${MONTH_NAMES[month - 1]} ${year}`,
    prevMonthKey: shiftMonthKey(currentMonthKey, -1),
    nextMonthKey: shiftMonthKey(currentMonthKey, 1),
    weeks,
    eventCount,
    dueCount,
    birthCount,
    taskCount,
    showCount,
  };
}
