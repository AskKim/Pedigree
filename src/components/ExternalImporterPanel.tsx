/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * External Platform Importer & HerdBoss Two-ZIP Staging Panel (`ExternalImporterPanel`).
 *
 * Supports:
 * 1. Multi-ZIP / CSV / JSON staging (e.g. HerdBoss Part 1 + Part 2 archives).
 * 2. Instant-open Default Species Combobox (1-tap dropdown selection of all configured/predefined
 *    species PLUS free-typing for any custom livestock species not in the list).
 * 3. Inline schedule customization whenever non-predefined / custom livestock species are imported.
 * 4. Preexisting animal matching & per-field contradiction resolution (Keep Current vs Use Incoming
 *    vs Combine Notes, plus 1-click bulk actions).
 * 5. Automatic WebP downscaling, EXIF stripping, and thumbnail generation for incoming archive photos.
 */

import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileArchive,
  FolderUp,
  ImageOff,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatByteSizePure,
  IMAGE_OPTIMIZATION_PRESETS,
  ImageOptimizationPresetId,
} from '../core/imageOptimizationSpec';
import {
  AnimalConflictFieldKey,
  buildInitialConflictSelections,
  ConflictSelectionMap,
  FieldResolutionChoice,
  makeConflictSelectionKey,
} from '../core/importers/conflictResolver';
import {
  CustomSpeciesImportOverride,
  PlatformImportPreview,
  RawArchiveInput,
} from '../core/importers/importerTypes';
import {
  getPlatformImporterById,
  PLATFORM_IMPORTERS,
} from '../core/importers/registry';
import {
  AnimalPhoto,
  BarnDatabaseSnapshot,
  isSameSpecies,
  PREDEFINED_SPECIES_PRESETS,
} from '../core/models';
import {
  BatchImportPhotoProgress,
  optimizeStagedImporterPhotos,
} from '../storage/webImageOptimizer';

interface ExternalImporterPanelProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  onCommitImport: (
    preview: PlatformImportPreview,
    optimizedPhotos: AnimalPhoto[],
    conflictSelections: ConflictSelectionMap
  ) => Promise<void>;
}

export function ExternalImporterPanel({
  snapshot,
  activeSpeciesName,
  onCommitImport,
}: ExternalImporterPanelProps) {
  const [selectedPlatformId, setSelectedPlatformId] = useState<string>(
    PLATFORM_IMPORTERS[0].id
  );
  const [fallbackSpecies, setFallbackSpecies] = useState<string>(
    activeSpeciesName || snapshot.settings.defaultSpecies || 'Rabbit'
  );
  const [speciesMenuOpen, setSpeciesMenuOpen] = useState<boolean>(false);
  const [isFilteringSpecies, setIsFilteringSpecies] = useState<boolean>(false);

  const [customSpeciesOverrides, setCustomSpeciesOverrides] = useState<
    Record<string, CustomSpeciesImportOverride>
  >({});
  const [conflictSelections, setConflictSelections] = useState<ConflictSelectionMap>({});
  const [expandedConflictIds, setExpandedConflictIds] = useState<Record<string, boolean>>({});

  const [stagedArchives, setStagedArchives] = useState<RawArchiveInput[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importAndOptimizePhotos, setImportAndOptimizePhotos] = useState<boolean>(true);
  const [importPreset, setImportPreset] = useState<ImageOptimizationPresetId>(
    snapshot.settings.imageOptimizationPreset || 'balanced'
  );
  const [photoProgress, setPhotoProgress] = useState<BatchImportPhotoProgress | null>(null);
  const [notePhotoFilenames, setNotePhotoFilenames] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const speciesComboRef = useRef<HTMLDivElement | null>(null);
  const speciesInputRef = useRef<HTMLInputElement | null>(null);

  const importer = getPlatformImporterById(selectedPlatformId);

  useEffect(() => {
    if (snapshot.settings.imageOptimizationPreset) {
      setImportPreset(snapshot.settings.imageOptimizationPreset);
    }
  }, [snapshot.settings.imageOptimizationPreset]);

  // Close Default Species dropdown when clicking outside
  useEffect(() => {
    if (!speciesMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        speciesComboRef.current &&
        e.target instanceof Node &&
        !speciesComboRef.current.contains(e.target)
      ) {
        setSpeciesMenuOpen(false);
        setIsFilteringSpecies(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [speciesMenuOpen]);

  // Build combined list of configured species + any predefined presets not currently in snapshot
  const dropdownSpeciesOptions = useMemo(() => {
    const list: Array<{
      name: string;
      subtitle: string;
      isCustomConfigured: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const sp of snapshot.speciesProfiles) {
      const key = sp.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const isPreset = PREDEFINED_SPECIES_PRESETS.some((p) => isSameSpecies(p.name, sp.name));
      list.push({
        name: sp.name,
        subtitle: `${sp.maleLabel} · ${sp.femaleLabel} · ${sp.offspringLabel} · ${sp.gestationDays}d`,
        isCustomConfigured: !isPreset,
      });
    }

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const key = preset.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: preset.name,
        subtitle: `${preset.maleLabel} · ${preset.femaleLabel} · ${preset.offspringLabel} · ${preset.gestationDays}d`,
        isCustomConfigured: false,
      });
    }

    if (!isFilteringSpecies || !fallbackSpecies.trim()) {
      return list;
    }

    const q = fallbackSpecies.trim().toLowerCase();
    const matching = list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
    );
    const others = list.filter(
      (item) =>
        !item.name.toLowerCase().includes(q) && !item.subtitle.toLowerCase().includes(q)
    );
    return [...matching, ...others];
  }, [snapshot.speciesProfiles, fallbackSpecies, isFilteringSpecies]);

  const typedSpeciesIsBrandNew = useMemo(() => {
    const clean = fallbackSpecies.trim();
    if (!clean) return false;
    const inConfigured = snapshot.speciesProfiles.some((sp) => isSameSpecies(sp.name, clean));
    const inPresets = PREDEFINED_SPECIES_PRESETS.some((p) => isSameSpecies(p.name, clean));
    return !inConfigured && !inPresets;
  }, [fallbackSpecies, snapshot.speciesProfiles]);

  const handleStageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParseError(null);
    try {
      const additions: RawArchiveInput[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const f = fileList[i];
        const buf = await f.arrayBuffer();
        additions.push({
          fileName: f.name,
          bytes: new Uint8Array(buf),
        });
      }
      setStagedArchives((prev) => {
        const next = [...prev];
        for (const add of additions) {
          const dupIdx = next.findIndex((x) => x.fileName === add.fileName);
          if (dupIdx >= 0) next[dupIdx] = add;
          else next.push(add);
        }
        return next;
      });
    } catch (err: any) {
      setParseError(err?.message || 'Could not read selected archive file(s).');
    }
  };

  const preview: PlatformImportPreview | null = useMemo(() => {
    if (stagedArchives.length === 0) return null;
    try {
      return importer.parse(stagedArchives, snapshot, {
        fallbackSpeciesName: fallbackSpecies.trim() || 'Rabbit',
        customSpeciesOverrides,
        appendDeferredImageFilenamesToNotes: notePhotoFilenames,
      });
    } catch (err: any) {
      setParseError(err?.message || 'Failed to unpack or parse archive.');
      return null;
    }
  }, [
    stagedArchives,
    importer,
    snapshot,
    fallbackSpecies,
    customSpeciesOverrides,
    notePhotoFilenames,
  ]);

  // Seed default choices for any newly detected preexisting animal contradictions without clobbering user picks
  useEffect(() => {
    if (!preview || preview.conflicts.length === 0) {
      return;
    }
    const defaults = buildInitialConflictSelections(preview.conflicts);
    setConflictSelections((prev) => {
      const next: ConflictSelectionMap = { ...defaults };
      for (const [key, val] of Object.entries(prev)) {
        if (key in next) {
          next[key] = val;
        }
      }
      return next;
    });
    setExpandedConflictIds((prev) => {
      const next = { ...prev };
      preview.conflicts.forEach((c, idx) => {
        if (next[c.animalId] === undefined) {
          // Auto-expand all when <= 5 conflicts, or the first 2 when larger
          next[c.animalId] = preview.conflicts.length <= 5 || idx < 2;
        }
      });
      return next;
    });
  }, [preview]);

  const rawStagedPhotoBytes = useMemo(() => {
    if (!preview) return 0;
    return preview.stagedPhotos.reduce((acc, p) => acc + p.bytes.byteLength, 0);
  }, [preview]);

  const totalContradictingFieldsCount = useMemo(() => {
    if (!preview) return 0;
    return preview.conflicts.reduce((acc, c) => acc + c.contradictions.length, 0);
  }, [preview]);

  const updateCustomSpeciesField = (
    speciesName: string,
    patch: Partial<CustomSpeciesImportOverride>
  ) => {
    const key = speciesName.trim().toLowerCase();
    setCustomSpeciesOverrides((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }));
  };

  const setFieldChoice = (
    animalId: string,
    field: AnimalConflictFieldKey,
    choice: FieldResolutionChoice
  ) => {
    setConflictSelections((prev) => ({
      ...prev,
      [makeConflictSelectionKey(animalId, field)]: choice,
    }));
  };

  const setAllChoicesForAnimal = (animalId: string, target: 'existing' | 'incoming') => {
    if (!preview) return;
    const found = preview.conflicts.find((c) => c.animalId === animalId);
    if (!found) return;
    setConflictSelections((prev) => {
      const next = { ...prev };
      for (const item of found.contradictions) {
        next[makeConflictSelectionKey(animalId, item.field)] = target;
      }
      return next;
    });
  };

  const setAllChoicesBulk = (target: 'existing' | 'incoming') => {
    if (!preview) return;
    setConflictSelections((prev) => {
      const next = { ...prev };
      for (const c of preview.conflicts) {
        for (const item of c.contradictions) {
          next[makeConflictSelectionKey(c.animalId, item.field)] = target;
        }
      }
      return next;
    });
  };

  const handleCopyDiagnostic = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.schemaDiagnosticReport);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2500);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleCommit = async () => {
    if (!preview || isImporting) return;
    setIsImporting(true);
    setParseError(null);
    try {
      let optimizedPhotos: AnimalPhoto[] = [];
      if (importAndOptimizePhotos && preview.stagedPhotos.length > 0) {
        setPhotoProgress({
          completed: 0,
          total: preview.stagedPhotos.length,
          savedBytesSoFar: 0,
        });
        const batchResult = await optimizeStagedImporterPhotos(
          preview.stagedPhotos,
          importPreset,
          (prog) => setPhotoProgress(prog)
        );
        optimizedPhotos = batchResult.photos;
      }

      await onCommitImport(preview, optimizedPhotos, conflictSelections);
      setStagedArchives([]);
      setConflictSelections({});
      setShowDiagnostics(false);
    } catch (err: any) {
      setParseError(err?.message || 'Failed while optimizing or importing archive data.');
    } finally {
      setPhotoProgress(null);
      setIsImporting(false);
    }
  };

  const hasImportableRecords = Boolean(
    preview &&
      (preview.animals.length > 0 ||
        preview.stagedPhotos.length > 0 ||
        preview.breedings.length > 0 ||
        preview.careLogs.length > 0 ||
        preview.cages.length > 0 ||
        preview.tasks.length > 0)
  );

  return (
    <section
      id="external-platform-importer"
      className="bg-[var(--barn-surface)] border border-[var(--barn-sage)]/50 rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold">
              External Platform Importer
            </h2>
            <span className="px-2 py-0.5 rounded-md bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold">
              {importer.badge}
            </span>
          </div>
          <p className="text-xs text-[var(--barn-muted)] mt-1">
            {importer.summary}
          </p>
        </div>
        <FolderUp className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
      </div>

      {/* Platform Selector + Instant-Open Default Species Combobox */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
            Source Platform
          </label>
          <select
            value={selectedPlatformId}
            onChange={(e) => setSelectedPlatformId(e.target.value)}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-semibold"
          >
            {PLATFORM_IMPORTERS.map((imp) => (
              <option key={imp.id} value={imp.id}>
                {imp.name}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Accessible Combobox: Drops down immediately on click/tap AND allows typing custom species */}
        <div ref={speciesComboRef} className="relative">
          <label
            htmlFor="importer-default-species-input"
            className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
          >
            Default Species (Pick from list or type custom)
          </label>
          <div className="relative flex items-center">
            <input
              id="importer-default-species-input"
              ref={speciesInputRef}
              type="text"
              role="combobox"
              aria-expanded={speciesMenuOpen}
              aria-controls="importer-species-listbox"
              aria-autocomplete="list"
              value={fallbackSpecies}
              onFocus={() => {
                setIsFilteringSpecies(false);
                setSpeciesMenuOpen(true);
              }}
              onClick={() => {
                setSpeciesMenuOpen(true);
              }}
              onChange={(e) => {
                setFallbackSpecies(e.target.value);
                setIsFilteringSpecies(true);
                setSpeciesMenuOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSpeciesMenuOpen(false);
                  setIsFilteringSpecies(false);
                } else if (e.key === 'ArrowDown' && !speciesMenuOpen) {
                  setIsFilteringSpecies(false);
                  setSpeciesMenuOpen(true);
                }
              }}
              placeholder="Select or type any species (e.g. Goat, Yak, Duck)..."
              className="w-full min-h-[40px] pl-3 pr-9 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            />
            <button
              type="button"
              aria-label={speciesMenuOpen ? 'Close species list' : 'Open species list'}
              onClick={() => {
                setIsFilteringSpecies(false);
                setSpeciesMenuOpen((open) => {
                  const next = !open;
                  if (next) {
                    speciesInputRef.current?.focus();
                  }
                  return next;
                });
              }}
              className="absolute right-1 top-1 bottom-1 w-7 rounded-md flex items-center justify-center text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] transition-colors"
            >
              {speciesMenuOpen ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {speciesMenuOpen && (
            <div
              id="importer-species-listbox"
              role="listbox"
              className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] shadow-xl divide-y divide-[var(--barn-border)]"
            >
              {typedSpeciesIsBrandNew && fallbackSpecies.trim() && (
                <button
                  type="button"
                  role="option"
                  aria-selected={true}
                  onClick={() => {
                    setFallbackSpecies(fallbackSpecies.trim());
                    setSpeciesMenuOpen(false);
                    setIsFilteringSpecies(false);
                  }}
                  className="w-full text-left px-3 py-2.5 bg-[var(--barn-sage-tint)] hover:bg-[var(--barn-subtle)] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--barn-ink)] truncate">
                      + Use Custom Species: &ldquo;{fallbackSpecies.trim()}&rdquo;
                    </div>
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Not in predefined list — schedule will be created automatically
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-[var(--barn-sage)] shrink-0" />
                </button>
              )}

              {dropdownSpeciesOptions.map((opt) => {
                const isSelected = isSameSpecies(fallbackSpecies, opt.name);
                return (
                  <button
                    key={opt.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      setFallbackSpecies(opt.name);
                      setSpeciesMenuOpen(false);
                      setIsFilteringSpecies(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition-colors ${
                      isSelected
                        ? 'bg-[var(--barn-subtle)] font-semibold'
                        : 'hover:bg-[var(--barn-subtle)]/70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{opt.name}</span>
                        {opt.isCustomConfigured && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-[10px] text-[var(--barn-muted)]">
                            Custom
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--barn-muted)] truncate">
                        {opt.subtitle}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[var(--barn-sage)] shrink-0" />
                    )}
                  </button>
                );
              })}

              <div className="px-3 py-2 bg-[var(--barn-canvas)] text-[11px] text-[var(--barn-muted)]">
                Tip: Type any custom livestock name above (e.g. Kunekune, Yak, Duck, Donkey) if not
                listed.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-[var(--barn-muted)] bg-[var(--barn-canvas)] border border-[var(--barn-border)] rounded-xl px-3.5 py-2.5 space-y-1">
        <p>{importer.instructions}</p>
        <p className="text-[11px]">
          <strong className="text-[var(--barn-ink)]">Smart Merge &amp; Image Compression:</strong>{' '}
          New custom species get a dedicated schedule, preexisting barn animals let you resolve any
          contradicting fields side-by-side, and incoming photos are automatically WebP-optimized.
        </p>
      </div>

      {/* Multi-ZIP File Staging Controls */}
      <div className="space-y-2.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={importer.acceptedExtensions.join(',')}
          className="hidden"
          onChange={(e) => {
            void handleStageFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {stagedArchives.length === 0
              ? 'Select HerdBoss .ZIP File(s) (1 or Both)'
              : `Add Companion .ZIP (#${stagedArchives.length + 1})`}
          </button>

          {stagedArchives.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setStagedArchives([]);
                setConflictSelections({});
                setParseError(null);
              }}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]"
            >
              Clear Staged Files
            </button>
          )}
        </div>

        {/* Staged ZIP Tray */}
        {stagedArchives.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-[var(--barn-muted)]">
              Staged Export Archives ({stagedArchives.length}):
            </div>
            <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)]">
              {stagedArchives.map((arch, idx) => (
                <div
                  key={arch.fileName}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileArchive
                      className="w-4 h-4 text-[var(--barn-sage)] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="font-mono text-[var(--barn-muted)] shrink-0">
                      ZIP #{idx + 1}:
                    </span>
                    <span className="font-medium truncate">{arch.fileName}</span>
                    <span className="font-mono text-[11px] text-[var(--barn-muted)] shrink-0">
                      ({formatByteSizePure(arch.bytes.byteLength)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setStagedArchives((prev) =>
                        prev.filter((x) => x.fileName !== arch.fileName)
                      )
                    }
                    aria-label={`Remove ${arch.fileName}`}
                    className="min-h-[30px] min-w-[30px] rounded-lg text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {parseError && (
        <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium">
          {parseError}
        </div>
      )}

      {/* Live Multi-ZIP Import Preview */}
      {preview && (
        <div className="border-t border-[var(--barn-border)] pt-4 space-y-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Animals &amp; Ancestors</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.animals.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.parentLinksResolved} parent links
                {preview.matchedExistingAnimalsCount > 0
                  ? ` · ${preview.matchedExistingAnimalsCount} existing`
                  : ''}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Breedings / Litters</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.breedings.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.cages.length} groups/locations
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Weights &amp; Care Logs</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.careLogs.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.tasks.length} scheduled chores
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
              <div className="text-[var(--barn-muted)]">Matched Photos</div>
              <div className="font-mono text-lg font-semibold tabular-nums mt-0.5">
                {preview.stagedPhotos.length}
              </div>
              <div className="text-[11px] text-[var(--barn-muted)]">
                {preview.stagedPhotos.length > 0
                  ? `${formatByteSizePure(rawStagedPhotoBytes)} raw`
                  : preview.deferredMediaCount > 0
                    ? `${preview.deferredMediaCount} unmatched`
                    : 'None in ZIP'}
              </div>
            </div>
          </div>

          {preview.speciesDetected.length > 0 && (
            <div className="text-xs text-[var(--barn-muted)]">
              <strong>Isolated Species Detected:</strong>{' '}
              <span className="text-[var(--barn-ink)]">
                {preview.speciesDetected.join(', ')}
              </span>
            </div>
          )}

          {/* New Non-Predefined / Custom Species Schedule Customization Card */}
          {preview.newSpeciesProfiles.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)]/60 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <SlidersHorizontal
                  className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    New Custom Livestock Species Detected ({preview.newSpeciesProfiles.length})
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    {preview.newSpeciesProfiles.length === 1
                      ? `"${preview.newSpeciesProfiles[0].name}" isn't in your configured species yet.`
                      : `These species aren't in your configured barn list yet.`}{' '}
                    Review or customize gestation &amp; terminology below—it will be added to the
                    top of your Home page automatically.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {preview.newSpeciesProfiles.map((newSp) => (
                  <div
                    key={newSp.id}
                    className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5"
                  >
                    <div className="font-semibold text-xs flex items-center justify-between">
                      <span>{newSp.name} Biological Schedule</span>
                      <span className="text-[11px] font-mono text-[var(--barn-muted)]">
                        Auto-cascades chores &amp; due dates
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Gestation (days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={700}
                          value={newSp.gestationDays}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              gestationDays: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Wean (+days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={700}
                          value={newSp.weanDaysAfterBirth}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              weanDaysAfterBirth: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Rebreed (+days)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={700}
                          value={newSp.rebreedDaysAfterBirth}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              rebreedDaysAfterBirth: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Male Term
                        </label>
                        <input
                          type="text"
                          value={newSp.maleLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, { maleLabel: e.target.value })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Female Term
                        </label>
                        <input
                          type="text"
                          value={newSp.femaleLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, { femaleLabel: e.target.value })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Offspring Term
                        </label>
                        <input
                          type="text"
                          value={newSp.offspringLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, { offspringLabel: e.target.value })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-[var(--barn-muted)] mb-0.5">
                          Birth Event
                        </label>
                        <input
                          type="text"
                          value={newSp.birthEventLabel}
                          onChange={(e) =>
                            updateCustomSpeciesField(newSp.name, {
                              birthEventLabel: e.target.value,
                            })
                          }
                          className="w-full min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preexisting Animal Clean Enrichment Notice (when matched with zero contradictions) */}
          {preview.matchedExistingAnimalsCount > 0 && preview.conflicts.length === 0 && (
            <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
              <span>
                Matched <strong>{preview.matchedExistingAnimalsCount}</strong> preexisting barn
                animal{preview.matchedExistingAnimalsCount === 1 ? '' : 's'} with zero data
                contradictions — any blank fields, pedigree links, logs, and photos will enrich your
                existing records cleanly.
              </span>
            </div>
          )}

          {/* Preexisting Animal Contradiction Resolver UI */}
          {preview.conflicts.length > 0 && (
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)] space-y-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 max-w-xl">
                  <AlertTriangle
                    className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5">
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Preexisting Animal Contradictions Detected ({preview.conflicts.length} animal
                      {preview.conflicts.length === 1 ? '' : 's'} · {totalContradictingFieldsCount}{' '}
                      field{totalContradictingFieldsCount === 1 ? '' : 's'})
                    </div>
                    <p className="text-[var(--barn-muted)]">
                      These animals already exist in your barn with different values. Click the
                      value you want to keep for each contradicting field below (or apply a bulk
                      rule).
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAllChoicesBulk('existing')}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                  >
                    Keep All Current
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllChoicesBulk('incoming')}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium whitespace-nowrap"
                  >
                    Use All Incoming
                  </button>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-0.5">
                {preview.conflicts.map((conflict) => {
                  const isExpanded = expandedConflictIds[conflict.animalId] ?? true;
                  return (
                    <div
                      key={conflict.animalId}
                      className="rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden"
                    >
                      <div className="px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 bg-[var(--barn-subtle)]/40">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedConflictIds((prev) => ({
                              ...prev,
                              [conflict.animalId]: !isExpanded,
                            }))
                          }
                          className="flex items-center gap-2 text-left min-w-0 flex-1"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-[var(--barn-muted)] shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-[var(--barn-muted)] shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold text-[var(--barn-ink)]">
                              {conflict.displayName}
                            </span>
                            {conflict.displayTag && (
                              <span className="ml-1.5 font-mono text-[11px] text-[var(--barn-muted)]">
                                ({conflict.displayTag})
                              </span>
                            )}
                            <span className="ml-2 text-[11px] text-[var(--barn-muted)]">
                              {conflict.species} · Matched by {conflict.matchedBy} ·{' '}
                              {conflict.contradictions.length} conflict
                              {conflict.contradictions.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setAllChoicesForAnimal(conflict.animalId, 'existing')}
                            className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[10px] font-medium hover:bg-[var(--barn-subtle)]"
                          >
                            All Current
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllChoicesForAnimal(conflict.animalId, 'incoming')}
                            className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[10px] font-medium hover:bg-[var(--barn-subtle)]"
                          >
                            All Incoming
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 divide-y divide-[var(--barn-border)]">
                          {conflict.contradictions.map((item) => {
                            const selected =
                              conflictSelections[
                                makeConflictSelectionKey(conflict.animalId, item.field)
                              ] || item.defaultChoice;

                            return (
                              <div
                                key={item.field}
                                className="py-2.5 first:pt-0 last:pb-0 space-y-1.5"
                              >
                                <div className="text-[11px] font-semibold text-[var(--barn-muted)]">
                                  {item.label}
                                </div>

                                <div
                                  className={`grid grid-cols-1 ${
                                    item.supportsCombine ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                                  } gap-2`}
                                >
                                  {/* Choice 1: Keep Current Barn Data */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFieldChoice(conflict.animalId, item.field, 'existing')
                                    }
                                    className={`text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                                      selected === 'existing'
                                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div
                                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                                          selected === 'existing'
                                            ? 'opacity-90'
                                            : 'text-[var(--barn-muted)]'
                                        }`}
                                      >
                                        Current in Barn
                                      </div>
                                      <div className="text-xs font-medium break-words mt-0.5">
                                        {item.existingDisplay}
                                      </div>
                                    </div>
                                    {selected === 'existing' && (
                                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    )}
                                  </button>

                                  {/* Choice 2: Use Incoming Import Data */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setFieldChoice(conflict.animalId, item.field, 'incoming')
                                    }
                                    className={`text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                                      selected === 'incoming'
                                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div
                                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                                          selected === 'incoming'
                                            ? 'opacity-90'
                                            : 'text-[var(--barn-muted)]'
                                        }`}
                                      >
                                        Incoming Import
                                      </div>
                                      <div className="text-xs font-medium break-words mt-0.5">
                                        {item.incomingDisplay}
                                      </div>
                                    </div>
                                    {selected === 'incoming' && (
                                      <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    )}
                                  </button>

                                  {/* Choice 3 (Notes): Combine Both */}
                                  {item.supportsCombine && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setFieldChoice(conflict.animalId, item.field, 'combine')
                                      }
                                      className={`text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                                        selected === 'combine'
                                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                                          : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:border-[var(--barn-sage)]'
                                      }`}
                                    >
                                      <div className="min-w-0">
                                        <div
                                          className={`text-[10px] uppercase tracking-wider font-semibold ${
                                            selected === 'combine'
                                              ? 'opacity-90'
                                              : 'text-[var(--barn-muted)]'
                                          }`}
                                        >
                                          Combine Both
                                        </div>
                                        <div className="text-xs font-medium break-words mt-0.5">
                                          Keep both notes together
                                        </div>
                                      </div>
                                      {selected === 'combine' && (
                                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-Optimize Incoming Animal Photos Panel */}
          {preview.stagedPhotos.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)]/50 space-y-3 text-xs">
              <div className="flex items-start gap-2.5">
                <Camera
                  className="w-4 h-4 text-[var(--barn-sage)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Incoming Animal Photos Ready to Optimize ({preview.stagedPhotos.length})
                  </div>
                  <p className="text-[var(--barn-muted)] leading-relaxed">
                    Matched{' '}
                    <strong className="font-mono text-[var(--barn-ink)]">
                      {preview.stagedPhotos.length}
                    </strong>{' '}
                    photo{preview.stagedPhotos.length === 1 ? '' : 's'} (
                    {formatByteSizePure(rawStagedPhotoBytes)} raw)
                    {preview.animalsWithMultipleImagesCount > 0 && (
                      <>
                        , including{' '}
                        <strong className="font-mono text-[var(--barn-ink)]">
                          {preview.animalsWithMultipleImagesCount}
                        </strong>{' '}
                        animal{preview.animalsWithMultipleImagesCount === 1 ? '' : 's'} with{' '}
                        <strong>multiple gallery photos</strong>
                      </>
                    )}
                    . Each image is automatically resized, stripped of camera metadata, and WebP
                    compressed with a fast herd-list thumbnail.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-[var(--barn-ink)]">
                  <input
                    type="checkbox"
                    checked={importAndOptimizePhotos}
                    onChange={(e) => setImportAndOptimizePhotos(e.target.checked)}
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Optimize &amp; import matched animal photos</span>
                </label>

                {importAndOptimizePhotos && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--barn-muted)]">Compression:</span>
                    <select
                      value={importPreset}
                      onChange={(e) =>
                        setImportPreset(e.target.value as ImageOptimizationPresetId)
                      }
                      aria-label="Importer photo compression preset"
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-medium"
                    >
                      {Object.values(IMAGE_OPTIMIZATION_PRESETS).map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} ({preset.typicalSizeHint})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {photoProgress && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span>
                      Optimizing photo {photoProgress.completed} of {photoProgress.total}...
                    </span>
                    <span className="text-[var(--barn-sage)]">
                      Saved {formatByteSizePure(photoProgress.savedBytesSoFar)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--barn-subtle)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--barn-sage)] transition-all duration-150"
                      style={{
                        width: `${Math.round(
                          (photoProgress.completed / Math.max(1, photoProgress.total)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Unmatched or Non-Image Media Notice */}
          {preview.deferredMediaCount > 0 && (
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <ImageOff
                  className="w-4 h-4 text-[var(--barn-muted)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p className="text-[var(--barn-muted)]">
                  <strong className="font-mono text-[var(--barn-ink)]">
                    {preview.deferredMediaCount}
                  </strong>{' '}
                  additional media file{preview.deferredMediaCount === 1 ? '' : 's'} (
                  {formatByteSizePure(preview.deferredMediaBytes)}) had no matching animal tag/ID or
                  used a non-image format and will be skipped cleanly.
                </p>
              </div>

              <label className="flex items-start gap-2 cursor-pointer select-none text-[11px] text-[var(--barn-muted)]">
                <input
                  type="checkbox"
                  checked={notePhotoFilenames}
                  onChange={(e) => setNotePhotoFilenames(e.target.checked)}
                  className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                />
                <span>
                  Append original archive photo filenames to animal text notes as a reference
                  breadcrumb
                </span>
              </label>
            </div>
          )}

          {preview.warnings.map((w, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs"
            >
              {w}
            </div>
          ))}

          {/* Privacy-Safe ZIP Manifest & Column Header QA Inspector */}
          <div className="border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDiagnostics((v) => !v)}
              className="w-full px-3.5 py-2.5 text-xs font-medium flex items-center justify-between hover:bg-[var(--barn-subtle)] transition-colors"
            >
              <span>
                Inspect ZIP Manifest &amp; Detected Columns ({preview.diagnostics.length} tables)
              </span>
              {showDiagnostics ? (
                <ChevronUp className="w-4 h-4 text-[var(--barn-muted)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--barn-muted)]" />
              )}
            </button>

            {showDiagnostics && (
              <div className="p-3.5 border-t border-[var(--barn-border)] space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    Privacy-safe header summary (contains filenames &amp; column names only—no
                    animal PII)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyDiagnostic}
                    className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--barn-subtle)] shrink-0"
                  >
                    {copiedReport ? (
                      <>
                        <Check className="w-3 h-3 text-[var(--barn-sage)]" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy QA Schema Report
                      </>
                    )}
                  </button>
                </div>

                <pre className="max-h-48 overflow-auto p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] whitespace-pre-wrap">
                  {preview.schemaDiagnosticReport}
                </pre>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={!hasImportableRecords || isImporting}
            onClick={() => {
              void handleCommit();
            }}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none transition-opacity"
          >
            {isImporting
              ? photoProgress
                ? `Optimizing Photos (${photoProgress.completed}/${photoProgress.total}) & Merging...`
                : 'Merging Into Local SQLite...'
              : `Merge ${preview.animals.length} Animals${
                  preview.conflicts.length > 0
                    ? ` (${preview.conflicts.length} Conflict Choices Applied)`
                    : ''
                }${
                  importAndOptimizePhotos && preview.stagedPhotos.length > 0
                    ? `, ${preview.stagedPhotos.length} Optimized Photos`
                    : ''
                } & ${preview.breedings.length + preview.careLogs.length} Records Into Barn`}
          </button>
        </div>
      )}
    </section>
  );
}
