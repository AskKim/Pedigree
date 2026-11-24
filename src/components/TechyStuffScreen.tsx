/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * "The Techy Stuff" Developer & Troubleshooting Console (`src/components/TechyStuffScreen.tsx`).
 *
 * Organized into four focused operational workspaces (plus an "All Panels" view)
 * beneath a compact host telemetry bar and the permanent 5-Tier Capability Reference:
 * - Storage & OPFS: Quota pre-flight, Persistent lock, OPFS /tmp /backups /archives inspector,
 *   idle export canary probe, Prior-Use Sentinel, & Snapshot Collection Footprint breakdown.
 * - Runtime & Sync: Connectivity governor, Clock skew causality inspector, App Update Policy &
 *   Release Gate manifest diff, 14-signal Browser Feature Matrix, idle Worker heap reclaim,
 *   live IDB/BroadcastChannel/OPFS handles, Freeze Queue, Sync Outbox & Native Bridge events.
 * - Logs & Support: Crash/memory telemetry, live log viewer, ZIP/TXT/JSON support bundles,
 *   improvements manifest, and strictly validated manual diagnostic triggers.
 * - Maintenance & Resets: Photo footprint & orphan pruner, DB health scan/repair, cache recovery,
 *   and armed multi-step phrase-gated destructive operations (`destructiveArmed`).
 */

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  Database,
  Download,
  FolderSearch,
  HardDrive,
  Lightbulb,
  Lock,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  VaultBackupMetadata,
} from '../core/backupVault';
import type { CloudSyncClientState } from '../storage/cloudAppFolderSync';
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
import type { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
import {
  computeSnapshotCollectionFootprint,
  createDefaultSubunitOpenMap,
  DESTRUCTIVE_CONFIRM_PHRASES,
  DEVELOPER_CONSOLE_SUBUNIT_IDS,
  DEVELOPER_CONSOLE_TABS,
  DeveloperConsoleSubunitId,
  DeveloperConsoleTabId,
  DiagnosticEventCategoryOverride,
  DiagnosticEventLevelOverride,
  isDestructiveActionConfirmationValid,
  validateDiagnosticTriggerInput,
  validatePwaUpdatePolicyOverride,
} from '../core/techyStuffGuardrails';
import { CURRENT_APP_VERSION } from '../core/upgradeGate';
import {
  BridgeDiagnosticEvent,
  pedigreeBridge,
} from '../native/pedigreeBridge';
import {
  getPausedBackgroundJobs,
  PausedBackgroundJob,
  resumePausedBackgroundJob,
  subscribePausedBackgroundJobs,
} from '../storage/backgroundFreezeCoordinator';
import { logDiagnosticEvent } from '../storage/crashLogger';
import {
  detectCurrentBrowserCompatibility,
  DeviceCapabilityController,
} from '../storage/deviceCapabilityDetector';
import {
  type BackupSyncStatus,
  getCurrentTabId,
  loadAllSyncConflictsFromIdb,
  loadAllSyncOperationsFromIdb,
} from '../storage/localSyncChannels';
import { terminateIdleArchiveWorker } from '../storage/offThreadWorkerClient';
import {
  clearOpfsPruneSyncWarning,
  flushOpfsBackupsToSyncFolder,
  getActiveOpfsHandleCount,
  getActiveTempFiles,
  inspectOpfsNamespaces,
  type OpfsNamespacesInspectionReport,
  type OpfsPruneSyncWarning,
  type PriorUseSentinel,
  readOpfsPruneSyncWarning,
  readPriorUseSentinel,
  runOpfsExportCanary,
  sweepOrphanedOpfsTmpOnBoot,
} from '../storage/opfsStorage';
import {
  PwaUpdatePolicy,
  usePwaUpdateStatus,
} from '../storage/pwaUpdateManager';
import {
  getTrackedActiveResourceCounts,
  probeBroadcastChannelSupport,
  probeLocalStorageSupport,
  getSafeSessionStorage,
  getSafeWebLocks,
} from '../storage/storageProbes';
import {
  CLOCK_DRIFT_WARNING_THRESHOLD_MS,
  DiagnosticQuotaPreflightResult,
  formatClockSkewHuman,
  getAdjustedNowIsoUtc,
  isStandalonePwa,
  type RollingBackupMeta,
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
  deviceId?: string;
  rollingBackups?: RollingBackupMeta[];
  syncOperations?: SyncOperation[];
  syncConflicts?: SyncConflictEntry[];
  backupSyncStatus?: BackupSyncStatus | null;
  cloudSyncState?: CloudSyncClientState | null;
  onSyncVaultToSyncFolderNow?: () => Promise<unknown> | void;
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
  deviceId,
  rollingBackups = [],
  syncOperations: syncOperationsProp,
  syncConflicts: syncConflictsProp,
  backupSyncStatus,
  cloudSyncState,
  onSyncVaultToSyncFolderNow,
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

  const [activeTab, setActiveTab] = useState<DeveloperConsoleTabId>('storage');
  const [lastSingleTab, setLastSingleTab] =
    useState<Exclude<DeveloperConsoleTabId, 'all'>>('storage');
  const [subunitOpen, setSubunitOpen] = useState<Record<DeveloperConsoleSubunitId, boolean>>(() =>
    createDefaultSubunitOpenMap(false)
  );

  const toggleSubunit = useCallback((id: DeveloperConsoleSubunitId) => {
    setSubunitOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const allSubunitsOpen = DEVELOPER_CONSOLE_SUBUNIT_IDS.every((id) => subunitOpen[id]);
  const isEverythingOpen = activeTab === 'all' && allSubunitsOpen;

  const handleToggleAllPanels = useCallback(() => {
    if (isEverythingOpen) {
      setSubunitOpen(createDefaultSubunitOpenMap(false));
      setActiveTab(lastSingleTab);
    } else {
      setSubunitOpen(createDefaultSubunitOpenMap(true));
      setActiveTab('all');
    }
  }, [isEverythingOpen, lastSingleTab]);

  const updateCheckLock = useAsyncSubmitLock();
  const preUpgradeBackupLock = useAsyncSubmitLock();
  const archiveExportLock = useAsyncSubmitLock();
  const destructiveLabLock = useAsyncSubmitLock();
  const opfsActionLock = useAsyncSubmitLock();

  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);
  const [preUpgradeFeedback, setPreUpgradeFeedback] = useState<string | null>(null);
  const [quotaProbeReport, setQuotaProbeReport] = useState<DiagnosticQuotaPreflightResult | null>(
    null
  );

  // OPFS Inspector, Prior-Use Sentinel & Prune Sync Warning
  const [opfsReport, setOpfsReport] = useState<OpfsNamespacesInspectionReport | null>(null);
  const [expandedOpfsNs, setExpandedOpfsNs] = useState<string | null>('backups');
  const [priorSentinel, setPriorSentinel] = useState<PriorUseSentinel | null>(() =>
    readPriorUseSentinel()
  );
  const [pruneWarning, setPruneWarning] = useState<OpfsPruneSyncWarning | null>(() =>
    readOpfsPruneSyncWarning()
  );
  const [opfsToolFeedback, setOpfsToolFeedback] = useState<string | null>(null);

  // Live runtime handles, freeze queue, sync telemetry & native events
  const [pausedJobs, setPausedJobs] = useState<PausedBackgroundJob[]>(() =>
    getPausedBackgroundJobs()
  );
  const [resourceTick, setResourceTick] = useState(0);
  const [workerActionFeedback, setWorkerActionFeedback] = useState<string | null>(null);
  const [liveSyncOps, setLiveSyncOps] = useState<SyncOperation[] | null>(
    syncOperationsProp ?? null
  );
  const [liveSyncConflicts, setLiveSyncConflicts] = useState<SyncConflictEntry[] | null>(
    syncConflictsProp ?? null
  );
  const [nativeEvents, setNativeEvents] = useState<BridgeDiagnosticEvent[]>(() =>
    pedigreeBridge.getDiagnosticEvents()
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
  const collectionFootprint = useMemo(
    () => computeSnapshotCollectionFootprint(snapshot),
    [snapshot]
  );

  const refreshOpfsInspector = useCallback(async () => {
    const report = await inspectOpfsNamespaces();
    setOpfsReport(report);
    setPriorSentinel(readPriorUseSentinel());
    setPruneWarning(readOpfsPruneSyncWarning());
    setResourceTick((n) => n + 1);
  }, []);

  const refreshSyncCounters = useCallback(async () => {
    const [ops, conflicts] = await Promise.all([
      loadAllSyncOperationsFromIdb(),
      loadAllSyncConflictsFromIdb(),
    ]);
    setLiveSyncOps(ops);
    setLiveSyncConflicts(conflicts);
    setNativeEvents(pedigreeBridge.getDiagnosticEvents());
    setResourceTick((n) => n + 1);
  }, []);

  useEffect(() => {
    void refreshOpfsInspector();
  }, [refreshOpfsInspector, opfsVaultBackups.length]);

  useEffect(() => {
    if (syncOperationsProp !== undefined) {
      setLiveSyncOps(syncOperationsProp);
    }
    if (syncConflictsProp !== undefined) {
      setLiveSyncConflicts(syncConflictsProp);
    }
  }, [syncOperationsProp, syncConflictsProp]);

  useEffect(() => {
    if (
      (activeTab === 'runtime' || activeTab === 'all' || subunitOpen.sync_outbox) &&
      (liveSyncOps === null || liveSyncConflicts === null)
    ) {
      void refreshSyncCounters();
    }
  }, [activeTab, liveSyncOps, liveSyncConflicts, refreshSyncCounters, subunitOpen.sync_outbox]);

  useEffect(() => {
    const unsubJobs = subscribePausedBackgroundJobs((jobs) => setPausedJobs(jobs));
    const unsubNative = pedigreeBridge.onDiagnostic(() => {
      setNativeEvents(pedigreeBridge.getDiagnosticEvents());
    });
    return () => {
      unsubJobs();
      unsubNative();
    };
  }, []);

  // Re-read live probe counters cleanly whenever resourceTick increments
  const liveResourceSnapshot = useMemo(() => {
    void resourceTick;
    return {
      counts: getTrackedActiveResourceCounts(),
      activeOpfsHandles: getActiveOpfsHandleCount(),
      activeTmpFiles: getActiveTempFiles(),
      tabId: getCurrentTabId(),
      lsProbe: probeLocalStorageSupport(),
      hasSessionStorage: getSafeSessionStorage() !== null,
      hasBroadcastChannel: probeBroadcastChannelSupport(),
      hasWebLocks: getSafeWebLocks() !== null,
      isStandalone: isStandalonePwa(),
    };
  }, [resourceTick]);

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
    await refreshOpfsInspector();
  };

  const handleRunExportCanary = async () => {
    await opfsActionLock.runLocked(async () => {
      setOpfsToolFeedback(null);
      const res = await runOpfsExportCanary(snapshot);
      await refreshOpfsInspector();
      if (res.skipped) {
        setOpfsToolFeedback(
          'Export canary skipped (OPFS unavailable or browser tab hidden).'
        );
      } else if (res.ok) {
        setOpfsToolFeedback(
          `OPFS /tmp round-trip canary passed cleanly${
            res.skippedHeavyZip ? ' (Tier 1 lightweight metadata mode)' : ''
          }.`
        );
      } else {
        setOpfsToolFeedback(`OPFS canary failed: ${res.reason || 'unknown verification mismatch'}.`);
      }
    });
  };

  const handleSweepOrphanTmp = async () => {
    await opfsActionLock.runLocked(async () => {
      setOpfsToolFeedback(null);
      const res = await sweepOrphanedOpfsTmpOnBoot();
      await onRefreshStorageStatus();
      await refreshOpfsInspector();
      setOpfsToolFeedback(
        res.filesRemoved > 0
          ? `Swept ${res.filesRemoved} stale /tmp file(s), reclaiming ${formatByteSizePure(res.bytesFreed)}.`
          : 'Zero stale orphan files found in OPFS /tmp.'
      );
    });
  };

  const handleFlushVaultToSyncFolder = async () => {
    await opfsActionLock.runLocked(async () => {
      setOpfsToolFeedback(null);
      if (onSyncVaultToSyncFolderNow) {
        await onSyncVaultToSyncFolderNow();
      } else {
        const res = await flushOpfsBackupsToSyncFolder();
        setOpfsToolFeedback(
          res.pushed > 0
            ? `Pushed ${res.pushed} OPFS vault snapshot(s) to connected sync folder.`
            : `No snapshots flushed (${res.skippedReason || 'check sync folder connection'}).`
        );
      }
      await refreshOpfsInspector();
    });
  };

  const handleTerminateIdleWorker = () => {
    const terminated = terminateIdleArchiveWorker();
    deviceCapability.refreshDetection();
    setResourceTick((n) => n + 1);
    setWorkerActionFeedback(
      terminated
        ? 'Terminated idle Archive/Import Web Worker — released ~15–30 MB worker heap.'
        : 'No idle Archive Web Worker was active (or an export/import job is currently running).'
    );
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
        await refreshOpfsInspector();
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
        await refreshSyncCounters();
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

  const showStorageTab = activeTab === 'storage' || activeTab === 'all';
  const showRuntimeTab = activeTab === 'runtime' || activeTab === 'all';
  const showLogsTab = activeTab === 'logs' || activeTab === 'all';
  const showMaintenanceTab = activeTab === 'maintenance' || activeTab === 'all';

  const pendingOutboxCount = liveSyncOps?.length ?? null;
  const unresolvedConflictCount = liveSyncConflicts?.length ?? null;
  const rollingTotalBytes = rollingBackups.reduce((acc, r) => acc + (r.byteSize || 0), 0);

  const browserMatrixEntries: Array<{
    id: string;
    label: string;
    supported: boolean;
    detail: string;
  }> = [
    {
      id: 'wasm',
      label: 'WebAssembly (SQLite)',
      supported: activeBrowserCompat.signals.wasmSupported,
      detail: activeBrowserCompat.signals.wasmSupported ? 'SQLite WASM engine' : 'JSON IDB fallback',
    },
    {
      id: 'opfs',
      label: 'OPFS Private FS',
      supported: activeBrowserCompat.signals.opfsSupported,
      detail: activeBrowserCompat.signals.opfsSupported ? '/tmp, /backups, /archives' : 'IDB vault fallback',
    },
    {
      id: 'worker',
      label: 'Module Web Workers',
      supported:
        activeBrowserCompat.signals.moduleWorkerSupported &&
        !activeBrowserCompat.signals.workerRuntimeDisabled,
      detail: activeBrowserCompat.signals.workerRuntimeDisabled
        ? 'Fallback active'
        : activeBrowserCompat.signals.moduleWorkerSupported
        ? 'Off-thread ZIP/OCR'
        : 'Main-thread yielded',
    },
    {
      id: 'dirPicker',
      label: 'Folder Sync Picker',
      supported: activeBrowserCompat.signals.directoryPickerSupported,
      detail: activeBrowserCompat.signals.directoryPickerSupported
        ? 'showDirectoryPicker()'
        : 'Use ZIP / Share sync',
    },
    {
      id: 'persist',
      label: 'Persistent Storage',
      supported: persistStorageSupported,
      detail: storageStatus?.persisted ? 'Granted lock' : persistStorageSupported ? 'Available' : 'OS managed',
    },
    {
      id: 'broadcast',
      label: 'BroadcastChannel',
      supported: liveResourceSnapshot.hasBroadcastChannel,
      detail: liveResourceSnapshot.hasBroadcastChannel ? 'Multi-tab live sync' : 'Storage-event fallback',
    },
    {
      id: 'locks',
      label: 'Web Locks API',
      supported: liveResourceSnapshot.hasWebLocks,
      detail: liveResourceSnapshot.hasWebLocks ? 'Cross-tab mutexes' : 'In-tab FIFO queue',
    },
    {
      id: 'ls',
      label: 'localStorage R/W',
      supported: liveResourceSnapshot.lsProbe.available && liveResourceSnapshot.lsProbe.writable,
      detail: liveResourceSnapshot.lsProbe.writable
        ? 'Writable'
        : liveResourceSnapshot.lsProbe.available
        ? 'Read-only'
        : 'Blocked / Private',
    },
    {
      id: 'ss',
      label: 'sessionStorage',
      supported: liveResourceSnapshot.hasSessionStorage,
      detail: liveResourceSnapshot.hasSessionStorage ? 'Available' : 'Blocked',
    },
    {
      id: 'clipboard',
      label: 'Async Clipboard',
      supported: activeBrowserCompat.signals.clipboardWriteSupported,
      detail: activeBrowserCompat.signals.clipboardWriteSupported ? 'clipboard.writeText' : 'Manual copy fallback',
    },
    {
      id: 'share',
      label: 'Web Share (Files)',
      supported: activeBrowserCompat.signals.webShareFilesSupported,
      detail: activeBrowserCompat.signals.webShareFilesSupported ? 'navigator.share(files)' : 'Direct file download',
    },
    {
      id: 'webp',
      label: 'WebP Canvas Encode',
      supported: activeBrowserCompat.signals.webpEncodeSupported,
      detail: activeBrowserCompat.signals.webpEncodeSupported ? 'WebP photos active' : 'JPEG fallback',
    },
    {
      id: 'bitmap',
      label: 'createImageBitmap',
      supported: activeBrowserCompat.signals.createImageBitmapSupported,
      detail: activeBrowserCompat.signals.createImageBitmapSupported ? 'Worker decode ready' : 'HTMLImage fallback',
    },
    {
      id: 'pwa',
      label: 'Standalone PWA Mode',
      supported: liveResourceSnapshot.isStandalone || pedigreeBridge.isNativeWrapper(),
      detail: pedigreeBridge.isNativeWrapper()
        ? `Native ${pedigreeBridge.getPlatform()}`
        : liveResourceSnapshot.isStandalone
        ? 'Installed PWA'
        : 'Browser tab',
    },
  ];

  return (
    <div className="space-y-5 min-w-0 max-w-full">
      {/* Top Console Header (no redundant link cards duplicated below) */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 min-w-0 flex-1 basis-full lg:basis-72">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--barn-muted)]">
            <Terminal className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Developer &amp; Troubleshooting Console</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              v{CURRENT_APP_VERSION} · Schema v{CURRENT_BACKUP_SCHEMA_VERSION} ·{' '}
              {engineName} · Tab {liveResourceSnapshot.tabId.slice(0, 12)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-bold text-[var(--barn-ink)]">
              The Techy Stuff
            </h1>
            <button
              type="button"
              aria-pressed={isEverythingOpen}
              onClick={handleToggleAllPanels}
              className={`min-h-[34px] px-3 py-1 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                isEverythingOpen
                  ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                  : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
              }`}
            >
              {isEverythingOpen ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Collapse All Sections</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Open All Sections</span>
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-[var(--barn-muted)] leading-relaxed max-w-3xl">
            Isolated operational diagnostics, OPFS namespace &amp; quota telemetry, connectivity/clock
            governors, browser capability matrix, sync outbox inspection, and phrase-gated resets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToSettings}
            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Back to Settings</span>
          </button>

          {onOpenPromptsDirectory && (
            <button
              type="button"
              onClick={onOpenPromptsDirectory}
              className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <BookOpen className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Prompts</span>
            </button>
          )}

          {onOpenSuggestionsBacklog && (
            <button
              type="button"
              onClick={onOpenSuggestionsBacklog}
              className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Lightbulb className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
              <span>Backlog</span>
            </button>
          )}

          {onOpenImportExportHub && (
            <button
              type="button"
              onClick={() => onOpenImportExportHub('backup')}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 whitespace-nowrap"
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Import / Export Hub</span>
            </button>
          )}
        </div>
      </header>

      {/* 4-Column Host Telemetry Strip (Collapsible) */}
      <section
        aria-label="Host telemetry summary"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <button
          type="button"
          aria-expanded={subunitOpen.telemetry}
          aria-controls={`${baseId}-telemetry-panel`}
          onClick={() => toggleSubunit('telemetry')}
          className="w-full text-left flex items-center justify-between gap-3 group"
        >
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold text-[var(--barn-ink)]">
              <Activity className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              Host Telemetry Summary
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
              Tier {assessment.tier} ·{' '}
              {storageStatus?.supported && storageStatus.quotaBytes > 0
                ? `${storageStatus.percentUsed}% quota`
                : opfsSupported
                ? 'OPFS active'
                : 'IDB active'}{' '}
              · {collectionFootprint.totalRecords.toLocaleString()} records ·{' '}
              {connectivity.manualOffline
                ? 'Manual Offline'
                : connectivity.isEffectivelyOnline
                ? 'Online'
                : 'Offline'}
            </span>
          </div>
          {subunitOpen.telemetry ? (
            <ChevronUp
              className="w-4 h-4 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="w-4 h-4 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0"
              aria-hidden="true"
            />
          )}
        </button>

        {subunitOpen.telemetry && (
          <div
            id={`${baseId}-telemetry-panel`}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1"
          >
            <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--barn-muted)]">
                <span>Detected Hardware Class</span>
                <Cpu className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              </div>
              <div className="font-display text-lg font-bold tabular-nums text-[var(--barn-ink)] mt-1">
                Tier {assessment.tier} · <span className="capitalize">{assessment.formFactor}</span>
              </div>
              <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate mt-0.5">
                {assessment.signalSummary} · {assessment.confidence}
              </div>
            </div>

            <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--barn-muted)]">
                <span>Storage &amp; Quota Headroom</span>
                <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              </div>
              <div className="font-mono text-lg font-bold tabular-nums text-[var(--barn-ink)] mt-1">
                {storageStatus?.supported && storageStatus.quotaBytes > 0
                  ? `${storageStatus.percentUsed}% used`
                  : opfsSupported
                  ? 'OPFS Active'
                  : 'IDB Active'}
              </div>
              <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate mt-0.5">
                {storageStatus?.supported && storageStatus.quotaBytes > 0
                  ? `${formatByteSizePure(storageStatus.usageBytes)} / ${formatByteSizePure(storageStatus.quotaBytes)}`
                  : opfsSupported
                  ? 'OPFS + SQLite active'
                  : 'IndexedDB / fallback'}
                {' · '}
                {storageStatus?.persisted ? 'Persistent' : 'Best-effort'}
              </div>
            </div>

            <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--barn-muted)]">
                <span>Barn Database Footprint</span>
                <Database className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              </div>
              <div className="font-mono text-lg font-bold tabular-nums text-[var(--barn-ink)] mt-1">
                {collectionFootprint.totalRecords.toLocaleString()} records
              </div>
              <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate mt-0.5">
                ~{formatByteSizePure(collectionFootprint.totalEstimatedBytes)} ·{' '}
                {assessment.definition.maxRecommendedRecords
                  ? `${workload.utilizationPercent ?? 0}% of Tier ${assessment.tier} cap`
                  : `${snapshot.animals.length} animals`}
              </div>
            </div>

            <div className="bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[var(--barn-muted)]">
                <span>Network, Update &amp; Sync</span>
                {connectivity.isEffectivelyOnline ? (
                  <Wifi className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                )}
              </div>
              <div className="font-display text-lg font-bold text-[var(--barn-ink)] mt-1">
                {connectivity.manualOffline
                  ? 'Manual Offline'
                  : connectivity.isEffectivelyOnline
                  ? 'Online'
                  : 'Offline'}
              </div>
              <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate mt-0.5">
                SW: {pwaUpdate.state.policy}
                {pendingOutboxCount !== null ? ` · Outbox: ${pendingOutboxCount}` : ''}
                {unresolvedConflictCount !== null && unresolvedConflictCount > 0
                  ? ` · Conflicts: ${unresolvedConflictCount}`
                  : ''}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Permanent, Non-Closeable (Collapsible) 5-Tier Capability & Memory Hierarchy Reference Matrix (IMP-033) */}
      <section
        data-permanent-tier-hierarchy="true"
        aria-labelledby={`${baseId}-tier-hierarchy-title`}
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <button
          type="button"
          aria-expanded={subunitOpen.tier_hierarchy}
          aria-controls={`${baseId}-tier-hierarchy-panel`}
          onClick={() => toggleSubunit('tier_hierarchy')}
          className="w-full text-left flex items-start justify-between gap-3 group"
        >
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--barn-sage)]">
              <Cpu className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>PERMANENT REFERENCE · NON-CLOSEABLE MATRIX</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h2
                id={`${baseId}-tier-hierarchy-title`}
                className="font-display text-lg font-bold text-[var(--barn-ink)]"
              >
                Device Tier &amp; Memory Hierarchy Guidelines (Tiers 1–5)
              </h2>
              <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                Tier {assessment.tier} ({assessment.definition.title}) ·{' '}
                {assessment.definition.recommendedImagePreset} ·{' '}
                {assessment.definition.recommendedDefaultGenerations}G
              </span>
            </div>
          </div>
          {subunitOpen.tier_hierarchy ? (
            <ChevronUp
              className="w-4 h-4 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0 mt-1"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="w-4 h-4 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] shrink-0 mt-1"
              aria-hidden="true"
            />
          )}
        </button>

        {subunitOpen.tier_hierarchy && (
          <div id={`${baseId}-tier-hierarchy-panel`} className="space-y-4 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--barn-muted)] leading-relaxed flex-1 min-w-[220px]">
                Host hardware is currently classified as{' '}
                <strong className="text-[var(--barn-ink)]">
                  Tier {assessment.tier} ({assessment.definition.title})
                </strong>
                {' · '}recommended photo preset{' '}
                <span className="font-mono text-[var(--barn-ink)]">
                  {assessment.definition.recommendedImagePreset}
                </span>
                {' · '}startup tree default{' '}
                <span className="font-mono text-[var(--barn-ink)]">
                  {assessment.definition.recommendedDefaultGenerations}G
                </span>
                {' · '}safe import ceiling{' '}
                <span className="font-mono text-[var(--barn-ink)]">
                  {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)}
                </span>
                .
              </p>

              <button
                type="button"
                onClick={() => deviceCapability.refreshDetection()}
                className="min-h-[38px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Re-probe Hardware
              </button>
            </div>

            {/* High-Density Comparison Table */}
            <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--barn-canvas)] border-b border-[var(--barn-border)] text-[11px] font-mono uppercase tracking-wide text-[var(--barn-muted)]">
                    <th className="py-2.5 px-3">Tier &amp; Class</th>
                    <th className="py-2.5 px-3">Hardware &amp; JS Heap Reality</th>
                    <th className="py-2.5 px-3">Workload Cap &amp; Defaults</th>
                    <th className="py-2.5 px-3">Vault / IDB Policy</th>
                    <th className="py-2.5 px-3">Warning Banner Rules</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--barn-border)]">
                  {DEVICE_CAPABILITY_TIER_LIST.map((def) => {
                    const isCurrent = def.tier === assessment.tier;
                    const tierPolicy = getTierStoragePolicy(def.tier);
                    return (
                      <tr
                        key={def.tier}
                        className={
                          isCurrent
                            ? 'bg-[var(--barn-sage-tint)]/45 font-medium text-[var(--barn-ink)]'
                            : 'bg-[var(--barn-surface)] text-[var(--barn-ink)]'
                        }
                      >
                        <td className="py-2.5 px-3 align-top whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span className="font-mono">Tier {def.tier}</span>
                            {isCurrent && (
                              <span className="text-[10px] font-mono uppercase text-[var(--barn-sage)] font-bold">
                                · Current
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--barn-muted)] whitespace-normal mt-0.5 max-w-[170px]">
                            {def.title}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-[11px] space-y-0.5 min-w-[210px]">
                          <div>{def.targetHardware}</div>
                          <div className="text-[var(--barn-muted)]">{def.browserReality}</div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-[11px] font-mono tabular-nums whitespace-nowrap">
                          <div>
                            Cap:{' '}
                            {def.maxRecommendedRecords
                              ? `≤ ${def.maxRecommendedRecords.toLocaleString()}`
                              : '25,000+'}
                          </div>
                          <div className="text-[var(--barn-muted)]">
                            {def.recommendedImagePreset} · {def.recommendedDefaultGenerations}G
                          </div>
                          <div className="text-[var(--barn-muted)]">
                            Import ≤ {formatByteSizePure(tierPolicy.maxSafeImportBytesHint)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-[11px] font-mono tabular-nums whitespace-nowrap">
                          <div>
                            OPFS: {tierPolicy.monthlyCap}m / {tierPolicy.preUpgradeCap}u /{' '}
                            {tierPolicy.manualCap}man
                          </div>
                          <div className="text-[var(--barn-muted)]">
                            Rolling IDB: {tierPolicy.rollingIdbCap} ·{' '}
                            {tierPolicy.dehydrateMirrorPhotos ? 'Dehydrate' : 'Full-res mirror'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 align-top text-[11px] text-[var(--barn-muted)] min-w-[160px]">
                          Home: {def.homeClosable ? 'Closable' : 'Locked visible'}
                          {' · '}
                          Settings: {def.settingsClosable ? 'Closable' : 'Permanent'}
                          {def.canReopenInSettings ? ' · Reopenable' : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Compact 3-Layer Hybrid Storage & Browser Reality Footer */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-[var(--barn-muted)] pt-2 border-t border-[var(--barn-border)]">
              <div>
                <span className="font-semibold text-[var(--barn-ink)]">3-Layer Hybrid Storage: </span>
                Primary SQLite WASM / IndexedDB snapshot · OPFS{' '}
                <span className="font-mono">/backups</span> &amp;{' '}
                <span className="font-mono">/archives</span> + streamed{' '}
                <span className="font-mono">/tmp</span> staging · Cross-device Backup Sync folder
                offload.
              </div>
              <div>
                <span className="font-semibold text-[var(--barn-ink)]">Active Memory Guardrails: </span>
                Tiers 1–3 dehydrate full-res photos from 15s IDB fallback mirrors &amp; rolling
                backups (3–4× heap reduction) while preserving primary SQLite full-res &amp;
                thumbnails.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Segmented Developer Workspace Switcher (4 Domain Tabs; Open All moved into Header) */}
      <nav
        aria-label="Developer tool sections"
        className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-2"
      >
        <div role="tablist" className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {DEVELOPER_CONSOLE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const showOutboxDot =
              tab.id === 'runtime' &&
              unresolvedConflictCount !== null &&
              unresolvedConflictCount > 0;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => {
                  if (tab.id !== 'all') {
                    setLastSingleTab(tab.id);
                  }
                  setActiveTab(tab.id);
                }}
                className={`min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl text-left transition-colors ${
                  isActive
                    ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                    : 'bg-transparent text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-semibold">
                  <span className="truncate">{tab.label}</span>
                  {showOutboxDot && (
                    <span className="font-mono text-[10px] shrink-0">
                      ({unresolvedConflictCount})
                    </span>
                  )}
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    isActive ? 'text-[var(--barn-on-sage)]/85' : 'text-[var(--barn-muted)]'
                  }`}
                >
                  {tab.shortDescription}
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* WORKSPACE 1: STORAGE & OPFS */}
      {showStorageTab && (
        <div role="tabpanel" aria-label="Storage & OPFS" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Storage Protection & OPFS / IDB Quota Pre-Flight */}
            <section
              aria-labelledby={`${baseId}-storage-protection-heading`}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <button
                type="button"
                aria-expanded={subunitOpen.storage_protection}
                aria-controls={`${baseId}-storage-protection-panel`}
                onClick={() => toggleSubunit('storage_protection')}
                className="w-full text-left flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`${baseId}-storage-protection-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      Storage Protection &amp; Quota Pre-Flight
                    </h2>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                      {storageStatus?.persisted ? 'Persistent' : 'Best-effort'} ·{' '}
                      {opfsSupported ? `${opfsVaultBackups.length} vault(s)` : 'IDB fallback'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Real OPFS namespace availability, persistent storage locks, and pre-flight
                    headroom validation before heavy exports.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                  <HardDrive className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {subunitOpen.storage_protection ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>

              {subunitOpen.storage_protection && (
                <div id={`${baseId}-storage-protection-panel`} className="space-y-4 pt-1">

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[11px] text-[var(--barn-muted)]">Persistence Lock</div>
                  <div className="font-semibold text-[var(--barn-ink)] mt-0.5 flex items-center gap-1.5">
                    {storageStatus?.persisted ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                        <span>Granted</span>
                      </>
                    ) : (
                      <span>
                        {persistStorageSupported ? 'Not Locked (Best-Effort)' : 'Unsupported'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[11px] text-[var(--barn-muted)]">OPFS Vault Copies</div>
                  <div className="font-mono font-semibold tabular-nums text-[var(--barn-ink)] mt-0.5">
                    {opfsSupported
                      ? `${opfsVaultBackups.length} local snapshot(s)`
                      : 'IDB vault fallback'}
                  </div>
                </div>
              </div>

              {storageStatus?.supported && storageStatus.quotaBytes > 0 && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    <span>
                      Used: {formatByteSizePure(storageStatus.usageBytes)} /{' '}
                      {formatByteSizePure(storageStatus.quotaBytes)}
                    </span>
                    <span>{storageStatus.percentUsed}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        storageStatus.percentUsed >= 90
                          ? 'bg-[var(--barn-danger)]'
                          : storageStatus.percentUsed >= 75
                          ? 'bg-[var(--barn-terracotta)]'
                          : 'bg-[var(--barn-sage)]'
                      }`}
                      style={{ width: `${Math.max(2, storageStatus.percentUsed)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onRefreshStorageStatus()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Refresh Quota Status
                </button>

                <button
                  type="button"
                  disabled={!persistStorageSupported}
                  onClick={() => void onRequestPersistentStorage()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                >
                  Request Persistent Lock
                </button>

                <button
                  type="button"
                  onClick={() => void handleRunQuotaProbe()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
                >
                  Run Quota Pre-Flight Probe
                </button>
              </div>

              {quotaProbeReport && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    quotaProbeReport.level === 'blocked'
                      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-danger)]'
                      : quotaProbeReport.level === 'warn'
                      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                      : 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                  }`}
                >
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {quotaProbeReport.headline}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {quotaProbeReport.detail}
                  </div>
                </div>
              )}

              {/* Pre-Upgrade Vault Snapshot Checksum & Manual Backup */}
              {(onCreateVerifiedPreUpgradeBackup || onSaveManualOpfsVaultBackup) && (
                <div className="pt-3 border-t border-[var(--barn-border)] space-y-2.5">
                  <div className="text-xs font-semibold text-[var(--barn-ink)]">
                    Vault Snapshot &amp; Checksum Tools
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onCreateVerifiedPreUpgradeBackup && (
                      <button
                        type="button"
                        disabled={preUpgradeBackupLock.isSubmitting}
                        onClick={() =>
                          void preUpgradeBackupLock.runLocked(async () => {
                            setPreUpgradeFeedback(null);
                            try {
                              const verified = await onCreateVerifiedPreUpgradeBackup();
                              if (verified?.verified) {
                                pwaUpdate.markBackupVerified(true);
                                setPreUpgradeFeedback(
                                  `Verified OPFS snapshot ${verified.fileName} (SHA-256 ${verified.checksumSha256.slice(0, 12)}...).`
                                );
                              } else {
                                setPreUpgradeFeedback(
                                  'Pre-upgrade snapshot could not be SHA-256 verified in this browser.'
                                );
                              }
                            } catch (err) {
                              setPreUpgradeFeedback(
                                err instanceof Error
                                  ? err.message
                                  : 'Pre-upgrade snapshot verification failed.'
                              );
                            }
                          })
                        }
                        className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                      >
                        {preUpgradeBackupLock.isSubmitting
                          ? 'Verifying...'
                          : 'Create & Verify Pre-Upgrade Backup'}
                      </button>
                    )}

                    {onSaveManualOpfsVaultBackup && (
                      <button
                        type="button"
                        disabled={preUpgradeBackupLock.isSubmitting}
                        onClick={() =>
                          void preUpgradeBackupLock.runLocked(async () => {
                            setPreUpgradeFeedback(null);
                            await onSaveManualOpfsVaultBackup('Manual Techy Stuff Vault snapshot');
                            await refreshOpfsInspector();
                            setPreUpgradeFeedback('Saved manual OPFS Vault snapshot.');
                          })
                        }
                        className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                      >
                        Save Manual OPFS Snapshot
                      </button>
                    )}
                  </div>
                  {preUpgradeFeedback && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
                    >
                      {preUpgradeFeedback}
                    </div>
                  )}
                </div>
              )}
                </div>
              )}
            </section>

            {/* OPFS Namespace Inspector & Export Canary Probe */}
            <section
              aria-labelledby={`${baseId}-opfs-inspector-heading`}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <button
                type="button"
                aria-expanded={subunitOpen.opfs_inspector}
                aria-controls={`${baseId}-opfs-inspector-panel`}
                onClick={() => toggleSubunit('opfs_inspector')}
                className="w-full text-left flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`${baseId}-opfs-inspector-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      OPFS Namespace &amp; Canary Inspector
                    </h2>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                      {opfsSupported
                        ? `${opfsReport?.namespaces.reduce((acc, n) => acc + n.fileCount, 0) ?? 0} file(s)`
                        : 'OPFS unsupported'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Live read-only inventory of <span className="font-mono">/tmp</span>,{' '}
                    <span className="font-mono">/backups</span>, and{' '}
                    <span className="font-mono">/archives</span> directories, plus export canary
                    &amp; eviction sentinels.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                  <FolderSearch className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {subunitOpen.opfs_inspector ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>

              {subunitOpen.opfs_inspector && (
                <div id={`${baseId}-opfs-inspector-panel`} className="space-y-4 pt-1">

              <div className="grid grid-cols-3 gap-2 text-xs">
                {(opfsReport?.namespaces ?? []).map((ns) => {
                  const isOpen = expandedOpfsNs === ns.namespace;
                  return (
                    <button
                      key={ns.namespace}
                      type="button"
                      onClick={() => setExpandedOpfsNs(isOpen ? null : ns.namespace)}
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        isOpen
                          ? 'bg-[var(--barn-sage-tint)]/55 border-[var(--barn-sage)]'
                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      <div className="font-mono font-semibold text-[var(--barn-ink)]">
                        /{ns.namespace}
                      </div>
                      <div className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)] mt-0.5">
                        {ns.fileCount} file{ns.fileCount === 1 ? '' : 's'} ·{' '}
                        {formatByteSizePure(ns.totalBytes)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {expandedOpfsNs && opfsReport && (
                <div className="border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
                  {(() => {
                    const target = opfsReport.namespaces.find(
                      (n) => n.namespace === expandedOpfsNs
                    );
                    if (!target || target.entries.length === 0) {
                      return (
                        <div className="p-3 text-xs text-[var(--barn-muted)]">
                          OPFS <span className="font-mono">/{expandedOpfsNs}</span> is currently empty.
                        </div>
                      );
                    }
                    return (
                      <div className="divide-y divide-[var(--barn-border)] max-h-44 overflow-y-auto">
                        {target.entries.map((entry) => (
                          <div
                            key={entry.name}
                            className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono"
                          >
                            <span className="truncate text-[var(--barn-ink)]">{entry.name}</span>
                            <span className="text-[var(--barn-muted)] shrink-0 tabular-nums">
                              {entry.kind === 'directory' ? 'DIR' : formatByteSizePure(entry.byteSize)}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Prior-Use Eviction Sentinel & Prune Sync Warning */}
              <div className="space-y-2 text-xs pt-2 border-t border-[var(--barn-border)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    Prior-Use Eviction Sentinel:
                  </span>
                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                    {priorSentinel
                      ? `${priorSentinel.barnName} · ${priorSentinel.animalCount} animals (${priorSentinel.nonTestingCount} user)`
                      : 'Not initialized yet'}
                  </span>
                </div>

                {pruneWarning && (
                  <div className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] space-y-1.5">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      OPFS Prune Offload Notice ({pruneWarning.reason})
                    </div>
                    <p className="text-[var(--barn-muted)]">{pruneWarning.message}</p>
                    <button
                      type="button"
                      onClick={() => {
                        clearOpfsPruneSyncWarning();
                        setPruneWarning(null);
                      }}
                      className="text-[11px] font-semibold underline text-[var(--barn-ink)]"
                    >
                      Dismiss Warning
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={opfsActionLock.isSubmitting}
                  onClick={() => void refreshOpfsInspector()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Rescan OPFS
                </button>

                <button
                  type="button"
                  disabled={!opfsSupported || opfsActionLock.isSubmitting}
                  onClick={() => void handleRunExportCanary()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                  Run Export Canary Probe
                </button>

                <button
                  type="button"
                  disabled={!opfsSupported || opfsActionLock.isSubmitting}
                  onClick={() => void handleSweepOrphanTmp()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                >
                  Sweep Orphan /tmp
                </button>

                <button
                  type="button"
                  disabled={!opfsSupported || opfsActionLock.isSubmitting}
                  onClick={() => void handleFlushVaultToSyncFolder()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                >
                  Flush Vault to Sync Folder
                </button>
              </div>

              {opfsToolFeedback && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
                >
                  {opfsToolFeedback}
                </div>
              )}
                </div>
              )}
            </section>
          </div>

          {/* Snapshot Collection Footprint & Rolling IDB Backups */}
          <section
            aria-labelledby={`${baseId}-collection-footprint-heading`}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <button
              type="button"
              aria-expanded={subunitOpen.collection_footprint}
              aria-controls={`${baseId}-collection-footprint-panel`}
              onClick={() => toggleSubunit('collection_footprint')}
              className="w-full text-left flex items-start justify-between gap-3 group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id={`${baseId}-collection-footprint-heading`}
                    className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                  >
                    Database Collection Footprint &amp; Rolling Mirrors
                  </h2>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
                    ~{formatByteSizePure(collectionFootprint.totalEstimatedBytes)} ·{' '}
                    {rollingBackups.length} rolling mirror(s) (
                    {formatByteSizePure(rollingTotalBytes)})
                  </span>
                </div>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Per-table record distribution across all {collectionFootprint.collections.length}{' '}
                  snapshot stores, photo full-res vs thumbnail breakdown, and IndexedDB rolling
                  mirror snapshots.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                <Database className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                {subunitOpen.collection_footprint ? (
                  <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
              </span>
            </button>

            {subunitOpen.collection_footprint && (
              <div id={`${baseId}-collection-footprint-panel`} className="space-y-4 pt-1">

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <div className="text-[11px] text-[var(--barn-muted)]">Full-Res Photos</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {collectionFootprint.photoSummary.photosWithFullResCount} /{' '}
                  {collectionFootprint.photoSummary.totalPhotos} photos ·{' '}
                  {formatByteSizePure(collectionFootprint.photoSummary.fullResStoredBytes)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <div className="text-[11px] text-[var(--barn-muted)]">Cached Thumbnails</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {formatByteSizePure(collectionFootprint.photoSummary.thumbnailEstimatedBytes)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <div className="text-[11px] text-[var(--barn-muted)]">Species Workspaces</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {collectionFootprint.speciesCount} configured species
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-[var(--barn-border)] rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--barn-canvas)] border-b border-[var(--barn-border)] text-[11px] font-mono uppercase tracking-wide text-[var(--barn-muted)]">
                    <th className="py-2 px-3">Collection Store</th>
                    <th className="py-2 px-3 text-right">Records</th>
                    <th className="py-2 px-3 text-right">Est. Size</th>
                    <th className="py-2 px-3 w-40">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--barn-border)]">
                  {collectionFootprint.collections
                    .filter((row) => row.recordCount > 0 || row.key === 'animals' || row.key === 'animalPhotos')
                    .map((row) => (
                      <tr key={row.key} className="bg-[var(--barn-surface)]">
                        <td className="py-2 px-3 font-medium text-[var(--barn-ink)]">
                          {row.label}
                          <span className="ml-1.5 font-mono text-[10px] text-[var(--barn-muted)]">
                            {row.key}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {row.recordCount.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[var(--barn-muted)]">
                          {formatByteSizePure(row.estimatedBytes)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--barn-subtle)] overflow-hidden">
                              <div
                                className="h-full bg-[var(--barn-sage)]"
                                style={{ width: `${Math.min(100, Math.max(2, row.sharePercent))}%` }}
                              />
                            </div>
                            <span className="w-11 text-right text-[var(--barn-muted)]">
                              {row.sharePercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* WORKSPACE 2: RUNTIME & SYNC */}
      {showRuntimeTab && (
        <div role="tabpanel" aria-label="Runtime & Sync" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* Connectivity Governor & Clock Skew Causality Inspector */}
            <section
              aria-labelledby={`${baseId}-connectivity-heading`}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <button
                type="button"
                aria-expanded={subunitOpen.connectivity_clock}
                aria-controls={`${baseId}-connectivity-panel`}
                onClick={() => toggleSubunit('connectivity_clock')}
                className="w-full text-left flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`${baseId}-connectivity-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      Connectivity Governor &amp; Clock Causality
                    </h2>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                      {connectivity.manualOffline
                        ? 'Manual Offline'
                        : connectivity.isEffectivelyOnline
                        ? 'Online'
                        : 'Offline'}{' '}
                      ·{' '}
                      {connectivity.clockSkewMs !== null
                        ? formatClockSkewHuman(connectivity.clockSkewMs)
                        : '0 ms skew'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Force manual offline mode, test live server reachability, and inspect server{' '}
                    <span className="font-mono">Date</span> header skew adjustments for CRDT/outbox
                    ordering.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                  {connectivity.isEffectivelyOnline ? (
                    <Wifi className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  ) : (
                    <WifiOff
                      className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
                      aria-hidden="true"
                    />
                  )}
                  {subunitOpen.connectivity_clock ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>

              {subunitOpen.connectivity_clock && (
                <div id={`${baseId}-connectivity-panel`} className="space-y-4 pt-1">

              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    Status:{' '}
                    {connectivity.manualOffline
                      ? 'Manual App Offline Mode'
                      : connectivity.isEffectivelyOnline
                      ? 'Online & Reachable'
                      : connectivity.reason === 'captive_or_unreachable'
                      ? 'Unreachable / Captive Portal'
                      : 'Browser Offline'}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                    {connectivity.probeStatus === 'probing'
                      ? 'Probing...'
                      : connectivity.lastProbeAtIso
                      ? `Probed ${connectivity.lastProbeAtIso.slice(11, 19)}Z`
                      : 'Idle'}
                  </span>
                </div>
                {connectivity.probeDetail && (
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    {connectivity.probeDetail}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={connectivity.manualOffline}
                  onClick={() => connectivity.setManualOffline(!connectivity.manualOffline)}
                  className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    connectivity.manualOffline
                      ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
                      : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  {connectivity.manualOffline
                    ? 'Disable Manual Offline Mode'
                    : 'Enable Manual Offline Mode'}
                </button>

                <button
                  type="button"
                  disabled={connectivity.probeStatus === 'probing' || connectivity.manualOffline}
                  onClick={() => void connectivity.probeNow({ timeoutMs: 3500 })}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50"
                >
                  {connectivity.probeStatus === 'probing'
                    ? 'Testing...'
                    : 'Test Live Reachability & Time'}
                </button>
              </div>

              {/* NEW: Clock Skew & Logical Clock Inspector */}
              <div className="pt-3 border-t border-[var(--barn-border)] space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
                  <Clock className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Logical Clock Skew Telemetry</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                  <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                    <div className="text-[var(--barn-muted)]">Detected Skew vs Server</div>
                    <div
                      className={`font-semibold mt-0.5 ${
                        connectivity.clockDriftWarning ? 'text-[var(--barn-terracotta)]' : ''
                      }`}
                    >
                      {connectivity.clockSkewMs !== null
                        ? formatClockSkewHuman(connectivity.clockSkewMs)
                        : '0 ms (no server sample)'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                    <div className="text-[var(--barn-muted)]">Skew-Adjusted UTC Clock</div>
                    <div className="font-semibold mt-0.5 truncate">{getAdjustedNowIsoUtc()}</div>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Drift warning threshold: ±
                  {Math.round(CLOCK_DRIFT_WARNING_THRESHOLD_MS / 60_000)} minutes.
                </p>
              </div>
                </div>
              )}
            </section>

            {/* App Update Policy & Release Gate Manifest Inspector */}
            <section
              aria-labelledby={`${baseId}-update-policy-heading`}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <button
                type="button"
                aria-expanded={subunitOpen.update_release_gate}
                aria-controls={`${baseId}-update-policy-panel`}
                onClick={() => toggleSubunit('update_release_gate')}
                className="w-full text-left flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`${baseId}-update-policy-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      App Update Policy &amp; Release Gate Inspector
                    </h2>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                      v{CURRENT_APP_VERSION} · {pwaUpdate.state.policy}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Control SW reload behavior and inspect live{' '}
                    <span className="font-mono">./version.json</span> &amp;{' '}
                    <span className="font-mono">./status.json</span> manifests.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                  <RefreshCw className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {subunitOpen.update_release_gate ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>

              {subunitOpen.update_release_gate && (
                <div id={`${baseId}-update-policy-panel`} className="space-y-4 pt-1">

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['auto', 'Auto-Prompt', 'Check on focus'],
                    ['notify', 'Notify Only', 'Banner on update'],
                    ['pinned', 'Pinned Hold', 'Freeze SW swaps'],
                  ] as Array<[PwaUpdatePolicy, string, string]>
                ).map(([policyKey, title, desc]) => {
                  const selected = pwaUpdate.state.policy === policyKey;
                  return (
                    <button
                      key={policyKey}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleUpdatePolicySelect(policyKey)}
                      className={`p-2.5 rounded-xl border text-left transition-colors ${
                        selected
                          ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                          : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{title}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          selected ? 'text-[var(--barn-on-sage)]/85' : 'text-[var(--barn-muted)]'
                        }`}
                      >
                        {desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* NEW: Release Gate Manifest Comparison Table */}
              <div className="border border-[var(--barn-border)] rounded-xl overflow-hidden text-[11px]">
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-[var(--barn-border)] font-mono">
                    <tr className="bg-[var(--barn-canvas)]">
                      <th className="py-1.5 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Running / Remote App Version
                      </th>
                      <td className="py-1.5 px-3 text-right">
                        v{CURRENT_APP_VERSION} /{' '}
                        {pwaUpdate.state.remoteVersion?.appVersion
                          ? `v${pwaUpdate.state.remoteVersion.appVersion}`
                          : 'unfetched'}
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-surface)]">
                      <th className="py-1.5 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Local / Remote Schema Version
                      </th>
                      <td className="py-1.5 px-3 text-right">
                        v{CURRENT_BACKUP_SCHEMA_VERSION} /{' '}
                        {pwaUpdate.state.remoteVersion?.schemaVersion !== undefined
                          ? `v${pwaUpdate.state.remoteVersion.schemaVersion}`
                          : 'unfetched'}
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-canvas)]">
                      <th className="py-1.5 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Service Worker State
                      </th>
                      <td className="py-1.5 px-3 text-right">
                        {pwaUpdate.state.updateAvailable
                          ? 'Waiting update'
                          : pwaUpdate.state.offlineReady
                          ? 'Offline ready'
                          : 'Active / standard'}
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-surface)]">
                      <th className="py-1.5 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Pre-Upgrade Backup Gate
                      </th>
                      <td className="py-1.5 px-3 text-right">
                        {pwaUpdate.state.preUpgradeBackupVerified
                          ? 'Verified'
                          : 'Not verified yet'}
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-canvas)]">
                      <th className="py-1.5 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Last Manifest Check
                      </th>
                      <td className="py-1.5 px-3 text-right">
                        {pwaUpdate.state.lastCheckedAtIso || 'Never checked'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={updateCheckLock.isSubmitting || pwaUpdate.state.checking}
                  onClick={() =>
                    void updateCheckLock.runLocked(async () => {
                      setUpdateCheckFeedback(null);
                      const res = await pwaUpdate.checkNow(true);
                      if (res === 'checked') {
                        setUpdateCheckFeedback(
                          'Verified remote version.json & status.json manifests.'
                        );
                      } else if (res === 'offline') {
                        setUpdateCheckFeedback(
                          'Skipped update check because device is offline.'
                        );
                      } else if (res === 'blocked') {
                        setUpdateCheckFeedback(
                          'Release Gate paused or revoked remote update installation.'
                        );
                      } else {
                        setUpdateCheckFeedback(`Update probe finished with status "${res}".`);
                      }
                    })
                  }
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  {pwaUpdate.state.checking ? 'Checking...' : 'Check Release Manifest Now'}
                </button>

                {pwaUpdate.state.updateAvailable && pwaUpdate.state.policy !== 'pinned' && (
                  <button
                    type="button"
                    disabled={pwaUpdate.state.applying}
                    onClick={() => void pwaUpdate.applyUpdate()}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
                  >
                    {pwaUpdate.state.applying ? 'Applying...' : 'Apply Available Update'}
                  </button>
                )}
              </div>

              {pwaUpdate.state.gateDecision && (
                <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Gate Decision: {pwaUpdate.state.gateDecision.headline}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {pwaUpdate.state.gateDecision.detail}
                  </div>
                </div>
              )}

              {updateCheckFeedback && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
                >
                  {updateCheckFeedback}
                </div>
              )}
                </div>
              )}
            </section>
          </div>

          {/* Browser Feature & Runtime Compatibility Matrix + Worker Heap Reclaim */}
          <section
            aria-labelledby={`${baseId}-browser-compat-heading`}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <button
              type="button"
              aria-expanded={subunitOpen.browser_matrix}
              aria-controls={`${baseId}-browser-compat-panel`}
              onClick={() => toggleSubunit('browser_matrix')}
              className="w-full text-left flex items-start justify-between gap-3 group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id={`${baseId}-browser-compat-heading`}
                    className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                  >
                    Browser Capability Matrix &amp; Worker Pool Control
                  </h2>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
                    {browserMatrixEntries.filter((e) => e.supported).length}/
                    {browserMatrixEntries.length} APIs supported
                  </span>
                </div>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Live probe of 14 browser storage, worker, share, and imaging APIs used by Community
                  Pedigree, plus manual worker heap reclaim.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                <Cpu className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                {subunitOpen.browser_matrix ? (
                  <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
              </span>
            </button>

            {subunitOpen.browser_matrix && (
              <div id={`${baseId}-browser-compat-panel`} className="space-y-4 pt-1">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleTerminateIdleWorker}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
                  >
                    Terminate Idle Archive Worker
                  </button>
                </div>

            {activeBrowserCompat.outdatedReasons.length > 0 && (
              <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-1">
                {activeBrowserCompat.outdatedReasons.map((reason, idx) => (
                  <div key={idx} className="font-medium text-[var(--barn-ink)]">
                    · {reason}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              {browserMatrixEntries.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] truncate">{item.label}</div>
                    <div className="text-[11px] font-mono text-[var(--barn-muted)] truncate mt-0.5">
                      {item.detail}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[10px] font-bold uppercase shrink-0 mt-0.5 ${
                      item.supported ? 'text-[var(--barn-sage)]' : 'text-[var(--barn-terracotta)]'
                    }`}
                  >
                    {item.supported ? 'YES' : 'NO'}
                  </span>
                </div>
              ))}
            </div>

            {workerActionFeedback && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {workerActionFeedback}
              </div>
            )}
              </div>
            )}
          </section>

          {/* NEW: Live Browser Resource Handles, Freeze Queue, Sync Outbox & Native Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <section
              aria-labelledby={`${baseId}-handles-freeze-heading`}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <button
                type="button"
                aria-expanded={subunitOpen.handles_freeze}
                aria-controls={`${baseId}-handles-freeze-panel`}
                onClick={() => toggleSubunit('handles_freeze')}
                className="w-full text-left flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`${baseId}-handles-freeze-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      Live Resource Handles &amp; Freeze Queue
                    </h2>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
                      {liveResourceSnapshot.counts.idbConnections} IDB ·{' '}
                      {liveResourceSnapshot.activeOpfsHandles} OPFS · {pausedJobs.length} paused
                    </span>
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Real-time open IndexedDB connections/transactions, BroadcastChannels, OPFS file
                    handles, and paused mobile background tasks.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                  <Activity className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {subunitOpen.handles_freeze ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>

              {subunitOpen.handles_freeze && (
                <div id={`${baseId}-handles-freeze-panel`} className="space-y-4 pt-1">

              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[10px] text-[var(--barn-muted)]">IDB Conns</div>
                  <div className="font-mono font-bold tabular-nums mt-0.5">
                    {liveResourceSnapshot.counts.idbConnections}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[10px] text-[var(--barn-muted)]">IDB Tx</div>
                  <div className="font-mono font-bold tabular-nums mt-0.5">
                    {liveResourceSnapshot.counts.idbTransactions}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[10px] text-[var(--barn-muted)]">Channels</div>
                  <div className="font-mono font-bold tabular-nums mt-0.5">
                    {liveResourceSnapshot.counts.broadcastChannels}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[10px] text-[var(--barn-muted)]">OPFS Handles</div>
                  <div className="font-mono font-bold tabular-nums mt-0.5">
                    {liveResourceSnapshot.activeOpfsHandles}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <div className="text-[10px] text-[var(--barn-muted)]">Write Leases</div>
                  <div className="font-mono font-bold tabular-nums mt-0.5">
                    {liveResourceSnapshot.counts.activeForegroundTransferLeases}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[var(--barn-muted)] font-mono flex flex-wrap items-center justify-between gap-2">
                <span>
                  Active /tmp locks:{' '}
                  {liveResourceSnapshot.activeTmpFiles.length > 0
                    ? liveResourceSnapshot.activeTmpFiles.join(', ')
                    : 'none'}
                </span>
                <button
                  type="button"
                  onClick={() => setResourceTick((n) => n + 1)}
                  className="underline font-sans font-semibold text-[var(--barn-ink)]"
                >
                  Refresh Counters
                </button>
              </div>

              <div className="pt-3 border-t border-[var(--barn-border)] space-y-2">
                <div className="text-xs font-semibold text-[var(--barn-ink)]">
                  Background Freeze Queue ({pausedJobs.length})
                </div>
                {pausedJobs.length === 0 ? (
                  <p className="text-xs text-[var(--barn-muted)]">
                    No background jobs are currently paused due to lifecycle freeze or interruption.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl overflow-hidden">
                    {pausedJobs.map((job) => (
                      <div
                        key={job.taskId}
                        className="p-2.5 bg-[var(--barn-canvas)] flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--barn-ink)]">
                            {job.label}{' '}
                            <span className="font-mono text-[10px] uppercase text-[var(--barn-terracotta)]">
                              · {job.severity}
                            </span>
                          </div>
                          {job.severityReason && (
                            <div className="text-[11px] text-[var(--barn-muted)]">
                              {job.severityReason}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void resumePausedBackgroundJob(job.taskId)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                        >
                          Resume
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </div>
              )}
            </section>

            {/* Sync Outbox, Conflicts, Backup Folder & Native Bridge Inspector */}
            <section
              aria-labelledby={`${baseId}-sync-outbox-heading`}
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
            >
              <button
                type="button"
                aria-expanded={subunitOpen.sync_outbox}
                aria-controls={`${baseId}-sync-outbox-panel`}
                onClick={() => toggleSubunit('sync_outbox')}
                className="w-full text-left flex items-start justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`${baseId}-sync-outbox-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      Sync Outbox, Cloud Gate &amp; Native Events
                    </h2>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--barn-muted)]">
                      {pendingOutboxCount ?? 0} ops · {unresolvedConflictCount ?? 0} conflicts ·{' '}
                      {nativeEvents.length} events
                    </span>
                  </div>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Local device sync queue, unresolved merge conflicts, Backup Sync folder handle,
                    cloud circuit breaker, and Android/iOS bridge events.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                  <Radio className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {subunitOpen.sync_outbox ? (
                    <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              </button>

              {subunitOpen.sync_outbox && (
                <div id={`${baseId}-sync-outbox-panel`} className="space-y-4 pt-1">

              <div className="border border-[var(--barn-border)] rounded-xl overflow-hidden text-[11px]">
                <table className="w-full text-left border-collapse">
                  <tbody className="divide-y divide-[var(--barn-border)] font-mono">
                    <tr className="bg-[var(--barn-canvas)]">
                      <th className="py-2 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Device ID
                      </th>
                      <td className="py-2 px-3 text-right truncate max-w-[190px]">
                        {deviceId || 'local-session'}
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-surface)]">
                      <th className="py-2 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Delta Sync Outbox / Conflicts
                      </th>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {pendingOutboxCount ?? 0} ops ·{' '}
                        <span
                          className={
                            (unresolvedConflictCount ?? 0) > 0
                              ? 'text-[var(--barn-danger)] font-bold'
                              : ''
                          }
                        >
                          {unresolvedConflictCount ?? 0} conflicts
                        </span>
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-canvas)]">
                      <th className="py-2 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Backup Sync Folder
                      </th>
                      <td className="py-2 px-3 text-right">
                        {backupSyncStatus?.configured
                          ? `${backupSyncStatus.folderName || 'Connected'} (${backupSyncStatus.permissionState})`
                          : 'Not connected'}
                      </td>
                    </tr>
                    <tr className="bg-[var(--barn-surface)]">
                      <th className="py-2 px-3 font-sans font-medium text-[var(--barn-muted)]">
                        Cloud App-Folder Sync
                      </th>
                      <td className="py-2 px-3 text-right">
                        {cloudSyncState?.settings.enabled
                          ? cloudSyncState.circuitBreaker.tripped
                            ? `Tripped (${cloudSyncState.circuitBreaker.reason || '403/507'})`
                            : `${cloudSyncState.settings.provider} · active`
                          : 'Disabled (opt-in)'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void refreshSyncCounters()}
                  className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Reload Sync Outbox State
                </button>
                {onOpenImportExportHub && (
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('sync')}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold"
                  >
                    Open Sync &amp; Delta Channel UI
                  </button>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--barn-border)] space-y-2">
                <div className="text-xs font-semibold text-[var(--barn-ink)]">
                  Native Wrapper Bridge Events ({nativeEvents.length})
                </div>
                {nativeEvents.length === 0 ? (
                  <p className="text-xs text-[var(--barn-muted)]">
                    No native WebView bridge events recorded in this session (platform:{' '}
                    <span className="font-mono">{pedigreeBridge.getPlatform()}</span>).
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--barn-border)] max-h-40 overflow-y-auto border border-[var(--barn-border)] rounded-xl">
                    {nativeEvents.slice(0, 20).map((ev, i) => (
                      <div key={`${ev.timestamp}-${i}`} className="p-2 text-[11px] font-mono">
                        <span className="font-bold uppercase">{ev.level}</span> [{ev.code}]{' '}
                        {ev.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* WORKSPACE 3: LOGS & SUPPORT */}
      {showLogsTab && (
        <div role="tabpanel" aria-label="Logs & Support" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-8">
              <DiagnosticsAndSupportPanel
                visibleSections="logs-and-support"
                collapsible
                expanded={subunitOpen.diagnostics_logs}
                onToggleExpanded={() => toggleSubunit('diagnostics_logs')}
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
            </div>

            <div className="lg:col-span-4 space-y-5">
              {/* Validated Manual Diagnostic Event Trigger */}
              <section
                aria-labelledby={`${baseId}-diag-trigger-heading`}
                className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4"
              >
                <button
                  type="button"
                  aria-expanded={subunitOpen.manual_trigger}
                  aria-controls={`${baseId}-diag-trigger-panel`}
                  onClick={() => toggleSubunit('manual_trigger')}
                  className="w-full text-left flex items-start justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <h2
                      id={`${baseId}-diag-trigger-heading`}
                      className="font-display text-lg font-semibold text-[var(--barn-ink)]"
                    >
                      Manual Diagnostic Event
                    </h2>
                    <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                      Record a sanitized lifecycle, storage, or memory breadcrumb into the log ring.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                    <Terminal className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    {subunitOpen.manual_trigger ? (
                      <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                  </span>
                </button>

                {subunitOpen.manual_trigger && (
                  <div id={`${baseId}-diag-trigger-panel`} className="pt-1">

                <form onSubmit={handleInjectDiagnosticTrigger} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 block">
                      <span className="text-[11px] font-medium text-[var(--barn-muted)]">Level</span>
                      <select
                        value={triggerLevel}
                        onChange={(e) =>
                          setTriggerLevel(e.target.value as DiagnosticEventLevelOverride)
                        }
                        className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                      >
                        <option value="info">info</option>
                        <option value="warn">warn</option>
                        <option value="error">error</option>
                      </select>
                    </label>

                    <label className="space-y-1 block">
                      <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                        Category
                      </span>
                      <select
                        value={triggerCategory}
                        onChange={(e) =>
                          setTriggerCategory(e.target.value as DiagnosticEventCategoryOverride)
                        }
                        className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                      >
                        <option value="lifecycle">lifecycle</option>
                        <option value="storage">storage</option>
                        <option value="memory">memory</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                      Message (3–200 printable chars)
                    </span>
                    <input
                      type="text"
                      value={triggerMessage}
                      maxLength={200}
                      onChange={(e) => setTriggerMessage(e.target.value)}
                      placeholder="Manual heap / storage verification breadcrumb"
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="text-[11px] font-medium text-[var(--barn-muted)]">
                      Optional Field Note
                    </span>
                    <textarea
                      value={triggerNote}
                      maxLength={600}
                      rows={2}
                      onChange={(e) => setTriggerNote(e.target.value)}
                      placeholder="Observed behavior or reproduction context..."
                      className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="submit"
                      className="min-h-[40px] sm:min-h-[34px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
                    >
                      Record Validated Event
                    </button>
                  </div>

                  {triggerError && (
                    <div
                      role="alert"
                      className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-xs text-[var(--barn-ink)]"
                    >
                      {triggerError}
                    </div>
                  )}

                  {triggerFeedback && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs text-[var(--barn-ink)] inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                      <span>{triggerFeedback}</span>
                    </div>
                  )}
                </form>
                  </div>
                )}
              </section>

              {/* Sample Data Seeding Tool */}
              <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
                <button
                  type="button"
                  aria-expanded={subunitOpen.testing_fixtures}
                  aria-controls={`${baseId}-testing-fixtures-panel`}
                  onClick={() => toggleSubunit('testing_fixtures')}
                  className="w-full text-left flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-display font-semibold text-[var(--barn-ink)]">
                      Testing Fixture Generator
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)] mt-0.5 truncate">
                      Seed tagged testing herds across predefined species
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)]">
                    <Database className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    {subunitOpen.testing_fixtures ? (
                      <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                  </span>
                </button>

                {subunitOpen.testing_fixtures && (
                  <div id={`${baseId}-testing-fixtures-panel`} className="space-y-3 pt-1">
                    <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                      Seed predefined testing herds across species for reproduction or layout stress
                      tests. Sample records stay tagged and separately purgeable.
                    </p>
                    <button
                      type="button"
                      disabled={destructiveLabLock.isSubmitting}
                      onClick={() =>
                        void destructiveLabLock.runLocked(async () => {
                          await onSeedAllSpecies();
                          setTriggerFeedback(
                            'Seeded sample testing animals across predefined species.'
                          );
                        })
                      }
                      className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Database className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Seed Sample Testing Data
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE 4: MAINTENANCE & RESETS */}
      {showMaintenanceTab && (
        <div role="tabpanel" aria-label="Maintenance & Resets" className="space-y-5">
          <DiagnosticsAndSupportPanel
            visibleSections="maintenance"
            collapsible
            expanded={subunitOpen.diagnostics_maintenance}
            onToggleExpanded={() => toggleSubunit('diagnostics_maintenance')}
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

          {/* Safeguarded Multi-Step Destructive Reset Lab */}
          <section
            aria-labelledby={`${baseId}-destructive-lab-heading`}
            className="bg-[var(--barn-surface)] border border-[var(--barn-danger)] rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <button
              type="button"
              aria-expanded={subunitOpen.destructive_lab}
              aria-controls={`${baseId}-destructive-lab-panel`}
              onClick={() => toggleSubunit('destructive_lab')}
              className="w-full text-left flex items-start justify-between gap-3 group"
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--barn-danger)]">
                  <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>DESTRUCTIVE DEVELOPER &amp; RESET LAB</span>
                  <span className="font-mono text-[11px] font-medium text-[var(--barn-muted)]">
                    · {destructiveArmed ? 'Safety Armed' : 'Locked'}
                  </span>
                </div>
                <h2
                  id={`${baseId}-destructive-lab-heading`}
                  className="font-display text-lg font-bold text-[var(--barn-ink)]"
                >
                  Safeguarded Cache, Sync &amp; Data Reset Controls
                </h2>
                <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
                  All destructive resets stay locked until you toggle <strong>Safety Arm</strong>{' '}
                  and type each exact confirmation phrase.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 shrink-0 text-[var(--barn-muted)] group-hover:text-[var(--barn-ink)] pt-0.5">
                {destructiveArmed ? (
                  <Unlock className="w-4 h-4 text-[var(--barn-danger)] shrink-0" aria-hidden="true" />
                ) : (
                  <Lock className="w-4 h-4 text-[var(--barn-danger)] shrink-0" aria-hidden="true" />
                )}
                {subunitOpen.destructive_lab ? (
                  <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
                )}
              </span>
            </button>

            {subunitOpen.destructive_lab && (
              <div id={`${baseId}-destructive-lab-panel`} className="space-y-4 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={archiveExportLock.isSubmitting}
                    onClick={() => void handleDownloadPreResetJson()}
                    className="min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    {archiveExportLock.isSubmitting ? 'Preparing JSON...' : 'Download Pre-Reset JSON'}
                  </button>

                  <button
                    type="button"
                    aria-pressed={destructiveArmed}
                    onClick={() => {
                      setDestructiveArmed((armed) => !armed);
                      setTmpPurgePhrase('');
                      setSyncResetPhrase('');
                      setWipePhrase('');
                      setFactoryResetPhrase('');
                      setLabError(null);
                    }}
                    className={`min-h-[40px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                      destructiveArmed
                        ? 'bg-[var(--barn-danger)] text-[var(--barn-on-danger)] border-[var(--barn-danger)]'
                        : 'bg-[var(--barn-canvas)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {destructiveArmed ? (
                      <>
                        <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                        Safety Armed (Lock Again)
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                        Arm Destructive Controls
                      </>
                    )}
                  </button>
                </div>

            {labError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-xs flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-[var(--barn-danger)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{labError}</span>
              </div>
            )}

            {labFeedback && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs flex items-start gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{labFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* 1. Purge OPFS /tmp Scratchpad */}
              <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
                <div>
                  <div className="font-semibold text-[var(--barn-ink)]">
                    1. Purge OPFS /tmp Scratchpad
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                    Reclaims abandoned ZIP/PDF temporary export files without touching vault backups
                    or herd records.
                  </p>
                </div>
                {destructiveArmed && (
                  <div className="space-y-2 pt-2 border-t border-[var(--barn-border)]">
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Type{' '}
                      <span className="font-mono font-bold text-[var(--barn-ink)]">
                        {DESTRUCTIVE_CONFIRM_PHRASES.purge_opfs_tmp}
                      </span>{' '}
                      to execute:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={tmpPurgePhrase}
                        onChange={(e) => setTmpPurgePhrase(e.target.value)}
                        placeholder={DESTRUCTIVE_CONFIRM_PHRASES.purge_opfs_tmp}
                        className="flex-1 min-w-[130px] min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs uppercase"
                      />
                      <button
                        type="button"
                        disabled={
                          destructiveLabLock.isSubmitting ||
                          !isDestructiveActionConfirmationValid('purge_opfs_tmp', tmpPurgePhrase)
                        }
                        onClick={() => void handlePurgeTmpAction()}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Purge /tmp
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Reset Delta Sync Outbox & Reminders */}
              <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
                <div>
                  <div className="font-semibold text-[var(--barn-ink)]">
                    2. Reset Delta Sync Outbox &amp; Conflict Queue
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                    Clears pending peer delta operations and reminder snoozes while preserving
                    every animal record.
                  </p>
                </div>
                {destructiveArmed && (
                  <div className="space-y-2 pt-2 border-t border-[var(--barn-border)]">
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Type{' '}
                      <span className="font-mono font-bold text-[var(--barn-ink)]">
                        {DESTRUCTIVE_CONFIRM_PHRASES.clear_sync_outbox}
                      </span>{' '}
                      to execute:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={syncResetPhrase}
                        onChange={(e) => setSyncResetPhrase(e.target.value)}
                        placeholder={DESTRUCTIVE_CONFIRM_PHRASES.clear_sync_outbox}
                        className="flex-1 min-w-[130px] min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-xs uppercase"
                      />
                      <button
                        type="button"
                        disabled={
                          destructiveLabLock.isSubmitting ||
                          !isDestructiveActionConfirmationValid('clear_sync_outbox', syncResetPhrase)
                        }
                        onClick={() => void handleClearSyncOutboxAction()}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        Reset Sync Outbox
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Wipe All Barn Records (Keep Species Settings) */}
              <div className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] space-y-2.5">
                <div>
                  <div className="font-semibold text-[var(--barn-danger)]">
                    3. Clear All Barn Records (Keep Species Setup)
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                    Deletes all animals, photos, breedings, tasks, logs, and shows while preserving
                    species profiles.
                  </p>
                </div>
                {destructiveArmed && (
                  <div className="space-y-2 pt-2 border-t border-[var(--barn-border)]">
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Type{' '}
                      <span className="font-mono font-bold text-[var(--barn-ink)]">
                        {DESTRUCTIVE_CONFIRM_PHRASES.wipe_all_animals}
                      </span>{' '}
                      to wipe:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={wipePhrase}
                        onChange={(e) => setWipePhrase(e.target.value)}
                        placeholder={DESTRUCTIVE_CONFIRM_PHRASES.wipe_all_animals}
                        className="flex-1 min-w-[130px] min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-danger)] font-mono text-xs uppercase"
                      />
                      <button
                        type="button"
                        disabled={
                          destructiveLabLock.isSubmitting ||
                          !isDestructiveActionConfirmationValid('wipe_all_animals', wipePhrase)
                        }
                        onClick={() => void handleWipeAllRecordsAction()}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        Wipe All Records
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Factory Reset App & Restore Default Sample Data */}
              <div className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] space-y-2.5">
                <div>
                  <div className="font-semibold text-[var(--barn-danger)]">
                    4. Factory Reset &amp; Reload Default Starter Data
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                    Resets barn settings, custom species, and all user data back to the clean
                    factory sample database.
                  </p>
                </div>
                {destructiveArmed && (
                  <div className="space-y-2 pt-2 border-t border-[var(--barn-border)]">
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Type{' '}
                      <span className="font-mono font-bold text-[var(--barn-ink)]">
                        {DESTRUCTIVE_CONFIRM_PHRASES.factory_restore}
                      </span>{' '}
                      to factory reset:
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={factoryResetPhrase}
                        onChange={(e) => setFactoryResetPhrase(e.target.value)}
                        placeholder={DESTRUCTIVE_CONFIRM_PHRASES.factory_restore}
                        className="flex-1 min-w-[130px] min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-danger)] font-mono text-xs uppercase"
                      />
                      <button
                        type="button"
                        disabled={
                          destructiveLabLock.isSubmitting ||
                          !isDestructiveActionConfirmationValid('factory_restore', factoryResetPhrase)
                        }
                        onClick={() => void handleFactoryRestoreAction()}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        Factory Reset App
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
