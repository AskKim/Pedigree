/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Backup Status, Timestamps & Reminder Policy Engine (`src/core/backupStatus.ts`).
 *
 * Zero DOM dependencies so backup freshness rules are unit-testable and portable.
 */

import { BarnDatabaseSnapshot, nowEpochMs, PREDEFINED_SPECIES_PRESETS } from './models';
import { isSampleTestingId } from './sampleData';

export interface LastBackupMeta {
  exportedAtIso: string;
  format: 'zip' | 'sqlite' | 'json';
  fileName?: string;
}

export type BackupHealthLevel =
  | 'up_to_date'
  | 'changes_pending'
  | 'overdue'
  | 'never_backed_up';

export interface BackupStatusEvaluation {
  level: BackupHealthLevel;
  hasRealData: boolean;
  hasChangesSinceBackup: boolean;
  ageDays: number | null;
  latestRecordUpdatedAt: string;
  needsReminder: boolean;
  showDismissibleBanner: boolean;
  headline: string;
  detail: string;
  lastExportLabel: string;
  lastExportRelative: string;
  latestChangeLabel: string;
}

const PREDEFINED_SPECIES_LOWER = new Set(
  PREDEFINED_SPECIES_PRESETS.map((p) => p.name.trim().toLowerCase())
);

/**
 * Formats an ISO-8601 timestamp into a clean human-readable local date & time string.
 */
export function formatLocalDateTimeReadable(iso: string | undefined | null): string {
  if (!iso) return 'Not recorded';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a concise relative age label (e.g. "just now", "2h ago", "5d ago").
 */
export function formatRelativeBackupAge(
  iso: string | undefined | null,
  nowMs: number = nowEpochMs()
): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Scans all barn collections and settings to find the newest ISO-8601 `updatedAt` timestamp.
 */
export function getLatestSnapshotTimestamp(snapshot: BarnDatabaseSnapshot): string {
  let latest = snapshot.settings.updatedAt || '';
  const checkItems = (items: Array<{ updatedAt?: string }> | undefined) => {
    if (!items) return;
    for (const item of items) {
      if (item.updatedAt && item.updatedAt > latest) {
        latest = item.updatedAt;
      }
    }
  };
  checkItems(snapshot.speciesProfiles);
  checkItems(snapshot.animals);
  checkItems(snapshot.animalPhotos);
  checkItems(snapshot.cages);
  checkItems(snapshot.breedings);
  checkItems(snapshot.tasks);
  checkItems(snapshot.careLogs);
  checkItems(snapshot.shows);
  checkItems(snapshot.feedBatches);
  checkItems(snapshot.feedAllocations);
  return latest;
}

/**
 * Returns `true` when the user has non-sample livestock records, photos, custom species,
 * or a personalized barn/breeder setup worth backing up proactively.
 */
export function hasNonTestingBarnData(snapshot: BarnDatabaseSnapshot): boolean {
  const hasRealAnimals = snapshot.animals.some((a) => !isSampleTestingId(a.id));
  const hasPhotos = (snapshot.animalPhotos ?? []).length > 0;
  const hasRealBreedings = snapshot.breedings.some((b) => !isSampleTestingId(b.id));
  const hasRealCages = snapshot.cages.some((c) => !isSampleTestingId(c.id));
  const hasRealTasks = snapshot.tasks.some((t) => !isSampleTestingId(t.id));
  const hasRealLogs = snapshot.careLogs.some((l) => !isSampleTestingId(l.id));
  const hasRealShows = snapshot.shows.some((s) => !isSampleTestingId(s.id));
  const hasRealFeedBatches = (snapshot.feedBatches ?? []).some((f) => !isSampleTestingId(f.id));
  const hasRealFeedAllocs = (snapshot.feedAllocations ?? []).some((a) => !isSampleTestingId(a.id));
  const hasCustomSpecies = snapshot.speciesProfiles.some(
    (sp) => !PREDEFINED_SPECIES_LOWER.has(sp.name.trim().toLowerCase())
  );
  const hasSpeciesMemo = snapshot.speciesProfiles.some(
    (sp) => (sp.memoText || '').trim().length > 0
  );

  return (
    hasRealAnimals ||
    hasPhotos ||
    hasRealBreedings ||
    hasRealCages ||
    hasRealTasks ||
    hasRealLogs ||
    hasRealShows ||
    hasRealFeedBatches ||
    hasRealFeedAllocs ||
    hasCustomSpecies ||
    hasSpeciesMemo
  );
}

/**
 * Evaluates backup freshness, pending changes, readable timestamps, and whether a proactive
 * reminder banner should be surfaced outside Settings.
 */
export function evaluateBackupStatus(
  snapshot: BarnDatabaseSnapshot,
  lastBackup: LastBackupMeta | null,
  nowMs: number = nowEpochMs(),
  snoozedUntilMs: number = 0,
  overdueDaysThreshold: number = 7
): BackupStatusEvaluation {
  const latestRecordUpdatedAt = getLatestSnapshotTimestamp(snapshot);
  const latestChangeLabel = formatLocalDateTimeReadable(latestRecordUpdatedAt);
  const hasRealData = hasNonTestingBarnData(snapshot);

  const exportMs = lastBackup ? new Date(lastBackup.exportedAtIso).getTime() : NaN;
  const hasValidLastBackup = Boolean(lastBackup && !Number.isNaN(exportMs));

  const ageDays = hasValidLastBackup
    ? Math.max(0, (nowMs - exportMs) / (1000 * 60 * 60 * 24))
    : null;

  const hasChangesSinceBackup = Boolean(
    hasValidLastBackup &&
      latestRecordUpdatedAt &&
      latestRecordUpdatedAt > lastBackup!.exportedAtIso
  );

  const lastExportLabel = hasValidLastBackup
    ? `${formatLocalDateTimeReadable(lastBackup!.exportedAtIso)} (.${lastBackup!.format.toUpperCase()})`
    : 'Never exported';
  const lastExportRelative = hasValidLastBackup
    ? formatRelativeBackupAge(lastBackup!.exportedAtIso, nowMs)
    : '';

  let level: BackupHealthLevel = 'up_to_date';
  let headline = 'Barn data backed up externally';
  let detail = hasValidLastBackup
    ? `Your latest barn edits are covered by your ${lastExportLabel} export.`
    : 'No local backup file has been saved yet.';

  if (!hasValidLastBackup) {
    level = 'never_backed_up';
    headline = 'No external backup exported yet';
    detail =
      'Download a complete .ZIP backup (Settings → Backups & Import) to safeguard your records, SQLite database, and images.';
  } else if (hasChangesSinceBackup && ageDays !== null && ageDays >= overdueDaysThreshold) {
    level = 'overdue';
    const wholeDays = Math.floor(ageDays);
    headline = `Backup is ${wholeDays} day${wholeDays === 1 ? '' : 's'} old with new edits`;
    detail = `Last export was ${lastExportLabel}, and records were updated ${latestChangeLabel}.`;
  } else if (hasChangesSinceBackup) {
    level = 'changes_pending';
    headline = 'New changes since your last backup';
    detail = `Records updated ${latestChangeLabel} after your ${lastExportLabel} export.`;
  } else if (ageDays !== null && ageDays >= overdueDaysThreshold) {
    level = 'overdue';
    const wholeDays = Math.floor(ageDays);
    headline = `Last backup was ${wholeDays} day${wholeDays === 1 ? '' : 's'} ago`;
    detail = 'Download a fresh .ZIP snapshot periodically for extra peace of mind.';
  }

  const needsReminder = level !== 'up_to_date';
  const isSnoozed = snoozedUntilMs > nowMs;
  const showDismissibleBanner = hasRealData && needsReminder && !isSnoozed;

  return {
    level,
    hasRealData,
    hasChangesSinceBackup,
    ageDays,
    latestRecordUpdatedAt,
    needsReminder,
    showDismissibleBanner,
    headline,
    detail,
    lastExportLabel,
    lastExportRelative,
    latestChangeLabel,
  };
}
