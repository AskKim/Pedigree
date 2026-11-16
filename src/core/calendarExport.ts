/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * RFC 5545 iCalendar (`.ics`) Task & Breeding Milestone Export Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 * Generates standards-compliant `.ics` files with optional `VALARM` notifications,
 * configurable animal name / prefix / ear-number formatting, appended species tags,
 * and direct deep links back into the app's task entry.
 */

import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedingRecord,
  CalendarSyncSettings,
  isSameSpecies,
  normalizeCalendarSyncSettings,
  nowIsoUtc,
  SpeciesProfile,
  stripAnimalNamePrefix,
} from './models';

export const CALENDAR_ALARM_LEAD_OPTIONS: Array<{ minutes: number; label: string }> = [
  { minutes: 0, label: 'At scheduled task time' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
];

export interface CalendarExportContext {
  animals?: Animal[];
  breedings?: BreedingRecord[];
  speciesProfiles?: SpeciesProfile[];
  appBaseUrl?: string;
}

function escapeIcsText(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'barn-task'
  );
}

/**
 * Formats an RFC 5545 `VALARM` `TRIGGER` duration for `minutesBefore` >= 0.
 */
export function formatIcsAlarmTrigger(minutesBefore: number): string {
  const safeMinutes = Math.max(0, Math.round(Number(minutesBefore) || 0));
  if (safeMinutes === 0) return 'PT0S';
  if (safeMinutes % 1440 === 0) {
    return `-P${safeMinutes / 1440}D`;
  }
  if (safeMinutes % 60 === 0) {
    return `-PT${safeMinutes / 60}H`;
  }
  return `-PT${safeMinutes}M`;
}

function formatLocalFloatingDateTime(
  dateIso: string,
  hour: number,
  minute: number
): string {
  const compact = dateIso.replace(/-/g, '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${compact}T${hh}${mm}00`;
}

function formatUtcStamp(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) {
    return '20260101T000000Z';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Builds a deep link URL pointing directly to the task entry inside the app's Species Dashboard.
 */
export function buildTaskAppDeepLink(
  appBaseUrl: string | undefined,
  task: Pick<BarnTask, 'id' | 'species'>
): string {
  const cleanBase = (appBaseUrl || '').trim().split(/[?#]/)[0];
  if (!cleanBase) return '';
  return `${cleanBase}?route=dashboard&species=${encodeURIComponent(
    task.species
  )}&taskId=${encodeURIComponent(task.id)}`;
}

function resolveAnimalDisplayToken(
  rawName: string,
  animal: Animal | undefined,
  config: CalendarSyncSettings,
  prefix: string
): string {
  const cleanName = (rawName || animal?.name || '').trim();
  const ear = (animal?.tattoo || '').trim();
  if (!config.includeAnimalName) {
    if (ear) return ear;
    return config.includeAnimalPrefix
      ? cleanName
      : stripAnimalNamePrefix(cleanName, prefix);
  }
  if (!config.includeAnimalPrefix) {
    return stripAnimalNamePrefix(cleanName, prefix);
  }
  return cleanName;
}

interface FormattedTaskTitleResult {
  title: string;
  matchedAnyInTitle: boolean;
  dam: Animal | undefined;
  prefix: string;
  config: CalendarSyncSettings;
}

function formatTaskTitleCore(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  context?: CalendarExportContext
): FormattedTaskTitleResult {
  const config = normalizeCalendarSyncSettings(rawConfig);
  const speciesProfile = context?.speciesProfiles?.find((sp) =>
    isSameSpecies(sp.name, task.species)
  );
  const prefix = (speciesProfile?.defaultAnimalPrefix || '').trim();

  const animalById = new Map<string, Animal>();
  for (const a of context?.animals || []) {
    animalById.set(a.id, a);
  }

  const breeding = task.linkedBreedingId
    ? context?.breedings?.find((b) => b.id === task.linkedBreedingId)
    : undefined;

  const dam =
    (breeding?.damId ? animalById.get(breeding.damId) : undefined) ||
    (task.linkedAnimalId ? animalById.get(task.linkedAnimalId) : undefined);
  const sire = breeding?.sireId ? animalById.get(breeding.sireId) : undefined;

  const replacementMap = new Map<string, string>();
  const registerReplacement = (rawName: string, animal: Animal | undefined) => {
    const key = (rawName || '').trim();
    if (!key) return;
    const token = resolveAnimalDisplayToken(key, animal, config, prefix);
    if (token) {
      replacementMap.set(key.toLowerCase(), token);
    }
  };

  if (dam) {
    registerReplacement(dam.name, dam);
  }
  if (breeding?.damName) {
    registerReplacement(breeding.damName, dam);
  }
  if (task.linkedAnimalName) {
    registerReplacement(task.linkedAnimalName, dam);
  }
  if (sire) {
    registerReplacement(sire.name, sire);
  }
  if (breeding?.sireName) {
    registerReplacement(breeding.sireName, sire);
  }

  let formattedTitle = (task.title || '').trim();
  const rawNames = new Set<string>();
  for (const candidate of [
    dam?.name,
    breeding?.damName,
    task.linkedAnimalName,
    sire?.name,
    breeding?.sireName,
  ]) {
    const clean = (candidate || '').trim();
    if (clean) rawNames.add(clean);
  }

  let matchedAnyInTitle = false;
  if (rawNames.size > 0 && formattedTitle) {
    const sortedNames = Array.from(rawNames).sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
      sortedNames.map((n) => escapeRegExp(n)).join('|'),
      'gi'
    );
    formattedTitle = formattedTitle.replace(pattern, (match) => {
      matchedAnyInTitle = true;
      return replacementMap.get(match.toLowerCase()) || match;
    });
  }

  return {
    title: formattedTitle,
    matchedAnyInTitle,
    dam,
    prefix,
    config,
  };
}

/**
 * Formats an in-app `BarnTask.title` according to user preferences across the system:
 * - Optionally excludes the animal's name prefix (`includeAnimalPrefix: false`)
 * - Optionally excludes the animal's name entirely and uses its ear number/tattoo (`includeAnimalName: false`)
 * Note: Canonical stored `BarnTask.title` values stay intact so toggling preferences updates
 * existing and future tasks non-destructively.
 */
export function formatSystemTaskTitle(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  context?: CalendarExportContext
): string {
  return formatTaskTitleCore(task, rawConfig, context).title;
}

/**
 * Formats an external calendar task summary according to user preferences:
 * - Optionally excludes the animal's name prefix (`includeAnimalPrefix: false`)
 * - Optionally excludes the animal's name entirely and uses its ear number/tattoo (`includeAnimalName: false`)
 * - Always appends `[Species]` at the end of the external calendar task title
 */
export function formatExternalCalendarTaskSummary(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  context?: CalendarExportContext
): string {
  const {
    title,
    matchedAnyInTitle,
    dam,
    prefix,
    config,
  } = formatTaskTitleCore(task, rawConfig, context);

  let formattedTitle = title;

  // If a manual chore is linked to an animal whose name wasn't typed in the chore title,
  // append the configured animal identifier (name, unprefixed name, or ear number).
  if (!matchedAnyInTitle && (dam || task.linkedAnimalName)) {
    const fallbackRaw = dam?.name || task.linkedAnimalName || '';
    const refToken = resolveAnimalDisplayToken(fallbackRaw, dam, config, prefix);
    if (refToken && !formattedTitle.toLowerCase().includes(refToken.toLowerCase())) {
      formattedTitle = formattedTitle ? `${formattedTitle} — ${refToken}` : refToken;
    }
  }

  const speciesLower = (task.species || '').trim().toLowerCase();
  if (speciesLower) {
    const endsWithBracketSpecies = formattedTitle
      .toLowerCase()
      .endsWith(`[${speciesLower}]`);
    const endsWithParenSpecies = formattedTitle
      .toLowerCase()
      .endsWith(`(${speciesLower})`);
    if (!endsWithBracketSpecies && !endsWithParenSpecies) {
      formattedTitle = formattedTitle
        ? `${formattedTitle} [${task.species}]`
        : `[${task.species}]`;
    }
  }

  return formattedTitle;
}

export interface GeneratedCalendarIcs {
  icsContent: string;
  eventCount: number;
  filename: string;
}

/**
 * Builds an RFC 5545 `.ics` calendar payload containing one `VEVENT` per dated `BarnTask`
 * plus optional `VALARM` display notification/alarm triggers and deep links back into the app.
 * Returns `null` if none of the provided tasks have a valid `YYYY-MM-DD` `dueDateIso`.
 */
export function buildIcsCalendarForTasks(
  tasks: BarnTask[],
  rawConfig?: Partial<CalendarSyncSettings>,
  barnName: string = 'Community Pedigree',
  filenameHint?: string,
  context?: CalendarExportContext
): GeneratedCalendarIcs | null {
  const datedTasks = tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
  if (datedTasks.length === 0) return null;

  const config = normalizeCalendarSyncSettings(rawConfig);
  const [hourStr, minStr] = config.reminderTimeLocal.split(':');
  const startHour = Number(hourStr);
  const startMin = Number(minStr);
  const durationMinutes = 30;

  const totalEndMins = startHour * 60 + startMin + durationMinutes;
  const endDayRollover = Math.floor(totalEndMins / 1440);
  const endHour = Math.floor((totalEndMins % 1440) / 60);
  const endMin = totalEndMins % 60;

  const dtStamp = formatUtcStamp(nowIsoUtc());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Community Pedigree Project//Pedigree//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`${barnName || 'Community Pedigree'} Barn Chores`)}`,
  ];

  const animalById = new Map<string, Animal>();
  for (const a of context?.animals || []) {
    animalById.set(a.id, a);
  }

  for (const task of datedTasks) {
    const dtStart = formatLocalFloatingDateTime(task.dueDateIso, startHour, startMin);
    const endDateIso =
      endDayRollover > 0 ? addDaysIso(task.dueDateIso, endDayRollover) : task.dueDateIso;
    const dtEnd = formatLocalFloatingDateTime(endDateIso, endHour, endMin);

    const summaryText = formatExternalCalendarTaskSummary(task, config, context);
    const speciesProfile = context?.speciesProfiles?.find((sp) =>
      isSameSpecies(sp.name, task.species)
    );
    const prefix = (speciesProfile?.defaultAnimalPrefix || '').trim();
    const linkedAnimal = task.linkedAnimalId ? animalById.get(task.linkedAnimalId) : undefined;
    const animalLine = (() => {
      if (!linkedAnimal && !task.linkedAnimalName) return '';
      const resolved = resolveAnimalDisplayToken(
        task.linkedAnimalName || linkedAnimal?.name || '',
        linkedAnimal,
        config,
        prefix
      );
      if (!config.includeAnimalName && linkedAnimal?.tattoo?.trim()) {
        return `Animal Ear #: ${resolved}`;
      }
      return resolved ? `Animal: ${resolved}` : '';
    })();

    const taskDeepLink = buildTaskAppDeepLink(context?.appBaseUrl, task);

    const descParts = [
      barnName ? `Barn: ${barnName}` : '',
      `Species: ${task.species}`,
      `Category: ${task.category}`,
      `Priority: ${task.priority}`,
      animalLine,
      task.linkedBreedingId ? 'Source: Breeding milestone cascade' : 'Source: Manual barn chore',
      taskDeepLink ? `Open Task in App: ${taskDeepLink}` : '',
    ].filter(Boolean);

    const icsPriority = task.priority === 'High' ? 1 : task.priority === 'Low' ? 9 : 5;

    lines.push(
      'BEGIN:VEVENT',
      `UID:barn-task-${task.id}@community-pedigree.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${escapeIcsText(summaryText)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`,
      ...(taskDeepLink ? [`URL;VALUE=URI:${taskDeepLink}`] : []),
      `CATEGORIES:${escapeIcsText(task.species)},${escapeIcsText(task.category)}`,
      `PRIORITY:${icsPriority}`,
      `STATUS:${task.completed ? 'COMPLETED' : 'CONFIRMED'}`
    );

    if (config.alarmEnabled) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(`Barn Reminder: ${summaryText}`)}`,
        `TRIGGER:${formatIcsAlarmTrigger(config.alarmMinutesBefore)}`,
        'END:VALARM'
      );
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const stamp = nowIsoUtc().slice(0, 10);
  const filename =
    datedTasks.length === 1
      ? `${formatSlug(
          filenameHint || formatSystemTaskTitle(datedTasks[0], config, context)
        )}-${datedTasks[0].dueDateIso}.ics`
      : `${formatSlug(filenameHint || `${datedTasks[0].species}-barn-tasks`)}-${stamp}.ics`;

  return {
    icsContent: `${lines.join('\r\n')}\r\n`,
    eventCount: datedTasks.length,
    filename,
  };
}

export interface GoogleCalendarEventPayload {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: {
    useDefault: boolean;
    overrides?: Array<{ method: 'popup'; minutes: number }>;
  };
  source?: { title: string; url: string };
}

function buildTaskCalendarMetadata(
  task: BarnTask,
  config: CalendarSyncSettings,
  barnName: string,
  context?: CalendarExportContext
): {
  summaryText: string;
  descriptionText: string;
  taskDeepLink: string;
  startDateIso: string;
  startTimeHm: string;
  endDateIso: string;
  endTimeHm: string;
} {
  const [hourStr, minStr] = config.reminderTimeLocal.split(':');
  const startHour = Number(hourStr);
  const startMin = Number(minStr);
  const totalEndMins = startHour * 60 + startMin + 30;
  const endDayRollover = Math.floor(totalEndMins / 1440);
  const endHour = Math.floor((totalEndMins % 1440) / 60);
  const endMin = totalEndMins % 60;

  const endDateIso =
    endDayRollover > 0 ? addDaysIso(task.dueDateIso, endDayRollover) : task.dueDateIso;
  const startTimeHm = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
  const endTimeHm = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

  const summaryText = formatExternalCalendarTaskSummary(task, config, context);
  const speciesProfile = context?.speciesProfiles?.find((sp) =>
    isSameSpecies(sp.name, task.species)
  );
  const prefix = (speciesProfile?.defaultAnimalPrefix || '').trim();
  const linkedAnimal = context?.animals?.find((a) => a.id === task.linkedAnimalId);

  const animalLine = (() => {
    if (!linkedAnimal && !task.linkedAnimalName) return '';
    const resolved = resolveAnimalDisplayToken(
      task.linkedAnimalName || linkedAnimal?.name || '',
      linkedAnimal,
      config,
      prefix
    );
    if (!config.includeAnimalName && linkedAnimal?.tattoo?.trim()) {
      return `Animal Ear #: ${resolved}`;
    }
    return resolved ? `Animal: ${resolved}` : '';
  })();

  const taskDeepLink = buildTaskAppDeepLink(context?.appBaseUrl, task);
  const descParts = [
    barnName ? `Barn: ${barnName}` : '',
    `Species: ${task.species}`,
    `Category: ${task.category}`,
    `Priority: ${task.priority}`,
    animalLine,
    task.linkedBreedingId ? 'Source: Breeding milestone cascade' : 'Source: Manual barn chore',
    taskDeepLink ? `Open Task in App: ${taskDeepLink}` : '',
  ].filter(Boolean);

  return {
    summaryText,
    descriptionText: descParts.join('\n'),
    taskDeepLink,
    startDateIso: task.dueDateIso,
    startTimeHm,
    endDateIso,
    endTimeHm,
  };
}

/**
 * Builds a Google Calendar v3 event payload for a dated `BarnTask`.
 * Returns `null` if the task does not have a valid `YYYY-MM-DD` due date.
 */
export function buildGoogleCalendarEventPayload(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  barnName: string = 'Community Pedigree',
  timeZone: string = 'UTC',
  context?: CalendarExportContext
): GoogleCalendarEventPayload | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDateIso || '')) return null;
  const config = normalizeCalendarSyncSettings(rawConfig);
  const meta = buildTaskCalendarMetadata(task, config, barnName, context);
  const safeTz = (timeZone || '').trim() || 'UTC';
  const alarmMins = Math.min(40320, Math.max(0, Math.round(config.alarmMinutesBefore)));

  return {
    summary: meta.summaryText,
    description: meta.descriptionText,
    start: {
      dateTime: `${meta.startDateIso}T${meta.startTimeHm}:00`,
      timeZone: safeTz,
    },
    end: {
      dateTime: `${meta.endDateIso}T${meta.endTimeHm}:00`,
      timeZone: safeTz,
    },
    reminders: config.alarmEnabled
      ? {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: alarmMins }],
        }
      : {
          useDefault: false,
          overrides: [],
        },
    ...(meta.taskDeepLink
      ? {
          source: {
            title: 'Open Task in Community Pedigree',
            url: meta.taskDeepLink,
          },
        }
      : {}),
  };
}

/**
 * Builds prefilled external web calendar URLs (Google Calendar web + Outlook web)
 * for quick browser open when online, complementing `.ics` offline/desktop app handoff.
 */
export function buildExternalCalendarWebUrls(
  task: BarnTask,
  rawConfig?: Partial<CalendarSyncSettings>,
  barnName: string = 'Community Pedigree',
  context?: CalendarExportContext
): { googleWebUrl: string; outlookWebUrl: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDateIso || '')) return null;
  const config = normalizeCalendarSyncSettings(rawConfig);
  const meta = buildTaskCalendarMetadata(task, config, barnName, context);

  const gStart = `${meta.startDateIso.replace(/-/g, '')}T${meta.startTimeHm.replace(':', '')}00`;
  const gEnd = `${meta.endDateIso.replace(/-/g, '')}T${meta.endTimeHm.replace(':', '')}00`;
  const googleWebUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    meta.summaryText
  )}&dates=${gStart}/${gEnd}&details=${encodeURIComponent(meta.descriptionText)}`;

  const outlookWebUrl = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(
    meta.summaryText
  )}&startdt=${encodeURIComponent(
    `${meta.startDateIso}T${meta.startTimeHm}:00`
  )}&enddt=${encodeURIComponent(
    `${meta.endDateIso}T${meta.endTimeHm}:00`
  )}&body=${encodeURIComponent(meta.descriptionText)}`;

  return { googleWebUrl, outlookWebUrl };
}

export interface MultiSpeciesAgendaItem {
  id: string;
  kind: 'task' | 'birth';
  species: string;
  dueDateIso: string;
  title: string;
  subtitle: string;
  isOverdue: boolean;
  isDueToday: boolean;
  task?: BarnTask;
  breeding?: BreedingRecord;
}

export interface MultiSpeciesAgendaSummary {
  horizonDays: 7 | 14;
  cutoffIso: string;
  items: MultiSpeciesAgendaItem[];
  overdueCount: number;
  todayCount: number;
  upcomingCount: number;
  exportableTasks: BarnTask[];
}

/**
 * Builds a chronologically sorted multi-species agenda covering open dated tasks
 * and active projected births across ONLY configured `speciesProfiles` within the
 * next `horizonDays` (7 or 14 days), plus any overdue open chores.
 */
export function buildMultiSpeciesAgenda(params: {
  tasks: BarnTask[];
  animals: Animal[];
  breedings: BreedingRecord[];
  speciesProfiles: SpeciesProfile[];
  calendarSync?: Partial<CalendarSyncSettings>;
  todayIso: string;
  horizonDays?: 7 | 14;
  speciesFilter?: string;
}): MultiSpeciesAgendaSummary {
  const horizonDays: 7 | 14 = params.horizonDays === 14 ? 14 : 7;
  const cutoffIso = addDaysIso(params.todayIso, horizonDays);
  const filterClean = (params.speciesFilter || '').trim();

  const addedProfiles = params.speciesProfiles.filter((sp) =>
    filterClean ? isSameSpecies(sp.name, filterClean) : true
  );
  const addedSpeciesKeys = new Set(addedProfiles.map((sp) => sp.name.trim().toLowerCase()));
  const profileByKey = new Map<string, SpeciesProfile>();
  for (const sp of addedProfiles) {
    profileByKey.set(sp.name.trim().toLowerCase(), sp);
  }

  const archivedIds = new Set(
    params.animals
      .filter((a) => a.archived || a.status === 'Archived' || a.status === 'Sold' || a.status === 'Deceased')
      .map((a) => a.id)
  );

  const context: CalendarExportContext = {
    animals: params.animals,
    breedings: params.breedings,
    speciesProfiles: params.speciesProfiles,
  };

  const items: MultiSpeciesAgendaItem[] = [];
  const exportableTasks: BarnTask[] = [];
  const linkedBirthBreedingIds = new Set<string>();

  for (const task of params.tasks) {
    if (task.completed) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDateIso || '')) continue;
    const spKey = (task.species || '').trim().toLowerCase();
    if (!addedSpeciesKeys.has(spKey)) continue;
    if (task.linkedAnimalId && archivedIds.has(task.linkedAnimalId)) continue;
    if (task.dueDateIso > cutoffIso) continue;

    exportableTasks.push(task);
    if (task.linkedBreedingId && task.category === 'Birth Check') {
      linkedBirthBreedingIds.add(task.linkedBreedingId);
    }

    const formattedTitle = formatSystemTaskTitle(task, params.calendarSync, context);
    const spName = profileByKey.get(spKey)?.name || task.species;
    items.push({
      id: `agenda-task-${task.id}`,
      kind: 'task',
      species: spName,
      dueDateIso: task.dueDateIso,
      title: formattedTitle || task.title,
      subtitle: `${spName} · ${task.category} · ${task.priority} priority`,
      isOverdue: task.dueDateIso < params.todayIso,
      isDueToday: task.dueDateIso === params.todayIso,
      task,
    });
  }

  for (const b of params.breedings) {
    if (!['Planned', 'Bred', 'Palpated Positive'].includes(b.status)) continue;
    if (linkedBirthBreedingIds.has(b.id)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.expectedDueDateIso || '')) continue;
    const spKey = (b.species || '').trim().toLowerCase();
    if (!addedSpeciesKeys.has(spKey)) continue;
    if (b.damId && archivedIds.has(b.damId)) continue;
    if (b.expectedDueDateIso > cutoffIso) continue;

    const spProfile = profileByKey.get(spKey);
    const spName = spProfile?.name || b.species;
    const birthEvent = spProfile?.birthEventLabel || 'Due Date';
    items.push({
      id: `agenda-birth-${b.id}`,
      kind: 'birth',
      species: spName,
      dueDateIso: b.expectedDueDateIso,
      title: `Expected ${birthEvent}: ${b.damName || 'Unknown Dam'} (× ${b.sireName || 'Unknown Sire'})`,
      subtitle: `${spName} · Breeding (${b.status})`,
      isOverdue: b.expectedDueDateIso < params.todayIso,
      isDueToday: b.expectedDueDateIso === params.todayIso,
      breeding: b,
    });
  }

  items.sort((a, b) => {
    const dCmp = a.dueDateIso.localeCompare(b.dueDateIso);
    if (dCmp !== 0) return dCmp;
    if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
    return a.species.localeCompare(b.species);
  });

  exportableTasks.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));

  let overdueCount = 0;
  let todayCount = 0;
  let upcomingCount = 0;
  for (const item of items) {
    if (item.isOverdue) overdueCount++;
    else if (item.isDueToday) todayCount++;
    else upcomingCount++;
  }

  return {
    horizonDays,
    cutoffIso,
    items,
    overdueCount,
    todayCount,
    upcomingCount,
    exportableTasks,
  };
}


