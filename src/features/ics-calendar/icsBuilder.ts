/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic RFC 5545 iCalendar (`.ics`) Builder (`@features/ics-calendar/icsBuilder.ts`).
 *
 * Zero domain terms, zero DOM dependencies, zero cross-feature imports.
 */

import { utf8StringToBytes } from '@engine/binaryEncoding';
import { escapeIcsText, formatIcsAlarmTrigger } from '@engine/codecs/textFormats';
import {
  sanitizePlainText,
  sanitizeSingleLineText,
  sha256HexPure,
  slugifySegment,
} from '@engine/primitives';
import type { IFeatureModule } from '../featureModule.interface';

export interface GenericCalendarEventInput {
  readonly id: string;
  readonly title: string;
  readonly dateIso: string;
  readonly allDay?: boolean;
  readonly startHour?: number;
  readonly startMinute?: number;
  readonly durationMinutes?: number;
  readonly description?: string;
  readonly location?: string;
  readonly url?: string;
  readonly categories?: readonly string[];
  readonly alarmMinutesList?: readonly number[];
}

export interface GenericIcsBuildOptions {
  readonly calendarName?: string;
  readonly prodId?: string;
  readonly uidDomain?: string;
  readonly defaultHour?: number;
  readonly defaultMinute?: number;
  readonly defaultDurationMinutes?: number;
  readonly dtStampIso?: string;
}

export interface GenericIcsOutput {
  readonly icsText: string;
  readonly bytes: Uint8Array;
  readonly eventCount: number;
  readonly suggestedFilename: string;
}

export { escapeIcsText, formatIcsAlarmTrigger };

function formatUtcStamp(isoUtc?: string): string {
  const clean = (isoUtc || new Date().toISOString())
    .replace(/[-:]/g, '')
    .replace(/\.\d+/, '');
  return clean.endsWith('Z') ? clean : `${clean}Z`;
}

function addMinutesToDateAndTime(
  dateIso: string,
  hour: number,
  minute: number,
  durationMinutes: number
): string {
  const [year, month, day] = dateIso.split('-').map((n) => Number(n));
  const dt = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, hour, minute, 0));
  dt.setUTCMinutes(dt.getUTCMinutes() + Math.max(1, durationMinutes));
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mm = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}00`;
}

function nextIsoDay(dateIso: string): string {
  const [year, month, day] = dateIso.split('-').map((n) => Number(n));
  const dt = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Builds an RFC 5545 compliant `.ics` calendar string and byte payload from generic event inputs.
 *
 * @param events List of calendar event descriptors (all-day or timed, with optional alarms)
 * @param options Calendar name, prodId, domain, and default duration options
 * @returns GenericIcsOutput with icsText, binary bytes, eventCount, and suggestedFilename
 */
export function buildGenericIcsCalendar(
  events: readonly GenericCalendarEventInput[],
  options: GenericIcsBuildOptions = {}
): GenericIcsOutput {
  const calName = sanitizeSingleLineText(options.calendarName || 'Schedule Export', 120);
  const prodId = options.prodId || '-//CoreModules//CalendarFeed//EN';
  const uidDomain = options.uidDomain || 'local.calendar';
  const dtStamp = formatUtcStamp(options.dtStampIso);
  const defaultHour = options.defaultHour ?? 9;
  const defaultMinute = options.defaultMinute ?? 0;
  const defaultDuration = options.defaultDurationMinutes ?? 30;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];

  let count = 0;
  for (const event of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.dateIso)) {
      continue;
    }
    count += 1;
    const summary = sanitizeSingleLineText(event.title || 'Scheduled Event', 180);
    const uidHash = sha256HexPure(`${event.id}:${event.dateIso}:${summary}`).slice(0, 16);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id || uidHash}@${uidDomain}`);
    lines.push(`DTSTAMP:${dtStamp}`);

    if (event.allDay) {
      const compactStart = event.dateIso.replace(/-/g, '');
      const compactEnd = nextIsoDay(event.dateIso);
      lines.push(`DTSTART;VALUE=DATE:${compactStart}`);
      lines.push(`DTEND;VALUE=DATE:${compactEnd}`);
    } else {
      const h = event.startHour ?? defaultHour;
      const m = event.startMinute ?? defaultMinute;
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const compactStart = `${event.dateIso.replace(/-/g, '')}T${hh}${mm}00`;
      const compactEnd = addMinutesToDateAndTime(
        event.dateIso,
        h,
        m,
        event.durationMinutes ?? defaultDuration
      );
      lines.push(`DTSTART:${compactStart}`);
      lines.push(`DTEND:${compactEnd}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(sanitizePlainText(event.description, 4000))}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${escapeIcsText(sanitizeSingleLineText(event.location, 200))}`);
    }
    if (event.url) {
      lines.push(`URL:${sanitizeSingleLineText(event.url, 500)}`);
    }
    if (event.categories && event.categories.length > 0) {
      lines.push(
        `CATEGORIES:${event.categories.map((c) => escapeIcsText(c)).join(',')}`
      );
    }

    for (const mins of event.alarmMinutesList ?? []) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:${escapeIcsText(summary)}`);
      lines.push(`TRIGGER:${formatIcsAlarmTrigger(mins)}`);
      lines.push('END:VALARM');
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  const icsText = `${lines.join('\r\n')}\r\n`;

  return {
    icsText,
    bytes: utf8StringToBytes(icsText),
    eventCount: count,
    suggestedFilename: `${slugifySegment(calName, 'schedule')}.ics`,
  };
}

export function createIcsCalendarFeatureModule(): IFeatureModule<
  { calendarName?: string },
  { ready: boolean; calendarName?: string }
> {
  let ready = false;
  let calendarName: string | undefined;

  return {
    metadata: {
      id: 'ics-calendar',
      name: 'RFC 5545 Calendar Feed Builder',
      version: '1.0.0',
      description: 'Content-agnostic VCALENDAR/VEVENT/VALARM generator.',
    },
    async initialize(context) {
      calendarName = context.config?.calendarName;
      ready = true;
    },
    async dispose() {
      ready = false;
    },
    getStateSnapshot() {
      return { ready, calendarName };
    },
  };
}
