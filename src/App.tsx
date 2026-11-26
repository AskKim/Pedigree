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
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Clock,
  FileBarChart2,
  GitFork,
  HelpCircle,
  Home,
  ListFilter,
  Moon,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  WifiOff,
  X,
} from 'lucide-react';
import { ComponentProps, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDefaultPedigreeBridge } from '@app/pedigreeAppWiring';
import { PlatformBridgeProvider } from '@app/PlatformBridgeContext';
import type { IPlatformBridge } from '@engine/bridge';
import { AsyncErrorToastHost } from './components/AsyncErrorToastHost';
import { HomeSpeciesScreen } from './components/HomeSpeciesScreen';
import { TechyStuffErrorBoundary } from './components/TechyStuffErrorBoundary';
import { formatSystemTaskTitle } from './domain/calendarExport';
import {
  createDefaultVetDocsFolderMeta,
  evaluateVetDocsBackupReminder,
  normalizeVetDocsFolderMeta,
  VetDocsFolderMeta,
} from './domain/healthReference';
import { isSameSpecies, normalizeCalendarSyncSettings } from './domain/models';
import { useBarnStore, WorkspaceRoute } from './hooks/useBarnStore';
import type { StorageAdapter } from './storage/storageAdapter';
import { useDeviceCapability } from './storage/deviceCapabilityDetector';
import { usePwaUpdateStatus } from './storage/pwaUpdateManager';
import {
  formatClockSkewHuman,
  useConnectivityStatus,
  usePWAInstall,
} from './storage/storageProtection';
import { markCleanSessionExit } from './storage/crashLogger';
import { getSafeLocalStorage } from './storage/storageProbes';
import { lazyNamedRoute, RouteErrorBoundary, RouteLoadingFallback } from './utils/lazyRoute';
import { subscribeOpenDialogCount, useAccessibleDialog } from './utils/useAccessibleDialog';
import { useAsyncSubmitLock } from './utils/useAsyncSubmitLock';

import type { ImportExportHubSection } from './components/ImportExportHubScreen';

const SpeciesDashboardScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SpeciesDashboardScreen')['SpeciesDashboardScreen']>
>(() => import('./components/SpeciesDashboardScreen'), 'SpeciesDashboardScreen', 'Species Dashboard');

const HerdScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/HerdScreen')['HerdScreen']>
>(() => import('./components/HerdScreen'), 'HerdScreen', 'Herd Registry');

const BarnBenchScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/BarnBenchScreen')['BarnBenchScreen']>
>(() => import('./components/BarnBenchScreen'), 'BarnBenchScreen', 'Barn Bench');

const BreedingScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/BreedingScreen')['BreedingScreen']>
>(() => import('./components/BreedingScreen'), 'BreedingScreen', 'Breeding Lab');

const PedigreeScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/PedigreeScreen')['PedigreeScreen']>
>(() => import('./components/PedigreeScreen'), 'PedigreeScreen', 'Pedigree Explorer');

const FeedLedgerScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/FeedLedgerScreen')['FeedLedgerScreen']>
>(() => import('./components/FeedLedgerScreen'), 'FeedLedgerScreen', 'Feed Ledger');

const EconomicsLedgerScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/EconomicsLedgerScreen')['EconomicsLedgerScreen']>
>(() => import('./components/EconomicsLedgerScreen'), 'EconomicsLedgerScreen', 'Economics & 4-H Ledger');

const ClientCrmScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ClientCrmScreen')['ClientCrmScreen']>
>(() => import('./components/ClientCrmScreen'), 'ClientCrmScreen', 'Client CRM & Waitlist');

const ReportsScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ReportsScreen')['ReportsScreen']>
>(() => import('./components/ReportsScreen'), 'ReportsScreen', 'Reports');

const SpeciesMemoScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SpeciesMemoScreen')['SpeciesMemoScreen']>
>(() => import('./components/SpeciesMemoScreen'), 'SpeciesMemoScreen', 'Species Memo');

const BarnJournalScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/BarnJournalScreen')['BarnJournalScreen']>
>(() => import('./components/BarnJournalScreen'), 'BarnJournalScreen', 'Personal Journal');

const JudgeNotebookScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/JudgeNotebookScreen')['JudgeNotebookScreen']>
>(() => import('./components/JudgeNotebookScreen'), 'JudgeNotebookScreen', "The Judge's Notebook");

const ImportExportHubScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/ImportExportHubScreen')['ImportExportHubScreen']>
>(() => import('./components/ImportExportHubScreen'), 'ImportExportHubScreen', 'Import / Export Hub');

const SettingsAndSyncScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SettingsAndSyncScreen')['SettingsAndSyncScreen']>
>(() => import('./components/SettingsAndSyncScreen'), 'SettingsAndSyncScreen', 'Settings');

const TechyStuffScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/TechyStuffScreen')['TechyStuffScreen']>
>(() => import('./components/TechyStuffScreen'), 'TechyStuffScreen', 'The Techy Stuff');

const PromptsDirectoryScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/PromptsDirectoryScreen')['PromptsDirectoryScreen']>
>(() => import('./components/PromptsDirectoryScreen'), 'PromptsDirectoryScreen', 'Prompts Directory');

const SuggestionsBacklogScreen = lazyNamedRoute<
  ComponentProps<typeof import('./components/SuggestionsBacklogScreen')['SuggestionsBacklogScreen']>
>(
  () => import('./components/SuggestionsBacklogScreen'),
  'SuggestionsBacklogScreen',
  'Suggestion Backlog'
);

const CalendarSyncConfirmModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/CalendarIntegrationModals')['CalendarSyncConfirmModal']>
>(
  () => import('./components/CalendarIntegrationModals'),
  'CalendarSyncConfirmModal',
  'Calendar Sync'
);

const WipedStorageRecoveryModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/WipedStorageRecoveryModal')['WipedStorageRecoveryModal']>
>(
  () => import('./components/WipedStorageRecoveryModal'),
  'WipedStorageRecoveryModal',
  'Storage Recovery'
);

const HealthReferenceModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/HealthReferencePanel')['HealthReferenceModal']>
>(
  () => import('./components/HealthReferencePanel'),
  'HealthReferenceModal',
  'Health Reference Library'
);

const HelpDocumentationModal = lazyNamedRoute<
  ComponentProps<typeof import('./components/HelpDocumentationModal')['HelpDocumentationModal']>
>(
  () => import('./components/HelpDocumentationModal'),
  'HelpDocumentationModal',
  'Documentation & Species Guides'
);

const ROUTE_LABELS: Record<WorkspaceRoute, string> = {
  home: 'All Species',
  dashboard: 'Species Dashboard',
  herd: 'Herd Registry',
  bench: 'Barn Bench',
  breeding: 'Breeding Lab',
  pedigree: 'Pedigree Explorer',
  feed: 'Feed Ledger',
  economics: 'Economics & 4-H Ledger',
  crm: 'Client CRM & Waitlist',
  reports: 'Reports',
  memo: 'Species Memo',
  journal: 'Personal Journal',
  judge: "Judge's Notebook",
  importExport: 'Import / Export Hub',
  settings: 'Settings',
  techyStuff: 'The Techy Stuff',
  prompts: 'Prompts Directory',
  suggestions: 'Suggestion Backlog',
};

export interface AppProps {
  bridge?: IPlatformBridge;
  storageAdapter?: StorageAdapter;
}

export default function App({ bridge, storageAdapter }: AppProps = {}) {
  const activeBridge = useMemo<IPlatformBridge>(
    () => bridge ?? getDefaultPedigreeBridge(),
    [bridge]
  );
  const store = useBarnStore({ storageAdapter, bridge: activeBridge });
  const deviceCapability = useDeviceCapability();
  const connectivity = useConnectivityStatus();
  const isOnline = connectivity.isEffectivelyOnline;
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();
  const { state: pwaUpdate, applyUpdate: applyPwaUpdate, dismissUpdate: dismissPwaUpdate } =
    usePwaUpdateStatus();

  const [showHerdSpeciesPicker, setShowHerdSpeciesPicker] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showHelpDocs, setShowHelpDocs] = useState(false);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);
  const [dismissedCompatBanner, setDismissedCompatBanner] = useState(false);
  const [dismissedClockDriftBanner, setDismissedClockDriftBanner] = useState(false);
  const [dismissedWithdrawalSpecies, setDismissedWithdrawalSpecies] = useState<string[]>([]);
  const [requestedHerdWithdrawalNonce, setRequestedHerdWithdrawalNonce] = useState(0);
  const [openDomModalCount, setOpenDomModalCount] = useState(0);
  const hasOpenModal = openDomModalCount > 0;
  const [importExportInitialSection, setImportExportInitialSection] =
    useState<ImportExportHubSection>('all');
  const [healthReferenceSection, setHealthReferenceSection] = useState<
    'all' | 'wikis' | 'pdfs' | null
  >(null);
  const [vetDocsMeta, setVetDocsMeta] = useState<VetDocsFolderMeta>(() => {
    const ls = getSafeLocalStorage();
    if (!ls) return createDefaultVetDocsFolderMeta();
    try {
      const raw = ls.getItem('pedigree.vetDocsMeta.v1');
      return raw ? normalizeVetDocsFolderMeta(JSON.parse(raw)) : createDefaultVetDocsFolderMeta();
    } catch {
      return createDefaultVetDocsFolderMeta();
    }
  });
  const [shortcutToast, setShortcutToast] = useState<{ key: string; label: string } | null>(null);
  const vaultBannerLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });
  const reconnectDbLock = useAsyncSubmitLock({ postSettleCooldownMs: 300 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onCustomMeta = (ev: Event) => {
      const customEv = ev as CustomEvent<VetDocsFolderMeta>;
      if (customEv.detail) {
        setVetDocsMeta(normalizeVetDocsFolderMeta(customEv.detail));
      }
    };
    const onStorageMeta = (ev: StorageEvent) => {
      if (ev.key !== 'pedigree.vetDocsMeta.v1') return;
      try {
        setVetDocsMeta(
          ev.newValue
            ? normalizeVetDocsFolderMeta(JSON.parse(ev.newValue))
            : createDefaultVetDocsFolderMeta()
        );
      } catch {
        setVetDocsMeta(createDefaultVetDocsFolderMeta());
      }
    };
    window.addEventListener('pedigree:vet-docs-meta-changed', onCustomMeta);
    window.addEventListener('storage', onStorageMeta);
    return () => {
      window.removeEventListener('pedigree:vet-docs-meta-changed', onCustomMeta);
      window.removeEventListener('storage', onStorageMeta);
    };
  }, []);

  const vetDocsReminder = evaluateVetDocsBackupReminder(vetDocsMeta);

  const openImportExportHub = useCallback(
    (section: ImportExportHubSection = 'all') => {
      setImportExportInitialSection(section);
      store.setRoute('importExport');
    },
    [store]
  );

  const shortcutToastTimerRef = useRef<number | null>(null);
  const herdPickerModalRef = useAccessibleDialog({
    isOpen: showHerdSpeciesPicker,
    onClose: () => setShowHerdSpeciesPicker(false),
  });
  const shortcutsModalRef = useAccessibleDialog({
    isOpen: showShortcutsHelp,
    onClose: () => setShowShortcutsHelp(false),
  });

  // Register app-level modals at priority 10 (LIFO) before route back unwinding
  useEffect(() => {
    if (!showHerdSpeciesPicker) return;
    return activeBridge.registerBackHandler(() => {
      setShowHerdSpeciesPicker(false);
      return true;
    }, 10);
  }, [activeBridge, showHerdSpeciesPicker]);

  useEffect(() => {
    if (!showShortcutsHelp) return;
    return activeBridge.registerBackHandler(() => {
      setShowShortcutsHelp(false);
      return true;
    }, 10);
  }, [activeBridge, showShortcutsHelp]);

  useEffect(() => {
    if (!showHelpDocs) return;
    return activeBridge.registerBackHandler(() => {
      setShowHelpDocs(false);
      return true;
    }, 10);
  }, [activeBridge, showHelpDocs]);

  useEffect(() => {
    if (!store.pendingCalendarSync) return;
    return activeBridge.registerBackHandler(() => {
      store.cancelPendingCalendarSync();
      return true;
    }, 10);
  }, [activeBridge, store.pendingCalendarSync, store.cancelPendingCalendarSync]);

  // Fallback at priority 5 for child-screen [role="dialog"] modals using useAccessibleDialog
  useEffect(() => {
    if (!hasOpenModal) return;
    return activeBridge.registerBackHandler(() => {
      if (typeof document === 'undefined') return false;
      const openDialog = document.querySelector('[role="dialog"], [aria-modal="true"]');
      if (!openDialog) return false;
      // Dispatch once on document; bubbles: true propagates to window without firing twice.
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      return true;
    }, 5);
  }, [activeBridge, hasOpenModal]);

  // Lightweight browser history entries per open modal so stacked dialogs unwind cleanly on Back
  const modalHistoryDepthRef = useRef(0);
  const pendingProgrammaticBackRef = useRef(0);
  const latestModalCloseRef = useRef({
    hasOpenModal,
    showHerdSpeciesPicker,
    showShortcutsHelp,
    pendingCalendarSync: Boolean(store.pendingCalendarSync),
    cancelPendingCalendarSync: store.cancelPendingCalendarSync,
  });
  latestModalCloseRef.current = {
    hasOpenModal,
    showHerdSpeciesPicker,
    showShortcutsHelp,
    pendingCalendarSync: Boolean(store.pendingCalendarSync),
    cancelPendingCalendarSync: store.cancelPendingCalendarSync,
  };

  useEffect(() => {
    if (typeof window === 'undefined' || activeBridge.getCapabilities().hasNativeBridge) return;
    const appModalCount =
      (showHerdSpeciesPicker ? 1 : 0) +
      (showShortcutsHelp ? 1 : 0) +
      (store.pendingCalendarSync ? 1 : 0);
    const effectiveModalDepth = Math.max(openDomModalCount, appModalCount);

    if (effectiveModalDepth > modalHistoryDepthRef.current) {
      while (modalHistoryDepthRef.current < effectiveModalDepth) {
        modalHistoryDepthRef.current += 1;
        try {
          window.history.pushState(
            { pedigreeModal: true, modalDepth: modalHistoryDepthRef.current },
            '',
            window.location.href
          );
        } catch {
          // Ignore history restriction
        }
      }
    } else if (effectiveModalDepth < modalHistoryDepthRef.current) {
      const delta = modalHistoryDepthRef.current - effectiveModalDepth;
      modalHistoryDepthRef.current = effectiveModalDepth;
      const currentState = window.history.state as { pedigreeModal?: boolean } | null;
      if (currentState && currentState.pedigreeModal) {
        pendingProgrammaticBackRef.current += 1;
        try {
          window.history.go(-delta);
        } catch {
          pendingProgrammaticBackRef.current = Math.max(
            0,
            pendingProgrammaticBackRef.current - 1
          );
        }
      }
    }
  }, [activeBridge, openDomModalCount, showHerdSpeciesPicker, showShortcutsHelp, store.pendingCalendarSync]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeBridge.getCapabilities().hasNativeBridge) return;
    const onModalPopState = () => {
      if (pendingProgrammaticBackRef.current > 0) {
        pendingProgrammaticBackRef.current -= 1;
        return;
      }
      if (modalHistoryDepthRef.current <= 0) return;
      modalHistoryDepthRef.current -= 1;
      const current = latestModalCloseRef.current;
      if (current.showHerdSpeciesPicker) {
        setShowHerdSpeciesPicker(false);
        return;
      }
      if (current.showShortcutsHelp) {
        setShowShortcutsHelp(false);
        return;
      }
      if (current.pendingCalendarSync) {
        current.cancelPendingCalendarSync();
        return;
      }
      if (current.hasOpenModal && typeof document !== 'undefined') {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
      }
    };
    window.addEventListener('popstate', onModalPopState);
    return () => window.removeEventListener('popstate', onModalPopState);
  }, [activeBridge]);

  const bootStableMarkedRef = useRef(false);
  useEffect(() => {
    if (store.isLoading || bootStableMarkedRef.current) return;
    bootStableMarkedRef.current = true;
    if (typeof window !== 'undefined') {
      window.__PEDIGREE_MARK_BOOT_STABLE__?.();
    }
  }, [store.isLoading]);

  useEffect(() => {
    return subscribeOpenDialogCount((modalCount) => {
      setOpenDomModalCount((prev) => (prev === modalCount ? prev : modalCount));
    });
  }, []);

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
      if (e.isComposing || e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (showHerdSpeciesPicker || showShortcutsHelp || store.pendingCalendarSync) return;
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"], [aria-modal="true"]')) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable ||
          Boolean(
            target.closest(
              '[role="combobox"], [role="listbox"], [role="menu"], [role="slider"], [role="application"]'
            )
          )
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
        k: { route: 'bench', label: 'Barn Bench' },
        b: { route: 'breeding', label: 'Breeding' },
        p: { route: 'pedigree', label: 'Pedigree' },
        f: { route: 'feed', label: 'Feed Ledger' },
        e: { route: 'economics', label: 'Economics & 4-H Ledger' },
        c: { route: 'crm', label: 'Client CRM & Waitlist' },
        j: { route: 'journal', label: 'Personal Journal' },
        g: { route: 'judge', label: "Judge's Notebook" },
        o: { route: 'reports', label: 'Reports' },
        i: { route: 'importExport', label: 'Import / Export Hub' },
        s: { route: 'settings', label: 'Settings' },
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
              disabled={reconnectDbLock.isSubmitting}
              aria-busy={reconnectDbLock.isSubmitting}
              onClick={() => void reconnectDbLock.runLocked(() => store.resetDatabaseConnection())}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
            >
              {reconnectDbLock.isSubmitting ? 'Reconnecting...' : 'Reconnect Database'}
            </button>
            <button
              type="button"
              onClick={() => {
                markCleanSessionExit();
                window.location.reload();
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
            >
              Reload App
            </button>
          </div>
        </div>
        <AsyncErrorToastHost
          onOpenDiagnostics={() => store.setRoute('techyStuff')}
          onOpenBackups={() => openImportExportHub('backup')}
          isOnSettingsRoute={store.route === 'techyStuff'}
          isOnBackupsRoute={store.route === 'importExport'}
        />
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
    { id: 'reports', label: 'Reports', shortcut: 'o' },
    { id: 'importExport', label: 'Import / Export', shortcut: 'i' },
  ];

  const showInstallReminder =
    !activeBridge.getCapabilities().hasNativeBridge &&
    !dismissedInstallBanner &&
    !isInstalled &&
    (canPromptInstall || isIos);

  return (
    <PlatformBridgeProvider bridge={activeBridge}>
    <div className="min-h-screen overflow-x-clip bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex flex-col pb-16 md:pb-8">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-[var(--barn-sage)] focus:text-[var(--barn-on-sage)] focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-14 w-full bg-[var(--barn-surface)]/95 backdrop-blur-md border-b border-[var(--barn-border)] px-3 sm:px-6 flex items-center justify-between gap-2 md:gap-3 lg:gap-6 overflow-x-clip">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setRoute('home')}
          className="font-display text-base sm:text-lg font-semibold tracking-tight truncate min-w-0 text-left"
        >
          Pedigree
        </button>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center md:gap-2.5 lg:gap-5 text-xs lg:text-sm font-medium shrink-0"
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
            <button
              type="button"
              onClick={() => setRoute('techyStuff')}
              title={
                connectivity.reason === 'manual_offline'
                  ? 'Manual App Offline Mode enabled — click to manage in The Techy Stuff'
                  : connectivity.reason === 'captive_or_unreachable'
                  ? 'Network probe could not reach origin — click to probe in The Techy Stuff'
                  : 'Operating in offline barn mode — click to inspect connectivity'
              }
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-[var(--barn-sage)] px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] hover:opacity-90"
            >
              <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
              {connectivity.reason === 'manual_offline'
                ? 'App Offline'
                : connectivity.reason === 'captive_or_unreachable'
                ? 'No Internet'
                : 'Offline Ready'}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              markCleanSessionExit();
              window.location.reload();
            }}
            title="Reload app preview (stays in full screen)"
            aria-label="Reload app preview"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
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
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
          >
            {snapshot.settings.themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-[var(--barn-terracotta)]" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--barn-ink)]" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowHelpDocs(true)}
            title="Documentation & Species Guides"
            aria-label="Open documentation and species guides"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
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
            onClick={() =>
              route === 'importExport' ? setRoute('dashboard') : openImportExportHub('all')
            }
            aria-current={route === 'importExport' ? 'page' : undefined}
            title={
              route === 'importExport'
                ? `Back to ${activeSpeciesName}`
                : 'Import / Export Hub (Shortcut: I)'
            }
            aria-label={
              route === 'importExport' ? `Back to ${activeSpeciesName}` : 'Import / Export Hub'
            }
            className={`md:hidden min-h-[44px] min-w-[44px] px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 ${
              route === 'importExport'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Import / Export</span>
          </button>

          <button
            type="button"
            onClick={() => setRoute(route === 'settings' ? 'dashboard' : 'settings')}
            aria-current={route === 'settings' ? 'page' : undefined}
            aria-keyshortcuts="s"
            title={
              route === 'settings'
                ? `Back to ${activeSpeciesName}`
                : 'Settings (Shortcut: S)'
            }
            aria-label={
              route === 'settings' ? `Back to ${activeSpeciesName}` : 'Settings'
            }
            className={`min-h-[44px] sm:min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              route === 'settings'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">{route === 'settings' ? 'Back' : 'Settings'}</span>
            <span className="hidden sm:inline">
              {route === 'settings' ? `Back to ${activeSpeciesName}` : 'Settings'}
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
          <div className="sm:hidden bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-xl px-3.5 py-2 text-xs font-medium flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <WifiOff className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span className="truncate">
                {connectivity.reason === 'manual_offline'
                  ? 'Manual App Offline Mode — network actions held locally.'
                  : connectivity.reason === 'captive_or_unreachable'
                  ? 'Unreachable or captive Wi-Fi — saving locally.'
                  : 'Offline Barn Mode — all records saved locally on device.'}
              </span>
            </span>
          </div>
        )}

        {/* Release Status / Upgrade Gate Block Warning */}
        {pwaUpdate.policy !== 'pinned' &&
          pwaUpdate.gateDecision &&
          !pwaUpdate.gateDecision.canProceedWithDirectSwSwap && (
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
                  <div className="font-semibold">{pwaUpdate.gateDecision.headline}</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {pwaUpdate.gateDecision.detail}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {pwaUpdate.gateDecision.status === 'requires_verified_backup' && (
                  <button
                    type="button"
                    onClick={() => void store.createAndVerifyPreUpgradeBackup()}
                    className="min-h-[34px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                  >
                    Verify &amp; Download Safety Backup
                  </button>
                )}
                {route !== 'settings' && (
                  <button
                    type="button"
                    onClick={() => setRoute('settings')}
                    className="min-h-[34px] max-w-full px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-semibold"
                  >
                    Manage Updates in Settings
                  </button>
                )}
              </div>
            </div>
          )}

        {/* Manual Service Worker Update Gate with Policy Governor & Open-Dialog Protection */}
        {pwaUpdate.policy !== 'pinned' &&
          pwaUpdate.updateAvailable &&
          !pwaUpdate.dismissed &&
          (pwaUpdate.policy === 'notify' ? (
            <div
              role="status"
              aria-live="polite"
              className="bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[var(--barn-ink)] rounded-xl px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2 text-[var(--barn-muted)]">
                <RefreshCw className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
                <span>
                  <strong className="text-[var(--barn-ink)]">App Update Available</strong> (passive notify mode).
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {route !== 'settings' && (
                  <button
                    type="button"
                    onClick={() => setRoute('settings')}
                    className="min-h-[30px] max-w-full px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                  >
                    Review in Settings
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismissPwaUpdate}
                  className="min-h-[30px] px-2 text-[11px] underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <RefreshCw className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold">App Update Ready Offline</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {hasOpenModal
                      ? 'Update deferred while a dialog or editor is open. Save and close your open window before applying so unsaved edits are protected.'
                      : 'A newer cached version of Community Pedigree is ready. Apply now to reload cleanly across open tabs.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  disabled={hasOpenModal || pwaUpdate.applying}
                  onClick={() => void applyPwaUpdate()}
                  title={
                    hasOpenModal
                      ? 'Close the active editor dialog first to protect unsaved changes'
                      : 'Activate waiting update and reload cleanly'
                  }
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pwaUpdate.applying
                    ? 'Applying Update...'
                    : hasOpenModal
                    ? 'Finish Editing First'
                    : 'Apply Update & Reload'}
                </button>
                <button
                  type="button"
                  onClick={dismissPwaUpdate}
                  className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
                >
                  Later
                </button>
              </div>
            </div>
          ))}

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
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {canPromptInstall && (
                <button
                  type="button"
                  onClick={() => void promptInstall()}
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                >
                  Install App
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedInstallBanner(true)}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] text-[var(--barn-muted)] underline"
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
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {route !== 'importExport' && (
                <button
                  type="button"
                  onClick={() => openImportExportHub('backup')}
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
                >
                  Open Backups
                </button>
              )}
              <button
                type="button"
                onClick={store.dismissExportCanaryWarning}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Persistent 403 / 507 Cloud Quota Circuit Breaker Banner (IMP-060) */}
        {store.cloudSyncState.circuitBreaker.tripped &&
          !store.cloudSyncState.circuitBreaker.warningDismissedAtIso && (
          <div
            role="alert"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <ShieldAlert
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">
                  Optional Cloud Sync Paused (HTTP{' '}
                  {store.cloudSyncState.circuitBreaker.statusCode ?? '403/507'} Quota)
                </div>
                <div className="text-[11px] text-[var(--barn-muted)] break-words">
                  {store.cloudSyncState.circuitBreaker.reason ||
                    'Cloud app-folder storage or rate quota ceiling was reached.'}{' '}
                  Local IndexedDB saves continue uninterrupted.
                  {store.cloudSyncState.circuitBreaker.lastPrunedCount > 0
                    ? ` Pruned ${store.cloudSyncState.circuitBreaker.lastPrunedCount} old rolling backup(s).`
                    : ''}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {route !== 'importExport' && (
                <button
                  type="button"
                  onClick={() => openImportExportHub('sync')}
                  className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-[11px] font-semibold"
                >
                  Review Cloud Sync
                </button>
              )}
              <button
                type="button"
                onClick={store.dismissCloudCircuitBreakerWarning}
                className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Proactive Unbacked-Edits Reminder Banner (IMP-001) */}
        {store.backupStatus &&
          store.backupStatus.showDismissibleBanner &&
          route !== 'importExport' && (
          <div
            role="status"
            className="w-full bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div className="w-full md:w-auto md:min-w-0 md:flex-1 space-y-1">
              <div className="font-semibold leading-snug">{store.backupStatus.headline}</div>
              <div className="text-[11px] leading-relaxed text-[var(--barn-muted)]">
                {store.backupStatus.detail}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:shrink-0">
              {store.opfsSupported && (
                <button
                  type="button"
                  disabled={vaultBannerLock.isSubmitting}
                  aria-busy={vaultBannerLock.isSubmitting}
                  onClick={() =>
                    void vaultBannerLock.runLocked(() =>
                      store.saveManualOpfsVaultBackup('Banner 1-click save')
                    )
                  }
                  className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
                >
                  {vaultBannerLock.isSubmitting ? 'Saving...' : 'Save to Vault'}
                </button>
              )}
              <button
                type="button"
                onClick={() => openImportExportHub('backup')}
                className={`min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
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
                className="min-h-[44px] sm:min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
              >
                Snooze 24h
              </button>
            </div>
          </div>
        )}

        {/* Periodic External Veterinary PDF Folder Backup Reminder Banner */}
        {vetDocsReminder.showBanner && (
          <div
            role="status"
            className="w-full bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-3 text-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div className="w-full md:w-auto md:min-w-0 md:flex-1 space-y-1">
              <div className="font-semibold leading-snug">{vetDocsReminder.headline}</div>
              <div className="text-[11px] leading-relaxed text-[var(--barn-muted)]">
                {vetDocsReminder.detail}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:shrink-0">
              <button
                type="button"
                onClick={() => {
                  void import('./storage/vetDocsFolder').then((mod) => {
                    mod.markVetDocsBackedUpNow();
                  });
                }}
                className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
              >
                Mark Backed Up Today
              </button>
              <button
                type="button"
                onClick={() => setHealthReferenceSection('pdfs')}
                className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap"
              >
                Open Vet PDF Folder
              </button>
              <button
                type="button"
                onClick={() => {
                  void import('./storage/vetDocsFolder').then((mod) => {
                    mod.snoozeVetDocsBackupReminder(7);
                  });
                }}
                className="min-h-[44px] sm:min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
              >
                Snooze 7d
              </button>
            </div>
          </div>
        )}

        {/* Clock Skew / Drift Nudge Banner (IMP-023) */}
        {connectivity.clockDriftWarning && !dismissedClockDriftBanner && (
          <div
            role="status"
            className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2.5"
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <Clock
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-0.5">
                <div className="font-semibold">
                  Device Clock Appears Off ({formatClockSkewHuman(connectivity.clockSkewMs)})
                </div>
                <div className="text-[11px] text-[var(--barn-muted)]">
                  Multi-worker sync timestamps are automatically compensated so your edits stay in
                  order, though checking your device&apos;s Date &amp; Time settings keeps due-date
                  alerts accurate.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDismissedClockDriftBanner(true)}
              className="min-h-[44px] sm:min-h-[32px] px-2.5 text-[11px] underline whitespace-nowrap shrink-0"
            >
              Dismiss
            </button>
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
              <div className="flex flex-wrap items-center gap-2 max-w-full">
                {route !== 'importExport' && (
                  <button
                    type="button"
                    onClick={() => openImportExportHub('backup')}
                    className="min-h-[44px] sm:min-h-[32px] max-w-full px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-semibold hover:bg-[var(--barn-subtle)]"
                  >
                    Open Backups &amp; Compatibility
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDismissedCompatBanner(true)}
                  className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] underline"
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
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              {route !== 'importExport' && (
                <button
                  type="button"
                  onClick={() => openImportExportHub('backup')}
                  className="min-h-[44px] sm:min-h-[30px] max-w-full px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
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
            className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-[var(--barn-ink)] rounded-xl px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3"
          >
            <span className="min-w-0 flex-1 break-words">{store.statusMessage}</span>
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
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <button
                type="button"
                onClick={() => {
                  const targetSpecies =
                    store.importConflictAlert?.speciesNames[0] || activeSpeciesName;
                  store.locateConflictsInHerd(targetSpecies);
                  store.dismissImportConflictAlert();
                }}
                className="min-h-[32px] max-w-full px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold"
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
        {route !== 'home' &&
          route !== 'settings' &&
          route !== 'importExport' &&
          route !== 'techyStuff' &&
          route !== 'prompts' &&
          route !== 'suggestions' && (
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
            dismissedWithdrawalSpecies={dismissedWithdrawalSpecies}
            onDismissWithdrawalAlert={(speciesName) => {
              const key = speciesName.trim().toLowerCase();
              if (!key) return;
              setDismissedWithdrawalSpecies((prev) => (prev.includes(key) ? prev : [...prev, key]));
            }}
            onOpenWithdrawalHerd={(speciesName) => {
              store.selectSpeciesWorkspace(speciesName, 'herd');
              setRequestedHerdWithdrawalNonce((n) => n + 1);
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
            onOpenImportExportHub={openImportExportHub}
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
            onCompleteBreedingTask={store.completeBreedingTaskWithOutcome}
            onRecalculatePostBirthTasks={store.recalculateBreedingPostBirthTasks}
            onSaveTask={store.saveTask}
            onDeleteTask={store.deleteTask}
            onSaveCage={store.saveCage}
            onDeleteCage={store.deleteCage}
            onAssignAnimalToCage={store.assignAnimalToCage}
            onSaveShow={store.saveShow}
            onDeleteShow={store.deleteShow}
            onSeedSpeciesSample={store.seedSpeciesSampleData}
            onTogglePinSpecies={(speciesName) => {
              void store.togglePinSpeciesLanding(speciesName);
            }}
            onSaveSpecies={(profile) => store.saveSpeciesProfile(profile)}
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
            highlightedCageId={store.highlightedCageId}
            onClearHighlightedCage={() => store.setHighlightedCageId(null)}
            onHideSummaryGrid={() => {
              void store.updateSettings(
                { showHomeSummaryGrid: false },
                { silent: true }
              );
            }}
            onLocateConflicts={() => store.locateConflictsInHerd(activeSpeciesName)}
            onOpenSettings={() => setRoute('settings')}
            onOpenImportExportHub={openImportExportHub}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
            deviceId={store.deviceId}
            syncOperations={store.syncOperations}
            syncConflicts={store.syncConflicts}
            backupSyncStatus={store.backupSyncStatus}
            onRescheduleTask={store.rescheduleTask}
            onApplySmartEscalations={store.applySmartTaskEscalations}
            onReconcileOutboxOps={store.reconcileP2pOutboxOps}
            onResolveSyncConflict={store.resolveSyncConflict}
            onDismissSyncConflict={store.dismissSyncConflict}
            onBuildLocalDeltaJson={store.buildLocalDeltaJsonPayload}
            onOpenHealthReference={(section) => setHealthReferenceSection(section || 'all')}
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
            onArchiveAnimals={(ids, archived) => store.archiveAnimals(ids, archived)}
            onDeleteAnimalsBatch={(ids) => {
              void store.deleteAnimalsBatch(ids);
            }}
            onMigrateAnimalsSpecies={async (ids, targetSpecies, options) => {
              await store.migrateAnimalsSpecies(ids, targetSpecies, options);
            }}
            onToggleIncludePhotoOnPedigree={(include) => {
              void store.updateSettings({ includePhotoOnPedigree: include }, { silent: true });
            }}
            onAddCareLog={(draft) => store.addCareLog(draft)}
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
            requestedWithdrawalFocusNonce={requestedHerdWithdrawalNonce}
            onConsumeWithdrawalFocus={() => setRequestedHerdWithdrawalNonce(0)}
            onLoadFullPhoto={store.loadAnimalPhotoDataUrl}
            onLoadFullPhotosBatch={store.loadAnimalPhotoDataUrlsBatch}
            opfsSupported={store.opfsSupported}
            archivedHerdBundles={store.archivedHerdBundles}
            onOffloadAnimalsToOpfsArchive={store.offloadAnimalsToOpfsArchive}
            onRestoreArchivedHerdBundle={store.restoreArchivedHerdBundle}
            onDownloadArchivedHerdBundle={store.downloadArchivedHerdBundle}
            onDeleteArchivedHerdBundle={store.deleteArchivedHerdBundle}
            onOpenBarnBench={() => setRoute('bench')}
            onCompareGrowthForAnimals={store.openGrowthCompareForAnimals}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onSaveWoolHarvest={store.saveWoolHarvest}
            onDeleteWoolHarvest={store.deleteWoolHarvest}
            onOpenHealthReference={(section) => setHealthReferenceSection(section || 'all')}
            isConstrainedDevice={deviceCapability.assessment.shouldApplyLowMemoryHandling}
          />
        )}

        {route === 'bench' && (
          <BarnBenchScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onCommitEntry={store.commitBarnBenchEntry}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onBackToHub={() => setRoute('dashboard')}
          />
        )}

        {route === 'breeding' && (
          <BreedingScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onLogBreeding={(params) => store.logBreedingWithCascade(params)}
            onUpdateOutcome={(existing, patch) => store.updateBreedingOutcome(existing, patch)}
            onRecalculatePostBirthTasks={(breedingId) =>
              store.recalculateBreedingPostBirthTasks(breedingId)
            }
            onDeleteBreeding={(id) => {
              void store.deleteBreeding(id);
            }}
            preselectedGrowthAnimalIds={store.preselectedGrowthAnimalIds}
            onConsumePreselectedGrowthAnimalIds={() => store.setPreselectedGrowthAnimalIds(null)}
            onSaveTargetWeightCurve={store.updateSpeciesTargetWeightCurve}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
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
            onSaveAnimal={(draft, linkTarget, pendingPhotos) =>
              store.saveAnimal(draft, linkTarget, pendingPhotos)
            }
            onIgnoreConflicts={(animalId, kinds) => {
              void store.ignoreAnimalConflicts(animalId, kinds);
            }}
            onRestoreConflictAlert={(animalId, kinds) => {
              void store.restoreAnimalConflictAlert(animalId, kinds);
            }}
            onLoadFullPhoto={store.loadAnimalPhotoDataUrl}
            onLoadFullPhotosBatch={store.loadAnimalPhotoDataUrlsBatch}
            onLoadPedigreeNeighborhood={store.loadPedigreeNeighborhood}
            onCheckPedigreeBranchesHaveAncestors={store.checkPedigreeBranchesHaveAncestors}
            onUpdateBreederLogo={(dataUrl) => {
              void store.updateSettings({ breederLogoDataUrl: dataUrl }, { silent: true });
            }}
          />
        )}

        {route === 'feed' && (
          <FeedLedgerScreen
            snapshot={snapshot}
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onSaveFeedBatch={store.saveFeedBatch}
            onDeleteFeedBatch={store.deleteFeedBatch}
            onLogFeedAllocation={store.logFeedAllocation}
            onDeleteFeedAllocation={store.deleteFeedAllocation}
            onRunBiosecurityPurge={store.runFeedTagBiosecurityAutoPurge}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onLoadFullTagPhoto={store.loadFeedBatchTagPhotoDataUrl}
          />
        )}

        {route === 'economics' && (
          <EconomicsLedgerScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onSaveLedgerEntry={store.saveLedgerEntry}
            onDeleteLedgerEntry={store.deleteLedgerEntry}
            onSaveProcessingLog={store.saveProcessingLog}
            onDeleteProcessingLog={store.deleteProcessingLog}
            onSaveYouthProjectBook={store.saveYouthProjectBook}
            onDeleteYouthProjectBook={store.deleteYouthProjectBook}
            onSaveMileageLog={store.saveMileageLog}
            onDeleteMileageLog={store.deleteMileageLog}
            onLoadFullReceiptPhoto={store.loadLedgerEntryReceiptPhotoDataUrl}
          />
        )}

        {route === 'crm' && (
          <ClientCrmScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onOpenReports={() => setRoute('reports')}
            onSaveClient={store.saveClientContact}
            onDeleteClient={store.deleteClientContact}
            onSaveWaitlistEntry={store.saveWaitlistEntry}
            onDeleteWaitlistEntry={store.deleteWaitlistEntry}
            onSaveReservation={store.saveAnimalReservation}
            onDeleteReservation={store.deleteAnimalReservation}
            onCompleteReservationSale={store.completeReservationSale}
            onCreateReminderTask={store.createCrmReminderTask}
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
            onOpenJournal={() => setRoute('journal')}
          />
        )}

        {route === 'journal' && (
          <BarnJournalScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onOpenMemo={() => setRoute('memo')}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onSaveJournalEntry={store.saveJournalEntry}
            onDeleteJournalEntry={store.deleteJournalEntry}
          />
        )}

        {route === 'judge' && (
          <JudgeNotebookScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onBackToHub={() => setRoute('dashboard')}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onOpenEconomics={() => setRoute('economics')}
            onSaveJudgeClub={store.saveJudgeClub}
            onDeleteJudgeClub={store.deleteJudgeClub}
            onSaveJudgeAssignment={store.saveJudgeAssignment}
            onDeleteJudgeAssignment={store.deleteJudgeAssignment}
            onSaveJudgeExpense={store.saveJudgeExpense}
            onDeleteJudgeExpense={store.deleteJudgeExpense}
          />
        )}

        {route === 'importExport' && (
          <ImportExportHubScreen
            snapshot={snapshot}
            engineName={store.engineName}
            activeSpeciesName={activeSpeciesName}
            deviceId={store.deviceId}
            backupStatus={store.backupStatus}
            syncOperations={store.syncOperations}
            syncConflicts={store.syncConflicts}
            initialSection={importExportInitialSection}
            onConsumedInitialSection={() => setImportExportInitialSection('all')}
            onOpenSettings={() => setRoute('settings')}
            onOpenReports={() => setRoute('reports')}
            recordBackupExport={store.recordBackupExport}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onApplyPlatformImport={store.applyPlatformImportPreview}
            onImportJson={store.importJsonBackup}
            onImportBackupArchive={store.importBackupArchiveBytes}
            onImportDeltaOperations={store.importDeltaOperations}
            onResolveSyncConflict={store.resolveSyncConflict}
            onDismissSyncConflict={store.dismissSyncConflict}
            onBuildLocalDeltaJson={store.buildLocalDeltaJsonPayload}
            onRestoreRollingBackup={store.restoreRollingBackupByKey}
            onExportSqliteBytes={store.exportSqliteBytes}
            onInspectSqliteRestoreBytes={store.inspectSqliteRestoreBytes}
            onImportSqliteBytes={store.importSqliteBytes}
            deviceCapability={deviceCapability}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
            opfsSupported={store.opfsSupported}
            opfsVaultBackups={store.opfsVaultBackups}
            rollingBackups={store.rollingBackups}
            archivedHerdBundles={store.archivedHerdBundles}
            onSaveManualOpfsVaultBackup={store.saveManualOpfsVaultBackup}
            onCreateVerifiedPreUpgradeBackup={store.createAndVerifyPreUpgradeBackup}
            onRestoreOpfsVaultBackup={store.restoreOpfsVaultBackup}
            onDownloadOpfsVaultBackup={store.downloadOpfsVaultBackupByKey}
            onDeleteOpfsVaultBackup={store.deleteOpfsVaultBackupByKey}
            onDeleteRollingBackup={store.deleteRollingIdbBackupByKey}
            onRestoreArchivedHerdBundle={store.restoreArchivedHerdBundle}
            onDownloadArchivedHerdBundle={store.downloadArchivedHerdBundle}
            onDeleteArchivedHerdBundle={store.deleteArchivedHerdBundle}
            backupSyncStatus={store.backupSyncStatus}
            pruneSyncWarning={store.pruneSyncWarning}
            onConnectBackupSync={store.connectBackupSyncFolder}
            onReauthorizeBackupSync={store.reauthorizeBackupSyncFolder}
            onDisconnectBackupSync={store.disconnectBackupSyncFolder}
            onSyncVaultToSyncNow={store.syncVaultBackupsToSyncNow}
            onDismissPruneWarning={store.dismissPruneSyncWarning}
            storageStatus={store.storageStatus}
            cloudSyncState={store.cloudSyncState}
            cloudSyncBusy={store.cloudSyncBusy}
            onUpdateCloudSyncSettings={store.updateCloudSyncSettings}
            onConnectCloudSyncToken={store.connectCloudSyncAccessToken}
            onDisconnectCloudSync={store.disconnectCloudSync}
            onStartCloudSyncPkce={store.startCloudSyncPkce}
            onRunManualCloudSyncNow={store.runManualCloudSyncNow}
            onResetAndRetryCloudSync={store.resetAndRetryCloudSync}
            onDismissCloudCircuitBreakerWarning={store.dismissCloudCircuitBreakerWarning}
          />
        )}

        {route === 'settings' && (
          <SettingsAndSyncScreen
            snapshot={snapshot}
            activeSpeciesName={activeSpeciesName}
            storageStatus={store.storageStatus}
            backupStatus={store.backupStatus}
            openAddSpeciesOnMount={store.openAddSpeciesInSettings}
            onConsumedOpenAddSpecies={() => store.setOpenAddSpeciesInSettings(false)}
            recordBackupExport={store.recordBackupExport}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onSaveSpecies={(profile) => store.saveSpeciesProfile(profile)}
            onDeleteSpecies={(profile) => {
              void store.deleteSpeciesProfile(profile);
            }}
            onDownloadTimestampedSpeciesBackup={store.exportTimestampedSpeciesBackup}
            onExportTasksToCalendar={store.exportTasksToCalendar}
            googleAuthConnected={store.googleAuthConnected}
            googleUserEmail={store.googleUserEmail}
            googleCalendars={store.googleCalendars}
            googleSyncBusy={store.googleSyncBusy}
            onConnectGoogleCalendar={store.connectGoogleCalendar}
            onDisconnectGoogleCalendar={store.disconnectGoogleCalendar}
            onRefreshGoogleCalendars={store.refreshGoogleCalendars}
            deviceCapability={deviceCapability}
            onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
            opfsSupported={store.opfsSupported}
            opfsVaultBackups={store.opfsVaultBackups}
            rollingBackups={store.rollingBackups}
            onOpenImportExportHub={openImportExportHub}
            onOpenTechyStuff={() => setRoute('techyStuff')}
            onOpenHealthReference={(section) => setHealthReferenceSection(section || 'all')}
            onOpenHelpDocs={() => setShowHelpDocs(true)}
            cloudSyncState={store.cloudSyncState}
            cloudSyncBusy={store.cloudSyncBusy}
            onResetAndRetryCloudSync={store.resetAndRetryCloudSync}
          />
        )}

        {route === 'techyStuff' && (
          <TechyStuffErrorBoundary
            onExitToSettings={() => setRoute('settings')}
            onExitToHome={() => setRoute('home')}
          >
            <TechyStuffScreen
              snapshot={snapshot}
              engineName={store.engineName}
              storageStatus={store.storageStatus}
              opfsSupported={store.opfsSupported}
              opfsVaultBackups={store.opfsVaultBackups}
              deviceCapability={deviceCapability}
              deviceId={store.deviceId}
              rollingBackups={store.rollingBackups}
              syncOperations={store.syncOperations}
              syncConflicts={store.syncConflicts}
              backupSyncStatus={store.backupSyncStatus}
              cloudSyncState={store.cloudSyncState}
              onSyncVaultToSyncFolderNow={store.syncVaultBackupsToSyncNow}
              onBackToSettings={() => setRoute('settings')}
              onOpenImportExportHub={openImportExportHub}
              onOpenPromptsDirectory={() => setRoute('prompts')}
              onOpenSuggestionsBacklog={() => setRoute('suggestions')}
              onRefreshStorageStatus={store.refreshStorageStatus}
              onRequestPersistentStorage={store.triggerPersistentStorageRequest}
              onPurgeOpfsTmp={store.purgeOpfsTempWorkspace}
              onClearLocalSyncAndReminderState={store.clearLocalSyncAndBackupReminderState}
              recordBackupExport={store.recordBackupExport}
              onAnalyzePhotoFootprint={store.analyzePhotoStorageFootprint}
              onPruneOrphanPhotos={store.pruneOrphanAnimalPhotos}
              onReoptimizeOversizedPhotos={store.reoptimizeOversizedAnimalPhotos}
              onPruneFullResPhotoPayloads={store.pruneFullResPhotoPayloadsKeepingThumbnails}
              onScanDatabaseHealth={store.scanDatabaseHealth}
              onRepairDatabaseHealth={store.runHealthCheckAndRepair}
              onResetDatabaseConnection={store.resetDatabaseConnection}
              onPurgeCorruptedCaches={store.purgeCorruptedCachesAndRecover}
              onLocateConflicts={() => store.locateConflictsInHerd(activeSpeciesName)}
              onHydrateSnapshotForExport={store.hydrateSnapshotForExport}
              onSaveManualOpfsVaultBackup={store.saveManualOpfsVaultBackup}
              onCreateVerifiedPreUpgradeBackup={store.createAndVerifyPreUpgradeBackup}
              onSeedAllSpecies={() => {
                void store.seedAllPredefinedSpecies();
              }}
              onClearAllRecords={() => {
                void store.clearAllRecordsKeepSpecies();
              }}
              onRestoreFactoryDefaults={() => {
                void store.restoreFactoryDefaults();
              }}
            />
          </TechyStuffErrorBoundary>
        )}
        {route === 'prompts' && (
          <TechyStuffErrorBoundary
            onExitToSettings={() => setRoute('settings')}
            onExitToHome={() => setRoute('home')}
          >
            <PromptsDirectoryScreen onBackToTechyStuff={() => setRoute('techyStuff')} />
          </TechyStuffErrorBoundary>
        )}
        {route === 'suggestions' && (
          <TechyStuffErrorBoundary
            onExitToSettings={() => setRoute('settings')}
            onExitToHome={() => setRoute('home')}
          >
            <SuggestionsBacklogScreen onBackToTechyStuff={() => setRoute('techyStuff')} />
          </TechyStuffErrorBoundary>
        )}
            </Suspense>
          </RouteErrorBoundary>
        )}

        {/* Quiet Desktop Keyboard Shortcuts Hint Footer */}
        {route !== 'settings' &&
          route !== 'importExport' &&
          route !== 'techyStuff' &&
          route !== 'prompts' &&
          route !== 'suggestions' && (
          <footer className="hidden md:flex items-center justify-between gap-4 pt-3 pb-1 border-t border-[var(--barn-border)]/60 text-[11px] text-[var(--barn-muted)]">
            <span>
              Shortcuts: <kbd className="font-mono font-semibold text-[var(--barn-ink)]">H</kbd> Home ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">D</kbd> Dashboard ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">R</kbd> Herd ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">K</kbd> Bench ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">B</kbd> Breeding ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">P</kbd> Pedigree ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">F</kbd> Feed ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">C</kbd> CRM ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">J</kbd> Journal ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">G</kbd> Judge ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">O</kbd> Reports ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">I</kbd> Import/Export ·{' '}
              <kbd className="font-mono font-semibold text-[var(--barn-ink)]">S</kbd> Settings
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowHelpDocs(true)}
                className="inline-flex items-center gap-1 hover:text-[var(--barn-ink)] underline underline-offset-2"
              >
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                Docs &amp; Species Guides
              </button>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(true)}
                className="inline-flex items-center gap-1 hover:text-[var(--barn-ink)] underline underline-offset-2"
              >
                <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
                Shortcuts (?)
              </button>
            </div>
          </footer>
        )}
      </main>

      {/* Online Google Calendar Confirmation + Automatic Offline .ICS Fallback */}
      {store.pendingCalendarSync && (
        <RouteErrorBoundary
          routeKey="calendar-sync-confirm"
          routeLabel="Calendar Sync"
          onNavigateHome={() => store.cancelPendingCalendarSync()}
        >
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <RouteLoadingFallback label="Calendar Sync" />
                </div>
              </div>
            }
          >
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
        </RouteErrorBoundary>
      )}

      {/* Blocking Wiped-Browser-Storage Recovery Gate (IMP-018) */}
      {store.wipedRecoveryContext?.detected && (
        <RouteErrorBoundary
          routeKey="wiped-storage-recovery"
          routeLabel="Storage Recovery"
          onNavigateHome={() => setRoute('home')}
        >
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <RouteLoadingFallback label="Storage Recovery" />
                </div>
              </div>
            }
          >
            <WipedStorageRecoveryModal
              context={store.wipedRecoveryContext}
              archivedHerdBundles={store.archivedHerdBundles}
              rollingBackups={store.rollingBackups}
              onRestoreLatestOpfs={store.restoreLatestOpfsOnWipedRecovery}
              onRestoreRollingBackup={store.restoreRollingBackupByKey}
              onRestoreArchivedBundle={(archiveKey) =>
                store.restoreArchivedHerdBundle(archiveKey)
              }
              onImportJsonReplace={(jsonText) => store.importJsonBackup(jsonText, 'replace')}
              onImportArchiveReplace={(bytes, fileName) =>
                store.importBackupArchiveBytes(bytes, fileName, 'replace')
              }
              onImportSqlite={store.importSqliteBytes}
              onStartFresh={store.startFreshAfterWipedRecovery}
            />
          </Suspense>
        </RouteErrorBoundary>
      )}

      {/* Lazy-Loaded Curated Health Reference Wikis & Local Veterinary PDF Folder Modal */}
      {healthReferenceSection !== null && (
        <RouteErrorBoundary
          routeKey={`health-reference:${activeSpeciesName}`}
          routeLabel="Health Reference Library"
          onNavigateHome={() => setHealthReferenceSection(null)}
        >
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <RouteLoadingFallback label="Health Reference Library" />
                </div>
              </div>
            }
          >
            <HealthReferenceModal
              speciesName={activeSpeciesName}
              initialSection={healthReferenceSection}
              onClose={() => setHealthReferenceSection(null)}
            />
          </Suspense>
        </RouteErrorBoundary>
      )}

      {/* Lazy-Loaded In-App Documentation & Per-Species Guide Modal */}
      {showHelpDocs && (
        <RouteErrorBoundary
          routeKey={`help-docs:${activeSpeciesName}`}
          routeLabel="Documentation & Species Guides"
          onNavigateHome={() => setShowHelpDocs(false)}
        >
          <Suspense
            fallback={
              <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                  <RouteLoadingFallback label="Documentation & Species Guides" />
                </div>
              </div>
            }
          >
            <HelpDocumentationModal
              speciesProfiles={snapshot.speciesProfiles}
              activeSpeciesName={activeSpeciesName}
              onClose={() => setShowHelpDocs(false)}
            />
          </Suspense>
        </RouteErrorBoundary>
      )}

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

            <button
              type="button"
              onClick={() => {
                setShowShortcutsHelp(false);
                setShowHelpDocs(true);
              }}
              className="w-full min-h-[38px] px-3 py-2 rounded-xl border border-[var(--barn-sage)]/55 bg-[var(--barn-sage-tint)] hover:opacity-90 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                Open Full Documentation &amp; Species Guides
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            </button>

            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl text-xs bg-[var(--barn-canvas)]">
              {[
                { key: 'H', label: 'All Species Home', desc: 'View barn summary & species hub list' },
                { key: 'D', label: 'Species Dashboard', desc: 'Open active species overview & tasks' },
                { key: 'R', label: 'Herd Registry', desc: 'Open Herd (or Select Livestock Herd from Home)' },
                { key: 'K', label: 'Barn Bench', desc: 'Fast sequential cage-row entry for weights, BCS, trims & moves' },
                { key: 'B', label: 'Breeding Lab', desc: 'COI pairing check, Punnett predictions & births' },
                { key: 'P', label: 'Pedigree Explorer', desc: 'Interactive 3–6 generation ancestry tree' },
                { key: 'F', label: 'Feed & Lot Ledger', desc: 'Feed purchases, tag OCR lot indexing & biosecurity purge' },
                { key: 'E', label: 'Economics & 4-H Ledger', desc: 'Expenses, receipts, P&L margins, meat/pelt yields, mileage tax & 4-H/FFA books' },
                { key: 'C', label: 'Client CRM & Waitlist', desc: 'Buyer contacts, ranked waitlist matching, deposits & sales agreements' },
                { key: 'J', label: 'Personal Journal', desc: 'Date-organized barn journal with rich notes, color tags, ratings & search' },
                { key: 'G', label: "The Judge's Notebook", desc: 'Optional show judge schedule, bids, contracts, club directory & travel expenses' },
                { key: 'O', label: 'Reports', desc: 'Barn reports, printable herd rosters & inventory summaries' },
                { key: 'I', label: 'Import / Export Hub', desc: 'System backups, native restores, sync & external exporters' },
                { key: 'S', label: 'Settings', desc: 'Barn preferences, calendar sync, appearance & diagnostics' },
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

      <AsyncErrorToastHost
        onOpenDiagnostics={() => setRoute('techyStuff')}
        onOpenBackups={() => openImportExportHub('backup')}
        isOnSettingsRoute={route === 'techyStuff'}
        isOnBackupsRoute={route === 'importExport'}
      />

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
    </PlatformBridgeProvider>
  );
}
