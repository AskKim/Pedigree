/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Barn Preferences, Appearance Studio, PWA Storage Protection, Multi-Worker Local Sync,
 * Custom Livestock, External Platform Importers & Global Reset Screen (`Settings`).
 */

import {
  AlertTriangle,
  Archive,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderSync,
  HardDrive,
  HelpCircle,
  Images,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Unlock,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  BackgroundPausedError,
  clearPausedBackgroundJob,
  registerPausedBackgroundJob,
} from '../storage/backgroundFreezeCoordinator';
import { emitAsyncErrorToast } from '../storage/crashLogger';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { readBlobAsArrayBuffer, readBlobAsText } from '../utils/es2018Shims';
import {
  buildCompleteBackupZipOffThread,
  buildPhotosOnlyZipOffThread,
  inspectBackupArchiveOffThread,
} from '../storage/offThreadWorkerClient';
import {
  decryptBytesWithPassphrase,
  decryptTextWithPassphrase,
  encryptBytesWithPassphrase,
  encryptTextWithPassphrase,
  supportsPassphraseCrypto,
} from '../storage/passphraseCrypto';
import { stripPhotoDataUrlsFromSnapshot } from '../storage/photoHydration';
import type { PreRestoreArchiveInspection } from '../core/archiveInspector';
import { BackupStatusEvaluation } from '../core/backupStatus';
import { CALENDAR_ALARM_LEAD_OPTIONS } from '../core/calendarExport';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
import {
  EncryptedPayloadEnvelope,
  tryExtractEncryptedEnvelopeFromZip,
  tryParseEncryptedEnvelopeJson,
  wrapEncryptedZipContainer,
} from '../core/encryptedExport';
import type { PhotoStorageFootprintReport } from '../core/photoMaintenance';
import {
  getHeavyZipExportGate,
  getTierStoragePolicy,
} from '../core/deviceCapability';
import { detectCurrentBrowserCompatibility } from '../storage/deviceCapabilityDetector';
import { BackupSyncStatus } from '../storage/localSyncChannels';
import { OpfsPruneSyncWarning } from '../storage/opfsStorage';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  IMAGE_OPTIMIZATION_PRESETS,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import { ConflictSelectionMap } from '../core/importers/conflictResolver';
import { PlatformImportPreview } from '../core/importers/importerTypes';
import {
  AnimalPhoto,
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  CalendarDeliveryMode,
  CalendarSyncSettings,
  normalizeCalendarSyncSettings,
  normalizeCurrencyCode,
  SpeciesProfile,
  WeightUnit,
} from '../core/models';
import { buildCleanCsvExportFileName, exportAnimalsCsv } from '../core/csvExport';
import {
  buildPdfReadyBarnSnapshot,
  exportBarnBackupJson,
  formatTimestampedBackupSlug,
} from '../core/syncAndExports';
import {
  formatReadableByteLimit,
  MAX_DELTA_BATCH_FILES,
  MAX_DELTA_BATCH_TOTAL_BYTES,
  MAX_DELTA_JSON_BYTES,
  MAX_JSON_BACKUP_BYTES,
  MAX_SQLITE_DB_BYTES,
  MAX_ZIP_ARCHIVE_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  WARM_THEME_PRESETS,
} from '../core/themePalette';
import {
  EncryptedSyncPassphraseError,
  parseDeltaFileTextAsync,
  reauthorizeBackupSyncFolder,
  resumePersistedDirectorySyncIfGranted,
  shareOrDownloadFile,
  supportsDirectoryPicker,
  syncWithPickedDirectory,
} from '../storage/localSyncChannels';
import {
  ArchivedHerdIndexEntry,
  CURRENT_BACKUP_SCHEMA_VERSION,
  VaultBackupMetadata,
} from '../core/backupVault';
import { CURRENT_APP_VERSION } from '../core/upgradeGate';
import {
  PwaUpdatePolicy,
  usePwaUpdateStatus,
} from '../storage/pwaUpdateManager';
import {
  RollingBackupMeta,
  StorageProtectionStatus,
  useConnectivityStatus,
  usePWAInstall,
} from '../storage/storageProtection';
import { downloadBinaryFile, downloadTextFile } from '../utils/webFileActions';
import type { GoogleCalendarOption } from '../utils/googleCalendarClient';
import { SignInWithGoogleButton } from './CalendarIntegrationModals';
import type { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';
import { ArchivedHerdsModal } from './ArchivedHerdsModal';
import { DeviceCapabilityCard } from './DeviceCapabilityCard';
import { DiagnosticsAndSupportPanel } from './DiagnosticsAndSupportPanel';
import { ExternalImporterPanel } from './ExternalImporterPanel';
import { ImageCompressionNotice } from './ImageCompressionNotice';
import { SpeciesEditorModal } from './SpeciesEditorModal';
import { UnifiedBackupVaultPanel } from './UnifiedBackupVaultPanel';

interface SettingsAndSyncScreenProps {
  snapshot: BarnDatabaseSnapshot;
  engineName: string;
  activeSpeciesName: string;
  deviceId: string;
  storageStatus: StorageProtectionStatus | null;
  backupStatus: BackupStatusEvaluation | null;
  syncOperations: SyncOperation[];
  syncConflicts: SyncConflictEntry[];
  openAddSpeciesOnMount: boolean;
  onConsumedOpenAddSpecies: () => void;
  onRequestPersistentStorage: () => Promise<StorageProtectionStatus> | void;
  recordBackupExport: (
    format: 'zip' | 'sqlite' | 'json',
    fileName?: string
  ) => Promise<void> | void;
  onUpdateSettings: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
  onSaveSpecies: (profile: SpeciesProfile) => Promise<boolean | void> | void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onDownloadTimestampedSpeciesBackup: (speciesName: string) => Promise<void> | void;
  onApplyPlatformImport: (
    preview: PlatformImportPreview,
    optimizedPhotos?: AnimalPhoto[],
    conflictSelections?: ConflictSelectionMap
  ) => Promise<void>;
  onImportJson: (jsonText: string, mode: 'merge' | 'replace') => Promise<void>;
  onImportBackupArchive: (
    bytes: Uint8Array,
    fileName: string,
    mode: 'merge' | 'replace'
  ) => Promise<void>;
  onImportDeltaOperations: (ops: SyncOperation[]) => Promise<void>;
  onResolveSyncConflict: (conflictId: string, side: 'winning' | 'losing') => Promise<void>;
  onDismissSyncConflict: (conflictId: string) => Promise<void>;
  onBuildLocalDeltaJson: () => { filename: string; content: string };
  onRestoreRollingBackup: (key: string) => Promise<void>;
  onExportSqliteBytes: () => Promise<Uint8Array | null>;
  onInspectSqliteRestoreBytes?: (
    bytes: Uint8Array,
    fileName?: string
  ) => Promise<PreRestoreArchiveInspection>;
  onImportSqliteBytes: (bytes: Uint8Array) => Promise<void>;
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
  onSeedAllSpecies: () => Promise<void> | void;
  onClearAllRecords: () => Promise<void> | void;
  onRestoreFactoryDefaults: () => Promise<void> | void;
  onExportTasksToCalendar?: (tasks: BarnTask[], filenameHint?: string) => number;
  googleAuthConnected?: boolean;
  googleUserEmail?: string | null;
  googleCalendars?: GoogleCalendarOption[];
  googleSyncBusy?: boolean;
  onConnectGoogleCalendar?: () => Promise<boolean>;
  onDisconnectGoogleCalendar?: () => Promise<void>;
  onRefreshGoogleCalendars?: () => Promise<void>;
  onLocateConflicts?: () => void;
  deviceCapability?: DeviceCapabilityController;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
  opfsSupported?: boolean;
  opfsVaultBackups?: VaultBackupMetadata[];
  rollingBackups?: RollingBackupMeta[];
  archivedHerdBundles?: ArchivedHerdIndexEntry[];
  onSaveManualOpfsVaultBackup?: (note?: string) => Promise<unknown> | void;
  onCreateVerifiedPreUpgradeBackup?: () => Promise<{
    verified: boolean;
    checksumSha256: string;
    fileName: string;
  } | null>;
  onRestoreOpfsVaultBackup?: (key: string) => Promise<void>;
  onDownloadOpfsVaultBackup?: (key: string) => Promise<void>;
  onDeleteOpfsVaultBackup?: (key: string) => Promise<void>;
  onDeleteRollingBackup?: (key: string) => Promise<void>;
  onRestoreArchivedHerdBundle?: (
    archiveKey: string,
    options?: { restoreToActiveStatus?: boolean; deleteArchiveAfterRestore?: boolean }
  ) => Promise<void>;
  onDownloadArchivedHerdBundle?: (archiveKey: string) => Promise<void>;
  onDeleteArchivedHerdBundle?: (archiveKey: string) => Promise<void>;
  backupSyncStatus?: BackupSyncStatus | null;
  pruneSyncWarning?: OpfsPruneSyncWarning | null;
  onConnectBackupSync?: () => Promise<unknown>;
  onReauthorizeBackupSync?: () => Promise<unknown>;
  onDisconnectBackupSync?: () => Promise<unknown>;
  onSyncVaultToSyncNow?: () => Promise<unknown>;
  onDismissPruneWarning?: () => void;
}

export function SettingsAndSyncScreen({
  snapshot,
  engineName,
  activeSpeciesName,
  deviceId,
  storageStatus,
  backupStatus,
  syncOperations,
  syncConflicts,
  openAddSpeciesOnMount,
  onConsumedOpenAddSpecies,
  onRequestPersistentStorage,
  recordBackupExport,
  onUpdateSettings,
  onSaveSpecies,
  onDeleteSpecies,
  onDownloadTimestampedSpeciesBackup,
  onApplyPlatformImport,
  onImportJson,
  onImportBackupArchive,
  onImportDeltaOperations,
  onResolveSyncConflict,
  onDismissSyncConflict,
  onBuildLocalDeltaJson,
  onRestoreRollingBackup,
  onExportSqliteBytes,
  onInspectSqliteRestoreBytes,
  onImportSqliteBytes,
  onAnalyzePhotoFootprint,
  onPruneOrphanPhotos,
  onReoptimizeOversizedPhotos,
  onPruneFullResPhotoPayloads,
  onScanDatabaseHealth,
  onRepairDatabaseHealth,
  onResetDatabaseConnection,
  onPurgeCorruptedCaches,
  onSeedAllSpecies,
  onClearAllRecords,
  onRestoreFactoryDefaults,
  onExportTasksToCalendar,
  googleAuthConnected = false,
  googleUserEmail = null,
  googleCalendars = [],
  googleSyncBusy = false,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onRefreshGoogleCalendars,
  onLocateConflicts,
  deviceCapability,
  onHydrateSnapshotForExport,
  opfsSupported = false,
  opfsVaultBackups = [],
  rollingBackups = [],
  archivedHerdBundles = [],
  onSaveManualOpfsVaultBackup,
  onCreateVerifiedPreUpgradeBackup,
  onRestoreOpfsVaultBackup,
  onDownloadOpfsVaultBackup,
  onDeleteOpfsVaultBackup,
  onDeleteRollingBackup,
  onRestoreArchivedHerdBundle,
  onDownloadArchivedHerdBundle,
  onDeleteArchivedHerdBundle,
  backupSyncStatus = null,
  pruneSyncWarning = null,
  onConnectBackupSync,
  onReauthorizeBackupSync,
  onDisconnectBackupSync,
  onSyncVaultToSyncNow,
  onDismissPruneWarning,
}: SettingsAndSyncScreenProps) {
  const baseId = useId();
  const { settings, speciesProfiles } = snapshot;
  const calendarSync = normalizeCalendarSyncSettings(settings.calendarSync);
  const updateCalendarSync = (patch: Partial<CalendarSyncSettings>) => {
    onUpdateSettings(
      { calendarSync: { ...calendarSync, ...patch } },
      { silent: true }
    );
  };
  const openDatedTasks = snapshot.tasks.filter((t) => !t.completed && Boolean(t.dueDateIso));

  const [barnName, setBarnName] = useState(settings.barnName);
  const [breederName, setBreederName] = useState(settings.breederName);
  const [preferredUnit, setPreferredUnit] = useState<WeightUnit>(settings.preferredUnit);
  const [currencyCode, setCurrencyCode] = useState<string>(() =>
    normalizeCurrencyCode(settings.currencyCode, 'USD')
  );
  const [defaultSpecies, setDefaultSpecies] = useState(settings.defaultSpecies);
  const [pinnedLandingSpecies, setPinnedLandingSpecies] = useState(settings.pinnedLandingSpecies);
  const [defaultGenerations, setDefaultGenerations] = useState<3 | 4 | 5 | 6>(
    settings.defaultGenerations
  );
  const [imageOptimizationPreset, setImageOptimizationPreset] =
    useState<ImageOptimizationPresetId>(settings.imageOptimizationPreset || 'balanced');
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [showHomeSummaryGrid, setShowHomeSummaryGrid] = useState<boolean>(
    settings.showHomeSummaryGrid !== false
  );
  const [includePhotoOnPedigree, setIncludePhotoOnPedigree] = useState<boolean>(
    Boolean(settings.includePhotoOnPedigree)
  );
  const [autoOffloadRetiredToOpfs, setAutoOffloadRetiredToOpfs] = useState<boolean>(
    Boolean(settings.autoOffloadRetiredToOpfs)
  );

  const [confirmGlobalDeleteAll, setConfirmGlobalDeleteAll] = useState(false);
  const [confirmFactoryRestore, setConfirmFactoryRestore] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [portabilityFeedback, setPortabilityFeedback] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showCustomSpeciesModal, setShowCustomSpeciesModal] = useState(false);
  const [showArchivedHerdsModal, setShowArchivedHerdsModal] = useState(false);
  const [folderSyncBusy, setFolderSyncBusy] = useState(false);
  const [zipExportBusy, setZipExportBusy] = useState<
    'complete' | 'photos' | 'json' | 'json-light' | null
  >(null);
  const [pendingHeavyZipExport, setPendingHeavyZipExport] = useState<'complete' | 'photos' | null>(
    null
  );
  const [pendingLargeRestore, setPendingLargeRestore] = useState<{
    file: File;
    kind: 'archive' | 'sqlite';
    mode?: 'merge' | 'replace';
  } | null>(null);

  const folderSyncLock = useAsyncSubmitLock();
  const deltaUploadLock = useAsyncSubmitLock();
  const deltaShareLock = useAsyncSubmitLock();
  const sqliteExportLock = useAsyncSubmitLock();
  const csvExportLock = useAsyncSubmitLock();
  const reportExportLock = useAsyncSubmitLock();
  const destructiveResetLock = useAsyncSubmitLock();
  const preUpgradeBackupLock = useAsyncSubmitLock();
  const updateCheckLock = useAsyncSubmitLock();
  const conflictRowLock = useAsyncKeyedLock();
  const [preUpgradeFeedback, setPreUpgradeFeedback] = useState<string | null>(null);
  const [updateCheckFeedback, setUpdateCheckFeedback] = useState<string | null>(null);

  const cryptoSupported = supportsPassphraseCrypto();
  const [encryptOutgoingSync, setEncryptOutgoingSync] = useState(false);
  const [syncPassphrase, setSyncPassphrase] = useState('');
  const [showSyncPassphrase, setShowSyncPassphrase] = useState(false);

  const [encryptBackupExport, setEncryptBackupExport] = useState(false);
  const [backupExportPassphrase, setBackupExportPassphrase] = useState('');
  const [showBackupExportPassphrase, setShowBackupExportPassphrase] = useState(false);

  const [restoreInspectBusy, setRestoreInspectBusy] = useState(false);
  const [pendingRestorePassphrasePrompt, setPendingRestorePassphrasePrompt] = useState<{
    fileName: string;
    sourceFormat: 'json' | 'zip';
    mode: 'merge' | 'replace';
    envelope: EncryptedPayloadEnvelope;
    passphrase: string;
    error: string | null;
  } | null>(null);
  const [pendingRestoreInspection, setPendingRestoreInspection] = useState<{
    inspection: PreRestoreArchiveInspection;
    mode: 'merge' | 'replace';
    jsonText?: string;
    archiveBytes?: Uint8Array;
    sqliteBytes?: Uint8Array;
  } | null>(null);
  const restoreCommitLock = useAsyncSubmitLock();

  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const connectivity = useConnectivityStatus();
  const pwaUpdate = usePwaUpdateStatus();

  useEffect(() => {
    if (openAddSpeciesOnMount) {
      setShowCustomSpeciesModal(true);
      onConsumedOpenAddSpecies();
    }
  }, [openAddSpeciesOnMount, onConsumedOpenAddSpecies]);

  useEffect(() => {
    setBarnName(settings.barnName);
    setBreederName(settings.breederName);
    setPreferredUnit(settings.preferredUnit);
    setCurrencyCode(normalizeCurrencyCode(settings.currencyCode, 'USD'));
    setDefaultSpecies(settings.defaultSpecies);
    setPinnedLandingSpecies(settings.pinnedLandingSpecies);
    setDefaultGenerations(settings.defaultGenerations);
    setImageOptimizationPreset(settings.imageOptimizationPreset || 'balanced');
    setShowHomeSummaryGrid(settings.showHomeSummaryGrid !== false);
    setIncludePhotoOnPedigree(Boolean(settings.includePhotoOnPedigree));
    setAutoOffloadRetiredToOpfs(Boolean(settings.autoOffloadRetiredToOpfs));
  }, [settings]);

  const mergeFileRef = useRef<HTMLInputElement | null>(null);
  const replaceFileRef = useRef<HTMLInputElement | null>(null);
  const sqliteFileRef = useRef<HTMLInputElement | null>(null);
  const deltaImportRef = useRef<HTMLInputElement | null>(null);

  const isDark = settings.themeMode === 'dark';
  const customColors: CustomThemeColors = settings.customColors || {};

  const allPhotos = snapshot.animalPhotos ?? [];
  const totalStoredPhotoBytes = allPhotos.reduce((acc, p) => acc + p.storedBytes, 0);
  const totalOriginalPhotoBytes = allPhotos.reduce((acc, p) => acc + p.originalBytes, 0);
  const totalPhotoSavingsPct = calculateSavingsPercent(
    totalOriginalPhotoBytes,
    totalStoredPhotoBytes
  );

  const activeColorValue = (key: keyof CustomThemeColors): string => {
    const val = customColors[key];
    if (val && /^#[0-9a-fA-F]{6}$/.test(val)) return val.toUpperCase();
    return DEFAULT_WARM_THEME_COLORS[key];
  };

  const handleColorPick = (key: keyof CustomThemeColors, hex: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    onUpdateSettings(
      {
        customColors: {
          ...customColors,
          [key]: hex.toUpperCase(),
        },
      },
      { silent: true }
    );
  };

  const handleApplyPreset = (colors: CustomThemeColors) => {
    onUpdateSettings({
      customColors: { ...colors },
    });
  };

  const handleResetColors = () => {
    onUpdateSettings({
      customColors: {},
    });
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      barnName: barnName.trim() || 'My Barn',
      barnNameOnboarded: true,
      breederName: breederName.trim(),
      preferredUnit,
      currencyCode: normalizeCurrencyCode(currencyCode, 'USD'),
      defaultSpecies,
      pinnedLandingSpecies,
      defaultGenerations,
      imageOptimizationPreset,
      showHomeSummaryGrid,
      includePhotoOnPedigree,
      autoOffloadRetiredToOpfs,
    });
  };

  const handleDownloadTimestampedFullBackup = async () => {
    setImportError(null);
    if (encryptBackupExport && backupExportPassphrase.length < 4) {
      setImportError(
        'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
      );
      return;
    }
    setZipExportBusy('json');
    try {
      const exportSnapshot = onHydrateSnapshotForExport
        ? await onHydrateSnapshotForExport(snapshot)
        : snapshot;
      const stampSlug = formatTimestampedBackupSlug();
      const baseFilename = `community-pedigree-full-backup-${stampSlug}.json`;
      const rawJson = exportBarnBackupJson(exportSnapshot);
      const filename = encryptBackupExport
        ? `community-pedigree-full-backup-${stampSlug}-encrypted.json`
        : baseFilename;
      const outputJson = encryptBackupExport
        ? JSON.stringify(
            await encryptTextWithPassphrase(rawJson, backupExportPassphrase, {
              payloadKind: 'json_backup',
              originalFileName: baseFilename,
            }),
            null,
            2
          )
        : rawJson;
      await downloadTextFile(filename, outputJson, 'application/json');
      void recordBackupExport('json', filename);
      setPortabilityFeedback(
        `Downloaded ${encryptBackupExport ? 'encrypted ' : ''}JSON backup (${exportSnapshot.animals.length} animals, ${(exportSnapshot.animalPhotos ?? []).length} embedded photos).`
      );
    } catch (err: any) {
      setImportError(err?.message || 'Could not prepare full JSON backup.');
    } finally {
      setZipExportBusy(null);
    }
  };

  const handleDownloadDatabaseOnlyBackup = async () => {
    setImportError(null);
    if (encryptBackupExport && backupExportPassphrase.length < 4) {
      setImportError(
        'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
      );
      return;
    }
    setZipExportBusy('json-light');
    try {
      const lightSnapshot = stripPhotoDataUrlsFromSnapshot(snapshot);
      const stampSlug = formatTimestampedBackupSlug();
      const baseFilename = `community-pedigree-records-only-${stampSlug}.json`;
      const rawJson = exportBarnBackupJson(lightSnapshot);
      const filename = encryptBackupExport
        ? `community-pedigree-records-only-${stampSlug}-encrypted.json`
        : baseFilename;
      const outputJson = encryptBackupExport
        ? JSON.stringify(
            await encryptTextWithPassphrase(rawJson, backupExportPassphrase, {
              payloadKind: 'json_backup',
              originalFileName: baseFilename,
            }),
            null,
            2
          )
        : rawJson;
      await downloadTextFile(filename, outputJson, 'application/json');
      void recordBackupExport('json', filename);
      setPortabilityFeedback(
        `Downloaded ${encryptBackupExport ? 'encrypted ' : ''}lightweight records-only JSON (${lightSnapshot.animals.length} animals; full-res photos skipped to preserve tab memory).`
      );
    } catch (err: any) {
      setImportError(err?.message || 'Could not prepare records-only JSON backup.');
    } finally {
      setZipExportBusy(null);
    }
  };

  const handleExportCsv = async () => {
    await csvExportLock.runLocked(async () => {
      setImportError(null);
      const filename = buildCleanCsvExportFileName(settings.barnName);
      const csvContent = exportAnimalsCsv(
        snapshot.animals,
        snapshot.speciesProfiles,
        settings,
        undefined,
        allPhotos
      );
      await downloadTextFile(filename, csvContent, 'text/csv');
      setPortabilityFeedback(
        `Exported ${snapshot.animals.length} animal record(s) to ${filename} (UTF-8 CSV with resolved parent names & tattoos).`
      );
    });
  };

  const activeDeviceTier = deviceCapability?.assessment.tier ?? 5;
  const activeTierPolicy = getTierStoragePolicy(activeDeviceTier);
  const activeBrowserCompat =
    deviceCapability?.browserCompatibility ??
    detectCurrentBrowserCompatibility(deviceCapability?.assessment);
  const heavyZipGate = deviceCapability
    ? getHeavyZipExportGate(deviceCapability.assessment, activeBrowserCompat)
    : {
        requiresConfirmation: activeDeviceTier === 1 || activeBrowserCompat.shouldConfirmHeavyZipExport,
        title: 'Memory Caution for Older or Lower-Memory Device',
        body:
          activeBrowserCompat.heavyZipCautionReason ||
          'Your device or browser may have limited memory for compressed .ZIP archives.',
        advice:
          'You can still try creating the .ZIP archive below. If it fails or reloads the page, please use Timestamped Backup (.JSON) instead — it safely backs up your herd using much less memory because of your older device or browser.',
      };

  const handleDownloadCompleteZip = async (skipCaution = false) => {
    setImportError(null);
    if (encryptBackupExport && backupExportPassphrase.length < 4) {
      setImportError(
        'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
      );
      return;
    }
    if (!skipCaution && heavyZipGate.requiresConfirmation) {
      setPendingHeavyZipExport('complete');
      return;
    }
    setPendingHeavyZipExport(null);
    setZipExportBusy('complete');
    try {
      const exportSnapshot = onHydrateSnapshotForExport
        ? await onHydrateSnapshotForExport(snapshot)
        : snapshot;
      const stampSlug = formatTimestampedBackupSlug();
      const archive = await buildCompleteBackupZipOffThread(exportSnapshot);
      const baseFilename = `community-pedigree-archive-${stampSlug}.zip`;
      let finalBytes = archive.bytes;
      let filename = baseFilename;
      if (encryptBackupExport) {
        const env = await encryptBytesWithPassphrase(archive.bytes, backupExportPassphrase, {
          payloadKind: 'zip_archive',
          originalFileName: baseFilename,
        });
        finalBytes = wrapEncryptedZipContainer(env, baseFilename);
        filename = `community-pedigree-archive-${stampSlug}-encrypted.zip`;
      }
      await downloadBinaryFile(filename, finalBytes, 'application/zip');
      void recordBackupExport('zip', filename);
      setPortabilityFeedback(
        `Saved ${encryptBackupExport ? 'encrypted ' : ''}${filename} (${archive.animalCount} animals · ${archive.photoCount} photo files · ${archive.binderCount} Barn Binder .HTM file${archive.binderCount === 1 ? '' : 's'} · ${formatByteSizePure(finalBytes.byteLength)}).`
      );
    } catch (err: any) {
      const baseMsg = err?.message || 'Could not build Complete Archive (.ZIP).';
      setImportError(
        heavyZipGate.requiresConfirmation
          ? `${baseMsg} Because this device or browser is older or low-memory, please use Timestamped Backup (.JSON) instead.`
          : baseMsg
      );
    } finally {
      setZipExportBusy(null);
    }
  };

  const handleDownloadPhotosOnlyZip = async (skipCaution = false) => {
    setImportError(null);
    if (allPhotos.length === 0) {
      setImportError('No animal photos stored yet to archive.');
      return;
    }
    if (encryptBackupExport && backupExportPassphrase.length < 4) {
      setImportError(
        'Enter an encryption passphrase of at least 4 characters before exporting an encrypted backup.'
      );
      return;
    }
    if (!skipCaution && heavyZipGate.requiresConfirmation) {
      setPendingHeavyZipExport('photos');
      return;
    }
    setPendingHeavyZipExport(null);
    setZipExportBusy('photos');
    try {
      const exportSnapshot = onHydrateSnapshotForExport
        ? await onHydrateSnapshotForExport(snapshot)
        : snapshot;
      const stampSlug = formatTimestampedBackupSlug();
      const archive = await buildPhotosOnlyZipOffThread(exportSnapshot);
      const baseFilename = `community-pedigree-photos-${stampSlug}.zip`;
      let finalBytes = archive.bytes;
      let filename = baseFilename;
      if (encryptBackupExport) {
        const env = await encryptBytesWithPassphrase(archive.bytes, backupExportPassphrase, {
          payloadKind: 'zip_archive',
          originalFileName: baseFilename,
        });
        finalBytes = wrapEncryptedZipContainer(env, baseFilename);
        filename = `community-pedigree-photos-${stampSlug}-encrypted.zip`;
      }
      await downloadBinaryFile(filename, finalBytes, 'application/zip');
      setPortabilityFeedback(
        `Saved ${encryptBackupExport ? 'encrypted ' : ''}${filename} (${archive.photoCount} organized image files across ${archive.animalCount} animals · ${formatByteSizePure(finalBytes.byteLength)}).`
      );
    } catch (err: any) {
      const baseMsg = err?.message || 'Could not build Photos-Only (.ZIP) archive.';
      setImportError(
        heavyZipGate.requiresConfirmation
          ? `${baseMsg} Because this device or browser is older or low-memory, please use Timestamped Backup (.JSON) instead.`
          : baseMsg
      );
    } finally {
      setZipExportBusy(null);
    }
  };

  const isSqliteUnavailable =
    !activeBrowserCompat.signals.wasmSupported || /json fallback/i.test(engineName);
  const dirPickerSupported = supportsDirectoryPicker();
  const persistStorageSupported = activeBrowserCompat.signals.persistStorageSupported;
  const webShareSupported = activeBrowserCompat.signals.webShareFilesSupported;

  const handleBackupArchiveUpload = async (
    file: File | undefined,
    mode: 'merge' | 'replace',
    skipTierCheck = false
  ) => {
    if (!file) return;
    setImportError(null);
    setPortabilityFeedback(null);
    setPendingRestorePassphrasePrompt(null);
    setPendingRestoreInspection(null);
    try {
      const lower = file.name.toLowerCase();
      const isJson = lower.endsWith('.json') && !lower.endsWith('.zip');
      const sizeCheck = validateUploadFileSize(
        file.name,
        file.size,
        isJson ? MAX_JSON_BACKUP_BYTES : MAX_ZIP_ARCHIVE_BYTES,
        isJson ? 'a JSON backup file' : 'a backup .ZIP archive'
      );
      if (!sizeCheck.ok) {
        setImportError(sizeCheck.error);
        return;
      }
      if (
        !skipTierCheck &&
        activeDeviceTier <= 2 &&
        file.size > activeTierPolicy.maxSafeImportBytesHint
      ) {
        setPendingLargeRestore({ file, kind: 'archive', mode });
        return;
      }
      setPendingLargeRestore(null);
      if (isJson) {
        const text = await readBlobAsText(file);
        const encryptedEnvelope = tryParseEncryptedEnvelopeJson(text);
        if (encryptedEnvelope) {
          setPendingRestorePassphrasePrompt({
            fileName: file.name,
            sourceFormat: 'json',
            mode,
            envelope: encryptedEnvelope,
            passphrase: '',
            error: null,
          });
          return;
        }
        setRestoreInspectBusy(true);
        const bytes = new TextEncoder().encode(text);
        const { inspection } = await inspectBackupArchiveOffThread(
          bytes,
          file.name,
          snapshot,
          false
        );
        setPendingRestoreInspection({
          inspection,
          mode,
          jsonText: text,
        });
      } else {
        const buf = await readBlobAsArrayBuffer(file);
        const rawBytes = new Uint8Array(buf);
        const encryptedEnvelope = tryExtractEncryptedEnvelopeFromZip(rawBytes, file.name);
        if (encryptedEnvelope) {
          setPendingRestorePassphrasePrompt({
            fileName: file.name,
            sourceFormat: 'zip',
            mode,
            envelope: encryptedEnvelope,
            passphrase: '',
            error: null,
          });
          return;
        }
        setRestoreInspectBusy(true);
        const { inspection } = await inspectBackupArchiveOffThread(
          rawBytes,
          file.name,
          snapshot,
          false
        );
        setPendingRestoreInspection({
          inspection,
          mode,
          archiveBytes: rawBytes,
        });
      }
    } catch (err: any) {
      setImportError(err?.message || 'Could not parse backup (.JSON or .ZIP) file.');
    } finally {
      setRestoreInspectBusy(false);
    }
  };

  const handleDecryptAndInspectBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRestorePassphrasePrompt) return;
    const prompt = pendingRestorePassphrasePrompt;
    setRestoreInspectBusy(true);
    try {
      if (prompt.sourceFormat === 'json') {
        const plainText = await decryptTextWithPassphrase(prompt.envelope, prompt.passphrase);
        const plainBytes = new TextEncoder().encode(plainText);
        const { inspection } = await inspectBackupArchiveOffThread(
          plainBytes,
          prompt.fileName,
          snapshot,
          true
        );
        setPendingRestorePassphrasePrompt(null);
        setPendingRestoreInspection({
          inspection,
          mode: prompt.mode,
          jsonText: plainText,
        });
      } else {
        const plainBytes = await decryptBytesWithPassphrase(prompt.envelope, prompt.passphrase);
        const { inspection } = await inspectBackupArchiveOffThread(
          plainBytes,
          prompt.fileName,
          snapshot,
          true
        );
        setPendingRestorePassphrasePrompt(null);
        setPendingRestoreInspection({
          inspection,
          mode: prompt.mode,
          archiveBytes: plainBytes,
        });
      }
    } catch (err: any) {
      setPendingRestorePassphrasePrompt((prev) =>
        prev
          ? {
              ...prev,
              error:
                err?.message ||
                'Incorrect passphrase or corrupted encrypted archive. Try again.',
            }
          : null
      );
    } finally {
      setRestoreInspectBusy(false);
    }
  };

  const handleConfirmPendingRestore = async () => {
    if (!pendingRestoreInspection) return;
    await restoreCommitLock.runLocked(async () => {
      const pending = pendingRestoreInspection;
      setImportError(null);
      try {
        if (pending.sqliteBytes) {
          await onImportSqliteBytes(pending.sqliteBytes);
          setPortabilityFeedback(
            `Restored SQLite database "${pending.inspection.fileName}".`
          );
        } else if (pending.jsonText !== undefined) {
          await onImportJson(pending.jsonText, pending.mode);
          setPortabilityFeedback(
            `${pending.mode === 'replace' ? 'Restored' : 'Merged'} JSON backup "${pending.inspection.fileName}".`
          );
        } else if (pending.archiveBytes) {
          await onImportBackupArchive(
            pending.archiveBytes,
            pending.inspection.fileName,
            pending.mode
          );
          setPortabilityFeedback(
            `${pending.mode === 'replace' ? 'Restored' : 'Merged'} archive "${pending.inspection.fileName}".`
          );
        }
        setPendingRestoreInspection(null);
      } catch (err: any) {
        setImportError(err?.message || 'Restore failed.');
      }
    });
  };

  const handleSqliteUpload = async (file: File | undefined, skipTierCheck = false) => {
    if (!file) return;
    setImportError(null);
    setPendingRestorePassphrasePrompt(null);
    setPendingRestoreInspection(null);
    try {
      const sizeCheck = validateUploadFileSize(
        file.name,
        file.size,
        MAX_SQLITE_DB_BYTES,
        'a SQLite database'
      );
      if (!sizeCheck.ok) {
        setImportError(sizeCheck.error);
        return;
      }
      if (
        !skipTierCheck &&
        activeDeviceTier <= 2 &&
        file.size > activeTierPolicy.maxSafeImportBytesHint
      ) {
        setPendingLargeRestore({ file, kind: 'sqlite' });
        return;
      }
      setPendingLargeRestore(null);
      const buf = await readBlobAsArrayBuffer(file);
      const sqliteBytes = new Uint8Array(buf);
      if (onInspectSqliteRestoreBytes) {
        setRestoreInspectBusy(true);
        const inspection = await onInspectSqliteRestoreBytes(sqliteBytes, file.name);
        setPendingRestoreInspection({
          inspection,
          mode: 'replace',
          sqliteBytes,
        });
      } else {
        await onImportSqliteBytes(sqliteBytes);
      }
    } catch (err: any) {
      setImportError(err?.message || 'Could not load database file.');
    } finally {
      setRestoreInspectBusy(false);
    }
  };

  const handleDeltaFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    await deltaUploadLock.runLocked(async () => {
      setImportError(null);
      setSyncFeedback(null);
      try {
        const list = Array.from(files);
        if (list.length > MAX_DELTA_BATCH_FILES) {
          setImportError(
            `Selected ${list.length} delta files; upload at most ${MAX_DELTA_BATCH_FILES} per batch to protect mobile memory.`
          );
          return;
        }
        let totalBytes = 0;
        for (const file of list) {
          const check = validateUploadFileSize(
            file.name,
            file.size,
            MAX_DELTA_JSON_BYTES,
            'a delta sync JSON file'
          );
          if (!check.ok) {
            setImportError(check.error);
            return;
          }
          totalBytes += file.size;
          if (totalBytes > MAX_DELTA_BATCH_TOTAL_BYTES) {
            setImportError(
              `Combined delta batch exceeds ${formatReadableByteLimit(MAX_DELTA_BATCH_TOTAL_BYTES)}.`
            );
            return;
          }
        }
        const combinedOps: SyncOperation[] = [];
        let decryptedFileCount = 0;
        for (const file of list) {
          const text = await readBlobAsText(file);
          const parsed = await parseDeltaFileTextAsync(
            text,
            syncPassphrase || undefined
          );
          if (parsed.wasEncrypted) decryptedFileCount += 1;
          combinedOps.push(...parsed.operations);
        }
        await onImportDeltaOperations(combinedOps);
        setSyncFeedback(
          `Processed ${combinedOps.length} operation(s) across ${list.length} delta file(s)${
            decryptedFileCount > 0 ? ` (${decryptedFileCount} encrypted)` : ''
          }.`
        );
      } catch (err: any) {
        if (err instanceof EncryptedSyncPassphraseError) {
          setImportError(err.message);
        } else {
          setImportError(err?.message || 'Could not parse delta sync JSON file.');
        }
      }
    });
  };

  const syncContextRef = useRef({
    snapshot,
    syncOperations,
    deviceId,
    activeDeviceTier,
    encryptOutgoingSync,
    syncPassphrase,
    onHydrateSnapshotForExport,
    onImportDeltaOperations,
  });
  syncContextRef.current = {
    snapshot,
    syncOperations,
    deviceId,
    activeDeviceTier,
    encryptOutgoingSync,
    syncPassphrase,
    onHydrateSnapshotForExport,
    onImportDeltaOperations,
  };

  const executeResumeDirectorySync = useCallback(async (triggerReauthorize: boolean) => {
    setImportError(null);
    setFolderSyncBusy(true);
    try {
      if (triggerReauthorize) {
        await reauthorizeBackupSyncFolder();
      }
      const ctx = syncContextRef.current;
      const exportSnapshot =
        ctx.activeDeviceTier === 1
          ? stripPhotoDataUrlsFromSnapshot(ctx.snapshot)
          : ctx.onHydrateSnapshotForExport
          ? await ctx.onHydrateSnapshotForExport(ctx.snapshot)
          : ctx.snapshot;
      const activePass =
        ctx.encryptOutgoingSync && ctx.syncPassphrase.length >= 4
          ? ctx.syncPassphrase
          : undefined;
      const resumed = await resumePersistedDirectorySyncIfGranted({
        deviceId: ctx.deviceId,
        localOperations: ctx.syncOperations,
        masterBackupJson: exportBarnBackupJson(exportSnapshot),
        passphrase: activePass,
      });
      if (!resumed.resumed) {
        if (resumed.reason === 'permission_required') {
          const reasonMsg = `Folder write permission for "${resumed.folderName || 'Sync Folder'}" must be re-confirmed before finishing sync.`;
          registerPausedBackgroundJob({
            taskId: 'directory_sync',
            label: 'Folder Sync',
            pausedAtMs: Date.now(),
            severity: 'severity',
            severityReason: reasonMsg,
            resumeHandler: () => executeResumeDirectorySync(true),
          });
          emitAsyncErrorToast({
            title: 'Folder Sync Paused — Permission Needed',
            detail: reasonMsg,
            severity: 'error',
            sticky: true,
            category: 'storage',
            canOpenDiagnostics: false,
          });
        }
        return;
      }
      if (resumed.incomingOps.length > 0) {
        await ctx.onImportDeltaOperations(resumed.incomingOps);
      }
      clearPausedBackgroundJob('directory_sync');
      const encNote = resumed.wroteEncrypted ? ' (AES-GCM encrypted)' : '';
      const skipNote =
        resumed.encryptedPeersSkipped > 0
          ? ` Note: ${resumed.encryptedPeersSkipped} encrypted peer delta(s) skipped — enable Sync Encryption with matching passphrase.`
          : '';
      setSyncFeedback(
        `Resumed & synced folder "${resumed.folderName}"${encNote}: read ${resumed.peerFilesRead} peer delta file(s) and wrote delta_${ctx.deviceId}.json.${skipNote}`
      );
    } catch (err: any) {
      if (err instanceof BackgroundPausedError) {
        registerPausedBackgroundJob({
          taskId: 'directory_sync',
          label: 'Folder Sync',
          pausedAtMs: Date.now(),
          severity: err.severityIssue ? 'severity' : 'minor',
          severityReason: err.severityIssue ?? undefined,
          resumeHandler: () => executeResumeDirectorySync(Boolean(err.severityIssue)),
        });
        emitAsyncErrorToast({
          title: 'Folder Sync Paused',
          detail: err.checkpointSummary || err.message,
          severity: err.severityIssue ? 'error' : 'warning',
          sticky: Boolean(err.severityIssue),
          category: 'lifecycle',
          canOpenDiagnostics: Boolean(err.severityIssue),
        });
      } else {
        const msg = err?.message || 'Folder sync failed to resume.';
        registerPausedBackgroundJob({
          taskId: 'directory_sync',
          label: 'Folder Sync',
          pausedAtMs: Date.now(),
          severity: 'severity',
          severityReason: msg,
          resumeHandler: () => executeResumeDirectorySync(false),
        });
        emitAsyncErrorToast({
          title: 'Folder Sync Resume Failed',
          detail: msg,
          severity: 'error',
          sticky: true,
          category: 'storage',
        });
        setImportError(msg);
      }
    } finally {
      setFolderSyncBusy(false);
    }
  }, []);

  const handleDirectorySync = async () => {
    if (encryptOutgoingSync && syncPassphrase.length < 4) {
      setImportError(
        'Enter a sync passphrase of at least 4 characters or turn off encrypted folder sync.'
      );
      return;
    }
    await folderSyncLock.runLocked(async () => {
      setImportError(null);
      setSyncFeedback(null);
      setFolderSyncBusy(true);
      try {
        const exportSnapshot =
          activeDeviceTier === 1
            ? stripPhotoDataUrlsFromSnapshot(snapshot)
            : onHydrateSnapshotForExport
            ? await onHydrateSnapshotForExport(snapshot)
            : snapshot;
        const res = await syncWithPickedDirectory({
          deviceId,
          localOperations: syncOperations,
          masterBackupJson: exportBarnBackupJson(exportSnapshot),
          passphrase: encryptOutgoingSync ? syncPassphrase : undefined,
        });
        if (res.incomingOps.length > 0) {
          await onImportDeltaOperations(res.incomingOps);
        }
        clearPausedBackgroundJob('directory_sync');
        const encNote = res.wroteEncrypted ? ' (AES-GCM encrypted)' : '';
        const skipNote =
          res.encryptedPeersSkipped > 0
            ? ` Note: ${res.encryptedPeersSkipped} encrypted peer delta(s) skipped — enable Sync Encryption with matching passphrase.`
            : '';
        setSyncFeedback(
          `Synced folder "${res.folderName}"${encNote}: read ${res.peerFilesRead} peer delta file(s) and wrote delta_${deviceId}.json.${skipNote}`
        );
      } catch (err: any) {
        if (err instanceof BackgroundPausedError) {
          const hasSeverity = Boolean(err.severityIssue);
          registerPausedBackgroundJob({
            taskId: 'directory_sync',
            label: 'Folder Sync',
            pausedAtMs: Date.now(),
            severity: hasSeverity ? 'severity' : 'minor',
            severityReason: err.severityIssue ?? undefined,
            resumeHandler: () => executeResumeDirectorySync(hasSeverity),
          });
          setSyncFeedback(
            hasSeverity
              ? err.message
              : 'Folder sync paused cleanly when app moved to background and will auto-resume when you return.'
          );
          emitAsyncErrorToast({
            title: 'Folder Sync Paused',
            detail: err.checkpointSummary || err.message,
            severity: hasSeverity ? 'error' : 'warning',
            sticky: hasSeverity,
            category: 'lifecycle',
            canOpenDiagnostics: hasSeverity,
          });
        } else if (err?.name !== 'AbortError') {
          setImportError(err?.message || 'Local folder sync could not complete.');
        }
      } finally {
        setFolderSyncBusy(false);
      }
    });
  };

  const handleDownloadSqlite = async () => {
    await sqliteExportLock.runLocked(async () => {
      const bytes = await onExportSqliteBytes();
      if (!bytes) {
        setImportError('Raw SQLite binary export is unavailable in fallback mode.');
        return;
      }
      const stamp = formatTimestampedBackupSlug();
      const filename = `community-pedigree-${stamp}.sqlite`;
      await downloadBinaryFile(filename, bytes, 'application/x-sqlite3');
      void recordBackupExport('sqlite', filename);
    });
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const unresolvedConflicts = syncConflicts.filter((c) => !c.resolved);

  const colorPickersForMode: Array<{
    key: keyof CustomThemeColors;
    label: string;
    hint: string;
  }> = isDark
    ? [
        {
          key: 'darkPrimary',
          label: 'Primary Action Fill',
          hint: 'Main buttons & active lineage outlines',
        },
        {
          key: 'darkAccent',
          label: 'Warm Copper / Dam Chip',
          hint: 'Selected filter chips, nav tabs & Dam line',
        },
        {
          key: 'darkMale',
          label: 'Sire / Male Accent',
          hint: 'Sire pedigree Bezier curves & male tags',
        },
        {
          key: 'darkCanvas',
          label: 'Barn Background',
          hint: 'Deep outer page background',
        },
        {
          key: 'darkSurface',
          label: 'Card & Panel Surface',
          hint: 'Elevated cards, header & modals',
        },
      ]
    : [
        {
          key: 'lightPrimary',
          label: 'Primary Action Fill',
          hint: 'Main buttons & active lineage outlines',
        },
        {
          key: 'lightAccent',
          label: 'Warm Copper / Dam Chip',
          hint: 'Selected filter chips, nav tabs & Dam line',
        },
        {
          key: 'lightMale',
          label: 'Sire / Male Accent',
          hint: 'Sire pedigree Bezier curves & male tags',
        },
        {
          key: 'lightCanvas',
          label: 'Parchment Background',
          hint: 'Warm outer page background',
        },
        {
          key: 'lightSurface',
          label: 'Card & Panel Surface',
          hint: 'Elevated cards, header & modals',
        },
      ];

  const totalBarnRecords =
    snapshot.animals.length +
    allPhotos.length +
    snapshot.breedings.length +
    snapshot.cages.length +
    snapshot.tasks.length +
    snapshot.careLogs.length +
    snapshot.shows.length;

  return (
    <div className="space-y-6">
      {/* Upper Settings Section: Device Capability & Memory Handling */}
      {deviceCapability && (
        <DeviceCapabilityCard
          location="settings"
          controller={deviceCapability}
          settings={settings}
          totalBarnRecords={totalBarnRecords}
          onApplyLowMemorySettings={(patch) => onUpdateSettings(patch)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Columns: Preferences, Theme Studio & Offline PWA Protection */}
        <div className="lg:col-span-6 space-y-6">
          {/* Barn Preferences, Custom Species & Pedigree Defaults */}
          <form
            onSubmit={handleSavePreferences}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Barn Preferences &amp; Species Setup
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Configure barn headers, weight units, pedigree depth, and custom species prefixes
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCustomSpeciesModal(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Custom Livestock
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={`${baseId}-barnName`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Barn / Rabbitry / Farm Name
                </label>
                <input
                  id={`${baseId}-barnName`}
                  type="text"
                  value={barnName}
                  onChange={(e) => setBarnName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-breederName`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Breeder Name (for Pedigrees)
                </label>
                <input
                  id={`${baseId}-breederName`}
                  type="text"
                  value={breederName}
                  onChange={(e) => setBreederName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              </div>
            </div>

            {/* Image Storage Optimization Profile */}
            <div className="space-y-2 border-t border-b border-[var(--barn-border)] py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Incoming Image Optimization Profile (Direct Uploads &amp; Importers)
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                  {allPhotos.length} photo{allPhotos.length === 1 ? '' : 's'} ·{' '}
                  {formatByteSizePure(totalStoredPhotoBytes)}
                  {totalPhotoSavingsPct > 0 ? ` (-${totalPhotoSavingsPct}% saved)` : ''}
                </span>
              </div>

              {/* Browser Storage Quota Meter */}
              {storageStatus && storageStatus.supported && (
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
                      <HardDrive className="w-3.5 h-3.5 text-[var(--barn-slate)]" aria-hidden="true" />
                      On-Device Storage Quota
                      {storageStatus.persisted ? (
                        <span className="text-[10px] font-medium text-[var(--barn-sage)]">
                          (Locked)
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-[var(--barn-muted)]">
                          (Standard)
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--barn-muted)]">
                      {storageStatus.quotaBytes > 0
                        ? `${formatByteSizePure(storageStatus.usageBytes)} / ${formatByteSizePure(storageStatus.quotaBytes)} (${storageStatus.percentUsed}%)`
                        : `${formatByteSizePure(storageStatus.usageBytes)} used`}
                    </span>
                  </div>

                  {storageStatus.quotaBytes > 0 && (
                    <div
                      className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden"
                      role="progressbar"
                      aria-label="Browser storage quota usage"
                      aria-valuenow={Math.round(storageStatus.percentUsed)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        style={{ width: `${Math.max(1, Math.min(100, storageStatus.percentUsed))}%` }}
                        className={`h-full rounded-full transition-all ${
                          storageStatus.percentUsed >= 90
                            ? 'bg-[var(--barn-danger)]'
                            : storageStatus.percentUsed >= 75
                              ? 'bg-[var(--barn-terracotta)]'
                              : 'bg-[var(--barn-sage)]'
                        }`}
                      />
                    </div>
                  )}

                  {storageStatus.percentUsed >= 75 && (
                    <p className="text-[11px] text-[var(--barn-terracotta)] font-medium">
                      Storage is above {Math.round(storageStatus.percentUsed)}% of this browser&rsquo;s
                      quota. Consider exporting a Complete .ZIP backup or choosing a smaller photo
                      optimization preset.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.values(IMAGE_OPTIMIZATION_PRESETS).map((preset) => {
                  const active = imageOptimizationPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setImageOptimizationPreset(preset.id)}
                      className={`text-left p-2.5 rounded-xl border transition-colors space-y-1 ${
                        active
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{preset.shortBadge}</div>
                      <div
                        className={`text-[11px] font-mono ${
                          active ? 'opacity-90' : 'text-[var(--barn-muted)]'
                        }`}
                      >
                        {preset.typicalSizeHint}
                      </div>
                    </button>
                  );
                })}
              </div>
              <ImageCompressionNotice />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-pinnedLandingSpecies`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Pinned Startup Landing Page
              </label>
              <select
                id={`${baseId}-pinnedLandingSpecies`}
                value={pinnedLandingSpecies}
                onChange={(e) => setPinnedLandingSpecies(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              >
                <option value="">All-Species Barn Home Page (Show All Species Cards)</option>
                {speciesProfiles.map((sp) => (
                  <option key={sp.id} value={sp.name}>
                    Open Directly Inside {sp.name} Barn Hub
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <div>
                <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1.5">
                  Default Weight Display Unit
                </span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['lbs_oz', 'Pounds & Oz'],
                      ['lbs', 'Decimal Pounds'],
                      ['kg', 'Kilograms (Metric)'],
                      ['grams', 'Grams (Metric)'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      aria-pressed={preferredUnit === val}
                      onClick={() => setPreferredUnit(val)}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        preferredUnit === val
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                          : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                  Applies across the barn unless overridden per species in Edit Species Schedule.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label
                    htmlFor={`${baseId}-defaultSpecies`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Default Species
                  </label>
                  <select
                    id={`${baseId}-defaultSpecies`}
                    value={defaultSpecies}
                    onChange={(e) => setDefaultSpecies(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    {speciesProfiles.map((sp) => (
                      <option key={sp.id} value={sp.name}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-currencyCode`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Report Currency
                  </label>
                  <select
                    id={`${baseId}-currencyCode`}
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CAD">CAD (CA$)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="NZD">NZD (NZ$)</option>
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                    Default Pedigree Depth
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([3, 4, 5, 6] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={defaultGenerations === g}
                        onClick={() => setDefaultGenerations(g)}
                        className={`min-h-[42px] px-2 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                          defaultGenerations === g
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                            : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                        }`}
                      >
                        {g} Gen
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--barn-border)] text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHomeSummaryGrid}
                    onChange={(e) => setShowHomeSummaryGrid(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Show condensed 4-square summary strip on Home and Species pages</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePhotoOnPedigree}
                    onChange={(e) => setIncludePhotoOnPedigree(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Include animal&apos;s primary photo on printed .HTM / PDF pedigrees</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOffloadRetiredToOpfs}
                    disabled={!opfsSupported}
                    onChange={(e) => setAutoOffloadRetiredToOpfs(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>
                    Auto-offload Sold &amp; Deceased animals&apos; heavy photos &amp; logs to OPFS{' '}
                    <code className="font-mono">/archives</code>
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
            >
              Save Barn Preferences
            </button>
          </form>

          {/* System Calendar & Task Alarms (.ICS + Online Calendar) */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  System Calendar &amp; Task Alarms (.ICS / Online)
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Link an online Google Calendar, hand off to a local/desktop calendar app (like
                  desktop Outlook or Apple Calendar), or download offline .ICS files—with automatic
                  offline fallback whenever a connection isn&apos;t available.
                </p>
              </div>
              <CalendarPlus
                className="w-5 h-5 text-[var(--barn-sage)] shrink-0"
                aria-hidden="true"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Calendar Destination Mode
              </div>

              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'google_calendar' as CalendarDeliveryMode,
                      title: 'Link Online Google Calendar (auto-fallback to .ICS)',
                      desc: 'Add chores straight to your Google Calendar when online. Automatically falls back to offline .ICS files & links if offline or disconnected.',
                    },
                    {
                      id: 'external_app_or_ics' as CalendarDeliveryMode,
                      title: 'External / Desktop Calendar App (Outlook, Apple Calendar, Android)',
                      desc: 'Hands off .ICS directly to your device or desktop calendar app—even when that app is offline (such as desktop-hosted Outlook).',
                    },
                    {
                      id: 'offline_ics' as CalendarDeliveryMode,
                      title: 'Offline .ICS File Download Only',
                      desc: 'Always download standard .ICS calendar files locally without linking an online account.',
                    },
                  ] as const
                ).map((mode) => (
                  <label
                    key={mode.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      calendarSync.deliveryMode === mode.id
                        ? 'border-[var(--barn-sage)] bg-[var(--barn-sage)]/5'
                        : 'border-[var(--barn-border)] bg-[var(--barn-surface)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="calendar-delivery-mode"
                      checked={calendarSync.deliveryMode === mode.id}
                      onChange={() => updateCalendarSync({ deliveryMode: mode.id })}
                      className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                    />
                    <span>
                      <span className="font-semibold text-[var(--barn-ink)] block">
                        {mode.title}
                      </span>
                      <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                        {mode.desc}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {calendarSync.deliveryMode === 'google_calendar' && (
                <div className="mt-2 p-3 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-3">
                  {!googleAuthConnected ? (
                    <div className="space-y-2">
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        Connect your own Google account to grant Community Pedigree permission to
                        view your calendar list and add barn chore events. If you stay signed out or
                        go offline, the app automatically falls back to offline .ICS downloads.
                      </div>
                      {onConnectGoogleCalendar && (
                        <SignInWithGoogleButton
                          onClick={() => {
                            void onConnectGoogleCalendar();
                          }}
                          disabled={googleSyncBusy}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--barn-sage)]">
                          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>
                            Connected{googleUserEmail ? ` as ${googleUserEmail}` : ' to Google Calendar'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {onRefreshGoogleCalendars && (
                            <button
                              type="button"
                              onClick={() => {
                                void onRefreshGoogleCalendars();
                              }}
                              disabled={googleSyncBusy}
                              className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                            >
                              <RefreshCw className="w-3 h-3" aria-hidden="true" />
                              Refresh
                            </button>
                          )}
                          {onDisconnectGoogleCalendar && (
                            <button
                              type="button"
                              onClick={() => {
                                void onDisconnectGoogleCalendar();
                              }}
                              disabled={googleSyncBusy}
                              className="inline-flex items-center gap-1 min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                            >
                              <LogOut className="w-3 h-3" aria-hidden="true" />
                              Sign out
                            </button>
                          )}
                        </div>
                      </div>

                      {googleCalendars.length > 0 && (
                        <div className="space-y-1">
                          <label
                            htmlFor="google-target-calendar"
                            className="text-[11px] font-semibold text-[var(--barn-ink)] block"
                          >
                            Target Google Calendar
                          </label>
                          <select
                            id="google-target-calendar"
                            value={calendarSync.googleCalendarId}
                            onChange={(e) => {
                              const picked = googleCalendars.find((c) => c.id === e.target.value);
                              updateCalendarSync({
                                googleCalendarId: e.target.value,
                                googleCalendarName: picked?.summary || 'Google Calendar',
                              });
                            }}
                            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
                          >
                            {googleCalendars.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.summary}
                                {c.primary ? ' (Primary)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarSync.autoAddNewTasks}
                  onChange={(e) => updateCalendarSync({ autoAddNewTasks: e.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                />
                <span>
                  <span className="font-semibold text-[var(--barn-ink)] block">
                    Automatically send newly added tasks to calendar
                  </span>
                  <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                    When enabled, new dated chores use your selected calendar mode above (and fall
                    back to offline .ICS if unable to connect).
                  </span>
                </span>
              </label>

              <div className="pl-6 space-y-2.5 border-l-2 border-[var(--barn-border)]">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarSync.includeBreedingTasks}
                    onChange={(e) =>
                      updateCalendarSync({ includeBreedingTasks: e.target.checked })
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Include chores auto-generated from new breeding events</span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarSync.includeManualTasks}
                    onChange={(e) =>
                      updateCalendarSync({ includeManualTasks: e.target.checked })
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Include manually created barn chores</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
                <label
                  htmlFor="calendar-reminder-time"
                  className="font-semibold text-[var(--barn-ink)] block"
                >
                  Scheduled local time on due date
                </label>
                <input
                  id="calendar-reminder-time"
                  type="time"
                  value={calendarSync.reminderTimeLocal}
                  onChange={(e) =>
                    updateCalendarSync({
                      reminderTimeLocal: e.target.value || '08:00',
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-sm font-mono"
                />
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Uses your device&apos;s local clock (30-minute chore block).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-[var(--barn-ink)]">
                  <input
                    type="checkbox"
                    checked={calendarSync.alarmEnabled}
                    onChange={(e) => updateCalendarSync({ alarmEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <Bell className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                  <span>Include alarm / notification</span>
                </label>

                <select
                  aria-label="Alarm lead time before scheduled task"
                  value={calendarSync.alarmMinutesBefore}
                  disabled={!calendarSync.alarmEnabled}
                  onChange={(e) =>
                    updateCalendarSync({ alarmMinutesBefore: Number(e.target.value) })
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs disabled:opacity-50"
                >
                  {CALENDAR_ALARM_LEAD_OPTIONS.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Task Naming (App &amp; External Calendars)
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">
                Controls how animal identifiers appear in task titles across the app and in
                exported external calendar events. Species is appended to external calendar titles,
                and exported events include a direct link back into the app task entry.
              </p>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarSync.includeAnimalName}
                  onChange={(e) => updateCalendarSync({ includeAnimalName: e.target.checked })}
                  className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                />
                <span>
                  <span className="font-medium text-[var(--barn-ink)] block">
                    Include animal name in task titles
                  </span>
                  <span className="text-[11px] text-[var(--barn-muted)] block">
                    Uncheck to exclude animal names completely and show Animal ID (Tattoo / Tag / Microchip) instead.
                  </span>
                </span>
              </label>

              <div className="pl-6 border-l-2 border-[var(--barn-border)]">
                <label
                  className={`flex items-start gap-2.5 ${
                    calendarSync.includeAnimalName
                      ? 'cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={calendarSync.includeAnimalPrefix}
                    disabled={!calendarSync.includeAnimalName}
                    onChange={(e) =>
                      updateCalendarSync({ includeAnimalPrefix: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0"
                  />
                  <span>
                    <span className="font-medium text-[var(--barn-ink)] block">
                      Include species / herd name prefix
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] block">
                      Uncheck to strip your configured species prefix (e.g. show{' '}
                      <span className="font-mono">Briar</span> instead of{' '}
                      <span className="font-mono">Copper Creek Briar</span>).
                    </span>
                  </span>
                </label>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] space-y-1">
                {(() => {
                  const activeSp = speciesProfiles.find(
                    (sp) => sp.name.toLowerCase() === activeSpeciesName.toLowerCase()
                  );
                  const spLabel = activeSp?.name || activeSpeciesName || 'Rabbit';
                  const samplePrefix = (activeSp?.defaultAnimalPrefix || '').trim() || 'Copper Creek';
                  const sampleDam = !calendarSync.includeAnimalName
                    ? 'NZR-102'
                    : calendarSync.includeAnimalPrefix
                      ? `${samplePrefix} Briar`
                      : 'Briar';
                  const sampleSire = !calendarSync.includeAnimalName
                    ? 'NZR-051'
                    : calendarSync.includeAnimalPrefix
                      ? `${samplePrefix} Marshal`
                      : 'Marshal';
                  const appSample = `Palpation Check: ${sampleDam} (× ${sampleSire})`;
                  return (
                    <>
                      <div>
                        <span className="text-[var(--barn-muted)] mr-1.5">App task preview:</span>
                        <span className="font-mono text-[var(--barn-ink)] font-medium">
                          {appSample}
                        </span>
                      </div>
                      <div>
                        <span className="text-[var(--barn-muted)] mr-1.5">Calendar preview:</span>
                        <span className="font-mono text-[var(--barn-ink)] font-medium">
                          {`${appSample} [${spLabel}]`}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {onExportTasksToCalendar && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-[var(--barn-muted)]">
                  {openDatedTasks.length} open dated{' '}
                  {openDatedTasks.length === 1 ? 'task' : 'tasks'} ready across all species
                </span>
                <button
                  type="button"
                  disabled={openDatedTasks.length === 0}
                  onClick={() => onExportTasksToCalendar(openDatedTasks, 'open-barn-tasks')}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50"
                >
                  <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  Export {openDatedTasks.length} Open Dated{' '}
                  {openDatedTasks.length === 1 ? 'Task' : 'Tasks'} (.ICS)
                </button>
              </div>
            )}
          </section>

          {/* PWA Offline App Installation & Local Storage Protection */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Offline PWA &amp; Storage Eviction Defense
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  100% Free zero-cloud PWA · Protects local barn storage against browser cleanup
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            {/* Persistent Storage Lock Status */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
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
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
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
                  Disabled: This browser doesn&apos;t support manual Persistent Storage locking. Storage
                  retention is managed automatically; keep Timestamped Backup (.JSON) copies saved
                  off-device.
                </p>
              )}

              {storageStatus && storageStatus.quotaBytes > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    <span>Used: {formatByteSizePure(storageStatus.usageBytes)}</span>
                    <span>
                      Available Quota: {formatByteSizePure(storageStatus.quotaBytes)} (
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
                      className="h-full bg-[var(--barn-sage)] rounded-full"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Home Screen Install CTA */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <Smartphone className="w-4 h-4 text-[var(--barn-sage)] shrink-0" />
                  <span>
                    {isInstalled
                      ? 'Installed as Standalone Offline App'
                      : 'Install App to Home Screen (Offline Barn Mode)'}
                  </span>
                </div>
                {canPromptInstall && (
                  <button
                    type="button"
                    onClick={() => void promptInstall()}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                  >
                    Install App Now
                  </button>
                )}
              </div>
              {isIos && !isInstalled ? (
                <p className="text-[11px] text-[var(--barn-muted)]">
                  On iPhone/iPad Safari: tap the <strong>Share</strong> icon and choose{' '}
                  <strong>Add to Home Screen</strong> so iOS elevates storage priority and prevents
                  7-day unvisited-tab cleanup.
                </p>
              ) : !isInstalled ? (
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Use your browser menu &rarr; <strong>Install App</strong> /{' '}
                  <strong>Add to Home Screen</strong> so the app shell loads identically in Airplane
                  Mode or dead-zone barns.
                </p>
              ) : null}
            </div>

            {/* App Offline Toggle & Timed Connectivity Probe */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  {connectivity.isEffectivelyOnline ? (
                    <Wifi className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    Connectivity Governor:{' '}
                    {connectivity.manualOffline
                      ? 'Manual App Offline'
                      : connectivity.reason === 'captive_or_unreachable'
                      ? 'Captive Wi-Fi / Unreachable'
                      : connectivity.navigatorOnline
                      ? 'Online'
                      : 'Browser Offline'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={connectivity.manualOffline}
                    onClick={() => connectivity.setManualOffline(!connectivity.manualOffline)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border transition-colors ${
                      connectivity.manualOffline
                        ? 'bg-[var(--barn-terracotta)] text-white border-[var(--barn-terracotta)]'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {connectivity.manualOffline ? 'App Offline: ON' : 'Go Offline in App'}
                  </button>
                  <button
                    type="button"
                    disabled={connectivity.probeStatus === 'probing' || connectivity.manualOffline}
                    onClick={() => void connectivity.probeNow()}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-50"
                  >
                    {connectivity.probeStatus === 'probing'
                      ? 'Probing...'
                      : 'Run Connectivity Probe'}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">
                Manual App Offline queues calendar uploads and outbound checks locally without
                enabling device Airplane Mode. The probe checks uncached{' '}
                <code className="font-mono">version.json</code> with a timeout to catch captive
                barn/fair Wi-Fi portals.
              </p>
              {connectivity.probeDetail && (
                <p className="text-[11px] text-[var(--barn-ink)] bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-lg px-2.5 py-1.5">
                  {connectivity.probeDetail}
                  {connectivity.lastProbeAtIso
                    ? ` (${new Date(connectivity.lastProbeAtIso).toLocaleTimeString()})`
                    : ''}
                </p>
              )}
            </div>

            {/* PWA Update Governor (auto / notify / pinned) & Upgrade Gate */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  {pwaUpdate.state.policy === 'pinned' ? (
                    <Lock className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0" aria-hidden="true" />
                  ) : (
                    <Unlock className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  )}
                  <span>App Update Policy &amp; Release Gate</span>
                </div>
                <span className="font-mono text-[11px] text-[var(--barn-muted)]">
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
                      onClick={() => {
                        pwaUpdate.setPolicy(opt.value);
                        setUpdateCheckFeedback(`Update policy set to "${opt.label}".`);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-colors ${
                        selected
                          ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
                          : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
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
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      pwaUpdate.state.checking ? 'animate-spin' : ''
                    }`}
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
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
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
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold disabled:opacity-50"
                  >
                    {pwaUpdate.state.applying ? 'Applying Update...' : 'Apply Staged Update'}
                  </button>
                )}
              </div>

              {updateCheckFeedback && (
                <p className="text-[11px] text-[var(--barn-ink)] bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-lg px-2.5 py-1.5">
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
                    <p className="text-[var(--barn-muted)]">
                      {pwaUpdate.state.gateDecision.detail}
                    </p>
                  </div>
                )}
            </div>

            {/* Unified OPFS Backup Vault + IndexedDB Rolling Fallback */}
            <UnifiedBackupVaultPanel
              opfsSupported={opfsSupported}
              opfsBackups={opfsVaultBackups}
              rollingBackups={rollingBackups}
              archivedBundlesCount={archivedHerdBundles.length}
              archivedAnimalsCount={archivedHerdBundles.reduce(
                (acc, b) => acc + b.animalCount,
                0
              )}
              deviceTier={activeDeviceTier}
              backupSyncStatus={backupSyncStatus}
              pruneSyncWarning={pruneSyncWarning}
              onSaveManualVaultBackup={(note) => onSaveManualOpfsVaultBackup?.(note)}
              onRestoreOpfsBackup={async (key) => {
                if (onRestoreOpfsVaultBackup) await onRestoreOpfsVaultBackup(key);
              }}
              onDownloadOpfsBackup={async (key) => {
                if (onDownloadOpfsVaultBackup) await onDownloadOpfsVaultBackup(key);
              }}
              onDeleteOpfsBackup={async (key) => {
                if (onDeleteOpfsVaultBackup) await onDeleteOpfsVaultBackup(key);
              }}
              onRestoreRollingBackup={onRestoreRollingBackup}
              onDeleteRollingBackup={async (key) => {
                if (onDeleteRollingBackup) await onDeleteRollingBackup(key);
              }}
              onOpenArchivedHerdsModal={() => setShowArchivedHerdsModal(true)}
              onConnectBackupSync={onConnectBackupSync}
              onReauthorizeBackupSync={onReauthorizeBackupSync}
              onDisconnectBackupSync={onDisconnectBackupSync}
              onSyncVaultToSyncNow={onSyncVaultToSyncNow}
              onDismissPruneWarning={onDismissPruneWarning}
            />
          </section>

          {/* Appearance, Light/Dark Switcher & Custom Color Picker */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Appearance &amp; Custom Color Studio
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Switch between Warm Light and Original Woodland Dark, or customize your barn
                  palette
                </p>
              </div>
              <Palette className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            <div>
              <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1.5">
                Theme Mode
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <button
                  type="button"
                  aria-pressed={!isDark}
                  onClick={() => onUpdateSettings({ themeMode: 'light' })}
                  className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    !isDark
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  <Sun className="w-4 h-4" aria-hidden="true" />
                  Light · Warm Parchment
                </button>
                <button
                  type="button"
                  aria-pressed={isDark}
                  onClick={() => onUpdateSettings({ themeMode: 'dark' })}
                  className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    isDark
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  <Moon className="w-4 h-4" aria-hidden="true" />
                  Dark · Original Woodland
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Warm Barn Palette Presets
                </span>
                <button
                  type="button"
                  onClick={handleResetColors}
                  className="text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Reset Default Warmth
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {WARM_THEME_PRESETS.map((preset) => {
                  const pBg = isDark ? preset.colors.darkSurface : preset.colors.lightSurface;
                  const pPrimary = isDark ? preset.colors.darkPrimary : preset.colors.lightPrimary;
                  const pAccent = isDark ? preset.colors.darkAccent : preset.colors.lightAccent;
                  const pMale = isDark ? preset.colors.darkMale : preset.colors.lightMale;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleApplyPreset(preset.colors)}
                      className="text-left p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{preset.name}</span>
                        <span className="flex items-center gap-1 shrink-0" aria-hidden="true">
                          {[pBg, pPrimary, pAccent, pMale].map((hex, i) => (
                            <span
                              key={i}
                              style={{ backgroundColor: hex }}
                              className="w-3.5 h-3.5 rounded-full border border-black/20"
                            />
                          ))}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] line-clamp-1">
                        {preset.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
              <div className="text-xs font-medium text-[var(--barn-muted)]">
                Custom {isDark ? 'Dark' : 'Light'} Mode Color Picker
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {colorPickersForMode.map(({ key, label, hint }) => {
                  const val = activeColorValue(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] cursor-pointer hover:border-[var(--barn-sage)] transition-colors"
                    >
                      <input
                        type="color"
                        value={val}
                        onChange={(e) => handleColorPick(key, e.target.value)}
                        aria-label={label}
                        className="w-9 h-9 rounded-lg border border-[var(--barn-border)] bg-transparent cursor-pointer shrink-0 p-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium truncate">{label}</span>
                          <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                            {val}
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--barn-muted)] truncate">{hint}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Right 6 Columns: Importer, Multi-Worker Peer Sync, Exports & Reset Controls */}
        <div className="lg:col-span-6 space-y-6">
          <ExternalImporterPanel
            snapshot={snapshot}
            activeSpeciesName={activeSpeciesName}
            deviceCapabilityAssessment={deviceCapability?.assessment}
            onCommitImport={onApplyPlatformImport}
          />

          {/* Zero-Cloud Multi-Worker Peer Sync & Field-Level Merge */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Zero-Cloud Multi-Worker Sync (SyncThing / Folder / Share)
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5 font-mono">
                  Device ID: {deviceId} · Outbox Ops: {syncOperations.length}
                </p>
              </div>
              <FolderSync className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            {syncFeedback && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {syncFeedback}
              </div>
            )}

            <p className="text-xs text-[var(--barn-muted)]">
              Merge offline field edits across multiple farm workers without overwriting another
              worker&apos;s changes on a different field of the same animal.
            </p>

            {/* Optional Passphrase Encryption for Shared Sync Folder / Delta Files */}
            {cryptoSupported && (
              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-sync-encrypt-toggle`}
                    className="flex items-center gap-2 font-medium text-[var(--barn-ink)] cursor-pointer"
                  >
                    <input
                      id={`${baseId}-sync-encrypt-toggle`}
                      type="checkbox"
                      checked={encryptOutgoingSync}
                      onChange={(e) => setEncryptOutgoingSync(e.target.checked)}
                      className="rounded border-[var(--barn-border)]"
                    />
                    <KeyRound className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>Encrypt outgoing sync &amp; decrypt shared peer deltas</span>
                  </label>
                  <span className="text-[10px] font-mono text-[var(--barn-muted)]">
                    AES-256-GCM · Memory-only key
                  </span>
                </div>
                {(encryptOutgoingSync || syncPassphrase.length > 0) && (
                  <div className="flex items-center gap-2">
                    <label htmlFor={`${baseId}-sync-passphrase`} className="sr-only">
                      Shared Sync Passphrase
                    </label>
                    <input
                      id={`${baseId}-sync-passphrase`}
                      type={showSyncPassphrase ? 'text' : 'password'}
                      value={syncPassphrase}
                      onChange={(e) => setSyncPassphrase(e.target.value)}
                      placeholder="Shared barn sync passphrase (min 4 chars, never saved)"
                      autoComplete="off"
                      className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSyncPassphrase((v) => !v)}
                      aria-label={showSyncPassphrase ? 'Hide sync passphrase' : 'Show sync passphrase'}
                      className="min-h-[38px] min-w-[38px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                    >
                      {showSyncPassphrase ? (
                        <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={deltaShareLock.isSubmitting}
                aria-busy={deltaShareLock.isSubmitting}
                onClick={() =>
                  void deltaShareLock.runLocked(async () => {
                    setImportError(null);
                    if (encryptOutgoingSync && syncPassphrase.length < 4) {
                      setImportError(
                        'Enter a sync passphrase of at least 4 characters before exporting an encrypted delta.'
                      );
                      return;
                    }
                    const delta = onBuildLocalDeltaJson();
                    const finalFilename = encryptOutgoingSync
                      ? delta.filename.replace(/\.json$/i, '-encrypted.json')
                      : delta.filename;
                    const content = encryptOutgoingSync
                      ? JSON.stringify(
                          await encryptTextWithPassphrase(delta.content, syncPassphrase, {
                            payloadKind: 'delta_log',
                            originalFileName: delta.filename,
                          }),
                          null,
                          2
                        )
                      : delta.content;
                    const mode = await shareOrDownloadFile({
                      filename: finalFilename,
                      content,
                      mimeType: 'application/json',
                      title: 'Community Pedigree Worker Delta Log',
                    });
                    setSyncFeedback(
                      mode === 'shared'
                        ? `Shared ${encryptOutgoingSync ? 'encrypted ' : ''}${finalFilename} via native share sheet.`
                        : `Downloaded ${encryptOutgoingSync ? 'encrypted ' : ''}${finalFilename} for SyncThing / local sharing.`
                    );
                  })
                }
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-65"
              >
                {deltaShareLock.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                )}
                {deltaShareLock.isSubmitting ? 'Preparing Delta...' : 'Share / Export Worker Delta'}
              </button>

              <input
                ref={deltaImportRef}
                type="file"
                accept=".json,application/json"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleDeltaFilesUpload(e.target.files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={deltaUploadLock.isSubmitting}
                aria-busy={deltaUploadLock.isSubmitting}
                onClick={() => deltaImportRef.current?.click()}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-65"
              >
                {deltaUploadLock.isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="w-4 h-4" aria-hidden="true" />
                )}
                {deltaUploadLock.isSubmitting
                  ? 'Merging Deltas...'
                  : 'Merge Peer Delta Files (.JSON)'}
              </button>

              <button
                type="button"
                disabled={folderSyncBusy || folderSyncLock.isSubmitting || !dirPickerSupported}
                aria-busy={folderSyncBusy || folderSyncLock.isSubmitting}
                aria-describedby={!dirPickerSupported ? `${baseId}-dirpicker-reason` : undefined}
                onClick={() => void handleDirectorySync()}
                className={`sm:col-span-2 min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                  dirPickerSupported
                    ? 'hover:bg-[var(--barn-subtle)] disabled:opacity-50'
                    : 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] opacity-60 cursor-not-allowed'
                }`}
              >
                {folderSyncBusy || folderSyncLock.isSubmitting ? (
                  <Loader2 className="w-4 h-4 text-[var(--barn-sage)] animate-spin" aria-hidden="true" />
                ) : (
                  <FolderSync className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                )}
                {folderSyncBusy || folderSyncLock.isSubmitting
                  ? 'Syncing Local Folder...'
                  : 'Sync Directly With Local SyncThing / Shared Folder'}
              </button>
            </div>

            {!dirPickerSupported && (
              <p id={`${baseId}-dirpicker-reason`} className="text-[11px] text-[var(--barn-muted)]">
                Disabled: Direct local folder picking isn&apos;t supported in this browser (e.g., Safari,
                Firefox, or mobile browsers). Use <strong>Share / Export Worker Delta</strong> and{' '}
                <strong>Merge Peer Delta Files (.JSON)</strong> above instead.
              </p>
            )}
            {!webShareSupported && (
              <p className="text-[11px] text-[var(--barn-muted)]">
                Note: Native file Share Sheet is unavailable here — <strong>Share / Export Worker Delta</strong>{' '}
                will download a ready-to-share <span className="font-mono">.JSON</span> file directly.
              </p>
            )}

            {syncConflicts.length > 0 && (
              <div className="border-t border-[var(--barn-border)] pt-3 space-y-2.5">
                <div className="text-xs font-semibold text-[var(--barn-ink)]">
                  Field Collision Review Log ({unresolvedConflicts.length} unresolved)
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {syncConflicts.slice(0, 10).map((c) => (
                    <div
                      key={c.conflict_id}
                      className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          {c.entity_label} · <code className="font-mono">{c.field_name}</code>
                        </span>
                        <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                          {c.resolved ? 'Resolved' : 'Needs Review'}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-sage)]/50 truncate">
                          Applied ({c.winning_device_id}): {String(c.winning_value)}
                        </div>
                        <div className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] truncate">
                          Alternate ({c.losing_device_id}): {String(c.losing_value)}
                        </div>
                      </div>
                      {!c.resolved && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={conflictRowLock.isKeyLocked(c.conflict_id)}
                            onClick={() =>
                              void conflictRowLock.runKeyLocked(c.conflict_id, () =>
                                onResolveSyncConflict(c.conflict_id, 'winning')
                              )
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold disabled:opacity-60"
                          >
                            Keep Applied
                          </button>
                          <button
                            type="button"
                            disabled={conflictRowLock.isKeyLocked(c.conflict_id)}
                            onClick={() =>
                              void conflictRowLock.runKeyLocked(c.conflict_id, () =>
                                onResolveSyncConflict(c.conflict_id, 'losing')
                              )
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-60"
                          >
                            Use Alternate
                          </button>
                          <button
                            type="button"
                            disabled={conflictRowLock.isKeyLocked(c.conflict_id)}
                            onClick={() =>
                              void conflictRowLock.runKeyLocked(c.conflict_id, () =>
                                onDismissSyncConflict(c.conflict_id)
                              )
                            }
                            className="min-h-[30px] px-2 py-1 text-[11px] text-[var(--barn-muted)] underline disabled:opacity-60"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Local Backups & Open Exports */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Open Data Portability &amp; Backups
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Engine: {engineName} · Full local ownership, zero cloud lock-in
                </p>
                <p className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)] mt-1">
                  {snapshot.animals.length} animals · {allPhotos.length} photo
                  {allPhotos.length === 1 ? '' : 's'} ({formatByteSizePure(totalStoredPhotoBytes)})
                  {' · '}
                  {snapshot.breedings.length} breedings · {snapshot.tasks.length} chores
                </p>
              </div>
              <Database className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            {backupStatus && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  backupStatus.level === 'up_to_date'
                    ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]'
                    : 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-[var(--barn-ink)]">
                  <span>{backupStatus.headline}</span>
                  {backupStatus.lastExportRelative && (
                    <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                      {backupStatus.lastExportRelative}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">{backupStatus.detail}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-[var(--barn-muted)] pt-0.5">
                  <span>Last export: {backupStatus.lastExportLabel}</span>
                  <span>Latest change: {backupStatus.latestChangeLabel}</span>
                </div>
              </div>
            )}

            {importError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
              >
                {importError}
              </div>
            )}

            {portabilityFeedback && !importError && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {portabilityFeedback}
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[var(--barn-muted)]">
                  1-Click Timestamped Exports (Data + Organized Image Files)
                </div>
              </div>

              {/* Optional Backup Encryption Toggle & In-Memory Passphrase */}
              {cryptoSupported && (
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={`${baseId}-backup-encrypt-toggle`}
                      className="flex items-center gap-2 font-medium text-[var(--barn-ink)] cursor-pointer"
                    >
                      <input
                        id={`${baseId}-backup-encrypt-toggle`}
                        type="checkbox"
                        checked={encryptBackupExport}
                        onChange={(e) => setEncryptBackupExport(e.target.checked)}
                        className="rounded border-[var(--barn-border)]"
                      />
                      <Lock className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Passphrase-encrypt exported .ZIP &amp; .JSON backups</span>
                    </label>
                    <span className="text-[10px] font-mono text-[var(--barn-muted)]">
                      PBKDF2 + AES-256-GCM
                    </span>
                  </div>
                  {encryptBackupExport && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <label htmlFor={`${baseId}-backup-passphrase`} className="sr-only">
                          Backup Encryption Passphrase
                        </label>
                        <input
                          id={`${baseId}-backup-passphrase`}
                          type={showBackupExportPassphrase ? 'text' : 'password'}
                          value={backupExportPassphrase}
                          onChange={(e) => setBackupExportPassphrase(e.target.value)}
                          placeholder="Enter export passphrase (min 4 chars — kept in memory only)"
                          autoComplete="new-password"
                          className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowBackupExportPassphrase((v) => !v)}
                          aria-label={
                            showBackupExportPassphrase
                              ? 'Hide backup passphrase'
                              : 'Show backup passphrase'
                          }
                          className="min-h-[38px] min-w-[38px] px-2.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center"
                        >
                          {showBackupExportPassphrase ? (
                            <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-[var(--barn-muted)]">
                        Write down this passphrase — we never store it. Leave unchecked for normal
                        1-click unencrypted exports.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={zipExportBusy !== null}
                  onClick={() => void handleDownloadCompleteZip()}
                  title="Includes database JSON, organized animal photos, and printable Barn Binder .HTM per species"
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {zipExportBusy === 'complete'
                    ? 'Building Archive (.ZIP)...'
                    : 'Complete Archive + Binders (.ZIP)'}
                </button>

                <button
                  type="button"
                  disabled={allPhotos.length === 0 || zipExportBusy !== null}
                  onClick={() => void handleDownloadPhotosOnlyZip()}
                  title={
                    allPhotos.length === 0
                      ? 'Add photos to any animal first to export a photo folder archive'
                      : 'Download all animal images organized into species & animal folders (.ZIP)'
                  }
                  className="min-h-[44px] sm:min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Images className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {zipExportBusy === 'photos'
                    ? 'Packaging Photos (.ZIP)...'
                    : `Export Photos Folder (${allPhotos.length}) (.ZIP)`}
                </button>

                <button
                  type="button"
                  disabled={isSqliteUnavailable || sqliteExportLock.isSubmitting}
                  aria-busy={sqliteExportLock.isSubmitting}
                  aria-describedby={isSqliteUnavailable ? `${baseId}-sqlite-reason` : undefined}
                  onClick={() => void handleDownloadSqlite()}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    isSqliteUnavailable
                      ? 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                      : 'hover:bg-[var(--barn-subtle)] disabled:opacity-60'
                  }`}
                >
                  {sqliteExportLock.isSubmitting ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                  {sqliteExportLock.isSubmitting ? 'Exporting .SQLITE...' : 'Download Raw .SQLITE DB'}
                </button>

                <button
                  type="button"
                  disabled={zipExportBusy !== null}
                  onClick={() => void handleDownloadTimestampedFullBackup()}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {zipExportBusy === 'json'
                    ? 'Preparing Backup (.JSON)...'
                    : 'Timestamped Backup (.JSON)'}
                </button>

                <button
                  type="button"
                  disabled={zipExportBusy !== null}
                  onClick={() => void handleDownloadDatabaseOnlyBackup()}
                  title="Saves all herd, pedigree, breeding, and care logs as compact .JSON without loading full-resolution photos into memory"
                  className="min-h-[44px] sm:min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Database className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  {zipExportBusy === 'json-light'
                    ? 'Preparing Records (.JSON)...'
                    : 'Database Only (.JSON, Skip Photos)'}
                </button>

                <button
                  type="button"
                  disabled={csvExportLock.isSubmitting}
                  aria-busy={csvExportLock.isSubmitting}
                  onClick={() => void handleExportCsv()}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                >
                  {csvExportLock.isSubmitting ? (
                    <Loader2 className="w-4 h-4 text-[var(--barn-sage)] shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  )}
                  {csvExportLock.isSubmitting ? 'Exporting CSV...' : 'Export CSV'}
                </button>

                <button
                  type="button"
                  disabled={reportExportLock.isSubmitting}
                  aria-busy={reportExportLock.isSubmitting}
                  onClick={() =>
                    void reportExportLock.runLocked(async () => {
                      setImportError(null);
                      try {
                        const reportFilename = `barn-pdf-report-dto-${stamp}.json`;
                        await downloadTextFile(
                          reportFilename,
                          JSON.stringify(
                            buildPdfReadyBarnSnapshot(snapshot, activeSpeciesName),
                            null,
                            2
                          ),
                          'application/json'
                        );
                        setPortabilityFeedback(`Downloaded ${reportFilename}.`);
                      } catch (err) {
                        setImportError(
                          err instanceof Error ? err.message : 'Report JSON export failed.'
                        );
                      }
                    })
                  }
                  className="min-h-[44px] sm:min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                >
                  {reportExportLock.isSubmitting ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                  {reportExportLock.isSubmitting
                    ? 'Preparing Report...'
                    : `Export ${activeSpeciesName} Report (.JSON)`}
                </button>
              </div>

              {pendingHeavyZipExport && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs space-y-2"
                >
                  <div className="font-semibold text-[var(--barn-ink)]">{heavyZipGate.title}</div>
                  <p className="text-[11px] text-[var(--barn-ink)] leading-relaxed">
                    {heavyZipGate.body}
                  </p>
                  <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                    {heavyZipGate.advice}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const kind = pendingHeavyZipExport;
                        setPendingHeavyZipExport(null);
                        if (kind === 'complete') {
                          void handleDownloadCompleteZip(true);
                        } else {
                          void handleDownloadPhotosOnlyZip(true);
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
                    >
                      Try .ZIP Export Anyway
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingHeavyZipExport(null);
                        void handleDownloadDatabaseOnlyBackup();
                      }}
                      className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                    >
                      Database Only (.JSON, Skip Photos)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingHeavyZipExport(null);
                        void handleDownloadTimestampedFullBackup();
                      }}
                      className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold"
                    >
                      Full .JSON Backup (With Photos)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingHeavyZipExport(null)}
                      className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isSqliteUnavailable && (
                <p id={`${baseId}-sqlite-reason`} className="text-[11px] text-[var(--barn-muted)]">
                  Raw <span className="font-mono">.SQLITE</span> export/load is disabled because
                  WebAssembly SQLite isn&apos;t available in this browser (your records are safely stored
                  in IndexedDB JSON mode). Use <strong>Timestamped Backup (.JSON)</strong> instead.
                </p>
              )}
            </div>

            <div className="border-t border-[var(--barn-border)] pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-[var(--barn-muted)]">
                Restore &amp; Archive Merge (.ZIP, .JSON, or .SQLITE)
              </div>
              {activeDeviceTier <= 2 && (
                <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] text-[var(--barn-ink)] space-y-1">
                  <div className="font-semibold">
                    Tier {activeDeviceTier} Low-Memory Restore Caution (Recommended ≤{' '}
                    {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)})
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Large raw .ZIP, .JSON, or .SQLITE restores decode photos and database buffers
                    simultaneously in browser RAM. Close other tabs before restoring files above{' '}
                    {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)}.
                  </p>
                </div>
              )}

              {pendingLargeRestore && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)] text-xs space-y-2"
                >
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Large Restore Warning ({formatByteSizePure(pendingLargeRestore.file.size)})
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    &ldquo;{pendingLargeRestore.file.name}&rdquo; exceeds this Tier{' '}
                    {activeDeviceTier} device&rsquo;s{' '}
                    {formatByteSizePure(activeTierPolicy.maxSafeImportBytesHint)} comfort ceiling.
                    Close other browser tabs first, or proceed anyway?
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const pending = pendingLargeRestore;
                        setPendingLargeRestore(null);
                        if (pending.kind === 'sqlite') {
                          void handleSqliteUpload(pending.file, true);
                        } else {
                          void handleBackupArchiveUpload(
                            pending.file,
                            pending.mode || 'replace',
                            true
                          );
                        }
                      }}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
                    >
                      Proceed with Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingLargeRestore(null)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  ref={mergeFileRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    void handleBackupArchiveUpload(e.target.files?.[0], 'merge');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={restoreInspectBusy || restoreCommitLock.isSubmitting}
                  onClick={() => mergeFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  Merge (.JSON / .ZIP)
                </button>

                <input
                  ref={replaceFileRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    void handleBackupArchiveUpload(e.target.files?.[0], 'replace');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={restoreInspectBusy || restoreCommitLock.isSubmitting}
                  onClick={() => replaceFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  Restore (.JSON / .ZIP)
                </button>

                <input
                  ref={sqliteFileRef}
                  type="file"
                  accept=".sqlite,.db,.sqlite3"
                  className="hidden"
                  onChange={(e) => {
                    void handleSqliteUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={
                    isSqliteUnavailable || restoreInspectBusy || restoreCommitLock.isSubmitting
                  }
                  aria-describedby={isSqliteUnavailable ? `${baseId}-sqlite-reason` : undefined}
                  onClick={() => sqliteFileRef.current?.click()}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                    isSqliteUnavailable || restoreInspectBusy || restoreCommitLock.isSubmitting
                      ? 'bg-[var(--barn-canvas)] text-[var(--barn-muted)] opacity-55 cursor-not-allowed'
                      : 'hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  Load .SQLITE File
                </button>
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">
                Complete Archive (.ZIP) exports both database records and real viewable images
                organized by species &amp; animal. Photos-Only (.ZIP) archives merge cleanly back
                onto matching animals without overwriting your herd.
              </p>

              {restoreInspectBusy && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs flex items-center gap-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Inspecting backup contents before writing to database...</span>
                </div>
              )}

              {/* Encrypted Archive Passphrase Prompt (Stage B) */}
              {pendingRestorePassphrasePrompt && (
                <form
                  onSubmit={(e) => void handleDecryptAndInspectBackup(e)}
                  className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)] text-xs space-y-2.5"
                >
                  <div className="flex items-center gap-2 font-semibold text-[var(--barn-ink)]">
                    <Lock className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span>
                      Unlock Encrypted Backup &ldquo;{pendingRestorePassphrasePrompt.fileName}&rdquo;
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    This {pendingRestorePassphrasePrompt.sourceFormat.toUpperCase()} archive is
                    encrypted ({pendingRestorePassphrasePrompt.envelope.cipher}). Enter its
                    passphrase to inspect records before restoring.
                  </p>
                  {pendingRestorePassphrasePrompt.error && (
                    <div
                      role="alert"
                      className="p-2 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] font-medium"
                    >
                      {pendingRestorePassphrasePrompt.error}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={`${baseId}-unlock-restore-pass`} className="sr-only">
                      Encrypted Backup Passphrase
                    </label>
                    <input
                      id={`${baseId}-unlock-restore-pass`}
                      type="password"
                      autoFocus
                      value={pendingRestorePassphrasePrompt.passphrase}
                      onChange={(e) =>
                        setPendingRestorePassphrasePrompt((prev) =>
                          prev ? { ...prev, passphrase: e.target.value, error: null } : null
                        )
                      }
                      placeholder="Enter backup passphrase..."
                      className="flex-1 min-w-[180px] min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                    <button
                      type="submit"
                      disabled={restoreInspectBusy || !pendingRestorePassphrasePrompt.passphrase}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold disabled:opacity-55"
                    >
                      {restoreInspectBusy ? 'Unlocking...' : 'Decrypt & Inspect'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRestorePassphrasePrompt(null)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Pre-Restore Archive Inspector Dry-Run Preview (Stage B) */}
              {pendingRestoreInspection && (
                <div
                  role="region"
                  aria-label="Pre-Restore Archive Inspector"
                  className="p-4 rounded-xl bg-[var(--barn-canvas)] border-2 border-[var(--barn-sage)] text-xs space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[var(--barn-ink)] flex flex-wrap items-center gap-1.5">
                        <CheckCircle2
                          className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          Pre-Restore Inspector: {pendingRestoreInspection.inspection.fileName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[10px] uppercase">
                          {pendingRestoreInspection.inspection.sourceFormat}
                        </span>
                        {pendingRestoreInspection.inspection.encrypted && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] font-mono text-[10px]">
                            Encrypted
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                        {pendingRestoreInspection.inspection.barnName} · Mode:{' '}
                        <strong className="text-[var(--barn-ink)]">
                          {pendingRestoreInspection.mode === 'replace'
                            ? 'Replace Current Barn'
                            : 'Merge Into Current Barn'}
                        </strong>
                        {pendingRestoreInspection.inspection.isPhotosOnly
                          ? ' · Photos-Only Archive'
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Animals</div>
                      <div className="font-mono font-semibold text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.animalCount} (
                        {pendingRestoreInspection.inspection.activeAnimalCount} active /{' '}
                        {pendingRestoreInspection.inspection.archivedAnimalCount} arch)
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Photos</div>
                      <div className="font-mono font-semibold text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.photoCount} ·{' '}
                        {formatByteSizePure(pendingRestoreInspection.inspection.photoBytes)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Breedings / Chores</div>
                      <div className="font-mono font-semibold text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.breedingCount} /{' '}
                        {pendingRestoreInspection.inspection.taskCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)]">
                      <div className="text-[var(--barn-muted)]">Integrity Checks</div>
                      <div className="font-mono font-semibold text-[var(--barn-ink)]">
                        {pendingRestoreInspection.inspection.duplicateTattooCount} dup ·{' '}
                        {pendingRestoreInspection.inspection.parentSexMismatchCount} sex ·{' '}
                        {pendingRestoreInspection.inspection.healthIssueCount} health
                      </div>
                    </div>
                  </div>

                  {pendingRestoreInspection.inspection.speciesBreakdown.length > 0 && (
                    <div className="rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] p-2.5 space-y-1 text-[11px]">
                      <div className="font-semibold text-[var(--barn-muted)]">
                        Species Breakdown in Archive
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
                        {pendingRestoreInspection.inspection.speciesBreakdown.map((sp) => (
                          <span key={sp.species}>
                            {sp.species}: {sp.animalCount} animals, {sp.photoCount} photos (
                            {formatByteSizePure(sp.photoBytes)})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingRestoreInspection.mode === 'replace' &&
                    pendingRestoreInspection.inspection.replaceImpact && (
                      <div className="p-2.5 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[11px] space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)]">
                          Replace Impact Summary
                        </div>
                        <p className="text-[var(--barn-muted)]">
                          Current barn ({pendingRestoreInspection.inspection.replaceImpact.currentAnimalCount}{' '}
                          animals) &rarr; Incoming ({pendingRestoreInspection.inspection.animalCount}{' '}
                          animals, net{' '}
                          {pendingRestoreInspection.inspection.replaceImpact.netAnimalDelta >= 0
                            ? `+${pendingRestoreInspection.inspection.replaceImpact.netAnimalDelta}`
                            : pendingRestoreInspection.inspection.replaceImpact.netAnimalDelta}
                          ).{' '}
                          {pendingRestoreInspection.inspection.replaceImpact
                            .currentAnimalsNotInIncoming > 0 && (
                            <strong className="text-[var(--barn-ink)]">
                              {
                                pendingRestoreInspection.inspection.replaceImpact
                                  .currentAnimalsNotInIncoming
                              }{' '}
                              existing local animal(s) are not in this backup.
                            </strong>
                          )}{' '}
                          A safety backup of your current barn is saved first.
                        </p>
                      </div>
                    )}

                  {pendingRestoreInspection.mode === 'merge' &&
                    pendingRestoreInspection.inspection.mergeImpact && (
                      <div className="p-2.5 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[11px] space-y-0.5">
                        <div className="font-semibold text-[var(--barn-ink)]">
                          Merge Impact Summary
                        </div>
                        <p className="text-[var(--barn-muted)]">
                          Will add{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {pendingRestoreInspection.inspection.mergeImpact.newAnimalsToAdd}
                          </strong>{' '}
                          new animal(s) &amp;{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {pendingRestoreInspection.inspection.mergeImpact.newPhotosToAdd}
                          </strong>{' '}
                          new photo(s), while matching{' '}
                          {pendingRestoreInspection.inspection.mergeImpact.existingAnimalsMatched}{' '}
                          existing animal(s) and{' '}
                          {pendingRestoreInspection.inspection.mergeImpact.existingPhotosMatched}{' '}
                          photo(s).
                        </p>
                      </div>
                    )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={restoreCommitLock.isSubmitting}
                      aria-busy={restoreCommitLock.isSubmitting}
                      onClick={() => void handleConfirmPendingRestore()}
                      className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 ${
                        pendingRestoreInspection.mode === 'replace'
                          ? 'bg-[var(--barn-terracotta)] text-white'
                          : 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      }`}
                    >
                      {restoreCommitLock.isSubmitting && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      )}
                      {restoreCommitLock.isSubmitting
                        ? 'Applying Restore...'
                        : pendingRestoreInspection.mode === 'replace'
                        ? 'Confirm & Replace Barn Data'
                        : 'Confirm & Merge Into Barn'}
                    </button>
                    <button
                      type="button"
                      disabled={restoreCommitLock.isSubmitting}
                      onClick={() => setPendingRestoreInspection(null)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <DiagnosticsAndSupportPanel
            snapshot={snapshot}
            deviceCapability={deviceCapability}
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

          {/* Global Data Deletion & Factory Settings Restore */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Global Data Reset &amp; Factory Restore
              </h3>
              <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                Per-species testing data and delete controls live at the bottom of each species hub.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 max-w-md">
                  <div className="text-xs font-semibold text-[var(--barn-ink)]">
                    Delete All Animal Data ({snapshot.animals.length} animals · {totalBarnRecords}{' '}
                    total records)
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Wipes all animals, photos, breedings, cages, chores, care logs, and shows across
                    every species, while keeping your barn settings and species schedules.
                  </p>
                </div>

                {!confirmGlobalDeleteAll && (
                  <button
                    type="button"
                    disabled={totalBarnRecords === 0}
                    onClick={() => {
                      setConfirmFactoryRestore(false);
                      setConfirmGlobalDeleteAll(true);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Delete All Animal Data
                  </button>
                )}
              </div>

              {confirmGlobalDeleteAll && (
                <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap items-center gap-2">
                  {onSaveManualOpfsVaultBackup && (
                    <button
                      type="button"
                      onClick={() =>
                        void onSaveManualOpfsVaultBackup('Pre-reset snapshot before deleting all animal data')
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Save Pre-Reset Vault Snapshot
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadTimestampedFullBackup}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Download Timestamped Backup First
                  </button>
                  <button
                    type="button"
                    disabled={destructiveResetLock.isSubmitting}
                    aria-busy={destructiveResetLock.isSubmitting}
                    onClick={() =>
                      void destructiveResetLock.runLocked(async () => {
                        await onClearAllRecords();
                        setConfirmGlobalDeleteAll(false);
                      })
                    }
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-65"
                  >
                    {destructiveResetLock.isSubmitting && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {destructiveResetLock.isSubmitting
                      ? 'Deleting...'
                      : 'Confirm Delete All Animal Data'}
                  </button>
                  <button
                    type="button"
                    disabled={destructiveResetLock.isSubmitting}
                    onClick={() => setConfirmGlobalDeleteAll(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 max-w-md">
                  <div className="text-xs font-semibold text-[var(--barn-ink)]">
                    Restore App to Factory Settings &amp; Data
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Resets barn name, preferences, custom colors, and species list back to factory
                    defaults and reloads starter sample herds.
                  </p>
                </div>

                {!confirmFactoryRestore && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmGlobalDeleteAll(false);
                      setConfirmFactoryRestore(true);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-semibold text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Restore Factory Settings &amp; Data
                  </button>
                )}
              </div>

              {confirmFactoryRestore && (
                <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap items-center gap-2">
                  {onSaveManualOpfsVaultBackup && (
                    <button
                      type="button"
                      onClick={() =>
                        void onSaveManualOpfsVaultBackup('Pre-reset snapshot before factory restore')
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <HardDrive className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      Save Pre-Reset Vault Snapshot
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadTimestampedFullBackup}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Download Timestamped Backup First
                  </button>
                  <button
                    type="button"
                    disabled={destructiveResetLock.isSubmitting}
                    aria-busy={destructiveResetLock.isSubmitting}
                    onClick={() =>
                      void destructiveResetLock.runLocked(async () => {
                        await onRestoreFactoryDefaults();
                        setConfirmFactoryRestore(false);
                      })
                    }
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-65"
                  >
                    {destructiveResetLock.isSubmitting && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    )}
                    {destructiveResetLock.isSubmitting
                      ? 'Restoring...'
                      : 'Confirm Factory Restore'}
                  </button>
                  <button
                    type="button"
                    disabled={destructiveResetLock.isSubmitting}
                    onClick={() => setConfirmFactoryRestore(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-[var(--barn-muted)]">
                Want sample herds back without resetting your custom colors or barn name?
              </span>
              <button
                type="button"
                disabled={destructiveResetLock.isSubmitting}
                onClick={() =>
                  void destructiveResetLock.runLocked(() => onSeedAllSpecies())
                }
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap shrink-0 disabled:opacity-55"
              >
                Reload 9 Sample Herds Only
              </button>
            </div>
          </section>

          {/* Non-intrusive Help & Keyboard Shortcuts Footer */}
          <footer className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-5 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-[var(--barn-muted)]">
                Need quick screen navigation or modal keyboard controls?
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutHelp((prev) => !prev)}
                aria-expanded={showShortcutHelp}
                aria-controls="settings-keyboard-shortcuts-panel"
                className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium text-[var(--barn-ink)] inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                {showShortcutHelp ? 'Hide Help & Shortcuts' : 'Help · Keyboard Shortcuts'}
              </button>
            </div>

            {showShortcutHelp && (
              <div
                id="settings-keyboard-shortcuts-panel"
                className="border-t border-[var(--barn-border)] pt-3 space-y-2 text-xs"
              >
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Active navigation keys (active when not typing in a field or dialog):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    { key: 'H', label: 'All Species Home' },
                    { key: 'D', label: 'Species Dashboard' },
                    { key: 'R', label: 'Herd Registry (or Picker on Home)' },
                    { key: 'B', label: 'Breeding Lab' },
                    { key: 'P', label: 'Pedigree Explorer' },
                    { key: 'O', label: 'Reports' },
                    { key: 'S', label: 'Import & Settings' },
                    { key: '?', label: 'Quick Shortcuts Help Dialog' },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                    >
                      <span className="text-[var(--barn-ink)] font-medium">{item.label}</span>
                      <kbd className="px-2 py-0.5 rounded bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] font-semibold shrink-0">
                        {item.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </footer>
        </div>
      </div>

      {showCustomSpeciesModal && (
        <SpeciesEditorModal
          initialProfile={null}
          existingNames={speciesProfiles.map((sp) => sp.name)}
          onSave={onSaveSpecies}
          onDelete={onDeleteSpecies}
          onDownloadTimestampedBackup={onDownloadTimestampedSpeciesBackup}
          onClose={() => setShowCustomSpeciesModal(false)}
        />
      )}

      <ArchivedHerdsModal
        isOpen={showArchivedHerdsModal}
        opfsSupported={opfsSupported}
        archives={archivedHerdBundles}
        autoOffloadEnabled={Boolean(settings.autoOffloadRetiredToOpfs)}
        onToggleAutoOffload={(enabled) =>
          onUpdateSettings({ autoOffloadRetiredToOpfs: enabled }, { silent: true })
        }
        onRestoreArchive={async (archiveKey, opts) => {
          if (onRestoreArchivedHerdBundle) {
            await onRestoreArchivedHerdBundle(archiveKey, opts);
          }
        }}
        onDownloadArchive={async (archiveKey) => {
          if (onDownloadArchivedHerdBundle) {
            await onDownloadArchivedHerdBundle(archiveKey);
          }
        }}
        onDeleteArchive={async (archiveKey) => {
          if (onDeleteArchivedHerdBundle) {
            await onDeleteArchivedHerdBundle(archiveKey);
          }
        }}
        onClose={() => setShowArchivedHerdsModal(false)}
      />
    </div>
  );
}
