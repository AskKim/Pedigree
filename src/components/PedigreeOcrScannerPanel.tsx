/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline Paper Pedigree OCR & Scanned PDF Review Queue Panel
 * (`src/components/PedigreeOcrScannerPanel.tsx`).
 *
 * Lets breeders snap a photo of a paper pedigree or upload JPG/PNG/WebP/PDF scans,
 * runs 100% client-side offline OCR / PDF vector extraction, provides an editable
 * 15-slot 3-generation pedigree draft grid, and stages the reviewed animals cleanly
 * into `ExternalImporterPanel`'s standard Import Review Queue (`PlatformImportPreview`).
 */

import {
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  FileUp,
  Layers,
  Loader2,
  RotateCcw,
  ScanText,
  Sparkles,
} from 'lucide-react';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildPlatformImportPreviewFromOcrDrafts,
  createEmptyPedigreeOcrSlots,
  PedigreeOcrSlotDraft,
  PedigreeOcrSlotKey,
} from '../domain/importers/pedigreeOcrParser';
import type { PlatformImportPreview } from '../domain/importers/importerTypes';
import {
  BarnDatabaseSnapshot,
  BiologicalSex,
  formatWeight,
  PREDEFINED_SPECIES_PRESETS,
} from '../domain/models';
import {
  PedigreeScanSessionResult,
  scanPedigreeDocumentFile,
} from '../storage/pedigreeOcrScanner';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface PedigreeOcrScannerPanelProps {
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  constrainedDevice?: boolean;
  onStagePreviewToImportQueue: (staged: {
    key: string;
    preview: PlatformImportPreview;
  }) => void;
}

const GENERATION_GROUPS: ReadonlyArray<{
  gen: 0 | 1 | 2 | 3;
  title: string;
  subtitle: string;
}> = [
  { gen: 0, title: 'Subject Animal', subtitle: 'Primary animal at root of scanned pedigree' },
  { gen: 1, title: 'Gen 1 · Parents', subtitle: 'Sire & Dam' },
  { gen: 2, title: 'Gen 2 · Grandparents', subtitle: 'Paternal & Maternal Grandparents' },
  { gen: 3, title: 'Gen 3 · Great-Grandparents', subtitle: '8 Great-Grandparent Ancestors' },
];

export function PedigreeOcrScannerPanel({
  snapshot,
  activeSpeciesName,
  constrainedDevice = false,
  onStagePreviewToImportQueue,
}: PedigreeOcrScannerPanelProps) {
  const baseId = useId();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const defaultFallbackSpecies =
    activeSpeciesName || snapshot.settings.defaultSpecies || 'Rabbit';
  const preferredUnit = snapshot.settings.preferredUnit || 'lbs_oz';

  const scanLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const [scanProgress, setScanProgress] = useState<{
    label: string;
    pct: number;
  } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [stagedSuccessMessage, setStagedSuccessMessage] = useState<string | null>(null);

  const [session, setSession] = useState<PedigreeScanSessionResult | null>(null);
  const [activePageArrayIdx, setActivePageArrayIdx] = useState<number>(0);
  const [slotsByPageIdx, setSlotsByPageIdx] = useState<
    Record<number, PedigreeOcrSlotDraft[]>
  >({});
  const [targetSpecies, setTargetSpecies] = useState<string>(defaultFallbackSpecies);
  const [attachScanPhotoToSubject, setAttachScanPhotoToSubject] = useState<boolean>(true);
  const [showRawOcrText, setShowRawOcrText] = useState<boolean>(false);
  const [expandedSlotKeys, setExpandedSlotKeys] = useState<Record<string, boolean>>({
    subject: true,
    sire: true,
    dam: true,
  });
  const [openGenerations, setOpenGenerations] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: false,
    3: false,
  });

  const activePage = session?.pages[activePageArrayIdx] ?? null;
  const activeSlots = slotsByPageIdx[activePageArrayIdx] ?? [];

  // Safely manage temporary preview Object URL for the scanned image/page
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = activePage?.previewBlob ?? null;
    if (!blob) {
      setPreviewObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [activePage]);

  const speciesSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const sp of snapshot.speciesProfiles) {
      if (sp.name.trim()) names.add(sp.name.trim());
    }
    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      if (preset.name.trim()) names.add(preset.name.trim());
    }
    return Array.from(names);
  }, [snapshot.speciesProfiles]);

  const includedSlots = useMemo(
    () =>
      activeSlots.filter(
        (s) =>
          s.included &&
          Boolean(
            s.name.trim() ||
              s.tattoo.trim() ||
              s.registrationNumber.trim() ||
              s.grandChampionNumber.trim()
          )
      ),
    [activeSlots]
  );

  const initializeEditorStateFromSession = (res: PedigreeScanSessionResult) => {
    const initialByPage: Record<number, PedigreeOcrSlotDraft[]> = {};
    res.pages.forEach((p, idx) => {
      initialByPage[idx] = p.parseResult.slots.map((slot) => ({
        ...slot,
        weightText:
          slot.weightGrams > 0 && !slot.weightText
            ? formatWeight(slot.weightGrams, preferredUnit)
            : slot.weightText,
      }));
    });

    const recIdx = Math.max(
      0,
      Math.min(res.pages.length - 1, res.recommendedPageIndex || 0)
    );
    const recPage = res.pages[recIdx];
    const recSlots = initialByPage[recIdx] ?? [];

    const hasGen2 = recSlots.some((s) => s.generation === 2 && s.included);
    const hasGen3 = recSlots.some((s) => s.generation === 3 && s.included);
    const nextExpanded: Record<string, boolean> = {
      subject: true,
      sire: true,
      dam: true,
    };
    for (const s of recSlots) {
      if (
        s.included &&
        (s.weightText ||
          s.birthDateIso ||
          s.variety ||
          s.breed ||
          s.grandChampionNumber ||
          s.legsCount > 0 ||
          s.genotypeRaw)
      ) {
        nextExpanded[s.slotKey] = true;
      }
    }

    setSession(res);
    setActivePageArrayIdx(recIdx);
    setSlotsByPageIdx(initialByPage);
    setTargetSpecies(recPage?.parseResult.detectedSpecies || defaultFallbackSpecies);
    setAttachScanPhotoToSubject(Boolean(recPage?.attachablePhoto));
    setOpenGenerations({
      0: true,
      1: true,
      2: hasGen2,
      3: hasGen3,
    });
    setExpandedSlotKeys(nextExpanded);
    setShowRawOcrText(false);
    setStagedSuccessMessage(null);
  };

  const handleSelectedFile = async (file: File | undefined) => {
    if (!file) return;
    await scanLock.runLocked(async () => {
      setScanError(null);
      setStagedSuccessMessage(null);
      setScanProgress({ label: 'Preparing pedigree scan...', pct: 5 });
      try {
        const res = await scanPedigreeDocumentFile(file, {
          fallbackSpecies: defaultFallbackSpecies,
          preferredUnit,
          constrainedDevice,
          onProgress: (label, pct) => {
            setScanProgress({
              label,
              pct: typeof pct === 'number' ? pct : 50,
            });
          },
        });

        if (res.status === 'invalid_file') {
          setScanError(res.errorMessage || 'Selected file could not be scanned.');
          return;
        }

        if (res.status === 'pdf_unsupported' && res.errorMessage) {
          setScanError(res.errorMessage);
        }

        if (res.pages.length > 0) {
          initializeEditorStateFromSession(res);
        }
      } catch (err: unknown) {
        setScanError(
          err instanceof Error
            ? err.message
            : 'Could not scan pedigree document. Try a clearer photo or enter slots manually.'
        );
      } finally {
        setScanProgress(null);
      }
    });
  };

  const handleOpenManualTemplate = () => {
    setScanError(null);
    setStagedSuccessMessage(null);
    const blankSlots = createEmptyPedigreeOcrSlots('');
    blankSlots[0].included = true;
    const manualSession: PedigreeScanSessionResult = {
      status: 'no_text_found',
      sourceFileName: 'manual-paper-pedigree.txt',
      isPdf: false,
      pages: [
        {
          pageIndex: 0,
          sourceLabel: 'Blank 3-Generation Manual Entry',
          engine: 'none',
          confidence: 0,
          rawText: '',
          imageWidth: 0,
          imageHeight: 0,
          parseResult: {
            slots: blankSlots,
            detectedSpecies: defaultFallbackSpecies,
            detectedBreed: '',
            sanitizedRawText: '',
            layoutMode: 'manual_empty',
            populatedSlotCount: 0,
            warnings: [],
          },
          previewBlob: null,
        },
      ],
      recommendedPageIndex: 0,
      warnings: [],
    };
    initializeEditorStateFromSession(manualSession);
    setOpenGenerations({ 0: true, 1: true, 2: true, 3: false });
  };

  const handleReset = () => {
    setSession(null);
    setSlotsByPageIdx({});
    setScanError(null);
    setStagedSuccessMessage(null);
    setScanProgress(null);
    setShowRawOcrText(false);
  };

  const updateSlot = (
    slotKey: PedigreeOcrSlotKey,
    patch: Partial<PedigreeOcrSlotDraft>
  ) => {
    setSlotsByPageIdx((prev) => {
      const current = prev[activePageArrayIdx] ?? [];
      return {
        ...prev,
        [activePageArrayIdx]: current.map((s) =>
          s.slotKey === slotKey ? { ...s, ...patch } : s
        ),
      };
    });
  };

  const handleStageToImportQueue = () => {
    if (!session || !activePage || includedSlots.length === 0) return;
    setScanError(null);
    const preview = buildPlatformImportPreviewFromOcrDrafts({
      slots: activeSlots,
      speciesName: targetSpecies.trim() || defaultFallbackSpecies,
      sourceFileName: session.sourceFileName,
      existingSnapshot: snapshot,
      attachedScanPhoto:
        attachScanPhotoToSubject && activePage.attachablePhoto
          ? activePage.attachablePhoto
          : undefined,
    });
    const stagedKey = `ocr-${Date.now()}-${session.sourceFileName}`;
    onStagePreviewToImportQueue({ key: stagedKey, preview });
    setStagedSuccessMessage(
      `Staged ${preview.animals.length} pedigree animal${preview.animals.length === 1 ? '' : 's'} (${preview.parentLinksResolved} parent link${preview.parentLinksResolved === 1 ? '' : 's'}) to the Import Review Queue below.`
    );
  };

  const engineLabel =
    activePage?.engine === 'pdf-vector-text'
      ? 'Searchable PDF Vector Text'
      : activePage?.engine === 'native-text-detector'
        ? 'On-Device Chromium TextDetector'
        : activePage?.engine === 'tesseract-js'
          ? 'Tesseract.js Local OCR Worker'
          : 'Manual 3-Generation Entry';

  return (
    <div
      id="pedigree-ocr-scanner"
      className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--barn-sage)]">
            Offline Paper &amp; PDF Pedigree Scanner
          </div>
          <h3 className="font-display text-lg sm:text-xl font-semibold text-[var(--barn-ink)]">
            Snap Pedigree Photo or Scan PDF
          </h3>
          <p className="text-xs text-[var(--barn-muted)] leading-relaxed">
            Runs 100% locally in your browser (PDF vector extractor + native{' '}
            <code className="font-mono">TextDetector</code> / Tesseract.js worker) to extract
            up to 3 generations into an editable draft before merging into your barn.
          </p>
        </div>
        <ScanText className="w-5 h-5 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
      </div>

      {/* File & Camera Triggers */}
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void handleSelectedFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            void handleSelectedFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          disabled={scanLock.isSubmitting}
          aria-busy={scanLock.isSubmitting}
          onClick={() => cameraInputRef.current?.click()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
        >
          <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Take Pedigree Photo</span>
        </button>

        <button
          type="button"
          disabled={scanLock.isSubmitting}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-semibold text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center gap-2"
        >
          <FileUp className="w-4 h-4 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
          <span>Upload Photo or PDF Scan</span>
        </button>

        <button
          type="button"
          disabled={scanLock.isSubmitting}
          onClick={handleOpenManualTemplate}
          className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-xs font-medium text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          <Layers className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
          <span>Blank 3-Gen Entry</span>
        </button>

        {session && (
          <button
            type="button"
            disabled={scanLock.isSubmitting}
            onClick={handleReset}
            className="min-h-[44px] px-3 py-2.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Clear Scan</span>
          </button>
        )}
      </div>

      {/* Live OCR Progress */}
      {scanProgress && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2 font-semibold text-[var(--barn-ink)]">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--barn-sage)]" aria-hidden="true" />
              <span>{scanProgress.label}</span>
            </span>
            <span className="font-mono tabular-nums text-[var(--barn-muted)]">
              {scanProgress.pct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--barn-canvas)] overflow-hidden">
            <div
              className="h-full bg-[var(--barn-sage)] transition-all duration-150"
              style={{ width: `${Math.max(4, Math.min(100, scanProgress.pct))}%` }}
            />
          </div>
        </div>
      )}

      {scanError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)] font-medium"
        >
          {scanError}
        </div>
      )}

      {stagedSuccessMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-3.5 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] text-xs text-[var(--barn-ink)] font-medium"
        >
          {stagedSuccessMessage}
        </div>
      )}

      {/* Active Scanned Pedigree Draft Review Queue */}
      {session && activePage && (
        <div className="border-t border-[var(--barn-border)] pt-4 space-y-4">
          {/* Page Switcher for Multi-Page PDFs */}
          {session.pages.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[var(--barn-muted)]">PDF Pages:</span>
              {session.pages.map((p, idx) => (
                <button
                  key={`${p.pageIndex}-${idx}`}
                  type="button"
                  onClick={() => setActivePageArrayIdx(idx)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    idx === activePageArrayIdx
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)] font-semibold'
                      : 'bg-[var(--barn-canvas)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                  }`}
                >
                  Page {p.pageIndex + 1} ({p.parseResult.populatedSlotCount} slots)
                </button>
              ))}
            </div>
          )}

          {/* Scan Warnings */}
          {session.warnings.map((w, i) => (
            <div
              key={i}
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs text-[var(--barn-ink)]"
            >
              {w}
            </div>
          ))}

          {/* Scan Summary, Thumbnail Preview & Target Species */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {previewObjectUrl && (
              <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col gap-2">
                <img
                  src={previewObjectUrl}
                  alt={`Preview of ${session.sourceFileName}`}
                  className="w-full max-h-44 object-contain rounded-lg bg-white border border-[var(--barn-border)]"
                />
                <span className="text-[11px] font-mono text-[var(--barn-muted)] truncate">
                  {session.sourceFileName}
                </span>
              </div>
            )}

            <div
              className={`${
                previewObjectUrl ? 'md:col-span-2' : 'md:col-span-3'
              } p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3 text-xs`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {activePage.sourceLabel}
                  </div>
                  <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                    {engineLabel}
                    {activePage.confidence > 0 ? ` · ${activePage.confidence}% conf.` : ''} ·{' '}
                    {activePage.parseResult.layoutMode === 'bounding_box_tree'
                      ? '2D Pedigree Tree Detected'
                      : activePage.parseResult.layoutMode === 'line_heuristic'
                        ? 'Text Label Mapping'
                        : 'Manual Draft'}{' '}
                    · {includedSlots.length}/15 active slots
                  </div>
                </div>

                {activePage.rawText && (
                  <button
                    type="button"
                    aria-expanded={showRawOcrText}
                    onClick={() => setShowRawOcrText((v) => !v)}
                    className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                    <span>{showRawOcrText ? 'Hide Raw OCR Text' : 'Inspect Raw OCR Text'}</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-target-species`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Target Livestock Species
                  </label>
                  <input
                    id={`${baseId}-target-species`}
                    type="text"
                    list={`${baseId}-species-datalist`}
                    value={targetSpecies}
                    onChange={(e) => setTargetSpecies(e.target.value)}
                    placeholder="e.g. Rabbit, Goat, Sheep..."
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-semibold"
                  />
                  <datalist id={`${baseId}-species-datalist`}>
                    {speciesSuggestions.map((sp) => (
                      <option key={sp} value={sp} />
                    ))}
                  </datalist>
                </div>

                {activePage.attachablePhoto && (
                  <div className="flex items-end">
                    <label className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={attachScanPhotoToSubject}
                        onChange={(e) => setAttachScanPhotoToSubject(e.target.checked)}
                        className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                      />
                      <span>Attach scanned pedigree photo to Subject animal (WebP)</span>
                    </label>
                  </div>
                )}
              </div>

              {showRawOcrText && activePage.rawText && (
                <pre className="max-h-44 overflow-auto p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] whitespace-pre-wrap text-[var(--barn-ink)]">
                  {activePage.rawText}
                </pre>
              )}
            </div>
          </div>

          {/* 3-Generation Editable Slot Review Queue */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Review &amp; Edit Parsed Pedigree Slots (3 Generations · 15 Slots)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenGenerations({ 0: true, 1: true, 2: true, 3: true })}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                >
                  Expand All Generations
                </button>
              </div>
            </div>

            {GENERATION_GROUPS.map((group) => {
              const groupSlots = activeSlots.filter((s) => s.generation === group.gen);
              const groupActiveCount = groupSlots.filter((s) => s.included && s.name.trim()).length;
              const isOpen = Boolean(openGenerations[group.gen]);

              return (
                <div
                  key={group.gen}
                  className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] overflow-hidden"
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpenGenerations((prev) => ({ ...prev, [group.gen]: !prev[group.gen] }))
                    }
                    className="w-full px-3.5 py-3 flex items-center justify-between gap-2 text-left hover:bg-[var(--barn-subtle)]/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--barn-ink)]">
                        {group.title}{' '}
                        <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                          ({groupActiveCount}/{groupSlots.length} ready)
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--barn-muted)]">{group.subtitle}</div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--barn-muted)] shrink-0" aria-hidden="true" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="p-3 border-t border-[var(--barn-border)] space-y-2.5">
                      {groupSlots.map((slot) => {
                        const detailsOpen = Boolean(expandedSlotKeys[slot.slotKey]);
                        return (
                          <div
                            key={slot.slotKey}
                            className={`p-3 rounded-xl border text-xs space-y-2.5 ${
                              slot.included
                                ? 'bg-[var(--barn-surface)] border-[var(--barn-sage)]/50'
                                : 'bg-[var(--barn-surface)]/50 border-[var(--barn-border)] opacity-85'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="flex items-center gap-2 font-semibold text-[var(--barn-ink)] cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={slot.included}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, { included: e.target.checked })
                                  }
                                  className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                                />
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                                  {slot.shortLabel}
                                </span>
                                <span>{slot.label}</span>
                              </label>

                              <div className="flex items-center gap-2">
                                {slot.confidence > 0 && (
                                  <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                                    {slot.confidence}% OCR
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-expanded={detailsOpen}
                                  onClick={() =>
                                    setExpandedSlotKeys((prev) => ({
                                      ...prev,
                                      [slot.slotKey]: !prev[slot.slotKey],
                                    }))
                                  }
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium hover:bg-[var(--barn-subtle)]"
                                >
                                  {detailsOpen ? 'Compact' : 'More Fields'}
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label
                                  htmlFor={`${baseId}-${slot.slotKey}-name`}
                                  className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                >
                                  Name
                                </label>
                                <input
                                  id={`${baseId}-${slot.slotKey}-name`}
                                  type="text"
                                  value={slot.name}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, {
                                      name: e.target.value,
                                      included: Boolean(e.target.value.trim()) || slot.included,
                                    })
                                  }
                                  placeholder="Animal name..."
                                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`${baseId}-${slot.slotKey}-tattoo`}
                                  className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                >
                                  Ear / Tattoo / Tag
                                </label>
                                <input
                                  id={`${baseId}-${slot.slotKey}-tattoo`}
                                  type="text"
                                  value={slot.tattoo}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, {
                                      tattoo: e.target.value,
                                      included: Boolean(e.target.value.trim()) || slot.included,
                                    })
                                  }
                                  placeholder="e.g. OR-101"
                                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`${baseId}-${slot.slotKey}-reg`}
                                  className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                >
                                  ARBA Reg #
                                </label>
                                <input
                                  id={`${baseId}-${slot.slotKey}-reg`}
                                  type="text"
                                  value={slot.registrationNumber}
                                  onChange={(e) =>
                                    updateSlot(slot.slotKey, {
                                      registrationNumber: e.target.value,
                                      included: Boolean(e.target.value.trim()) || slot.included,
                                    })
                                  }
                                  placeholder="e.g. 4412A"
                                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                />
                              </div>
                            </div>

                            {detailsOpen && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-[var(--barn-border)]/70">
                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-var`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Variety / Color
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-var`}
                                    type="text"
                                    value={slot.variety}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { variety: e.target.value })
                                    }
                                    placeholder="e.g. Broken Tort"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-breed`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Breed
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-breed`}
                                    type="text"
                                    value={slot.breed}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { breed: e.target.value })
                                    }
                                    placeholder="e.g. Holland Lop"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-wt`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Weight (e.g. 4# 8oz)
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-wt`}
                                    type="text"
                                    value={slot.weightText}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        weightText: e.target.value,
                                        weightGrams: 0,
                                      })
                                    }
                                    placeholder="4 lbs 8 oz"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-dob`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Birth Date
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-dob`}
                                    type="text"
                                    value={slot.birthDateIso}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { birthDateIso: e.target.value })
                                    }
                                    placeholder="YYYY-MM-DD"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-sex`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Sex
                                  </label>
                                  <select
                                    id={`${baseId}-${slot.slotKey}-sex`}
                                    value={slot.sex}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        sex: e.target.value as BiologicalSex,
                                      })
                                    }
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                                  >
                                    <option value="Male">Male / Sire</option>
                                    <option value="Female">Female / Dam</option>
                                    <option value="Unknown">Unknown</option>
                                  </select>
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-gc`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    GC #
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-gc`}
                                    type="text"
                                    value={slot.grandChampionNumber}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        grandChampionNumber: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. GC-901"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-legs`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Legs
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-legs`}
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={slot.legsCount}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, {
                                        legsCount: Math.max(0, Number(e.target.value) || 0),
                                      })
                                    }
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs tabular-nums"
                                  />
                                </div>

                                <div>
                                  <label
                                    htmlFor={`${baseId}-${slot.slotKey}-geno`}
                                    className="block text-[11px] text-[var(--barn-muted)] mb-0.5"
                                  >
                                    Genotype
                                  </label>
                                  <input
                                    id={`${baseId}-${slot.slotKey}-geno`}
                                    type="text"
                                    value={slot.genotypeRaw}
                                    onChange={(e) =>
                                      updateSlot(slot.slotKey, { genotypeRaw: e.target.value })
                                    }
                                    placeholder="e.g. aa B_ C_ dd E_"
                                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-xs"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={includedSlots.length === 0 || scanLock.isSubmitting}
            onClick={handleStageToImportQueue}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-45 disabled:pointer-events-none inline-flex items-center justify-center gap-2 transition-opacity"
          >
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>
              {includedSlots.length === 0
                ? 'Enter or Check At Least 1 Pedigree Slot to Stage'
                : `Stage ${includedSlots.length} Scanned Animal${includedSlots.length === 1 ? '' : 's'} to Import Review Queue`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
