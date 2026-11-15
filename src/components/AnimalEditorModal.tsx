/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Species-Isolated Animal Registry Editor Modal.
 *
 * Strictly filters Sire and Dam candidates to the animal's exact `species` AND validates
 * against pedigree cycles (`wouldCreateCycle`). Includes Evans-inspired phenotype-to-genotype
 * baseline presets (`New Zealand Red -> A_ B_ C_ D_ ee ww`, etc.) when editing Rabbits.
 */

import { Camera, Star, Trash2, X } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import {
  parseGenotypeString,
  RABBIT_VARIETY_GENOTYPE_PRESETS,
} from '../core/geneticsEngine';
import {
  calculateSavingsPercent,
  formatByteSizePure,
  ImageOptimizationPresetId,
  OptimizedImagePayload,
  resolveImageOptimizationPreset,
} from '../core/imageOptimizationSpec';
import {
  ANIMAL_STATUSES,
  Animal,
  AnimalStatus,
  applyAnimalNamePrefix,
  BiologicalSex,
  CageLocation,
  isAnimalActive,
  isAnimalArchived,
  isSameSpecies,
  parseWeightInputToGrams,
  SpeciesProfile,
  WeightUnit,
} from '../core/models';
import {
  buildSpeciesHerdMap,
  calculatePairingCoi,
  wouldCreateCycle,
} from '../core/pedigreeCalculator';
import { optimizeImageFile } from '../storage/webImageOptimizer';

interface AnimalEditorModalProps {
  initialAnimal: Animal | null;
  speciesProfile: SpeciesProfile;
  speciesAnimals: Animal[];
  speciesCages: CageLocation[];
  preferredUnit: WeightUnit;
  optimizationPresetId?: ImageOptimizationPresetId;
  defaultBreederName: string;
  defaultOwnerName: string;
  forcedSex?: BiologicalSex;
  onSave: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => void;
  onDelete?: (animal: Animal) => void;
  onClose: () => void;
}

export function AnimalEditorModal({
  initialAnimal,
  speciesProfile,
  speciesAnimals,
  speciesCages,
  preferredUnit,
  optimizationPresetId,
  defaultBreederName,
  defaultOwnerName,
  forcedSex,
  onSave,
  onDelete,
  onClose,
}: AnimalEditorModalProps) {
  const isEditing = Boolean(initialAnimal?.id);

  const speciesDefaultPrefix = (speciesProfile.defaultAnimalNamePrefix || '').trim();
  const hasDefaultPrefix = Boolean(speciesDefaultPrefix);

  const [tattoo, setTattoo] = useState(initialAnimal?.tattoo || '');
  const [name, setName] = useState(initialAnimal?.name || '');
  const [applyDefaultPrefix, setApplyDefaultPrefix] = useState(true);
  const [breed, setBreed] = useState(
    initialAnimal?.breed ||
      (isSameSpecies(speciesProfile.name, 'Rabbit')
        ? 'New Zealand'
        : speciesProfile.exampleBreeds[0] || '')
  );
  const [variety, setVariety] = useState(
    initialAnimal?.variety || (isSameSpecies(speciesProfile.name, 'Rabbit') ? 'Red' : '')
  );
  const [sex, setSex] = useState<BiologicalSex>(forcedSex || initialAnimal?.sex || 'Female');
  const [status, setStatus] = useState<AnimalStatus>(initialAnimal?.status || 'Active');
  const [birthDateIso, setBirthDateIso] = useState(initialAnimal?.birthDateIso || '');
  const [weightInput, setWeightInput] = useState(() => {
    const g = initialAnimal?.weightGrams || 0;
    if (g <= 0) return '';
    if (preferredUnit === 'grams') return String(g);
    return (g / 453.59237).toFixed(2);
  });
  const [genotypeRaw, setGenotypeRaw] = useState(
    initialAnimal?.genotypeRaw ||
      (isSameSpecies(speciesProfile.name, 'Rabbit') && !isEditing ? 'A_ B_ C_ D_ ee ww' : '')
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    initialAnimal?.registrationNumber || ''
  );
  const [grandChampionNumber, setGrandChampionNumber] = useState(
    initialAnimal?.grandChampionNumber || ''
  );
  const [legsCount, setLegsCount] = useState(String(initialAnimal?.legsCount || 0));
  const [cageLocation, setCageLocation] = useState(initialAnimal?.cageLocation || '');
  const [breederName, setBreederName] = useState(
    initialAnimal?.breederName ?? defaultBreederName
  );
  const [ownerName, setOwnerName] = useState(initialAnimal?.ownerName ?? defaultOwnerName);
  const [sireId, setSireId] = useState(initialAnimal?.sireId || '');
  const [damId, setDamId] = useState(initialAnimal?.damId || '');
  const [includeArchivedParents, setIncludeArchivedParents] = useState(false);
  const [notes, setNotes] = useState(initialAnimal?.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [stagedPhotos, setStagedPhotos] = useState<OptimizedImagePayload[]>([]);
  const [isOptimizingPhotos, setIsOptimizingPhotos] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const activePreset = resolveImageOptimizationPreset(optimizationPresetId);

  const handleSelectModalPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsOptimizingPhotos(true);
    try {
      const next: OptimizedImagePayload[] = [];
      for (let i = 0; i < files.length; i++) {
        try {
          const opt = await optimizeImageFile(files[i], activePreset.id);
          next.push(opt);
        } catch {
          // Ignore unreadable non-image
        }
      }
      if (next.length > 0) {
        setStagedPhotos((prev) => [...prev, ...next]);
      }
    } finally {
      setIsOptimizingPhotos(false);
    }
  };

  const herdById = useMemo(
    () => buildSpeciesHerdMap(speciesAnimals, speciesProfile.name),
    [speciesAnimals, speciesProfile.name]
  );

  // Strictly species-isolated, sex-appropriate, cycle-safe parent options
  const sireCandidates = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          (c.sex === 'Male' || c.sex === 'Unknown') &&
          c.id !== initialAnimal?.id &&
          (includeArchivedParents || isAnimalActive(c) || c.id === sireId) &&
          (!initialAnimal?.id || !wouldCreateCycle(initialAnimal.id, c.id, herdById))
      ),
    [speciesAnimals, speciesProfile.name, initialAnimal?.id, herdById, includeArchivedParents, sireId]
  );

  const damCandidates = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          (c.sex === 'Female' || c.sex === 'Unknown') &&
          c.id !== initialAnimal?.id &&
          (includeArchivedParents || isAnimalActive(c) || c.id === damId) &&
          (!initialAnimal?.id || !wouldCreateCycle(initialAnimal.id, c.id, herdById))
      ),
    [speciesAnimals, speciesProfile.name, initialAnimal?.id, herdById, includeArchivedParents, damId]
  );

  const projectedCoi = useMemo(() => {
    if (!sireId || !damId) return null;
    return calculatePairingCoi(sireId, damId, herdById);
  }, [sireId, damId, herdById]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const finalName =
      !isEditing && applyDefaultPrefix && hasDefaultPrefix
        ? applyAnimalNamePrefix(name, speciesProfile.defaultAnimalNamePrefix)
        : name.trim();

    onSave(
      {
        id: initialAnimal?.id,
        createdAt: initialAnimal?.createdAt,
        tattoo: tattoo.trim(),
        name: finalName,
        species: speciesProfile.name, // Strictly locked to active species
        breed: breed.trim(),
        variety: variety.trim(),
        sex,
        status,
        birthDateIso,
        weightGrams: parseWeightInputToGrams(weightInput, preferredUnit),
        genotype: parseGenotypeString(genotypeRaw),
        genotypeRaw: genotypeRaw.trim(),
        registrationNumber: registrationNumber.trim(),
        grandChampionNumber: grandChampionNumber.trim(),
        legsCount: Math.max(0, Number(legsCount) || 0),
        cageLocation: cageLocation.trim(),
        breederName: breederName.trim(),
        ownerName: ownerName.trim(),
        sireId,
        damId,
        notes: notes.trim(),
      },
      stagedPhotos.length > 0 ? stagedPhotos : undefined
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Edit ${initialAnimal?.name}` : `Register ${speciesProfile.name}`}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--barn-border)]">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {isEditing ? `Edit ${initialAnimal?.name}` : `Add ${speciesProfile.name} Record`}
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              Species: {speciesProfile.name} · Parent links restricted to {speciesProfile.name} herd
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Animal Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Copper Creek Ruby Rose"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
              {!isEditing && hasDefaultPrefix && (
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[var(--barn-ink)]">
                    <input
                      type="checkbox"
                      checked={applyDefaultPrefix}
                      onChange={(e) => setApplyDefaultPrefix(e.target.checked)}
                      className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    <span>
                      Apply {speciesProfile.name} prefix{' '}
                      <code className="font-mono font-semibold">{speciesDefaultPrefix}</code>
                    </span>
                  </label>
                  <span className="text-[var(--barn-muted)]">
                    {!applyDefaultPrefix ? (
                      'Overridden — saves exact name'
                    ) : name.trim() ? (
                      applyAnimalNamePrefix(name, speciesProfile.defaultAnimalNamePrefix).toLowerCase() ===
                      name.trim().toLowerCase() ? (
                        'Already includes prefix'
                      ) : (
                        <>
                          Saves as:{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {applyAnimalNamePrefix(name, speciesProfile.defaultAnimalNamePrefix)}
                          </strong>
                        </>
                      )
                    ) : (
                      'Auto-prepended unless already present'
                    )}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Ear Tattoo / Tag ID
              </label>
              <input
                type="text"
                placeholder="e.g. NZR-301"
                value={tattoo}
                onChange={(e) => setTattoo(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">Sex</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                {(
                  [
                    ['Male', speciesProfile.maleLabel],
                    ['Female', speciesProfile.femaleLabel],
                    ['Unknown', 'Unknown'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSex(val)}
                    className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      sex === val
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Herd Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AnimalStatus)}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              >
                {ANIMAL_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Breed
              </label>
              <input
                type="text"
                list="breed-suggestions"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
              <datalist id="breed-suggestions">
                {speciesProfile.exampleBreeds.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Variety / Color
              </label>
              <input
                type="text"
                placeholder="e.g. Red"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Cage / Pen Location
              </label>
              <input
                type="text"
                list="cage-suggestions"
                placeholder="e.g. Hutch R-07"
                value={cageLocation}
                onChange={(e) => setCageLocation(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
              <datalist id="cage-suggestions">
                {speciesCages.map((c) => (
                  <option key={c.id} value={c.label} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Birth Date
              </label>
              <input
                type="date"
                value={birthDateIso}
                onChange={(e) => setBirthDateIso(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Weight ({preferredUnit === 'grams' ? 'grams' : 'decimal lbs'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={preferredUnit === 'grams' ? 'e.g. 4650' : 'e.g. 10.25'}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Show Legs Won
              </label>
              <input
                type="number"
                min="0"
                max="99"
                value={legsCount}
                onChange={(e) => setLegsCount(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-[var(--barn-muted)]">
                Coat Color Genotype Loci (A, B, C, D, E, W, En, V, Du)
              </label>
              {isSameSpecies(speciesProfile.name, 'Rabbit') && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) setGenotypeRaw(e.target.value);
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="">Auto-fill baseline from ARBA variety...</option>
                  {Object.entries(RABBIT_VARIETY_GENOTYPE_PRESETS).map(([varName, geno]) => (
                    <option key={varName} value={geno}>
                      {varName} ({geno})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. A_ B_ C_ D_ ee ww"
              value={genotypeRaw}
              onChange={(e) => setGenotypeRaw(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
            />
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Lineage Parents ({speciesProfile.name} Only)
                </span>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--barn-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeArchivedParents}
                    onChange={(e) => setIncludeArchivedParents(e.target.checked)}
                    className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                  />
                  <span>Include archived parents</span>
                </label>
              </div>
              {projectedCoi && (
                <span className="text-xs font-mono tabular-nums text-[var(--barn-sage)]">
                  Projected COI: {projectedCoi.coiPercent.toFixed(2)}% ({projectedCoi.risk.label})
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Sire ({speciesProfile.maleLabel})
                </label>
                <select
                  value={sireId}
                  onChange={(e) => setSireId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                >
                  <option value="">Unknown / Foundation {speciesProfile.maleLabel}</option>
                  {sireCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.tattoo ? `(${c.tattoo})` : ''}
                      {isAnimalArchived(c) ? ` [${c.status}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                  Dam ({speciesProfile.femaleLabel})
                </label>
                <select
                  value={damId}
                  onChange={(e) => setDamId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                >
                  <option value="">Unknown / Foundation {speciesProfile.femaleLabel}</option>
                  {damCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.tattoo ? `(${c.tattoo})` : ''}
                      {isAnimalArchived(c) ? ` [${c.status}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Registration #
              </label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Grand Champion #
              </label>
              <input
                type="text"
                value={grandChampionNumber}
                onChange={(e) => setGrandChampionNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Breeder
              </label>
              <input
                type="text"
                value={breederName}
                onChange={(e) => setBreederName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Owner
              </label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
              Barn Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
            />
          </div>

          {/* Direct Photo Upload & Compression Strip */}
          <div className="border-t border-[var(--barn-border)] pt-4 space-y-2.5">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleSelectModalPhotos(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Attach Animal Photos (Auto-Optimized to {activePreset.maxDimension}px WebP)
                </span>
                {stagedPhotos.length > 0 && (
                  <div className="text-[11px] font-mono text-[var(--barn-sage)]">
                    Staged {stagedPhotos.length} photo{stagedPhotos.length === 1 ? '' : 's'} ·{' '}
                    {formatByteSizePure(
                      stagedPhotos.reduce((a, b) => a + b.storedBytes, 0)
                    )}{' '}
                    total (saved{' '}
                    {calculateSavingsPercent(
                      stagedPhotos.reduce((a, b) => a + b.originalBytes, 0),
                      stagedPhotos.reduce((a, b) => a + b.storedBytes, 0)
                    )}
                    %)
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={isOptimizingPhotos}
                onClick={() => photoInputRef.current?.click()}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                {isOptimizingPhotos ? 'Optimizing...' : '+ Select Photo(s)'}
              </button>
            </div>

            {stagedPhotos.length > 0 && (
              <div className="space-y-1.5">
                {stagedPhotos.length > 1 && (
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    Click the star on any staged photo to set it as the primary photo.
                  </div>
                )}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {stagedPhotos.map((p, idx) => (
                    <div
                      key={`${p.originalFileName}-${idx}`}
                      className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 ${
                        idx === 0 && stagedPhotos.length > 1
                          ? 'border-[var(--barn-sage)]'
                          : 'border-[var(--barn-border)]'
                      }`}
                    >
                      <img
                        src={p.thumbnailDataUrl}
                        alt={p.originalFileName}
                        className="w-full h-full object-cover"
                      />
                      {stagedPhotos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (idx === 0) return;
                            setStagedPhotos((prev) => {
                              const next = [...prev];
                              const [picked] = next.splice(idx, 1);
                              return [picked, ...next];
                            });
                          }}
                          title={idx === 0 ? 'Primary photo' : 'Set as primary photo'}
                          aria-label={idx === 0 ? 'Primary photo' : 'Set as primary photo'}
                          className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-md bg-black/75 text-white flex items-center justify-center"
                        >
                          <Star
                            className={`w-3 h-3 ${
                              idx === 0 ? 'fill-amber-400 text-amber-400' : 'text-white/80'
                            }`}
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setStagedPhotos((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label="Remove staged photo"
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-md bg-black/75 text-white flex items-center justify-center"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--barn-border)]">
            {isEditing && onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--barn-danger)] font-medium">
                    Confirm delete?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(initialAnimal!);
                      onClose();
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-white text-xs font-semibold"
                  >
                    Yes, Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)]"
                >
                  Delete Animal
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
              >
                Save {speciesProfile.name}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
