/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Project Name: Community Pedigree Project
 * App Name: Community Pedigree
 * Repo: AskKim/Pedigree
 * Package Name: pedigree
 *
 * Root Cross-Platform Application Shell.
 * Connects the offline-first SQLite / IndexedDB store (`useBarnStore`) to:
 * - Multi-Species Barn Home (`home`)
 * - Strictly Species-Isolated Barn Dashboard (`dashboard`)
 * - Strictly Species-Isolated Herd, Optimized Photo Galleries & Coat Genetics (`herd`)
 * - Strictly Species-Isolated Breeding, COI & Master Task List Lab (`breeding`)
 * - Strictly Species-Isolated 3/4-Gen Pedigree Explorer (`pedigree`)
 * - Barn Preferences, Photo Optimization, External Importers & Reset Controls (`settings`)
 */

import {
  CalendarCheck,
  GitFork,
  Home,
  ListFilter,
  Moon,
  Pin,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { Component, ErrorInfo, ReactNode, useEffect, useMemo, useState } from 'react';
import { BreedingScreen } from './components/BreedingScreen';
import { HerdScreen } from './components/HerdScreen';
import { HomeSpeciesScreen } from './components/HomeSpeciesScreen';
import { PedigreeScreen } from './components/PedigreeScreen';
import { SettingsAndSyncScreen } from './components/SettingsAndSyncScreen';
import { SpeciesDashboardScreen } from './components/SpeciesDashboardScreen';
import { isSameSpecies } from './core/models';
import { useBarnStore, WorkspaceRoute } from './hooks/useBarnStore';

interface ScreenErrorBoundaryProps {
  routeKey: string;
  onResetRoute: () => void;
  children: ReactNode;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class ScreenErrorBoundary extends Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state: ScreenErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): ScreenErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected workspace rendering error.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Workspace render error:', error, info);
  }

  componentDidUpdate(prevProps: ScreenErrorBoundaryProps) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold">
            This screen ran into an issue
          </h2>
          <p className="text-xs text-[var(--barn-muted)]">{this.state.errorMessage}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                this.props.onResetRoute();
              }}
              className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
            >
              Return to All Species
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const store = useBarnStore();
  const [workspaceDeleteConfirm, setWorkspaceDeleteConfirm] = useState<
    'testing' | 'all' | null
  >(null);
  const [focusAddSpeciesOnSettings, setFocusAddSpeciesOnSettings] = useState(false);

  useEffect(() => {
    setWorkspaceDeleteConfirm(null);
    if (store.route !== 'settings') {
      setFocusAddSpeciesOnSettings(false);
    }
  }, [store.activeSpeciesName, store.route]);

  const animalCountBySpecies = useMemo(() => {
    const counts = new Map<string, number>();
    if (!store.snapshot) return counts;
    for (const animal of store.snapshot.animals) {
      const key = animal.species.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [store.snapshot]);

  if (store.isLoading || !store.snapshot || !store.activeSpeciesData) {
    return (
      <main className="min-h-screen bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-3">
          <div className="h-5 w-44 rounded bg-[var(--barn-subtle)]" />
          <div className="h-4 w-64 rounded bg-[var(--barn-subtle)]" />
          <p className="text-xs text-[var(--barn-muted)] pt-1">
            Opening your local offline barn database...
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

  const navItems: Array<{ id: WorkspaceRoute; label: string }> = [
    { id: 'home', label: 'All Species' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'herd', label: 'Herd' },
    { id: 'breeding', label: 'Breeding' },
    { id: 'pedigree', label: 'Pedigree' },
  ];

  return (
    <div className="min-h-screen bg-[var(--barn-canvas)] text-[var(--barn-ink)] flex flex-col pb-16 md:pb-8">
      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 h-14 bg-[var(--barn-surface)]/95 backdrop-blur-md border-b border-[var(--barn-border)] px-4 sm:px-6 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setRoute('home')}
          className="font-display text-lg font-semibold tracking-tight whitespace-nowrap shrink-0 text-left"
        >
          Community Pedigree
        </button>

        {/* Zone 2: 5 Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {navItems.map((item) => {
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute(item.id)}
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

        {/* Zone 3: Quick In-Frame Reload, Light/Dark Toggle & Settings Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.location.reload()}
            title="Reload app preview (stays in full screen)"
            aria-label="Reload app preview"
            className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
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
            className="min-h-[38px] min-w-[38px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
          >
            {snapshot.settings.themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-[var(--barn-terracotta)]" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4 text-[var(--barn-ink)]" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setFocusAddSpeciesOnSettings(false);
              setRoute(route === 'settings' ? 'dashboard' : 'settings');
            }}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
              route === 'settings'
                ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                : 'border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" aria-hidden="true" />
            {route === 'settings' ? `Back to ${activeSpeciesName}` : 'Import & Settings'}
          </button>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
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

        {/* Contextual Species Switcher, Per-Species Delete Controls & Pin Bar inside any Species Workspace */}
        {route !== 'home' && route !== 'settings' && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                      {sp.name} ({animalCountBySpecies.get(sp.name.trim().toLowerCase()) ?? 0})
                    </option>
                  ))}
                </select>

                <span className="text-xs text-[var(--barn-muted)] hidden lg:inline">
                  {activeSpeciesData.speciesProfile.maleLabel} /{' '}
                  {activeSpeciesData.speciesProfile.femaleLabel} /{' '}
                  {activeSpeciesData.speciesProfile.offspringLabel} ·{' '}
                  {activeSpeciesData.speciesProfile.gestationDays}d gestation
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeSpeciesData.testingRecordCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setWorkspaceDeleteConfirm('testing')}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Delete Testing Data
                  </button>
                )}

                {activeSpeciesData.totalRecordCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setWorkspaceDeleteConfirm('all')}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Delete All {activeSpeciesName} Records
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => store.togglePinSpeciesLanding(activeSpeciesName)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    isActivePinned
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                      : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                  {isActivePinned
                    ? `Pinned ${activeSpeciesName} Hub as Startup Page`
                    : `Pin ${activeSpeciesName} Hub as Startup Page`}
                </button>
              </div>
            </div>

            {/* Inline 2-Tap Confirmation Banner for Per-Species Delete Actions */}
            {workspaceDeleteConfirm && (
              <div className="pt-2 border-t border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[var(--barn-ink)] font-medium">
                  {workspaceDeleteConfirm === 'testing'
                    ? `Delete ${activeSpeciesData.testingRecordCount} sample/testing records in ${activeSpeciesName}? Your real & imported ${activeSpeciesName} records will stay intact.`
                    : `Delete ALL ${activeSpeciesData.totalRecordCount} records in ${activeSpeciesName}? (${activeSpeciesName} schedule & all other species remain untouched.)`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (workspaceDeleteConfirm === 'testing') {
                        void store.deleteSpeciesTestingData(activeSpeciesName);
                      } else {
                        void store.deleteAllSpeciesRecords(activeSpeciesName);
                      }
                      setWorkspaceDeleteConfirm(null);
                    }}
                    className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-danger)] text-white text-xs font-semibold whitespace-nowrap"
                  >
                    {workspaceDeleteConfirm === 'testing'
                      ? `Confirm Delete ${activeSpeciesName} Testing Data`
                      : `Confirm Delete All ${activeSpeciesName} Records`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceDeleteConfirm(null)}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Screen Viewport */}
        <ScreenErrorBoundary routeKey={route} onResetRoute={() => setRoute('home')}>
        {route === 'home' && (
          <HomeSpeciesScreen
            snapshot={snapshot}
            onOpenSpecies={store.selectSpeciesWorkspace}
            onTogglePinSpecies={store.togglePinSpeciesLanding}
            onSaveSpecies={store.saveSpeciesProfile}
            onMoveSpeciesCard={(id, dir) => {
              void store.moveSpeciesCard(id, dir);
            }}
            onReorderSpeciesCards={(ids) => {
              void store.reorderSpeciesCards(ids);
            }}
            onDeleteSpecies={store.deleteSpeciesProfile}
            onSeedSpeciesSample={store.seedSpeciesSampleData}
            onDeleteSpeciesTestingData={(speciesName) => {
              void store.deleteSpeciesTestingData(speciesName);
            }}
            onDeleteAllSpeciesRecords={(speciesName) => {
              void store.deleteAllSpeciesRecords(speciesName);
            }}
            onMigrateAnimals={async (ids, target, options) => {
              await store.migrateAnimalsSpecies(ids, target, options);
            }}
            onOpenSettings={() => {
              setFocusAddSpeciesOnSettings(true);
              setRoute('settings');
            }}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
          />
        )}

        {route === 'dashboard' && (
          <SpeciesDashboardScreen
            activeData={activeSpeciesData}
            settings={snapshot.settings}
            onNavigate={setRoute}
            onOpenAnimal={(animalId) => {
              store.setSelectedAnimalId(animalId);
              setRoute('herd');
            }}
            onToggleTask={store.toggleTaskCompleted}
            onSetTasksCompletedBatch={store.setTasksCompletedBatch}
            onSaveTask={store.saveTask}
            onDeleteTask={store.deleteTask}
            onDeleteTasksBatch={store.deleteTasksBatch}
            onSaveCage={store.saveCage}
            onDeleteCage={store.deleteCage}
            onSaveShow={store.saveShow}
            onDeleteShow={store.deleteShow}
            onSeedSpeciesSample={store.seedSpeciesSampleData}
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
            onDeleteAnimalsBatch={store.deleteAnimalsBatch}
            onSetAnimalsArchiveState={store.setAnimalsArchiveState}
            onMigrateAnimals={async (ids, target, options) => {
              await store.migrateAnimalsSpecies(ids, target, options);
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
            focusAddSpecies={focusAddSpeciesOnSettings}
            onFocusedAddSpecies={() => setFocusAddSpeciesOnSettings(false)}
            onUpdateSettings={(patch, options) => {
              void store.updateSettings(patch, options);
            }}
            onSaveSpecies={(profile) => {
              void store.saveSpeciesProfile(profile);
            }}
            onDeleteSpecies={(profile) => {
              void store.deleteSpeciesProfile(profile);
            }}
            onApplyPlatformImport={store.applyPlatformImportPreview}
            onImportJson={store.importJsonBackup}
            onExportSqliteBytes={store.exportSqliteBytes}
            onImportSqliteBytes={store.importSqliteBytes}
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
        </ScreenErrorBoundary>
      </main>

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
              onClick={() => setRoute(id)}
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
