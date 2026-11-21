/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Custom Livestock & Species Biological Schedule / Master Task List Milestone Editor Modal.
 *
 * Portable UI Note: Maps cleanly to React Native `Modal` + `ScrollView` + `TextInput` + `Pressable`.
 */

import { Download, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import React, { useId, useState } from 'react';
import {
  BreedMilestoneOffsetOverride,
  BreedScheduleOverride,
  generateUuid,
  isSameSpecies,
  MilestoneRelativeTo,
  normalizeBreedScheduleOverrides,
  nowIsoUtc,
  PREDEFINED_SPECIES_PRESETS,
  SpeciesMilestoneTemplate,
  SpeciesProfile,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TaskCategory,
  TaskPriority,
  WEIGHT_UNIT_OPTIONS,
  WeightUnit,
} from '../core/models';
import { describeMilestoneOffset } from '../core/taskMaster';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';

interface SpeciesEditorModalProps {
  initialProfile: SpeciesProfile | null;
  existingNames: string[];
  recordCount?: number;
  onSave: (profile: SpeciesProfile) => Promise<boolean | void> | boolean | void;
  onDelete?: (profile: SpeciesProfile) => void;
  onDownloadTimestampedBackup?: (speciesName: string) => void;
  onClose: () => void;
}

const DEFAULT_CUSTOM_MILESTONES: SpeciesMilestoneTemplate[] = [
  {
    label: 'Confirm Pregnancy / Fertility Check',
    relativeTo: 'AFTER_BRED',
    daysOffset: 21,
    category: 'Palpation',
    priority: 'Normal',
  },
  {
    label: 'Prepare Birthing Pen / Nest Area',
    relativeTo: 'BEFORE_BIRTH',
    daysOffset: 5,
    category: 'Nestbox',
    priority: 'High',
  },
  {
    label: 'Wean & Weigh Offspring',
    relativeTo: 'AFTER_BIRTH',
    daysOffset: 56,
    category: 'Weaning',
    priority: 'High',
  },
];

export function SpeciesEditorModal({
  initialProfile,
  existingNames,
  recordCount = 0,
  onSave,
  onDelete,
  onDownloadTimestampedBackup,
  onClose,
}: SpeciesEditorModalProps) {
  const baseId = useId();
  const submitLock = useAsyncSubmitLock();
  const dialogRef = useAccessibleDialog({
    isOpen: true,
    onClose: () => {
      if (!submitLock.isLockedNow()) onClose();
    },
  });
  const isEditing = Boolean(initialProfile);
  const canDeleteEmptySpecies =
    isEditing && Boolean(onDelete) && recordCount === 0 && existingNames.length > 1;

  const [creationMode, setCreationMode] = useState<'custom' | 'preset'>('custom');

  const [name, setName] = useState(initialProfile?.name || '');
  const [defaultAnimalPrefix, setDefaultAnimalPrefix] = useState(
    initialProfile?.defaultAnimalPrefix || ''
  );
  const [preferredUnit, setPreferredUnit] = useState<WeightUnit | ''>(
    initialProfile?.preferredUnit || ''
  );
  const [confirmRemoveSpecies, setConfirmRemoveSpecies] = useState(false);
  const [gestationDays, setGestationDays] = useState(
    String(initialProfile?.gestationDays ?? 114)
  );
  const [weanDays, setWeanDays] = useState(
    String(initialProfile?.weanDaysAfterBirth ?? 56)
  );
  const [rebreedDays, setRebreedDays] = useState(
    String(initialProfile?.rebreedDaysAfterBirth ?? 45)
  );
  const [maturityDays, setMaturityDays] = useState(
    initialProfile?.maturityDays && initialProfile.maturityDays > 0
      ? String(initialProfile.maturityDays)
      : ''
  );
  const [birthEventLabel, setBirthEventLabel] = useState(
    initialProfile?.birthEventLabel || 'Birth'
  );
  const [maleLabel, setMaleLabel] = useState(initialProfile?.maleLabel || 'Sire');
  const [femaleLabel, setFemaleLabel] = useState(initialProfile?.femaleLabel || 'Dam');
  const [offspringLabel, setOffspringLabel] = useState(
    initialProfile?.offspringLabel || 'Offspring'
  );
  const [breedsCsv, setBreedsCsv] = useState(
    initialProfile?.exampleBreeds?.join(', ') || ''
  );
  const [milestones, setMilestones] = useState<SpeciesMilestoneTemplate[]>(
    initialProfile?.milestones
      ? [...initialProfile.milestones]
      : DEFAULT_CUSTOM_MILESTONES.map((m) => ({ ...m }))
  );
  const [breedOverrides, setBreedOverrides] = useState<BreedScheduleOverride[]>(() =>
    normalizeBreedScheduleOverrides(initialProfile?.breedOverrides)
  );

  // Draft milestone rule inputs
  const [ruleLabel, setRuleLabel] = useState('');
  const [ruleRelativeTo, setRuleRelativeTo] = useState<MilestoneRelativeTo>('BEFORE_BIRTH');
  const [ruleDays, setRuleDays] = useState('3');
  const [ruleCategory, setRuleCategory] = useState<TaskCategory>('Care');
  const [rulePriority, setRulePriority] = useState<TaskPriority>('High');

  // Draft per-breed override inputs
  const [overrideBreed, setOverrideBreed] = useState('');
  const [overrideGestation, setOverrideGestation] = useState('');
  const [overrideWean, setOverrideWean] = useState('');
  const [overrideRebreed, setOverrideRebreed] = useState('');
  const [overrideMaturity, setOverrideMaturity] = useState('');
  const [overrideMilestoneOffsets, setOverrideMilestoneOffsets] = useState<Record<string, string>>(
    {}
  );
  const [overrideError, setOverrideError] = useState('');

  const [errorMsg, setErrorMsg] = useState('');

  const clearBreedOverrideDraft = () => {
    setOverrideBreed('');
    setOverrideGestation('');
    setOverrideWean('');
    setOverrideRebreed('');
    setOverrideMaturity('');
    setOverrideMilestoneOffsets({});
    setOverrideError('');
  };

  const resetToCustomBlank = () => {
    setCreationMode('custom');
    setErrorMsg('');
    setName('');
    setDefaultAnimalPrefix('');
    setPreferredUnit('');
    setGestationDays('114');
    setWeanDays('56');
    setRebreedDays('45');
    setMaturityDays('');
    setBirthEventLabel('Birth');
    setMaleLabel('Sire');
    setFemaleLabel('Dam');
    setOffspringLabel('Offspring');
    setBreedsCsv('');
    setMilestones(DEFAULT_CUSTOM_MILESTONES.map((m) => ({ ...m })));
    setBreedOverrides([]);
    clearBreedOverrideDraft();
  };

  const applyPreset = (presetName: string) => {
    const preset = PREDEFINED_SPECIES_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    setErrorMsg('');
    const alreadyExists = existingNames.some((n) => isSameSpecies(n, preset.name));
    setName(alreadyExists ? `${preset.name} (Custom)` : preset.name);
    setPreferredUnit(preset.preferredUnit || '');
    setGestationDays(String(preset.gestationDays));
    setRebreedDays(String(preset.rebreedDaysAfterBirth));
    setWeanDays(String(preset.weanDaysAfterBirth));
    setMaturityDays(
      preset.maturityDays && preset.maturityDays > 0 ? String(preset.maturityDays) : ''
    );
    setBirthEventLabel(preset.birthEventLabel);
    setMaleLabel(preset.maleLabel);
    setFemaleLabel(preset.femaleLabel);
    setOffspringLabel(preset.offspringLabel);
    setBreedsCsv(preset.exampleBreeds.join(', '));
    setMilestones(preset.milestones.map((m) => ({ ...m })));
    setBreedOverrides(normalizeBreedScheduleOverrides(preset.breedOverrides));
    clearBreedOverrideDraft();
  };

  const handleAddMilestone = () => {
    if (!ruleLabel.trim()) return;
    if (milestones.length >= 15) return;
    setMilestones((prev) => [
      ...prev,
      {
        label: ruleLabel.trim(),
        relativeTo: ruleRelativeTo,
        daysOffset: Math.max(0, Number(ruleDays) || 0),
        category: ruleCategory,
        priority: rulePriority,
      },
    ]);
    setRuleLabel('');
  };

  const loadBreedOverrideIntoDraft = (ov: BreedScheduleOverride) => {
    setOverrideBreed(ov.breed);
    setOverrideGestation(ov.gestationDays ? String(ov.gestationDays) : '');
    setOverrideWean(ov.weanDaysAfterBirth ? String(ov.weanDaysAfterBirth) : '');
    setOverrideRebreed(
      ov.rebreedDaysAfterBirth !== undefined ? String(ov.rebreedDaysAfterBirth) : ''
    );
    setOverrideMaturity(ov.maturityDays ? String(ov.maturityDays) : '');
    const nextOffsets: Record<string, string> = {};
    for (const mo of ov.milestoneOverrides ?? []) {
      const matchingRule = milestones.find(
        (m) => m.label.trim().toLowerCase() === mo.label.trim().toLowerCase()
      );
      nextOffsets[matchingRule ? matchingRule.label : mo.label] = String(mo.daysOffset);
    }
    setOverrideMilestoneOffsets(nextOffsets);
    setOverrideError('');
  };

  const handleSaveBreedOverride = () => {
    const cleanBreed = overrideBreed.trim();
    if (!cleanBreed) {
      setOverrideError('Enter a breed name before saving a breed override.');
      return;
    }

    const milestoneOverrides: BreedMilestoneOffsetOverride[] = [];
    for (const rule of milestones) {
      const rawVal = (overrideMilestoneOffsets[rule.label] ?? '').trim();
      if (!rawVal) continue;
      const parsed = Number(rawVal);
      if (Number.isFinite(parsed) && parsed >= 0) {
        milestoneOverrides.push({
          label: rule.label,
          daysOffset: Math.min(700, Math.round(parsed)),
        });
      }
    }

    const candidate: BreedScheduleOverride = {
      breed: cleanBreed,
      gestationDays: overrideGestation.trim() ? Number(overrideGestation) : undefined,
      weanDaysAfterBirth: overrideWean.trim() ? Number(overrideWean) : undefined,
      rebreedDaysAfterBirth: overrideRebreed.trim() ? Number(overrideRebreed) : undefined,
      maturityDays: overrideMaturity.trim() ? Number(overrideMaturity) : undefined,
      milestoneOverrides: milestoneOverrides.length > 0 ? milestoneOverrides : undefined,
    };

    const validated = normalizeBreedScheduleOverrides([candidate]);
    if (validated.length === 0) {
      setOverrideError(
        'Enter at least one gestation, weaning, rebreed, maturity, or milestone day override.'
      );
      return;
    }

    const savedItem = validated[0];
    setBreedOverrides((prev) => {
      const key = savedItem.breed.toLowerCase();
      const filtered = prev.filter((item) => item.breed.trim().toLowerCase() !== key);
      return normalizeBreedScheduleOverrides([...filtered, savedItem]);
    });
    clearBreedOverrideDraft();
  };

  const breedSuggestions = breedsCsv
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('Please enter a custom livestock name (e.g. Horse, Quail, Mini Donkey).');
      return;
    }
    const duplicate = existingNames.some(
      (existing) =>
        isSameSpecies(existing, cleanName) &&
        (!isEditing || !isSameSpecies(existing, initialProfile?.name))
    );
    if (duplicate) {
      setErrorMsg(`"${cleanName}" is already configured in your barn. Choose a distinct name.`);
      return;
    }

    await submitLock.runLocked(async () => {
      const parsedBreeds = breedsCsv
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);

      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const ts = nowIsoUtc();

      const saved = await onSave({
        id: initialProfile?.id || `species-${slug || generateUuid()}`,
        sortOrder: initialProfile?.sortOrder,
        name: cleanName,
        defaultAnimalPrefix: defaultAnimalPrefix.trim(),
        preferredUnit: preferredUnit || undefined,
        memoText: initialProfile?.memoText ?? '',
        memoUpdatedAt: initialProfile?.memoUpdatedAt ?? '',
        gestationDays: Math.max(1, Number(gestationDays) || 31),
        rebreedDaysAfterBirth: Math.max(0, Number(rebreedDays) || 28),
        weanDaysAfterBirth: Math.max(1, Number(weanDays) || 42),
        maturityDays:
          Number(maturityDays) > 0 ? Math.max(1, Math.round(Number(maturityDays))) : undefined,
        birthEventLabel: birthEventLabel.trim() || 'Birth',
        maleLabel: maleLabel.trim() || 'Male',
        femaleLabel: femaleLabel.trim() || 'Female',
        offspringLabel: offspringLabel.trim() || 'Offspring',
        exampleBreeds: parsedBreeds,
        milestones,
        breedOverrides: normalizeBreedScheduleOverrides(breedOverrides),
        createdAt: initialProfile?.createdAt || ts,
        updatedAt: ts,
      });
      if (saved !== false) {
        onClose();
      }
    });
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? `Configure ${initialProfile?.name}` : 'Add Custom Livestock Species'}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--barn-border)]">
          <div>
            <h2 className="font-display text-lg font-semibold">
              {isEditing
                ? `Edit ${initialProfile?.name} Livestock Schedule`
                : 'Add Custom Livestock Species'}
            </h2>
            <p className="text-xs text-[var(--barn-muted)] mt-0.5">
              Define species name, prefix, gestation/weaning dates, sex terms, breeds, and Master Task List rules
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
          {!isEditing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]">
                <button
                  type="button"
                  aria-pressed={creationMode === 'custom'}
                  onClick={resetToCustomBlank}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                    creationMode === 'custom'
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                  Custom Livestock (Blank)
                </button>
                <button
                  type="button"
                  aria-pressed={creationMode === 'preset'}
                  onClick={() => setCreationMode('preset')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    creationMode === 'preset'
                      ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                      : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  Start From Preset Template
                </button>
              </div>

              {creationMode === 'preset' && (
                <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2">
                  <div className="text-xs text-[var(--barn-muted)]">
                    Tap any preset to pre-fill its gestation dates &amp; chores, then customize the
                    name or dates below:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PREDEFINED_SPECIES_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.name)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          name.toLowerCase().startsWith(preset.name.toLowerCase())
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                            : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                        }`}
                      >
                        {preset.name} ({preset.gestationDays}d)
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium text-[var(--barn-ink)]"
            >
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-name`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Livestock / Species Name *
              </label>
              <input
                id={`${baseId}-name`}
                type="text"
                placeholder="e.g. Horse, Quail, Mini Donkey, Yak, Poultry..."
                value={name}
                disabled={isEditing && isSameSpecies(initialProfile?.name, 'Rabbit')}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm disabled:opacity-60"
                required
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-birth-event`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Birth / Hatch Event Term
              </label>
              <input
                id={`${baseId}-birth-event`}
                type="text"
                placeholder="e.g. Foaling, Hatching, Calving, Kindling"
                value={birthEventLabel}
                onChange={(e) => setBirthEventLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label
                htmlFor={`${baseId}-gestation`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Gestation / Incubation (Days)
              </label>
              <input
                id={`${baseId}-gestation`}
                type="number"
                min={1}
                max={750}
                value={gestationDays}
                onChange={(e) => setGestationDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-wean`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Wean / Separate (+Days)
              </label>
              <input
                id={`${baseId}-wean`}
                type="number"
                min={1}
                max={600}
                value={weanDays}
                onChange={(e) => setWeanDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-rebreed`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Rebreed Check (+Days)
              </label>
              <input
                id={`${baseId}-rebreed`}
                type="number"
                min={0}
                max={600}
                value={rebreedDays}
                onChange={(e) => setRebreedDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-maturity`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Maturity Cutoff (Days, opt.)
              </label>
              <input
                id={`${baseId}-maturity`}
                type="number"
                min={14}
                max={1500}
                placeholder={`Auto (${Math.max(28, (Number(weanDays) || 42) * 2)}d)`}
                value={maturityDays}
                onChange={(e) => setMaturityDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor={`${baseId}-male`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Male Term
              </label>
              <input
                id={`${baseId}-male`}
                type="text"
                placeholder="e.g. Stallion, Cock, Buck, Bull"
                value={maleLabel}
                onChange={(e) => setMaleLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-female`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Female Term
              </label>
              <input
                id={`${baseId}-female`}
                type="text"
                placeholder="e.g. Mare, Hen, Doe, Cow"
                value={femaleLabel}
                onChange={(e) => setFemaleLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-offspring`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Offspring Term
              </label>
              <input
                id={`${baseId}-offspring`}
                type="text"
                placeholder="e.g. Foal, Chick, Kid, Calf"
                value={offspringLabel}
                onChange={(e) => setOffspringLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor={`${baseId}-breeds`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Common Breeds / Varieties (comma-separated, optional)
              </label>
              <input
                id={`${baseId}-breeds`}
                type="text"
                placeholder="e.g. Quarter Horse, Morgan, Arabian"
                value={breedsCsv}
                onChange={(e) => setBreedsCsv(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label
                htmlFor={`${baseId}-prefix`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Optional Default Animal Name Prefix
              </label>
              <input
                id={`${baseId}-prefix`}
                type="text"
                placeholder="e.g. Copper Creek or Farm Prefix (editable per animal)"
                value={defaultAnimalPrefix}
                onChange={(e) => setDefaultAnimalPrefix(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
              <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                Pre-fills new animal names if omitted; breeders can clear or override it anytime.
              </p>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-unit`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Species Weight Unit Override
              </label>
              <select
                id={`${baseId}-unit`}
                value={preferredUnit}
                onChange={(e) => setPreferredUnit(e.target.value as WeightUnit | '')}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              >
                <option value="">Use Barn Default</option>
                {WEIGHT_UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--barn-muted)] mt-1">
                e.g. Decimal lbs or kg for Cattle/Dogs, lbs &amp; oz or grams for Rabbits.
              </p>
            </div>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Custom Master Task List Milestone Dates ({milestones.length})
              </h3>
              <span className="text-xs text-[var(--barn-muted)]">
                Auto-scheduled whenever a breeding is logged
              </span>
            </div>

            {milestones.length > 0 && (
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {milestones.map((m, idx) => (
                  <div
                    key={`${m.label}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                  >
                    <div>
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs text-[var(--barn-muted)]">
                        {describeMilestoneOffset(
                          m.relativeTo,
                          m.daysOffset,
                          birthEventLabel || 'Birth'
                        )}{' '}
                        · {m.category} · {m.priority} priority
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setMilestones((prev) => prev.filter((_, itemIdx) => itemIdx !== idx))
                      }
                      aria-label={`Remove ${m.label}`}
                      className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
              <input
                type="text"
                aria-label="New milestone label"
                placeholder="New milestone (e.g. Candling Eggs / Ultrasound)"
                value={ruleLabel}
                onChange={(e) => setRuleLabel(e.target.value)}
                className="sm:col-span-4 min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
              <input
                type="number"
                aria-label="Days offset"
                min={0}
                max={700}
                value={ruleDays}
                onChange={(e) => setRuleDays(e.target.value)}
                className="sm:col-span-2 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
              />
              <select
                aria-label="Milestone timing relative to event"
                value={ruleRelativeTo}
                onChange={(e) => setRuleRelativeTo(e.target.value as MilestoneRelativeTo)}
                className="sm:col-span-3 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="AFTER_BRED">Days After Bred</option>
                <option value="BEFORE_BIRTH">Days Before {birthEventLabel || 'Birth'}</option>
                <option value="AFTER_BIRTH">Days After {birthEventLabel || 'Birth'}</option>
              </select>
              <select
                aria-label="Rule category"
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value as TaskCategory)}
                className="sm:col-span-2 min-h-[40px] px-2 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={rulePriority}
                onChange={(e) => setRulePriority(e.target.value as TaskPriority)}
                aria-label="Rule priority"
                className="sm:col-span-1 min-h-[40px] px-1.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAddMilestone}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Date Rule
            </button>
          </div>

          <div className="border-t border-[var(--barn-border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                Per-Breed Schedule Overrides ({breedOverrides.length})
              </h3>
              <span className="text-xs text-[var(--barn-muted)]">
                Optional day offsets by breed (e.g. dwarf vs. giant lines) — blank inherits species default
              </span>
            </div>

            {breedOverrides.length > 0 && (
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl">
                {breedOverrides.map((ov) => {
                  const summaryParts: string[] = [];
                  if (ov.gestationDays !== undefined) summaryParts.push(`Gestation ${ov.gestationDays}d`);
                  if (ov.weanDaysAfterBirth !== undefined) summaryParts.push(`Wean +${ov.weanDaysAfterBirth}d`);
                  if (ov.rebreedDaysAfterBirth !== undefined) summaryParts.push(`Rebreed +${ov.rebreedDaysAfterBirth}d`);
                  if (ov.maturityDays !== undefined) summaryParts.push(`Maturity ${ov.maturityDays}d`);
                  for (const mo of ov.milestoneOverrides ?? []) {
                    summaryParts.push(`${mo.label}: ${mo.daysOffset}d`);
                  }
                  return (
                    <div
                      key={ov.breed}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{ov.breed}</div>
                        <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums">
                          {summaryParts.join(' · ')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadBreedOverrideIntoDraft(ov)}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setBreedOverrides((prev) =>
                              prev.filter(
                                (item) =>
                                  item.breed.trim().toLowerCase() !== ov.breed.trim().toLowerCase()
                              )
                            )
                          }
                          aria-label={`Remove ${ov.breed} override`}
                          className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-3">
              {overrideError && (
                <div
                  role="alert"
                  className="text-xs font-medium text-[var(--barn-danger)]"
                >
                  {overrideError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                <div className="sm:col-span-2">
                  <label
                    htmlFor={`${baseId}-override-breed`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Breed / Variety Name
                  </label>
                  <input
                    id={`${baseId}-override-breed`}
                    type="text"
                    list={`${baseId}-breed-suggestions`}
                    placeholder="e.g. Netherland Dwarf, Flemish Giant"
                    value={overrideBreed}
                    onChange={(e) => {
                      setOverrideBreed(e.target.value);
                      if (overrideError) setOverrideError('');
                    }}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs"
                  />
                  {breedSuggestions.length > 0 && (
                    <datalist id={`${baseId}-breed-suggestions`}>
                      {breedSuggestions.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-override-gestation`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Gestation (d)
                  </label>
                  <input
                    id={`${baseId}-override-gestation`}
                    type="number"
                    min={1}
                    max={750}
                    placeholder={`${gestationDays || 31}d`}
                    value={overrideGestation}
                    onChange={(e) => setOverrideGestation(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-override-wean`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Wean (+d)
                  </label>
                  <input
                    id={`${baseId}-override-wean`}
                    type="number"
                    min={1}
                    max={600}
                    placeholder={`${weanDays || 42}d`}
                    value={overrideWean}
                    onChange={(e) => setOverrideWean(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor={`${baseId}-override-rebreed`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Rebreed (+d)
                  </label>
                  <input
                    id={`${baseId}-override-rebreed`}
                    type="number"
                    min={0}
                    max={600}
                    placeholder={`${rebreedDays || 28}d`}
                    value={overrideRebreed}
                    onChange={(e) => setOverrideRebreed(e.target.value)}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label
                    htmlFor={`${baseId}-override-maturity`}
                    className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Maturity Cutoff (d, opt.)
                  </label>
                  <input
                    id={`${baseId}-override-maturity`}
                    type="number"
                    min={14}
                    max={1500}
                    placeholder={maturityDays ? `${maturityDays}d` : 'Inherit'}
                    value={overrideMaturity}
                    onChange={(e) => setOverrideMaturity(e.target.value)}
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              {milestones.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-[var(--barn-border)]/70">
                  <div className="text-[11px] font-medium text-[var(--barn-muted)]">
                    Milestone Day Offsets (leave blank to inherit species default)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {milestones.map((rule, mIdx) => (
                      <div key={`${rule.label}-${mIdx}`} className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`${baseId}-override-ms-${mIdx}`}
                          className="text-xs text-[var(--barn-ink)] truncate"
                          title={`${rule.label} (${describeMilestoneOffset(rule.relativeTo, rule.daysOffset, birthEventLabel || 'Birth')})`}
                        >
                          {rule.label}
                        </label>
                        <input
                          id={`${baseId}-override-ms-${mIdx}`}
                          type="number"
                          min={0}
                          max={700}
                          placeholder={`${rule.daysOffset}d`}
                          value={overrideMilestoneOffsets[rule.label] ?? ''}
                          onChange={(e) =>
                            setOverrideMilestoneOffsets((prev) => ({
                              ...prev,
                              [rule.label]: e.target.value,
                            }))
                          }
                          className="w-20 shrink-0 min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs font-mono tabular-nums text-right"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveBreedOverride}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Save Breed Override
                </button>
                {(overrideBreed ||
                  overrideGestation ||
                  overrideWean ||
                  overrideRebreed ||
                  overrideMaturity ||
                  Object.values(overrideMilestoneOffsets).some(Boolean)) && (
                  <button
                    type="button"
                    onClick={clearBreedOverrideDraft}
                    className="min-h-[36px] px-2.5 py-1 text-xs text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                  >
                    Clear Draft
                  </button>
                )}
              </div>
            </div>
          </div>

          {confirmRemoveSpecies && initialProfile && onDelete && (
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-danger)]/60 space-y-2.5 text-xs">
              <div className="font-semibold text-[var(--barn-ink)]">
                Recommend Backing Up Before Removing {initialProfile.name}
              </div>
              <p className="text-[var(--barn-muted)]">
                Save a timestamped backup first so prior snapshots are never overwritten if you ever
                want {initialProfile.name} records or settings back.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {onDownloadTimestampedBackup && (
                  <button
                    type="button"
                    onClick={() => onDownloadTimestampedBackup(initialProfile.name)}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    Download Timestamped {initialProfile.name} Backup
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onDelete(initialProfile);
                    onClose();
                  }}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[var(--barn-danger)] text-[var(--barn-on-danger)] text-xs font-semibold"
                >
                  Confirm Remove {initialProfile.name}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemoveSpecies(false)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-[var(--barn-border)]">
            {isEditing && onDelete ? (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={!canDeleteEmptySpecies}
                  onClick={() => setConfirmRemoveSpecies(true)}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] disabled:opacity-45 disabled:pointer-events-none self-start"
                >
                  Remove Empty Species
                </button>
                {!canDeleteEmptySpecies && (
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    {recordCount > 0
                      ? `Only empty species can be fully removed (${recordCount} record${recordCount === 1 ? '' : 's'} left).`
                      : 'At least one species must remain in your barn.'}
                  </span>
                )}
              </div>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitLock.isSubmitting}
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                aria-busy={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5 disabled:opacity-65"
              >
                {submitLock.isSubmitting && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                )}
                {submitLock.isSubmitting
                  ? 'Saving...'
                  : isEditing
                  ? 'Save Livestock Schedule'
                  : 'Create Custom Livestock'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
