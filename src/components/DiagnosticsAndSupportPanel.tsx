/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Crash Handling, Verbose Error & Memory Diagnostics Panel, and Support Bundle Exporter.
 *
 * Features:
 * - Toggle verbose logging & choose rolling log retention window (3 / 7 / 14 days)
 * - Live JS Heap memory usage, storage quota, and error/memory-warning counters
 * - Filterable in-app log inspector (All, Errors & Crashes, Memory)
 * - 1-click export of Error Logs Only (.TXT / .JSON) or Full Support Bundle (.ZIP with
 *   diagnostics + optional copy of barn data and photos)
 * - Mobile native Share Sheet OR Download + pre-filled mailto compose to support
 */

import {
  Activity,
  Archive,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Mail,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
import { formatByteSizePure } from '../core/imageOptimizationSpec';
import {
  buildImprovementsRecoveryJson,
  formatImprovementsMarkdown,
  IMPROVEMENT_CATEGORY_LABELS,
  IMPROVEMENTS_REGISTRY,
} from '../core/improvementRegistry';
import { BarnDatabaseSnapshot } from '../core/models';
import {
  buildErrorLogsJson,
  buildSupportMailtoHref,
  formatSupportReportText,
} from '../core/supportBundle';
import { buildSupportBundleZipOffThread } from '../storage/offThreadWorkerClient';
import { formatTimestampedBackupSlug } from '../core/syncAndExports';
import {
  clearAllDiagnosticLogs,
  DiagnosticLogEntry,
  DiagnosticSummary,
  getDiagnosticConfig,
  getDiagnosticSummary,
  listDiagnosticLogs,
  logDiagnosticEvent,
  LogRetentionDays,
  subscribeDiagnosticLogs,
  updateDiagnosticConfig,
} from '../storage/crashLogger';
import {
  downloadBinaryFile,
  downloadTextFile,
  shareBinaryFileOrDownload,
} from '../utils/webFileActions';

interface DiagnosticsAndSupportPanelProps {
  snapshot: BarnDatabaseSnapshot;
  onScanDatabaseHealth: () => BarnHealthReport | null;
  onRepairDatabaseHealth: () => Promise<BarnHealthRepairResult | null>;
  onResetDatabaseConnection: () => Promise<void>;
  onPurgeCorruptedCaches: (options: {
    downloadBackupFirst: boolean;
    rebuildLocalDb: boolean;
  }) => Promise<{
    cachesCleared: number;
    serviceWorkersUnregistered: number;
    backupFilename: string | null;
  }>;
  onLocateConflicts?: () => void;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
}

type LogFilterTab = 'all' | 'errors' | 'memory';

export function DiagnosticsAndSupportPanel({
  snapshot,
  onScanDatabaseHealth,
  onRepairDatabaseHealth,
  onResetDatabaseConnection,
  onPurgeCorruptedCaches,
  onLocateConflicts,
  onHydrateSnapshotForExport,
}: DiagnosticsAndSupportPanelProps) {
  const [config, setConfig] = useState(() => getDiagnosticConfig());
  const [entries, setEntries] = useState<DiagnosticLogEntry[]>([]);
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilterTab>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const [includeDataInBundle, setIncludeDataInBundle] = useState(true);
  const [includePhotosInBundle, setIncludePhotosInBundle] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showImprovementsLog, setShowImprovementsLog] = useState(false);
  const [improvementsFeedback, setImprovementsFeedback] = useState<string | null>(null);
  const [lastBuiltMailMeta, setLastBuiltMailMeta] = useState<{
    filename: string;
    summary: DiagnosticSummary;
    includedData: boolean;
    includedPhotos: boolean;
  } | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [confirmRebuildDb, setConfirmRebuildDb] = useState(false);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const [healthReport, setHealthReport] = useState<BarnHealthReport | null>(null);
  const [healthRepairsList, setHealthRepairsList] = useState<string[] | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    const list = await listDiagnosticLogs();
    const sum = await getDiagnosticSummary(list);
    setEntries(list);
    setSummary(sum);
    setConfig(sum.config);
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
    const unsub = subscribeDiagnosticLogs(() => {
      void refreshDiagnostics();
    });
    const timer = setInterval(() => {
      void refreshDiagnostics();
    }, 15_000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [refreshDiagnostics]);

  const errorEntriesCount = useMemo(
    () =>
      entries.filter(
        (e) => e.level === 'error' || e.level === 'fatal' || e.category === 'react'
      ).length,
    [entries]
  );

  const memoryEntriesCount = useMemo(
    () => entries.filter((e) => e.category === 'memory').length,
    [entries]
  );

  const filteredEntries = useMemo(() => {
    if (logFilter === 'errors') {
      return entries.filter(
        (e) => e.level === 'error' || e.level === 'fatal' || e.category === 'react'
      );
    }
    if (logFilter === 'memory') {
      return entries.filter((e) => e.category === 'memory');
    }
    return entries;
  }, [entries, logFilter]);

  const totalPhotoBytes = useMemo(
    () => (snapshot.animalPhotos ?? []).reduce((sum, p) => sum + (p.storedBytes || 0), 0),
    [snapshot.animalPhotos]
  );

  const handleToggleVerbose = (enabled: boolean) => {
    const next = updateDiagnosticConfig({ verboseEnabled: enabled });
    setConfig(next);
    logDiagnosticEvent({
      level: 'info',
      category: 'lifecycle',
      message: `Verbose diagnostic logging ${enabled ? 'enabled' : 'paused (errors/crashes still recorded)'}`,
    });
  };

  const handleRetentionChange = (days: LogRetentionDays) => {
    const next = updateDiagnosticConfig({ retentionDays: days });
    setConfig(next);
    void refreshDiagnostics();
  };

  const handleSupportEmailChange = (email: string) => {
    setRecipientEmail(email);
  };

  const handleDownloadLogsTxt = async () => {
    setBusyAction(true);
    try {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const filename = `pedigree-error-logs-${formatTimestampedBackupSlug()}.txt`;
      downloadTextFile(filename, formatSupportReportText(list, sum, snapshot), 'text/plain');
      setLastBuiltMailMeta(null);
      setFeedback(`Downloaded ${filename} (${list.length} log entries + current app state).`);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadLogsJson = async () => {
    setBusyAction(true);
    try {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const filename = `pedigree-error-logs-${formatTimestampedBackupSlug()}.json`;
      downloadTextFile(
        filename,
        buildErrorLogsJson(list, sum, snapshot),
        'application/json'
      );
      setLastBuiltMailMeta(null);
      setFeedback(`Downloaded ${filename} (${list.length} log entries + current app state).`);
    } finally {
      setBusyAction(false);
    }
  };

  const handleBuildBundle = async (attemptShare: boolean) => {
    setBusyAction(true);
    setFeedback(null);
    setLastBuiltMailMeta(null);
    try {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const bundleSnapshot =
        includeDataInBundle && includePhotosInBundle && onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
      const built = await buildSupportBundleZipOffThread({
        entries: list,
        summary: sum,
        snapshot: bundleSnapshot,
        includeData: includeDataInBundle,
        includePhotos: includePhotosInBundle,
      });

      const recipient = recipientEmail.trim();
      setLastBuiltMailMeta({
        filename: built.filename,
        summary: sum,
        includedData: built.includedData,
        includedPhotos: built.includedPhotos,
      });

      if (attemptShare) {
        const mode = await shareBinaryFileOrDownload({
          filename: built.filename,
          bytes: built.bytes,
          mimeType: 'application/zip',
          title: 'Community Pedigree Bug Report Bundle',
          text: `${
            recipient ? `Bug report for ${recipient}. ` : ''
          }Includes ${built.logCount} diagnostic logs${
            built.includedData
              ? ` and ${built.animalCount} animal records${
                  built.includedPhotos ? ` (${built.photoCount} photos)` : ' (photos omitted)'
                }`
              : ''
          }.`,
        });

        setFeedback(
          mode === 'shared'
            ? `Opened Share Sheet with ${built.filename} (${formatByteSizePure(
                built.bytes.byteLength
              )}). Choose your email app to send${recipient ? ` to ${recipient}` : ''}.`
            : `Downloaded ${built.filename} (${formatByteSizePure(
                built.bytes.byteLength
              )}).${
                recipient
                  ? ` Tap "Open Email Draft" below and attach the downloaded .ZIP to email ${recipient}.`
                  : ' Type a recipient email above or tap "Open Email Draft" below and attach the downloaded .ZIP.'
              }`
        );
      } else {
        downloadBinaryFile(built.filename, built.bytes, 'application/zip');
        setFeedback(
          `Downloaded ${built.filename} (${formatByteSizePure(built.bytes.byteLength)} — ${
            built.logCount
          } logs${built.includedData ? `, ${built.animalCount} animals` : ''}).`
        );
      }
    } catch (err) {
      logDiagnosticEvent({
        level: 'error',
        category: 'storage',
        message: 'Failed to create bug report bundle archive',
        error: err,
      });
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Could not build bug report bundle. Try unchecking photos if memory is low.'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleCopySupportText = async () => {
    const list = await listDiagnosticLogs();
    const sum = await getDiagnosticSummary(list);
    const report = formatSupportReportText(list.slice(0, 60), sum);
    try {
      await navigator.clipboard.writeText(report);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      setFeedback('Clipboard unavailable — use Download Logs (.TXT) instead.');
    }
  };

  const currentHeapPct = summary?.currentMemory.heapPercent;
  const currentHeapUsed = summary?.currentMemory.usedHeapBytes;
  const currentHeapLimit = summary?.currentMemory.heapLimitBytes;
  const mailtoHref = lastBuiltMailMeta
    ? buildSupportMailtoHref({
        recipientEmail,
        ...lastBuiltMailMeta,
      })
    : null;

  return (
    <section
      id="crash-diagnostics"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            Diagnostic &amp; Crash Logs · Send Bug Report
          </h2>
          <p className="text-xs text-[var(--barn-muted)] mt-0.5">
            Automatically captures runtime crashes, unhandled promises, and memory pressure for{' '}
            {config.retentionDays} days
          </p>
        </div>
        <Bug className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
      </div>

      {/* Live Metrics & Retention Controls */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">Stored Logs</div>
          <div className="font-mono font-semibold tabular-nums mt-0.5">{entries.length}</div>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">Errors / Crashes</div>
          <div
            className={`font-mono font-semibold tabular-nums mt-0.5 ${
              errorEntriesCount > 0 ? 'text-[var(--barn-danger)]' : ''
            }`}
          >
            {errorEntriesCount}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">Memory Alerts</div>
          <div
            className={`font-mono font-semibold tabular-nums mt-0.5 ${
              (summary?.memoryWarningCount || 0) > 0 ? 'text-[var(--barn-terracotta)]' : ''
            }`}
          >
            {summary?.memoryWarningCount ?? 0}
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
          <div className="text-[11px] text-[var(--barn-muted)]">JS Heap RAM</div>
          <div className="font-mono font-semibold tabular-nums mt-0.5 truncate">
            {currentHeapUsed !== null && currentHeapUsed !== undefined
              ? `${formatByteSizePure(currentHeapUsed)}${
                  currentHeapPct !== null && currentHeapPct !== undefined
                    ? ` (${currentHeapPct}%)`
                    : ''
                }`
              : 'OS Managed'}
          </div>
          {currentHeapLimit !== null && currentHeapLimit !== undefined && (
            <div className="text-[10px] font-mono text-[var(--barn-muted)] truncate">
              Limit: {formatByteSizePure(currentHeapLimit)}
            </div>
          )}
        </div>
      </div>

      {/* Retention Window & Verbose Mode */}
      <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={config.verboseEnabled}
              onChange={(e) => handleToggleVerbose(e.target.checked)}
              className="w-4 h-4 accent-[var(--barn-sage)]"
            />
            <span>Verbose logging &amp; 30s memory watchdog (crashes always log)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--barn-border)]">
          <span className="text-[var(--barn-muted)]">Keep logs automatically for:</span>
          <div className="flex items-center gap-1.5">
            {([3, 7, 14] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={config.retentionDays === days}
                onClick={() => handleRetentionChange(days)}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  config.retentionDays === days
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                    : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Support Export & Send Controls */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold">Bug Report Bundle Options &amp; Recipient</div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDataInBundle}
              onChange={(e) => setIncludeDataInBundle(e.target.checked)}
              className="w-4 h-4 accent-[var(--barn-sage)]"
            />
            <span>
              Include a copy of my barn data ({snapshot.animals.length} animals) so crashes can be
              reproduced
            </span>
          </label>
          {includeDataInBundle && (
            <label className="flex items-center gap-2 cursor-pointer pl-6 text-[var(--barn-muted)]">
              <input
                type="checkbox"
                checked={includePhotosInBundle}
                onChange={(e) => setIncludePhotosInBundle(e.target.checked)}
                className="w-4 h-4 accent-[var(--barn-sage)]"
              />
              <span>
                Include photos ({(snapshot.animalPhotos ?? []).length} photos ·{' '}
                {formatByteSizePure(totalPhotoBytes)}) — uncheck if emailing crashes or is too large
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
          <label htmlFor="support-recipient-email" className="text-[var(--barn-muted)] shrink-0">
            Recipient Email:
          </label>
          <input
            id="support-recipient-email"
            name="support-recipient-manual"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={recipientEmail}
            onChange={(e) => handleSupportEmailChange(e.target.value)}
            placeholder="Type recipient email address"
            className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleBuildBundle(true)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            {includeDataInBundle
              ? 'Send Bug Report + Data (.ZIP)'
              : 'Send Bug Report (.ZIP)'}
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleBuildBundle(false)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Archive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            {includeDataInBundle
              ? 'Download Bug Report + Data (.ZIP)'
              : 'Download Bug Report (.ZIP)'}
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleDownloadLogsTxt()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Download Error Logs (.TXT)
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() => void handleDownloadLogsJson()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            Download Error Logs (.JSON)
          </button>
        </div>

        {feedback && (
          <div
            role="status"
            className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-2"
          >
            <div>{feedback}</div>
            <div className="flex flex-wrap items-center gap-3">
              {mailtoHref && (
                <a
                  href={mailtoHref}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                  {recipientEmail.trim()
                    ? `Open Email Draft (${recipientEmail.trim()})`
                    : 'Open Email Draft'}
                </a>
              )}
              <button
                type="button"
                onClick={() => void handleCopySupportText()}
                className="min-h-[34px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] font-medium inline-flex items-center gap-1.5"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    Copied Report
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copy Text Report
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Expandable Live Diagnostic Log Viewer */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={showLogViewer}
            onClick={() => setShowLogViewer((v) => !v)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            {showLogViewer ? 'Hide Live Diagnostic Logs' : `Inspect Captured Logs (${entries.length})`}
            {showLogViewer ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                logDiagnosticEvent({
                  level: 'info',
                  category: 'lifecycle',
                  message: 'Manual diagnostic test log recorded from Settings',
                  details: { route: 'settings', animalCount: snapshot.animals.length },
                });
                void refreshDiagnostics();
              }}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
            >
              Test Log
            </button>
            <button
              type="button"
              disabled={entries.length === 0}
              onClick={() => void clearAllDiagnosticLogs().then(refreshDiagnostics)}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-40 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
              Clear Logs
            </button>
          </div>
        </div>

        {showLogViewer && (
          <div className="space-y-2.5 border border-[var(--barn-border)] rounded-xl p-3 bg-[var(--barn-canvas)]">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  ['all', `All (${entries.length})`],
                  ['errors', `Errors & Crashes (${errorEntriesCount})`],
                  ['memory', `Memory (${memoryEntriesCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={logFilter === key}
                  onClick={() => setLogFilter(key)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                    logFilter === key
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'bg-[var(--barn-surface)] text-[var(--barn-muted)] border border-[var(--barn-border)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredEntries.length === 0 ? (
              <p className="text-xs text-[var(--barn-muted)] py-3 text-center">
                No diagnostic entries match this filter yet.
              </p>
            ) : (
              <div className="divide-y divide-[var(--barn-border)] max-h-72 overflow-y-auto bg-[var(--barn-surface)] rounded-lg border border-[var(--barn-border)]">
                {filteredEntries.slice(0, 80).map((entry) => {
                  const isExpanded = expandedLogId === entry.id;
                  const levelColor =
                    entry.level === 'fatal' || entry.level === 'error'
                      ? 'text-[var(--barn-danger)]'
                      : entry.level === 'warn'
                      ? 'text-[var(--barn-terracotta)]'
                      : 'text-[var(--barn-sage)]';

                  return (
                    <div key={entry.id} className="p-2.5 text-[11px] space-y-1">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedLogId(isExpanded ? null : entry.id)}
                        className="w-full text-left flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-mono flex flex-wrap items-center gap-1.5">
                            <span className={`font-bold uppercase ${levelColor}`}>
                              {entry.level}
                            </span>
                            <span className="text-[var(--barn-muted)]">
                              [{entry.category}] · {entry.route}
                            </span>
                            {entry.memory?.heapPercent !== null &&
                              entry.memory?.heapPercent !== undefined && (
                                <span className="text-[var(--barn-muted)]">
                                  · heap {entry.memory.heapPercent}%
                                </span>
                              )}
                          </div>
                          <div className="font-medium text-[var(--barn-ink)] break-words">
                            {entry.message}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--barn-muted)] shrink-0">
                          {new Date(entry.timestampMs).toLocaleTimeString()}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="pt-1.5 border-t border-[var(--barn-border)]/60 space-y-1 font-mono text-[10px] text-[var(--barn-muted)]">
                          <div>UTC: {entry.timestampIso}</div>
                          {entry.details && (
                            <pre className="whitespace-pre-wrap break-words bg-[var(--barn-canvas)] p-2 rounded">
                              {entry.details}
                            </pre>
                          )}
                          {entry.stack && (
                            <pre className="whitespace-pre-wrap break-words bg-[var(--barn-canvas)] p-2 rounded text-[var(--barn-danger)]">
                              {entry.stack}
                            </pre>
                          )}
                          {entry.componentStack && (
                            <pre className="whitespace-pre-wrap break-words bg-[var(--barn-canvas)] p-2 rounded">
                              {entry.componentStack}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Self-Service Database Health Check & Non-Destructive Auto-Repair */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-[var(--barn-ink)]">
              Self-Service Database Health Check &amp; Auto-Repair
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
              Scans for hidden species records, broken/circular parent links, or missing cover
              photos and fixes them safely without deleting any records.
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction}
            onClick={() => {
              setHealthRepairsList(null);
              const report = onScanDatabaseHealth();
              setHealthReport(report);
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Wrench className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Scan Herd &amp; DB Health
          </button>
        </div>

        {healthReport && (
          <div
            className={`p-3 rounded-xl border text-xs space-y-2 ${
              healthReport.healthy
                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold flex items-center gap-1.5">
                {healthReport.healthy ? (
                  <>
                    <Check className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    All Clear — {snapshot.animals.length} animals,{' '}
                    {(snapshot.animalPhotos ?? []).length} photos, and{' '}
                    {snapshot.speciesProfiles.length} species hubs passed all integrity checks.
                  </>
                ) : (
                  <>
                    <ShieldAlert
                      className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
                      aria-hidden="true"
                    />
                    Found {healthReport.totalIssueCount} structural issue(s) across{' '}
                    {healthReport.issues.length} check(s)
                  </>
                )}
              </div>

              {healthReport.autoRepairableCount > 0 && (
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={async () => {
                    setBusyAction(true);
                    try {
                      const res = await onRepairDatabaseHealth();
                      if (res) {
                        setHealthReport(res.reportAfter);
                        setHealthRepairsList(res.repairsApplied);
                      }
                    } finally {
                      setBusyAction(false);
                    }
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                >
                  Save Snapshot &amp; Auto-Repair (Zero Data Loss)
                </button>
              )}
            </div>

            {!healthReport.healthy && (
              <ul className="space-y-1.5 text-[11px]">
                {healthReport.issues.map((issue) => (
                  <li
                    key={issue.code}
                    className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[var(--barn-ink)]">{issue.title}</div>
                      <div className="text-[var(--barn-muted)]">{issue.detail}</div>
                    </div>
                    {onLocateConflicts &&
                      (issue.code === 'DUPLICATE_SPECIES_TATTOO' ||
                        issue.code === 'PARENT_SEX_MISMATCH') && (
                        <button
                          type="button"
                          onClick={onLocateConflicts}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          Locate Conflicts in Herd
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {healthRepairsList && healthRepairsList.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-1">
            <div className="font-semibold">
              Applied {healthRepairsList.length} safe repair(s) (safety snapshot saved first):
            </div>
            <ul className="list-disc pl-4 text-[11px] space-y-0.5">
              {healthRepairsList.slice(0, 10).map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Database Connection & Corrupted Cache Recovery (Backup-First) */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div>
          <div className="text-xs font-semibold text-[var(--barn-ink)]">
            Database Connection &amp; Corrupted Cache Recovery
          </div>
          <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
            Fixes wedged SQLite/IndexedDB handles or stale PWA caches while keeping your saved
            records safe and retaining a timestamped backup file on your device.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busyAction}
            onClick={async () => {
              setBusyAction(true);
              setRecoveryFeedback(null);
              try {
                await onResetDatabaseConnection();
                setRecoveryFeedback(
                  'Database connection cleanly closed & re-opened with all animals and photos intact.'
                );
                await refreshDiagnostics();
              } catch (err) {
                setRecoveryFeedback(
                  err instanceof Error ? err.message : 'Database connection reset failed.'
                );
              } finally {
                setBusyAction(false);
              }
            }}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            Reset DB Connection (Keep Data)
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={async () => {
              setBusyAction(true);
              setRecoveryFeedback(null);
              try {
                const res = await onPurgeCorruptedCaches({
                  downloadBackupFirst: true,
                  rebuildLocalDb: false,
                });
                setRecoveryFeedback(
                  `Cleared ${res.cachesCleared} app cache(s) & ${res.serviceWorkersUnregistered} service worker(s), kept all herd records, and retained backup ${
                    res.backupFilename || '(zip)'
                  }.`
                );
                await refreshDiagnostics();
              } catch (err) {
                setRecoveryFeedback(
                  err instanceof Error ? err.message : 'Cache purge failed.'
                );
              } finally {
                setBusyAction(false);
              }
            }}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            Purge Stale Caches + Retain Backup
          </button>
        </div>

        <div className="pt-2 border-t border-[var(--barn-border)]/70">
          {!confirmRebuildDb ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--barn-muted)]">
                Only if IndexedDB itself is corrupted:
              </span>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setConfirmRebuildDb(true)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)]"
              >
                Purge &amp; Rebuild Local DB (Auto-Backup First)
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs">
              <p className="text-[11px] font-medium text-[var(--barn-ink)]">
                This will export &amp; download a complete timestamped `.ZIP` backup file to your
                device first, then purge &amp; rebuild the local IndexedDB database cleanly.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyAction}
                  onClick={async () => {
                    setBusyAction(true);
                    setRecoveryFeedback(null);
                    try {
                      const res = await onPurgeCorruptedCaches({
                        downloadBackupFirst: true,
                        rebuildLocalDb: true,
                      });
                      setConfirmRebuildDb(false);
                      setRecoveryFeedback(
                        `Retained ${
                          res.backupFilename || 'timestamped backup'
                        }, purged ${res.cachesCleared} cache(s), and rebuilt local IndexedDB cleanly. Use "Restore (.JSON / .ZIP)" above whenever ready.`
                      );
                      await refreshDiagnostics();
                    } finally {
                      setBusyAction(false);
                    }
                  }}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold"
                >
                  Download Backup &amp; Rebuild DB
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRebuildDb(false)}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {recoveryFeedback && (
          <div
            role="status"
            className="p-2.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
          >
            {recoveryFeedback}
          </div>
        )}
      </div>

      {/* App Improvements & GitHub-Overwrite Recovery Log (IMP-011) */}
      <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-[var(--barn-ink)]">
              App Improvements &amp; Recovery Log ({IMPROVEMENTS_REGISTRY.length})
            </div>
            <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
              Download or copy the tracked improvements manifest &amp; restoration playbooks.
            </p>
          </div>
          <button
            type="button"
            aria-expanded={showImprovementsLog}
            onClick={() => setShowImprovementsLog((v) => !v)}
            className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
          >
            {showImprovementsLog ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                Hide Log
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                View Tracked Improvements
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              downloadTextFile('IMPROVEMENTS.md', formatImprovementsMarkdown(), 'text/markdown');
              setImprovementsFeedback('Downloaded IMPROVEMENTS.md recovery manual.');
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download IMPROVEMENTS.md
          </button>

          <button
            type="button"
            onClick={() => {
              downloadTextFile(
                'pedigree-improvements-log.json',
                buildImprovementsRecoveryJson(),
                'application/json'
              );
              setImprovementsFeedback('Downloaded pedigree-improvements-log.json.');
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Recovery .JSON
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(formatImprovementsMarkdown());
                setImprovementsFeedback('Copied Markdown recovery log to clipboard.');
              } catch {
                setImprovementsFeedback('Clipboard unavailable — use Download IMPROVEMENTS.md.');
              }
            }}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            Copy Markdown Log
          </button>
        </div>

        {improvementsFeedback && (
          <div
            role="status"
            className="p-2 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px]"
          >
            {improvementsFeedback}
          </div>
        )}

        {showImprovementsLog && (
          <div className="space-y-2 max-h-72 overflow-y-auto pt-1">
            {IMPROVEMENTS_REGISTRY.map((entry) => (
              <div
                key={entry.id}
                className="p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    <span className="font-mono text-[var(--barn-sage)]">{entry.id}</span> ·{' '}
                    {entry.title}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                    {IMPROVEMENT_CATEGORY_LABELS[entry.category]}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">{entry.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
