/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
  GitFork,
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
import { useEffect, useState } from 'react';
import { BreedingScreen } from './components/BreedingScreen';
import { HerdScreen } from './components/HerdScreen';
import { HomeSpeciesScreen } from './components/HomeSpeciesScreen';
import { PedigreeScreen } from './components/PedigreeScreen';
import { SettingsAndSyncScreen } from './components/SettingsAndSyncScreen';
import { SpeciesDashboardScreen } from './components/SpeciesDashboardScreen';
import { isSameSpecies } from './core/models';
import { useBarnStore, WorkspaceRoute } from './hooks/useBarnStore';
import { useOnlineStatus, usePWAInstall } from './storage/storageProtection';

export default function App() {
  const store = useBarnStore();
  const isOnline = useOnlineStatus();
  const { canPromptInstall, isInstalled, isIos, promptInstall } = usePWAInstall();

  const [showHerdSpeciesPicker, setShowHerdSpeciesPicker] = useState(false);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);

  useEffect(() => {
    if (!showHerdSpeciesPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowHerdSpeciesPicker(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHerdSpeciesPicker]);

  if (store.isLoading || !store.snapshot || !store.activeSpeciesData) {
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

  const navItems: Array<{ id: WorkspaceRoute; label: string }> = [
    { id: 'home', label: 'All Species' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'herd', label: 'Herd' },
    { id: 'breeding', label: 'Breeding' },
    { id: 'pedigree', label: 'Pedigree' },
  ];

  const showInstallReminder =
    !dismissedInstallBanner && !isInstalled && (canPromptInstall || isIos);

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex flex-col pb-16 md:pb-8">
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
            onClick={() => setRoute(route === 'settings' ? 'dashboard' : 'settings')}
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
      <main className="flex-1 w-full min-w-0 max-w-7xl mx-auto px-3 sm:px-6 pt-5 space-y-5">
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
            onNavigateToAddSpecies={() => {
              store.setOpenAddSpeciesInSettings(true);
              setRoute('settings');
            }}
          />
        )}

        {route === 'dashboard' && (
          <SpeciesDashboardScreen
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
            onDeleteAllSpeciesRecords={(speciesName) => {
              void store.deleteAllSpeciesRecords(speciesName);
            }}
            onDownloadTimestampedBackup={store.exportTimestampedSpeciesBackup}
            onOpenSettings={() => setRoute('settings')}
          />
        )}

        {route === 'herd' && (
          <HerdScreen
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
            onSaveAnimal={(draft, pendingPhotos) => {
              void store.saveAnimal(draft, undefined, pendingPhotos);
            }}
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
            onMigrateAnimalsSpecies={(ids, targetSpecies) => {
              void store.migrateAnimalsSpecies(ids, targetSpecies);
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
          />
        )}

        {route === 'breeding' && (
          <BreedingScreen
            activeData={activeSpeciesData}
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
          />
        )}

        {route === 'settings' && (
          <SettingsAndSyncScreen
            snapshot={snapshot}
            engineName={store.engineName}
            activeSpeciesName={activeSpeciesName}
            deviceId={store.deviceId}
            storageStatus={store.storageStatus}
            syncOperations={store.syncOperations}
            syncConflicts={store.syncConflicts}
            openAddSpeciesOnMount={store.openAddSpeciesInSettings}
            onConsumedOpenAddSpecies={() => store.setOpenAddSpeciesInSettings(false)}
            onRequestPersistentStorage={store.triggerPersistentStorageRequest}
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
          />
        )}
      </main>

      {/* Select Livestock Species Before Entering Herd from Home */}
      {showHerdSpeciesPicker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose Livestock Species Herd"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Select Livestock Herd</h2>
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

      {/* Mobile Pocket-First Bottom Navigation Bar (< 768px) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[var(--barn-surface)]/95 backdrop-blur-md border-t border-[var(--barn-border)] grid grid-cols-5 items-center"
      >
        {(
          [
            ['home', 'Species', Home],
            ['dashboard', 'Barn', CalendarCheck],
            ['herd', 'Herd', ListFilter],
            ['breeding', 'Breeding', Sparkles],
            ['pedigree', 'Pedigree', GitFork],
          ] as const
        ).map(([id, label, Icon]) => {
          const active = route === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handlePrimaryNavClick(id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                active ? 'text-[var(--barn-ink)] font-semibold' : 'text-[var(--barn-muted)]'
              }`}
            >
              <span
                className={`px-3 py-0.5 rounded-full transition-colors ${
                  active
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : ''
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
