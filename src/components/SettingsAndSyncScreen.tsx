/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barn Preferences, Warm Light/Dark Theme & Custom Color Picker, Image Storage Optimization,
 * Custom Livestock, Startup Species Pinning, Multi-Device File Sync & Global Reset Screen (`Settings`).
 *
 * Gives breeders 1-click access to unencrypted `.sqlite`, `.json`, `.csv`, and PDF-ready exports,
 * deterministic UUID + ISO-8601 `updated_at` multi-device snapshot merging, image compression tuning,
 * and global controls to Delete All Animal Data or Restore App to Factory Settings/Data.
 */

import {
  Database,
  Download,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
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
  SpeciesProfile,
  WeightUnit,
} from '../core/models';
import {
  buildPdfReadyBarnSnapshot,
  exportAnimalsCsv,
  exportBarnBackupJson,
} from '../core/syncAndExports';
import {
  CustomThemeColors,
  DEFAULT_WARM_THEME_COLORS,
  WARM_THEME_PRESETS,
} from '../core/themePalette';
import { downloadBinaryFile, downloadTextFile } from '../utils/webFileActions';
import { ExternalImporterPanel } from './ExternalImporterPanel';
import { SpeciesEditorModal } from './SpeciesEditorModal';

interface SettingsAndSyncScreenProps {
  snapshot: BarnDatabaseSnapshot;
  engineName: string;
  activeSpeciesName: string;
  onUpdateSettings: (patch: Partial<BarnSettings>, options?: { silent?: boolean }) => void;
  onSaveSpecies: (profile: SpeciesProfile) => void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onApplyPlatformImport: (
    preview: PlatformImportPreview,
    optimizedPhotos?: AnimalPhoto[],
    conflictSelections?: ConflictSelectionMap
  ) => Promise<void>;
  onImportJson: (jsonText: string, mode: 'merge' | 'replace') => Promise<void>;
  onExportSqliteBytes: () => Promise<Uint8Array | null>;
  onImportSqliteBytes: (bytes: Uint8Array) => Promise<void>;
  onSeedAllSpecies: () => void;
  onClearAllRecords: () => void;
  onRestoreFactoryDefaults: () => void;
}

export function SettingsAndSyncScreen({
  snapshot,
  engineName,
  activeSpeciesName,
  onUpdateSettings,
  onSaveSpecies,
  onDeleteSpecies,
  onApplyPlatformImport,
  onImportJson,
  onExportSqliteBytes,
  onImportSqliteBytes,
  onSeedAllSpecies,
  onClearAllRecords,
  onRestoreFactoryDefaults,
}: SettingsAndSyncScreenProps) {
  const { settings, speciesProfiles } = snapshot;

  const [barnName, setBarnName] = useState(settings.barnName);
  const [breederName, setBreederName] = useState(settings.breederName);
  const [preferredUnit, setPreferredUnit] = useState<WeightUnit>(settings.preferredUnit);
  const [defaultSpecies, setDefaultSpecies] = useState(settings.defaultSpecies);
  const [pinnedLandingSpecies, setPinnedLandingSpecies] = useState(settings.pinnedLandingSpecies);
  const [defaultGenerations, setDefaultGenerations] = useState<3 | 4>(settings.defaultGenerations);
  const [imageOptimizationPreset, setImageOptimizationPreset] =
    useState<ImageOptimizationPresetId>(settings.imageOptimizationPreset || 'balanced');
  const [showHomeSummaryStrip, setShowHomeSummaryStrip] = useState(
    settings.showHomeSummaryStrip !== false
  );

  const [confirmGlobalDeleteAll, setConfirmGlobalDeleteAll] = useState(false);
  const [confirmFactoryRestore, setConfirmFactoryRestore] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showCustomSpeciesModal, setShowCustomSpeciesModal] = useState(false);

  // Keep form fields synced if factory restore or backup import updates settings
  useEffect(() => {
    setBarnName(settings.barnName);
    setBreederName(settings.breederName);
    setPreferredUnit(settings.preferredUnit);
    setDefaultSpecies(settings.defaultSpecies);
    setPinnedLandingSpecies(settings.pinnedLandingSpecies);
    setDefaultGenerations(settings.defaultGenerations);
    setImageOptimizationPreset(settings.imageOptimizationPreset || 'balanced');
    setShowHomeSummaryStrip(settings.showHomeSummaryStrip !== false);
  }, [settings]);

  const mergeFileRef = useRef<HTMLInputElement | null>(null);
  const replaceFileRef = useRef<HTMLInputElement | null>(null);
  const sqliteFileRef = useRef<HTMLInputElement | null>(null);

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
      breederName: breederName.trim(),
      preferredUnit,
      defaultSpecies,
      pinnedLandingSpecies,
      defaultGenerations,
      imageOptimizationPreset,
      showHomeSummaryStrip,
      barnNameSetupComplete: true,
    });
  };

  const handleJsonUpload = async (file: File | undefined, mode: 'merge' | 'replace') => {
    if (!file) return;
    setImportError(null);
    try {
      const text = await file.text();
      await onImportJson(text, mode);
    } catch (err: any) {
      setImportError(err?.message || 'Could not parse JSON backup file.');
    }
  };

  const handleSqliteUpload = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const buf = await file.arrayBuffer();
      await onImportSqliteBytes(new Uint8Array(buf));
    } catch (err: any) {
      setImportError(err?.message || 'Could not load SQLite database file.');
    }
  };

  const handleDownloadSqlite = async () => {
    const bytes = await onExportSqliteBytes();
    if (!bytes) {
      setImportError('Raw SQLite binary export is unavailable in fallback mode.');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBinaryFile(`pedigree-${stamp}.sqlite`, bytes, 'application/x-sqlite3');
  };

  const stamp = new Date().toISOString().slice(0, 10);

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
          hint: 'Selected filter chips, nav pills & Dam line',
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
          hint: 'Selected filter chips, nav pills & Dam line',
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
        {/* Left 6 Columns: Barn Preferences + Appearance & Custom Color Studio */}
        <div className="lg:col-span-6 space-y-6">
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

            {/* Light vs Dark Mode Segmented Selector */}
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

            {/* Curated Warm Palette Presets */}
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

            {/* Custom Color Pickers for Active Mode */}
            <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
              <div className="text-xs font-medium text-[var(--barn-muted)]">
                Custom {isDark ? 'Dark' : 'Light'} Mode Color Picker (Updates Live &amp; Auto-Tunes
                Text Contrast)
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

          {/* Barn Preferences, Image Optimization & Startup Pinning */}
          <form
            onSubmit={handleSavePreferences}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Barn Preferences &amp; Photo Optimization
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Configure barn headers, weight units, image compression, and startup landing page
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCustomSpeciesModal(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Add Species
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Barn / Farm Name
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
                <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                  {allPhotos.length} photo{allPhotos.length === 1 ? '' : 's'} stored ·{' '}
                  {formatByteSizePure(totalStoredPhotoBytes)}
                  {totalPhotoSavingsPct > 0 ? ` (-${totalPhotoSavingsPct}% vs raw)` : ''}
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
              <p className="text-[11px] text-[var(--barn-muted)]">
                Automatically resizes camera photos, strips EXIF/GPS bloat, encodes to WebP (with
                JPEG fallback), and builds ~256px list thumbnails for fast scrolling.
              </p>
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
              <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                When pinned to a species, launching the app jumps straight into that species&apos;
                cage-side dashboard while keeping All-Species Home one tap away.
              </p>
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
                  <div className="grid grid-cols-2 gap-2">
                    {([3, 4] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setDefaultGenerations(g)}
                        className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                          defaultGenerations === g
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                            : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                        }`}
                      >
                        {g} Generations
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] cursor-pointer hover:border-[var(--barn-sage)] transition-colors">
                <input
                  type="checkbox"
                  checked={showHomeSummaryStrip}
                  onChange={(e) => setShowHomeSummaryStrip(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-[var(--barn-ink)]">
                    Show compact summary strip on Home page
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    Displays total animals, active gestations, open chores, and startup status at
                    the top of the Home page. Uncheck to keep Home focused purely on species cards.
                  </div>
                </div>
              </label>
            </div>

            <button
              type="submit"
              className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
            >
              Save Barn Preferences
            </button>
          </form>
        </div>

        {/* Right 6 Columns: External Platform Importer, Open Data Sync & Global Reset Controls */}
        <div className="lg:col-span-6 space-y-6">
          <ExternalImporterPanel
            snapshot={snapshot}
            activeSpeciesName={activeSpeciesName}
            onCommitImport={onApplyPlatformImport}
          />

          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">
                  Open Data Portability &amp; Folder Sync
                </h2>
                <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                  Active Engine: {engineName} · Zero accounts, zero cloud lock-in
                </p>
              </div>
              <Database className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            </div>

            {importError && (
              <div className="text-xs text-[var(--barn-danger)] font-medium">{importError}</div>
            )}

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-[var(--barn-muted)]">
                1-Click Raw Exports (Save to Google Drive, OneDrive, or SyncThing Folder)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadSqlite}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Download Raw .SQLITE DB
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `pedigree-backup-${stamp}.json`,
                      exportBarnBackupJson(snapshot),
                      'application/json'
                    )
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Export Full Backup (.JSON)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `herd-all-species-${stamp}.csv`,
                      exportAnimalsCsv(snapshot.animals, snapshot.speciesProfiles, settings),
                      'text/csv'
                    )
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
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
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Export {activeSpeciesName} Report (.JSON)
                </button>
              </div>
            </div>

            <div className="border-t border-[var(--barn-border)] pt-4 space-y-2.5">
              <div className="text-xs font-semibold text-[var(--barn-muted)]">
                Multi-Device Sync Merge &amp; Restore (Supports v3/v4 Demo &amp; v5 Backups)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  ref={mergeFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    handleJsonUpload(e.target.files?.[0], 'merge');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => mergeFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  Sync Merge (.JSON)
                </button>

                <input
                  ref={replaceFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    handleJsonUpload(e.target.files?.[0], 'replace');
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => replaceFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  Restore (.JSON)
                </button>

                <input
                  ref={sqliteFileRef}
                  type="file"
                  accept=".sqlite,.db,.sqlite3"
                  className="hidden"
                  onChange={(e) => {
                    handleSqliteUpload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => sqliteFileRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  Load .SQLITE File
                </button>
              </div>
              <p className="text-[11px] text-[var(--barn-muted)]">
                <strong>Sync Merge</strong> compares UUIDs and ISO-8601{' '}
                <code className="font-mono">updatedAt</code> timestamps so cage-side edits from two
                phones combine cleanly without overwriting newer records.
              </p>
            </div>
          </section>

          {/* Global Data Deletion & Factory Settings Restore */}
          <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Global Data Reset &amp; Factory Restore
              </h3>
              <p className="text-xs text-[var(--barn-muted)] mt-0.5">
                Manage barn-wide animal records across all species, or restore the entire app to its
                original factory state. (For per-species deletion, use the buttons on each species
                card or inside any species workspace.)
              </p>
            </div>

            {/* Global Button 1: Delete All Animal Data (Keeps Settings & Species Schedules) */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 max-w-md">
                  <div className="text-xs font-semibold text-[var(--barn-ink)]">
                    Delete All Animal Data ({snapshot.animals.length} animals · {totalBarnRecords}{' '}
                    total records)
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Wipes all animals, photos, breedings, cages, chores, care logs, and shows across
                    every species, while keeping your barn settings, custom colors, and custom
                    livestock schedules intact.
                  </p>
                </div>

                {confirmGlobalDeleteAll ? (
                  <div className="flex items-center gap-2 shrink-0">
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
                ) : (
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
            </div>

            {/* Global Button 2: Restore App to Factory Settings & Data */}
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 max-w-md">
                  <div className="text-xs font-semibold text-[var(--barn-ink)]">
                    Restore App to Factory Settings &amp; Data
                  </div>
                  <p className="text-[11px] text-[var(--barn-muted)]">
                    Resets barn name, breeder name, units, startup landing pin, theme &amp; custom
                    colors, and species list/order back to factory defaults, and reloads the 9
                    starter sample herds.
                  </p>
                </div>

                {confirmFactoryRestore ? (
                  <div className="flex items-center gap-2 shrink-0">
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
                ) : (
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
            </div>

            {/* Optional Seeder Helper */}
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
          onClose={() => setShowCustomSpeciesModal(false)}
        />
      )}
    </div>
  );
}
