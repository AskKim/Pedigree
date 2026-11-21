/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Mobile Background Freeze Coordinator (`src/storage/backgroundFreezeCoordinator.ts`).
 *
 * Purpose:
 * - Integrates with `crashLogger`'s single `visibilitychange` / `pagehide` handlers to
 *   cooperatively pause heavy sync/backup work before iOS Safari / Android Chrome freeze JS.
 * - Auto-resumes minor clean pauses immediately when returning to `'visible'` (ergonomic for
 *   barn gloves and mobility), while escalating severity issues (e.g. lost folder permission,
 *   storage quota, partial I/O failure) to a sticky user-acknowledged prompt.
 */

import { releaseActiveOpfsHandles } from './opfsTempStream';
import {
  abortPendingWebLocks,
  releaseOpenBroadcastChannels,
  releaseOpenIdbResources,
} from './storageProbes';

export class BackgroundPausedError extends Error {
  readonly taskName: string;
  readonly severityIssue: string | null;
  readonly checkpointSummary: string | null;

  constructor(
    taskName: string,
    options?: {
      severityIssue?: string | null;
      checkpointSummary?: string | null;
    }
  ) {
    const severityIssue = options?.severityIssue || null;
    const checkpointSummary = options?.checkpointSummary || null;
    super(
      severityIssue
        ? `${taskName} paused: ${severityIssue}`
        : `${taskName} paused safely when app moved to background.`
    );
    this.name = 'BackgroundPausedError';
    this.taskName = taskName;
    this.severityIssue = severityIssue;
    this.checkpointSummary = checkpointSummary;
  }
}

export interface FreezeLifecycleListener {
  id: string;
  onHidden?: () => void | Promise<void>;
  onVisible?: () => void | Promise<void>;
  onReleaseResources?: (reason: 'hidden' | 'pagehide') => void | Promise<void>;
}

export interface PausedBackgroundJob {
  taskId: string;
  label: string;
  pausedAtMs: number;
  severity: 'minor' | 'severity';
  severityReason?: string;
  resumeHandler?: () => void | Promise<void>;
}

export type PausedJobsSubscriber = (jobs: PausedBackgroundJob[]) => void;

const lifecycleListeners = new Map<string, FreezeLifecycleListener>();
const pausedJobs = new Map<string, PausedBackgroundJob>();
const pausedJobSubscribers = new Set<PausedJobsSubscriber>();

function readInitialVisibilityState(): 'visible' | 'hidden' {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
      ? 'hidden'
      : 'visible';
  } catch {
    return 'visible';
  }
}

let lastVisibilityState: 'visible' | 'hidden' = readInitialVisibilityState();

function emitPausedJobs(): void {
  const snapshot = Array.from(pausedJobs.values());
  for (const sub of pausedJobSubscribers) {
    try {
      sub(snapshot);
    } catch {
      // Never allow subscriber failure to disrupt lifecycle handling
    }
  }
}

export function isDocumentHidden(docOverride?: { visibilityState?: string }): boolean {
  try {
    const target = docOverride ?? (typeof document !== 'undefined' ? document : undefined);
    return Boolean(target && target.visibilityState === 'hidden');
  } catch {
    return false;
  }
}

export function assertForegroundOrPause(
  taskName: string,
  checkpointSummary?: string | null,
  docOverride?: { visibilityState?: string }
): void {
  if (isDocumentHidden(docOverride)) {
    throw new BackgroundPausedError(taskName, {
      checkpointSummary: checkpointSummary ?? null,
    });
  }
}

export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export async function checkpointAwareStep(
  taskName: string,
  checkpointSummary?: string | null,
  docOverride?: { visibilityState?: string }
): Promise<void> {
  assertForegroundOrPause(taskName, checkpointSummary, docOverride);
  await yieldToEventLoop();
  assertForegroundOrPause(taskName, checkpointSummary, docOverride);
}

export function registerFreezeLifecycleListener(listener: FreezeLifecycleListener): () => void {
  lifecycleListeners.set(listener.id, listener);
  return () => {
    lifecycleListeners.delete(listener.id);
  };
}

export function registerPausedBackgroundJob(job: PausedBackgroundJob): void {
  pausedJobs.set(job.taskId, job);
  emitPausedJobs();
}

export function clearPausedBackgroundJob(taskId: string): void {
  if (pausedJobs.delete(taskId)) {
    emitPausedJobs();
  }
}

export function getPausedBackgroundJobs(): PausedBackgroundJob[] {
  return Array.from(pausedJobs.values());
}

export function subscribePausedBackgroundJobs(cb: PausedJobsSubscriber): () => void {
  pausedJobSubscribers.add(cb);
  try {
    cb(getPausedBackgroundJobs());
  } catch {
    // Ignore initial emit error
  }
  return () => {
    pausedJobSubscribers.delete(cb);
  };
}

export async function resumePausedBackgroundJob(taskId: string): Promise<boolean> {
  const job = pausedJobs.get(taskId);
  if (!job) return false;
  pausedJobs.delete(taskId);
  emitPausedJobs();
  if (job.resumeHandler) {
    await job.resumeHandler();
  }
  return true;
}

function emitReleaseResources(reason: 'hidden' | 'pagehide'): void {
  try {
    abortPendingWebLocks();
  } catch {
    // Non-fatal
  }
  try {
    releaseOpenIdbResources();
  } catch {
    // Non-fatal
  }
  try {
    releaseOpenBroadcastChannels();
  } catch {
    // Non-fatal
  }
  try {
    void releaseActiveOpfsHandles().catch(() => {});
  } catch {
    // Non-fatal
  }

  const listeners = Array.from(lifecycleListeners.values());
  for (const listener of listeners) {
    if (typeof listener.onReleaseResources === 'function') {
      try {
        void Promise.resolve(listener.onReleaseResources(reason)).catch(() => {});
      } catch {
        // Non-fatal resource release failure
      }
    }
  }
}

function applyBackgroundTransition(
  nextState: 'hidden' | 'visible',
  releaseReason: 'hidden' | 'pagehide'
): void {
  if (nextState === 'hidden') {
    emitReleaseResources(releaseReason);
  }

  if (nextState === lastVisibilityState && nextState === 'hidden') {
    return;
  }
  lastVisibilityState = nextState;

  const listeners = Array.from(lifecycleListeners.values());
  if (nextState === 'hidden') {
    for (const listener of listeners) {
      if (typeof listener.onHidden === 'function') {
        try {
          void Promise.resolve(listener.onHidden()).catch(() => {});
        } catch {
          // Non-fatal
        }
      }
    }
    return;
  }

  for (const listener of listeners) {
    if (typeof listener.onVisible === 'function') {
      try {
        void Promise.resolve(listener.onVisible()).catch(() => {});
      } catch {
        // Non-fatal
      }
    }
  }

  // Auto-resume clean paused jobs immediately when returning to foreground
  const jobsSnapshot = Array.from(pausedJobs.values());
  let removedAny = false;
  for (const job of jobsSnapshot) {
    if (job.severity === 'minor' && job.resumeHandler) {
      pausedJobs.delete(job.taskId);
      removedAny = true;
      try {
        void Promise.resolve(job.resumeHandler()).catch(() => {});
      } catch {
        // Handler reports its own errors
      }
    }
  }
  if (removedAny) {
    emitPausedJobs();
  }
}

/**
 * Called from `crashLogger`'s single `visibilitychange` / `pagehide` dispatcher.
 * - On `'hidden'`: releases OPFS/IDB/channel handles and notifies registered jobs to checkpoint & pause cleanly.
 * - On `'visible'`: auto-resumes clean minor paused jobs immediately (zero tap friction),
 *   while leaving `'severity'` paused jobs intact until acknowledged by the user.
 */
export function notifyBackgroundTransition(nextState: 'hidden' | 'visible'): void {
  applyBackgroundTransition(nextState, 'hidden');
}

/**
 * Called on `pagehide` (including bfcache transitions) to release active OPFS handles,
 * open IDB transactions/connections, and BroadcastChannels even if `visibilitychange`
 * already transitioned to `'hidden'`.
 */
export function notifyPageHide(): void {
  applyBackgroundTransition('hidden', 'pagehide');
}

export function resetBackgroundFreezeCoordinatorForTests(): void {
  lifecycleListeners.clear();
  pausedJobs.clear();
  pausedJobSubscribers.clear();
  lastVisibilityState = 'visible';
}
