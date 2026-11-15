/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interactive 3- & 4-Generation Pedigree Tree Explorer (`Pedigree`).
 *
 * Strictly scoped to `activeData.speciesProfile.name`. Highlights repeated linebred ancestors,
 * supports 1-click linking or creation of missing Sire/Dam slots within the same species,
 * and exports formal Evans-compatible `.HTM` / PDF pedigrees.
 */

import { FileText, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatGenotypeArray } from '../core/geneticsEngine';
import { OptimizedImagePayload } from '../core/imageOptimizationSpec';
import {
  Animal,
  BarnSettings,
  formatSexForSpecies,
  formatWeight,
  SpeciesProfile,
} from '../core/models';
import {
  buildPedigreeSlots,
  PedigreeSlot,
  wouldCreateCycle,
} from '../core/pedigreeCalculator';
import { generateEvansHtmPedigree } from '../core/syncAndExports';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { AnimalEditorModal } from './AnimalEditorModal';
import { PrintPreviewModal } from './PrintPreviewModal';

interface PedigreeScreenProps {
  activeData: ActiveSpeciesData;
  allAnimals: Animal[];
  speciesProfiles: SpeciesProfile[];
  settings: BarnSettings;
  selectedSubjectId: string | null;
  generations: 3 | 4;
  onSelectSubject: (id: string) => void;
  onChangeGenerations: (gens: 3 | 4) => void;
  onOpenAnimalInHerd: (id: string) => void;
  onSaveAnimal: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    linkParentTarget?: { childId: string; asSire: boolean },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => void;
}

export function PedigreeScreen({
  activeData,
  allAnimals,
  speciesProfiles,
  settings,
  selectedSubjectId,
  generations,
  onSelectSubject,
  onChangeGenerations,
  onOpenAnimalInHerd,
  onSaveAnimal,
}: PedigreeScreenProps) {
  const { speciesProfile, animals, herdById, coiByAnimalId, cages, primaryPhotoByAnimalId } =
    activeData;

  const [zoom, setZoom] = useState<number>(1);
  const [linkingSlot, setLinkingSlot] = useState<PedigreeSlot | null>(null);
  const [creatingParentSlot, setCreatingParentSlot] = useState<PedigreeSlot | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [includePrimaryPhoto, setIncludePrimaryPhoto] = useState<boolean>(false);

  useEffect(() => {
    setLinkingSlot(null);
    setCreatingParentSlot(null);
    setShowPrintModal(false);
  }, [speciesProfile.name]);

  const subject = useMemo(() => {
    if (selectedSubjectId && herdById.has(selectedSubjectId)) {
      return herdById.get(selectedSubjectId)!;
    }
    return animals[0] ?? null;
  }, [selectedSubjectId, herdById, animals]);

  const slots = useMemo(() => {
    if (!subject) return [];
    return buildPedigreeSlots(subject, herdById, generations, speciesProfile);
  }, [subject, herdById, generations, speciesProfile]);

  const coi = subject ? coiByAnimalId.get(subject.id) : null;

  const offspring = useMemo(
    () =>
      subject ? animals.filter((a) => a.sireId === subject.id || a.damId === subject.id) : [],
    [animals, subject]
  );

  // Strictly species-isolated candidate parents when filling an empty slot
  const linkCandidates = useMemo(() => {
    if (!linkingSlot || !linkingSlot.childAnimalId) return [];
    const childId = linkingSlot.childAnimalId;
    const wantMale = linkingSlot.expectedSex === 'Male';
    return animals.filter((c) => {
      const sexOk = wantMale
        ? c.sex === 'Male' || c.sex === 'Unknown'
        : c.sex === 'Female' || c.sex === 'Unknown';
      return sexOk && c.id !== childId && !wouldCreateCycle(childId, c.id, herdById);
    });
  }, [linkingSlot, animals, herdById]);

  if (!subject) {
    return (
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center text-sm text-[var(--barn-muted)]">
        Add a {speciesProfile.name.toLowerCase()} in the Herd tab to explore multi-generation
        pedigree charts.
      </div>
    );
  }

  // Compute SVG node coordinates for clean Bezier curves across columns 0..generations
  const colWidth = generations === 4 ? 235 : 265;
  const cardWidth = generations === 4 ? 198 : 222;
  const cardHeight = generations === 4 ? 64 : 76;
  const leafCount = 1 << generations;
  const rowPitch = generations === 4 ? 76 : 96;
  const canvasHeight = Math.max(460, leafCount * rowPitch + 40);
  const canvasWidth = (generations + 1) * colWidth + 24;

  const nodeCoords = new Map<string, { x: number; y: number; slot: PedigreeSlot }>();
  for (const sl of slots) {
    const slotsInGen = 1 << sl.generation;
    const x = 16 + sl.generation * colWidth;
    const bandHeight = (canvasHeight - 32) / slotsInGen;
    const y = 16 + bandHeight * (sl.slotIndex + 0.5) - cardHeight / 2;
    nodeCoords.set(`${sl.generation}:${sl.slotIndex}`, { x, y, slot: sl });
  }

  const connectorPaths: Array<{ d: string; isSire: boolean; isKnown: boolean }> = [];
  for (let g = 0; g < generations; g++) {
    const count = 1 << g;
    for (let idx = 0; idx < count; idx++) {
      const parentBox = nodeCoords.get(`${g}:${idx}`);
      const sireBox = nodeCoords.get(`${g + 1}:${idx * 2}`);
      const damBox = nodeCoords.get(`${g + 1}:${idx * 2 + 1}`);
      if (!parentBox || !sireBox || !damBox) continue;

      const x1 = parentBox.x + cardWidth;
      const y1 = parentBox.y + cardHeight / 2;

      for (const [target, isSire] of [
        [sireBox, true],
        [damBox, false],
      ] as const) {
        const x2 = target.x;
        const y2 = target.y + cardHeight / 2;
        const cx = (x1 + x2) / 2;
        connectorPaths.push({
          d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
          isSire,
          isKnown: Boolean(target.slot.animal),
        });
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Pedigree Controls Toolbar */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="sr-only" htmlFor="pedigree-subject-select">
              Select {speciesProfile.name} Subject
            </label>
            <select
              id="pedigree-subject-select"
              value={subject.id}
              onChange={(e) => onSelectSubject(e.target.value)}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-medium"
            >
              {animals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.tattoo || 'No ID'}) — {formatSexForSpecies(a.sex, speciesProfile)}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs font-mono tabular-nums text-[var(--barn-muted)]">
            Wright COI:{' '}
            <strong className="text-[var(--barn-ink)]">
              {(coi?.coiPercent ?? 0).toFixed(2)}%
            </strong>{' '}
            ({coi?.risk.label || 'Outcross'}) · Known 3-Gen: {coi?.knownAncestorsIn3Gen ?? 0}/14
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
            {([3, 4] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onChangeGenerations(g)}
                className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                  generations === g
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                }`}
              >
                {g} Gen
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.65, Math.round((z - 0.1) * 100) / 100))}
              aria-label="Zoom out pedigree"
              className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-h-[38px] px-2.5 rounded-lg border border-[var(--barn-border)] text-xs font-mono tabular-nums hover:bg-[var(--barn-subtle)]"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.35, Math.round((z + 0.1) * 100) / 100))}
              aria-label="Zoom in pedigree"
              className="min-h-[38px] min-w-[38px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Export .HTM / Print PDF
          </button>
        </div>
      </div>

      {/* Scrollable Pan/Zoom Bezier Pedigree Canvas */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-auto p-4">
        <div
          style={{
            width: `${canvasWidth * zoom}px`,
            height: `${canvasHeight * zoom}px`,
          }}
          className="relative"
        >
          <div
            style={{
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
            className="relative"
          >
            <svg
              width={canvasWidth}
              height={canvasHeight}
              className="absolute inset-0 pointer-events-none"
            >
              {connectorPaths.map((cp, idx) => (
                <path
                  key={idx}
                  d={cp.d}
                  fill="none"
                  stroke={
                    cp.isKnown
                      ? cp.isSire
                        ? 'var(--barn-slate)'
                        : 'var(--barn-terracotta)'
                      : 'var(--barn-border)'
                  }
                  strokeDasharray={cp.isKnown ? undefined : '4 4'}
                  strokeWidth={cp.isKnown ? '2' : '1.4'}
                />
              ))}
            </svg>

            {Array.from(nodeCoords.values()).map(({ x, y, slot }) => {
              const a = slot.animal;
              const isSubject = slot.generation === 0;
              const isLinebred = slot.occurrenceCount > 1;
              const isMaleSlot = slot.expectedSex === 'Male';
              const canLinkMissing = !a && Boolean(slot.childAnimalId);

              return (
                <div
                  key={`${slot.generation}:${slot.slotIndex}`}
                  style={{
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                  }}
                  className={`absolute rounded-xl border px-3 py-2 flex flex-col justify-between transition-colors ${
                    a
                      ? isSubject || isLinebred
                        ? 'bg-[var(--barn-sage-tint)]/75 border-[var(--barn-sage)] border-[1.5px]'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                      : 'bg-[var(--barn-canvas)]/40 border-dashed border-[var(--barn-border)]'
                  }`}
                >
                  {a ? (
                    <>
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            slot.generation === 0
                              ? onOpenAnimalInHerd(a.id)
                              : onSelectSubject(a.id)
                          }
                          className="font-semibold text-xs text-left truncate hover:underline"
                          title={`${a.name} — click to focus`}
                        >
                          {a.name}
                        </button>
                        {isLinebred && (
                          <span className="font-mono text-[10px] font-semibold text-[var(--barn-sage)] shrink-0">
                            {slot.occurrenceCount}×
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[var(--barn-muted)] font-mono truncate">
                        {a.tattoo || 'No ID'} · {a.variety || a.breed}
                        {a.weightGrams > 0
                          ? ` · ${formatWeight(a.weightGrams, settings.preferredUnit)}`
                          : ''}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--barn-muted)] truncate">
                        <span
                          className={
                            a.sex === 'Male'
                              ? 'text-[var(--barn-slate)] font-medium'
                              : 'text-[var(--barn-terracotta)] font-medium'
                          }
                        >
                          {formatSexForSpecies(a.sex, speciesProfile)}
                        </span>
                        <span className="font-mono truncate">
                          {a.genotypeRaw || formatGenotypeArray(a.genotype) || a.registrationNumber}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-between gap-2 text-xs text-[var(--barn-muted)]">
                      <span className="truncate">
                        Unknown {isMaleSlot ? speciesProfile.maleLabel : speciesProfile.femaleLabel}
                      </span>
                      {canLinkMissing && (
                        <button
                          type="button"
                          onClick={() => setLinkingSlot(slot)}
                          className="min-h-[30px] px-2 py-1 rounded-md border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          Link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Offspring Jump Strip */}
      {offspring.length > 0 && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--barn-muted)]">
            {speciesProfile.offspringLabel} ({offspring.length}):
          </span>
          {offspring.map((kid) => (
            <button
              key={kid.id}
              type="button"
              onClick={() => onSelectSubject(kid.id)}
              className="min-h-[34px] px-3 py-1 rounded-full bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] font-medium whitespace-nowrap hover:opacity-95 transition-opacity"
            >
              {kid.sex === 'Female' ? '♀ ' : kid.sex === 'Male' ? '♂ ' : ''}
              {kid.name} ({kid.tattoo})
            </button>
          ))}
        </div>
      )}

      {/* Link Existing or Create New Parent Modal */}
      {linkingSlot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Assign Parent"
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Assign{' '}
              {linkingSlot.expectedSex === 'Male'
                ? `Sire (${speciesProfile.maleLabel})`
                : `Dam (${speciesProfile.femaleLabel})`}
            </h3>
            <p className="text-xs text-[var(--barn-muted)]">
              Showing cycle-safe {speciesProfile.name} candidates only.
            </p>

            {linkCandidates.length === 0 ? (
              <p className="text-sm text-[var(--barn-muted)]">
                No existing {speciesProfile.name.toLowerCase()} candidates available. Create a new
                parent record below.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {linkCandidates.map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => {
                      const child = herdById.get(linkingSlot.childAnimalId);
                      if (child) {
                        const asSire = linkingSlot.expectedSex === 'Male';
                        onSaveAnimal({
                          ...child,
                          sireId: asSire ? cand.id : child.sireId,
                          damId: !asSire ? cand.id : child.damId,
                        });
                      }
                      setLinkingSlot(null);
                    }}
                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-[var(--barn-subtle)] flex justify-between"
                  >
                    <span className="font-medium">{cand.name}</span>
                    <span className="font-mono text-[var(--barn-muted)]">{cand.tattoo}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingParentSlot(linkingSlot);
                  setLinkingSlot(null);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
              >
                + Create &amp; Link New{' '}
                {linkingSlot.expectedSex === 'Male'
                  ? speciesProfile.maleLabel
                  : speciesProfile.femaleLabel}
              </button>
              <button
                type="button"
                onClick={() => setLinkingSlot(null)}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {creatingParentSlot && (
        <AnimalEditorModal
          initialAnimal={null}
          speciesProfile={speciesProfile}
          speciesAnimals={animals}
          speciesCages={cages}
          preferredUnit={settings.preferredUnit}
          optimizationPresetId={settings.imageOptimizationPreset}
          defaultBreederName={settings.breederName}
          defaultOwnerName={settings.barnName}
          forcedSex={creatingParentSlot.expectedSex}
          onSave={(draft, pendingPhotos) =>
            onSaveAnimal(
              draft,
              {
                childId: creatingParentSlot.childAnimalId,
                asSire: creatingParentSlot.expectedSex === 'Male',
              },
              pendingPhotos
            )
          }
          onClose={() => setCreatingParentSlot(null)}
        />
      )}

      {showPrintModal &&
        (() => {
          const subjectPrimaryPhoto = primaryPhotoByAnimalId.get(subject.id);
          return (
            <PrintPreviewModal
              title={`${generations}-Generation Pedigree — ${subject.name}`}
              filename={`pedigree-${subject.tattoo || subject.id}-${generations}gen.htm`}
              htmlContent={generateEvansHtmPedigree(
                subject,
                allAnimals,
                speciesProfiles,
                settings,
                generations,
                {
                  includePrimaryPhoto,
                  primaryPhotoDataUrl: subjectPrimaryPhoto?.dataUrl,
                  primaryPhotoCaption: subjectPrimaryPhoto?.caption,
                }
              )}
              includePrimaryPhoto={includePrimaryPhoto}
              onToggleIncludePrimaryPhoto={
                subjectPrimaryPhoto ? setIncludePrimaryPhoto : undefined
              }
              onClose={() => setShowPrintModal(false)}
            />
          );
        })()}
    </div>
  );
}
