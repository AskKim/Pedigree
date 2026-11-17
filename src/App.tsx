/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Project Name: Community Pedigree Project
 * App Name: Community Pedigree
 * Package Name: Pedigree
 *
 * Root Cross-Platform PWA Shell.
 * Connects the offline-first local IndexedDB / SQLite store (`useBarnStore`) to:
 * - Multi-Species Barn Home (`home`)
 * - Species Selector for Herd navigation from Home (`showHerdSpeciesPicker`)
 * - Strictly Species-Isolated Barn Dashboard (`dashboard`) + Species Hub Settings
 * - Strictly Species-Isolated Herd Multi-Select & Dedicated Animal Pages (`herd`)
 * - Strictly Species-Isolated Breeding, COI & Master Task List Lab (`breeding`)
 * - Strictly Species-Isolated 3/4/5/6-Gen Pinch-Zoom Pedigree Explorer (`pedigree`)
 * - Barn Preferences, PWA Storage Defense, Zero-Cloud Sync & Importers (`settings`)
 */

import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  FileBarChart2,
  GitFork,
  HelpCircle,
  Home,
  ListFilter,
  Moon,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { ComponentProps, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { HomeSpeciesScreen } from './components/HomeSpeciesScreen';
import { WipedStorageRecoveryModal } from './components/WipedStorageRecoveryModal';
import { formatSystemTaskTitle } from './core/calendarExport';
import { isSameSpecies, normalizeCalendarSyncSettings } from './core/models';
import { useBarnStore, WorkspaceRoute } from './hooks/useBarnStore';
import { useDeviceCapability } from './storage/deviceCapabilityDetector';
import { useOnlineStatus, usePWAInstall } from './storage/storageProtection';
import { lazyNamedRoute, RouteErrorBoundary, RouteLoadingFallback } from './utils/lazyRoute';
import { useAccessibleDialog } from './utils/useAccessibleDialog';

const SpeciesDashboardScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SpeciesDashboardScreen')['SpeciesDashboardScreen']>
>(() => import('./components/SpeciesDashboardScreen'), 'SpeciesDashboardScreen', 'Species Dashboard');

const HerdScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/HerdScreen')['HerdScreen']>
>(() => import('./components/HerdScreen'), 'HerdScreen', 'Herd Registry');

const BreedingScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/BreedingScreen')['BreedingScreen']>
>(() => import('./components/BreedingScreen'), 'BreedingScreen', 'Breeding Lab');

const PedigreeScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/PedigreeScreen')['PedigreeScreen']>
>(() => import('./components/PedigreeScreen'), 'PedigreeScreen', 'Pedigree Explorer');

const ReportsScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ReportsScreen')['ReportsScreen']>
>(() => import('./components/ReportsScreen'), 'ReportsScreen', 'Reports');

const SpeciesMemoScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SpeciesMemoScreen')['SpeciesMemoScreen']>
>(() => import('./components/SpeciesMemoScreen'), 'SpeciesMemoScreen', 'Species Memo');

const SettingsAndSyncScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SettingsAndSyncScreen')['SettingsAndSyncScreen']>
>(() => import('./components/SettingsAndSyncScreen'), 'SettingsAndSyncScreen', 'Import & Settings');

const CalendarSyncConfirmModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/CalendarIntegrationModals')['CalendarSyncConfirmModal']>
>(
  () => import('./components/CalendarIntegrationModals'),
  'CalendarSyncConfirmModal',
  'Calendar Sync'
);

const ROUTE_LABELS: Record<WorkspaceRoute, string> = {
  home: 'All Species',
  dashboard: 'Species Dashboard',
  herd: 'Herd Registry',
  breeding: 'Breeding Lab',
  pedigree: 'Pedigree Explorer',
  reports: 'Reports',
  memo: 'Species Memo',
  settings: 'Import & Settings',
};

export default function App() {
  const store = useBarnStore();
  const deviceCapability = useDeviceCapability();
  const isOnline = useOnlineStatus();
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();

  const [showHerdSpeciesPicker, setShowHerdSpeciesPicker] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);
  const [dismissedCompatBanner, setDismissedCompatBanner] = useState(false);
  const [shortcutToast, setShortcutToast] = useState<{ key: string; label: string } | null>(null);

  const shortcutToastTimerRef = useRef<number | null>(null);
  const herdPickerModalRef = useAccessibleDialog({
    isOpen: showHerdSpeciesPicker,
    onClose: () => setShowHerdSpeciesPicker(false),
  });
  const shortcutsModalRef = useAccessibleDialog({
    isOpen: showShortcutsHelp,
    onClose: () => setShowShortcutsHelp(false),
  });

  const triggerShortcutToast = useCallback((key: string, label: string) => {
    if (shortcutToastTimerRef.current !== null) {
      window.clearTimeout(shortcutToastTimerRef.current);
    }
    setShortcutToast({ key, label });
    shortcutToastTimerRef.current = window.setTimeout(() => {
      setShortcutToast(null);
      shortcutToastTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (shortcutToastTimerRef.current !== null) {
        window.clearTimeout(shortcutToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onGlobalShortcut = (e: KeyboardEvent) => {
      if (store.isLoading || !store.snapshot || !store.activeSpeciesData) return;
      if (store.wipedRecoveryContext?.detected) return;
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (showHerdSpeciesPicker || showShortcutsHelp || store.pendingCalendarSync) return;
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsHelp(true);
        triggerShortcutToast('?', 'Keyboard Shortcuts');
        return;
      }

      const key = e.key.toLowerCase();
      const shortcutMap: Record<string, { route: WorkspaceRoute; label: string }> = {
        h: { route: 'home', label: 'All Species' },
        d: { route: 'dashboard', label: 'Dashboard' },
        r: { route: 'herd', label: 'Herd' },
        b: { route: 'breeding', label: 'Breeding' },
        p: { route: 'pedigree', label: 'Pedigree' },
      };
      const entry = shortcutMap[key];
      if (!entry) return;

      e.preventDefault();
      if (entry.route === 'herd' && store.route === 'home') {
        setShowHerdSpeciesPicker(true);
        triggerShortcutToast(key.toUpperCase(), 'Select Herd');
      } else {
        store.setRoute(entry.route);
        triggerShortcutToast(key.toUpperCase(), entry.label);
      }
    };

    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
  }, [
    store.isLoading,
    store.snapshot,
    store.activeSpeciesData,
    store.route,
    store.setRoute,
    store.pendingCalendarSync,
    store.wipedRecoveryContext?.detected,
    showHerdSpeciesPicker,
    showShortcutsHelp,
    triggerShortcutToast,
  ]);

  if (store.isLoading) {
    return (
      <main className="min-h-screen bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3">
          <div className="h-5 w-44 rounded bg-[var(--barn-subtle)]" />
          <div className="h-4 w-64 rounded bg-[var(--barn-subtle)]" />
          <p className="text-xs text-[var(--barn-muted)] pt-1">
            Opening local offline database...
          </p>
        </div>
      </main>
    );
  }

  if (!store.snapshot || !store.activeSpeciesData) {
    return (
      <main className="min-h-screen bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
          <h1 className="font-display text-lg font-semibold">
            Local Database Recovery Needed
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            {store.errorMessage ||
              'The local offline database did not finish loading. You can reconnect or purge stale browser caches safely.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void store.resetDatabaseConnection()}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
            >
              Reconnect Database
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
            >
              Reload App
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { snapshot, activeSpeciesName, activeSpeciesData, route, setRoute } = store;
  const isActivePinned = isSameSpecies(
    snapshot.settings.pinnedLandingSpecies,
    activeSpeciesName
  );

  const handlePrimaryNavClick = (target: WorkspaceRoute) => {
    if (target === 'herd' && route === 'home') {
      setShowHerdSpeciesPicker(true);
      return;
    }
    setRoute(target);
  };

  const navItems: Array<{ id: WorkspaceRoute; label: string; shortcut: string }> = [
    { id: 'home', label: 'All Species', shortcut: 'h' },
    { id: 'dashboard', label: 'Dashboard', shortcut: 'd' },
    { id: 'herd', label: 'Herd', shortcut: 'r' },
    { id: 'breeding', label: 'Breeding', shortcut: 'b' },
    { id: 'pedigree', label: 'Pedigree', shortcut: 'p' },
    { id: 'reports', label: 'Reports', shortcut: '' },
  ];

  const showInstallReminder =
    !dismissedInstallBanner && !isInstalled && (canPromptInstall || isIos);

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex flex-col pb-16 md:pb-8">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-[var(--barn-sage)] focus:text-[var(--barn-on-sage)] focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-14 w-full bg-[var(--barn-surface)]/95 backdrop-blur-md border-b border-[var(--barn-border)] px-3 sm:px-6 flex items-center justify-between gap-2 md:gap-4 lg:gap-8 overflow-x-clip">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setRoute('home')}
          className="font-display text-base sm:text-lg font-semibold tracking-tight truncate min-w-0 text-left"
        >
          Community Pedigree
        </button>

        {/* Zone 2: 5 Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center md:gap-4 lg:gap-6 text-sm font-medium shrink-0"
        >
          {navItems.map((item) => {
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePrimaryNavClick(item.id)}
                aria-current={active ? 'page' : undefined}
                aria-keyshortcuts={item.shortcut || undefined}
                title={item.shortcut ? `${item.label} (Shortcut: ${item.shortcut.toUpperCase()})` : item.label}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                    : 'border-transparent text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Quick Reload, Offline Status, Light/Dark Toggle & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isOnline && (
            <span
              title="Operating in offline barn mode — all edits stay safe locally"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-[var(--barn-sage)] px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]"
            >
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              Offline Ready
            </span>
          )}

          <button
            type="button"
            onClick={() => window.location.reload()}
            title="Reload app preview (stays in full screen)"
            aria-label="Reload app preview"
            className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() =>
              void store.updateSettings(
                { themeMode: snapshot.settings.themeMode === 'dark' ? 'light' : 'dark' },
                { silent: true }
              )
            }
            title={
              snapshot.settings.themeMode === 'dark'
                ? 'Switch to Warm Light mode'
                : 'Switch to Original Woodland Dark mode'
            }
            aria-label={
              snapshot.settings.themeMode === 'dark'
                ? 'Switch to Light mode'
                : 'Switch to Dark mode'
            }
            className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
          >
            {snapshot.settings.themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-[var(--barn-terracotta)]" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--barn-ink)]" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowShortcutsHelp(true)}
            title="Keyboard shortcuts help (?)"
            aria-label="Keyboard shortcuts help"
            aria-keyshortcuts="?"
            className="hidden sm:inline-flex min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <HelpCircle className="w-4 h-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setRoute(route === 'settings' ? 'dashboard' : 'settings')}
            aria-current={route === 'settings' ? 'page' : undefined}
            aria-label={
              route === 'settings' ? `Back to ${activeSpeciesName}` : 'Import and Settings'
            }
            className={`min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              route === 'settings'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">{route === 'settings' ? 'Back' : 'Settings'}</span>
            <span className="hidden sm:inline">
              {route === 'settings' ? `Back to ${activeSpeciesName}` : 'Import & Settings'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 w-full min-w-0 max-w-7xl mx-auto px-3 sm:px-6 pt-5 space-y-5 focus:outline-none"
      >
        {/* Offline Barn Mode Banner on Mobile */}
        {!isOnline && (
          <div className="sm:hidden bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-3.5 py-2 text-xs font-medium flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>Offline Barn Mode — all records saved locally on device.</span>
          </div>
        )}

        {/* Home Screen Install & Storage Eviction Defense Prompt */}
        {showInstallReminder && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--barn-muted)]">
              {isIos ? (
                <>
                  <strong className="text-[var(--barn-ink)]">Protect Local Herd Data:</strong> Tap{' '}
                  <strong>Share</strong> &rarr; <strong>Add to Home Screen</strong> on iOS Safari so
                  your offline barn database stays immune to 7-day tab cleanup.
                </>
              ) : (
                <>
                  <strong className="text-[var(--barn-ink)]">Install Offline Barn PWA:</strong>{' '}
                  Add Community Pedigree to your Home Screen / Desktop for airplane-mode access and
                  elevated storage lock.
                </>
              )}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {canPromptInstall && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                >
                  Install App
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedInstallBanner(true)}
                className="min-h-[32px] px-2 text-[11px] text-[var(--barn-muted)] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Idle Export Canary Warning Banner (IMP-018) */}
        {store.exportCanaryWarning && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">Backup Canary Integrity Warning</div>
                <div className="text-[11px] text-[var(--barn-muted)] break-words">
                  {store.exportCanaryWarning}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {route !== 'settings' && (
                <button
                  type="button"
                  onClick={() => setRoute('settings')}
                  className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                >
                  Open Backups
                </button>
              )}
              <button
                type="button"
                onClick={store.dismissExportCanaryWarning}
                className="min-h-[32px] px-2 text-[11px] underline whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Proactive Unbacked-Edits Reminder Banner (IMP-001) */}
        {store.backupStatus && store.backupStatus.showDismissibleBanner && route !== 'settings' && (
          <div
            role="status"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="font-semibold">{store.backupStatus.headline}</div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {store.backupStatus.detail}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {store.opfsSupported && (
                <button
                  type="button"
                  onClick={() => void store.saveManualOpfsVaultBackup('Banner 1-click save')}
                  className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                >
                  Save to Vault
                </button>
              )}
              <button
                type="button"
                onClick={() => setRoute('settings')}
                className={`min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                  store.opfsSupported
                    ? 'border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)]'
                    : 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                }`}
              >
                Open Backups
              </button>
              <button
                type="button"
                onClick={() => void store.snoozeBackupReminder(24)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
              >
                Snooze 24h
              </button>
            </div>
          </div>
        )}

        {/* Polite WebAssembly-Unavailable / Older Browser Compatibility Notice */}
        {!dismissedCompatBanner &&
          (deviceCapability.browserCompatibility.wasmFallbackActive ||
            /json fallback/i.test(store.engineName) ||
            deviceCapability.browserCompatibility.isOutdatedBrowser) && (
            <div
              role="status"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="font-semibold">
                    {deviceCapability.browserCompatibility.wasmFallbackActive ||
                    /json fallback/i.test(store.engineName)
                      ? 'Compatibility Storage Mode Active (IndexedDB JSON)'
                      : 'Older Browser Compatibility Mode Active'}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {deviceCapability.browserCompatibility.wasmFallbackActive ||
                    /json fallback/i.test(store.engineName)
                      ? 'WebAssembly is unavailable or blocked in this browser, so your barn data saves safely in IndexedDB JSON mode instead of SQLite. Use Timestamped Backup (.JSON) for full exports.'
                      : 'You are on an older browser version. Core herd and pedigree tracking remain ready; if large .ZIP exports struggle, use Timestamped Backup (.JSON) instead.'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {route !== 'settings' && (
                  <button
                    type="button"
                    onClick={() => setRoute('settings')}
                    className="min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                  >
                    Open Backups &amp; Compatibility
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedCompatBanner(true)}
                  className="min-h-[32px] px-2 text-[11px] underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

        {/* Actionable Error / Quota / Persistence Failure Recovery Banner */}
        {store.errorMessage && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs font-medium flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span className="break-words">{store.errorMessage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {route !== 'settings' && (
                <button
                  type="button"
                  onClick={() => setRoute('settings')}
                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                >
                  Open Recovery &amp; Backups
                </button>
              )}
              <button
                type="button"
                onClick={store.clearErrorMessage}
                className="underline text-[11px] shrink-0"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Transient Barn Action Feedback Banner */}
        {store.statusMessage && (
          <div
            role="status"
            className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs font-medium flex items-center justify-between gap-3"
          >
            <span>{store.statusMessage}</span>
            <button
              type="button"
              onClick={store.clearStatusMessage}
              className="underline text-[11px] shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Post-Import Conflict Alert Banner (Non-Blocking Import With Locate Action) */}
        {store.importConflictAlert && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-0.5 min-w-0">
                <div className="font-semibold">
                  Import Conflict Alert ({store.importConflictAlert.conflictedCount} flagged record
                  {store.importConflictAlert.conflictedCount === 1 ? '' : 's'})
                </div>
                <div className="text-[11px] text-[var(--barn-muted)] break-words">
                  {store.importConflictAlert.message}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const targetSpecies =
                    store.importConflictAlert?.speciesNames[0] || activeSpeciesName;
                  store.locateConflictsInHerd(targetSpecies);
                  store.dismissImportConflictAlert();
                }}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
              >
                Locate Conflicted Animals
              </button>
              <button
                type="button"
                onClick={store.dismissImportConflictAlert}
                className="min-h-[32px] px-2 text-[11px] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Contextual Species Switcher Bar inside any Species Workspace */}
        {route !== 'home' && route !== 'settings' && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="active-species-switcher"
                className="text-xs text-[var(--barn-muted)]"
              >
                Active Livestock Workspace:
              </label>
              <select
                id="active-species-switcher"
                value={activeSpeciesName}
                onChange={(e) => store.selectSpeciesWorkspace(e.target.value, route)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-semibold"
              >
                {snapshot.speciesProfiles.map((sp) => (
                  <option key={sp.id} value={sp.name}>
                    {sp.name}
                  </option>
                ))}
              </select>

              <span className="text-xs text-[var(--barn-muted)] hidden md:inline">
                {activeSpeciesData.speciesProfile.maleLabel} /{' '}
                {activeSpeciesData.speciesProfile.femaleLabel} /{' '}
                {activeSpeciesData.speciesProfile.offspringLabel} ·{' '}
                {activeSpeciesData.speciesProfile.gestationDays}d gestation
              </span>
            </div>

            <button
              type="button"
              onClick={() => setRoute('home')}
              className="text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline whitespace-nowrap"
            >
              Switch Species Home
            </button>
          </div>
        )}

        {/* Active Screen Viewport */}
        {route === 'home' && (
          <HomeSpeciesScreen
            snapshot={snapshot}
            onOpenSpecies={store.selectSpeciesWorkspace}
            onMoveSpeciesCard={(id, dir) => {
              void store.moveSpeciesCard(id, dir);
            }}
            onReorderSpeciesCards={(ids) => {
              void store.reorderSpeciesCards(ids);
            }}
            onSaveBarnName={(name) => {
              void store.updateSettings(
                { barnName: name, barnNameOnboarded: true },
                { silent: false }
              );
            }}
            onHideSummaryGrid={() => {
              void store.updateSettings(
                { showHomeSummaryGrid: false },
                { silent: true }
              );
            }}
            onIgnoreTaskAlerts={(taskIds) => {
              void store.ignoreTaskAlertsPermanently(taskIds);
            }}
            onClearTaskAlertGroup={(speciesName, taskIds) => {
              void store.clearTaskAlertGroup(speciesName, taskIds);
            }}
            onDismissMemoAlert={(speciesName, signature) => {
              void store.dismissSpeciesMemoAlert(speciesName, signature);
            }}
            onToggleTaskCompleted={(task) => {
              void store.toggleTaskCompleted(task);
            }}
            onExportTasksToCalendar={(tasks, hint) => {
              store.exportTasksToCalendar(tasks, hint);
            }}
            onNavigateToAddSpecies={() => {
              store.setOpenAddSpeciesInSettings(true);
              setRoute('settings');
            }}
            deviceCapability={deviceCapability}
            onApplyLowMemorySettings={(patch) => {
              void store.updateSettings(patch);
            }}
            onOpenSettings={() => setRoute('settings')}
          />
        )}

        {route !== 'home' && (
          <RouteErrorBoundary
            routeKey={`${route}:${activeSpeciesName}`}
            routeLabel={ROUTE_LABELS[route]}
            onNavigateHome={() => setRoute('home')}
          >
            <Suspense fallback={<RouteLoadingFallback label={ROUTE_LABELS[route]} />}>
              {route === 'dashboard' && (
                <SpeciesDashboardScreen
                  snapshot={snapshot}
                  activeData={activeSpeciesData}
                  settings={snapshot.settings}
                  isPinned={isActivePinned}
            existingSpeciesNames={snapshot.speciesProfiles.map((sp) => sp.name)}
            onNavigate={setRoute}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onToggleTask={store.toggleTaskCompleted}
            onSaveTask={store.saveTask}
            onDeleteTask={store.deleteTask}
            onSaveCage={store.saveCage}
            onDeleteCage={store.deleteCage}
            onSaveShow={store.saveShow}
            onDeleteShow={store.deleteShow}
            onSeedSpeciesSample={store.seedSpeciesSampleData}
            onTogglePinSpecies={(speciesName) => {
              void store.togglePinSpeciesLanding(speciesName);
            }}
            onSaveSpecies={(profile) => {
              void store.saveSpeciesProfile(profile);
            }}
            onDeleteSpecies={(profile) => {
              void store.deleteSpeciesProfile(profile);
            }}
            onDeleteSpeciesTestingData={(speciesName) => {
              void store.deleteSpeciesTestingData(speciesName);
            }}
            onDeleteSpeciesNonTestingData={(speciesName) => {
              void store.deleteSpeciesNonTestingData(speciesName);
            }}
            onDeleteAllSpeciesRecords={(speciesName) => {
              void store.deleteAllSpeciesRecords(speciesName);
            }}
            onDownloadTimestampedSpeciesBackup={store.exportTimestampedSpeciesBackup}
            onMigrateAnimalsSpecies={async (ids, targetSpecies, options) => {
              await store.migrateAnimalsSpecies(ids, targetSpecies, options);
            }}
            onMoveHubBlock={(blockId, dir) => {
              void store.moveSpeciesHubBlock(activeSpeciesName, blockId, dir);
            }}
            onReorderHubBlocks={(orderedIds) => {
              void store.reorderSpeciesHubBlocks(activeSpeciesName, orderedIds);
            }}
            onExportTaskToCalendar={(task) => {
              store.exportTasksToCalendar(
                [task],
                formatSystemTaskTitle(task, snapshot.settings.calendarSync, snapshot)
              );
            }}
            onCopyTaskAppLink={(task) => {
              void store.copyTaskAppLink(task);
            }}
            highlightedTaskId={store.highlightedTaskId}
            onClearHighlightedTask={() => store.setHighlightedTaskId(null)}
            onHideSummaryGrid={() => {
              void store.updateSettings(
                { showHomeSummaryGrid: false },
                { silent: true }
              );
            }}
            onLocateConflicts={() => store.locateConflictsInHerd(activeSpeciesName)}
            onOpenSettings={() => setRoute('settings')}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
          />
        )}

        {route === 'herd' && (
          <HerdScreen
            snapshot={snapshot}
            activeData={activeSpeciesData}
            allAnimals={snapshot.animals}
            speciesProfiles={snapshot.speciesProfiles}
            settings={snapshot.settings}
            selectedAnimalId={store.selectedAnimalId}
            onSelectAnimal={store.setSelectedAnimalId}
            onOpenPedigreeForAnimal={(id) => {
              store.setPedigreeAnimalId(id);
              setRoute('pedigree');
            }}
            onSaveAnimal={(draft, pendingPhotos) =>
              store.saveAnimal(draft, undefined, pendingPhotos)
            }
            onAddAnimalPhotos={store.addOptimizedAnimalPhotos}
            onSetPrimaryAnimalPhoto={store.setPrimaryAnimalPhoto}
            onUpdateAnimalPhotoCaption={store.updateAnimalPhotoCaption}
            onDeleteAnimalPhoto={store.deleteAnimalPhoto}
            onDeleteAnimal={(animal) => {
              void store.deleteAnimal(animal);
            }}
            onArchiveAnimals={(ids, archived) => {
              void store.archiveAnimals(ids, archived);
            }}
            onDeleteAnimalsBatch={(ids) => {
              void store.deleteAnimalsBatch(ids);
            }}
            onMigrateAnimalsSpecies={async (ids, targetSpecies, options) => {
              await store.migrateAnimalsSpecies(ids, targetSpecies, options);
            }}
            onToggleIncludePhotoOnPedigree={(include) => {
              void store.updateSettings({ includePhotoOnPedigree: include }, { silent: true });
            }}
            onAddCareLog={(draft) => {
              void store.addCareLog(draft);
            }}
            onDeleteCareLog={(id) => {
              void store.deleteCareLog(id);
            }}
            onIgnoreConflicts={(animalId, kinds) => {
              void store.ignoreAnimalConflicts(animalId, kinds);
            }}
            onRestoreConflictAlert={(animalId, kinds) => {
              void store.restoreAnimalConflictAlert(animalId, kinds);
            }}
            requestedConflictFocusNonce={store.requestedHerdConflictNonce}
            onLoadFullPhoto={store.loadAnimalPhotoDataUrl}
            opfsSupported={store.opfsSupported}
            archivedHerdBundles={store.archivedHerdBundles}
            onOffloadAnimalsToOpfsArchive={store.offloadAnimalsToOpfsArchive}
            onRestoreArchivedHerdBundle={store.restoreArchivedHerdBundle}
            onDownloadArchivedHerdBundle={store.downloadArchivedHerdBundle}
            onDeleteArchivedHerdBundle={store.deleteArchivedHerdBundle}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
          />
        )}

        {route === 'breeding' && (
          <BreedingScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onLogBreeding={(params) => {
              void store.logBreedingWithCascade(params);
            }}
            onUpdateOutcome={(existing, patch) => {
              void store.updateBreedingOutcome(existing, patch);
            }}
            onDeleteBreeding={(id) => {
              void store.deleteBreeding(id);
            }}
          />
        )}

        {route === 'pedigree' && (
          <PedigreeScreen
            activeData={activeSpeciesData}
            allAnimals={snapshot.animals}
            speciesProfiles={snapshot.speciesProfiles}
            settings={snapshot.settings}
            selectedSubjectId={store.pedigreeAnimalId}
            generations={store.pedigreeGenerations}
            onSelectSubject={store.setPedigreeAnimalId}
            onChangeGenerations={store.setPedigreeGenerations}
            onOpenAnimalInHerd={(id) => {
              store.setSelectedAnimalId(id);
              setRoute('herd');
            }}
            onToggleIncludePhotoOnPedigree={(include) => {
              void store.updateSettings({ includePhotoOnPedigree: include }, { silent: true });
            }}
            onSaveAnimal={(draft, linkTarget, pendingPhotos) => {
              void store.saveAnimal(draft, linkTarget, pendingPhotos);
            }}
            onIgnoreConflicts={(animalId, kinds) => {
              void store.ignoreAnimalConflicts(animalId, kinds);
            }}
            onRestoreConflictAlert={(animalId, kinds) => {
              void store.restoreAnimalConflictAlert(animalId, kinds);
            }}
            onLoadFullPhoto={store.loadAnimalPhotoDataUrl}
          />
        )}

        {route === 'reports' && (
          <ReportsScreen
            snapshot={snapshot}
            activeSpeciesName={activeSpeciesName}
            speciesProfiles={snapshot.speciesProfiles}
            onSelectSpecies={(name) => store.selectSpeciesWorkspace(name, 'reports')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
          />
        )}

        {route === 'memo' && (
          <SpeciesMemoScreen
            speciesProfile={activeSpeciesData.speciesProfile}
            onSaveMemo={store.saveSpeciesMemo}
            onBackToHub={() => setRoute('dashboard')}
          />
        )}

        {route === 'settings' && (
          <SettingsAndSyncScreen
            snapshot={snapshot}
            engineName={store.engineName}
            activeSpeciesName={activeSpeciesName}
            deviceId={store.deviceId}
            storageStatus={store.storageStatus}
            backupStatus={store.backupStatus}
            syncOperations={store.syncOperations}
            syncConflicts={store.syncConflicts}
            openAddSpeciesOnMount={store.openAddSpeciesInSettings}
            onConsumedOpenAddSpecies={() => store.setOpenAddSpeciesInSettings(false)}
            onRequestPersistentStorage={store.triggerPersistentStorageRequest}
            recordBackupExport={store.recordBackupExport}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onSaveSpecies={(profile) => {
              void store.saveSpeciesProfile(profile);
            }}
            onDeleteSpecies={(profile) => {
              void store.deleteSpeciesProfile(profile);
            }}
            onDownloadTimestampedSpeciesBackup={store.exportTimestampedSpeciesBackup}
            onApplyPlatformImport={store.applyPlatformImportPreview}
            onImportJson={store.importJsonBackup}
            onImportBackupArchive={store.importBackupArchiveBytes}
            onImportDeltaOperations={store.importDeltaOperations}
            onResolveSyncConflict={store.resolveSyncConflict}
            onDismissSyncConflict={store.dismissSyncConflict}
            onBuildLocalDeltaJson={store.buildLocalDeltaJsonPayload}
            onRestoreRollingBackup={store.restoreRollingBackupByKey}
            onExportSqliteBytes={store.exportSqliteBytes}
            onImportSqliteBytes={store.importSqliteBytes}
            onScanDatabaseHealth={store.scanDatabaseHealth}
            onRepairDatabaseHealth={store.runHealthCheckAndRepair}
            onResetDatabaseConnection={store.resetDatabaseConnection}
            onPurgeCorruptedCaches={store.purgeCorruptedCachesAndRecover}
            onSeedAllSpecies={() => {
              void store.seedAllPredefinedSpecies();
            }}
            onClearAllRecords={() => {
              void store.clearAllRecordsKeepSpecies();
            }}
            onRestoreFactoryDefaults={() => {
              void store.restoreFactoryDefaults();
            }}
            onExportTasksToCalendar={store.exportTasksToCalendar}
            googleAuthConnected={store.googleAuthConnected}
            googleUserEmail={store.googleUserEmail}
            googleCalendars={store.googleCalendars}
            googleSyncBusy={store.googleSyncBusy}
            onConnectGoogleCalendar={store.connectGoogleCalendar}
            onDisconnectGoogleCalendar={store.disconnectGoogleCalendar}
            onRefreshGoogleCalendars={store.refreshGoogleCalendars}
            onLocateConflicts={() => store.locateConflictsInHerd(activeSpeciesName)}
            deviceCapability={deviceCapability}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
            opfsSupported={store.opfsSupported}
            opfsVaultBackups={store.opfsVaultBackups}
            rollingBackups={store.rollingBackups}
            archivedHerdBundles={store.archivedHerdBundles}
            onSaveManualOpfsVaultBackup={store.saveManualOpfsVaultBackup}
            onRestoreOpfsVaultBackup={store.restoreOpfsVaultBackup}
            onDownloadOpfsVaultBackup={store.downloadOpfsVaultBackupByKey}
            onDeleteOpfsVaultBackup={store.deleteOpfsVaultBackupByKey}
            onDeleteRollingBackup={store.deleteRollingIdbBackupByKey}
            onRestoreArchivedHerdBundle={store.restoreArchivedHerdBundle}
            onDownloadArchivedHerdBundle={store.downloadArchivedHerdBundle}
            onDeleteArchivedHerdBundle={store.deleteArchivedHerdBundle}
            backupSinkStatus={store.backupSinkStatus}
            pruneSinkWarning={store.pruneSinkWarning}
            onConnectBackupSink={store.connectBackupSinkFolder}
            onReauthorizeBackupSink={store.reauthorizeBackupSinkFolder}
            onDisconnectBackupSink={store.disconnectBackupSinkFolder}
            onSyncVaultToSinkNow={store.syncVaultBackupsToSinkNow}
            onDismissPruneWarning={store.dismissPruneSinkWarning}
          />
              )}
            </Suspense>
          </RouteErrorBoundary>
        )}

        {/* Quiet Desktop Keyboard Shortcuts Hint Footer */}
        {route !== 'settings' && (
          <footer className="hidden md:flex items-center justify-between gap-4 pt-3 pb-1 border-t border-[var(--barn-border)]/60 text-[11px] text-[var(--barn-muted)]">
            <span>
              Shortcuts: <kbd className="font-mono font-semibold text-[var(--barn-ink)]">H</kbd> Home ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">D</kbd> Dashboard ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">R</kbd> Herd ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">B</kbd> Breeding ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">P</kbd> Pedigree
            </span>
            <button
              type="button"
              onClick={() => setShowShortcutsHelp(true)}
              className="inline-flex items-center gap-1 hover:text-[var(--barn-ink)] underline underline-offset-2"
            >
              <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Help &amp; Shortcuts (?)
            </button>
          </footer>
        )}
      </main>

      {/* Online Google Calendar Confirmation + Automatic Offline .ICS Fallback */}
      {store.pendingCalendarSync && (
        <Suspense fallback={null}>
          <CalendarSyncConfirmModal
            pending={store.pendingCalendarSync}
            config={normalizeCalendarSyncSettings(snapshot.settings.calendarSync)}
            barnName={snapshot.settings.barnName}
            context={{
              animals: snapshot.animals,
              breedings: snapshot.breedings,
              speciesProfiles: snapshot.speciesProfiles,
              appBaseUrl:
                typeof window !== 'undefined'
                  ? `${window.location.origin}${window.location.pathname}`
                  : '',
            }}
            isSignedIn={store.googleAuthConnected}
            userEmail={store.googleUserEmail}
            isBusy={store.googleSyncBusy}
            isOnline={isOnline}
            onSignIn={store.connectGoogleCalendar}
            onConfirmGoogleSync={store.confirmGoogleCalendarSync}
            onFallbackOfflineIcs={store.fallbackPendingCalendarSyncToIcs}
            onCancel={store.cancelPendingCalendarSync}
          />
        </Suspense>
      )}

      {/* Blocking Wiped-Browser-Storage Recovery Gate (IMP-018) */}
      <WipedStorageRecoveryModal
        context={store.wipedRecoveryContext}
        archivedHerdBundles={store.archivedHerdBundles}
        onRestoreLatestOpfs={store.restoreLatestOpfsOnWipedRecovery}
        onRestoreArchivedBundle={(archiveKey) => store.restoreArchivedHerdBundle(archiveKey)}
        onImportJsonReplace={(jsonText) => store.importJsonBackup(jsonText, 'replace')}
        onImportArchiveReplace={(bytes, fileName) =>
          store.importBackupArchiveBytes(bytes, fileName, 'replace')
        }
        onImportSqlite={store.importSqliteBytes}
        onStartFresh={store.startFreshAfterWipedRecovery}
      />

      {/* Select Livestock Species Before Entering Herd from Home */}
      {showHerdSpeciesPicker && (
        <div
          ref={herdPickerModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="herd-species-picker-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHerdSpeciesPicker(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg p-6 space-y-4 focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="herd-species-picker-title" className="font-display text-xl font-semibold">
                  Select Livestock Herd
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Each species keeps its own separate herd, pedigree tree, and records.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHerdSpeciesPicker(false)}
                aria-label="Close species picker"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[60vh] overflow-y-auto">
              {snapshot.speciesProfiles.map((sp) => (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => {
                    setShowHerdSpeciesPicker(false);
                    store.selectSpeciesWorkspace(sp.name, 'herd');
                  }}
                  className="min-h-[48px] px-4 py-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)] text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <div>
                    <div className="text-sm font-semibold">{sp.name}</div>
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      {sp.maleLabel}s &amp; {sp.femaleLabel}s
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--barn-sage)] shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Quick-Reference Modal */}
      {showShortcutsHelp && (
        <div
          ref={shortcutsModalRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="keyboard-shortcuts-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcutsHelp(false);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-6 space-y-4 focus:outline-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="keyboard-shortcuts-title" className="font-display text-xl font-semibold">
                  Keyboard Shortcuts &amp; Navigation
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Single-key navigation works anywhere outside text inputs or open modals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                aria-label="Close keyboard shortcuts help"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl text-xs bg-[var(--barn-canvas)]">
              {[
                { key: 'H', label: 'All Species Home', desc: 'View barn summary & species hub list' },
                { key: 'D', label: 'Species Dashboard', desc: 'Open active species overview & tasks' },
                { key: 'R', label: 'Herd Registry', desc: 'Open Herd (or Select Livestock Herd from Home)' },
                { key: 'B', label: 'Breeding Lab', desc: 'COI pairing check, Punnett predictions & births' },
                { key: 'P', label: 'Pedigree Explorer', desc: 'Interactive 3–6 generation ancestry tree' },
                { key: '?', label: 'Shortcuts Help', desc: 'Open this quick keyboard reference' },
                { key: 'Tab / Esc', label: 'Dialog Controls', desc: 'Cycle controls inside modals or press Esc to close' },
              ].map((item) => (
                <div
                  key={item.key}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)]">{item.label}</div>
                    <div className="text-[11px] text-[var(--barn-muted)]">{item.desc}</div>
                  </div>
                  <kbd className="px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] font-semibold text-[var(--barn-ink)] shrink-0">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Brief Floating Toast for Keyboard Shortcut Navigation */}
      {shortcutToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-16 md:bottom-5 right-4 z-40 pointer-events-none bg-[var(--barn-surface)] border border-[var(--barn-sage)] text-[var(--barn-ink)] shadow-lg rounded-xl px-3.5 py-2 text-xs font-medium flex items-center gap-2"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 font-mono text-[11px] font-semibold text-[var(--barn-sage)]">
            {shortcutToast.key}
          </kbd>
          <span>
            {shortcutToast.label === 'Select Herd' || shortcutToast.label === 'Keyboard Shortcuts'
              ? `Opened ${shortcutToast.label}`
              : `Navigated to ${shortcutToast.label}`}
          </span>
        </div>
      )}

      {/* Mobile Pocket-First Bottom Navigation Bar (< 768px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[var(--barn-surface)]/95 backdrop-blur-md border-t border-[var(--barn-border)] grid grid-cols-6 items-center"
      >
        {(
          [
            ['home', 'Species', Home],
            ['dashboard', 'Barn', CalendarCheck],
            ['herd', 'Herd', ListFilter],
            ['breeding', 'Breeding', Sparkles],
            ['pedigree', 'Pedigree', GitFork],
            ['reports', 'Reports', FileBarChart2],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = route === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePrimaryNavClick(id)}
              aria-current={active ? 'page' : undefined}
              className={`h-full min-w-0 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[var(--barn-ink)] font-semibold' : 'text-[var(--barn-muted)]'
              }`}
            >
              <span
                className={`px-2 py-0.5 rounded-full transition-colors ${
                  active
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : ''
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span className="truncate max-w-full px-0.5">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
