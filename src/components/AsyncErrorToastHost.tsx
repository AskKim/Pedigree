/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Non-blocking Global Async Error & Background Pause Toast Host (`src/components/AsyncErrorToastHost.tsx`).
 *
 * Behavior:
 * - Minor transient warnings / clean background pauses auto-dismiss after 9s (no manual tap needed).
 * - Severity errors (QuotaExceeded, memory faults, DB write failures, permission-lost sync pauses)
 *   remain sticky until dismissed or acted upon.
 */

import { AlertTriangle, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getPausedBackgroundJobs,
  PausedBackgroundJob,
  resumePausedBackgroundJob,
  subscribePausedBackgroundJobs,
} from '../storage/backgroundFreezeCoordinator';
import {
  AsyncErrorNotice,
  dismissAsyncErrorToast,
  getActiveAsyncErrorToasts,
  subscribeAsyncErrorToasts,
} from '../storage/crashLogger';

interface AsyncErrorToastHostProps {
  onOpenDiagnostics: () => void;
  isOnSettingsRoute: boolean;
}

export function AsyncErrorToastHost({
  onOpenDiagnostics,
  isOnSettingsRoute,
}: AsyncErrorToastHostProps) {
  const [notices, setNotices] = useState<AsyncErrorNotice[]>(() => getActiveAsyncErrorToasts());
  const [pausedJobs, setPausedJobs] = useState<PausedBackgroundJob[]>(() =>
    getPausedBackgroundJobs().filter((j) => j.severity === 'severity')
  );
  const [resumingJobId, setResumingJobId] = useState<string | null>(null);

  useEffect(() => {
    const unsubToasts = subscribeAsyncErrorToasts((list) => {
      setNotices(list);
    });
    const unsubJobs = subscribePausedBackgroundJobs((jobs) => {
      setPausedJobs(jobs.filter((j) => j.severity === 'severity'));
    });
    return () => {
      unsubToasts();
      unsubJobs();
    };
  }, []);

  if (notices.length === 0 && pausedJobs.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-20 md:bottom-5 right-3 left-3 sm:left-auto sm:w-[400px] z-40 space-y-2 pointer-events-none"
      aria-label="System notifications"
    >
      {pausedJobs.slice(0, 1).map((job) => (
        <div
          key={`paused-${job.taskId}`}
          role="alert"
          aria-live="assertive"
          className="pointer-events-auto rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-surface)] text-[var(--barn-ink)] shadow-lg p-3.5 text-xs space-y-2.5"
        >
          <div className="flex items-start gap-2.5">
            <ShieldAlert
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-semibold text-[var(--barn-ink)]">
                {job.label} Paused — Action Needed
              </div>
              <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed break-words">
                {job.severityReason ||
                  'Background suspension interrupted this task and requires confirmation to continue safely.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {job.resumeHandler && (
              <button
                type="button"
                disabled={resumingJobId === job.taskId}
                aria-busy={resumingJobId === job.taskId}
                onClick={() => {
                  if (resumingJobId) return;
                  setResumingJobId(job.taskId);
                  void resumePausedBackgroundJob(job.taskId).finally(() => {
                    setResumingJobId(null);
                  });
                }}
                className="min-h-[44px] sm:min-h-[34px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${resumingJobId === job.taskId ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {resumingJobId === job.taskId ? 'Resuming...' : 'Tap to Resume'}
              </button>
            )}
          </div>
        </div>
      ))}

      {notices.map((notice) => {
        const isError = notice.severity === 'error';
        return (
          <div
            key={notice.id}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
            className={`pointer-events-auto rounded-xl border shadow-lg p-3.5 text-xs space-y-2 ${
              isError
                ? 'border-[var(--barn-danger)] bg-[var(--barn-surface)] text-[var(--barn-ink)]'
                : 'border-[var(--barn-terracotta)] bg-[var(--barn-surface)] text-[var(--barn-ink)]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {isError ? (
                <ShieldAlert
                  className="w-4 h-4 text-[var(--barn-danger)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-semibold text-[var(--barn-ink)]">{notice.title}</div>
                <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed break-words">
                  {notice.detail}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Dismiss ${notice.title}`}
                onClick={() => dismissAsyncErrorToast(notice.id)}
                className="min-h-[44px] min-w-[44px] sm:min-h-[32px] sm:min-w-[32px] -mt-1 -mr-1 rounded-lg hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center shrink-0 text-[var(--barn-muted)]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {(notice.canOpenDiagnostics && !isOnSettingsRoute) || notice.sticky ? (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                {notice.canOpenDiagnostics && !isOnSettingsRoute && (
                  <button
                    type="button"
                    onClick={() => {
                      dismissAsyncErrorToast(notice.id);
                      onOpenDiagnostics();
                    }}
                    className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                  >
                    Open Diagnostics
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissAsyncErrorToast(notice.id)}
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-subtle)] text-[var(--barn-ink)] text-[11px] font-medium hover:opacity-90"
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
