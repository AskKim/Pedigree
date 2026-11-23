/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Barn Preferences, Calendar Integration, Appearance Studio & Backup/Tool Launchers (`Settings`).
 * Links directly to the consolidated Import/Export Hub (`ImportExportHubScreen`) and the
 * lazy-loaded Developer & Troubleshooting console ("The Techy Stuff").
 */

import {
  ArrowLeftRight,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Database,
  Download,
  FolderSync,
  HardDrive,
  HeartPulse,
  HelpCircle,
  Image as ImageIcon,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sun,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { BackupStatusEvaluation } from '../core/backupStatus';
import { VaultBackupMetadata } from '../core/backupVault';
import { CALENDAR_ALARM_LEAD_OPTIONS } from '../core/calendarExport';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  IMAGE_OPTIMIZATION_PRESETS,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import {
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
import {
  formatTimestampedBackupSlug,
  generateBarnBackupJsonChunks,
} from '../core/syncAndExports';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  WARM_THEME_PRESETS,
} from '../core/themePalette';
import { sanitizeSafeRasterImageDataUrl } from '../core/inputSanitization';
import { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import {
  RollingBackupMeta,
  StorageProtectionStatus,
  usePWAInstall,
} from '../storage/storageProtection';
import type { GoogleCalendarOption } from '../utils/googleCalendarClient';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextChunks } from '../utils/webFileActions';
import { DeviceCapabilityCard } from './DeviceCapabilityCard';
import { ImageCompressionNotice } from './ImageCompressionNotice';
import type { ImportExportHubSection } from './ImportExportHubScreen';
import { SpeciesEditorModal } from './SpeciesEditorModal';
import { CLOUD_SYNC_PROVIDER_DESCRIPTORS } from '../core/cloudAppFolderSync';
import type {
  CloudSyncClientState,
  RunCloudAppFolderSyncResult,
} from '../storage/cloudAppFolderSync';

interface SettingsAndSyncScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  storageStatus: StorageProtectionStatus | null;
  backupStatus: BackupStatusEvaluation | null;
  openAddSpeciesOnMount: boolean;
  onConsumedOpenAddSpecies: () => void;
  recordBackupExport: (
    format: 'zip' | 'sqlite' | 'json',
    fileName?: string
  ) => Promise<void> | void;
  onUpdateSettings: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
  onSaveSpecies: (profile: SpeciesProfile) => Promise<boolean | void> | void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onDownloadTimestampedSpeciesBackup: (speciesName: string) => Promise<void> | void;
  onExportTasksToCalendar?: (tasks: BarnTask[], filenameHint?: string) => number;
  googleAuthConnected?: boolean;
  googleUserEmail?: string | null;
  googleCalendars?: GoogleCalendarOption[];
  googleSyncBusy?: boolean;
  onConnectGoogleCalendar?: () => Promise<boolean>;
  onDisconnectGoogleCalendar?: () => Promise<void>;
  onRefreshGoogleCalendars?: () => Promise<void>;
  deviceCapability?: DeviceCapabilityController;
  onHydrateSnapshotForExport?: (
    targetSnapshot?: BarnDatabaseSnapshot,
    filterSpecies?: string
  ) => Promise<BarnDatabaseSnapshot>;
  opfsSupported?: boolean;
  opfsVaultBackups?: VaultBackupMetadata[];
  rollingBackups?: RollingBackupMeta[];
  onOpenImportExportHub?: (section?: ImportExportHubSection) => void;
  onOpenTechyStuff?: () => void;
  onOpenHealthReference?: (section?: 'all' | 'wikis' | 'pdfs') => void;
  cloudSyncState?: CloudSyncClientState | null;
  cloudSyncBusy?: boolean;
  onResetAndRetryCloudSync?: () => Promise<RunCloudAppFolderSyncResult>;
}

export function SettingsAndSyncScreen({
  snapshot,
  activeSpeciesName,
  storageStatus,
  backupStatus,
  openAddSpeciesOnMount,
  onConsumedOpenAddSpecies,
  recordBackupExport,
  onUpdateSettings,
  onSaveSpecies,
  onDeleteSpecies,
  onDownloadTimestampedSpeciesBackup,
  onExportTasksToCalendar,
  googleAuthConnected = false,
  googleUserEmail = null,
  googleCalendars = [],
  googleSyncBusy = false,
  onConnectGoogleCalendar,
  onDisconnectGoogleCalendar,
  onRefreshGoogleCalendars,
  deviceCapability,
  onHydrateSnapshotForExport,
  opfsSupported = false,
  opfsVaultBackups = [],
  rollingBackups = [],
  onOpenImportExportHub,
  onOpenTechyStuff,
  onOpenHealthReference,
  cloudSyncState = null,
  cloudSyncBusy = false,
  onResetAndRetryCloudSync,
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
  const [breederEmail, setBreederEmail] = useState(settings.breederEmail || '');
  const [breederPhone, setBreederPhone] = useState(settings.breederPhone || '');
  const [breederLocation, setBreederLocation] = useState(settings.breederLocation || '');
  const [breederWebsite, setBreederWebsite] = useState(settings.breederWebsite || '');
  const [showcaseTagline, setShowcaseTagline] = useState(settings.showcaseTagline || '');
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
  const [breederLogoDataUrl, setBreederLogoDataUrl] = useState<string>(
    sanitizeSafeRasterImageDataUrl(settings.breederLogoDataUrl)
  );
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [autoOffloadRetiredToOpfs, setAutoOffloadRetiredToOpfs] = useState<boolean>(
    Boolean(settings.autoOffloadRetiredToOpfs)
  );
  const [enableJudgeNotebook, setEnableJudgeNotebook] = useState<boolean>(
    Boolean(settings.enableJudgeNotebook)
  );

  const [quickBackupFeedback, setQuickBackupFeedback] = useState<string | null>(null);
  const [quickBackupError, setQuickBackupError] = useState<string | null>(null);
  const [showCustomSpeciesModal, setShowCustomSpeciesModal] = useState(false);
  const [zipExportBusy, setZipExportBusy] = useState<'json' | null>(null);

  const archiveExportLock = useAsyncSubmitLock();
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();

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
    setBreederLogoDataUrl(sanitizeSafeRasterImageDataUrl(settings.breederLogoDataUrl));
    setAutoOffloadRetiredToOpfs(Boolean(settings.autoOffloadRetiredToOpfs));
    setEnableJudgeNotebook(Boolean(settings.enableJudgeNotebook));
  }, [settings]);

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
      breederEmail: breederEmail.trim() || undefined,
      breederPhone: breederPhone.trim() || undefined,
      breederLocation: breederLocation.trim() || undefined,
      breederWebsite: breederWebsite.trim() || undefined,
      showcaseTagline: showcaseTagline.trim() || undefined,
      preferredUnit,
      currencyCode: normalizeCurrencyCode(currencyCode, 'USD'),
      defaultSpecies,
      pinnedLandingSpecies,
      defaultGenerations,
      imageOptimizationPreset,
      showHomeSummaryGrid,
      includePhotoOnPedigree,
      breederLogoDataUrl: breederLogoDataUrl || undefined,
      autoOffloadRetiredToOpfs,
      enableJudgeNotebook,
    });
  };

  const handleUploadBreederLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const optimized = await optimizeImageFile(file, 'compact');
      const nextUrl = sanitizeSafeRasterImageDataUrl(
        optimized.thumbnailDataUrl || optimized.dataUrl
      );
      if (!nextUrl) {
        throw new Error('Could not process the selected logo image.');
      }
      setBreederLogoDataUrl(nextUrl);
      onUpdateSettings({ breederLogoDataUrl: nextUrl }, { silent: true });
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Could not optimize logo image.');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleClearBreederLogo = () => {
    setLogoError(null);
    setBreederLogoDataUrl('');
    onUpdateSettings({ breederLogoDataUrl: undefined }, { silent: true });
  };

  const handleDownloadTimestampedFullBackup = async () => {
    await archiveExportLock.runLocked(async () => {
      setQuickBackupError(null);
      setQuickBackupFeedback(null);
      setZipExportBusy('json');
      try {
        const exportSnapshot = onHydrateSnapshotForExport
          ? await onHydrateSnapshotForExport(snapshot)
          : snapshot;
        const stampSlug = formatTimestampedBackupSlug();
        const filename = `community-pedigree-full-backup-${stampSlug}.json`;
        await downloadTextChunks(
          filename,
          generateBarnBackupJsonChunks(exportSnapshot),
          'application/json'
        );
        void recordBackupExport('json', filename);
        setQuickBackupFeedback(
          `Saved timestamped JSON backup ${filename} (${exportSnapshot.animals.length} animals).`
        );
      } catch (err) {
        setQuickBackupError(
          err instanceof Error ? err.message : 'Could not prepare JSON backup.'
        );
      } finally {
        setZipExportBusy(null);
      }
    });
  };

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
                  Breeder Name (for Pedigrees &amp; Showcase)
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

            {/* Optional Breeder Contact Details for Zero-Server For-Sale Showcase */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div>
                <div className="text-xs font-semibold text-[var(--barn-ink)]">
                  Breeder Showcase Contact &amp; Storefront Header (Optional)
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Included on exported Zero-Server For-Sale HTML Catalogs so buyers can inquire directly.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-breederEmail`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Inquiry Email
                  </label>
                  <input
                    id={`${baseId}-breederEmail`}
                    type="email"
                    placeholder="breeder@example.com"
                    value={breederEmail}
                    onChange={(e) => setBreederEmail(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-breederPhone`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Phone / Text
                  </label>
                  <input
                    id={`${baseId}-breederPhone`}
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={breederPhone}
                    onChange={(e) => setBreederPhone(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-breederLocation`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    City / State / Region
                  </label>
                  <input
                    id={`${baseId}-breederLocation`}
                    type="text"
                    placeholder="e.g. Willamette Valley, OR"
                    value={breederLocation}
                    onChange={(e) => setBreederLocation(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-breederWebsite`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Website / Social Link
                  </label>
                  <input
                    id={`${baseId}-breederWebsite`}
                    type="text"
                    placeholder="https://myrabbitry.github.io"
                    value={breederWebsite}
                    onChange={(e) => setBreederWebsite(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-showcaseTagline`}
                  className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                >
                  Showcase Tagline / Pickup Terms
                </label>
                <input
                  id={`${baseId}-showcaseTagline`}
                  type="text"
                  placeholder="e.g. ARBA-registered Satin & Holland Lop breeding stock · Local pickup & show transport available"
                  value={showcaseTagline}
                  onChange={(e) => setShowcaseTagline(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                />
              </div>
            </div>

            {/* Optional Barn / Rabbitry Logo for Printed Pedigrees */}
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {breederLogoDataUrl ? (
                    <img
                      src={breederLogoDataUrl}
                      alt={`${barnName || 'Barn'} logo`}
                      className="h-11 max-w-[110px] w-auto object-contain rounded-lg border border-[var(--barn-border)] bg-white p-1 shrink-0"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-lg border border-dashed border-[var(--barn-border)] bg-[var(--barn-surface)] flex items-center justify-center shrink-0 text-[var(--barn-muted)]">
                      <ImageIcon className="w-5 h-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--barn-ink)]">
                      Barn / Rabbitry Logo (Pedigree Header)
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">
                      Optional raster logo (PNG/JPG/WebP) printed next to your barn title on formal pedigrees &amp; PDFs.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleUploadBreederLogo}
                    className="sr-only"
                    aria-label="Upload barn or rabbitry logo"
                  />
                  <button
                    type="button"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                    {logoUploading ? 'Optimizing...' : breederLogoDataUrl ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {breederLogoDataUrl && (
                    <button
                      type="button"
                      onClick={handleClearBreederLogo}
                      aria-label="Remove barn logo"
                      className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-danger)]/10 text-xs font-medium text-[var(--barn-danger)] inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {logoError && (
                <p role="alert" className="text-[11px] text-[var(--barn-danger)]">
                  {logoError}
                </p>
              )}
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
                    <code className="font-mono">/archives</code> to improve device memory while
                    preserving all data
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableJudgeNotebook}
                    onChange={(e) => setEnableJudgeNotebook(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>
                    Enable The Judge&apos;s Notebook (optional show judge bids, contracts, club
                    directory &amp; travel expenses module)
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
                      title: 'Google Calendar Web Links + .ICS Fallback',
                      desc: 'Preview chores with quick Google Calendar / Outlook Web event links when online, and automatically fall back to offline .ICS downloads.',
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
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-[var(--barn-muted)]">
                        Direct Google account sign-in is disabled so Community Pedigree stays 100%
                        cloud- and Firebase-free. Single chores open quick Google/Outlook Web event
                        links when online, and all chores export cleanly as offline .ICS files.
                      </div>
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

          {/* Routine Home Screen Install CTA */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <Smartphone className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
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
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
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
            ) : (
              <p className="text-[11px] text-[var(--barn-muted)]">
                Running in standalone offline PWA mode. Advanced storage locks, connectivity tests,
                and release gates live inside <strong>The Techy Stuff</strong>.
              </p>
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

        {/* Right 6 Columns: Import/Export Hub Launcher, Diagnostics & Reset Controls */}
        <div className="lg:col-span-6 space-y-6">
          {/* Consolidated Import/Export Hub Summary & Direct Section Launchers */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Import, Export &amp; Backup Hub
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  All system backups, native restores, zero-cloud peer sync, external importers
                  (HerdBoss, Evans .HTM, CSV), and non-native exporters live in one dedicated workspace.
                </p>
              </div>
              <ArrowLeftRight
                className="w-5 h-5 text-[var(--barn-sage)] shrink-0"
                aria-hidden="true"
              />
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
                  <span className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
                    {opfsVaultBackups.length + rollingBackups.length} local vault snapshot
                    {opfsVaultBackups.length + rollingBackups.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)]">
                  Last export: {backupStatus.lastExportLabel} · Latest change:{' '}
                  {backupStatus.latestChangeLabel}
                </p>
              </div>
            )}

            {cloudSyncState && cloudSyncState.circuitBreaker.tripped && (
              <div
                role="alert"
                className="p-3 rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-xs space-y-2"
              >
                <div className="font-semibold text-[var(--barn-ink)]">
                  Optional Cloud Sync Paused (HTTP {cloudSyncState.circuitBreaker.statusCode ?? '403/507'} Quota)
                </div>
                <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                  {cloudSyncState.circuitBreaker.reason} Local IndexedDB saves remain unaffected.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {onOpenImportExportHub && (
                    <button
                      type="button"
                      onClick={() => onOpenImportExportHub('sync')}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
                    >
                      Review Cloud App-Folder Sync
                    </button>
                  )}
                  {onResetAndRetryCloudSync && (
                    <button
                      type="button"
                      disabled={cloudSyncBusy}
                      onClick={() => void onResetAndRetryCloudSync()}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold disabled:opacity-55"
                    >
                      Reset Breaker &amp; Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            {cloudSyncState && !cloudSyncState.circuitBreaker.tripped && cloudSyncState.settings.enabled && (
              <div className="p-3 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-[var(--barn-ink)]">
                  Cloud App-Folder ({CLOUD_SYNC_PROVIDER_DESCRIPTORS[cloudSyncState.settings.provider].label}):{' '}
                  {cloudSyncState.hasMemoryTokenByProvider[cloudSyncState.settings.provider]
                    ? 'Memory token connected'
                    : 'Not connected'}
                </span>
                {onOpenImportExportHub && (
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('sync')}
                    className="text-[11px] font-semibold text-[var(--barn-sage)] underline"
                  >
                    Configure Cloud Sync
                  </button>
                )}
              </div>
            )}

            {quickBackupError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
              >
                {quickBackupError}
              </div>
            )}

            {quickBackupFeedback && !quickBackupError && (
              <div
                role="status"
                aria-live="polite"
                className="p-2.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs"
              >
                {quickBackupFeedback}
              </div>
            )}

            {onOpenImportExportHub && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('all')}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95"
                  >
                    <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
                    Open Import / Export Hub
                  </button>

                  <button
                    type="button"
                    disabled={zipExportBusy !== null || archiveExportLock.isSubmitting}
                    onClick={handleDownloadTimestampedFullBackup}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <Download className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                    {zipExportBusy === 'json' ? 'Preparing JSON...' : 'Download Quick JSON Backup'}
                  </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('sync')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-sage)]/45 bg-[var(--barn-sage-tint)]/35 hover:bg-[var(--barn-sage-tint)]/60 text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">Sync / Multi-Device</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('backup')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Database className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">System Backup</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('imports')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">Imports</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenImportExportHub('exporters')}
                    className="min-h-[44px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                    <span className="truncate">Exporters</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Health Reference Wikis & Local Veterinary PDF Folder */}
          {onOpenHealthReference && (
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    Health Reference Wikis &amp; Local Vet PDF Folder
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Curated online species health references plus a read-only local device folder
                    pointer for offline veterinary PDFs and external folder backup reminders.
                  </p>
                </div>
                <HeartPulse className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              </div>

              <button
                type="button"
                onClick={() => onOpenHealthReference('all')}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <HeartPulse className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                Open Health Wikis &amp; Veterinary PDF Folder
              </button>
            </section>
          )}

          {/* Developer & Troubleshooting Page Launcher ("The Techy Stuff") */}
          {onOpenTechyStuff && (
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    The Techy Stuff (Developer &amp; Troubleshooting)
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Isolated troubleshooting workspace for advanced diagnostics, memory/tier
                    hierarchy guidelines, OPFS &amp; IndexedDB quota checks, connectivity probes,
                    release gates, and safeguarded resets.
                  </p>
                </div>
                <Terminal className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              </div>

              <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-muted)] leading-relaxed">
                Includes permanent Tier/Memory Hierarchy documentation, Crash &amp; Heap Logs,
                Bug Report .ZIP Bundler, DB Health Auto-Repair, Photo Footprint Pruner, Cache Purge,
                and Factory/Sync Reset safeguards.
              </div>

              <button
                type="button"
                onClick={onOpenTechyStuff}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]/55 hover:bg-[var(--barn-sage-tint)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Terminal className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                Open &ldquo;The Techy Stuff&rdquo; Developer Console
              </button>
            </section>
          )}

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
                    { key: 'G', label: "The Judge's Notebook" },
                    { key: 'O', label: 'Reports' },
                    { key: 'I', label: 'Import / Export Hub' },
                    { key: 'S', label: 'Settings' },
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
    </div>
  );
}
