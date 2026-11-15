/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barn Preferences, Appearance Studio, PWA Storage Protection, Multi-Worker Local Sync,
 * Custom Livestock, External Platform Importers & Global Reset Screen (`Settings`).
 */

import {
  Archive,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Database,
  Download,
  FolderSync,
  HardDrive,
  Images,
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
  Upload,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import {
  buildCompleteBackupZipArchive,
  buildPhotosOnlyZipArchive,
} from '../core/backupArchive';
import { BackupStatusEvaluation } from '../core/backupStatus';
import { CALENDAR_ALARM_LEAD_OPTIONS } from '../core/calendarExport';
import {
  BarnHealthRepairResult,
  BarnHealthReport,
} from '../core/dataHealthCheck';
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
  SpeciesProfile,
  WeightUnit,
} from '../core/models';
import {
  buildPdfReadyBarnSnapshot,
  exportAnimalsCsv,
  exportBarnBackupJson,
  formatTimestampedBackupSlug,
} from '../core/syncAndExports';
import { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  WARM_THEME_PRESETS,
} from '../core/themePalette';
import {
  parseDeltaFileJson,
  shareOrDownloadFile,
  supportsDirectoryPicker,
  syncWithPickedDirectory,
} from '../storage/localSyncChannels';
import {
  listRollingSnapshotBackups,
  RollingBackupMeta,
  StorageProtectionStatus,
  usePWAInstall,
} from '../storage/storageProtection';
import { downloadBinaryFile, downloadTextFile } from '../utils/webFileActions';
import type { GoogleCalendarOption } from '../utils/googleCalendarClient';
import { SignInWithGoogleButton } from './CalendarIntegrationModals';
import { DiagnosticsAndSupportPanel } from './DiagnosticsAndSupportPanel';
import { ExternalImporterPanel } from './ExternalImporterPanel';
import { ImageCompressionNotice } from './ImageCompressionNotice';
import { SpeciesEditorModal } from './SpeciesEditorModal';

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
  onSaveSpecies: (profile: SpeciesProfile) => void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onDownloadTimestampedSpeciesBackup: (speciesName: string) => void;
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
  onImportSqliteBytes: (bytes: Uint8Array) => Promise<void>;
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
  onSeedAllSpecies: () => void;
  onClearAllRecords: () => void;
  onRestoreFactoryDefaults: () => void;
  onExportTasksToCalendar?: (tasks: BarnTask[], filenameHint?: string) => number;
  googleAuthConnected?: boolean;
  googleUserEmail?: string | null;
  googleCalendars?: GoogleCalendarOption[];
  googleSyncBusy?: boolean;
  onConnectGoogleCalendar?: () => Promise<boolean>;
  onDisconnectGoogleCalendar?: () => Promise<void>;
  onRefreshGoogleCalendars?: () => Promise<void>;
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
  onImportSqliteBytes,
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
}: SettingsAndSyncScreenProps) {
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
  const [defaultSpecies, setDefaultSpecies] = useState(settings.defaultSpecies);
  const [pinnedLandingSpecies, setPinnedLandingSpecies] = useState(settings.pinnedLandingSpecies);
  const [defaultGenerations, setDefaultGenerations] = useState<3 | 4 | 5 | 6>(
    settings.defaultGenerations
  );
  const [imageOptimizationPreset, setImageOptimizationPreset] =
    useState<ImageOptimizationPresetId>(settings.imageOptimizationPreset || 'balanced');
  const [showHomeSummaryGrid, setShowHomeSummaryGrid] = useState<boolean>(
    settings.showHomeSummaryGrid !== false
  );
  const [includePhotoOnPedigree, setIncludePhotoOnPedigree] = useState<boolean>(
    Boolean(settings.includePhotoOnPedigree)
  );

  const [confirmGlobalDeleteAll, setConfirmGlobalDeleteAll] = useState(false);
  const [confirmFactoryRestore, setConfirmFactoryRestore] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [portabilityFeedback, setPortabilityFeedback] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showCustomSpeciesModal, setShowCustomSpeciesModal] = useState(false);
  const [rollingBackups, setRollingBackups] = useState<RollingBackupMeta[]>([]);
  const [folderSyncBusy, setFolderSyncBusy] = useState(false);

  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();

  useEffect(() => {
    if (openAddSpeciesOnMount) {
      setShowCustomSpeciesModal(true);
      onConsumedOpenAddSpecies();
    }
  }, [openAddSpeciesOnMount, onConsumedOpenAddSpecies]);

  useEffect(() => {
    let active = true;
    listRollingSnapshotBackups().then((items) => {
      if (active) setRollingBackups(items);
    });
    return () => {
      active = false;
    };
  }, [
    snapshot.animals.length,
    snapshot.animalPhotos?.length,
    snapshot.breedings.length,
    snapshot.speciesProfiles.length,
  ]);

  useEffect(() => {
    setBarnName(settings.barnName);
    setBreederName(settings.breederName);
    setPreferredUnit(settings.preferredUnit);
    setDefaultSpecies(settings.defaultSpecies);
    setPinnedLandingSpecies(settings.pinnedLandingSpecies);
    setDefaultGenerations(settings.defaultGenerations);
    setImageOptimizationPreset(settings.imageOptimizationPreset || 'balanced');
    setShowHomeSummaryGrid(settings.showHomeSummaryGrid !== false);
    setIncludePhotoOnPedigree(Boolean(settings.includePhotoOnPedigree));
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
      defaultSpecies,
      pinnedLandingSpecies,
      defaultGenerations,
      imageOptimizationPreset,
      showHomeSummaryGrid,
      includePhotoOnPedigree,
    });
  };

  const handleDownloadTimestampedFullBackup = () => {
    const stampSlug = formatTimestampedBackupSlug();
    const filename = `community-pedigree-full-backup-${stampSlug}.json`;
    downloadTextFile(filename, exportBarnBackupJson(snapshot), 'application/json');
    void recordBackupExport('json', filename);
    setPortabilityFeedback(
      `Downloaded JSON backup (${snapshot.animals.length} animals, ${allPhotos.length} embedded photos).`
    );
  };

  const handleDownloadCompleteZip = () => {
    setImportError(null);
    const stampSlug = formatTimestampedBackupSlug();
    const archive = buildCompleteBackupZipArchive(snapshot);
    const filename = `community-pedigree-archive-${stampSlug}.zip`;
    downloadBinaryFile(filename, archive.bytes, 'application/zip');
    void recordBackupExport('zip', filename);
    setPortabilityFeedback(
      `Saved ${filename} (${archive.animalCount} animals · ${archive.photoCount} photo files · ${formatByteSizePure(archive.bytes.byteLength)}).`
    );
  };

  const handleDownloadPhotosOnlyZip = () => {
    setImportError(null);
    if (allPhotos.length === 0) {
      setImportError('No animal photos stored yet to archive.');
      return;
    }
    const stampSlug = formatTimestampedBackupSlug();
    const archive = buildPhotosOnlyZipArchive(snapshot);
    const filename = `community-pedigree-photos-${stampSlug}.zip`;
    downloadBinaryFile(filename, archive.bytes, 'application/zip');
    setPortabilityFeedback(
      `Saved ${filename} (${archive.photoCount} organized image files across ${archive.animalCount} animals · ${formatByteSizePure(archive.bytes.byteLength)}).`
    );
  };

  const handleBackupArchiveUpload = async (
    file: File | undefined,
    mode: 'merge' | 'replace'
  ) => {
    if (!file) return;
    setImportError(null);
    setPortabilityFeedback(null);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json') && !lower.endsWith('.zip')) {
        const text = await file.text();
        await onImportJson(text, mode);
        setPortabilityFeedback(
          `${mode === 'replace' ? 'Restored' : 'Merged'} JSON backup "${file.name}".`
        );
      } else {
        const buf = await file.arrayBuffer();
        await onImportBackupArchive(new Uint8Array(buf), file.name, mode);
        setPortabilityFeedback(
          `${mode === 'replace' ? 'Restored' : 'Merged'} archive "${file.name}".`
        );
      }
    } catch (err: any) {
      setImportError(err?.message || 'Could not parse backup (.JSON or .ZIP) file.');
    }
  };

  const handleSqliteUpload = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const buf = await file.arrayBuffer();
      await onImportSqliteBytes(new Uint8Array(buf));
    } catch (err: any) {
      setImportError(err?.message || 'Could not load database file.');
    }
  };

  const handleDeltaFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportError(null);
    setSyncFeedback(null);
    try {
      const combinedOps: SyncOperation[] = [];
      for (const file of Array.from(files)) {
        const text = await file.text();
        combinedOps.push(...parseDeltaFileJson(text));
      }
      await onImportDeltaOperations(combinedOps);
      setSyncFeedback(
        `Processed ${combinedOps.length} operation(s) across ${files.length} delta file(s).`
      );
    } catch (err: any) {
      setImportError(err?.message || 'Could not parse delta sync JSON file.');
    }
  };

  const handleDirectorySync = async () => {
    setImportError(null);
    setSyncFeedback(null);
    setFolderSyncBusy(true);
    try {
      const res = await syncWithPickedDirectory({
        deviceId,
        localOperations: syncOperations,
        masterBackupJson: exportBarnBackupJson(snapshot),
      });
      if (res.incomingOps.length > 0) {
        await onImportDeltaOperations(res.incomingOps);
      }
      setSyncFeedback(
        `Synced folder "${res.folderName}": read ${res.peerFilesRead} peer delta file(s) and wrote delta_${deviceId}.json.`
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setImportError(err?.message || 'Local folder sync could not complete.');
      }
    } finally {
      setFolderSyncBusy(false);
    }
  };

  const handleDownloadSqlite = async () => {
    const bytes = await onExportSqliteBytes();
    if (!bytes) {
      setImportError('Raw SQLite binary export is unavailable in fallback mode.');
      return;
    }
    const stamp = formatTimestampedBackupSlug();
    const filename = `community-pedigree-${stamp}.sqlite`;
    downloadBinaryFile(filename, bytes, 'application/x-sqlite3');
    void recordBackupExport('sqlite', filename);
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
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Barn / Rabbitry / Farm Name
                </label>
                <input
                  type="text"
                  value={barnName}
                  onChange={(e) => setBarnName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Breeder Name (for Pedigrees)
                </label>
                <input
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.values(IMAGE_OPTIMIZATION_PRESETS).map((preset) => {
                  const active = imageOptimizationPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
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
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Pinned Startup Landing Page
              </label>
              <select
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
                  Weight Display Unit
                </span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['lbs_oz', 'Pounds & Oz'],
                      ['lbs', 'Decimal Pounds'],
                      ['grams', 'Grams (Metric)'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                    Default Species
                  </label>
                  <select
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
                  <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                    Default Pedigree Depth
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([3, 4, 5, 6] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
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
                  <span>Show condensed 4-square summary strip on the Home page</span>
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
                    Uncheck to exclude animal names completely and show Ear Tattoo / Tag ID instead.
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
                    onClick={() => void onRequestPersistentStorage()}
                    className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                  >
                    Lock Persistent Storage
                  </button>
                )}
              </div>

              {storageStatus && storageStatus.quotaBytes > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    <span>Used: {formatByteSizePure(storageStatus.usageBytes)}</span>
                    <span>
                      Available Quota: {formatByteSizePure(storageStatus.quotaBytes)} (
                      {storageStatus.percentUsed}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden">
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

            {/* Rolling Local Snapshot Backups */}
            {rollingBackups.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--barn-muted)]">
                  Automatic Rolling Local Snapshots (Last {rollingBackups.length})
                </div>
                <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
                  {rollingBackups.map((rb) => (
                    <div
                      key={rb.key}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 font-mono text-[11px]">
                        <div className="truncate font-semibold text-[var(--barn-ink)]">
                          {new Date(rb.savedAtIso).toLocaleString()}
                        </div>
                        <div className="text-[var(--barn-muted)] tabular-nums">
                          {rb.animalCount} animals · {rb.photoCount ?? 0} photos ·{' '}
                          {rb.speciesCount} species · {formatByteSizePure(rb.byteSize)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void onRestoreRollingBackup(rb.key)}
                        className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <div className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs">
                {syncFeedback}
              </div>
            )}

            <p className="text-xs text-[var(--barn-muted)]">
              Merge offline field edits across multiple farm workers without overwriting another
              worker&apos;s changes on a different field of the same animal.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  const delta = onBuildLocalDeltaJson();
                  const mode = await shareOrDownloadFile({
                    filename: delta.filename,
                    content: delta.content,
                    mimeType: 'application/json',
                    title: 'Community Pedigree Worker Delta Log',
                  });
                  setSyncFeedback(
                    mode === 'shared'
                      ? `Shared ${delta.filename} via native share sheet.`
                      : `Downloaded ${delta.filename} for SyncThing / local sharing.`
                  );
                }}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Share2 className="w-4 h-4" aria-hidden="true" />
                Share / Export Worker Delta
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
                onClick={() => deltaImportRef.current?.click()}
                className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                Merge Peer Delta Files (.JSON)
              </button>

              {supportsDirectoryPicker() && (
                <button
                  type="button"
                  disabled={folderSyncBusy}
                  onClick={() => void handleDirectorySync()}
                  className="sm:col-span-2 min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <FolderSync className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                  {folderSyncBusy
                    ? 'Syncing Local Folder...'
                    : 'Sync Directly With Local SyncThing / Shared Folder'}
                </button>
              )}
            </div>

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
                            onClick={() => void onResolveSyncConflict(c.conflict_id, 'winning')}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                          >
                            Keep Applied
                          </button>
                          <button
                            type="button"
                            onClick={() => void onResolveSyncConflict(c.conflict_id, 'losing')}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                          >
                            Use Alternate
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDismissSyncConflict(c.conflict_id)}
                            className="min-h-[30px] px-2 py-1 text-[11px] text-[var(--barn-muted)] underline"
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
              <div className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium">
                {importError}
              </div>
            )}

            {portabilityFeedback && !importError && (
              <div className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs">
                {portabilityFeedback}
              </div>
            )}

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-[var(--barn-muted)]">
                1-Click Timestamped Exports (Data + Organized Image Files)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadCompleteZip}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Archive className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Complete Archive + Photos (.ZIP)
                </button>

                <button
                  type="button"
                  disabled={allPhotos.length === 0}
                  onClick={handleDownloadPhotosOnlyZip}
                  title={
                    allPhotos.length === 0
                      ? 'Add photos to any animal first to export a photo folder archive'
                      : 'Download all animal images organized into species & animal folders (.ZIP)'
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-semibold hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:pointer-events-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Images className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                  Export Photos Folder ({allPhotos.length}) (.ZIP)
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSqlite}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Download Raw .SQLITE DB
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTimestampedFullBackup}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Timestamped Backup (.JSON)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `herd-all-species-${stamp}.csv`,
                      exportAnimalsCsv(
                        snapshot.animals,
                        snapshot.speciesProfiles,
                        settings,
                        undefined,
                        allPhotos
                      ),
                      'text/csv'
                    )
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Export All Animals (.CSV)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `barn-pdf-report-dto-${stamp}.json`,
                      JSON.stringify(buildPdfReadyBarnSnapshot(snapshot, activeSpeciesName), null, 2),
                      'application/json'
                    )
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Export {activeSpeciesName} Report (.JSON)
                </button>
              </div>
            </div>

            <div className="border-t border-[var(--barn-border)] pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-[var(--barn-muted)]">
                Restore &amp; Archive Merge (.ZIP, .JSON, or .SQLITE)
              </div>
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
                  onClick={() => mergeFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
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
                  onClick={() => replaceFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
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
                  onClick={() => sqliteFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
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
            </div>
          </section>

          <DiagnosticsAndSupportPanel
            snapshot={snapshot}
            onScanDatabaseHealth={onScanDatabaseHealth}
            onRepairDatabaseHealth={onRepairDatabaseHealth}
            onResetDatabaseConnection={onResetDatabaseConnection}
            onPurgeCorruptedCaches={onPurgeCorruptedCaches}
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
                    onClick={() => {
                      onClearAllRecords();
                      setConfirmGlobalDeleteAll(false);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-danger)] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Confirm Delete All Animal Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmGlobalDeleteAll(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs"
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
                    onClick={() => {
                      onRestoreFactoryDefaults();
                      setConfirmFactoryRestore(false);
                    }}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-danger)] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Confirm Factory Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmFactoryRestore(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs"
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
                onClick={onSeedAllSpecies}
                className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap shrink-0"
              >
                Reload 9 Sample Herds Only
              </button>
            </div>
          </section>
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
    </div>
  );
}
