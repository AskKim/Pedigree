/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Official "Sign in with Google" button + Explicit Confirmation & Offline Fallback
 * Modal for syncing barn tasks to Google Calendar or handing off to desktop/offline
 * calendar apps (.ICS).
 */

import { AlertTriangle, CalendarPlus, CheckCircle2, Download, ExternalLink, X } from 'lucide-react';
import React from 'react';
import {
  buildExternalCalendarWebUrls,
  CalendarExportContext,
  formatExternalCalendarTaskSummary,
} from '../core/calendarExport';
import { BarnTask, CalendarSyncSettings, formatReadableDate } from '../core/models';

export function SignInWithGoogleButton({
  onClick,
  disabled,
  label = 'Sign in with Google',
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-3 min-h-[42px] px-4 py-2 rounded-xl border border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] active:bg-[#f1f3f4] text-sm font-medium shadow-xs transition-colors disabled:opacity-50"
    >
      <span className="w-[18px] h-[18px] shrink-0 block" aria-hidden="true">
        <svg
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 48 48"
          style={{ display: 'block' }}
        >
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
          <path fill="none" d="M0 0h48v48H0z" />
        </svg>
      </span>
      <span>{label}</span>
    </button>
  );
}

export interface PendingGoogleCalendarSync {
  tasks: BarnTask[];
  filenameHint?: string;
}

interface CalendarSyncConfirmModalProps {
  pending: PendingGoogleCalendarSync | null;
  config: CalendarSyncSettings;
  barnName: string;
  context: CalendarExportContext;
  isSignedIn: boolean;
  userEmail?: string | null;
  isBusy: boolean;
  isOnline: boolean;
  onSignIn: () => Promise<boolean>;
  onConfirmGoogleSync: () => Promise<void>;
  onFallbackOfflineIcs: () => void;
  onCancel: () => void;
}

export function CalendarSyncConfirmModal({
  pending,
  config,
  barnName,
  context,
  isSignedIn,
  userEmail,
  isBusy,
  isOnline,
  onSignIn,
  onConfirmGoogleSync,
  onFallbackOfflineIcs,
  onCancel,
}: CalendarSyncConfirmModalProps) {
  if (!pending || pending.tasks.length === 0) return null;

  const datedTasks = pending.tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.dueDateIso || ''));
  if (datedTasks.length === 0) return null;

  const singleTaskUrls =
    datedTasks.length === 1 && isOnline
      ? buildExternalCalendarWebUrls(datedTasks[0], config, barnName, context)
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Online Calendar Sync"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[88dvh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--barn-border)]">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <CalendarPlus className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>
                Add {datedTasks.length} {datedTasks.length === 1 ? 'Task' : 'Tasks'} to Calendar
              </span>
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Target calendar:{' '}
              <span className="font-semibold text-[var(--barn-ink)]">
                {config.googleCalendarName || 'Primary Google Calendar'}
              </span>{' '}
              · {config.reminderTimeLocal} local
              {config.alarmEnabled ? ` · Alarm ${config.alarmMinutesBefore}m before` : ' · No alarm'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            aria-label="Close calendar confirmation"
            className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {!isOnline && (
            <div className="p-3 rounded-xl bg-[var(--barn-terracotta)]/10 border border-[var(--barn-terracotta)]/40 flex items-start gap-2.5 text-[var(--barn-ink)]">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <div className="font-semibold">Device appears offline</div>
                <p className="text-[var(--barn-muted)] mt-0.5">
                  Online Google Calendar sync cannot connect right now. Use{' '}
                  <strong>Download Offline .ICS</strong> below to import directly into desktop
                  Outlook, Apple Calendar, or your device&apos;s local calendar app.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] divide-y divide-[var(--barn-border)] max-h-48 overflow-y-auto">
            {datedTasks.map((t) => {
              const title = formatExternalCalendarTaskSummary(t, config, context);
              return (
                <div key={t.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="font-medium text-[var(--barn-ink)] min-w-0 truncate">
                    {title}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--barn-muted)] shrink-0">
                    {formatReadableDate(t.dueDateIso)}
                  </span>
                </div>
              );
            })}
          </div>

          {isOnline && !isSignedIn && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="font-semibold text-[var(--barn-ink)]">
                Connect your Google account to add events directly
              </div>
              <p className="text-[var(--barn-muted)]">
                Sign in with Google to save these {datedTasks.length === 1 ? 'event' : 'events'}{' '}
                straight to your online calendar, or choose the offline .ICS file below (which also
                works with desktop Outlook and Apple Calendar).
              </p>
              <SignInWithGoogleButton
                onClick={() => {
                  void onSignIn();
                }}
                disabled={isBusy}
              />
            </div>
          )}

          {isOnline && isSignedIn && userEmail && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--barn-sage)] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Connected to Google Calendar as {userEmail}</span>
            </div>
          )}

          {singleTaskUrls && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--barn-muted)]">
              <span>Quick browser templates:</span>
              <a
                href={singleTaskUrls.googleWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline hover:text-[var(--barn-ink)]"
              >
                Google Calendar Web
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
              <span aria-hidden="true">·</span>
              <a
                href={singleTaskUrls.outlookWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline hover:text-[var(--barn-ink)]"
              >
                Outlook Web
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/50 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)]"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onFallbackOfflineIcs}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Offline .ICS
          </button>

          {isOnline && isSignedIn && (
            <button
              type="button"
              onClick={() => {
                void onConfirmGoogleSync();
              }}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50"
            >
              <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
              {isBusy
                ? 'Adding to Google Calendar...'
                : `Add ${datedTasks.length} to Google Calendar`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
