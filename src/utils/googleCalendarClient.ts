/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client-Side Google Calendar API & Sign-In Integration.
 *
 * Follows Google Workspace client-side auth rules:
 * - Access tokens are cached strictly in memory (never in localStorage/sessionStorage).
 * - Automatically clears cached tokens when the user signs out.
 * - Callers fall back cleanly to offline `.ics` generation when offline, unauthenticated,
 *   or when the Google Calendar API cannot be reached.
 */

import type { Auth, User } from 'firebase/auth';
import {
  buildGoogleCalendarEventPayload,
  CalendarExportContext,
} from '../core/calendarExport';
import { BarnTask, CalendarSyncSettings } from '../core/models';

import { logDiagnosticEvent } from '../storage/crashLogger';
import { recordServerDateHeaderSkew } from '../storage/storageProtection';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
] as const;

let cachedAuth: Auth | null = null;
let authInitAttempted = false;
let authInitPromise: Promise<Auth | null> | null = null;

async function getFirebaseAuthSafe(): Promise<Auth | null> {
  if (cachedAuth) return cachedAuth;
  if (authInitAttempted) return null;
  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    try {
      const [{ getApp, getApps, initializeApp }, { getAuth }, { default: firebaseConfig }] =
        await Promise.all([
          import('firebase/app'),
          import('firebase/auth'),
          import('../../firebase-applet-config.json'),
        ]);
      const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      cachedAuth = getAuth(firebaseApp);
      return cachedAuth;
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message:
          'Corrective action: Firebase Auth unavailable during startup — continuing in offline .ICS calendar mode',
        error: err,
      });
      return null;
    } finally {
      authInitAttempted = true;
      authInitPromise = null;
    }
  })();

  return authInitPromise;
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

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
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
): () => void {
  let cancelled = false;
  let unsubscribe = () => {};

  void (async () => {
    const authInstance = await getFirebaseAuthSafe();
    if (cancelled) return;
    if (!authInstance) {
      onAuthFailure?.(null);
      return;
    }
    try {
      const { onAuthStateChanged } = await import('firebase/auth');
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(authInstance, (user: User | null) => {
        if (user && cachedAccessToken) {
          onAuthSuccess?.(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          onAuthFailure?.(user);
        }
      });
    } catch (err) {
      logDiagnosticEvent({
        level: 'warn',
        category: 'runtime',
        message:
          'Corrective action: Google Calendar auth listener could not attach — using offline .ICS fallback',
        error: err,
      });
      if (!cancelled) {
        onAuthFailure?.(null);
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export async function signInGoogleCalendar(): Promise<{
  user: User;
  accessToken: string;
}> {
  const authInstance = await getFirebaseAuthSafe();
  if (!authInstance) {
    throw new Error('Google Calendar sign-in is unavailable in this browser environment. Use offline .ICS export instead.');
  }
  try {
    isSigningIn = true;
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    for (const scope of GOOGLE_CALENDAR_SCOPES) {
      provider.addScope(scope);
    }
    const result = await signInWithPopup(authInstance, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Calendar access token.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleCalendar(): Promise<void> {
  cachedAccessToken = null;
  if (!cachedAuth) return;
  await cachedAuth.signOut();
}

export function getGoogleCalendarAccessToken(): string | null {
  return cachedAccessToken;
}

export function getCurrentGoogleCalendarUser(): User | null {
  return cachedAuth?.currentUser ?? null;
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
  recordServerDateHeaderSkew(res.headers?.get?.('date'));
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

export async function pushTasksToGoogleCalendar(params: {
  accessToken: string;
  calendarId: string;
  tasks: BarnTask[];
  config: Partial<CalendarSyncSettings>;
  barnName: string;
  context?: CalendarExportContext;
}): Promise<GoogleCalendarPushResult> {
  const { accessToken, calendarId, tasks, config, barnName, context } = params;
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
    const payload = buildGoogleCalendarEventPayload(
      task,
      config,
      barnName,
      timeZone,
      context
    );
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
      recordServerDateHeaderSkew(res.headers?.get?.('date'));

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
        recordServerDateHeaderSkew(res.headers?.get?.('date'));
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
