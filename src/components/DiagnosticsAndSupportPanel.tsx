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
  HardDrive,
  Image as ImageIcon,
  Mail,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
import {
  formatByteSizePure,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import type { PhotoStorageFootprintReport } from '../core/photoMaintenance';
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
  readEmergencySessionTrace,
  subscribeDiagnosticLogs,
  updateDiagnosticConfig,
} from '../storage/crashLogger';
import { getHeavyZipExportGate } from '../core/deviceCapability';
import {
  DESTRUCTIVE_CONFIRM_PHRASES,
  isDestructiveActionConfirmationValid,
  validateLogRetentionDaysOverride,
  validateSupportRecipientEmail,
} from '../core/techyStuffGuardrails';
import {
  DiagnosticQuotaPreflightResult,
  isQuotaExceededError,
  StorageProtectionStatus,
  verifyStorageQuotaForDiagnosticAction,
} from '../storage/storageProtection';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import {
  copyTextWithFallback,
  downloadBinaryFile,
  downloadTextFile,
  shareBinaryFileOrDownload,
} from '../utils/webFileActions';
import type { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';

interface DiagnosticsAndSupportPanelProps {
  snapshot: BarnDatabaseSnapshot;
  deviceCapability?: DeviceCapabilityController;
  storageStatus?: StorageProtectionStatus | null;
  onRefreshStorageStatus?: () => Promise<unknown> | void;
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
  onAnalyzePhotoFootprint?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<PhotoStorageFootprintReport | null>;
  onPruneOrphanPhotos?: () => Promise<{ removedCount: number; reclaimedBytes: number }>;
  onReoptimizeOversizedPhotos?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<{ updatedCount: number; oversizedFound: number; reclaimedBytes: number }>;
  onPruneFullResPhotoPayloads?: () => Promise<{ prunedCount: number; reclaimedBytes: number }>;
}

type LogFilterTab = 'all' | 'errors' | 'memory';

export function DiagnosticsAndSupportPanel({
  snapshot,
  deviceCapability,
  onRefreshStorageStatus,
  onScanDatabaseHealth,
  onRepairDatabaseHealth,
  onResetDatabaseConnection,
  onPurgeCorruptedCaches,
  onLocateConflicts,
  onHydrateSnapshotForExport,
  onAnalyzePhotoFootprint,
  onPruneOrphanPhotos,
  onReoptimizeOversizedPhotos,
  onPruneFullResPhotoPayloads,
}: DiagnosticsAndSupportPanelProps) {
  const [config, setConfig] = useState(() => getDiagnosticConfig());
  const [entries, setEntries] = useState<DiagnosticLogEntry[]>([]);
  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilterTab>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const basePanelId = useId();
  const logViewerId = `${basePanelId}-log-viewer`;
  const improvementsLogId = `${basePanelId}-improvements-log`;

  const [includeDataInBundle, setIncludeDataInBundle] = useState(true);
  const [includePhotosInBundle, setIncludePhotosInBundle] = useState(true);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientEmailError, setRecipientEmailError] = useState<string | null>(null);
  const actionLock = useAsyncSubmitLock();
  const busyAction = actionLock.isSubmitting;
  const [emergencyTraceCount, setEmergencyTraceCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [quotaWarningGate, setQuotaWarningGate] = useState<{
    preflight: DiagnosticQuotaPreflightResult;
    attemptShare: boolean;
  } | null>(null);
  const [showImprovementsLog, setShowImprovementsLog] = useState(false);
  const [improvementsFeedback, setImprovementsFeedback] = useState<string | null>(null);
  const [lastBuiltMailMeta, setLastBuiltMailMeta] = useState<{
    filename: string;
    summary: DiagnosticSummary;
    includedData: boolean;
    includedPhotos: boolean;
  } | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [manualCopyBox, setManualCopyBox] = useState<{
    target: 'support' | 'improvements';
    label: string;
    text: string;
  } | null>(null);
  const [confirmRebuildDb, setConfirmRebuildDb] = useState(false);
  const [rebuildConfirmPhrase, setRebuildConfirmPhrase] = useState('');
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [pendingHeavyBundleAttemptShare, setPendingHeavyBundleAttemptShare] = useState<
    boolean | null
  >(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<string | null>(null);
  const [healthReport, setHealthReport] = useState<BarnHealthReport | null>(null);
  const [healthRepairsList, setHealthRepairsList] = useState<string[] | null>(null);
  const [photoFootprint, setPhotoFootprint] = useState<PhotoStorageFootprintReport | null>(null);
  const [confirmPruneFullRes, setConfirmPruneFullRes] = useState(false);
  const [photoMaintenanceFeedback, setPhotoMaintenanceFeedback] = useState<string | null>(null);

  const heavyBundleGate = deviceCapability
    ? getHeavyZipExportGate(deviceCapability.assessment, deviceCapability.browserCompatibility)
    : { requiresConfirmation: false, title: '', body: '', advice: '' };

  const refreshDiagnostics = useCallback(async () => {
    const list = await listDiagnosticLogs();
    const sum = await getDiagnosticSummary(list);
    setEntries(list);
    setEmergencyTraceCount(readEmergencySessionTrace().length);
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
    const validated = validateLogRetentionDaysOverride(days);
    if (!validated.ok) return;
    const next = updateDiagnosticConfig({ retentionDays: validated.days });
    setConfig(next);
    void refreshDiagnostics();
  };

  const handleSupportEmailChange = (email: string) => {
    setRecipientEmail(email);
    const check = validateSupportRecipientEmail(email);
    setRecipientEmailError(check.ok ? null : check.error);
  };

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const handleDownloadLogsTxt = async () => {
    await actionLock.runLocked(async () => {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const filename = `pedigree-error-logs-${formatTimestampedBackupSlug()}.txt`;
      await downloadTextFile(filename, formatSupportReportText(list, sum, snapshot), 'text/plain');
      setLastBuiltMailMeta(null);
      setFeedback(`Downloaded ${filename} (${list.length} log entries + current app state).`);
    });
  };

  const handleDownloadLogsJson = async () => {
    await actionLock.runLocked(async () => {
      const list = await listDiagnosticLogs();
      const sum = await getDiagnosticSummary(list);
      const filename = `pedigree-error-logs-${formatTimestampedBackupSlug()}.json`;
      await downloadTextFile(
        filename,
        buildErrorLogsJson(list, sum, snapshot),
        'application/json'
      );
      setLastBuiltMailMeta(null);
      setFeedback(`Downloaded ${filename} (${list.length} log entries + current app state).`);
    });
  };

  const handleBuildBundle = async (
    attemptShare: boolean,
    skipCaution = false,
    skipQuotaWarning = false
  ) => {
    const emailValidation = validateSupportRecipientEmail(recipientEmail);
    if (!emailValidation.ok) {
      setRecipientEmailError(emailValidation.error);
      setFeedback(emailValidation.error);
      return;
    }
    setRecipientEmailError(null);
    const hasEmbeddedPhotos =
      includeDataInBundle && includePhotosInBundle && (snapshot.animalPhotos ?? []).length > 0;
    if (!skipCaution && hasEmbeddedPhotos && heavyBundleGate.requiresConfirmation) {
      setPendingHeavyBundleAttemptShare(attemptShare);
      return;
    }
    setPendingHeavyBundleAttemptShare(null);
    await actionLock.runLocked(async () => {
      setFeedback(null);
      setLastBuiltMailMeta(null);
      setQuotaWarningGate(null);
      try {
        const estimatedBundleBytes =
          256 * 1024 +
          (includeDataInBundle ? snapshot.animals.length * 1024 : 0) +
          (hasEmbeddedPhotos ? totalPhotoBytes : 0);

        const quotaPreflight = await verifyStorageQuotaForDiagnosticAction({
          operation: 'support_bundle_zip',
          operationLabel: hasEmbeddedPhotos
            ? 'Support Bundle + Photos (.ZIP)'
            : includeDataInBundle
              ? 'Support Bundle + Barn Data (.ZIP)'
              : 'Support Bundle Logs (.ZIP)',
          estimatedRequiredBytes: estimatedBundleBytes,
          requiresOpfsPreferred: true,
        });

        if (!quotaPreflight.allowed) {
          setFeedback(`${quotaPreflight.headline} — ${quotaPreflight.detail}`);
          return;
        }
        if (quotaPreflight.requiresConfirmation && !skipQuotaWarning) {
          setQuotaWarningGate({ preflight: quotaPreflight, attemptShare });
          return;
        }

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

        const recipient = emailValidation.email;
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
        await downloadBinaryFile(built.filename, built.bytes, 'application/zip');
        setFeedback(
          `Downloaded ${built.filename} (${formatByteSizePure(built.bytes.byteLength)} — ${
            built.logCount
          } logs${built.includedData ? `, ${built.animalCount} animals` : ''}).`
        );
      }
    } catch (err) {
      logDiagnosticEvent({
        level: 'error',
        category: isQuotaExceededError(err) ? 'storage' : 'storage',
        message: isQuotaExceededError(err)
          ? 'Browser storage quota exceeded while building bug report archive'
          : 'Failed to create bug report bundle archive',
        error: err,
      });
      setFeedback(
        isQuotaExceededError(err)
          ? 'Browser storage quota exceeded while staging .ZIP bundle. Uncheck photos or use lightweight .TXT / .JSON exports.'
          : err instanceof Error
            ? err.message
            : 'Could not build bug report bundle. Try unchecking photos if memory is low.'
      );
    }
    });
  };

  const handleCopySupportText = async () => {
    const list = await listDiagnosticLogs();
    const sum = await getDiagnosticSummary(list);
    const report = formatSupportReportText(list.slice(0, 60), sum);
    const copyMode = await copyTextWithFallback(report);
    if (copyMode !== 'unsupported') {
      setManualCopyBox(null);
      setCopiedSummary(true);
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = setTimeout(() => {
        copiedTimerRef.current = null;
        setCopiedSummary(false);
      }, 2500);
    } else {
      setManualCopyBox({
        target: 'support',
        label: 'Selectable Support Text Report',
        text: report,
      });
      setFeedback(
        'Clipboard access is blocked here — copy from the text box below or use Download Error Logs (.TXT).'
      );
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

      {emergencyTraceCount > 0 && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
        >
          <strong>Emergency Session Trace Active ({emergencyTraceCount}):</strong> Primary browser storage
          could not accept one or more crash entries, so compact traces were preserved in{' '}
          <span className="font-mono">sessionStorage</span> and merged into the log viewer below.
        </div>
      )}

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

        <div className="space-y-1 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
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
              aria-invalid={Boolean(recipientEmailError)}
              className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
            />
          </div>
          {recipientEmailError && (
            <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium">
              {recipientEmailError}
            </p>
          )}
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

        {quotaWarningGate && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2"
          >
            <div className="font-semibold text-[var(--barn-ink)]">
              {quotaWarningGate.preflight.headline}
            </div>
            <p className="text-[11px] text-[var(--barn-ink)] leading-relaxed">
              {quotaWarningGate.preflight.detail}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const share = quotaWarningGate.attemptShare;
                  setQuotaWarningGate(null);
                  void handleBuildBundle(share, true, true);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
              >
                Continue Despite Low Quota
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncludePhotosInBundle(false);
                  setQuotaWarningGate(null);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
              >
                Uncheck Photos to Save Quota
              </button>
              <button
                type="button"
                onClick={() => setQuotaWarningGate(null)}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {pendingHeavyBundleAttemptShare !== null && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2"
          >
            <div className="font-semibold text-[var(--barn-ink)]">{heavyBundleGate.title}</div>
            <p className="text-[11px] text-[var(--barn-ink)] leading-relaxed">
              {heavyBundleGate.body} Unchecking photos or using Timestamped Backup (.JSON) +
              Download Error Logs (.TXT) avoids .ZIP memory spikes on older or Tier 1 devices.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const share = pendingHeavyBundleAttemptShare;
                  setPendingHeavyBundleAttemptShare(null);
                  void handleBuildBundle(share, true);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
              >
                Try .ZIP Bundle Anyway
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncludePhotosInBundle(false);
                  setPendingHeavyBundleAttemptShare(null);
                }}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
              >
                Uncheck Photos (Safer .ZIP)
              </button>
              <button
                type="button"
                onClick={() => setPendingHeavyBundleAttemptShare(null)}
                className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            aria-live="polite"
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
            {manualCopyBox?.target === 'support' && (
              <div className="pt-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[var(--barn-ink)]">
                    {manualCopyBox.label} (tap to select all)
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualCopyBox(null)}
                    className="text-[11px] underline text-[var(--barn-muted)]"
                  >
                    Hide box
                  </button>
                </div>
                <textarea
                  readOnly
                  aria-label={manualCopyBox.label}
                  value={manualCopyBox.text}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  rows={6}
                  className="w-full p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expandable Live Diagnostic Log Viewer */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={showLogViewer}
            aria-controls={logViewerId}
            onClick={() => setShowLogViewer((v) => !v)}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            {showLogViewer ? 'Hide Live Diagnostic Logs' : `Inspect Captured Logs (${entries.length})`}
            {showLogViewer ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                logDiagnosticEvent({
                  level: 'info',
                  category: 'lifecycle',
                  message: 'Manual diagnostic test log recorded from The Techy Stuff',
                  details: { route: 'techyStuff', animalCount: snapshot.animals.length },
                });
                void refreshDiagnostics();
              }}
              className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
            >
              Test Log
            </button>
            {!confirmClearLogs ? (
              <button
                type="button"
                disabled={entries.length === 0}
                onClick={() => setConfirmClearLogs(true)}
                className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-40 inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" aria-hidden="true" />
                Clear Logs
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    void clearAllDiagnosticLogs().then(() => {
                      setConfirmClearLogs(false);
                      return refreshDiagnostics();
                    })
                  }
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold"
                >
                  Confirm Clear ({entries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearLogs(false)}
                  className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-[11px]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {showLogViewer && (
          <div
            id={logViewerId}
            className="space-y-2.5 border border-[var(--barn-border)] rounded-xl p-3 bg-[var(--barn-canvas)]"
          >
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
                        aria-controls={`${basePanelId}-log-${entry.id}`}
                        onClick={() => setExpandedLogId(isExpanded ? null : entry.id)}
                        className="w-full min-h-[44px] sm:min-h-0 py-1 text-left flex items-start justify-between gap-2"
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
                        <div
                          id={`${basePanelId}-log-${entry.id}`}
                          className="pt-1.5 border-t border-[var(--barn-border)]/60 space-y-1 font-mono text-[10px] text-[var(--barn-muted)]"
                        >
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

      {/* Photo Storage & Orphan Attachment Pruner (IMP-023) */}
      {onAnalyzePhotoFootprint && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                <span>Photo Storage &amp; Orphan Attachment Pruner</span>
              </div>
              <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                Audits per-species photo byte usage, cleans orphan images left by deleted animals,
                re-compresses oversized photos under your active preset, or compacts full-res
                copies down to crisp thumbnails.
              </p>
            </div>
            <button
              type="button"
              disabled={busyAction}
              onClick={() =>
                void actionLock.runLocked(async () => {
                  setPhotoMaintenanceFeedback(null);
                  setConfirmPruneFullRes(false);
                  const rep = await onAnalyzePhotoFootprint();
                  setPhotoFootprint(rep);
                  if (rep) {
                    setPhotoMaintenanceFeedback(
                      `Scanned ${rep.totalPhotoCount} photo(s) (${formatByteSizePure(rep.totalStoredBytes)}): ${rep.orphanPhotoIds.length} orphan(s), ${rep.oversizedPhotoIds.length} oversized, ${rep.fullResPrunableIds.length} compactable.`
                    );
                  }
                })
              }
              className="min-h-[36px] max-w-full px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 disabled:opacity-55"
            >
              <ImageIcon className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Analyze Photo Storage</span>
            </button>
          </div>

          {photoFootprint && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                  <div className="text-[var(--barn-muted)]">Total Stored</div>
                  <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                    {photoFootprint.totalPhotoCount} photo
                    {photoFootprint.totalPhotoCount === 1 ? '' : 's'} ·{' '}
                    {formatByteSizePure(photoFootprint.totalStoredBytes)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                  <div className="text-[var(--barn-muted)]">Orphan Attachments</div>
                  <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                    {photoFootprint.orphanPhotoIds.length} ·{' '}
                    {formatByteSizePure(photoFootprint.orphanBytes)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                  <div className="text-[var(--barn-muted)]">
                    Oversized (&gt;{photoFootprint.activePresetMaxDimension}px)
                  </div>
                  <div className="font-mono font-semibold text-[var(--barn-ink)] mt-0.5">
                    {photoFootprint.oversizedPhotoIds.length} ·{' '}
                    {formatByteSizePure(photoFootprint.oversizedBytes)}
                  </div>
                </div>
              </div>

              {photoFootprint.speciesBreakdown.length > 0 && (
                <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-[var(--barn-border)] text-[11px] font-semibold text-[var(--barn-muted)]">
                    Per-Species Photo Breakdown
                  </div>
                  <div className="divide-y divide-[var(--barn-border)] max-h-40 overflow-y-auto text-[11px]">
                    {photoFootprint.speciesBreakdown.map((sp) => (
                      <div
                        key={sp.species}
                        className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="font-medium text-[var(--barn-ink)]">{sp.species}</span>
                        <span className="font-mono text-[var(--barn-muted)] tabular-nums">
                          {sp.photoCount} photo{sp.photoCount === 1 ? '' : 's'} ·{' '}
                          {formatByteSizePure(sp.storedBytes)}
                          {sp.orphanCount > 0 ? ` · ${sp.orphanCount} orphan` : ''}
                          {sp.oversizedCount > 0 ? ` · ${sp.oversizedCount} oversized` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {onPruneOrphanPhotos && (
                  <button
                    type="button"
                    disabled={busyAction || photoFootprint.orphanPhotoIds.length === 0}
                    onClick={() =>
                      void actionLock.runLocked(async () => {
                        const res = await onPruneOrphanPhotos();
                        const refreshed = await onAnalyzePhotoFootprint();
                        if (refreshed) setPhotoFootprint(refreshed);
                        if (onRefreshStorageStatus) void onRefreshStorageStatus();
                        setPhotoMaintenanceFeedback(
                          res.removedCount > 0
                            ? `Removed ${res.removedCount} orphan photo(s), reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
                            : 'No orphan photo attachments needed removal.'
                        );
                      })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                    Remove Orphan Photos ({photoFootprint.orphanPhotoIds.length})
                  </button>
                )}

                {onReoptimizeOversizedPhotos && (
                  <button
                    type="button"
                    disabled={busyAction || photoFootprint.oversizedPhotoIds.length === 0}
                    onClick={() =>
                      void actionLock.runLocked(async () => {
                        const preflight = await verifyStorageQuotaForDiagnosticAction({
                          operation: 'photo_reoptimize',
                          operationLabel: 'Photo Re-Optimization',
                          estimatedRequiredBytes: Math.min(
                            photoFootprint.oversizedBytes,
                            5 * 1024 * 1024
                          ),
                        });
                        if (!preflight.allowed) {
                          setPhotoMaintenanceFeedback(`${preflight.headline} — ${preflight.detail}`);
                          return;
                        }
                        const res = await onReoptimizeOversizedPhotos();
                        const refreshed = await onAnalyzePhotoFootprint();
                        if (refreshed) setPhotoFootprint(refreshed);
                        if (onRefreshStorageStatus) void onRefreshStorageStatus();
                        setPhotoMaintenanceFeedback(
                          res.updatedCount > 0
                            ? `Re-optimized ${res.updatedCount} of ${res.oversizedFound} oversized photo(s), reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
                            : `Checked ${res.oversizedFound} oversized photo(s) — existing files were already as compact as possible.`
                        );
                      })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    Re-Optimize Oversized ({photoFootprint.oversizedPhotoIds.length})
                  </button>
                )}

                {onPruneFullResPhotoPayloads && !confirmPruneFullRes && (
                  <button
                    type="button"
                    disabled={busyAction || photoFootprint.fullResPrunableIds.length === 0}
                    onClick={() => setConfirmPruneFullRes(true)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold text-[var(--barn-terracotta)] hover:bg-[var(--barn-subtle)] disabled:opacity-50"
                  >
                    Compact Full-Res to Thumbnails ({photoFootprint.fullResPrunableIds.length} · ~
                    {formatByteSizePure(photoFootprint.estimatedReclaimableFullResBytes)})
                  </button>
                )}
              </div>

              {confirmPruneFullRes && onPruneFullResPhotoPayloads && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-[11px]"
                >
                  <p className="font-medium text-[var(--barn-ink)]">
                    A safety snapshot will be saved automatically first. Full-resolution image
                    payloads will be replaced with their crisp thumbnails while keeping every animal
                    photo entry and caption intact (~
                    {formatByteSizePure(photoFootprint.estimatedReclaimableFullResBytes)}{' '}
                    reclaimable).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() =>
                        void actionLock.runLocked(async () => {
                          const res = await onPruneFullResPhotoPayloads();
                          setConfirmPruneFullRes(false);
                          const refreshed = await onAnalyzePhotoFootprint();
                          if (refreshed) setPhotoFootprint(refreshed);
                          setPhotoMaintenanceFeedback(
                            res.prunedCount > 0
                              ? `Compacted ${res.prunedCount} full-res photo(s) to thumbnails, reclaiming ${formatByteSizePure(res.reclaimedBytes)}.`
                              : 'No full-resolution photo payloads needed compacting.'
                          );
                        })
                      }
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white font-semibold disabled:opacity-60"
                    >
                      Confirm Compact to Thumbnails
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPruneFullRes(false)}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {photoMaintenanceFeedback && (
            <div
              role="status"
              aria-live="polite"
              className="p-2.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px]"
            >
              {photoMaintenanceFeedback}
            </div>
          )}
        </div>
      )}

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
            className="min-h-[36px] max-w-full px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <Wrench className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Scan Herd &amp; DB Health</span>
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
                  onClick={() =>
                    void actionLock.runLocked(async () => {
                      const res = await onRepairDatabaseHealth();
                      if (res) {
                        setHealthReport(res.reportAfter);
                        setHealthRepairsList(res.repairsApplied);
                      }
                    })
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
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
                          className="min-h-[30px] max-w-full px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
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
            onClick={() =>
              void actionLock.runLocked(async () => {
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
                }
              })
            }
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            Reset DB Connection (Keep Data)
          </button>

          <button
            type="button"
            disabled={busyAction}
            onClick={() =>
              void actionLock.runLocked(async () => {
                setRecoveryFeedback(null);
                try {
                  const quotaCheck = await verifyStorageQuotaForDiagnosticAction({
                    operation: 'cache_purge_rebuild',
                    operationLabel: 'Purge Stale Caches + Retain Backup',
                    estimatedRequiredBytes: totalPhotoBytes + snapshot.animals.length * 1024 + 256 * 1024,
                    requiresOpfsPreferred: true,
                  });
                  const shouldDownloadFirst = quotaCheck.allowed;
                  const res = await onPurgeCorruptedCaches({
                    downloadBackupFirst: shouldDownloadFirst,
                    rebuildLocalDb: false,
                  });
                  if (onRefreshStorageStatus) void onRefreshStorageStatus();
                  setRecoveryFeedback(
                    `Cleared ${res.cachesCleared} app cache(s) & ${res.serviceWorkersUnregistered} service worker(s), kept all herd records${
                      res.backupFilename
                        ? `, and retained backup ${res.backupFilename}.`
                        : shouldDownloadFirst
                          ? '.'
                          : ' (skipped pre-purge ZIP staging due to tight browser quota).'
                    }`
                  );
                  await refreshDiagnostics();
                } catch (err) {
                  setRecoveryFeedback(
                    err instanceof Error ? err.message : 'Cache purge failed.'
                  );
                }
              })
            }
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
                onClick={() => {
                  setRebuildConfirmPhrase('');
                  setConfirmRebuildDb(true);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)]"
              >
                Purge &amp; Rebuild Local DB (Auto-Backup First)
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs">
              <p className="text-[11px] font-medium text-[var(--barn-ink)]">
                This will check OPFS/IDB quota, export &amp; download a complete timestamped `.ZIP`
                backup file to your device first, then purge &amp; rebuild local IndexedDB cleanly.
                Type <span className="font-mono font-bold">{DESTRUCTIVE_CONFIRM_PHRASES.rebuild_local_db}</span>{' '}
                below to arm this action:
              </p>
              <input
                type="text"
                aria-label="Type confirmation phrase to rebuild local database"
                value={rebuildConfirmPhrase}
                onChange={(e) => setRebuildConfirmPhrase(e.target.value)}
                placeholder={DESTRUCTIVE_CONFIRM_PHRASES.rebuild_local_db}
                className="w-full sm:w-56 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    busyAction ||
                    !isDestructiveActionConfirmationValid('rebuild_local_db', rebuildConfirmPhrase)
                  }
                  onClick={() =>
                    void actionLock.runLocked(async () => {
                      setRecoveryFeedback(null);
                      const quotaCheck = await verifyStorageQuotaForDiagnosticAction({
                        operation: 'cache_purge_rebuild',
                        operationLabel: 'Purge & Rebuild Local DB',
                        estimatedRequiredBytes: totalPhotoBytes + snapshot.animals.length * 1024 + 256 * 1024,
                        requiresOpfsPreferred: true,
                      });
                      const res = await onPurgeCorruptedCaches({
                        downloadBackupFirst: quotaCheck.allowed,
                        rebuildLocalDb: true,
                      });
                      setConfirmRebuildDb(false);
                      setRebuildConfirmPhrase('');
                      if (onRefreshStorageStatus) void onRefreshStorageStatus();
                      setRecoveryFeedback(
                        `Retained ${
                          res.backupFilename || 'timestamped backup'
                        }, purged ${res.cachesCleared} cache(s), and rebuilt local IndexedDB cleanly. Use "Restore (.JSON / .ZIP)" in Import / Export Hub whenever ready.`
                      );
                      await refreshDiagnostics();
                    })
                  }
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold disabled:opacity-45"
                >
                  Download Backup &amp; Rebuild DB
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRebuildDb(false);
                    setRebuildConfirmPhrase('');
                  }}
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
            aria-live="polite"
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
            aria-controls={improvementsLogId}
            onClick={() => setShowImprovementsLog((v) => !v)}
            className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
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
            onClick={async () => {
              try {
                await downloadTextFile('IMPROVEMENTS.md', formatImprovementsMarkdown(), 'text/markdown');
                setImprovementsFeedback('Downloaded IMPROVEMENTS.md recovery manual.');
              } catch (err) {
                setImprovementsFeedback(
                  err instanceof Error ? err.message : 'Could not download IMPROVEMENTS.md.'
                );
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download IMPROVEMENTS.md
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await downloadTextFile(
                  'pedigree-improvements-log.json',
                  buildImprovementsRecoveryJson(),
                  'application/json'
                );
                setImprovementsFeedback('Downloaded pedigree-improvements-log.json.');
              } catch (err) {
                setImprovementsFeedback(
                  err instanceof Error
                    ? err.message
                    : 'Could not download pedigree-improvements-log.json.'
                );
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Download Recovery .JSON
          </button>

          <button
            type="button"
            onClick={async () => {
              const markdown = formatImprovementsMarkdown();
              const mode = await copyTextWithFallback(markdown);
              if (mode !== 'unsupported') {
                setManualCopyBox(null);
                setImprovementsFeedback('Copied Markdown recovery log to clipboard.');
              } else {
                setManualCopyBox({
                  target: 'improvements',
                  label: 'Selectable Markdown Recovery Log',
                  text: markdown,
                });
                setImprovementsFeedback(
                  'Clipboard unavailable in this browser — copy from the text box below or use Download Recovery .JSON.'
                );
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
            Copy Markdown Log
          </button>
        </div>

        {improvementsFeedback && (
          <div
            role="status"
            aria-live="polite"
            className="p-2 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px] space-y-2"
          >
            <div>{improvementsFeedback}</div>
            {manualCopyBox?.target === 'improvements' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--barn-ink)]">
                    {manualCopyBox.label} (tap to select all)
                  </span>
                  <button
                    type="button"
                    onClick={() => setManualCopyBox(null)}
                    className="underline text-[var(--barn-muted)]"
                  >
                    Hide box
                  </button>
                </div>
                <textarea
                  readOnly
                  aria-label={manualCopyBox.label}
                  value={manualCopyBox.text}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  rows={6}
                  className="w-full p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
              </div>
            )}
          </div>
        )}

        {showImprovementsLog && (
          <div id={improvementsLogId} className="space-y-2 max-h-72 overflow-y-auto pt-1">
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
