/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Support Bundle Exporter (.ZIP with Logs + Optional Copy of User Barn Data) & Email/Share Helper.
 *
 * Packages:
 * - `diagnostics/support-report.txt`: Human-readable device, memory, quota & crash summary
 * - `diagnostics/error-logs.json`: Complete verbose structured log history within retention window
 * - Optional copy of user data (`pedigree-backup.json` + optional `photos/...`) placed at archive
 *   root so maintainers can inspect reports AND 1-click restore the exact workspace into
 *   Community Pedigree to reproduce issues.
 */

import { strToU8, zipSync, Zippable } from 'fflate';
import { buildCompleteBackupZipFiles } from './backupArchive';
import { formatByteSizePure } from './imageOptimizationSpec';
import { BarnDatabaseSnapshot, nowIsoUtc } from './models';
import { exportBarnBackupJson, formatTimestampedBackupSlug } from './syncAndExports';
import type { DiagnosticLogEntry, DiagnosticSummary } from '../storage/crashLogger';

export interface SupportBundleBuildResult {
  bytes: Uint8Array;
  filename: string;
  logCount: number;
  includedData: boolean;
  includedPhotos: boolean;
  animalCount: number;
  photoCount: number;
}

export interface CompactAppStateSummary {
  barnName: string;
  breederName: string;
  themeMode: string;
  preferredUnit: string;
  defaultSpecies: string;
  pinnedLandingSpecies: string;
  defaultGenerations: number;
  imageOptimizationPreset: string;
  speciesCount: number;
  animalCount: number;
  photoCount: number;
  totalPhotoStoredBytes: number;
  breedingCount: number;
  openTaskCount: number;
  cageCount: number;
  careLogCount: number;
  showCount: number;
  speciesBreakdown: Array<{ name: string; animals: number; breedings: number }>;
}

export function buildCompactAppStateSummary(
  snapshot?: BarnDatabaseSnapshot | null
): CompactAppStateSummary | null {
  if (!snapshot) return null;
  const photos = snapshot.animalPhotos ?? [];
  return {
    barnName: snapshot.settings.barnName,
    breederName: snapshot.settings.breederName,
    themeMode: snapshot.settings.themeMode,
    preferredUnit: snapshot.settings.preferredUnit,
    defaultSpecies: snapshot.settings.defaultSpecies,
    pinnedLandingSpecies: snapshot.settings.pinnedLandingSpecies || '(Home Screen)',
    defaultGenerations: snapshot.settings.defaultGenerations,
    imageOptimizationPreset: snapshot.settings.imageOptimizationPreset || 'balanced',
    speciesCount: snapshot.speciesProfiles.length,
    animalCount: snapshot.animals.length,
    photoCount: photos.length,
    totalPhotoStoredBytes: photos.reduce((sum, p) => sum + (p.storedBytes || 0), 0),
    breedingCount: snapshot.breedings.length,
    openTaskCount: snapshot.tasks.filter((t) => !t.completed).length,
    cageCount: snapshot.cages.length,
    careLogCount: snapshot.careLogs.length,
    showCount: snapshot.shows.length,
    speciesBreakdown: snapshot.speciesProfiles.map((sp) => {
      const key = sp.name.trim().toLowerCase();
      return {
        name: sp.name,
        animals: snapshot.animals.filter((a) => a.species.trim().toLowerCase() === key).length,
        breedings: snapshot.breedings.filter((b) => b.species.trim().toLowerCase() === key).length,
      };
    }),
  };
}

export function formatSupportReportText(
  entries: DiagnosticLogEntry[],
  summary: DiagnosticSummary,
  snapshot?: BarnDatabaseSnapshot | null
): string {
  const mem = summary.currentMemory;
  const heapUsed =
    mem.usedHeapBytes !== null ? formatByteSizePure(mem.usedHeapBytes) : 'Unavailable';
  const heapLimit =
    mem.heapLimitBytes !== null ? formatByteSizePure(mem.heapLimitBytes) : 'Unavailable';
  const storageUsed =
    mem.storageUsageBytes !== undefined ? formatByteSizePure(mem.storageUsageBytes) : 'Unavailable';
  const storageQuota =
    mem.storageQuotaBytes !== undefined
      ? formatByteSizePure(mem.storageQuotaBytes)
      : 'Unavailable';
  const appState = buildCompactAppStateSummary(snapshot);

  const headerLines = [
    '====================================================================',
    'Community Pedigree — Crash & Diagnostic Support Report',
    '====================================================================',
    `Generated UTC:      ${nowIsoUtc()}`,
    `Active Session:     ${summary.sessionId}`,
    `Platform / Screen:  ${summary.platformInfo}`,
    `Browser User-Agent: ${summary.userAgent}`,
    `Retention Window:   ${summary.config.retentionDays} days (Verbose: ${
      summary.config.verboseEnabled ? 'ON' : 'OFF'
    })`,
    `JS Heap Memory:     ${heapUsed} / ${heapLimit}${
      mem.heapPercent !== null ? ` (${mem.heapPercent}%)` : ''
    }`,
    `Browser Storage:    ${storageUsed} / ${storageQuota}`,
    `Total Log Entries:  ${summary.totalEntries} (Errors/Fatal: ${summary.errorCount}, Memory Warnings: ${summary.memoryWarningCount}, React Crashes: ${summary.crashCount})`,
    `Log Time Span:      ${summary.oldestEntryIso || 'none'} -> ${summary.newestEntryIso || 'none'}`,
    ...(appState
      ? [
          '--------------------------------------------------------------------',
          `App State:          Barn="${appState.barnName}" · Theme=${appState.themeMode} · Default=${appState.defaultSpecies} (${appState.defaultGenerations}-Gen)`,
          `Totals:             ${appState.speciesCount} species · ${appState.animalCount} animals · ${appState.photoCount} photos (${formatByteSizePure(appState.totalPhotoStoredBytes)}) · ${appState.breedingCount} breedings · ${appState.openTaskCount} open chores`,
          `Species Counts:     ${appState.speciesBreakdown.map((s) => `${s.name}: ${s.animals}`).join(' | ')}`,
        ]
      : []),
    '====================================================================',
    '',
  ];

  if (entries.length === 0) {
    headerLines.push('No diagnostic log entries recorded within the active retention window.');
    return headerLines.join('\n');
  }

  const logLines = entries.map((e) => {
    const memTag =
      e.memory?.heapPercent !== null && e.memory?.heapPercent !== undefined
        ? ` | heap=${e.memory.heapPercent}% (${formatByteSizePure(e.memory.usedHeapBytes || 0)})`
        : '';
    const parts = [
      `[${e.timestampIso}] [${e.level.toUpperCase()}] [${e.category}] [route=${e.route}]${memTag}`,
      `  Message: ${e.message}`,
    ];
    if (e.details) parts.push(`  Details: ${e.details}`);
    if (e.stack) parts.push(`  Stack:\n    ${e.stack.replace(/\n/g, '\n    ')}`);
    if (e.componentStack) {
      parts.push(`  Component Stack:\n    ${e.componentStack.replace(/\n/g, '\n    ')}`);
    }
    return parts.join('\n');
  });

  return [...headerLines, ...logLines].join('\n\n');
}

export function buildErrorLogsJson(
  entries: DiagnosticLogEntry[],
  summary: DiagnosticSummary,
  snapshot?: BarnDatabaseSnapshot | null
): string {
  return JSON.stringify(
    {
      format: 'community-pedigree-diagnostics-v1',
      package: 'Pedigree',
      exportedAtIsoUtc: nowIsoUtc(),
      summary,
      appState: buildCompactAppStateSummary(snapshot),
      entries,
    },
    null,
    2
  );
}

export function buildSupportBundleZipArchive(params: {
  entries: DiagnosticLogEntry[];
  summary: DiagnosticSummary;
  snapshot?: BarnDatabaseSnapshot | null;
  includeData: boolean;
  includePhotos: boolean;
}): SupportBundleBuildResult {
  const { entries, summary, snapshot, includeData, includePhotos } = params;
  const stamp = formatTimestampedBackupSlug();
  let zipFiles: Zippable = {};

  let photoCount = 0;
  let animalCount = 0;

  if (includeData && snapshot) {
    animalCount = snapshot.animals.length;
    if (includePhotos) {
      const built = buildCompleteBackupZipFiles(snapshot);
      zipFiles = built.zipFiles;
      photoCount = built.photoCount;
    } else {
      const dbOnlySnapshot: BarnDatabaseSnapshot = {
        ...snapshot,
        animalPhotos: [],
      };
      zipFiles['pedigree-backup.json'] = [
        strToU8(exportBarnBackupJson(dbOnlySnapshot)),
        { level: 6 },
      ];
    }
  }

  zipFiles['diagnostics/support-report.txt'] = [
    strToU8(formatSupportReportText(entries, summary, snapshot)),
    { level: 6 },
  ];
  zipFiles['diagnostics/error-logs.json'] = [
    strToU8(buildErrorLogsJson(entries, summary, snapshot)),
    { level: 6 },
  ];

  const filename = includeData
    ? `pedigree-support-bundle-with-data-${stamp}.zip`
    : `pedigree-error-logs-${stamp}.zip`;

  return {
    bytes: zipSync(zipFiles),
    filename,
    logCount: entries.length,
    includedData: Boolean(includeData && snapshot),
    includedPhotos: Boolean(includeData && snapshot && includePhotos),
    animalCount,
    photoCount,
  };
}

export function buildSupportMailtoHref(params: {
  recipientEmail: string;
  filename: string;
  summary: DiagnosticSummary;
  includedData: boolean;
  includedPhotos: boolean;
}): string {
  const { recipientEmail, filename, summary, includedData, includedPhotos } = params;
  const email = (recipientEmail || 'askkimsocial@gmail.com').trim();
  const subject = `[Community Pedigree] Crash / Diagnostic Support Bundle (${
    summary.errorCount
  } errors, ${summary.memoryWarningCount} memory warnings)`;

  const mem = summary.currentMemory;
  const bodyLines = [
    'Hi Kimberly,',
    '',
    'I am sending a diagnostic support export from Community Pedigree.',
    `Attached / Downloaded File: ${filename}`,
    '',
    '--- Device & Diagnostic Summary ---',
    `Platform / Screen: ${summary.platformInfo}`,
    `Errors / Fatal: ${summary.errorCount}`,
    `Memory Warnings: ${summary.memoryWarningCount}`,
    `JS Heap: ${
      mem.usedHeapBytes !== null ? formatByteSizePure(mem.usedHeapBytes) : 'n/a'
    } / ${mem.heapLimitBytes !== null ? formatByteSizePure(mem.heapLimitBytes) : 'n/a'}${
      mem.heapPercent !== null ? ` (${mem.heapPercent}%)` : ''
    }`,
    `Includes Copy of Barn Data: ${
      includedData ? (includedPhotos ? 'Yes (Database + Photos)' : 'Yes (Database Only)') : 'Logs Only'
    }`,
    '',
    'What I was doing when the problem occurred:',
    '(Please describe what you tapped before the crash/error, and make sure the downloaded .ZIP file above is attached to this email.)',
  ];

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}
