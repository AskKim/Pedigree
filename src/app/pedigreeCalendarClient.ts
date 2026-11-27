/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Domain Google Calendar Client Binding (`@app/pedigreeCalendarClient.ts`).
 *
 * Layer 3 wrapper binding `BarnTask` and `CalendarSyncSettings` to the
 * content-agnostic `src/utils/googleCalendarClient.ts` transport.
 */

import {
  buildGoogleCalendarEventPayload,
  type CalendarExportContext,
} from '../domain/calendarExport';
import type { BarnTask, CalendarSyncSettings } from '../domain/models';
import {
  getCurrentGoogleCalendarUser,
  getGoogleCalendarAccessToken,
  GOOGLE_CALENDAR_SCOPES,
  initGoogleCalendarAuth,
  listWritableGoogleCalendars,
  pushGenericTasksToGoogleCalendar,
  signInGoogleCalendar,
  signOutGoogleCalendar,
  type GoogleCalendarOption,
  type GoogleCalendarPushResult,
  type GoogleCalendarUser,
} from '../utils/googleCalendarClient';

export {
  getCurrentGoogleCalendarUser,
  getGoogleCalendarAccessToken,
  GOOGLE_CALENDAR_SCOPES,
  initGoogleCalendarAuth,
  listWritableGoogleCalendars,
  signInGoogleCalendar,
  signOutGoogleCalendar,
  type GoogleCalendarOption,
  type GoogleCalendarPushResult,
  type GoogleCalendarUser,
};

import { getDefaultPedigreeBridge } from './pedigreeAppWiring';

export async function pushTasksToGoogleCalendar(params: {
  accessToken: string;
  calendarId: string;
  tasks: BarnTask[];
  config: Partial<CalendarSyncSettings>;
  barnName: string;
  context?: CalendarExportContext;
}): Promise<GoogleCalendarPushResult> {
  getDefaultPedigreeBridge();
  return pushGenericTasksToGoogleCalendar({
    accessToken: params.accessToken,
    calendarId: params.calendarId,
    tasks: params.tasks,
    config: params.config,
    calendarLabel: params.barnName,
    buildPayload: (task, config, calendarLabel, timeZone) =>
      buildGoogleCalendarEventPayload(task, config, calendarLabel, timeZone, params.context),
  });
}
