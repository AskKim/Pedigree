/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client-Side Google Calendar API Helpers & Offline-First Fallback.
 *
 * - Firebase Auth has been removed so the app has zero external auth/cloud SDK dependencies.
 * - Callers fall back cleanly to offline `.ics` generation and web calendar links.
 */

export interface GoogleCalendarClientHooks {
  onDiagnosticEvent?: (entry: {
    level: 'info' | 'warn' | 'error';
    category: 'runtime' | 'storage' | 'memory';
    message: string;
    error?: unknown;
  }) => void;
  onServerDateHeader?: (dateHeader: string | null | undefined) => void;
}

let calendarClientHooks: GoogleCalendarClientHooks = {};

export function configureGoogleCalendarClient(hooks: GoogleCalendarClientHooks): void {
  calendarClientHooks = { ...calendarClientHooks, ...hooks };
}

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

export interface GoogleCalendarUser {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
}

export interface CalendarTaskRecord {
  dueDateIso?: string;
}

export interface GenericGoogleCalendarEventPayload {
  id?: string;
}

export type CalendarEventPayloadBuilder<TTask extends CalendarTaskRecord, TConfig> = (
  task: TTask,
  config: TConfig,
  calendarLabel: string,
  timeZone: string
) => GenericGoogleCalendarEventPayload | null;

let cachedAccessToken: string | null = null;
const cachedUser: GoogleCalendarUser | null = null;

export interface GoogleCalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  timeZone?: string;
}

export interface GoogleCalendarPushResult {
  createdCount: number;
  failedCount: number;
  htmlLinks: string[];
  authExpired: boolean;
  errorMessage?: string;
}

export function initGoogleCalendarAuth(
  _onAuthSuccess?: (user: GoogleCalendarUser, token: string) => void,
  onAuthFailure?: (user: GoogleCalendarUser | null) => void
): () => void {
  cachedAccessToken = null;
  onAuthFailure?.(null);
  return () => {};
}

export async function signInGoogleCalendar(): Promise<{
  user: GoogleCalendarUser;
  accessToken: string;
}> {
  calendarClientHooks.onDiagnosticEvent?.({
    level: 'info',
    category: 'runtime',
    message:
      'Corrective action: Direct Google Calendar sign-in unavailable (Firebase removed) — use offline .ICS export or calendar web links',
  });
  throw new Error(
    'Direct Google Calendar sign-in is disabled (Firebase removed). Use offline .ICS export or browser calendar links instead.'
  );
}

export async function signOutGoogleCalendar(): Promise<void> {
  cachedAccessToken = null;
}

export function getGoogleCalendarAccessToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleCalendarUser(): GoogleCalendarUser | null {
  return cachedUser;
}

export async function listWritableGoogleCalendars(
  accessToken: string
): Promise<GoogleCalendarOption[]> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  calendarClientHooks.onServerDateHeader?.(res.headers?.get?.('date'));
  if (res.status === 401 || res.status === 403) {
    cachedAccessToken = null;
    throw new Error('GOOGLE_AUTH_EXPIRED');
  }
  if (!res.ok) {
    throw new Error(`Could not load Google calendars (${res.status}).`);
  }
  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      primary?: boolean;
      timeZone?: string;
    }>;
  };
  const items = Array.isArray(json.items) ? json.items : [];
  return items
    .filter((c) => typeof c.id === 'string' && c.id.length > 0)
    .map((c) => ({
      id: c.id!,
      summary: c.summary || (c.primary ? 'Primary Calendar' : c.id!),
      primary: Boolean(c.primary),
      timeZone: c.timeZone,
    }));
}

export async function pushGenericTasksToGoogleCalendar<
  TTask extends CalendarTaskRecord,
  TConfig = Record<string, unknown>,
>(params: {
  accessToken: string;
  calendarId: string;
  tasks: TTask[];
  config: TConfig;
  calendarLabel: string;
  buildPayload: CalendarEventPayloadBuilder<TTask, TConfig>;
}): Promise<GoogleCalendarPushResult> {
  const { accessToken, calendarId, tasks, config, calendarLabel, buildPayload } = params;
  const timeZone =
    (typeof Intl !== 'undefined' &&
      Intl.DateTimeFormat().resolvedOptions().timeZone) ||
    'UTC';

  const datedTasks = tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
  let createdCount = 0;
  let failedCount = 0;
  const htmlLinks: string[] = [];
  let authExpired = false;
  let errorMessage: string | undefined;

  const targetId = encodeURIComponent(calendarId || 'primary');

  for (const task of datedTasks) {
    const payload = buildPayload(task, config, calendarLabel, timeZone);
    if (!payload) continue;

    try {
      let res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${targetId}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      calendarClientHooks.onServerDateHeader?.(res.headers?.get?.('date'));

      // Deterministic event ID already exists on Google Calendar -> update in place (prevents duplicates)
      if (res.status === 409 && payload.id) {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${targetId}/events/${encodeURIComponent(payload.id)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );
        calendarClientHooks.onServerDateHeader?.(res.headers?.get?.('date'));
      }

      if (res.status === 401 || res.status === 403) {
        cachedAccessToken = null;
        authExpired = true;
        failedCount += datedTasks.length - createdCount - failedCount;
        errorMessage = 'Google Calendar session expired. Please sign in again.';
        break;
      }

      if (!res.ok) {
        failedCount += 1;
        errorMessage = `Google Calendar returned status ${res.status}.`;
        continue;
      }

      const data = (await res.json()) as { htmlLink?: string };
      createdCount += 1;
      if (data.htmlLink) {
        htmlLinks.push(data.htmlLink);
      }
    } catch (err) {
      failedCount += datedTasks.length - createdCount - failedCount;
      errorMessage = err instanceof Error ? err.message : 'Network connection failed.';
      break;
    }
  }

  return {
    createdCount,
    failedCount,
    htmlLinks,
    authExpired,
    errorMessage,
  };
}
