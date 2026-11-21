/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "The Techy Stuff" Developer & Troubleshooting Screen (`src/components/TechyStuffScreen.tsx`).
 *
 * Houses all advanced, non-routine, and technical operational controls relocated out of
 * standard Barn Settings:
 * - Permanent, non-closeable copy of the 5-Tier Device Capability & Memory Hierarchy guidelines
 * - Storage Protection, OPFS namespaces & IndexedDB Quota Pre-Flight telemetry
 * - Connectivity Governor, Manual Offline Toggle & Timed Network Probe
 * - App Update Policy ('auto' / 'notify' / 'pinned') & Release Gate Inspector
 * - Crash Logs, Memory Watchdog, Photo Pruner, DB Health Repair & Cache Purge (`DiagnosticsAndSupportPanel`)
 * - Strictly validated Diagnostic Trigger tools & multi-step safeguarded Destructive Reset Lab
 */

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  HardDrive,
  Lightbulb,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import React, { useId, useState } from 'react';
import { VaultBackupMetadata } from '../core/backupVault';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
import {
  DEVICE_CAPABILITY_TIER_LIST,
  evaluateBarnWorkloadForTier,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import {
  formatByteSizePure,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import { BarnDatabaseSnapshot } from '../core/models';
import type { PhotoStorageFootprintReport } from '../core/photoMaintenance';
import {
  formatTimestampedBackupSlug,
  generateBarnBackupJsonChunks,
} from '../core/syncAndExports';
import {
  DESTRUCTIVE_CONFIRM_PHRASES,
  DiagnosticEventCategoryOverride,
  DiagnosticEventLevelOverride,
  isDestructiveActionConfirmationValid,
  validateDiagnosticTriggerInput,
  validatePwaUpdatePolicyOverride,
} from '../core/techyStuffGuardrails';
import { CURRENT_APP_VERSION } from '../core/upgradeGate';
import { CURRENT_BACKUP_SCHEMA_VERSION } from '../core/backupVault';
import { logDiagnosticEvent } from '../storage/crashLogger';
import {
  detectCurrentBrowserCompatibility,
  DeviceCapabilityController,
} from '../storage/deviceCapabilityDetector';
import {
  PwaUpdatePolicy,
  usePwaUpdateStatus,
} from '../storage/pwaUpdateManager';
import {
  DiagnosticQuotaPreflightResult,
  StorageProtectionStatus,
  useConnectivityStatus,
  verifyStorageQuotaForDiagnosticAction,
} from '../storage/storageProtection';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextChunks } from '../utils/webFileActions';
import { DiagnosticsAndSupportPanel } from './DiagnosticsAndSupportPanel';
import type { ImportExportHubSection } from './ImportExportHubScreen';

export interface TechyStuffScreenProps {
  snapshot: BarnDatabaseSnapshot;
  engineName: string;
  storageStatus: StorageProtectionStatus | null;
  opfsSupported: boolean;
  opfsVaultBackups: VaultBackupMetadata[];
  deviceCapability: DeviceCapabilityController;
  onBackToSettings: () => void;
  onOpenImportExportHub?: (section?: ImportExportHubSection) => void;
  onOpenPromptsDirectory?: () => void;
  onOpenSuggestionsBacklog?: () => void;
  onRefreshStorageStatus: () => Promise<StorageProtectionStatus>;
  onRequestPersistentStorage: () => Promise<StorageProtectionStatus> | void;
  onPurgeOpfsTmp: () => Promise<{ filesRemoved: number; bytesFreed: number }>;
  onClearLocalSyncAndReminderState: () => Promise<void>;
  recordBackupExport: (
    format: 'zip' | 'sqlite' | 'json',
    fileName?: string
  ) => Promise<void> | void;
  onAnalyzePhotoFootprint?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<PhotoStorageFootprintReport | null>;
  onPruneOrphanPhotos?: () => Promise<{ removedCount: number; reclaimedBytes: number }>;
  onReoptimizeOversizedPhotos?: (
    presetId?: ImageOptimizationPresetId
  ) => Promise<{ updatedCount: number; oversizedFound: number; reclaimedBytes: number }>;
  onPruneFullResPhotoPayloads?: () => Promise<{ prunedCount: number; reclaimedBytes: number }>;
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
  onSaveManualOpfsVaultBackup?: (note?: string) => Promise<unknown> | void;
  onCreateVerifiedPreUpgradeBackup?: () => Promise<{
    verified: boolean;
    checksumSha256: string;
    fileName: string;
  } | null>;
  onSeedAllSpecies: () => Promise<void> | void;
  onClearAllRecords: () => Promise<void> | void;
  onRestoreFactoryDefaults: () => Promise<void> | void;
}

export function TechyStuffScreen({
  snapshot,
  engineName,
  storageStatus,
  opfsSupported,
  opfsVaultBackups,
  deviceCapability,
  onBackToSettings,
  onOpenImportExportHub,
  onOpenPromptsDirectory,
  onOpenSuggestionsBacklog,
  onRefreshStorageStatus,
  onRequestPersistentStorage,
  onPurgeOpfsTmp,
  onClearLocalSyncAndReminderState,
  recordBackupExport,
  onAnalyzePhotoFootprint,
  onPruneOrphanPhotos,
  onReoptimizeOversizedPhotos,
  onPruneFullResPhotoPayloads,
  onScanDatabaseHealth,
  onRepairDatabaseHealth,
  onResetDatabaseConnection,
  onPurgeCorruptedCaches,
  onLocateConflicts,
  onHydrateSnapshotForExport,
  onSaveManualOpfsVaultBackup,
  onCreateVerifiedPreUpgradeBackup,
  onSeedAllSpecies,
  onClearAllRecords,
  onRestoreFactoryDefaults,
}: TechyStuffScreenProps) {
  const baseId = useId();
  const connectivity = useConnectivityStatus();
  const pwaUpdate = usePwaUpdateStatus();

  const updateCheckLock = useAsyncSubmitLock();
  const preUpgradeBackupLock = useAsyncSubmitLock();
  const archiveExportLock = useAsyncSubmitLock();
  const destructiveLabLock = useAsyncSubmitLock();

  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);
  const [preUpgradeFeedback, setPreUpgradeFeedback] = useState<string | null>(null);
  const [quotaProbeReport, setQuotaProbeReport] = useState<DiagnosticQuotaPreflightResult | null>(
    null
  );

  // Safeguard toggle & multi-step phrase states for destructive developer actions
  const [destructiveArmed, setDestructiveArmed] = useState(false);
  const [tmpPurgePhrase, setTmpPurgePhrase] = useState('');
  const [syncResetPhrase, setSyncResetPhrase] = useState('');
  const [wipePhrase, setWipePhrase] = useState('');
  const [factoryResetPhrase, setFactoryResetPhrase] = useState('');
  const [labFeedback, setLabFeedback] = useState<string | null>(null);
  const [labError, setLabError] = useState<string | null>(null);

  // Validated diagnostic event trigger form state
  const [triggerLevel, setTriggerLevel] = useState<DiagnosticEventLevelOverride>('info');
  const [triggerCategory, setTriggerCategory] =
    useState<DiagnosticEventCategoryOverride>('lifecycle');
  const [triggerMessage, setTriggerMessage] = useState('');
  const [triggerNote, setTriggerNote] = useState('');
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerFeedback, setTriggerFeedback] = useState<string | null>(null);

  const { assessment, browserCompatibility } = deviceCapability;
  const activeBrowserCompat =
    browserCompatibility ?? detectCurrentBrowserCompatibility(assessment);
  const persistStorageSupported = activeBrowserCompat.signals.persistStorageSupported;

  const allPhotos = snapshot.animalPhotos ?? [];
  const totalBarnRecords =
    snapshot.animals.length +
    allPhotos.length +
    snapshot.breedings.length +
    snapshot.cages.length +
    snapshot.tasks.length +
    snapshot.careLogs.length +
    snapshot.shows.length;

  const workload = evaluateBarnWorkloadForTier(totalBarnRecords, assessment);
  const activeTierPolicy = getTierStoragePolicy(assessment.tier);

  const handleRunQuotaProbe = async () => {
    const photoBytes = allPhotos.reduce((acc, p) => acc + (p.storedBytes || 0), 0);
    const estRequired = Math.max(512 * 1024, photoBytes + snapshot.animals.length * 1024);
    const res = await verifyStorageQuotaForDiagnosticAction({
      operation: 'support_bundle_zip',
      operationLabel: 'Full Diagnostic + Data Archive Probe',
      estimatedRequiredBytes: estRequired,
      requiresOpfsPreferred: true,
    });
    setQuotaProbeReport(res);
    await onRefreshStorageStatus();
  };

  const handleUpdatePolicySelect = (rawPolicy: string) => {
    const check = validatePwaUpdatePolicyOverride(rawPolicy);
    if (!check.ok) {
      setUpdateCheckFeedback(check.error);
      return;
    }
    pwaUpdate.setPolicy(check.policy);
    logDiagnosticEvent({
      level: 'info',
      category: 'lifecycle',
      message: `PWA update policy changed to "${check.policy}" via The Techy Stuff`,
    });
    setUpdateCheckFeedback(`Update policy set to "${check.policy}".`);
  };

  const handleInjectDiagnosticTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    setTriggerError(null);
    setTriggerFeedback(null);
    const result = validateDiagnosticTriggerInput({
      level: triggerLevel,
      category: triggerCategory,
      message: triggerMessage,
      note: triggerNote,
    });
    if (!result.ok) {
      setTriggerError(result.error);
      return;
    }

    logDiagnosticEvent({
      level: result.value.level,
      category: result.value.category,
      message: result.value.message,
      details: {
        source: 'techyStuff_manual_trigger',
        tier: assessment.tier,
        opfsSupported,
        ...(result.value.note ? { note: result.value.note } : {}),
      },
    });
    setTriggerMessage('');
    setTriggerNote('');
    setTriggerFeedback(
      `Recorded validated [${result.value.level}/${result.value.category}] event into diagnostic log.`
    );
  };

  const handleDownloadPreResetJson = async () => {
    await archiveExportLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const filename = `community-pedigree-full-backup-${formatTimestampedBackupSlug()}.json`;
        await downloadTextChunks(
          filename,
          generateBarnBackupJsonChunks(exportSnapshot),
          'application/json'
        );
        void recordBackupExport('json', filename);
        setLabFeedback(
          `Saved pre-reset JSON backup ${filename} (${exportSnapshot.animals.length} animals).`
        );
      } catch (err) {
        setLabError(
          err instanceof Error ? err.message : 'Could not prepare pre-reset JSON backup.'
        );
      }
    });
  };

  const handlePurgeTmpAction = async () => {
    if (!destructiveArmed || !isDestructiveActionConfirmationValid('purge_opfs_tmp', tmpPurgePhrase)) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        const quota = await verifyStorageQuotaForDiagnosticAction({
          operation: 'opfs_tmp_purge',
          operationLabel: 'Purge OPFS /tmp Scratchpad',
          estimatedRequiredBytes: 0,
        });
        const { filesRemoved, bytesFreed } = await onPurgeOpfsTmp();
        setTmpPurgePhrase('');
        await onRefreshStorageStatus();
        setLabFeedback(
          `Purged ${filesRemoved} stale file(s) (${formatByteSizePure(bytesFreed)}) from OPFS /tmp (${quota.opfsSupported ? 'OPFS active' : 'OPFS unavailable'}).`
        );
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to purge OPFS /tmp scratchpad.');
      }
    });
  };

  const handleClearSyncOutboxAction = async () => {
    if (
      !destructiveArmed ||
      !isDestructiveActionConfirmationValid('clear_sync_outbox', syncResetPhrase)
    ) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        await onClearLocalSyncAndReminderState();
        setSyncResetPhrase('');
        logDiagnosticEvent({
          level: 'warn',
          category: 'storage',
          message: 'Developer manually cleared local sync outbox & backup reminder metadata',
        });
        setLabFeedback(
          'Cleared local delta sync outbox queue, conflict log, and reminder snooze metadata (herd records intact).'
        );
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to clear sync outbox state.');
      }
    });
  };

  const handleWipeAllRecordsAction = async () => {
    if (
      !destructiveArmed ||
      !isDestructiveActionConfirmationValid('wipe_all_animals', wipePhrase)
    ) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        await onClearAllRecords();
        setWipePhrase('');
        await onRefreshStorageStatus();
        setLabFeedback('All animal, breeding, cage, task, care log, and show records cleared.');
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to clear barn records.');
      }
    });
  };

  const handleFactoryRestoreAction = async () => {
    if (
      !destructiveArmed ||
      !isDestructiveActionConfirmationValid('factory_restore', factoryResetPhrase)
    ) {
      return;
    }
    await destructiveLabLock.runLocked(async () => {
      setLabError(null);
      setLabFeedback(null);
      try {
        await onRestoreFactoryDefaults();
        setFactoryResetPhrase('');
        await onRefreshStorageStatus();
        setLabFeedback('App restored to factory defaults and sample herds reloaded.');
      } catch (err) {
        setLabError(err instanceof Error ? err.message : 'Failed to restore factory defaults.');
      }
    });
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Top Breadcrumb / Action Bar */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1 basis-full lg:basis-72">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--barn-muted)]">
            <Terminal className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Developer &amp; Troubleshooting Console</span>
            <span>·</span>
            <span className="tabular-nums">
              v{CURRENT_APP_VERSION} · Schema v{CURRENT_BACKUP_SCHEMA_VERSION}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-[var(--barn-ink)]">
            The Techy Stuff
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            Isolated technical workspace for hardware/memory hierarchy rules, OPFS &amp; IndexedDB
            quota verification, release gate controls, crash diagnostics, and safeguarded resets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={onBackToSettings}
            className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Back to Settings</span>
          </button>
          {onOpenPromptsDirectory && (
            <button
              type="button"
              onClick={onOpenPromptsDirectory}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-[var(--barn-ink)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Prompt Directory (/prompts)</span>
            </button>
          )}
          {onOpenSuggestionsBacklog && (
            <button
              type="button"
              onClick={onOpenSuggestionsBacklog}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-[var(--barn-ink)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Suggestion Backlog</span>
            </button>
          )}
          {onOpenImportExportHub && (
            <button
              type="button"
              onClick={() => onOpenImportExportHub('backup')}
              className="min-h-[44px] sm:min-h-[38px] max-w-full px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Import / Export Hub</span>
            </button>
          )}
        </div>
      </header>

      {(onOpenPromptsDirectory || onOpenSuggestionsBacklog) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {onOpenPromptsDirectory && (
            <section
              aria-label="Repository Prompts Directory Link"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <h2 className="font-display text-base font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-2 min-w-0">
                  <BookOpen className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Repository Prompts Directory (/prompts/)</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Browse active and archived system/workflow prompts in root{' '}
                  <code className="font-mono text-[var(--barn-ink)]">/prompts/</code>, inspect
                  confirmation-lock flags, and force-refresh to detect newly added prompt scripts.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPromptsDirectory}
                className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-xs font-semibold text-[var(--barn-ink)] text-center sm:shrink-0"
              >
                Open Prompts Directory &rarr;
              </button>
            </section>
          )}

          {onOpenSuggestionsBacklog && (
            <section
              aria-label="Suggestion Backlog and Idea Capture Link"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <h2 className="font-display text-base font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-2 min-w-0">
                  <Lightbulb className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  <span>Suggestion Backlog &amp; Idea Capture</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  View the prioritized roadmap in{' '}
                  <code className="font-mono text-[var(--barn-ink)]">
                    /docs/plans/suggestions-backlog.md
                  </code>{' '}
                  and capture new sanitized ideas offline for future export.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSuggestionsBacklog}
                className="min-h-[44px] sm:min-h-[40px] w-full sm:w-auto max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:opacity-90 text-xs font-semibold text-[var(--barn-ink)] text-center sm:shrink-0"
              >
                Open Suggestion Backlog &rarr;
              </button>
            </section>
          )}
        </div>
      )}

      {/* PERMANENT & NON-CLOSEABLE: Copy of Tier / Memory Hierarchy Guidelines */}
      <section
        aria-label="Tier and Memory Hierarchy Guidelines (Permanent Reference)"
        data-permanent-tier-hierarchy="true"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <h2 className="font-display text-xl font-semibold text-[var(--barn-ink)]">
                Device Tier &amp; Memory Hierarchy Guidelines
              </h2>
            </div>
            <p className="text-xs text-[var(--barn-muted)]">
              Permanent, non-closeable copy of the 5-tier capability &amp; memory storage hierarchy
              rules governing local SQLite/IndexedDB retention, OPFS vault caps, and low-RAM
              guardrails.
            </p>
          </div>
          <span className="font-mono text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[var(--barn-ink)] max-w-full">
            Permanent Reference · Tier {assessment.tier} Active
          </span>
        </div>

        {/* Live Host Telemetry Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">Detected Hardware Tier</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
              {assessment.definition.badgeLabel} ({assessment.confidence})
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] truncate">
              {assessment.signalSummary}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">Database Engine</div>
            <div className="font-mono font-semibold text-[var(--barn-ink)] truncate">
              {engineName}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)]">
              {activeBrowserCompat.wasmFallbackActive
                ? 'WASM fallback active'
                : 'SQLite WASM ready'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">OPFS &amp; Persistent Lock</div>
            <div className="font-mono font-semibold text-[var(--barn-ink)]">
              {opfsSupported ? 'OPFS Active' : 'IDB Fallback'}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)]">
              {storageStatus?.persisted ? 'Storage Lock Granted' : 'Standard Browser Quota'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-0.5">
            <div className="text-[11px] text-[var(--barn-muted)]">Barn Scale vs Tier Budget</div>
            <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)]">
              {workload.totalRecords.toLocaleString()}
              {workload.maxRecommendedRecords
                ? ` / ${workload.maxRecommendedRecords.toLocaleString()}`
                : ' records'}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)]">
              Vault: {activeTierPolicy.monthlyCap}M · {activeTierPolicy.manualCap}Man ·{' '}
              {activeTierPolicy.rollingIdbCap} IDB
            </div>
          </div>
        </div>

        {/* Memory & Storage Hierarchy Architecture */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
            <div className="font-semibold text-[var(--barn-ink)]">
              Memory &amp; Persistence Layer Hierarchy
            </div>
            <ol className="space-y-1.5 text-[11px] text-[var(--barn-muted)] list-decimal pl-4 leading-relaxed">
              <li>
                <strong className="text-[var(--barn-ink)]">Reactive JS Heap (L1 Working RAM):</strong>{' '}
                Holds thumbnail-light records and bounded LRU caches (`BoundedPhotoDataCache`:{' '}
                6–24 full-res images; `pedigreeAncestorCacheRef`: 256 Gen 4+ ancestor nodes).
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">Primary DB (`SQLite WASM` / IDB):</strong>{' '}
                Canonical herd, pedigree, breeding, and photo storage with lazy on-demand Gen 4+
                and full-resolution image hydration.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">OPFS Vault (`/backups` &amp; `/archives`):</strong>{' '}
                Out-of-band monthly, pre-upgrade, recovery-dump, and archived-cohort snapshots
                capped per active device tier.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">OPFS Scratchpad (`/tmp`):</strong>{' '}
                Streaming chunk staging for `.ZIP` and `.JSON` exports; swept on boot and cleaned
                immediately after file handoff.
              </li>
            </ol>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
            <div className="font-semibold text-[var(--barn-ink)]">
              Tier Dismissal &amp; Adaptive Policy Rules
            </div>
            <ul className="space-y-1.5 text-[11px] text-[var(--barn-muted)] list-disc pl-4 leading-relaxed">
              <li>
                <strong className="text-[var(--barn-ink)]">Tier 1 (Critical Memory Limit):</strong>{' '}
                Locked visible in both Home onboarding and Settings (cannot be closed anywhere).
                Heavy `.ZIP` exports require confirmation; mirror photos dehydrate to thumbnails.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">Tier 2 (Survival Mode):</strong> Closable
                on Home screen; remains persistent (not closable) in Settings to prevent accidental
                silencing.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">Tiers 3–5 (Mid-Tier to Desktop):</strong>{' '}
                Closable in Home &amp; Settings and reopenable anytime in Settings. Tier 5 allows
                highest vault retention and uncompressed heavy canary checks.
              </li>
              <li>
                <strong className="text-[var(--barn-ink)]">The Techy Stuff Reference:</strong>{' '}
                This reference matrix is permanently pinned and cannot be dismissed or collapsed on
                any hardware tier.
              </li>
            </ul>
          </div>
        </div>

        {/* Complete 5-Tier Capability & Storage Policy Matrix (Always Expanded) */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-[var(--barn-ink)]">
              Complete 5-Tier Capability &amp; Vault Retention Matrix
            </h3>
            <span className="font-mono text-[11px] text-[var(--barn-muted)]">
              Vault Snapshots Currently Stored: {opfsVaultBackups.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {DEVICE_CAPABILITY_TIER_LIST.map((item) => {
              const policy = getTierStoragePolicy(item.tier);
              const isCurrent = item.tier === assessment.tier;
              return (
                <div
                  key={item.tier}
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                    isCurrent
                      ? 'bg-[var(--barn-sage-tint)]/45 border-[var(--barn-sage)] ring-1 ring-[var(--barn-sage)]'
                      : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--barn-ink)]">
                        Tier {item.tier}: {item.title}
                      </span>
                      {isCurrent && (
                        <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--barn-sage)] text-[var(--barn-on-sage)]">
                          Current Device
                        </span>
                      )}
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
                      {item.maxRecommendedRecords
                        ? `≤~${item.maxRecommendedRecords.toLocaleString()} records`
                        : 'Commercial scale'}
                    </span>
                  </div>

                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Target Hardware:</strong>{' '}
                    {item.targetHardware}
                  </p>
                  <p className="text-[11px] text-[var(--barn-muted)] leading-snug">
                    <strong className="text-[var(--barn-ink)]">Workload Policy:</strong>{' '}
                    {item.workloadProfile}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px] tabular-nums text-[var(--barn-muted)]">
                    <div>
                      Monthly/PreUp/PreRst:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {policy.monthlyCap}/{policy.preUpgradeCap}/{policy.preResetCap}
                      </span>
                    </div>
                    <div>
                      Manual/IDB Rolling:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {policy.manualCap}/{policy.rollingIdbCap}
                      </span>
                    </div>
                    <div>
                      Max Safe Import:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {formatByteSizePure(policy.maxSafeImportBytesHint)}
                      </span>
                    </div>
                    <div>
                      Flags:{' '}
                      <span className="text-[var(--barn-ink)] font-semibold">
                        {policy.compressVaultBackups ? 'ZIP' : 'JSON'}
                        {policy.dehydrateMirrorPhotos ? ' · ThumbMirror' : ' · FullMirror'}
                        {policy.skipHeavyCanaryZip ? ' · LightCanary' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Storage Protection, Connectivity & Release Gate */}
        <div className="lg:col-span-6 space-y-6 min-w-0">
          {/* Storage Protection, OPFS & Quota Awareness */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  OPFS &amp; IndexedDB Quota Guardrails
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Verify browser persistence lock and quota headroom before heavy exports or
                  diagnostic dumps
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  {storageStatus?.persisted ? (
                    <>
                      <CheckCircle2
                        className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                        aria-hidden="true"
                      />
                      <span>Persistent Storage Lock Granted</span>
                    </>
                  ) : (
                    <>
                      <HardDrive
                        className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
                        aria-hidden="true"
                      />
                      <span>Standard Browser Storage (Lock Not Yet Elevated)</span>
                    </>
                  )}
                </div>

                {!storageStatus?.persisted && (
                  <button
                    type="button"
                    disabled={!persistStorageSupported}
                    aria-describedby={!persistStorageSupported ? `${baseId}-persist-reason` : undefined}
                    onClick={() => void onRequestPersistentStorage()}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                      persistStorageSupported
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                        : 'border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                    }`}
                  >
                    Lock Persistent Storage
                  </button>
                )}
              </div>

              {!storageStatus?.persisted && !persistStorageSupported && (
                <p id={`${baseId}-persist-reason`} className="text-[11px] text-[var(--barn-muted)]">
                  Disabled: This browser doesn&apos;t support manual Persistent Storage locking.
                </p>
              )}

              {storageStatus && storageStatus.quotaBytes > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    <span>Used: {formatByteSizePure(storageStatus.usageBytes)}</span>
                    <span>
                      Quota: {formatByteSizePure(storageStatus.quotaBytes)} (
                      {storageStatus.percentUsed}%)
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Local browser storage used"
                    aria-valuenow={Math.round(storageStatus.percentUsed)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden"
                  >
                    <div
                      style={{ width: `${Math.max(1, storageStatus.percentUsed)}%` }}
                      className={`h-full rounded-full ${
                        storageStatus.percentUsed >= 90
                          ? 'bg-[var(--barn-danger)]'
                          : storageStatus.percentUsed >= 75
                            ? 'bg-[var(--barn-terracotta)]'
                            : 'bg-[var(--barn-sage)]'
                      }`}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleRunQuotaProbe()}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  Run OPFS + IDB Quota Pre-Flight Check
                </button>
              </div>

              {quotaProbeReport && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                    quotaProbeReport.level === 'blocked'
                      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-danger)] text-[var(--barn-ink)]'
                      : quotaProbeReport.level === 'warn'
                        ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                        : 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                  }`}
                >
                  <div className="font-semibold font-mono">{quotaProbeReport.headline}</div>
                  <div className="text-[var(--barn-muted)]">{quotaProbeReport.detail}</div>
                </div>
              )}
            </div>
          </section>

          {/* Connectivity Governor & Probe (Relocated from Settings) */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                {connectivity.isEffectivelyOnline ? (
                  <Wifi className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                ) : (
                  <WifiOff className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                )}
                <h2 className="font-display text-lg font-semibold">
                  Connectivity Governor:{' '}
                  {connectivity.manualOffline
                    ? 'Manual App Offline'
                    : connectivity.reason === 'captive_or_unreachable'
                      ? 'Captive Wi-Fi / Unreachable'
                      : connectivity.navigatorOnline
                        ? 'Online'
                        : 'Browser Offline'}
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={connectivity.manualOffline}
                  onClick={() => connectivity.setManualOffline(!connectivity.manualOffline)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                    connectivity.manualOffline
                      ? 'bg-[var(--barn-terracotta)] text-white border-[var(--barn-terracotta)]'
                      : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  {connectivity.manualOffline ? 'App Offline: ON' : 'Go Offline in App'}
                </button>
                <button
                  type="button"
                  disabled={connectivity.probeStatus === 'probing' || connectivity.manualOffline}
                  onClick={() => void connectivity.probeNow()}
                  className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                >
                  {connectivity.probeStatus === 'probing'
                    ? 'Probing...'
                    : 'Run Connectivity Probe'}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-[var(--barn-muted)]">
              Manual App Offline queues calendar uploads and outbound checks locally without enabling
              device Airplane Mode. The probe checks uncached{' '}
              <code className="font-mono">version.json</code> with a timeout to catch captive barn
              or fairground Wi-Fi portals.
            </p>
            {connectivity.probeDetail && (
              <p className="text-[11px] font-mono text-[var(--barn-ink)] bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-lg px-2.5 py-1.5">
                {connectivity.probeDetail}
                {connectivity.lastProbeAtIso
                  ? ` (${new Date(connectivity.lastProbeAtIso).toLocaleTimeString()})`
                  : ''}
              </p>
            )}
          </section>

          {/* App Update Policy & Release Gate (Relocated from Settings) */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                {pwaUpdate.state.policy === 'pinned' ? (
                  <Lock className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                ) : (
                  <Unlock className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                )}
                <h2 className="font-display text-lg font-semibold">
                  App Update Policy &amp; Release Gate
                </h2>
              </div>
              <span className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
                v{CURRENT_APP_VERSION} · Schema v{CURRENT_BACKUP_SCHEMA_VERSION}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label="PWA update policy"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              {(
                [
                  {
                    value: 'auto',
                    label: 'Auto Check & Prompt',
                    desc: 'Check on load/focus and show safe apply banner',
                  },
                  {
                    value: 'notify',
                    label: 'Notify Only',
                    desc: 'Passive banner when an update is already staged',
                  },
                  {
                    value: 'pinned',
                    label: 'Pinned (Hold Version)',
                    desc: 'Block update checks & swaps during busy kidding/show runs',
                  },
                ] as Array<{ value: PwaUpdatePolicy; label: string; desc: string }>
              ).map((opt) => {
                const selected = pwaUpdate.state.policy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleUpdatePolicySelect(opt.value)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      selected
                        ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    <div className="font-semibold text-[11px] text-[var(--barn-ink)]">
                      {opt.label}
                    </div>
                    <div className="text-[10px] mt-0.5 leading-snug">{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={updateCheckLock.isSubmitting || pwaUpdate.state.checking}
                onClick={() =>
                  void updateCheckLock.runLocked(async () => {
                    setUpdateCheckFeedback(null);
                    const result = await pwaUpdate.checkNow(true);
                    if (result === 'offline') {
                      setUpdateCheckFeedback(
                        'Skipped update check: device or app is currently in Offline mode.'
                      );
                    } else if (result === 'blocked') {
                      setUpdateCheckFeedback(
                        'Update blocked by remote status.json release gate.'
                      );
                    } else if (result === 'checked') {
                      setUpdateCheckFeedback(
                        'Checked uncached version.json / status.json release gate.'
                      );
                    } else {
                      setUpdateCheckFeedback(
                        'Release gate manifests unreachable right now; continuing on local cached shell.'
                      );
                    }
                  })
                }
                className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${pwaUpdate.state.checking ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Check Release Gate Now</span>
              </button>

              {onCreateVerifiedPreUpgradeBackup && (
                <button
                  type="button"
                  disabled={preUpgradeBackupLock.isSubmitting}
                  onClick={() =>
                    void preUpgradeBackupLock.runLocked(async () => {
                      setPreUpgradeFeedback(null);
                      const res = await onCreateVerifiedPreUpgradeBackup();
                      if (res?.verified) {
                        setPreUpgradeFeedback(
                          `Verified Pre-Upgrade Backup saved (${res.fileName}, SHA-256 ${res.checksumSha256.slice(
                            0,
                            12
                          )}...).`
                        );
                      } else {
                        setPreUpgradeFeedback(
                          'Pre-upgrade backup verification failed — inspect Diagnostics.'
                        );
                      }
                    })
                  }
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {preUpgradeBackupLock.isSubmitting
                      ? 'Verifying Backup...'
                      : 'Verify & Save Pre-Upgrade Backup'}
                  </span>
                </button>
              )}

              {pwaUpdate.state.updateAvailable && pwaUpdate.state.policy !== 'pinned' && (
                <button
                  type="button"
                  disabled={
                    pwaUpdate.state.applying ||
                    Boolean(
                      pwaUpdate.state.gateDecision &&
                        !pwaUpdate.state.gateDecision.canProceedWithDirectSwSwap
                    )
                  }
                  onClick={() => void pwaUpdate.applyUpdate()}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold disabled:opacity-50"
                >
                  {pwaUpdate.state.applying ? 'Applying Update...' : 'Apply Staged Update'}
                </button>
              )}
            </div>

            {updateCheckFeedback && (
              <p className="text-[11px] text-[var(--barn-ink)] bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-lg px-2.5 py-1.5">
                {updateCheckFeedback}
              </p>
            )}

            {preUpgradeFeedback && (
              <p className="text-[11px] text-[var(--barn-sage)] bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-lg px-2.5 py-1.5 font-medium">
                {preUpgradeFeedback}
              </p>
            )}

            {pwaUpdate.state.gateDecision &&
              (!pwaUpdate.state.gateDecision.canProceedWithDirectSwSwap ||
                pwaUpdate.state.updateAvailable) && (
                <div
                  role="status"
                  className={`rounded-lg border px-3 py-2 text-[11px] space-y-1 ${
                    pwaUpdate.state.gateDecision.canProceedWithDirectSwSwap
                      ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                      : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{pwaUpdate.state.gateDecision.headline}</span>
                  </div>
                  <p className="text-[var(--barn-muted)]">{pwaUpdate.state.gateDecision.detail}</p>
                </div>
              )}
          </section>

          {/* Validated Developer Diagnostic Event Trigger */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Validated Diagnostic Event Trigger
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Record sanitized manual markers into the diagnostic stream before reproducing a
                  field issue
                </p>
              </div>
              <Activity className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            <form onSubmit={handleInjectDiagnosticTrigger} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-trig-level`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Event Level
                  </label>
                  <select
                    id={`${baseId}-trig-level`}
                    value={triggerLevel}
                    onChange={(e) =>
                      setTriggerLevel(e.target.value as DiagnosticEventLevelOverride)
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                  >
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-trig-cat`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Event Category
                  </label>
                  <select
                    id={`${baseId}-trig-cat`}
                    value={triggerCategory}
                    onChange={(e) =>
                      setTriggerCategory(e.target.value as DiagnosticEventCategoryOverride)
                    }
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                  >
                    <option value="lifecycle">lifecycle</option>
                    <option value="storage">storage</option>
                    <option value="memory">memory</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-trig-msg`}
                  className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                >
                  Diagnostic Marker Summary (required, 3–200 chars)
                </label>
                <input
                  id={`${baseId}-trig-msg`}
                  type="text"
                  maxLength={200}
                  value={triggerMessage}
                  onChange={(e) => setTriggerMessage(e.target.value)}
                  placeholder="e.g. Before offline photo batch test on Tier 2 tablet"
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-trig-note`}
                  className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                >
                  Optional Context Notes (sanitized plain text)
                </label>
                <textarea
                  id={`${baseId}-trig-note`}
                  rows={2}
                  maxLength={600}
                  value={triggerNote}
                  onChange={(e) => setTriggerNote(e.target.value)}
                  placeholder="Optional reproduction context"
                  className="w-full p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              {triggerError && (
                <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium">
                  {triggerError}
                </p>
              )}
              {triggerFeedback && !triggerError && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-[11px] text-[var(--barn-sage)] font-medium"
                >
                  {triggerFeedback}
                </p>
              )}

              <button
                type="submit"
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
              >
                Record Sanitized Diagnostic Event
              </button>
            </form>
          </section>
        </div>

        {/* Right 6 Columns: Diagnostics Panel & Safeguarded Destructive Developer Lab */}
        <div className="lg:col-span-6 space-y-6 min-w-0">
          <DiagnosticsAndSupportPanel
            snapshot={snapshot}
            deviceCapability={deviceCapability}
            storageStatus={storageStatus}
            onRefreshStorageStatus={onRefreshStorageStatus}
            onScanDatabaseHealth={onScanDatabaseHealth}
            onRepairDatabaseHealth={onRepairDatabaseHealth}
            onResetDatabaseConnection={onResetDatabaseConnection}
            onPurgeCorruptedCaches={onPurgeCorruptedCaches}
            onLocateConflicts={onLocateConflicts}
            onHydrateSnapshotForExport={onHydrateSnapshotForExport}
            onAnalyzePhotoFootprint={onAnalyzePhotoFootprint}
            onPruneOrphanPhotos={onPruneOrphanPhotos}
            onReoptimizeOversizedPhotos={onReoptimizeOversizedPhotos}
            onPruneFullResPhotoPayloads={onPruneFullResPhotoPayloads}
          />

          {/* Environment Safeguards & Multi-Step Destructive Developer Lab */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                  <ShieldAlert
                    className="w-5 h-5 text-[var(--barn-danger)] shrink-0"
                    aria-hidden="true"
                  />
                  Destructive &amp; State Reset Safeguards
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  All cache wipes, sync outbox resets, global data wipes, and factory restores
                  require arming the safety lock AND typing an explicit confirmation phrase.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={destructiveArmed}
                onClick={() => {
                  const next = !destructiveArmed;
                  setDestructiveArmed(next);
                  if (!next) {
                    setTmpPurgePhrase('');
                    setSyncResetPhrase('');
                    setWipePhrase('');
                    setFactoryResetPhrase('');
                  }
                }}
                className={`min-h-[40px] max-w-full px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  destructiveArmed
                    ? 'bg-[var(--barn-danger)] text-[var(--barn-on-danger)] border-[var(--barn-danger)]'
                    : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                {destructiveArmed ? 'Safety Lock: ARMED' : 'Arm Destructive Controls'}
              </button>
            </div>

            {/* Pre-reset Backup Quick Actions */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[var(--barn-muted)]">
                Recommended before any reset: save an offline snapshot first.
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {onSaveManualOpfsVaultBackup && (
                  <button
                    type="button"
                    onClick={() =>
                      void onSaveManualOpfsVaultBackup('Pre-reset snapshot from The Techy Stuff')
                    }
                    className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    Save Vault Snapshot
                  </button>
                )}
                <button
                  type="button"
                  disabled={archiveExportLock.isSubmitting}
                  onClick={() => void handleDownloadPreResetJson()}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Download Timestamped JSON Backup
                </button>
              </div>
            </div>

            {labError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-xs font-medium"
              >
                {labError}
              </div>
            )}
            {labFeedback && !labError && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {labFeedback}
              </div>
            )}

            {/* Action 1: Purge OPFS /tmp Scratchpad */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Purge OPFS /tmp Export Scratchpad
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Clears orphaned temporary chunks in OPFS <code className="font-mono">/tmp</code>{' '}
                  without touching SQLite records or <code className="font-mono">/backups</code>.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase to purge OPFS tmp"
                    value={tmpPurgePhrase}
                    onChange={(e) => setTmpPurgePhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.purge_opfs_tmp}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      destructiveLabLock.isSubmitting ||
                      !opfsSupported ||
                      !isDestructiveActionConfirmationValid('purge_opfs_tmp', tmpPurgePhrase)
                    }
                    onClick={() => void handlePurgeTmpAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold disabled:opacity-45"
                  >
                    Purge /tmp
                  </button>
                </div>
              )}
            </div>

            {/* Action 2: Reset Sync Outbox & Backup Reminder State */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Force-Reset Local Sync Outbox &amp; Reminder Metadata
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Clears pending delta sync queue entries and reminder snooze timers while leaving
                  animals and backups untouched.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase to reset sync outbox"
                    value={syncResetPhrase}
                    onChange={(e) => setSyncResetPhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.clear_sync_outbox}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      destructiveLabLock.isSubmitting ||
                      !isDestructiveActionConfirmationValid('clear_sync_outbox', syncResetPhrase)
                    }
                    onClick={() => void handleClearSyncOutboxAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold disabled:opacity-45"
                  >
                    Reset Sync Outbox
                  </button>
                </div>
              )}
            </div>

            {/* Action 3: Wipe All Animal Data */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Delete All Animal Data ({snapshot.animals.length} animals · {totalBarnRecords}{' '}
                  total records)
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Wipes all animals, photos, breedings, cages, chores, care logs, and shows across
                  every species while keeping barn settings and species schedules.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase to wipe all animal records"
                    value={wipePhrase}
                    onChange={(e) => setWipePhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.wipe_all_animals}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      totalBarnRecords === 0 ||
                      destructiveLabLock.isSubmitting ||
                      !isDestructiveActionConfirmationValid('wipe_all_animals', wipePhrase)
                    }
                    onClick={() => void handleWipeAllRecordsAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Confirm Delete All Animal Data
                  </button>
                </div>
              )}
            </div>

            {/* Action 4: Factory Restore */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div>
                <div className="font-semibold text-[var(--barn-ink)]">
                  Restore App to Factory Settings &amp; Data
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Resets barn name, preferences, custom colors, and species list back to factory
                  defaults and reloads starter sample herds.
                </p>
              </div>
              {destructiveArmed && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <input
                    type="text"
                    aria-label="Confirmation phrase for factory restore"
                    value={factoryResetPhrase}
                    onChange={(e) => setFactoryResetPhrase(e.target.value)}
                    placeholder={`Type ${DESTRUCTIVE_CONFIRM_PHRASES.factory_restore}`}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs w-44"
                  />
                  <button
                    type="button"
                    disabled={
                      destructiveLabLock.isSubmitting ||
                      !isDestructiveActionConfirmationValid('factory_restore', factoryResetPhrase)
                    }
                    onClick={() => void handleFactoryRestoreAction()}
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Confirm Factory Restore
                  </button>
                </div>
              )}
            </div>

            {/* Non-destructive Sample Seed Reload */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
              <span className="text-[var(--barn-muted)]">
                Need sample herds restored without wiping custom theme colors?
              </span>
              <button
                type="button"
                disabled={destructiveLabLock.isSubmitting}
                onClick={() =>
                  void destructiveLabLock.runLocked(async () => {
                    await onSeedAllSpecies();
                    setLabFeedback('Reloaded predefined sample herds alongside current settings.');
                  })
                }
                className="min-h-[36px] max-w-full px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
              >
                Reload 9 Sample Herds Only
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
