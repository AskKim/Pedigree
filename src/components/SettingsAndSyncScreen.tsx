/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Barn Preferences, Calendar Integration, Appearance Studio & Backup/Tool Launchers (`Settings`).
 * Logically organized into modular subunits:
 * 1. Farm & Breeder Identity (Barn name, Breeder name, Logo, Contact & Address with 100% Local Privacy)
 * 2. Species & Workspace Setup (Default species, Custom species, Startup landing, Summary strip, Judge notebook)
 * 3. Units, Currency & Pedigree Standards (Weight units, Currency, Pedigree depth, Print photo toggle)
 * 4. Appearance & Color Studio (Theme mode, Warm presets, Custom color pickers)
 * 5. Calendar Integration & Task Alarms (Destination modes, Google calendar, Automated dispatch, Alarms)
 * 6. Device Storage, Quota & Image Compression (Storage meter, Compression presets, OPFS auto-offload, Device tier)
 * 7. Backup, Multi-Device Sync & Installation (Hub launcher, Sync preview, Health wikis, Smart PWA install)
 * 8. Help, Developer & System Resources (Direct links to Prompts, About, Developer console, Help guides, Shortcuts)
 */

import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  FolderSync,
  HardDrive,
  HeartPulse,
  HelpCircle,
  Image as ImageIcon,
  Info,
  LogOut,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { BackupStatusEvaluation } from '../domain/backupStatus';
import { VaultBackupMetadata } from '../domain/backupVault';
import {
  CALENDAR_ALARM_LEAD_OPTIONS,
  formatCalendarAlarmSummary,
} from '../domain/calendarExport';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  IMAGE_OPTIMIZATION_PRESETS,
  ImageOptimizationPresetId,
} from '../domain/imageOptimizationSpec';
import {
  BarnDatabaseSnapshot,
  BarnSettings,
  BarnTask,
  CalendarDeliveryMode,
  CalendarSyncSettings,
  normalizeCalendarAlarmList,
  normalizeCalendarSyncSettings,
  normalizeCurrencyCode,
  SpeciesProfile,
  WeightUnit,
} from '../domain/models';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  WARM_THEME_PRESETS,
} from '../domain/themePalette';
import { sanitizeSafeRasterImageDataUrl } from '../domain/inputSanitization';
import { usePlatformBridge } from '@app/PlatformBridgeContext';
import { DeviceCapabilityController } from '../storage/deviceCapabilityDetector';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import {
  RollingBackupMeta,
  StorageProtectionStatus,
  usePWAInstall,
} from '../storage/storageProtection';
import type { GoogleCalendarOption } from '../utils/googleCalendarClient';
import { DeviceCapabilityCard } from './DeviceCapabilityCard';
import { ImageCompressionNotice } from './ImageCompressionNotice';
import type { ImportExportHubSection } from './ImportExportHubScreen';
import { SpeciesEditorModal } from './SpeciesEditorModal';
import { AboutModal } from './AboutModal';
import { PromptsDirectoryScreen } from './PromptsDirectoryScreen';
import { CLOUD_SYNC_PROVIDER_DESCRIPTORS } from '../domain/cloudAppFolderSync';
import type {
  CloudSyncClientState,
  RunCloudAppFolderSyncResult,
} from '../storage/cloudAppFolderSync';

const ANDROID_APK_RELEASES_URL = 'https://github.com/AskKim/Pedigree/releases/latest';

type SmartInstallEnvironment =
  | { kind: 'hidden' }
  | { kind: 'unsupported'; isAndroid: boolean; reason: string; suggestion: string }
  | { kind: 'safari'; isAndroid: false; isIos: boolean }
  | { kind: 'chromium'; isAndroid: boolean };

function detectSmartInstallEnvironment(
  isInstalled: boolean,
  isIosHook: boolean,
  isNativeWrapper: boolean
): SmartInstallEnvironment {
  if (isNativeWrapper || isInstalled) {
    return { kind: 'hidden' };
  }
  if (typeof navigator === 'undefined') {
    return { kind: 'chromium', isAndroid: false };
  }
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isAppleTouchMac =
    typeof document !== 'undefined' && /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  const isIosDevice = isIosHook || /iphone|ipad|ipod/i.test(ua) || isAppleTouchMac;

  const isInAppWebView =
    /\b(FBAN|FBAV|FB_IAB|Instagram|Line|MicroMessenger|Twitter|Snapchat|TikTok|BytedanceWebview|Pinterest)\b/i.test(
      ua
    ) ||
    (isAndroid && /;\s*wv\)/i.test(ua));

  if (isInAppWebView) {
    return {
      kind: 'unsupported',
      isAndroid,
      reason: 'Embedded in-app browser detected (Facebook, Instagram, TikTok, or Android WebView).',
      suggestion: isAndroid
        ? 'Open this page in Chrome / Edge or install the native Android APK release below.'
        : 'Tap the browser menu and choose Open in Safari (iOS/macOS) or Chrome/Edge to install offline.',
    };
  }

  if (/firefox|fxios/i.test(ua)) {
    return {
      kind: 'unsupported',
      isAndroid,
      reason: 'Firefox does not support one-tap PWA Home Screen installation on this platform.',
      suggestion: isAndroid
        ? 'Open in Chrome / Edge to install the offline PWA, or download the Android APK release directly below.'
        : isIosDevice
        ? 'Open this address in Safari on iPhone or iPad to add Pedigree to your Home Screen.'
        : 'Open this page in Chrome, Edge, or Brave (or Safari on macOS) to install Pedigree as an offline app.',
    };
  }

  const isSafariBrowser =
    /safari/i.test(ua) &&
    !/chrome|chromium|crios|edg|edgios|edga|opr|opt|samsungbrowser|fxios|firefox/i.test(ua);

  if (isIosDevice || isSafariBrowser) {
    return { kind: 'safari', isAndroid: false, isIos: isIosDevice };
  }

  return { kind: 'chromium', isAndroid };
}

export interface SettingsAndSyncScreenProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  storageStatus: StorageProtectionStatus | null;
  backupStatus: BackupStatusEvaluation | null;
  openAddSpeciesOnMount: boolean;
  onConsumedOpenAddSpecies: () => void;
  recordBackupExport?: (
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
  onOpenHelpDocs?: () => void;
  onOpenPromptsDirectory?: () => void;
  onOpenAbout?: () => void;
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
  opfsSupported = false,
  opfsVaultBackups = [],
  rollingBackups = [],
  onOpenImportExportHub,
  onOpenTechyStuff,
  onOpenHealthReference,
  onOpenHelpDocs,
  onOpenPromptsDirectory,
  onOpenAbout,
  cloudSyncState = null,
  cloudSyncBusy = false,
  onResetAndRetryCloudSync,
}: SettingsAndSyncScreenProps) {
  const baseId = useId();
  const { settings, speciesProfiles } = snapshot;
  const calendarSync = normalizeCalendarSyncSettings(settings.calendarSync);
  const selectedAlarmOffsets = normalizeCalendarAlarmList(
    calendarSync.alarmMinutesBeforeList,
    calendarSync.alarmMinutesBefore
  );

  const updateCalendarSync = (patch: Partial<CalendarSyncSettings>) => {
    onUpdateSettings(
      { calendarSync: { ...calendarSync, ...patch } },
      { silent: true }
    );
  };

  const toggleAlarmOffset = (minutes: number) => {
    const exists = selectedAlarmOffsets.includes(minutes);
    const nextList = exists
      ? selectedAlarmOffsets.filter((m) => m !== minutes)
      : [...selectedAlarmOffsets, minutes];
    const normalized =
      nextList.length > 0
        ? normalizeCalendarAlarmList(nextList, calendarSync.alarmMinutesBefore)
        : selectedAlarmOffsets;
    updateCalendarSync({
      alarmMinutesBeforeList: normalized,
      alarmMinutesBefore: normalized[0] ?? calendarSync.alarmMinutesBefore,
    });
  };

  const openDatedTasks = snapshot.tasks.filter((t) => !t.completed && Boolean(t.dueDateIso));

  // Form State
  const [barnName, setBarnName] = useState(settings.barnName);
  const [breederName, setBreederName] = useState(settings.breederName);
  const [breederEmail, setBreederEmail] = useState(settings.breederEmail || '');
  const [breederPhone, setBreederPhone] = useState(settings.breederPhone || '');
  const [breederAddress, setBreederAddress] = useState(settings.breederAddress || '');
  const [breederLocation, setBreederLocation] = useState(settings.breederLocation || '');
  const [breederZip, setBreederZip] = useState(settings.breederZip || '');
  const [breederCountry, setBreederCountry] = useState(settings.breederCountry || '');
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

  // Modals
  const [showCustomSpeciesModal, setShowCustomSpeciesModal] = useState(false);
  const [showInternalAboutModal, setShowInternalAboutModal] = useState(false);
  const [showPromptsModal, setShowPromptsModal] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const saveNoticeTimerRef = useRef<number | null>(null);

  const platformBridge = usePlatformBridge();
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const smartInstallEnv = useMemo(
    () =>
      detectSmartInstallEnvironment(
        isInstalled,
        isIos,
        platformBridge.getCapabilities().hasNativeBridge
      ),
    [isInstalled, isIos, platformBridge]
  );

  useEffect(() => {
    if (openAddSpeciesOnMount) {
      setShowCustomSpeciesModal(true);
      onConsumedOpenAddSpecies();
    }
  }, [openAddSpeciesOnMount, onConsumedOpenAddSpecies]);

  useEffect(() => {
    setBarnName(settings.barnName);
    setBreederName(settings.breederName);
    setBreederEmail(settings.breederEmail || '');
    setBreederPhone(settings.breederPhone || '');
    setBreederAddress(settings.breederAddress || '');
    setBreederLocation(settings.breederLocation || '');
    setBreederZip(settings.breederZip || '');
    setBreederCountry(settings.breederCountry || '');
    setBreederWebsite(settings.breederWebsite || '');
    setShowcaseTagline(settings.showcaseTagline || '');
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

  useEffect(() => {
    return () => {
      if (saveNoticeTimerRef.current !== null) {
        window.clearTimeout(saveNoticeTimerRef.current);
      }
    };
  }, []);

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

  const triggerSavedFeedback = (msg = 'Barn preferences saved successfully.') => {
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
    }
    setSavedNotice(msg);
    saveNoticeTimerRef.current = window.setTimeout(() => {
      setSavedNotice(null);
      saveNoticeTimerRef.current = null;
    }, 2800);
  };

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      barnName: barnName.trim() || 'My Barn',
      barnNameOnboarded: true,
      breederName: breederName.trim(),
      breederEmail: breederEmail.trim() || undefined,
      breederPhone: breederPhone.trim() || undefined,
      breederAddress: breederAddress.trim() || undefined,
      breederLocation: breederLocation.trim() || undefined,
      breederZip: breederZip.trim() || undefined,
      breederCountry: breederCountry.trim() || undefined,
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
    triggerSavedFeedback();
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
      triggerSavedFeedback('Barn logo uploaded and saved.');
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
    triggerSavedFeedback('Barn logo removed.');
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

  const totalVaultCount = opfsVaultBackups.length + rollingBackups.length;

  const openAndroidReleases = () => {
    if (!platformBridge.openExternalUrl?.(ANDROID_APK_RELEASES_URL) && typeof window !== 'undefined') {
      window.open(ANDROID_APK_RELEASES_URL, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenAboutTrigger = () => {
    if (onOpenAbout) {
      onOpenAbout();
    } else {
      setShowInternalAboutModal(true);
    }
  };

  const handleOpenPromptsTrigger = () => {
    if (onOpenPromptsDirectory) {
      onOpenPromptsDirectory();
    } else {
      setShowPromptsModal(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          Title Text, Live Subtitle & Prompts/About/Developer/Help Quick Links
         ========================================================================= */}
      <header className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--barn-muted)]">
              <Settings className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Barn Configuration &amp; Master Preferences</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-[var(--barn-ink)]">v0.1.0-alpha.3</span>
              <span aria-hidden="true">·</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] border border-[var(--barn-sage)]/35">
                100% Offline-First
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[var(--barn-ink)]">
              Settings &amp; Preferences
            </h1>

            <p className="text-xs sm:text-sm text-[var(--barn-muted)] leading-relaxed">
              Manage your farm identity, species setup, breeding display units, calendar alerts,
              appearance, and direct links to documentation and diagnostic tools.
            </p>
          </div>

          {/* Quick Links Subunit Button Band */}
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            <button
              type="button"
              onClick={handleOpenPromptsTrigger}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5 transition-colors shadow-2xs"
              title="View the Prompts Directory"
            >
              <FileCode2 className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>Prompts</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAboutTrigger}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5 transition-colors shadow-2xs"
              title="About Community Pedigree (Version, License & Architecture)"
            >
              <Info className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>About</span>
            </button>

            {onOpenTechyStuff && (
              <button
                type="button"
                onClick={onOpenTechyStuff}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Open The Techy Stuff Developer & Diagnostic Console"
              >
                <Terminal className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>Developer</span>
              </button>
            )}

            {onOpenHelpDocs && (
              <button
                type="button"
                onClick={onOpenHelpDocs}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:bg-[var(--barn-sage-tint)]/80 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Open In-App Help & Species Guides"
              >
                <BookOpen className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>Help Guides</span>
              </button>
            )}

            {onOpenImportExportHub && (
              <button
                type="button"
                onClick={() => onOpenImportExportHub('all')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] hover:opacity-95 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Open Consolidated Import, Export & Backup Hub"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Backup Hub</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Status Indicators Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-[var(--barn-border)] text-xs">
          <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <span className="text-[11px] text-[var(--barn-muted)] block">Barn Identity</span>
            <span className="font-semibold text-[var(--barn-ink)] truncate block mt-0.5">
              {barnName || 'My Barn'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <span className="text-[11px] text-[var(--barn-muted)] block">Active Workspace</span>
            <span className="font-semibold text-[var(--barn-ink)] truncate block mt-0.5">
              {activeSpeciesName || defaultSpecies || 'All Species'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <span className="text-[11px] text-[var(--barn-muted)] block">Storage Model</span>
            <span className="font-semibold text-[var(--barn-ink)] truncate block mt-0.5">
              {opfsSupported ? 'SQLite + OPFS Vault' : 'SQLite + IndexedDB'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            <span className="text-[11px] text-[var(--barn-muted)] block">Active Theme</span>
            <span className="font-semibold text-[var(--barn-ink)] truncate block mt-0.5">
              {isDark ? 'Dark · Woodland' : 'Light · Warm Parchment'}
            </span>
          </div>
        </div>
      </header>

      {/* Floating / Transient Save Notice Banner */}
      {savedNotice && (
        <div
          role="status"
          className="p-3.5 rounded-2xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold flex items-center justify-between gap-3 shadow-md animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{savedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavedNotice(null)}
            className="text-[var(--barn-on-sage)]/80 hover:text-[var(--barn-on-sage)] p-1"
            aria-label="Dismiss confirmation"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Top Warning Notices (External Backup Overdue or Missing) */}
      {backupStatus && backupStatus.level !== 'up_to_date' && (
        <section
          role="alert"
          aria-label="External Backup Status Alert"
          className="rounded-2xl border-2 border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start gap-3 min-w-0">
            <AlertTriangle
              className="w-5 h-5 text-[var(--barn-danger)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-bold text-[var(--barn-ink)]">
                {backupStatus.headline}
              </div>
              <p className="text-xs text-[var(--barn-ink)]/90 leading-relaxed">
                {backupStatus.detail}
              </p>
              <div className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                Last export: {backupStatus.lastExportLabel} · Latest change:{' '}
                {backupStatus.latestChangeLabel} · {totalVaultCount} local vault snapshot
                {totalVaultCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          {onOpenImportExportHub && (
            <button
              type="button"
              onClick={() => onOpenImportExportHub('backup')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-terracotta)] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 hover:opacity-95"
            >
              <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
              Open Backup Hub
            </button>
          )}
        </section>
      )}

      {/* Tripped Cloud Sync Quota Alert */}
      {cloudSyncState && cloudSyncState.circuitBreaker.tripped && (
        <div
          role="alert"
          className="p-4 rounded-2xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-xs space-y-2"
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
                Review Sync in Hub
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

      {/* Main Settings Form enclosing the preference fields */}
      <form onSubmit={handleSavePreferences} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* =========================================================================
              LEFT COLUMN (6 Columns): Subunit 1, Subunit 2, Subunit 3 & Subunit 6
             ========================================================================= */}
          <div className="lg:col-span-6 space-y-6">
            {/* -----------------------------------------------------------------------
                SUBUNIT 1: Farm & Breeder Identity
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>Farm &amp; Breeder Identity</span>
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Your barn name, breeder identity, printed pedigree logo, and optional contact details
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={`${baseId}-barnName`}
                    className="block text-xs font-semibold text-[var(--barn-ink)] mb-1"
                  >
                    Barn / Farm / Rabbitry Name
                  </label>
                  <input
                    id={`${baseId}-barnName`}
                    type="text"
                    value={barnName}
                    onChange={(e) => setBarnName(e.target.value)}
                    placeholder="e.g. Copper Creek Rabbitry"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:border-[var(--barn-sage)] transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-breederName`}
                    className="block text-xs font-semibold text-[var(--barn-ink)] mb-1"
                  >
                    Breeder Name (for Pedigrees &amp; Showcase)
                  </label>
                  <input
                    id={`${baseId}-breederName`}
                    type="text"
                    value={breederName}
                    onChange={(e) => setBreederName(e.target.value)}
                    placeholder="e.g. Jane &amp; John Doe"
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm focus:border-[var(--barn-sage)] transition-colors"
                  />
                </div>
              </div>

              {/* Barn / Rabbitry Logo */}
              <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {breederLogoDataUrl ? (
                      <img
                        src={breederLogoDataUrl}
                        alt={`${barnName || 'Barn'} logo`}
                        className="h-12 max-w-[120px] w-auto object-contain rounded-xl border border-[var(--barn-border)] bg-white p-1 shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl border border-dashed border-[var(--barn-border)] bg-[var(--barn-surface)] flex items-center justify-center shrink-0 text-[var(--barn-muted)]">
                        <ImageIcon className="w-5 h-5" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--barn-ink)]">
                        Barn Logo (Printed Pedigree Header)
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)]">
                        Optional raster image (PNG/JPG/WebP) printed next to your barn title on formal pedigrees &amp; PDFs.
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
                      className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      {logoUploading ? 'Optimizing...' : breederLogoDataUrl ? 'Change Logo' : 'Upload Logo'}
                    </button>
                    {breederLogoDataUrl && (
                      <button
                        type="button"
                        onClick={handleClearBreederLogo}
                        aria-label="Remove barn logo"
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-danger)]/10 text-xs font-medium text-[var(--barn-danger)] inline-flex items-center gap-1 transition-colors"
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

              {/* Optional Contact, Address & Local Privacy */}
              <div className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3.5">
                <div>
                  <div className="text-xs font-semibold text-[var(--barn-ink)]">
                    Barn Contact &amp; Address Info (Optional)
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)] mt-0.5 leading-relaxed">
                    Used to populate printed pedigree headers/footers, upcoming local weather forecasts,
                    and ARBA / BRC registry formats, as well as exported buyer stock catalogs.
                  </p>
                </div>

                <div className="p-2.5 rounded-xl border border-[var(--barn-sage)]/50 bg-[var(--barn-sage-tint)]/45 flex items-start gap-2.5 text-[11px] text-[var(--barn-ink)]">
                  <ShieldCheck
                    className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    <strong>100% Local Privacy:</strong> Stored strictly inside your private local browser database
                    — never uploaded to remote servers. Appears only on documents or catalogs you explicitly export.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`${baseId}-breederAddress`}
                      className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                    >
                      Street Address
                    </label>
                    <input
                      id={`${baseId}-breederAddress`}
                      type="text"
                      placeholder="e.g. 1420 Meadow Lane"
                      value={breederAddress}
                      onChange={(e) => setBreederAddress(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
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
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor={`${baseId}-breederZip`}
                        className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                      >
                        ZIP / Postal Code
                      </label>
                      <input
                        id={`${baseId}-breederZip`}
                        type="text"
                        placeholder="e.g. 97301"
                        value={breederZip}
                        onChange={(e) => setBreederZip(e.target.value)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${baseId}-breederCountry`}
                        className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                      >
                        Country
                      </label>
                      <input
                        id={`${baseId}-breederCountry`}
                        type="text"
                        placeholder="e.g. USA / UK"
                        value={breederCountry}
                        onChange={(e) => setBreederCountry(e.target.value)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={`${baseId}-breederPhone`}
                      className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                    >
                      Phone Number
                    </label>
                    <input
                      id={`${baseId}-breederPhone`}
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={breederPhone}
                      onChange={(e) => setBreederPhone(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>

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
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`${baseId}-breederWebsite`}
                      className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                    >
                      Website / Public Link
                    </label>
                    <input
                      id={`${baseId}-breederWebsite`}
                      type="text"
                      placeholder="https://myrabbitry.github.io"
                      value={breederWebsite}
                      onChange={(e) => setBreederWebsite(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor={`${baseId}-showcaseTagline`}
                      className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                    >
                      Showcase Tagline / Pickup Terms
                    </label>
                    <input
                      id={`${baseId}-showcaseTagline`}
                      type="text"
                      placeholder="e.g. Registered breeding stock · Local pickup &amp; show transport available"
                      value={showcaseTagline}
                      onChange={(e) => setShowcaseTagline(e.target.value)}
                      className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* -----------------------------------------------------------------------
                SUBUNIT 2: Species & Workspace Setup
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>Species &amp; Workspace Setup</span>
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Default active species, custom livestock definitions, startup landing, and view options
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCustomSpeciesModal(true)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shadow-2xs hover:opacity-95"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Custom Livestock</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor={`${baseId}-defaultSpecies`}
                    className="block text-xs font-semibold text-[var(--barn-ink)] mb-1"
                  >
                    Default Primary Species
                  </label>
                  <select
                    id={`${baseId}-defaultSpecies`}
                    value={defaultSpecies}
                    onChange={(e) => setDefaultSpecies(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
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
                    htmlFor={`${baseId}-pinnedLandingSpecies`}
                    className="block text-xs font-semibold text-[var(--barn-ink)] mb-1"
                  >
                    Pinned Startup Landing Page
                  </label>
                  <select
                    id={`${baseId}-pinnedLandingSpecies`}
                    value={pinnedLandingSpecies}
                    onChange={(e) => setPinnedLandingSpecies(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
                  >
                    <option value="">All-Species Barn Home Page (Summary Cards)</option>
                    {speciesProfiles.map((sp) => (
                      <option key={sp.id} value={sp.name}>
                        Open Directly Inside {sp.name} Barn Hub
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Configured Species Overview Badges */}
              <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                <div className="text-xs font-semibold text-[var(--barn-ink)]">
                  Configured Species Profiles ({speciesProfiles.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {speciesProfiles.map((sp) => (
                    <span
                      key={sp.id}
                      className="px-2.5 py-1 rounded-xl text-xs font-medium bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)]"
                    >
                      {sp.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Workspace View Options */}
              <div className="space-y-2.5 pt-2 text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHomeSummaryGrid}
                    onChange={(e) => setShowHomeSummaryGrid(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                  />
                  <span className="text-[var(--barn-ink)]">
                    Show condensed 4-square summary strip on Home and Species pages
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableJudgeNotebook}
                    onChange={(e) => setEnableJudgeNotebook(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                  />
                  <span className="text-[var(--barn-ink)]">
                    Enable The Judge&apos;s Notebook (show judge bids, contracts, club directory &amp; travel expenses module)
                  </span>
                </label>
              </div>
            </section>

            {/* -----------------------------------------------------------------------
                SUBUNIT 3: Units, Currency & Pedigree Standards
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="border-b border-[var(--barn-border)] pb-4">
                <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Units, Currency &amp; Pedigree Standards</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Display units for weights, financial currency, default pedigree chart depth, and document options
                </p>
              </div>

              {/* Default Weight Unit */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[var(--barn-ink)]">
                  Default Weight Display Unit
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        preferredUnit === val
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent shadow-2xs'
                          : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Currency */}
                <div>
                  <label
                    htmlFor={`${baseId}-currencyCode`}
                    className="block text-xs font-semibold text-[var(--barn-ink)] mb-1"
                  >
                    Report Currency
                  </label>
                  <select
                    id={`${baseId}-currencyCode`}
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CAD">CAD (CA$)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="AUD">AUD (A$)</option>
                    <option value="NZD">NZD (NZ$)</option>
                  </select>
                </div>

                {/* Pedigree Depth */}
                <div>
                  <span className="block text-xs font-semibold text-[var(--barn-ink)] mb-1">
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
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent shadow-2xs'
                            : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                        }`}
                      >
                        {g} Gen
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pedigree Print Photo Toggle */}
              <div className="pt-2 border-t border-[var(--barn-border)] text-xs">
                <label className="flex items-center gap-2.5 cursor-pointer flex-wrap">
                  <input
                    type="checkbox"
                    checked={includePhotoOnPedigree}
                    onChange={(e) => setIncludePhotoOnPedigree(e.target.checked)}
                    className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                  />
                  <span className="text-[var(--barn-ink)]">
                    Include animal&apos;s primary photo on printed .HTM / PDF pedigrees
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] border border-[var(--barn-terracotta)]/45">
                    Coming Soon
                  </span>
                </label>
              </div>
            </section>

            {/* -----------------------------------------------------------------------
                SUBUNIT 6: Device Storage, Image Compression & Memory
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="border-b border-[var(--barn-border)] pb-4">
                <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Device Storage, Image Compression &amp; Memory</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Monitor on-device storage quotas, configure photo compression presets, and offload retired records
                </p>
              </div>

              {/* Storage Quota Meter */}
              {storageStatus && storageStatus.supported && (
                <div className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--barn-ink)]">
                      <HardDrive className="w-4 h-4 text-[var(--barn-slate)]" aria-hidden="true" />
                      <span>On-Device Storage Quota</span>
                      {storageStatus.persisted ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--barn-sage-tint)] text-[var(--barn-sage)] border border-[var(--barn-sage)]/40">
                          Protected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--barn-canvas)] text-[var(--barn-muted)] border border-[var(--barn-border)]">
                          Standard
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-[var(--barn-muted)]">
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
                      Storage is above {Math.round(storageStatus.percentUsed)}% of quota. Consider
                      exporting a Complete .ZIP backup or choosing a smaller photo optimization preset.
                    </p>
                  )}
                </div>
              )}

              {/* Photo Compression Profile */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-imageOptimizationPreset`}
                    className="block text-xs font-semibold text-[var(--barn-ink)]"
                  >
                    Image Optimization Profile
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                    {allPhotos.length} photo{allPhotos.length === 1 ? '' : 's'} ·{' '}
                    {formatByteSizePure(totalStoredPhotoBytes)}
                    {totalPhotoSavingsPct > 0 ? ` (-${totalPhotoSavingsPct}% saved)` : ''}
                  </span>
                </div>

                <select
                  id={`${baseId}-imageOptimizationPreset`}
                  value={imageOptimizationPreset}
                  onChange={(e) =>
                    setImageOptimizationPreset(e.target.value as ImageOptimizationPresetId)
                  }
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
                >
                  {Object.values(IMAGE_OPTIMIZATION_PRESETS).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.shortBadge} — {preset.typicalSizeHint}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-[var(--barn-muted)]">
                  {IMAGE_OPTIMIZATION_PRESETS[imageOptimizationPreset].description}
                </p>

                <ImageCompressionNotice />
              </div>

              {/* OPFS Retired Animals Auto-Offload */}
              <div className="pt-2 border-t border-[var(--barn-border)] text-xs">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOffloadRetiredToOpfs}
                    disabled={!opfsSupported}
                    onChange={(e) => setAutoOffloadRetiredToOpfs(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] rounded shrink-0"
                  />
                  <span>
                    <span className="font-medium text-[var(--barn-ink)] block">
                      Auto-offload Sold &amp; Deceased animals to OPFS /archives
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                      Offloads heavy animal photos &amp; care logs to local filesystem archives to reduce active RAM usage while keeping all lineage data intact.
                    </span>
                  </span>
                </label>
              </div>

              {/* Device Capability & Tier Governor */}
              {deviceCapability && (
                <div className="pt-2 border-t border-[var(--barn-border)]">
                  <DeviceCapabilityCard
                    location="settings"
                    controller={deviceCapability}
                    settings={settings}
                    totalBarnRecords={totalBarnRecords}
                    onApplyLowMemorySettings={(patch) => onUpdateSettings(patch)}
                  />
                </div>
              )}
            </section>
          </div>

          {/* =========================================================================
              RIGHT COLUMN (6 Columns): Subunit 4, Subunit 5, Subunit 7 & Subunit 8
             ========================================================================= */}
          <div className="lg:col-span-6 space-y-6">
            {/* -----------------------------------------------------------------------
                SUBUNIT 4: Appearance & Color Studio
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>Appearance &amp; Custom Color Studio</span>
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Light &amp; dark display modes, warm palette presets, and custom barn theme pickers
                  </p>
                </div>
              </div>

              {/* Theme Mode Toggle */}
              <div>
                <span className="block text-xs font-semibold text-[var(--barn-ink)] mb-1.5">
                  Display Mode
                </span>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                  <button
                    type="button"
                    aria-pressed={!isDark}
                    onClick={() => onUpdateSettings({ themeMode: 'light' })}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                      !isDark
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] shadow-2xs'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    <Sun className="w-4 h-4" aria-hidden="true" />
                    <span>Warm Parchment Light</span>
                  </button>

                  <button
                    type="button"
                    aria-pressed={isDark}
                    onClick={() => onUpdateSettings({ themeMode: 'dark' })}
                    className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 ${
                      isDark
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] shadow-2xs'
                        : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                    }`}
                  >
                    <Moon className="w-4 h-4" aria-hidden="true" />
                    <span>Original Woodland Dark</span>
                  </button>
                </div>
              </div>

              {/* Palette Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--barn-ink)]">
                    Barn Palette Presets
                  </span>
                  <button
                    type="button"
                    onClick={handleResetColors}
                    className="text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] inline-flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Reset Default</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                        className="text-left p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] transition-colors space-y-1.5"
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

              {/* Fine-Grained Custom Colors */}
              <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
                <div className="text-xs font-semibold text-[var(--barn-ink)]">
                  Fine-Grained Color Controls ({isDark ? 'Dark Mode' : 'Light Mode'})
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {colorPickersForMode.map(({ key, label, hint }) => {
                    const val = activeColorValue(key);
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] cursor-pointer hover:border-[var(--barn-sage)] transition-colors"
                      >
                        <input
                          type="color"
                          value={val}
                          onChange={(e) => handleColorPick(key, e.target.value)}
                          aria-label={label}
                          className="w-9 h-9 rounded-xl border border-[var(--barn-border)] bg-transparent cursor-pointer shrink-0 p-0.5"
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

            {/* -----------------------------------------------------------------------
                SUBUNIT 5: Calendar Integration & Task Alarms
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--barn-border)] pb-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                    <CalendarPlus className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>Calendar Integration &amp; Task Alarms</span>
                  </h2>
                  <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                    Synchronize task reminders to Google Calendar, desktop apps (Outlook/Apple Calendar), or offline .ICS
                  </p>
                </div>
              </div>

              {/* Delivery Modes */}
              <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
                <div className="font-semibold text-[var(--barn-ink)]">
                  Calendar Destination Mode
                </div>

                <div className="space-y-2">
                  {(
                    [
                      {
                        id: 'google_calendar' as CalendarDeliveryMode,
                        title: 'Google Calendar Web Links + .ICS Fallback',
                        desc: 'Preview chores with quick online event links, and automatically fall back to offline .ICS files.',
                      },
                      {
                        id: 'external_app_or_ics' as CalendarDeliveryMode,
                        title: 'External / Desktop Calendar App (Outlook, Apple, Android)',
                        desc: 'Hands off .ICS directly to your device calendar app without requiring cloud connections.',
                      },
                      {
                        id: 'offline_ics' as CalendarDeliveryMode,
                        title: 'Offline .ICS File Download Only',
                        desc: 'Always download standard .ICS calendar files locally with zero external accounts.',
                      },
                    ] as const
                  ).map((mode) => (
                    <label
                      key={mode.id}
                      className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                        calendarSync.deliveryMode === mode.id
                          ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]/45'
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
                  <div className="mt-2 p-3.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-3">
                    {!googleAuthConnected ? (
                      <div className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                        Direct Google account sign-in is disabled so Pedigree stays 100% cloud- and Firebase-free. Single chores open quick Google/Outlook Web event links when online, and chores export cleanly as offline .ICS files.
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
                                onClick={() => void onRefreshGoogleCalendars()}
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
                                onClick={() => void onDisconnectGoogleCalendar()}
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
                              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs"
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

              {/* Automatic Task Dispatch Toggles */}
              <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={calendarSync.autoAddNewTasks}
                    onChange={(e) => updateCalendarSync({ autoAddNewTasks: e.target.checked })}
                    className="w-4 h-4 mt-0.5 accent-[var(--barn-sage)] shrink-0 rounded"
                  />
                  <span>
                    <span className="font-semibold text-[var(--barn-ink)] block">
                      Automatically send newly added tasks to calendar
                    </span>
                    <span className="text-[11px] text-[var(--barn-muted)] block mt-0.5">
                      New dated chores use your selected calendar mode above.
                    </span>
                  </span>
                </label>

                <div className="pl-6 space-y-2 border-l-2 border-[var(--barn-border)]">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calendarSync.includeBreedingTasks}
                      onChange={(e) =>
                        updateCalendarSync({ includeBreedingTasks: e.target.checked })
                      }
                      className="w-4 h-4 accent-[var(--barn-sage)] rounded"
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
                      className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                    />
                    <span>Include manually created barn chores</span>
                  </label>
                </div>
              </div>

              {/* Time & Multi-Alarm Lead Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1.5">
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
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-sm font-mono"
                  />
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Uses your device clock (30-minute chore block).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-[var(--barn-ink)]">
                    <input
                      type="checkbox"
                      checked={calendarSync.alarmEnabled}
                      onChange={(e) => updateCalendarSync({ alarmEnabled: e.target.checked })}
                      className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                    />
                    <Bell className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                    <span>Include alarm notifications</span>
                  </label>

                  <div
                    role="group"
                    aria-label="Alarm lead times before scheduled task"
                    className="grid grid-cols-2 gap-1.5"
                  >
                    {CALENDAR_ALARM_LEAD_OPTIONS.map((opt) => {
                      const checked = selectedAlarmOffsets.includes(opt.minutes);
                      return (
                        <label
                          key={opt.minutes}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] transition-colors ${
                            !calendarSync.alarmEnabled
                              ? 'opacity-50 cursor-not-allowed bg-[var(--barn-surface)] border-[var(--barn-border)]'
                              : checked
                              ? 'cursor-pointer bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] font-semibold text-[var(--barn-ink)]'
                              : 'cursor-pointer bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!calendarSync.alarmEnabled}
                            onChange={() => toggleAlarmOffset(opt.minutes)}
                            className="w-3.5 h-3.5 accent-[var(--barn-sage)] shrink-0 rounded"
                          />
                          <span className="truncate">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    {formatCalendarAlarmSummary(calendarSync)}
                  </p>
                </div>
              </div>

              {/* Task Naming & Live Preview */}
              <div className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5 text-xs">
                <div className="font-semibold text-[var(--barn-ink)]">
                  Task Naming Conventions
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calendarSync.includeAnimalName}
                      onChange={(e) => updateCalendarSync({ includeAnimalName: e.target.checked })}
                      className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                    />
                    <span>Include animal name in titles (uncheck to show ID only)</span>
                  </label>

                  <div className="pl-6 border-l-2 border-[var(--barn-border)]">
                    <label
                      className={`flex items-center gap-2.5 ${
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
                        className="w-4 h-4 accent-[var(--barn-sage)] rounded"
                      />
                      <span>Include configured species / herd prefix</span>
                    </label>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] space-y-1">
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
                          <span className="text-[var(--barn-muted)] mr-1.5">App preview:</span>
                          <span className="font-mono text-[var(--barn-ink)] font-semibold">
                            {appSample}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--barn-muted)] mr-1.5">Calendar preview:</span>
                          <span className="font-mono text-[var(--barn-ink)] font-semibold">
                            {`${appSample} [${spLabel}]`}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Bulk Export Tasks Button */}
              {onExportTasksToCalendar && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--barn-border)]">
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    {openDatedTasks.length} open dated {openDatedTasks.length === 1 ? 'task' : 'tasks'} available
                  </span>
                  <button
                    type="button"
                    disabled={openDatedTasks.length === 0}
                    onClick={() => onExportTasksToCalendar(openDatedTasks, 'open-barn-tasks')}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      Export {openDatedTasks.length} Open Tasks (.ICS)
                    </span>
                  </button>
                </div>
              )}
            </section>

            {/* -----------------------------------------------------------------------
                SUBUNIT 7: Backup, Multi-Device Sync & Installation
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-5 shadow-xs">
              <div className="border-b border-[var(--barn-border)] pb-4">
                <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>Backup, Multi-Device Sync &amp; Installation</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Consolidated Hub launchers, multi-device sync previews, and offline home screen setup
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Import/Export Hub Card */}
                {onOpenImportExportHub && (
                  <div className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-[var(--barn-ink)]">
                          Import / Export Hub
                        </span>
                        <ArrowLeftRight className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                        Full .ZIP / .JSON / .SQLite backups, restores, HerdBoss / Evans importers, and printable reports.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenImportExportHub('all')}
                      className="w-full min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-95"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open Hub Workspace</span>
                    </button>
                  </div>
                )}

                {/* Health Reference & Vet PDF Folder */}
                {onOpenHealthReference && (
                  <div className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-[var(--barn-ink)]">
                          Health Wikis &amp; Vet PDFs
                        </span>
                        <HeartPulse className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                        Curated species health reference links plus a read-only local device folder pointer for veterinary PDFs.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenHealthReference('all')}
                      className="w-full min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-1.5"
                    >
                      <HeartPulse className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                      <span>Open Health Library</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Multi-Device Sync Preview Notice */}
              <div className="p-3.5 rounded-2xl border border-[var(--barn-terracotta)]/40 bg-[var(--barn-terracotta-tint)]/40 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                    <FolderSync className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                    <span>Peer Sync &amp; Cloud Folders (Preview)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] border border-[var(--barn-terracotta)]/50">
                    Experimental
                  </span>
                </div>
                <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                  Direct peer delta syncing and cloud folder previews are experimental. For reliable cross-device transfers today, export a full <strong>.ZIP</strong> or <strong>.JSON</strong> backup in the Hub.
                </p>
              </div>

              {/* Smart Home Screen Install Card */}
              {smartInstallEnv.kind !== 'hidden' && (
                <div className="p-4 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold text-[var(--barn-ink)]">
                      <Smartphone className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                      <span>Install App to Home Screen (Offline Mode)</span>
                    </div>
                    {smartInstallEnv.kind === 'chromium' && canPromptInstall && (
                      <button
                        type="button"
                        onClick={() => void promptInstall()}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap hover:opacity-95 shadow-2xs"
                      >
                        Install App Now
                      </button>
                    )}
                  </div>

                  {smartInstallEnv.kind === 'chromium' && (
                    <p className="text-[11px] text-[var(--barn-muted)] leading-relaxed">
                      {canPromptInstall ? (
                        <>
                          Your Chromium browser supports direct one-tap offline installation. Tap{' '}
                          <strong>Install App Now</strong> above for full-screen barn mode and elevated storage protection.
                        </>
                      ) : (
                        <>
                          Use your browser address bar install icon or menu (&vellip;) &rarr;{' '}
                          <strong>Install App</strong> / <strong>Add to Home screen</strong> so Pedigree works reliably in Airplane Mode.
                        </>
                      )}
                    </p>
                  )}

                  {smartInstallEnv.kind === 'safari' && (
                    <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1.5 text-[11px] text-[var(--barn-muted)]">
                      <div className="font-semibold text-[var(--barn-ink)]">
                        {smartInstallEnv.isIos ? 'Safari on iPhone / iPad:' : 'Safari on macOS:'}
                      </div>
                      {smartInstallEnv.isIos ? (
                        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                          <li>Tap the <strong className="text-[var(--barn-ink)]">Share</strong> icon in the Safari toolbar.</li>
                          <li>Scroll and choose <strong className="text-[var(--barn-ink)]">Add to Home Screen</strong>.</li>
                          <li>Launch from your Home Screen to prevent iOS 7-day storage purges.</li>
                        </ol>
                      ) : (
                        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                          <li>Choose <strong className="text-[var(--barn-ink)]">File &rarr; Add to Dock</strong>.</li>
                          <li>Launch from your Dock for a standalone offline app window.</li>
                        </ol>
                      )}
                    </div>
                  )}

                  {smartInstallEnv.isAndroid && (
                    <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-[var(--barn-muted)]">
                        Prefer native Android APK with hardware printing?
                      </span>
                      <button
                        type="button"
                        onClick={openAndroidReleases}
                        className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage-tint)] text-[var(--barn-ink)] border border-[var(--barn-sage)]/40 text-[11px] font-semibold inline-flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Android APK</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* -----------------------------------------------------------------------
                SUBUNIT 8: Help, Developer & System Resources
               ----------------------------------------------------------------------- */}
            <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-6 space-y-4 shadow-xs">
              <div className="border-b border-[var(--barn-border)] pb-4">
                <h2 className="font-display text-lg font-bold text-[var(--barn-ink)] flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                  <span>System Resources, Diagnostics &amp; Guides</span>
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Direct links to prompts catalog, about specifications, developer diagnostics, and keyboard navigation
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Prompts Link */}
                <button
                  type="button"
                  onClick={handleOpenPromptsTrigger}
                  className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] text-left flex items-start gap-3 group transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-center shrink-0 text-[var(--barn-sage)]">
                    <FileCode2 className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] group-hover:text-[var(--barn-sage)] transition-colors">
                      Prompts Directory
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)] line-clamp-1 mt-0.5">
                      System prompts &amp; AI directives
                    </p>
                  </div>
                </button>

                {/* About Link */}
                <button
                  type="button"
                  onClick={handleOpenAboutTrigger}
                  className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] text-left flex items-start gap-3 group transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-center shrink-0 text-[var(--barn-sage)]">
                    <Info className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] group-hover:text-[var(--barn-sage)] transition-colors">
                      About Pedigree
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)] line-clamp-1 mt-0.5">
                      v0.1.0-alpha.3 · AGPL-3.0 License
                    </p>
                  </div>
                </button>

                {/* Developer Link */}
                {onOpenTechyStuff && (
                  <button
                    type="button"
                    onClick={onOpenTechyStuff}
                    className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] text-left flex items-start gap-3 group transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-center shrink-0 text-[var(--barn-sage)]">
                      <Terminal className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--barn-ink)] group-hover:text-[var(--barn-sage)] transition-colors">
                        Developer Console
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] line-clamp-1 mt-0.5">
                        The Techy Stuff &amp; troubleshooting
                      </p>
                    </div>
                  </button>
                )}

                {/* Help Guides Link */}
                {onOpenHelpDocs && (
                  <button
                    type="button"
                    onClick={onOpenHelpDocs}
                    className="p-3.5 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] text-left flex items-start gap-3 group transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center justify-center shrink-0 text-[var(--barn-sage)]">
                      <BookOpen className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--barn-ink)] group-hover:text-[var(--barn-sage)] transition-colors">
                        Help &amp; Husbandry
                      </div>
                      <p className="text-[11px] text-[var(--barn-muted)] line-clamp-1 mt-0.5">
                        Species guides &amp; documentation
                      </p>
                    </div>
                  </button>
                )}
              </div>

              {/* Collapsible Keyboard Shortcuts Accordion */}
              <div className="pt-2 border-t border-[var(--barn-border)]">
                <button
                  type="button"
                  onClick={() => setShowShortcutHelp((prev) => !prev)}
                  aria-expanded={showShortcutHelp}
                  className="w-full p-2.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-canvas)] flex items-center justify-between text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <HelpCircle className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>Keyboard Navigation Shortcuts</span>
                  </span>
                  <span className="text-[11px] font-semibold text-[var(--barn-sage)]">
                    {showShortcutHelp ? 'Hide' : 'Show'}
                  </span>
                </button>

                {showShortcutHelp && (
                  <div className="mt-3 p-3 rounded-2xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs animate-in fade-in duration-150">
                    <p className="text-[11px] text-[var(--barn-muted)]">
                      Single-key shortcuts (active when not editing fields):
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { key: 'H', label: 'All Species Home' },
                        { key: 'D', label: 'Species Dashboard' },
                        { key: 'R', label: 'Herd Registry' },
                        { key: 'B', label: 'Breeding Lab' },
                        { key: 'P', label: 'Pedigree Explorer' },
                        { key: 'G', label: "Judge's Notebook" },
                        { key: 'O', label: 'Reports' },
                        { key: 'I', label: 'Import/Export Hub' },
                        { key: 'S', label: 'Settings' },
                        { key: '?', label: 'Shortcuts Help' },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)]"
                        >
                          <span className="text-[11px] text-[var(--barn-ink)] font-medium truncate">
                            {item.label}
                          </span>
                          <kbd className="px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px] font-semibold shrink-0">
                            {item.key}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* =========================================================================
            Primary Submit / Save Action Bar
           ========================================================================= */}
        <div className="sticky bottom-4 z-20 p-4 rounded-2xl bg-[var(--barn-surface)]/95 backdrop-blur-md border border-[var(--barn-border)] shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[var(--barn-muted)]">
            Changes to identity, species preferences, and units are saved to your local database.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-2 hover:opacity-95 shadow-xs transition-opacity"
            >
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>Save Barn Preferences</span>
            </button>
          </div>
        </div>
      </form>

      {/* Custom Species Editor Modal */}
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

      {/* Internal About Community Pedigree Modal */}
      {showInternalAboutModal && (
        <AboutModal
          isOpen={showInternalAboutModal}
          onClose={() => setShowInternalAboutModal(false)}
          onOpenHelpDocs={onOpenHelpDocs}
          onOpenTechyStuff={onOpenTechyStuff}
          onOpenPromptsDirectory={handleOpenPromptsTrigger}
          onOpenImportExportHub={onOpenImportExportHub ? () => onOpenImportExportHub('all') : undefined}
        />
      )}

      {/* Prompts Directory Modal (when standalone or without external route handler) */}
      {showPromptsModal && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPromptsModal(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Prompts Directory"
            className="w-full max-w-4xl max-h-[90vh] bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-3xl p-5 overflow-y-auto space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--barn-border)] pb-3">
              <div className="flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-[var(--barn-sage)]" aria-hidden="true" />
                <h2 className="font-display text-lg font-bold text-[var(--barn-ink)]">
                  Prompts Directory
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptsModal(false)}
                aria-label="Close Prompts Directory"
                className="w-8 h-8 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <PromptsDirectoryScreen onBackToTechyStuff={() => setShowPromptsModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
