/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Custom Livestock & Species Biological Schedule / Master Task List Milestone Editor Modal.
 *
 * Portable UI Note: Maps cleanly to React Native `Modal` + `ScrollView` + `TextInput` + `Pressable`.
 */

import { Download, Plus, Sparkles, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import {
  generateUuid,
  isSameSpecies,
  MilestoneRelativeTo,
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

interface SpeciesEditorModalProps {
  initialProfile: SpeciesProfile | null;
  existingNames: string[];
  recordCount?: number;
  onSave: (profile: SpeciesProfile) => void;
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

  // Draft milestone rule inputs
  const [ruleLabel, setRuleLabel] = useState('');
  const [ruleRelativeTo, setRuleRelativeTo] = useState<MilestoneRelativeTo>('BEFORE_BIRTH');
  const [ruleDays, setRuleDays] = useState('3');
  const [ruleCategory, setRuleCategory] = useState<TaskCategory>('Care');
  const [rulePriority, setRulePriority] = useState<TaskPriority>('High');
  const [errorMsg, setErrorMsg] = useState('');

  const resetToCustomBlank = () => {
    setCreationMode('custom');
    setErrorMsg('');
    setName('');
    setDefaultAnimalPrefix('');
    setPreferredUnit('');
    setGestationDays('114');
    setWeanDays('56');
    setRebreedDays('45');
    setBirthEventLabel('Birth');
    setMaleLabel('Sire');
    setFemaleLabel('Dam');
    setOffspringLabel('Offspring');
    setBreedsCsv('');
    setMilestones(DEFAULT_CUSTOM_MILESTONES.map((m) => ({ ...m })));
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
    setBirthEventLabel(preset.birthEventLabel);
    setMaleLabel(preset.maleLabel);
    setFemaleLabel(preset.femaleLabel);
    setOffspringLabel(preset.offspringLabel);
    setBreedsCsv(preset.exampleBreeds.join(', '));
    setMilestones(preset.milestones.map((m) => ({ ...m })));
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

  const handleSubmit = (e: React.FormEvent) => {
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

    const parsedBreeds = breedsCsv
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean);

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const ts = nowIsoUtc();

    onSave({
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
      birthEventLabel: birthEventLabel.trim() || 'Birth',
      maleLabel: maleLabel.trim() || 'Male',
      femaleLabel: femaleLabel.trim() || 'Female',
      offspringLabel: offspringLabel.trim() || 'Offspring',
      exampleBreeds: parsedBreeds,
      milestones,
      createdAt: initialProfile?.createdAt || ts,
      updatedAt: ts,
    });
    onClose();
  };

  return (
    <div
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
            <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium text-[var(--barn-ink)]">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Livestock / Species Name *
              </label>
              <input
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
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Birth / Hatch Event Term
              </label>
              <input
                type="text"
                placeholder="e.g. Foaling, Hatching, Calving, Kindling"
                value={birthEventLabel}
                onChange={(e) => setBirthEventLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Gestation / Incubation (Days)
              </label>
              <input
                type="number"
                min={1}
                max={750}
                value={gestationDays}
                onChange={(e) => setGestationDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Wean / Separate (+Days)
              </label>
              <input
                type="number"
                min={1}
                max={600}
                value={weanDays}
                onChange={(e) => setWeanDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Rebreed Check (+Days)
              </label>
              <input
                type="number"
                min={0}
                max={600}
                value={rebreedDays}
                onChange={(e) => setRebreedDays(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Male Term
              </label>
              <input
                type="text"
                placeholder="e.g. Stallion, Cock, Buck, Bull"
                value={maleLabel}
                onChange={(e) => setMaleLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Female Term
              </label>
              <input
                type="text"
                placeholder="e.g. Mare, Hen, Doe, Cow"
                value={femaleLabel}
                onChange={(e) => setFemaleLabel(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Offspring Term
              </label>
              <input
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
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Common Breeds / Varieties (comma-separated, optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Quarter Horse, Morgan, Arabian"
                value={breedsCsv}
                onChange={(e) => setBreedsCsv(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Optional Default Animal Name Prefix
              </label>
              <input
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
              <label className="block text-xs font-medium text-[var(--barn-muted)] mb-1">
                Species Weight Unit Override
              </label>
              <select
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
                placeholder="New milestone (e.g. Candling Eggs / Ultrasound)"
                value={ruleLabel}
                onChange={(e) => setRuleLabel(e.target.value)}
                className="sm:col-span-4 min-h-[40px] px-3 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
              <input
                type="number"
                min={0}
                max={700}
                value={ruleDays}
                onChange={(e) => setRuleDays(e.target.value)}
                className="sm:col-span-2 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono tabular-nums"
              />
              <select
                value={ruleRelativeTo}
                onChange={(e) => setRuleRelativeTo(e.target.value as MilestoneRelativeTo)}
                className="sm:col-span-3 min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="AFTER_BRED">Days After Bred</option>
                <option value="BEFORE_BIRTH">Days Before {birthEventLabel || 'Birth'}</option>
                <option value="AFTER_BIRTH">Days After {birthEventLabel || 'Birth'}</option>
              </select>
              <select
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
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95"
              >
                {isEditing ? 'Save Livestock Schedule' : 'Create Custom Livestock'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
