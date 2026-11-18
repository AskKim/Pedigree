/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Animal Registry Editor Modal.
 *
 * Strictly filters Sire and Dam candidates to the animal's exact `species` AND validates
 * against pedigree cycles (`wouldCreateCycle`). Includes Evans-inspired phenotype-to-genotype
 * baseline presets (`New Zealand Red -> A_ B_ C_ D_ ee ww`, etc.) when editing Rabbits.
 */

import { AlertCircle, AlertTriangle, Camera, Loader2, ShieldAlert, Trash2, X } from 'lucide-react';
import React, { useId, useMemo, useRef, useState } from 'react';
import {
  findAllSpeciesDuplicateTattooPeers,
  findOffspringRequiringParentSex,
  findSameSexDuplicateTattooCollisions,
  isOverrideConfirmationValid,
} from '../core/animalConflicts';
import {
  CageAssignmentCapacityWarning,
  evaluateAnimalActiveWithdrawal,
  evaluateCageAssignmentCapacityWarning,
  evaluateSpeciesCagesOccupancy,
  evaluateWithdrawalDispositionWarning,
  isCageOccupyingAnimal,
  normalizeCageLabelKey,
  WithdrawalDispositionWarning,
} from '../core/barnAlerts';
import {
  extractHomozygousCoatClearances,
  getAnimalCarrierDisclosures,
  getCarrierTraitSuggestionsForSpecies,
  normalizeCarrierTraitList,
  reconcileCarrierTraitLists,
} from '../core/carrierGenetics';
import {
  buildPresetGenotypeWithConfirmations,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  parseGenotypeString,
  setLocusInGenotypeString,
  VarietyPresetDefinition,
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
  BiologicalSex,
  CageLocation,
  CareLog,
  CLEARED_CARRIER_PROOF_LABELS,
  ClearedCarrierProofType,
  ClearedCarrierRecord,
  doesAnimalNeedAttention,
  formatReadableDate,
  formatSexForSpecies,
  formatWeightInputValue,
  getSpeciesIdentifierLabels,
  getWeightInputMeta,
  isAnimalArchived,
  isSameSpecies,
  normalizeCurrencyCode,
  normalizeOwnershipType,
  normalizeRufusLevel,
  OWNERSHIP_TYPES,
  OwnershipType,
  parseWeightInputToGrams,
  RUFUS_LEVEL_OPTIONS,
  RufusLevel,
  SpeciesProfile,
  todayDateIso,
  WeightUnit,
} from '../core/models';
import {
  buildSpeciesHerdMap,
  calculatePairingCoi,
  getPedigreeCompletenessSummary,
  wouldCreateCycle,
} from '../core/pedigreeCalculator';
import {
  MAX_PHOTO_BATCH_COUNT,
  MAX_PHOTO_UPLOAD_BYTES,
  validateUploadFileSize,
} from '../core/inputSanitization';
import { optimizeImageFile } from '../storage/webImageOptimizer';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { CarrierTraitCombobox } from './CarrierTraitCombobox';
import { ColorGeneticsNotice } from './ColorGeneticsNotice';
import { SearchableParentPicker } from './SearchableParentPicker';

interface AnimalEditorModalProps {
  initialAnimal: Animal | null;
  speciesProfile: SpeciesProfile;
  speciesAnimals: Animal[];
  speciesCages: CageLocation[];
  animalCareLogs?: CareLog[];
  preferredUnit: WeightUnit;
  currencyCode?: string;
  optimizationPresetId?: ImageOptimizationPresetId;
  defaultBreederName: string;
  defaultOwnerName: string;
  forcedSex?: BiologicalSex;
  opfsSupported?: boolean;
  autoOffloadRetiredToOpfs?: boolean;
  onSave: (
    draft: Omit<Animal, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string },
    pendingPhotos?: Array<OptimizedImagePayload & { caption?: string }>
  ) => Promise<string | null | void> | string | void;
  onOffloadRetiredAnimal?: (animalId: string) => Promise<void> | void;
  onSetAutoOffloadRetired?: (enabled: boolean) => void;
  onDelete?: (animal: Animal) => Promise<void> | void;
  onClose: () => void;
}

export function AnimalEditorModal({
  initialAnimal,
  speciesProfile,
  speciesAnimals,
  speciesCages,
  animalCareLogs,
  preferredUnit,
  currencyCode,
  optimizationPresetId,
  defaultBreederName,
  defaultOwnerName,
  forcedSex,
  opfsSupported = false,
  autoOffloadRetiredToOpfs = false,
  onSave,
  onOffloadRetiredAnimal,
  onSetAutoOffloadRetired,
  onDelete,
  onClose,
}: AnimalEditorModalProps) {
  const isEditing = Boolean(initialAnimal?.id);
  const defaultPrefix = (speciesProfile.defaultAnimalPrefix || '').trim();
  const [pendingOffloadPrompt, setPendingOffloadPrompt] = useState<{
    animalId: string;
    animalName: string;
    status: AnimalStatus;
  } | null>(null);
  const [pendingWithdrawalWarning, setPendingWithdrawalWarning] =
    useState<WithdrawalDispositionWarning | null>(null);
  const [pendingCapacityWarning, setPendingCapacityWarning] =
    useState<CageAssignmentCapacityWarning | null>(null);
  const [rememberAutoOffload, setRememberAutoOffload] = useState(false);
  const [offloadingNow, setOffloadingNow] = useState(false);
  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });

  const activeWithdrawal = useMemo(
    () =>
      initialAnimal?.id && animalCareLogs && animalCareLogs.length > 0
        ? evaluateAnimalActiveWithdrawal(animalCareLogs, initialAnimal.id)
        : null,
    [initialAnimal?.id, animalCareLogs]
  );

  const [tattoo, setTattoo] = useState(initialAnimal?.tattoo || '');
  const [name, setName] = useState(() => {
    if (initialAnimal?.name) return initialAnimal.name;
    return defaultPrefix ? `${defaultPrefix} ` : '';
  });
  const [breed, setBreed] = useState(
    initialAnimal?.breed ||
      (isSameSpecies(speciesProfile.name, 'Rabbit')
        ? 'New Zealand'
        : speciesProfile.exampleBreeds[0] || '')
  );
  const [variety, setVariety] = useState(initialAnimal?.variety || '');
  const [sex, setSex] = useState<BiologicalSex>(forcedSex || initialAnimal?.sex || 'Female');
  const [status, setStatus] = useState<AnimalStatus>(initialAnimal?.status || 'Active');
  const [archived, setArchived] = useState<boolean>(
    initialAnimal ? isAnimalArchived(initialAnimal) : false
  );
  const [needsAttention, setNeedsAttention] = useState<boolean>(
    initialAnimal ? doesAnimalNeedAttention(initialAnimal) : false
  );
  const [includeArchivedParents, setIncludeArchivedParents] = useState<boolean>(() => {
    if (!initialAnimal) return false;
    const sireArch = initialAnimal.sireId
      ? isAnimalArchived(speciesAnimals.find((a) => a.id === initialAnimal.sireId))
      : false;
    const damArch = initialAnimal.damId
      ? isAnimalArchived(speciesAnimals.find((a) => a.id === initialAnimal.damId))
      : false;
    return sireArch || damArch;
  });
  const [birthDateIso, setBirthDateIso] = useState(initialAnimal?.birthDateIso || '');
  const [weightInput, setWeightInput] = useState(() =>
    formatWeightInputValue(initialAnimal?.weightGrams || 0, preferredUnit)
  );
  const weightMeta = getWeightInputMeta(preferredUnit);
  const idLabels = getSpeciesIdentifierLabels(speciesProfile.name);
  // Conservative default: NEVER silently auto-fill unverified modifiers like 'ww' on new animals
  const [genotypeRaw, setGenotypeRaw] = useState(initialAnimal?.genotypeRaw || '');
  const [showLocusBuilder, setShowLocusBuilder] = useState(false);
  const [rufusLevel, setRufusLevel] = useState<RufusLevel>(() =>
    normalizeRufusLevel(initialAnimal?.rufusLevel)
  );
  const [stagedPreset, setStagedPreset] = useState<VarietyPresetDefinition | null>(null);
  const [stagedPresetChecks, setStagedPresetChecks] = useState<Record<string, boolean>>({});
  const initialCarriers = getAnimalCarrierDisclosures(initialAnimal);
  const [suspectedCarrierOf, setSuspectedCarrierOf] = useState<string[]>(
    initialCarriers.suspected
  );
  const [confirmedCarrierOf, setConfirmedCarrierOf] = useState<string[]>(
    initialCarriers.confirmed
  );
  const [clearedCarrierOf, setClearedCarrierOf] = useState<ClearedCarrierRecord[]>(
    initialCarriers.cleared
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
  const [ownershipType, setOwnershipType] = useState<OwnershipType>(() =>
    normalizeOwnershipType(initialAnimal?.ownershipType, 'Owned')
  );
  const [culled, setCulled] = useState<boolean>(Boolean(initialAnimal?.culled));
  const [cullDateIso, setCullDateIso] = useState(initialAnimal?.cullDateIso || '');
  const [cullReason, setCullReason] = useState(initialAnimal?.cullReason || '');
  const [deceasedDateIso, setDeceasedDateIso] = useState(initialAnimal?.deceasedDateIso || '');
  const [deathCause, setDeathCause] = useState(initialAnimal?.deathCause || '');
  const [soldDateIso, setSoldDateIso] = useState(initialAnimal?.soldDateIso || '');
  const [salePriceInput, setSalePriceInput] = useState(() =>
    initialAnimal?.salePriceCents && initialAnimal.salePriceCents > 0
      ? (initialAnimal.salePriceCents / 100).toFixed(2)
      : ''
  );
  const [purchaseCostInput, setPurchaseCostInput] = useState(() =>
    initialAnimal?.purchaseCostCents && initialAnimal.purchaseCostCents > 0
      ? (initialAnimal.purchaseCostCents / 100).toFixed(2)
      : ''
  );
  const [buyerName, setBuyerName] = useState(initialAnimal?.buyerName || '');
  const resolvedCurrency = normalizeCurrencyCode(currencyCode, 'USD');
  const [sireId, setSireId] = useState(initialAnimal?.sireId || '');
  const [damId, setDamId] = useState(initialAnimal?.damId || '');
  const [notes, setNotes] = useState(initialAnimal?.notes || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicateOverrideInput, setDuplicateOverrideInput] = useState('');
  const [submitGuardError, setSubmitGuardError] = useState<string | null>(null);
  const overrideInputRef = useRef<HTMLInputElement | null>(null);

  const [stagedPhotos, setStagedPhotos] = useState<OptimizedImagePayload[]>([]);
  const [isOptimizingPhotos, setIsOptimizingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const activePreset = resolveImageOptimizationPreset(optimizationPresetId);
  const baseId = useId();
  const dialogRef = useAccessibleDialog({ isOpen: true, onClose });

  const handleSelectModalPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsOptimizingPhotos(true);
    setPhotoError(null);
    try {
      const next: OptimizedImagePayload[] = [];
      const failures: string[] = [];
      const countToProcess = Math.min(files.length, MAX_PHOTO_BATCH_COUNT);
      if (files.length > MAX_PHOTO_BATCH_COUNT) {
        failures.push(
          `Selected ${files.length} photos; processing the first ${MAX_PHOTO_BATCH_COUNT} per batch.`
        );
      }
      for (let i = 0; i < countToProcess; i++) {
        const file = files[i];
        const sizeCheck = validateUploadFileSize(
          file.name,
          file.size,
          MAX_PHOTO_UPLOAD_BYTES,
          'an animal photo'
        );
        if (!sizeCheck.ok) {
          failures.push(sizeCheck.error);
          continue;
        }
        try {
          const opt = await optimizeImageFile(file, activePreset.id);
          next.push(opt);
        } catch (err) {
          failures.push(
            err instanceof Error ? err.message : `Could not decode "${file.name}"`
          );
        }
      }
      if (next.length > 0) {
        setStagedPhotos((prev) => [...prev, ...next]);
      }
      if (failures.length > 0) {
        setPhotoError(failures[0]);
      }
    } finally {
      setIsOptimizingPhotos(false);
    }
  };

  const herdById = useMemo(
    () => buildSpeciesHerdMap(speciesAnimals, speciesProfile.name),
    [speciesAnimals, speciesProfile.name]
  );

  const cagesOccupancySummary = useMemo(
    () => evaluateSpeciesCagesOccupancy(speciesCages, speciesAnimals, speciesProfile.name),
    [speciesCages, speciesAnimals, speciesProfile.name]
  );

  const matchedCageEval = useMemo(() => {
    const key = normalizeCageLabelKey(cageLocation);
    return key ? cagesOccupancySummary.byLabelKey.get(key) ?? null : null;
  }, [cagesOccupancySummary, cageLocation]);

  const wasAlreadyOccupyingTargetCage = useMemo(() => {
    if (!initialAnimal) return false;
    if (!isCageOccupyingAnimal(initialAnimal)) return false;
    const initialKey = normalizeCageLabelKey(initialAnimal.cageLocation);
    const targetKey = normalizeCageLabelKey(cageLocation);
    return Boolean(initialKey && targetKey && initialKey === targetKey);
  }, [initialAnimal, cageLocation]);

  const willOccupyAfterSave = isCageOccupyingAnimal({
    status,
    archived,
    offloadedArchiveKey: initialAnimal?.offloadedArchiveKey,
  });

  const liveCageCapacityWarning = useMemo(
    () =>
      evaluateCageAssignmentCapacityWarning({
        targetCageLabel: cageLocation,
        cages: speciesCages,
        animals: speciesAnimals,
        speciesName: speciesProfile.name,
        animalId: initialAnimal?.id,
        animalName: name,
        wasAlreadyOccupyingTargetCage,
        willOccupyAfterSave,
      }),
    [
      cageLocation,
      speciesCages,
      speciesAnimals,
      speciesProfile.name,
      initialAnimal?.id,
      name,
      wasAlreadyOccupyingTargetCage,
      willOccupyAfterSave,
    ]
  );

  const archivedParentCount = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          c.id !== initialAnimal?.id &&
          isAnimalArchived(c)
      ).length,
    [speciesAnimals, speciesProfile.name, initialAnimal?.id]
  );

  // Strictly species-isolated, sex-appropriate, cycle-safe parent options (Male only for Sire, Female only for Dam)
  const sireCandidates = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          c.sex === 'Male' &&
          c.id !== initialAnimal?.id &&
          (!isAnimalArchived(c) || includeArchivedParents || c.id === sireId) &&
          (!initialAnimal?.id || !wouldCreateCycle(initialAnimal.id, c.id, herdById))
      ),
    [speciesAnimals, speciesProfile.name, initialAnimal?.id, includeArchivedParents, sireId, herdById]
  );

  const damCandidates = useMemo(
    () =>
      speciesAnimals.filter(
        (c) =>
          isSameSpecies(c.species, speciesProfile.name) &&
          c.sex === 'Female' &&
          c.id !== initialAnimal?.id &&
          (!isAnimalArchived(c) || includeArchivedParents || c.id === damId) &&
          (!initialAnimal?.id || !wouldCreateCycle(initialAnimal.id, c.id, herdById))
      ),
    [speciesAnimals, speciesProfile.name, initialAnimal?.id, includeArchivedParents, damId, herdById]
  );

  const currentSireObj = useMemo(
    () => (sireId ? speciesAnimals.find((a) => a.id === sireId) : undefined),
    [sireId, speciesAnimals]
  );
  const currentDamObj = useMemo(
    () => (damId ? speciesAnimals.find((a) => a.id === damId) : undefined),
    [damId, speciesAnimals]
  );
  const hasMismatchedCurrentSire = Boolean(currentSireObj && currentSireObj.sex !== 'Male');
  const hasMismatchedCurrentDam = Boolean(currentDamObj && currentDamObj.sex !== 'Female');

  const offspringParentConstraints = useMemo(
    () =>
      initialAnimal?.id
        ? findOffspringRequiringParentSex(initialAnimal.id, speciesProfile.name, speciesAnimals)
        : { asSireOf: [], asDamOf: [] },
    [initialAnimal?.id, speciesProfile.name, speciesAnimals]
  );

  const sexChangeMismatchError = useMemo(() => {
    if (offspringParentConstraints.asSireOf.length > 0 && sex !== 'Male') {
      const sample = offspringParentConstraints.asSireOf
        .slice(0, 3)
        .map((k) => k.name)
        .join(', ');
      return `Cannot change sex to ${sex}: ${offspringParentConstraints.asSireOf.length} offspring (${sample}${
        offspringParentConstraints.asSireOf.length > 3 ? ', ...' : ''
      }) link this animal as Sire (${speciesProfile.maleLabel}). Unlink them first or keep Male.`;
    }
    if (offspringParentConstraints.asDamOf.length > 0 && sex !== 'Female') {
      const sample = offspringParentConstraints.asDamOf
        .slice(0, 3)
        .map((k) => k.name)
        .join(', ');
      return `Cannot change sex to ${sex}: ${offspringParentConstraints.asDamOf.length} offspring (${sample}${
        offspringParentConstraints.asDamOf.length > 3 ? ', ...' : ''
      }) link this animal as Dam (${speciesProfile.femaleLabel}). Unlink them first or keep Female.`;
    }
    return null;
  }, [offspringParentConstraints, sex, speciesProfile.maleLabel, speciesProfile.femaleLabel]);

  const excludeSelfIds = useMemo(
    () => (initialAnimal?.id ? [initialAnimal.id] : []),
    [initialAnimal?.id]
  );

  const sameSexTattooCollisions = useMemo(
    () =>
      findSameSexDuplicateTattooCollisions({
        tattoo,
        sex,
        species: speciesProfile.name,
        animals: speciesAnimals,
        excludeAnimalIds: excludeSelfIds,
      }),
    [tattoo, sex, speciesProfile.name, speciesAnimals, excludeSelfIds]
  );

  const allSameSpeciesTattooPeers = useMemo(
    () =>
      findAllSpeciesDuplicateTattooPeers({
        tattoo,
        species: speciesProfile.name,
        animals: speciesAnimals,
        excludeAnimalIds: excludeSelfIds,
      }),
    [tattoo, speciesProfile.name, speciesAnimals, excludeSelfIds]
  );

  const requiresDuplicateOverrideOnCreate =
    !isEditing && sameSexTattooCollisions.length > 0;
  const overrideConfirmed = isOverrideConfirmationValid(duplicateOverrideInput);

  const projectedCoi = useMemo(() => {
    if (!sireId || !damId) return null;
    return calculatePairingCoi(sireId, damId, herdById);
  }, [sireId, damId, herdById]);

  const speciesGeneticsSpec = useMemo(
    () => getGeneticsSpecForSpecies(speciesProfile.name),
    [speciesProfile.name]
  );

  const speciesVarietyPresets = useMemo(
    () => getSpeciesVarietyPresets(speciesProfile.name),
    [speciesProfile.name]
  );

  const parsedLocusPairsByCode = useMemo(() => {
    const map = new Map<string, { allele1: string; allele2: string }>();
    if (!speciesGeneticsSpec) return map;
    for (const pair of parseGenotypeString(genotypeRaw, speciesProfile.name)) {
      map.set(pair.locus, { allele1: pair.allele1 || '_', allele2: pair.allele2 || '_' });
    }
    return map;
  }, [speciesGeneticsSpec, genotypeRaw, speciesProfile.name]);

  const liveHomozygousClearances = useMemo(
    () =>
      extractHomozygousCoatClearances({
        species: speciesProfile.name,
        genotypeRaw,
        confirmedCarrierOf,
        suspectedCarrierOf,
        clearedCarrierOf,
      }),
    [speciesProfile.name, genotypeRaw, confirmedCarrierOf, suspectedCarrierOf, clearedCarrierOf]
  );

  const carrierTraitSuggestions = useMemo(() => {
    const presetList = getCarrierTraitSuggestionsForSpecies(speciesProfile.name);
    const herdCustom: string[] = [];
    for (const a of speciesAnimals) {
      if (a.suspectedCarrierOf) herdCustom.push(...a.suspectedCarrierOf);
      if (a.confirmedCarrierOf) herdCustom.push(...a.confirmedCarrierOf);
      if (a.clearedCarrierOf) herdCustom.push(...a.clearedCarrierOf.map((c) => c.trait));
    }
    return normalizeCarrierTraitList([...presetList, ...herdCustom]);
  }, [speciesProfile.name, speciesAnimals]);

  const handleSelectVarietyPreset = (varietyName: string) => {
    if (!varietyName) return;
    const preset = speciesVarietyPresets.find((p) => p.variety === varietyName);
    if (!preset) return;
    if (preset.optionalConfirmations && preset.optionalConfirmations.length > 0) {
      setStagedPreset(preset);
      setStagedPresetChecks({});
    } else {
      setStagedPreset(null);
      setStagedPresetChecks({});
      setGenotypeRaw(preset.conservativeGenotype);
    }
  };

  const handleApplyStagedPreset = () => {
    if (!stagedPreset) return;
    const checkedLoci = Object.entries(stagedPresetChecks)
      .filter(([, checked]) => checked)
      .map(([locus]) => locus);
    const built = buildPresetGenotypeWithConfirmations(
      stagedPreset,
      checkedLoci,
      speciesProfile.name
    );
    setGenotypeRaw(built);
    setStagedPreset(null);
    setStagedPresetChecks({});
  };

  const handleClearedTraitsChange = (nextTraits: string[]) => {
    const existingByKey = new Map(
      clearedCarrierOf.map((c) => [c.trait.trim().toLowerCase(), c])
    );
    const nextRecords: ClearedCarrierRecord[] = nextTraits.map((trait) => {
      const prev = existingByKey.get(trait.trim().toLowerCase());
      return (
        prev || {
          trait,
          proofType: 'test_bred',
          testBreedingCount: 2,
        }
      );
    });
    const reconciled = reconcileCarrierTraitLists(
      suspectedCarrierOf,
      confirmedCarrierOf,
      nextRecords,
      'cleared'
    );
    setClearedCarrierOf(reconciled.clearedCarrierOf);
    setConfirmedCarrierOf(reconciled.confirmedCarrierOf);
    setSuspectedCarrierOf(reconciled.suspectedCarrierOf);
  };

  const updateClearedProof = (
    trait: string,
    patch: Partial<Pick<ClearedCarrierRecord, 'proofType' | 'testBreedingCount'>>
  ) => {
    const lower = trait.trim().toLowerCase();
    setClearedCarrierOf((prev) =>
      prev.map((rec) =>
        rec.trait.trim().toLowerCase() === lower ? { ...rec, ...patch } : rec
      )
    );
  };

  const parseMoneyToCents = (raw: string): number => {
    const parsed = Number.parseFloat(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  };

  const executeSave = async () => {
    setSubmitGuardError(null);
    setPendingWithdrawalWarning(null);
    setPendingCapacityWarning(null);
    await submitLock.runLocked(async () => {
      const reconciled = reconcileCarrierTraitLists(
        suspectedCarrierOf,
        confirmedCarrierOf,
        clearedCarrierOf
      );
      const wasRetired = Boolean(
        initialAnimal && (initialAnimal.status === 'Sold' || initialAnimal.status === 'Deceased')
      );
      const becomingRetired =
        (status === 'Sold' || status === 'Deceased') &&
        !wasRetired &&
        !initialAnimal?.offloadedArchiveKey;

      const savedResult = await onSave(
        {
          id: initialAnimal?.id,
          createdAt: initialAnimal?.createdAt,
          tattoo: tattoo.trim(),
          name: name.trim(),
          species: speciesProfile.name, // Strictly locked to active species
          breed: breed.trim(),
          variety: variety.trim(),
          sex,
          status,
          archived,
          needsAttention,
          birthDateIso,
          weightGrams: parseWeightInputToGrams(weightInput, preferredUnit),
          genotype: parseGenotypeString(genotypeRaw, speciesProfile.name),
          genotypeRaw: genotypeRaw.trim(),
          rufusLevel,
          suspectedCarrierOf: reconciled.suspectedCarrierOf,
          confirmedCarrierOf: reconciled.confirmedCarrierOf,
          clearedCarrierOf: reconciled.clearedCarrierOf,
          registrationNumber: registrationNumber.trim(),
          grandChampionNumber: grandChampionNumber.trim(),
          legsCount: Math.max(0, Number(legsCount) || 0),
          cageLocation: cageLocation.trim(),
          breederName: breederName.trim(),
          ownerName: ownerName.trim(),
          ownershipType,
          culled,
          cullDateIso: culled ? cullDateIso : '',
          cullReason: culled ? cullReason.trim() : '',
          deceasedDateIso: status === 'Deceased' ? deceasedDateIso : initialAnimal?.deceasedDateIso || '',
          deathCause: status === 'Deceased' ? deathCause.trim() : initialAnimal?.deathCause || '',
          soldDateIso: status === 'Sold' ? soldDateIso : initialAnimal?.soldDateIso || '',
          salePriceCents: status === 'Sold' ? parseMoneyToCents(salePriceInput) : initialAnimal?.salePriceCents || 0,
          purchaseCostCents: parseMoneyToCents(purchaseCostInput),
          buyerName: status === 'Sold' ? buyerName.trim() : initialAnimal?.buyerName || '',
          sireId,
          damId,
          notes: notes.trim(),
          offloadedArchiveKey: initialAnimal?.offloadedArchiveKey,
          offloadedAtIso: initialAnimal?.offloadedAtIso,
        },
        stagedPhotos.length > 0 ? stagedPhotos : undefined
      );

      if (savedResult === null) {
        setSubmitGuardError(
          'Could not save record to browser storage — your typed entries have been kept intact. Check available storage and try again.'
        );
        return;
      }

      const savedId =
        typeof savedResult === 'string' && savedResult.trim()
          ? savedResult.trim()
          : initialAnimal?.id || '';

      if (becomingRetired && opfsSupported && onOffloadRetiredAnimal && savedId) {
        if (autoOffloadRetiredToOpfs) {
          setOffloadingNow(true);
          try {
            await onOffloadRetiredAnimal(savedId);
          } finally {
            setOffloadingNow(false);
          }
          onClose();
          return;
        }
        setPendingOffloadPrompt({
          animalId: savedId,
          animalName: name.trim(),
          status,
        });
        return;
      }

      onClose();
    });
  };

  const checkCapacityThenSave = async () => {
    setPendingWithdrawalWarning(null);
    if (liveCageCapacityWarning?.wouldExceed) {
      setSubmitGuardError(null);
      setPendingCapacityWarning(liveCageCapacityWarning);
      return;
    }
    await executeSave();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (sexChangeMismatchError) {
      setSubmitGuardError(sexChangeMismatchError);
      return;
    }
    if (requiresDuplicateOverrideOnCreate && !overrideConfirmed) {
      setSubmitGuardError(
        `This ${idLabels.shortLabel.toLowerCase()} already belongs to another ${formatSexForSpecies(
          sex,
          speciesProfile
        ).toLowerCase()} in your ${speciesProfile.name} herd. Use a unique ${idLabels.shortLabel.toLowerCase()} or type "override" below to save anyway.`
      );
      overrideInputRef.current?.focus();
      return;
    }

    const dispositionWarning = evaluateWithdrawalDispositionWarning(activeWithdrawal, {
      animalName: name.trim() || initialAnimal?.name || '',
      isNewlySold: status === 'Sold' && initialAnimal?.status !== 'Sold',
      isNewlyCulled: culled && !initialAnimal?.culled,
    });
    if (dispositionWarning) {
      setSubmitGuardError(null);
      setPendingCapacityWarning(null);
      setPendingWithdrawalWarning(dispositionWarning);
      return;
    }

    await checkCapacityThenSave();
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Edit ${initialAnimal?.name}` : `Register ${speciesProfile.name}`}
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--barn-border)]">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {pendingOffloadPrompt
                ? `Archive ${pendingOffloadPrompt.animalName} to OPFS`
                : isEditing
                ? `Edit ${initialAnimal?.name}`
                : `Add ${speciesProfile.name} Record`}
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

        {pendingOffloadPrompt ? (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="font-semibold text-sm text-[var(--barn-ink)]">
                Offload full photos &amp; logs to OPFS <code className="font-mono">/archives</code>?
              </div>
              <p className="text-[var(--barn-muted)] leading-relaxed">
                <strong>{pendingOffloadPrompt.animalName}</strong> was saved as{' '}
                <strong>{pendingOffloadPrompt.status}</strong>. You can keep its record in the local
                Archived tab, or compress its full-resolution photos and care logs into an{' '}
                <code className="font-mono">.archive.zip</code> bundle in OPFS{' '}
                <code className="font-mono">/archives</code> (any sire/dam pedigree lineage links
                stay intact as a lightweight Pedigree Reference stub).
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={rememberAutoOffload}
                onChange={(e) => setRememberAutoOffload(e.target.checked)}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">
                  Always auto-offload Sold/Deceased records
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Automatically archives future Sold or Deceased animals without prompting (can be
                  changed anytime in Import &amp; Settings).
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                disabled={offloadingNow}
                onClick={() => {
                  if (rememberAutoOffload) {
                    onSetAutoOffloadRetired?.(true);
                  }
                  onClose();
                }}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
              >
                Keep in Archived Tab
              </button>
              <button
                type="button"
                disabled={offloadingNow}
                onClick={async () => {
                  setOffloadingNow(true);
                  try {
                    if (rememberAutoOffload) {
                      onSetAutoOffloadRetired?.(true);
                    }
                    await onOffloadRetiredAnimal?.(pendingOffloadPrompt.animalId);
                  } finally {
                    setOffloadingNow(false);
                    onClose();
                  }
                }}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-50"
              >
                {offloadingNow ? 'Offloading to /archives...' : 'Offload to OPFS /archives'}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${baseId}-name`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Animal Name *
              </label>
              <input
                id={`${baseId}-name`}
                type="text"
                required
                placeholder="e.g. Copper Creek Ruby Rose"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-tattoo`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                {idLabels.fieldLabel}
              </label>
              <input
                id={`${baseId}-tattoo`}
                type="text"
                placeholder={idLabels.placeholder}
                value={tattoo}
                onChange={(e) => {
                  setTattoo(e.target.value);
                  setSubmitGuardError(null);
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
          </div>

          {requiresDuplicateOverrideOnCreate && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2.5 text-xs"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    Duplicate {idLabels.shortLabel} for Same-Sex {speciesProfile.name}
                  </div>
                  <p className="text-[var(--barn-ink)]/90">
                    <span className="font-mono font-semibold">{tattoo.trim()}</span> is already used by{' '}
                    {sameSexTattooCollisions
                      .slice(0, 3)
                      .map((c) => `${c.name}${isAnimalArchived(c) ? ' [Archived]' : ''}`)
                      .join(', ')}
                    {sameSexTattooCollisions.length > 3
                      ? ` (+${sameSexTattooCollisions.length - 3} more)`
                      : ''}{' '}
                    ({formatSexForSpecies(sex, speciesProfile)}). Please enter a unique{' '}
                    {idLabels.shortLabel.toLowerCase()} to avoid pedigree &amp; show mix-ups.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-0.5">
                <label
                  htmlFor={`${baseId}-dup-override`}
                  className="text-[11px] font-medium text-[var(--barn-ink)] shrink-0"
                >
                  To reuse anyway, type <code className="font-mono font-semibold">override</code>:
                </label>
                <input
                  id={`${baseId}-dup-override`}
                  ref={overrideInputRef}
                  type="text"
                  autoComplete="off"
                  placeholder="Type override"
                  value={duplicateOverrideInput}
                  onChange={(e) => {
                    setDuplicateOverrideInput(e.target.value);
                    setSubmitGuardError(null);
                  }}
                  className="w-full sm:w-44 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono"
                />
                {overrideConfirmed && (
                  <span className="text-[11px] font-semibold text-[var(--barn-sage)]">
                    Override confirmed
                  </span>
                )}
              </div>
            </div>
          )}

          {!requiresDuplicateOverrideOnCreate && allSameSpeciesTattooPeers.length > 0 && (
            <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-terracotta)]/50 text-xs text-[var(--barn-muted)] flex items-start gap-2">
              <AlertTriangle
                className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                Note: <span className="font-mono text-[var(--barn-ink)]">{tattoo.trim()}</span> also
                appears on {allSameSpeciesTattooPeers.length} other {speciesProfile.name.toLowerCase()}{' '}
                record(s):{' '}
                {allSameSpeciesTattooPeers
                  .slice(0, 3)
                  .map((p) => `${p.name} (${formatSexForSpecies(p.sex, speciesProfile)})`)
                  .join(', ')}
                .
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Sex{forcedSex ? ` (Locked to ${forcedSex} for pedigree slot)` : ''}
              </span>
              <div
                role="group"
                aria-label="Sex"
                className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              >
                {(
                  [
                    ['Male', speciesProfile.maleLabel],
                    ['Female', speciesProfile.femaleLabel],
                    ['Unknown', 'Unknown'],
                  ] as const
                ).map(([val, label]) => {
                  const lockedOut = Boolean(forcedSex && forcedSex !== val);
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={lockedOut}
                      aria-pressed={sex === val}
                      onClick={() => {
                        setSex(val);
                        setSubmitGuardError(null);
                      }}
                      className={`min-h-[36px] px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                        sex === val
                          ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                          : lockedOut
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-[var(--barn-subtle)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {sexChangeMismatchError && (
                <p role="alert" className="text-[11px] text-[var(--barn-danger)] font-medium mt-1">
                  {sexChangeMismatchError}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={`${baseId}-status`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Herd Status
              </label>
              <select
                id={`${baseId}-status`}
                value={status}
                onChange={(e) => {
                  const next = e.target.value as AnimalStatus;
                  setStatus(next);
                  setPendingWithdrawalWarning(null);
                  setPendingCapacityWarning(null);
                  if (next === 'Deceased' || next === 'Sold') {
                    setArchived(true);
                  }
                  if (next === 'Sold' && !soldDateIso) {
                    setSoldDateIso(todayDateIso());
                  }
                  if (next === 'Deceased' && !deceasedDateIso) {
                    setDeceasedDateIso(todayDateIso());
                  }
                }}
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <span className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Ownership Classification
              </span>
              <div
                role="group"
                aria-label="Ownership Classification"
                className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
              >
                {OWNERSHIP_TYPES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={ownershipType === opt.value}
                    onClick={() => setOwnershipType(opt.value)}
                    className={`min-h-[36px] px-2 py-1 rounded-md text-xs font-medium transition-colors truncate ${
                      ownershipType === opt.value
                        ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                        : 'hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {opt.value === 'Owned'
                      ? 'Owned'
                      : opt.value === 'Reference'
                      ? 'Reference'
                      : 'Outside'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-purchase-cost`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Acquisition Cost ({resolvedCurrency}, opt.)
              </label>
              <input
                id={`${baseId}-purchase-cost`}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={purchaseCostInput}
                onChange={(e) => setPurchaseCostInput(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          {status === 'Sold' && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div className="text-xs font-semibold text-[var(--barn-ink)]">Sold Stock Details</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-sold-date`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Sold Date
                  </label>
                  <input
                    id={`${baseId}-sold-date`}
                    type="date"
                    value={soldDateIso}
                    onChange={(e) => setSoldDateIso(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-sale-price`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Sale Price ({resolvedCurrency})
                  </label>
                  <input
                    id={`${baseId}-sale-price`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={salePriceInput}
                    onChange={(e) => setSalePriceInput(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-buyer-name`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Buyer Name
                  </label>
                  <input
                    id={`${baseId}-buyer-name`}
                    type="text"
                    placeholder="Buyer / Farm name"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {status === 'Deceased' && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              <div className="text-xs font-semibold text-[var(--barn-ink)]">
                Mortality / Loss Details
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-deceased-date`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Date Deceased
                  </label>
                  <input
                    id={`${baseId}-deceased-date`}
                    type="date"
                    value={deceasedDateIso}
                    onChange={(e) => setDeceasedDateIso(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-death-cause`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Cause / Category
                  </label>
                  <input
                    id={`${baseId}-death-cause`}
                    type="text"
                    list="death-cause-suggestions"
                    placeholder="e.g. Illness, Predator, Birth Complication"
                    value={deathCause}
                    onChange={(e) => setDeathCause(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                  />
                  <datalist id="death-cause-suggestions">
                    <option value="Illness" />
                    <option value="Birth Complication" />
                    <option value="Predator" />
                    <option value="Injury" />
                    <option value="Heat / Weather Stress" />
                    <option value="Old Age" />
                    <option value="Unknown" />
                  </datalist>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => {
                  setArchived(e.target.checked);
                  setPendingCapacityWarning(null);
                }}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">
                  Archived / Non-Active (Retain for Pedigrees Only)
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Moves this animal out of the active herd and active barn chores while keeping its
                  lineage available when linking pedigrees.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                needsAttention
                  ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)]'
                  : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
              }`}
            >
              <input
                type="checkbox"
                checked={needsAttention}
                onChange={(e) => setNeedsAttention(e.target.checked)}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-terracotta)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)] inline-flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-[var(--barn-terracotta)]" aria-hidden="true" />
                  Needs Attention (Review / Complete Record)
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Shows a reminder on Home &amp; Species Hub until details ({idLabels.shortLabel.toLowerCase()}, pedigree, breed)
                  are finished. Uncheck once resolved.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3 space-y-3 text-xs">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={culled}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setCulled(checked);
                  setPendingWithdrawalWarning(null);
                  if (checked && !cullDateIso) {
                    setCullDateIso(todayDateIso());
                  }
                }}
                className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-terracotta)]"
              />
              <span>
                <strong className="text-[var(--barn-ink)]">
                  Flagged for Cull / Breeding Removal
                </strong>
                <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                  Marks this animal for the Cull Decision Report with optional date and reason.
                </span>
              </span>
            </label>

            {culled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor={`${baseId}-cull-date`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Cull / Decision Date
                  </label>
                  <input
                    id={`${baseId}-cull-date`}
                    type="date"
                    value={cullDateIso}
                    onChange={(e) => setCullDateIso(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-cull-reason`}
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Cull Reason
                  </label>
                  <input
                    id={`${baseId}-cull-reason`}
                    type="text"
                    list="cull-reason-suggestions"
                    placeholder="e.g. Conformation, Low Production, Disposition"
                    value={cullReason}
                    onChange={(e) => setCullReason(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
                  />
                  <datalist id="cull-reason-suggestions">
                    <option value="Conformation" />
                    <option value="Low Production" />
                    <option value="Mothering / Fertility" />
                    <option value="Disposition" />
                    <option value="Chronic Health" />
                    <option value="Herd Size Reduction" />
                  </datalist>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor={`${baseId}-breed`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Breed
              </label>
              <input
                id={`${baseId}-breed`}
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
              <label
                htmlFor={`${baseId}-variety`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Variety / Color
              </label>
              <input
                id={`${baseId}-variety`}
                type="text"
                placeholder="e.g. Red"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-cage`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Cage / Pen Location
              </label>
              <input
                id={`${baseId}-cage`}
                type="text"
                list="cage-suggestions"
                placeholder="e.g. Hutch R-07"
                value={cageLocation}
                onChange={(e) => {
                  setCageLocation(e.target.value);
                  setPendingCapacityWarning(null);
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
              <datalist id="cage-suggestions">
                {speciesCages.map((c) => {
                  const evalItem = cagesOccupancySummary.byCageId.get(c.id);
                  return (
                    <option key={c.id} value={c.label}>
                      {evalItem ? `${c.label} (${evalItem.ratioLabel})` : c.label}
                    </option>
                  );
                })}
              </datalist>
              {matchedCageEval && (
                <div
                  className={`mt-1 text-[11px] font-mono tabular-nums flex items-center gap-1 ${
                    liveCageCapacityWarning?.wouldExceed || matchedCageEval.isOverCapacity
                      ? 'text-[var(--barn-danger)] font-semibold'
                      : matchedCageEval.isAtCapacity
                        ? 'text-[var(--barn-terracotta)] font-medium'
                        : 'text-[var(--barn-muted)]'
                  }`}
                >
                  {(liveCageCapacityWarning?.wouldExceed || matchedCageEval.isOverCapacity) && (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {liveCageCapacityWarning?.wouldExceed
                      ? `${matchedCageEval.cage.label}: ${matchedCageEval.ratioLabel} — saving puts at ${liveCageCapacityWarning.projectedOccupantCount}/${liveCageCapacityWarning.capacity} (over capacity)`
                      : `${matchedCageEval.cage.label}: ${matchedCageEval.ratioLabel}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-birth-date`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Birth Date
              </label>
              <input
                id={`${baseId}-birth-date`}
                type="date"
                value={birthDateIso}
                onChange={(e) => setBirthDateIso(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-weight`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Weight ({weightMeta.unitLabel})
              </label>
              <input
                id={`${baseId}-weight`}
                type="number"
                step="0.01"
                min="0"
                placeholder={weightMeta.placeholder}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-legs`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Show Legs Won
              </label>
              <input
                id={`${baseId}-legs`}
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
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor={`${baseId}-genotype`}
                  className="text-xs font-medium text-[var(--barn-muted)]"
                >
                  {speciesGeneticsSpec
                    ? `${speciesProfile.name} Coat Color Genotype Loci (${speciesGeneticsSpec.loci.map((l) => l.locus).join(', ')})`
                    : `${speciesProfile.name} Color / DNA Genotype Notes`}
                </label>
                <ColorGeneticsNotice compact />
              </div>
              {speciesVarietyPresets.length > 0 && (
                <select
                  aria-label={`Apply ${speciesProfile.name} variety genotype preset`}
                  value=""
                  onChange={(e) => handleSelectVarietyPreset(e.target.value)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                >
                  <option value="">
                    Conservative baseline from {speciesProfile.name} variety...
                  </option>
                  {speciesVarietyPresets.map((preset) => (
                    <option key={preset.variety} value={preset.variety}>
                      {preset.variety} ({preset.conservativeGenotype})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {stagedPreset && (
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-sage)] space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[var(--barn-ink)]">
                      Verify Optional Modifiers for &ldquo;{stagedPreset.variety}&rdquo;
                    </div>
                    <div className="text-[11px] text-[var(--barn-muted)]">
                      Conservative baseline:{' '}
                      <code className="font-mono text-[var(--barn-ink)]">
                        {buildPresetGenotypeWithConfirmations(
                          stagedPreset,
                          Object.entries(stagedPresetChecks)
                            .filter(([, v]) => v)
                            .map(([k]) => k),
                          speciesProfile.name
                        )}
                      </code>
                    </div>
                  </div>
                </div>
                {(stagedPreset.optionalConfirmations || []).map((opt) => (
                  <label
                    key={opt.locus}
                    className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(stagedPresetChecks[opt.locus])}
                      onChange={(e) =>
                        setStagedPresetChecks((prev) => ({
                          ...prev,
                          [opt.locus]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    <span>
                      <strong className="text-[var(--barn-ink)]">{opt.label}</strong>
                      <span className="block text-[11px] text-[var(--barn-muted)] mt-0.5">
                        {opt.explanation}
                      </span>
                    </span>
                  </label>
                ))}
                {stagedPreset.note && (
                  <p className="text-[11px] text-[var(--barn-muted)]">{stagedPreset.note}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStagedPreset(null);
                      setStagedPresetChecks({});
                    }}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyStagedPreset}
                    className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold"
                  >
                    Apply Preset
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id={`${baseId}-genotype`}
                type="text"
                placeholder={
                  speciesGeneticsSpec
                    ? `e.g. ${speciesVarietyPresets[0]?.conservativeGenotype || speciesGeneticsSpec.loci.map(() => '__').join(' ')}`
                    : 'Custom species plain-text genotype or DNA notes (stored verbatim)'
                }
                value={genotypeRaw}
                onChange={(e) => setGenotypeRaw(e.target.value)}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
              {speciesGeneticsSpec && (
                <button
                  type="button"
                  onClick={() => setShowLocusBuilder((v) => !v)}
                  aria-expanded={showLocusBuilder}
                  className="min-h-[42px] px-3.5 py-2 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium whitespace-nowrap shrink-0"
                >
                  {showLocusBuilder
                    ? 'Hide Locus Builder'
                    : `Locus Builder (${speciesGeneticsSpec.loci.length} Loci)`}
                </button>
              )}
            </div>

            {speciesGeneticsSpec && showLocusBuilder && (
              <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[var(--barn-ink)]">
                    {speciesProfile.name} Locus Allele Builder
                  </span>
                  {genotypeRaw.trim() && (
                    <button
                      type="button"
                      onClick={() => setGenotypeRaw('')}
                      className="text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline"
                    >
                      Clear all loci
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {speciesGeneticsSpec.loci.map((locusDef) => {
                    const pair = parsedLocusPairsByCode.get(locusDef.locus);
                    const isXLinkedMale =
                      locusDef.inheritanceMode === 'x_linked' && sex === 'Male';
                    const a1 = pair?.allele1 || '_';
                    const a2 = isXLinkedMale ? 'Y' : pair?.allele2 || '_';
                    const modeNote =
                      locusDef.inheritanceMode === 'x_linked'
                        ? 'X-linked'
                        : locusDef.inheritanceMode === 'codominant'
                        ? 'Codominant'
                        : locusDef.inheritanceMode === 'incomplete_dominant'
                        ? 'Incomplete dom.'
                        : '';

                    return (
                      <div
                        key={locusDef.locus}
                        className="p-2.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-semibold text-[var(--barn-ink)] truncate">
                            <span className="font-mono">{locusDef.locus}</span> · {locusDef.name}
                          </span>
                          {modeNote && (
                            <span className="text-[10px] text-[var(--barn-muted)] shrink-0">
                              {modeNote}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <select
                            aria-label={`${locusDef.name} allele 1`}
                            value={a1}
                            onChange={(e) =>
                              setGenotypeRaw((prev) =>
                                setLocusInGenotypeString(
                                  prev,
                                  locusDef.locus,
                                  e.target.value,
                                  a2,
                                  speciesProfile.name,
                                  sex
                                )
                              )
                            }
                            className="flex-1 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                          >
                            <option value="_">_ (Unverified)</option>
                            {locusDef.alleles.map((al) => (
                              <option key={al} value={al}>
                                {al}
                              </option>
                            ))}
                          </select>
                          {isXLinkedMale ? (
                            <span className="min-h-[34px] px-2.5 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono text-[var(--barn-muted)] inline-flex items-center">
                              Y
                            </span>
                          ) : (
                            <select
                              aria-label={`${locusDef.name} allele 2`}
                              value={a2}
                              onChange={(e) =>
                                setGenotypeRaw((prev) =>
                                  setLocusInGenotypeString(
                                    prev,
                                    locusDef.locus,
                                    a1,
                                    e.target.value,
                                    speciesProfile.name,
                                    sex
                                  )
                                )
                              }
                              className="flex-1 min-h-[34px] px-2 py-1 rounded-md bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
                            >
                              <option value="_">_ (Unverified)</option>
                              {locusDef.alleles.map((al) => (
                                <option key={al} value={al}>
                                  {al}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--barn-muted)] leading-snug">
                          {locusDef.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!speciesGeneticsSpec && (
              <p className="text-[11px] text-[var(--barn-muted)]">
                Custom species stores genotypes as plain-text breeder notes without Rabbit locus assumptions.
              </p>
            )}

            {(speciesGeneticsSpec?.supportsRufusIntensity || rufusLevel) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="editor-rufus-select"
                    className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Rufus Intensity (Polygenic Pigment Richness)
                  </label>
                  <select
                    id="editor-rufus-select"
                    value={rufusLevel}
                    onChange={(e) => setRufusLevel(normalizeRufusLevel(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    {RUFUS_LEVEL_OPTIONS.map((opt) => (
                      <option key={opt.value || 'none'} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-[11px] text-[var(--barn-muted)] pb-1">
                    Tracked separately from Mendelian Wide-Band (<code className="font-mono">W / w</code>): rich Reds can have High Rufus without being proven{' '}
                    <code className="font-mono">ww</code>.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-2 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Hidden Genetic Traits, Carrier Disclosures &amp; Branch Clearances
                </span>
                <span className="text-[11px] text-[var(--barn-muted)]">
                  Displayed compactly on this animal&apos;s and descendants&apos; pedigrees
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CarrierTraitCombobox
                  label="Suspected Carrier Of"
                  tone="suspected"
                  selected={suspectedCarrierOf}
                  suggestions={carrierTraitSuggestions}
                  disabledTraits={[
                    ...confirmedCarrierOf,
                    ...clearedCarrierOf.map((c) => c.trait),
                  ]}
                  disabledReason="Confirmed or Cleared"
                  placeholder="Select or type suspected recessive/trait..."
                  helperText="Possible carrier from lineage, phenotype clues, or partial test breedings."
                  onChange={(next) => {
                    const reconciled = reconcileCarrierTraitLists(
                      next,
                      confirmedCarrierOf,
                      clearedCarrierOf
                    );
                    setSuspectedCarrierOf(reconciled.suspectedCarrierOf);
                  }}
                />
                <CarrierTraitCombobox
                  label="Confirmed Carrier Of"
                  tone="confirmed"
                  selected={confirmedCarrierOf}
                  suggestions={carrierTraitSuggestions}
                  placeholder="Select or type confirmed recessive/trait..."
                  helperText="Verified via DNA test, pedigree certainty, or offspring produced."
                  onChange={(next) => {
                    const reconciled = reconcileCarrierTraitLists(
                      suspectedCarrierOf,
                      next,
                      clearedCarrierOf,
                      'confirmed'
                    );
                    setConfirmedCarrierOf(reconciled.confirmedCarrierOf);
                    setSuspectedCarrierOf(reconciled.suspectedCarrierOf);
                    setClearedCarrierOf(reconciled.clearedCarrierOf);
                  }}
                />
              </div>

              <div className="pt-1 space-y-2">
                <CarrierTraitCombobox
                  label="Cleared / Verified Non-Carrier Of (Stops Ancestral Propagation)"
                  tone="cleared"
                  selected={clearedCarrierOf.map((c) => c.trait)}
                  suggestions={carrierTraitSuggestions}
                  placeholder="Select or type trait cleared by test breeding or DNA..."
                  helperText="Marks this animal proven non-carrier on its branch so earlier ancestral suspicions do not pass forward to offspring."
                  onChange={handleClearedTraitsChange}
                />

                {clearedCarrierOf.length > 0 && (
                  <div className="space-y-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] p-3">
                    <div className="text-[11px] font-medium text-[var(--barn-muted)]">
                      Clearance Verification Details
                    </div>
                    {clearedCarrierOf.map((rec) => (
                      <div
                        key={rec.trait}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs py-1 border-b last:border-b-0 border-[var(--barn-border)]/60"
                      >
                        <span className="font-medium text-[var(--barn-ink)]">{rec.trait}</span>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Proof type for ${rec.trait}`}
                            value={rec.proofType}
                            onChange={(e) =>
                              updateClearedProof(rec.trait, {
                                proofType: e.target.value as ClearedCarrierProofType,
                              })
                            }
                            className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                          >
                            {Object.entries(CLEARED_CARRIER_PROOF_LABELS).map(([k, lbl]) => (
                              <option key={k} value={k}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                          {rec.proofType === 'test_bred' && (
                            <label className="inline-flex items-center gap-1 text-[11px] text-[var(--barn-muted)]">
                              <span>Matings:</span>
                              <input
                                type="number"
                                aria-label={`Test breedings count for ${rec.trait}`}
                                min="1"
                                max="99"
                                value={rec.testBreedingCount ?? 2}
                                onChange={(e) =>
                                  updateClearedProof(rec.trait, {
                                    testBreedingCount: Math.max(1, Number(e.target.value) || 1),
                                  })
                                }
                                className="w-14 min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono tabular-nums text-xs"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {liveHomozygousClearances.length > 0 && (
                  <p className="text-[11px] text-[var(--barn-sage)]">
                    Explicit homozygous genotype loci also clear ancestral alerts automatically:{' '}
                    <span className="font-mono">
                      {liveHomozygousClearances.map((g) => `${g.trait} (${g.pair})`).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-[var(--barn-muted)]">
                  Lineage Parents ({speciesProfile.name} Only)
                </span>
                {archivedParentCount > 0 && (
                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--barn-ink)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeArchivedParents}
                      onChange={(e) => setIncludeArchivedParents(e.target.checked)}
                      className="rounded border-[var(--barn-border)] accent-[var(--barn-sage)]"
                    />
                    Include Archived ({archivedParentCount})
                  </label>
                )}
              </div>
              {projectedCoi && (() => {
                const comp = getPedigreeCompletenessSummary(projectedCoi);
                return (
                  <span className="text-xs font-mono tabular-nums text-[var(--barn-sage)]">
                    Projected COI: {projectedCoi.coiPercent.toFixed(2)}% ({projectedCoi.risk.label}) ·{' '}
                    {comp.known3Gen}/{comp.max3Gen} 3-gen
                    {comp.isIncompleteZeroOutcross ? ' (incomplete pedigree)' : ''}
                  </span>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor={`${baseId}-sire`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Sire ({speciesProfile.maleLabel})
                </label>
                {includeArchivedParents ? (
                  <SearchableParentPicker
                    id={`${baseId}-sire`}
                    label={`Sire (${speciesProfile.maleLabel})`}
                    value={sireId}
                    candidates={sireCandidates}
                    unknownLabel={`Unknown / Foundation ${speciesProfile.maleLabel}`}
                    placeholder={`Search ${speciesProfile.maleLabel}s (incl. archived)...`}
                    onChange={(id) => setSireId(id)}
                  />
                ) : (
                  <select
                    id={`${baseId}-sire`}
                    value={sireId}
                    onChange={(e) => setSireId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    <option value="">Unknown / Foundation {speciesProfile.maleLabel}</option>
                    {sireId && !sireCandidates.some((c) => c.id === sireId) && (
                      <option value={sireId}>
                        {currentSireObj
                          ? `[Sex Mismatch: ${currentSireObj.name} (${currentSireObj.sex}) — unlink or change parent sex]`
                          : `[Unlisted / Missing Sire ID: ${sireId.slice(0, 8)} — select Unknown to unlink]`}
                      </option>
                    )}
                    {sireCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.tattoo ? `(${c.tattoo})` : ''}
                        {isAnimalArchived(c) ? ' [Archived]' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {hasMismatchedCurrentSire && currentSireObj && (
                  <p className="text-[11px] text-[var(--barn-terracotta)] font-medium mt-1">
                    Warning: Linked sire &ldquo;{currentSireObj.name}&rdquo; is recorded as{' '}
                    {currentSireObj.sex}. Select a {speciesProfile.maleLabel} or Unknown to resolve.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-dam`}
                  className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
                >
                  Dam ({speciesProfile.femaleLabel})
                </label>
                {includeArchivedParents ? (
                  <SearchableParentPicker
                    id={`${baseId}-dam`}
                    label={`Dam (${speciesProfile.femaleLabel})`}
                    value={damId}
                    candidates={damCandidates}
                    unknownLabel={`Unknown / Foundation ${speciesProfile.femaleLabel}`}
                    placeholder={`Search ${speciesProfile.femaleLabel}s (incl. archived)...`}
                    onChange={(id) => setDamId(id)}
                  />
                ) : (
                  <select
                    id={`${baseId}-dam`}
                    value={damId}
                    onChange={(e) => setDamId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
                  >
                    <option value="">Unknown / Foundation {speciesProfile.femaleLabel}</option>
                    {damId && !damCandidates.some((c) => c.id === damId) && (
                      <option value={damId}>
                        {currentDamObj
                          ? `[Sex Mismatch: ${currentDamObj.name} (${currentDamObj.sex}) — unlink or change parent sex]`
                          : `[Unlisted / Missing Dam ID: ${damId.slice(0, 8)} — select Unknown to unlink]`}
                      </option>
                    )}
                    {damCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.tattoo ? `(${c.tattoo})` : ''}
                        {isAnimalArchived(c) ? ' [Archived]' : ''}
                      </option>
                    ))}
                  </select>
                )}
                {hasMismatchedCurrentDam && currentDamObj && (
                  <p className="text-[11px] text-[var(--barn-terracotta)] font-medium mt-1">
                    Warning: Linked dam &ldquo;{currentDamObj.name}&rdquo; is recorded as{' '}
                    {currentDamObj.sex}. Select a {speciesProfile.femaleLabel} or Unknown to resolve.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-reg`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Registration #
              </label>
              <input
                id={`${baseId}-reg`}
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-gc`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Grand Champion #
              </label>
              <input
                id={`${baseId}-gc`}
                type="text"
                value={grandChampionNumber}
                onChange={(e) => setGrandChampionNumber(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-breeder`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Breeder
              </label>
              <input
                id={`${baseId}-breeder`}
                type="text"
                value={breederName}
                onChange={(e) => setBreederName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-owner`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Owner
              </label>
              <input
                id={`${baseId}-owner`}
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${baseId}-notes`}
              className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
            >
              Barn Notes
            </label>
            <textarea
              id={`${baseId}-notes`}
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

            {photoError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs"
              >
                {photoError}
              </div>
            )}

            {stagedPhotos.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {stagedPhotos.map((p, idx) => (
                  <div
                    key={`${p.originalFileName}-${idx}`}
                    className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--barn-border)] shrink-0"
                  >
                    <img
                      src={p.thumbnailDataUrl}
                      alt={p.originalFileName}
                      className="w-full h-full object-cover"
                    />
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
            )}
          </div>

          {activeWithdrawal?.isActive &&
            !pendingWithdrawalWarning &&
            ((status === 'Sold' && initialAnimal?.status !== 'Sold') ||
              (culled && !initialAnimal?.culled)) && (
              <div
                role="status"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)]/75 border border-[var(--barn-terracotta)]/70 flex items-start gap-2.5 text-xs"
              >
                <ShieldAlert
                  className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-0.5">
                  <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                    Active Medication Withdrawal ({activeWithdrawal.countdownLabel} · clears{' '}
                    {formatReadableDate(activeWithdrawal.clearDateIso)})
                  </div>
                  <p className="text-[var(--barn-muted)]">
                    Medications: <strong className="text-[var(--barn-ink)]">{activeWithdrawal.medicationSummary}</strong>.
                    You will be asked to confirm before saving this change.
                  </p>
                </div>
              </div>
            )}

          {pendingWithdrawalWarning && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-3 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert
                  className="w-5 h-5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {pendingWithdrawalWarning.headline}
                  </div>
                  <p className="text-[var(--barn-ink)] leading-relaxed">
                    {pendingWithdrawalWarning.detail}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => setPendingWithdrawalWarning(null)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => void checkCapacityThenSave()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-xs font-semibold hover:opacity-95 disabled:opacity-55"
                >
                  {submitLock.isSubmitting ? 'Saving...' : 'Confirm Withdrawal Hold & Save'}
                </button>
              </div>
            </div>
          )}

          {pendingCapacityWarning && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] space-y-3 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="w-5 h-5 text-[var(--barn-danger)] mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <div className="font-semibold text-[var(--barn-ink)]">
                    {pendingCapacityWarning.headline}
                  </div>
                  <p className="text-[var(--barn-ink)] leading-relaxed">
                    {pendingCapacityWarning.detail}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => setPendingCapacityWarning(null)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
                >
                  Keep Editing
                </button>
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => void executeSave()}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-xs font-semibold hover:opacity-95 disabled:opacity-55"
                >
                  {submitLock.isSubmitting ? 'Saving...' : 'Confirm Over-Capacity & Save'}
                </button>
              </div>
            </div>
          )}

          {submitGuardError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium text-[var(--barn-ink)]"
            >
              {submitGuardError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[var(--barn-border)]">
            {isEditing && onDelete ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--barn-danger)] font-medium">
                    Confirm delete?
                  </span>
                  <button
                    type="button"
                    disabled={submitLock.isSubmitting}
                    onClick={() => {
                      void submitLock.runLocked(async () => {
                        await onDelete(initialAnimal!);
                        onClose();
                      });
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold disabled:opacity-55"
                  >
                    {submitLock.isSubmitting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    type="button"
                    disabled={submitLock.isSubmitting}
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs disabled:opacity-55"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitLock.isSubmitting}
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-55"
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
                disabled={submitLock.isSubmitting}
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-55"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                aria-busy={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
              >
                {submitLock.isSubmitting && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                )}
                {submitLock.isSubmitting
                  ? `Saving ${speciesProfile.name}...`
                  : `Save ${speciesProfile.name}`}
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
