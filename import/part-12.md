# Codebase Export: AskKim/Pedigree (Part 12 of 16)

- **Branch:** `main`
- **Commit:** `847f8ec8a2fc88e92ecb94065d96cf1277189c07`
- **Generated (UTC):** 2026-11-21 17:00:43 UTC
- **Files in this part:** 42 (`src/core/taskMaster.ts` -> `src/core/__tests__/sampleData.test.ts`)
- **Index:** [index.md](./index.md)

---
## `src/core/taskMaster.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Automated Chore Cascading Engine (Master Task List).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM dependencies.
 *
 * Logging a single breeding event automatically calculates and generates downstream
 * barn chores (e.g., Day 14 Palpation, Day 28 Nestbox placement, Day 31 Kindling window,
 * Day 42 Weaning, and Rebreed readiness) using the user-configurable offsets on `SpeciesProfile`.
 */

import {
  addDaysIso,
  Animal,
  BarnTask,
  BreedScheduleOverride,
  BreedingRecord,
  generateUuid,
  MilestoneRelativeTo,
  normalizeBreedScheduleOverrides,
  nowIsoUtc,
  SpeciesMilestoneTemplate,
  SpeciesProfile,
} from './models';

export interface ResolvedBreedSchedule {
  profile: SpeciesProfile;
  matchedBreed?: string;
  matchedOverride?: BreedScheduleOverride;
}

/**
 * Overlays optional per-breed biological & milestone offset overrides onto a `SpeciesProfile`
 * without mutating the source species configuration. Matches breed names case-insensitively.
 */
export function resolveEffectiveSpeciesProfileForBreed(
  speciesProfile: SpeciesProfile,
  breedName?: string
): ResolvedBreedSchedule {
  const cleanBreed = (breedName || '').trim();
  const overrides = normalizeBreedScheduleOverrides(speciesProfile.breedOverrides);
  if (!cleanBreed || overrides.length === 0) {
    return { profile: speciesProfile };
  }

  const targetKey = cleanBreed.toLowerCase();
  const matched = overrides.find((ov) => ov.breed.trim().toLowerCase() === targetKey);
  if (!matched) {
    return { profile: speciesProfile };
  }

  const milestoneOffsetMap = new Map<string, number>();
  for (const mo of matched.milestoneOverrides ?? []) {
    const labelKey = mo.label.trim().toLowerCase();
    if (labelKey) {
      milestoneOffsetMap.set(labelKey, mo.daysOffset);
    }
  }

  const nextMilestones = speciesProfile.milestones.map((rule) => {
    const overrideOffset = milestoneOffsetMap.get(rule.label.trim().toLowerCase());
    if (overrideOffset === undefined) return rule;
    return {
      ...rule,
      daysOffset: overrideOffset,
    };
  });

  const effectiveProfile: SpeciesProfile = {
    ...speciesProfile,
    gestationDays:
      matched.gestationDays && matched.gestationDays > 0
        ? matched.gestationDays
        : speciesProfile.gestationDays,
    weanDaysAfterBirth:
      matched.weanDaysAfterBirth && matched.weanDaysAfterBirth > 0
        ? matched.weanDaysAfterBirth
        : speciesProfile.weanDaysAfterBirth,
    rebreedDaysAfterBirth:
      matched.rebreedDaysAfterBirth !== undefined && matched.rebreedDaysAfterBirth >= 0
        ? matched.rebreedDaysAfterBirth
        : speciesProfile.rebreedDaysAfterBirth,
    maturityDays:
      matched.maturityDays && matched.maturityDays > 0
        ? matched.maturityDays
        : speciesProfile.maturityDays,
    milestones: nextMilestones,
  };

  return {
    profile: effectiveProfile,
    matchedBreed: matched.breed,
    matchedOverride: matched,
  };
}

/**
 * Resolves the effective schedule for a breeding pairing, checking the Dam's breed first
 * (since gestation, birth prep, and weaning center on the dam), then falling back to Sire's breed.
 */
export function resolveEffectiveSpeciesProfileForBreeding(
  speciesProfile: SpeciesProfile,
  dam?: Pick<Animal, 'breed'> | null,
  sire?: Pick<Animal, 'breed'> | null
): ResolvedBreedSchedule {
  if (dam?.breed) {
    const damResolved = resolveEffectiveSpeciesProfileForBreed(speciesProfile, dam.breed);
    if (damResolved.matchedOverride) return damResolved;
  }
  if (sire?.breed) {
    const sireResolved = resolveEffectiveSpeciesProfileForBreed(speciesProfile, sire.breed);
    if (sireResolved.matchedOverride) return sireResolved;
  }
  return { profile: speciesProfile };
}

/**
 * Computes the ISO `YYYY-MM-DD` due date for a single `SpeciesMilestoneTemplate`
 * given a breeding record's bred, expected due, and actual birth dates.
 */
export function computeMilestoneDueDateIso(
  milestone: SpeciesMilestoneTemplate,
  bredDateIso: string,
  expectedDueDateIso: string,
  actualBirthDateIso: string = ''
): string {
  const effectiveBirthIso = actualBirthDateIso || expectedDueDateIso;
  switch (milestone.relativeTo) {
    case 'AFTER_BRED':
      return bredDateIso ? addDaysIso(bredDateIso, milestone.daysOffset) : '';
    case 'BEFORE_BIRTH':
      return expectedDueDateIso ? addDaysIso(expectedDueDateIso, -milestone.daysOffset) : '';
    case 'AFTER_BIRTH':
      return effectiveBirthIso ? addDaysIso(effectiveBirthIso, milestone.daysOffset) : '';
    default:
      return '';
  }
}

/**
 * Formats a human-readable rule description (e.g. `"3 days before Kindling"` or `"14 days after breeding"`).
 */
export function describeMilestoneOffset(
  relativeTo: MilestoneRelativeTo,
  daysOffset: number,
  birthEventLabel: string
): string {
  if (relativeTo === 'AFTER_BRED') {
    return `Day ${daysOffset} after breeding`;
  }
  if (relativeTo === 'BEFORE_BIRTH') {
    if (daysOffset === 0) return `On expected ${birthEventLabel} date`;
    return `${daysOffset} day${daysOffset === 1 ? '' : 's'} before ${birthEventLabel}`;
  }
  return `${daysOffset} day${daysOffset === 1 ? '' : 's'} after ${birthEventLabel}`;
}

/**
 * Generates the complete set of cascaded `BarnTask` items for a newly logged or updated `BreedingRecord`.
 * Strictly tags every generated task with `breeding.species` so chores never leak across species.
 */
export function generateCascadedTasksForBreeding(
  breeding: BreedingRecord,
  speciesProfile: SpeciesProfile
): BarnTask[] {
  if (!breeding.bredDateIso || breeding.status === 'Missed') {
    return [];
  }

  const ts = nowIsoUtc();
  const tasks: BarnTask[] = [];
  const pairingTitle = `${breeding.damName} (× ${breeding.sireName})`;

  // 1. Species-specific configured milestones (Palpation, Nestbox/Prep, Birth Check, etc.)
  for (const rule of speciesProfile.milestones) {
    const dueIso = computeMilestoneDueDateIso(
      rule,
      breeding.bredDateIso,
      breeding.expectedDueDateIso,
      breeding.actualBirthDateIso
    );
    if (!dueIso) continue;

    tasks.push({
      id: generateUuid(),
      species: breeding.species,
      title: `${rule.label}: ${pairingTitle}`,
      category: rule.category,
      priority: rule.priority,
      dueDateIso: dueIso,
      linkedAnimalId: breeding.damId,
      linkedAnimalName: breeding.damName,
      linkedBreedingId: breeding.id,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  const birthAnchor = breeding.actualBirthDateIso || breeding.expectedDueDateIso;

  // 2. Target Weaning Chore
  if (birthAnchor && speciesProfile.weanDaysAfterBirth > 0) {
    tasks.push({
      id: generateUuid(),
      species: breeding.species,
      title: `Wean ${speciesProfile.offspringLabel}s: ${pairingTitle}`,
      category: 'Weaning',
      priority: 'Normal',
      dueDateIso: addDaysIso(birthAnchor, speciesProfile.weanDaysAfterBirth),
      linkedAnimalId: breeding.damId,
      linkedAnimalName: breeding.damName,
      linkedBreedingId: breeding.id,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // 3. Rebreeding Readiness Evaluation
  if (birthAnchor && speciesProfile.rebreedDaysAfterBirth > 0) {
    tasks.push({
      id: generateUuid(),
      species: breeding.species,
      title: `Rebreed Readiness Check: ${breeding.damName}`,
      category: 'Rebreed',
      priority: 'Low',
      dueDateIso: addDaysIso(birthAnchor, speciesProfile.rebreedDaysAfterBirth),
      linkedAnimalId: breeding.damId,
      linkedAnimalName: breeding.damName,
      linkedBreedingId: breeding.id,
      completed: false,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  return tasks.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
}

/**
 * Returns the `AFTER_BIRTH` days offset if `task` corresponds to an `AFTER_BIRTH` milestone
 * rule, Weaning chore, or Rebreed readiness check on `effectiveProfile`, otherwise `null`.
 */
export function identifyPostBirthTaskOffset(
  task: Pick<BarnTask, 'title' | 'category'>,
  effectiveProfile: SpeciesProfile
): number | null {
  const cleanTitle = (task.title || '').trim();
  const titleLower = cleanTitle.toLowerCase();

  if (
    task.category === 'Weaning' &&
    effectiveProfile.weanDaysAfterBirth > 0 &&
    (titleLower.startsWith(`wean ${effectiveProfile.offspringLabel.toLowerCase()}s:`) ||
      titleLower.startsWith('wean '))
  ) {
    return effectiveProfile.weanDaysAfterBirth;
  }

  if (
    task.category === 'Rebreed' &&
    effectiveProfile.rebreedDaysAfterBirth > 0 &&
    titleLower.startsWith('rebreed readiness check:')
  ) {
    return effectiveProfile.rebreedDaysAfterBirth;
  }

  for (const rule of effectiveProfile.milestones) {
    if (rule.relativeTo !== 'AFTER_BIRTH') continue;
    const rulePrefix = `${rule.label.trim().toLowerCase()}:`;
    if (task.category === rule.category && titleLower.startsWith(rulePrefix)) {
      return rule.daysOffset;
    }
  }

  return null;
}

export interface StalePostBirthTaskEntry {
  task: BarnTask;
  offsetDays: number;
  expectedDueDateIso: string;
}

/**
 * Identifies uncompleted `AFTER_BIRTH` tasks linked to `breeding.id` whose due dates do not
 * match `actualBirthDateIso + offsetDays`.
 */
export function evaluateStalePostBirthTasksForBreeding(
  tasks: BarnTask[],
  breeding: Pick<BreedingRecord, 'id' | 'actualBirthDateIso' | 'status'>,
  effectiveProfile: SpeciesProfile,
  candidateBirthDateIso?: string
): {
  anchorDateIso: string;
  staleEntries: StalePostBirthTaskEntry[];
} {
  const anchorDateIso = (candidateBirthDateIso ?? breeding.actualBirthDateIso ?? '').trim();
  if (!anchorDateIso || breeding.status === 'Missed') {
    return { anchorDateIso: '', staleEntries: [] };
  }

  const staleEntries: StalePostBirthTaskEntry[] = [];
  for (const task of tasks) {
    if (task.completed || task.linkedBreedingId !== breeding.id) continue;
    const offsetDays = identifyPostBirthTaskOffset(task, effectiveProfile);
    if (offsetDays === null) continue;
    const targetDueDateIso = addDaysIso(anchorDateIso, offsetDays);
    if (!targetDueDateIso) continue;
    if (task.dueDateIso !== targetDueDateIso) {
      staleEntries.push({
        task,
        offsetDays,
        expectedDueDateIso: targetDueDateIso,
      });
    }
  }
  return { anchorDateIso, staleEntries };
}

/**
 * Recalculates due dates for uncompleted `AFTER_BIRTH` tasks linked to `breeding.id`
 * anchored to `breeding.actualBirthDateIso` (or optional override birth date).
 * Leaves completed tasks, `AFTER_BRED`, `BEFORE_BIRTH`, and unrelated chores untouched.
 */
export function recalculatePostBirthTasksForBreeding(
  tasks: BarnTask[],
  breeding: BreedingRecord,
  effectiveProfile: SpeciesProfile,
  timestampIso: string = nowIsoUtc(),
  overrideActualBirthDateIso?: string
): {
  updatedTasks: BarnTask[];
  shiftedCount: number;
} {
  const { staleEntries } = evaluateStalePostBirthTasksForBreeding(
    tasks,
    breeding,
    effectiveProfile,
    overrideActualBirthDateIso
  );
  if (staleEntries.length === 0) {
    return { updatedTasks: [], shiftedCount: 0 };
  }

  const updatedTasks: BarnTask[] = staleEntries.map(({ task, expectedDueDateIso }) => {
    const prevRev =
      typeof task._rev === 'number' && Number.isFinite(task._rev) && task._rev >= 0
        ? Math.floor(task._rev)
        : 0;
    return {
      ...task,
      dueDateIso: expectedDueDateIso,
      _rev: prevRev + 1,
      updatedAt: timestampIso,
    };
  });

  return {
    updatedTasks,
    shiftedCount: updatedTasks.length,
  };
}

/** Returns true when a task is a breeding-linked Palpation checkoff task. */
export function isPalpationTask(task: Pick<BarnTask, 'category' | 'linkedBreedingId'>): boolean {
  return Boolean(task.linkedBreedingId) && task.category === 'Palpation';
}

/** Returns true when a task is a breeding-linked Birth Check checkoff task. */
export function isBirthCheckTask(task: Pick<BarnTask, 'category' | 'linkedBreedingId'>): boolean {
  return Boolean(task.linkedBreedingId) && task.category === 'Birth Check';
}

/**
 * Returns uncompleted downstream nestbox, birth-check, weaning, rebreed, and before/after-birth
 * milestone tasks linked to `breedingId` that should be cleared when a breeding is marked `Missed`/Open.
 * Preserves already completed tasks and any excluded task IDs.
 */
export function getPendingBreedingCleanupTasks(
  tasks: BarnTask[],
  breedingId: string,
  effectiveProfile: SpeciesProfile,
  excludeTaskIds: string[] = []
): BarnTask[] {
  if (!breedingId) return [];
  const excluded = new Set(excludeTaskIds);
  const cleanupMilestonePrefixes = new Set(
    effectiveProfile.milestones
      .filter((m) => m.relativeTo === 'BEFORE_BIRTH' || m.relativeTo === 'AFTER_BIRTH')
      .map((m) => `${m.label.trim().toLowerCase()}:`)
  );

  return tasks.filter((t) => {
    if (t.completed || t.linkedBreedingId !== breedingId || excluded.has(t.id)) {
      return false;
    }
    if (
      t.category === 'Nestbox' ||
      t.category === 'Birth Check' ||
      t.category === 'Weaning' ||
      t.category === 'Rebreed'
    ) {
      return true;
    }
    const lowerTitle = (t.title || '').trim().toLowerCase();
    for (const prefix of cleanupMilestonePrefixes) {
      if (lowerTitle.startsWith(prefix)) return true;
    }
    return false;
  });
}
```

## `src/core/techyStuffGuardrails.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Guardrails for "The Techy Stuff" Developer & Troubleshooting View.
 *
 * Implements:
 * - Strict TypeScript runtime validation & input sanitization for diagnostic triggers,
 *   recipient email fields, retention windows, and PWA update policy overrides
 * - Explicit OPFS & IndexedDB storage quota headroom evaluation before heavy dumps/purges
 * - Multi-step confirmation phrase verification for destructive developer actions
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) or Node imports.
 */

import { formatByteSizePure } from './imageOptimizationSpec';
import { sanitizePlainText, sanitizeSingleLineText } from './inputSanitization';

export type DiagnosticQuotaOperationKind =
  | 'support_bundle_zip'
  | 'photo_reoptimize'
  | 'cache_purge_rebuild'
  | 'opfs_tmp_purge'
  | 'pre_upgrade_backup';

export type StorageQuotaStatusSnapshot = {
  supported: boolean;
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
};

export interface StorageQuotaEvaluationInput {
  operation: DiagnosticQuotaOperationKind;
  operationLabel: string;
  estimatedRequiredBytes: number;
  storageStatus: StorageQuotaStatusSnapshot | null;
  opfsSupported: boolean;
  requiresOpfsPreferred?: boolean;
}

export interface StorageQuotaEvaluationResult {
  level: 'ok' | 'warn' | 'blocked';
  allowed: boolean;
  requiresConfirmation: boolean;
  opfsSupported: boolean;
  storageApiSupported: boolean;
  persisted: boolean;
  percentUsed: number;
  usageBytes: number;
  quotaBytes: number;
  remainingBytes: number | null;
  estimatedRequiredBytes: number;
  headline: string;
  detail: string;
}

const MIN_SAFETY_RESERVE_BYTES = 2 * 1024 * 1024; // Keep at least 2 MB reserve free for SQLite WAL / writes
const QUOTA_WARN_PERCENT = 80;
const QUOTA_BLOCK_PERCENT = 96;

/**
 * Evaluates whether current browser StorageManager / IndexedDB & OPFS headroom can safely
 * tolerate a heavy diagnostic archive build, cache rebuild, or bulk photo transformation.
 */
export function evaluateStorageQuotaForOperation(
  input: StorageQuotaEvaluationInput
): StorageQuotaEvaluationResult {
  const safeRequired =
    Number.isFinite(input.estimatedRequiredBytes) && input.estimatedRequiredBytes > 0
      ? Math.round(input.estimatedRequiredBytes)
      : 0;
  const label = sanitizeSingleLineText(input.operationLabel || 'Diagnostic action', 80);
  const st = input.storageStatus;
  const storageApiSupported = Boolean(st?.supported);
  const persisted = Boolean(st?.persisted);
  const usageBytes =
    st && Number.isFinite(st.usageBytes) && st.usageBytes >= 0 ? Math.round(st.usageBytes) : 0;
  const quotaBytes =
    st && Number.isFinite(st.quotaBytes) && st.quotaBytes > 0 ? Math.round(st.quotaBytes) : 0;
  const percentUsed =
    st && Number.isFinite(st.percentUsed) && st.percentUsed >= 0
      ? Math.min(100, Math.round(st.percentUsed * 10) / 10)
      : quotaBytes > 0
        ? Math.min(100, Math.round((usageBytes / quotaBytes) * 1000) / 10)
        : 0;

  const remainingBytes = quotaBytes > 0 ? Math.max(0, quotaBytes - usageBytes) : null;

  // Destructive/freeing purges should never be blocked by high quota usage — they free space!
  const isSpaceFreeingOp =
    input.operation === 'opfs_tmp_purge' || input.operation === 'cache_purge_rebuild';

  if (!storageApiSupported || quotaBytes <= 0 || remainingBytes === null) {
    return {
      level: input.requiresOpfsPreferred && !input.opfsSupported ? 'warn' : 'ok',
      allowed: true,
      requiresConfirmation: false,
      opfsSupported: input.opfsSupported,
      storageApiSupported,
      persisted,
      percentUsed,
      usageBytes,
      quotaBytes,
      remainingBytes,
      estimatedRequiredBytes: safeRequired,
      headline: input.opfsSupported
        ? `OPFS active · Browser quota telemetry unavailable`
        : `Standard IndexedDB mode · Browser quota telemetry unavailable`,
      detail: input.opfsSupported
        ? `${label} can stream through OPFS /tmp. Exact free bytes are not exposed by this browser.`
        : `${label} will run in memory/IndexedDB fallback because OPFS is unavailable in this browser.`,
    };
  }

  const neededWithReserve = safeRequired + (isSpaceFreeingOp ? 0 : MIN_SAFETY_RESERVE_BYTES);

  if (!isSpaceFreeingOp && (percentUsed >= QUOTA_BLOCK_PERCENT || remainingBytes < neededWithReserve)) {
    return {
      level: 'blocked',
      allowed: false,
      requiresConfirmation: false,
      opfsSupported: input.opfsSupported,
      storageApiSupported,
      persisted,
      percentUsed,
      usageBytes,
      quotaBytes,
      remainingBytes,
      estimatedRequiredBytes: safeRequired,
      headline: `Storage Quota Critical (${percentUsed}% used · ${formatByteSizePure(remainingBytes)} free)`,
      detail: `${label} estimates ~${formatByteSizePure(safeRequired)} (+ 2 MB SQLite safety reserve), exceeding remaining browser quota (${formatByteSizePure(remainingBytes)}). Uncheck embedded photos, purge OPFS /tmp scratchpad, or export a lightweight .JSON/.TXT log first.`,
    };
  }

  if (!isSpaceFreeingOp && (percentUsed >= QUOTA_WARN_PERCENT || remainingBytes < safeRequired * 2)) {
    return {
      level: 'warn',
      allowed: true,
      requiresConfirmation: true,
      opfsSupported: input.opfsSupported,
      storageApiSupported,
      persisted,
      percentUsed,
      usageBytes,
      quotaBytes,
      remainingBytes,
      estimatedRequiredBytes: safeRequired,
      headline: `Low Storage Headroom (${percentUsed}% used · ${formatByteSizePure(remainingBytes)} free)`,
      detail: `${label} may require ~${formatByteSizePure(safeRequired)}. ${
        input.opfsSupported ? 'OPFS streaming is active,' : 'OPFS is unavailable,'
      } so confirm before continuing or omit large photo attachments.`,
    };
  }

  return {
    level: 'ok',
    allowed: true,
    requiresConfirmation: false,
    opfsSupported: input.opfsSupported,
    storageApiSupported,
    persisted,
    percentUsed,
    usageBytes,
    quotaBytes,
    remainingBytes,
    estimatedRequiredBytes: safeRequired,
    headline: `${input.opfsSupported ? 'OPFS + IDB' : 'IDB Only'} Quota Healthy (${formatByteSizePure(remainingBytes)} free · ${percentUsed}% used)`,
    detail: `Sufficient headroom (${formatByteSizePure(remainingBytes)}) available for ${label}.`,
  };
}

export type DiagnosticEventLevelOverride = 'info' | 'warn' | 'error';
export type DiagnosticEventCategoryOverride = 'lifecycle' | 'storage' | 'memory';

export interface ValidatedDiagnosticTriggerPayload {
  level: DiagnosticEventLevelOverride;
  category: DiagnosticEventCategoryOverride;
  message: string;
  note?: string;
}

const VALID_TRIGGER_LEVELS: ReadonlySet<string> = new Set(['info', 'warn', 'error']);
const VALID_TRIGGER_CATEGORIES: ReadonlySet<string> = new Set(['lifecycle', 'storage', 'memory']);

/**
 * Runtime type-guard and sanitizer for manual developer diagnostic trigger inputs.
 */
export function validateDiagnosticTriggerInput(raw: unknown):
  | { ok: true; value: ValidatedDiagnosticTriggerPayload }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Diagnostic trigger payload must be a plain object.' };
  }
  const obj = raw as Record<string, unknown>;
  const rawLevel = typeof obj.level === 'string' ? obj.level.trim().toLowerCase() : '';
  if (!VALID_TRIGGER_LEVELS.has(rawLevel)) {
    return { ok: false, error: 'Diagnostic level must be info, warn, or error.' };
  }
  const rawCategory = typeof obj.category === 'string' ? obj.category.trim().toLowerCase() : '';
  if (!VALID_TRIGGER_CATEGORIES.has(rawCategory)) {
    return { ok: false, error: 'Diagnostic category must be lifecycle, storage, or memory.' };
  }

  const cleanMessage = sanitizeSingleLineText(obj.message, 200);
  if (cleanMessage.length < 3) {
    return { ok: false, error: 'Diagnostic message must be at least 3 printable characters.' };
  }

  const cleanNote =
    typeof obj.note === 'string' && obj.note.trim().length > 0
      ? sanitizePlainText(obj.note, 600).trim()
      : undefined;

  return {
    ok: true,
    value: {
      level: rawLevel as DiagnosticEventLevelOverride,
      category: rawCategory as DiagnosticEventCategoryOverride,
      message: cleanMessage,
      ...(cleanNote ? { note: cleanNote } : {}),
    },
  };
}

/**
 * Runtime validator for diagnostic retention day overrides (3 / 7 / 14).
 */
export function validateLogRetentionDaysOverride(value: unknown):
  | { ok: true; days: 3 | 7 | 14 }
  | { ok: false; error: string } {
  const num = typeof value === 'string' ? Number(value.trim()) : value;
  if (num === 3 || num === 7 || num === 14) {
    return { ok: true, days: num };
  }
  return { ok: false, error: 'Log retention window must be strictly 3, 7, or 14 days.' };
}

/**
 * Runtime validator for PWA update policy overrides ('auto' | 'notify' | 'pinned').
 */
export function validatePwaUpdatePolicyOverride(value: unknown):
  | { ok: true; policy: 'auto' | 'notify' | 'pinned' }
  | { ok: false; error: string } {
  if (value === 'auto' || value === 'notify' || value === 'pinned') {
    return { ok: true, policy: value };
  }
  return { ok: false, error: 'PWA update policy must be auto, notify, or pinned.' };
}

/**
 * Sanitizes and validates an optional support recipient email input to prevent
 * header/mailto injection or malformed characters.
 */
export function validateSupportRecipientEmail(raw: unknown):
  | { ok: true; email: string }
  | { ok: false; error: string } {
  const cleaned = sanitizeSingleLineText(raw, 160);
  if (!cleaned) {
    return { ok: true, email: '' };
  }
  if (/[\r\n<>'"`\\]/.test(cleaned) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)) {
    return {
      ok: false,
      error: 'Enter a valid email address (for example support@example.org) or leave blank.',
    };
  }
  return { ok: true, email: cleaned };
}

export type DestructiveDeveloperActionId =
  | 'purge_opfs_tmp'
  | 'clear_sync_outbox'
  | 'clear_diagnostic_logs'
  | 'rebuild_local_db'
  | 'wipe_all_animals'
  | 'factory_restore';

export const DESTRUCTIVE_CONFIRM_PHRASES: Record<DestructiveDeveloperActionId, string> = {
  purge_opfs_tmp: 'PURGE TMP',
  clear_sync_outbox: 'RESET SYNC',
  clear_diagnostic_logs: 'CLEAR LOGS',
  rebuild_local_db: 'REBUILD DB',
  wipe_all_animals: 'WIPE RECORDS',
  factory_restore: 'FACTORY RESET',
};

/**
 * Validates multi-step confirmation phrase entry for high-impact developer actions.
 */
export function isDestructiveActionConfirmationValid(
  action: DestructiveDeveloperActionId,
  typedValue: string
): boolean {
  const expected = DESTRUCTIVE_CONFIRM_PHRASES[action];
  const cleaned = sanitizeSingleLineText(typedValue, 60).toUpperCase();
  return cleaned === expected;
}
```

## `src/core/themePalette.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Theme Palette & Custom Color Picker Engine.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript color math with zero browser DOM (`window`, `document`) calls.
 * Computes full Light ("Warm Parchment & Copper") and Dark ("Original Woodland & Copper")
 * token sets, plus automatic WCAG contrast text and surface tints when users pick custom hex colors.
 */

export interface CustomThemeColors {
  lightPrimary?: string;
  lightAccent?: string;
  lightMale?: string;
  lightCanvas?: string;
  lightSurface?: string;
  darkPrimary?: string;
  darkAccent?: string;
  darkMale?: string;
  darkCanvas?: string;
  darkSurface?: string;
}

export interface ThemePresetOption {
  id: string;
  name: string;
  description: string;
  colors: CustomThemeColors;
}

export const DEFAULT_WARM_THEME_COLORS: Required<CustomThemeColors> = {
  // Warm Parchment & Copper (Light)
  lightPrimary: '#2D5E3F',
  lightAccent: '#8C3F20',
  lightMale: '#366685',
  lightCanvas: '#F2E9DA',
  lightSurface: '#FAF5EB',
  // Original Woodland & Copper (Dark — matched to original demo screenshots)
  darkPrimary: '#8DD6A3',
  darkAccent: '#783519',
  darkMale: '#88C0E6',
  darkCanvas: '#0F1611',
  darkSurface: '#172219',
};

export const WARM_THEME_PRESETS: ThemePresetOption[] = [
  {
    id: 'original-woodland',
    name: 'Original Woodland & Copper',
    description: 'Deep moss woodland dark mode and sun-warmed parchment light mode with copper accents.',
    colors: { ...DEFAULT_WARM_THEME_COLORS },
  },
  {
    id: 'nz-red-heritage',
    name: 'New Zealand Red Barn',
    description: 'Rich rufus-mahogany accents paired with warm cedar dark surfaces and cream linen.',
    colors: {
      lightPrimary: '#9E3D22',
      lightAccent: '#6E4B26',
      lightMale: '#35607A',
      lightCanvas: '#F4EAE0',
      lightSurface: '#FCF6F0',
      darkPrimary: '#F09A79',
      darkAccent: '#69321E',
      darkMale: '#88BBD9',
      darkCanvas: '#171210',
      darkSurface: '#231B18',
    },
  },
  {
    id: 'harvest-ochre',
    name: 'Harvest Meadow & Ochre',
    description: 'Warm golden-ochre active tabs with botanical olive-sage actions and oat surfaces.',
    colors: {
      lightPrimary: '#3A6338',
      lightAccent: '#9A601E',
      lightMale: '#3B6680',
      lightCanvas: '#F3EBDC',
      lightSurface: '#FBF7EE',
      darkPrimary: '#A4D88C',
      darkAccent: '#754A18',
      darkMale: '#8BC2DE',
      darkCanvas: '#121610',
      darkSurface: '#1B2117',
    },
  },
  {
    id: 'espresso-homestead',
    name: 'Homestead Espresso & Sage',
    description: 'Warm walnut-espresso dark canvas and honeyed parchment light mode.',
    colors: {
      lightPrimary: '#2F5D46',
      lightAccent: '#824328',
      lightMale: '#3B6582',
      lightCanvas: '#EFE5D6',
      lightSurface: '#F9F3EA',
      darkPrimary: '#88D1A8',
      darkAccent: '#703A22',
      darkMale: '#8BBEE0',
      darkCanvas: '#161310',
      darkSurface: '#211D18',
    },
  },
];

function normalizeHex(hex: string | undefined, fallback: string): string {
  const raw = (hex || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  return fallback.toUpperCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Linearly mixes two `#RRGGBB` colors (`weight` 0 = `hexA`, 1 = `hexB`).
 */
export function mixHex(hexA: string, hexB: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(r1 + (r2 - r1) * w, g1 + (g2 - g1) * w, b1 + (b2 - b1) * w);
}

/**
 * Computes WCAG relative luminance (0 = black, 1 = white) to pick readable foreground ink.
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Picks warm dark espresso or warm cream text for crisp contrast on any user-chosen button fill.
 */
export function pickContrastInk(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.34 ? '#0D2616' : '#FFF8F0';
}

/**
 * Resolves the complete CSS variable map for the active `themeMode` and `customColors`.
 */
export function resolveThemeCssVariables(
  themeMode: 'light' | 'dark',
  custom?: CustomThemeColors
): Record<string, string> {
  const merged: Required<CustomThemeColors> = {
    lightPrimary: normalizeHex(custom?.lightPrimary, DEFAULT_WARM_THEME_COLORS.lightPrimary),
    lightAccent: normalizeHex(custom?.lightAccent, DEFAULT_WARM_THEME_COLORS.lightAccent),
    lightMale: normalizeHex(custom?.lightMale, DEFAULT_WARM_THEME_COLORS.lightMale),
    lightCanvas: normalizeHex(custom?.lightCanvas, DEFAULT_WARM_THEME_COLORS.lightCanvas),
    lightSurface: normalizeHex(custom?.lightSurface, DEFAULT_WARM_THEME_COLORS.lightSurface),
    darkPrimary: normalizeHex(custom?.darkPrimary, DEFAULT_WARM_THEME_COLORS.darkPrimary),
    darkAccent: normalizeHex(custom?.darkAccent, DEFAULT_WARM_THEME_COLORS.darkAccent),
    darkMale: normalizeHex(custom?.darkMale, DEFAULT_WARM_THEME_COLORS.darkMale),
    darkCanvas: normalizeHex(custom?.darkCanvas, DEFAULT_WARM_THEME_COLORS.darkCanvas),
    darkSurface: normalizeHex(custom?.darkSurface, DEFAULT_WARM_THEME_COLORS.darkSurface),
  };

  if (themeMode === 'dark') {
    const canvas = merged.darkCanvas;
    const surface = merged.darkSurface;
    const isLightCustomCanvas = relativeLuminance(canvas) > 0.45;
    const ink = isLightCustomCanvas ? '#231E18' : '#EFECE4';
    const muted = mixHex(ink, surface, 0.38);
    const subtle = mixHex(surface, ink, 0.08);
    const border = mixHex(surface, ink, 0.16);
    const primary = merged.darkPrimary;
    const accentFill = merged.darkAccent;
    // Ensure Dam text / curve is warm and luminous against dark surfaces
    const terracottaText =
      relativeLuminance(accentFill) < 0.22 ? mixHex(accentFill, '#FFB899', 0.58) : accentFill;

    return {
      '--barn-canvas': canvas,
      '--barn-surface': surface,
      '--barn-subtle': subtle,
      '--barn-border': border,
      '--barn-ink': ink,
      '--barn-muted': muted,
      '--barn-sage': primary,
      '--barn-on-sage': pickContrastInk(primary),
      '--barn-sage-tint': mixHex(surface, primary, 0.2),
      '--barn-accent-fill': accentFill,
      '--barn-accent-on-fill': pickContrastInk(accentFill),
      '--barn-terracotta': terracottaText,
      '--barn-terracotta-tint': mixHex(surface, accentFill, 0.35),
      '--barn-slate': merged.darkMale,
      '--barn-slate-tint': mixHex(surface, merged.darkMale, 0.22),
      '--barn-danger': '#F28B82',
      '--barn-on-danger': pickContrastInk('#F28B82'),
    };
  }

  // Warm Light Mode
  const canvas = merged.lightCanvas;
  const surface = merged.lightSurface;
  const isDarkCustomCanvas = relativeLuminance(canvas) < 0.25;
  const ink = isDarkCustomCanvas ? '#EFECE4' : '#241E18';
  const muted = mixHex(ink, surface, 0.42);
  const subtle = mixHex(canvas, ink, 0.07);
  const border = mixHex(canvas, ink, 0.18);
  const primary = merged.lightPrimary;
  const accentFill = merged.lightAccent;
  const terracottaText =
    relativeLuminance(accentFill) > 0.45 ? mixHex(accentFill, '#5C220E', 0.45) : accentFill;

  return {
    '--barn-canvas': canvas,
    '--barn-surface': surface,
    '--barn-subtle': subtle,
    '--barn-border': border,
    '--barn-ink': ink,
    '--barn-muted': muted,
    '--barn-sage': primary,
    '--barn-on-sage': pickContrastInk(primary),
    '--barn-sage-tint': mixHex(surface, primary, 0.16),
    '--barn-accent-fill': accentFill,
    '--barn-accent-on-fill': pickContrastInk(accentFill),
    '--barn-terracotta': terracottaText,
    '--barn-terracotta-tint': mixHex(surface, accentFill, 0.16),
    '--barn-slate': merged.lightMale,
    '--barn-slate-tint': mixHex(surface, merged.lightMale, 0.15),
    '--barn-danger': '#B5382B',
    '--barn-on-danger': pickContrastInk('#B5382B'),
  };
}
```

## `src/core/upgradeGate.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Uncached `version.json` / `status.json` Upgrade Gate & Pre-Flight Evaluator
 * (`src/core/upgradeGate.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `fetch`) or Node dependencies.
 */

import { CURRENT_BACKUP_SCHEMA_VERSION } from './backupVault';
import { nowEpochMs } from './models';

export const CURRENT_APP_VERSION = '0.1.0-prealpha.1';

export interface VersionManifest {
  appVersion: string;
  schemaVersion: number;
  minDirectUpgradeSchema: number;
  releaseNotes?: string;
}

export interface StatusManifest {
  allowUpdates: boolean;
  revokedVersions: string[];
  advisoryMessage?: string;
}

export type UpgradeGateStatus =
  | 'allowed'
  | 'blocked_revoked'
  | 'blocked_paused'
  | 'requires_verified_backup'
  | 'requires_safe_harbor_reset';

export interface UpgradeGateDecision {
  status: UpgradeGateStatus;
  canProceedWithDirectSwSwap: boolean;
  requiresVerifiedBackup: boolean;
  requiresSafeHarborReset: boolean;
  schemaDelta: number;
  targetAppVersion: string;
  targetSchemaVersion: number;
  headline: string;
  detail: string;
}

function normalizeVersionString(val: unknown): string {
  return typeof val === 'string' ? val.trim().slice(0, 64) : '';
}

function normalizeSchemaNumber(val: unknown, fallback: number): number {
  const num = Number(val);
  return Number.isFinite(num) && num >= 1 ? Math.floor(num) : fallback;
}

export function parseVersionManifestJson(raw: unknown): VersionManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const appVersion = normalizeVersionString(rec.appVersion);
  if (!appVersion) return null;
  const schemaVersion = normalizeSchemaNumber(
    rec.schemaVersion,
    CURRENT_BACKUP_SCHEMA_VERSION
  );
  const minDirectUpgradeSchema = normalizeSchemaNumber(
    rec.minDirectUpgradeSchema,
    1
  );
  const releaseNotes =
    typeof rec.releaseNotes === 'string' && rec.releaseNotes.trim()
      ? rec.releaseNotes.trim().slice(0, 280)
      : undefined;

  return {
    appVersion,
    schemaVersion,
    minDirectUpgradeSchema,
    releaseNotes,
  };
}

export function parseStatusManifestJson(raw: unknown): StatusManifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const allowUpdates = rec.allowUpdates !== false;
  const revokedVersions = Array.isArray(rec.revokedVersions)
    ? rec.revokedVersions
        .map((v) => normalizeVersionString(v))
        .filter((v) => v.length > 0)
    : [];
  const advisoryMessage =
    typeof rec.advisoryMessage === 'string' && rec.advisoryMessage.trim()
      ? rec.advisoryMessage.trim().slice(0, 280)
      : undefined;

  return {
    allowUpdates,
    revokedVersions,
    advisoryMessage,
  };
}

export function evaluateUpgradeGate(params: {
  currentAppVersion?: string;
  currentSchemaVersion?: number;
  remoteVersion: VersionManifest | null;
  remoteStatus: StatusManifest | null;
  backupVerifiedForTarget?: boolean;
}): UpgradeGateDecision {
  const currentAppVersion =
    normalizeVersionString(params.currentAppVersion) || CURRENT_APP_VERSION;
  const currentSchemaVersion = normalizeSchemaNumber(
    params.currentSchemaVersion,
    CURRENT_BACKUP_SCHEMA_VERSION
  );
  const remoteVersion = params.remoteVersion;
  const remoteStatus = params.remoteStatus;

  const targetAppVersion = remoteVersion?.appVersion || currentAppVersion;
  const targetSchemaVersion = remoteVersion?.schemaVersion ?? currentSchemaVersion;
  const schemaDelta = Math.max(0, targetSchemaVersion - currentSchemaVersion);

  if (remoteStatus && !remoteStatus.allowUpdates) {
    return {
      status: 'blocked_paused',
      canProceedWithDirectSwSwap: false,
      requiresVerifiedBackup: false,
      requiresSafeHarborReset: false,
      schemaDelta,
      targetAppVersion,
      targetSchemaVersion,
      headline: 'App Updates Temporarily Paused',
      detail:
        remoteStatus.advisoryMessage ||
        'Remote release status currently pauses app-shell upgrades. Your local barn database continues working normally.',
    };
  }

  if (remoteStatus && remoteStatus.revokedVersions.length > 0) {
    const revokedSet = new Set(remoteStatus.revokedVersions.map((v) => v.toLowerCase()));
    const currentRevoked = revokedSet.has(currentAppVersion.toLowerCase());
    const targetRevoked = revokedSet.has(targetAppVersion.toLowerCase());
    if (currentRevoked || targetRevoked) {
      return {
        status: 'blocked_revoked',
        canProceedWithDirectSwSwap: false,
        requiresVerifiedBackup: false,
        requiresSafeHarborReset: false,
        schemaDelta,
        targetAppVersion,
        targetSchemaVersion,
        headline: targetRevoked
          ? `Blocked Revoked Release (${targetAppVersion})`
          : `Installed Version Flagged (${currentAppVersion})`,
        detail:
          remoteStatus.advisoryMessage ||
          'This release has been flagged in status.json and cannot auto-swap. Export a verified JSON backup before installing a clean build.',
      };
    }
  }

  if (
    remoteVersion &&
    currentSchemaVersion < remoteVersion.minDirectUpgradeSchema
  ) {
    return {
      status: 'requires_safe_harbor_reset',
      canProceedWithDirectSwSwap: false,
      requiresVerifiedBackup: true,
      requiresSafeHarborReset: true,
      schemaDelta,
      targetAppVersion,
      targetSchemaVersion,
      headline: 'Safe-Harbor Archive & Re-Import Required',
      detail: `Your local database schema (v${currentSchemaVersion}) is behind the minimum direct upgrade floor (v${remoteVersion.minDirectUpgradeSchema}) for ${targetAppVersion}. Download a verified JSON/ZIP backup, clear cached app shells, and re-import.`,
    };
  }

  if (schemaDelta >= 2 && !params.backupVerifiedForTarget) {
    return {
      status: 'requires_verified_backup',
      canProceedWithDirectSwSwap: false,
      requiresVerifiedBackup: true,
      requiresSafeHarborReset: false,
      schemaDelta,
      targetAppVersion,
      targetSchemaVersion,
      headline: `Verified Pre-Upgrade Backup Required (Schema +${schemaDelta})`,
      detail: `Upgrading from schema v${currentSchemaVersion} to v${targetSchemaVersion} spans ${schemaDelta} schema versions. Create and SHA-256 verify a Pre-Upgrade Safety Backup before activating this update.`,
    };
  }

  return {
    status: 'allowed',
    canProceedWithDirectSwSwap: true,
    requiresVerifiedBackup: false,
    requiresSafeHarborReset: false,
    schemaDelta,
    targetAppVersion,
    targetSchemaVersion,
    headline: 'Ready to Update Safely',
    detail: remoteVersion?.releaseNotes || 'Pre-flight release and schema checks passed.',
  };
}

export function computeHttpDateClockSkewMs(
  serverDateHeader: string | null | undefined,
  localNowMs: number = nowEpochMs()
): number | null {
  if (!serverDateHeader || typeof serverDateHeader !== 'string') return null;
  const parsedMs = Date.parse(serverDateHeader);
  if (!Number.isFinite(parsedMs) || parsedMs <= 0) return null;
  return parsedMs - localNowMs;
}
```

## `src/core/woolFiber.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Wool / Fiber Harvest Analytics & IAGARB German Angora Judging Standard
 * (`src/core/woolFiber.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies so the exact
 * same fiber yield totals, 90-day shearing rate conversions, and IAGARB 100-point scorecard
 * calculations run identically in unit tests, browser UI, printable pedigrees, and native builds.
 */

import { isSafeRecordKey, sanitizePlainText, sanitizeSingleLineText } from './inputSanitization';
import {
  generateUuid,
  IagarbScorecard,
  normalizeWoolHarvestMethod,
  nowIsoUtc,
  todayDateIso,
  WoolHarvest,
} from './models';

export const IAGARB_MAX_POINTS = 100;
export const IAGARB_REGISTRATION_MIN_POINTS = 80;
export const IAGARB_MIN_90_DAY_WOOL_GRAMS = 325;
export const IAGARB_STANDARD_SHEARING_CYCLE_DAYS = 90;

export interface IagarbJudgingPositionSpec {
  key: keyof Pick<
    IagarbScorecard,
    | 'weightPts'
    | 'bodyTypePts'
    | 'densityLengthPts'
    | 'uniformityPts'
    | 'texturePts'
    | 'furnishingsPts'
    | 'conditionPts'
  >;
  label: string;
  maxPoints: number;
  guidance: string;
}

/**
 * Verified 7-position 100-point IAGARB German Angora evaluation breakdown.
 */
export const IAGARB_JUDGING_POSITIONS: readonly IagarbJudgingPositionSpec[] = [
  {
    key: 'weightPts',
    label: 'Weight',
    maxPoints: 20,
    guidance: 'Min 2.5 kg (5.5 lbs) = 15 pts; ~3.5 kg avg; 5.0–5.5 kg top = 20 pts',
  },
  {
    key: 'bodyTypePts',
    label: 'Body Type',
    maxPoints: 20,
    guidance: 'Balanced length-to-depth-to-width ratio with firm flesh under wool',
  },
  {
    key: 'densityLengthPts',
    label: 'Wool Density & Length',
    maxPoints: 15,
    guidance: 'Dense, full-coat fiber growth and consistent staple length',
  },
  {
    key: 'uniformityPts',
    label: 'Wool Uniformity',
    maxPoints: 15,
    guidance: 'Consistent length & quality across back, flanks, and chest',
  },
  {
    key: 'texturePts',
    label: 'Wool Texture',
    maxPoints: 15,
    guidance: 'Distinctive crimp, healthy substance, and silky elasticity',
  },
  {
    key: 'furnishingsPts',
    label: 'Furnishings',
    maxPoints: 10,
    guidance: 'Head, forehead, cheeks, ear trim, and feet furnishings',
  },
  {
    key: 'conditionPts',
    label: 'Condition',
    maxPoints: 5,
    guidance: 'Health, cleanliness, and freedom from webbing or matting',
  },
];

function clampPoints(raw: unknown, max: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  const clamped = Math.min(max, num);
  return Math.round(clamped * 10) / 10;
}

function finiteNonNeg(raw: unknown, max = 100_000): number {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.min(max, Math.round(num * 10) / 10);
}

export function computeIagarbScoreTotal(
  score: Omit<IagarbScorecard, 'totalPts' | 'evaluatorName' | 'evaluationDateIso'>
): number {
  const sum =
    clampPoints(score.weightPts, 20) +
    clampPoints(score.bodyTypePts, 20) +
    clampPoints(score.densityLengthPts, 15) +
    clampPoints(score.uniformityPts, 15) +
    clampPoints(score.texturePts, 15) +
    clampPoints(score.furnishingsPts, 10) +
    clampPoints(score.conditionPts, 5);
  return Math.min(IAGARB_MAX_POINTS, Math.round(sum * 10) / 10);
}

export function normalizeIagarbScorecard(raw: unknown): IagarbScorecard | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const weightPts = clampPoints(obj.weightPts, 20);
  const bodyTypePts = clampPoints(obj.bodyTypePts, 20);
  const densityLengthPts = clampPoints(obj.densityLengthPts, 15);
  const uniformityPts = clampPoints(obj.uniformityPts, 15);
  const texturePts = clampPoints(obj.texturePts, 15);
  const furnishingsPts = clampPoints(obj.furnishingsPts, 10);
  const conditionPts = clampPoints(obj.conditionPts, 5);
  const totalPts = computeIagarbScoreTotal({
    weightPts,
    bodyTypePts,
    densityLengthPts,
    uniformityPts,
    texturePts,
    furnishingsPts,
    conditionPts,
  });
  const evaluatorName = sanitizeSingleLineText(obj.evaluatorName || '', 120);
  const rawDate = typeof obj.evaluationDateIso === 'string' ? obj.evaluationDateIso.trim() : '';
  const evaluationDateIso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';
  if (totalPts <= 0 && !evaluatorName && !evaluationDateIso) {
    return undefined;
  }
  return {
    weightPts,
    bodyTypePts,
    densityLengthPts,
    uniformityPts,
    texturePts,
    furnishingsPts,
    conditionPts,
    totalPts,
    evaluatorName,
    evaluationDateIso,
  };
}

export interface IagarbEligibilityResult {
  pointsTotal: number;
  meetsPointsThreshold: boolean;
  yield90DayGrams: number | null;
  meets90DayYieldThreshold: boolean | null;
  overallEligible: boolean;
  statusLabel: string;
}

export function evaluateIagarbEligibility(
  scoreTotal: number,
  yield90DayGrams?: number | null
): IagarbEligibilityResult {
  const cleanScore = Math.min(IAGARB_MAX_POINTS, Math.max(0, Math.round(scoreTotal * 10) / 10));
  const meetsPointsThreshold = cleanScore >= IAGARB_REGISTRATION_MIN_POINTS;
  const validYield =
    typeof yield90DayGrams === 'number' && Number.isFinite(yield90DayGrams) && yield90DayGrams > 0
      ? Math.round(yield90DayGrams * 10) / 10
      : null;
  const meets90DayYieldThreshold =
    validYield !== null ? validYield >= IAGARB_MIN_90_DAY_WOOL_GRAMS : null;
  const overallEligible =
    meetsPointsThreshold && (meets90DayYieldThreshold === null || meets90DayYieldThreshold);

  let statusLabel = 'Needs Evaluation (min 80 pts)';
  if (cleanScore > 0) {
    if (!meetsPointsThreshold) {
      statusLabel = `Below IAGARB Reg Threshold (${cleanScore}/80 pts)`;
    } else if (meets90DayYieldThreshold === false) {
      statusLabel = `Score Eligible (${cleanScore} pts) · Below 325g/90d Yield`;
    } else if (meets90DayYieldThreshold === true) {
      statusLabel = `IAGARB Reg & 90d Yield Qualified (${cleanScore} pts · ${validYield}g/90d)`;
    } else {
      statusLabel = `IAGARB Score Qualified (${cleanScore}/100 pts)`;
    }
  } else if (meets90DayYieldThreshold === true) {
    statusLabel = `Meets 325g/90d Yield (${validYield}g) · Needs Judging Score`;
  } else if (meets90DayYieldThreshold === false) {
    statusLabel = `90d Yield ${validYield}g (< 325g minimum)`;
  }

  return {
    pointsTotal: cleanScore,
    meetsPointsThreshold,
    yield90DayGrams: validYield,
    meets90DayYieldThreshold,
    overallEligible,
    statusLabel,
  };
}

/**
 * Computes exact signed calendar days between two `YYYY-MM-DD` dates using `Date.UTC`.
 */
export function computeDaysBetweenDateIso(earlierIso: string, laterIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(earlierIso) || !/^\d{4}-\d{2}-\d{2}$/.test(laterIso)) {
    return null;
  }
  const [y1, m1, d1] = earlierIso.split('-').map(Number);
  const [y2, m2, d2] = laterIso.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / 86_400_000);
}

/**
 * Normalizes any shearing harvest total to a 90-day standard cycle rate.
 */
export function compute90DayEquivalentGrams(
  totalGrams: number,
  intervalDays?: number
): number | null {
  if (!Number.isFinite(totalGrams) || totalGrams <= 0) return null;
  if (!intervalDays || !Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  return Math.round(((totalGrams / intervalDays) * IAGARB_STANDARD_SHEARING_CYCLE_DAYS) * 10) / 10;
}

export function normalizeWoolHarvest(raw: unknown, fallbackSpecies = 'Rabbit'): WoolHarvest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const animalId = typeof obj.animalId === 'string' ? obj.animalId.trim() : '';
  if (!animalId) return null;

  const rawId = typeof obj.id === 'string' ? obj.id.trim() : '';
  const id = rawId && isSafeRecordKey(rawId) ? rawId : generateUuid();
  const species =
    typeof obj.species === 'string' && obj.species.trim()
      ? sanitizeSingleLineText(obj.species, 60)
      : fallbackSpecies;
  const rawDate = typeof obj.harvestDateIso === 'string' ? obj.harvestDateIso.trim() : '';
  const harvestDateIso = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : todayDateIso();
  const intervalRaw = Math.round(finiteNonNeg(obj.shearingIntervalDays, 1000));
  const stapleRaw = finiteNonNeg(obj.stapleLengthMm, 500);
  const iagarbScore = normalizeIagarbScorecard(obj.iagarbScore);
  const now = nowIsoUtc();

  return {
    id,
    species,
    animalId,
    harvestDateIso,
    ...(intervalRaw > 0 ? { shearingIntervalDays: intervalRaw } : {}),
    primeWeightGrams: finiteNonNeg(obj.primeWeightGrams, 100_000),
    gradeWeightGrams: finiteNonNeg(obj.gradeWeightGrams, 100_000),
    harvestMethod: normalizeWoolHarvestMethod(obj.harvestMethod, 'Shear'),
    ...(stapleRaw > 0 ? { stapleLengthMm: stapleRaw } : {}),
    ...(iagarbScore ? { iagarbScore } : {}),
    ...(typeof obj.witnessedBy === 'string' && obj.witnessedBy.trim()
      ? { witnessedBy: sanitizeSingleLineText(obj.witnessedBy, 120) }
      : {}),
    notes: sanitizePlainText(obj.notes || '', 1000),
    ...(typeof obj._rev === 'number' && Number.isFinite(obj._rev) && obj._rev > 0
      ? { _rev: Math.round(obj._rev) }
      : {}),
    createdAt: typeof obj.createdAt === 'string' && obj.createdAt.trim() ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'string' && obj.updatedAt.trim() ? obj.updatedAt : now,
  };
}

export interface AnimalWoolSummary {
  animalId: string;
  harvestCount: number;
  primeGrams: number;
  gradeGrams: number;
  totalGrams: number;
  primePercent: number;
  averagePerHarvestGrams: number;
  average90DayRateGrams: number | null;
  latest90DayRateGrams: number | null;
  latestHarvestDateIso: string;
  latestHarvestMethod: WoolHarvest['harvestMethod'] | '';
  latestIagarbScore: IagarbScorecard | null;
  highestIagarbScore: IagarbScorecard | null;
  eligibility: IagarbEligibilityResult;
}

export function summarizeAnimalWoolHarvests(
  harvests: readonly WoolHarvest[],
  animalId: string
): AnimalWoolSummary {
  const relevant = harvests
    .filter((h) => h.animalId === animalId)
    .slice()
    .sort(
      (a, b) =>
        (b.harvestDateIso || '').localeCompare(a.harvestDateIso || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );

  let primeGrams = 0;
  let gradeGrams = 0;
  let latestIagarbScore: IagarbScorecard | null = null;
  let highestIagarbScore: IagarbScorecard | null = null;
  const cycleRates: number[] = [];

  for (let i = 0; i < relevant.length; i += 1) {
    const h = relevant[i];
    const prime = Math.max(0, Number(h.primeWeightGrams) || 0);
    const grade = Math.max(0, Number(h.gradeWeightGrams) || 0);
    primeGrams += prime;
    gradeGrams += grade;

    if (h.iagarbScore && h.iagarbScore.totalPts > 0) {
      if (!latestIagarbScore) latestIagarbScore = h.iagarbScore;
      if (!highestIagarbScore || h.iagarbScore.totalPts > highestIagarbScore.totalPts) {
        highestIagarbScore = h.iagarbScore;
      }
    }

    let cycleDays =
      h.shearingIntervalDays && h.shearingIntervalDays > 0 ? h.shearingIntervalDays : 0;
    if (!cycleDays && i + 1 < relevant.length) {
      const derived = computeDaysBetweenDateIso(relevant[i + 1].harvestDateIso, h.harvestDateIso);
      if (derived && derived >= 20 && derived <= 365) {
        cycleDays = derived;
      }
    }
    const rate = compute90DayEquivalentGrams(prime + grade, cycleDays);
    if (rate !== null) {
      cycleRates.push(rate);
    }
  }

  primeGrams = Math.round(primeGrams * 10) / 10;
  gradeGrams = Math.round(gradeGrams * 10) / 10;
  const totalGrams = Math.round((primeGrams + gradeGrams) * 10) / 10;
  const harvestCount = relevant.length;
  const primePercent = totalGrams > 0 ? Math.round((primeGrams / totalGrams) * 100) : 0;
  const averagePerHarvestGrams =
    harvestCount > 0 ? Math.round((totalGrams / harvestCount) * 10) / 10 : 0;
  const average90DayRateGrams =
    cycleRates.length > 0
      ? Math.round((cycleRates.reduce((acc, v) => acc + v, 0) / cycleRates.length) * 10) / 10
      : null;
  const latest90DayRateGrams = cycleRates.length > 0 ? cycleRates[0] : null;
  const bestScorePts = highestIagarbScore?.totalPts ?? latestIagarbScore?.totalPts ?? 0;

  return {
    animalId,
    harvestCount,
    primeGrams,
    gradeGrams,
    totalGrams,
    primePercent,
    averagePerHarvestGrams,
    average90DayRateGrams,
    latest90DayRateGrams,
    latestHarvestDateIso: relevant[0]?.harvestDateIso || '',
    latestHarvestMethod: relevant[0]?.harvestMethod || '',
    latestIagarbScore,
    highestIagarbScore,
    eligibility: evaluateIagarbEligibility(bestScorePts, average90DayRateGrams),
  };
}

export function buildWoolHarvestSummaryByAnimalId(
  harvests: readonly WoolHarvest[]
): Map<string, AnimalWoolSummary> {
  const ids = new Set<string>();
  for (const h of harvests) {
    if (h.animalId) ids.add(h.animalId);
  }
  const map = new Map<string, AnimalWoolSummary>();
  for (const id of ids) {
    map.set(id, summarizeAnimalWoolHarvests(harvests, id));
  }
  return map;
}

export function formatWoolWeightSummary(
  summary: AnimalWoolSummary,
  options?: { compact?: boolean }
): string {
  if (summary.harvestCount === 0 && !summary.highestIagarbScore) {
    return '';
  }
  const parts: string[] = [];
  if (summary.totalGrams > 0) {
    if (options?.compact) {
      parts.push(
        `${summary.totalGrams}g wool (${summary.primeGrams}g prime / ${summary.gradeGrams}g grade)`
      );
    } else {
      parts.push(
        `${summary.totalGrams}g total (${summary.primeGrams}g prime · ${summary.gradeGrams}g grade · ${summary.harvestCount} harvest${summary.harvestCount === 1 ? '' : 's'})`
      );
    }
  }
  if (summary.average90DayRateGrams !== null) {
    parts.push(`${summary.average90DayRateGrams}g/90d`);
  }
  if (summary.highestIagarbScore) {
    parts.push(`IAGARB ${summary.highestIagarbScore.totalPts}/100`);
  }
  return parts.join(' · ');
}
```

## `src/core/__tests__/alternativeCertificates.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildBreedingCertificateFileName,
  buildPetBirthCertificateFileName,
  generateBreedingCertificateHtml,
  generatePetBirthCertificateHtml,
} from '../alternativeCertificates';
import { BreedingRecord } from '../models';
import { makeAnimal, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('alternativeCertificates — Pet-Sale Birth Cert & Breeding Certificate HTML', () => {
  it('generates pet-sale Birth Certificate omitting breeder contact info and all pricing', () => {
    const sire = makeAnimal('sire-1', {
      name: 'Cloud Nine',
      sex: 'Male',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
    });
    const dam = makeAnimal('dam-1', {
      name: 'Sweet Pea',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Blue',
    });
    const kit = makeAnimal('kit-1', {
      name: 'Buttercup <script>alert(1)</script>',
      tattoo: 'PET01',
      breed: 'Holland Lop',
      variety: 'Cream',
      sex: 'Female',
      birthDateIso: '2026-04-12',
      weightGrams: 920,
      sireId: 'sire-1',
      damId: 'dam-1',
      buyerName: 'The Miller Family',
      salePriceCents: 17500,
      purchaseCostCents: 5000,
      breederName: 'SecretBreederLLC',
    });
    const settings = makeSettings({
      barnName: 'HiddenAcresPhone555-999-0000',
      breederName: 'breeder@secret.example',
      breederLogoDataUrl: 'data:image/png;base64,AAAA',
    });

    const filename = buildPetBirthCertificateFileName(kit);
    expect(filename).toMatch(/^birth-certificate-.*\.htm$/);

    const html = generatePetBirthCertificateHtml(
      kit,
      [kit, sire, dam],
      [makeSpeciesProfile('Rabbit')],
      settings,
      {
        companionFamilyName: 'The <Miller> Family',
        keepsakeMessage: 'May Buttercup bring joy!',
        primaryPhotoDataUrl: 'javascript:alert(1)',
      }
    );

    expect(html).toContain('Certificate of Birth');
    expect(html).toContain('The &lt;Miller&gt; Family');
    expect(html).toContain('May Buttercup bring joy!');
    expect(html).toContain('Cloud Nine');
    expect(html).toContain('Sweet Pea');
    // Strict XSS escaping + unsafe URL blocking
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('javascript:alert(1)');
    // Strict privacy: breeder contact / barn commercial header / sale price omitted
    expect(html).not.toContain('$175');
    expect(html).not.toContain('175.00');
    expect(html).not.toContain('50.00');
    expect(html).not.toContain('HiddenAcresPhone555-999-0000');
    expect(html).not.toContain('breeder@secret.example');
    expect(html).not.toContain('SecretBreederLLC');
  });

  it('generates Breeding / Service Certificate with Sire, Dam, service dates, COI, fees & outcome', () => {
    const sire = makeAnimal('s1', {
      name: 'Thunderbolt',
      tattoo: 'TB9',
      sex: 'Male',
      breed: 'German Angora',
      variety: 'Ruby-Eyed White',
      registrationNumber: 'REG-778',
      grandChampionNumber: 'GC-12',
      ownerName: 'Kim Stud',
    });
    const dam = makeAnimal('d1', {
      name: 'Snowflake',
      tattoo: 'SF4',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'Ruby-Eyed White',
      ownerName: 'Oak Dam',
    });
    const breeding: BreedingRecord = {
      id: 'b-cert-1',
      species: 'Rabbit',
      sireId: 's1',
      damId: 'd1',
      sireName: 'Thunderbolt',
      damName: 'Snowflake',
      bredDateIso: '2026-03-01',
      expectedDueDateIso: '2026-04-01',
      actualBirthDateIso: '2026-04-02',
      projectedCoiPercent: 3.125,
      liveCount: 6,
      stillbornCount: 1,
      fosteredCount: 0,
      weanedCount: 5,
      offspringCreated: true,
      status: 'Weaned',
      serviceFeeCents: 4500,
      serviceFeeDirection: 'earned',
      notes: 'Double cover AM & PM',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-04-02T10:00:00.000Z',
    };

    const filename = buildBreedingCertificateFileName(breeding);
    expect(filename).toBe('breeding-certificate-thunderbolt-x-snowflake-2026-03-01.htm');

    const html = generateBreedingCertificateHtml(
      breeding,
      sire,
      dam,
      makeSpeciesProfile('Rabbit'),
      makeSettings({ barnName: 'Meadowbrook Rabbitry', currencyCode: 'USD' }),
      {
        breederContactLine: 'contact@meadowbrook.example · (555) 123-4567',
        serviceNotes: 'Witnessed service <verified>',
      }
    );

    expect(html).toContain('Official Breeding Certificate');
    expect(html).toContain('Thunderbolt');
    expect(html).toContain('Snowflake');
    expect(html).toContain('Reg REG-778');
    expect(html).toContain('GC GC-12');
    expect(html).toContain('3.13%');
    expect(html).toContain('$45.00 (Stud Fee Received)');
    expect(html).toContain('6 Live');
    expect(html).toContain('5 Weaned');
    expect(html).toContain('Witnessed service &lt;verified&gt;');
    expect(html).toContain('contact@meadowbrook.example');
  });
});
```

## `src/core/__tests__/animalConflictsAndHealth.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  analyzeBarnAnimalConflicts,
  applyImportConflictAttentionFlags,
  findAllSpeciesDuplicateTattooPeers,
  findLitterOffspringTattooConflicts,
  findOffspringRequiringParentSex,
  findSameSexDuplicateTattooCollisions,
  getConflictSortPriority,
  isOverrideConfirmationValid,
} from '../animalConflicts';
import { analyzeBarnDataHealth, repairBarnDataHealth } from '../dataHealthCheck';
import { makeAnimal, makeEmptySnapshot, makeSpeciesProfile } from './testFixtures';

describe('animalConflicts & dataHealthCheck — conflict detection, override guard, import flags & non-destructive health warnings', () => {
  it('validates the case-insensitive override confirmation string cleanly', () => {
    expect(isOverrideConfirmationValid('override')).toBe(true);
    expect(isOverrideConfirmationValid('  OverRide  ')).toBe(true);
    expect(isOverrideConfirmationValid('')).toBe(false);
    expect(isOverrideConfirmationValid('yes')).toBe(false);
    expect(isOverrideConfirmationValid('overrid')).toBe(false);
  });

  it('detects same-species same-sex duplicate tattoos on single animal creation while ignoring other species or opposite sex', () => {
    const animals = [
      makeAnimal('r-buck-1', { species: 'Rabbit', sex: 'Male', tattoo: 'MB-101' }),
      makeAnimal('r-doe-1', { species: 'Rabbit', sex: 'Female', tattoo: 'MB-102' }),
      makeAnimal('s-buck-1', { species: 'Sheep', sex: 'Male', tattoo: 'MB-101' }),
    ];

    expect(
      findSameSexDuplicateTattooCollisions({
        tattoo: ' mb-101 ',
        sex: 'Male',
        species: 'Rabbit',
        animals,
      }).map((a) => a.id)
    ).toEqual(['r-buck-1']);

    // Opposite sex in same species does not block creation collision check
    expect(
      findSameSexDuplicateTattooCollisions({
        tattoo: 'MB-101',
        sex: 'Female',
        species: 'Rabbit',
        animals,
      })
    ).toHaveLength(0);

    // Editing the existing animal excludes itself
    expect(
      findSameSexDuplicateTattooCollisions({
        tattoo: 'MB-101',
        sex: 'Male',
        species: 'Rabbit',
        animals,
        excludeAnimalIds: ['r-buck-1'],
      })
    ).toHaveLength(0);

    // Informational all-sex same-species check catches both sexes within Rabbit only
    expect(
      findAllSpeciesDuplicateTattooPeers({
        tattoo: 'MB-101',
        species: 'Rabbit',
        animals,
      }).map((a) => a.id)
    ).toEqual(['r-buck-1']);
  });

  it('detects bulk litter offspring tattoo conflicts against existing herd AND intra-litter drafts', () => {
    const existing = [
      makeAnimal('r-buck', { species: 'Rabbit', sex: 'Male', tattoo: 'K-01' }),
    ];

    const conflicts = findLitterOffspringTattooConflicts(
      [
        { index: 0, name: 'Kit 1', tattoo: 'k-01', sex: 'Male' }, // collides with existing r-buck
        { index: 1, name: 'Kit 2', tattoo: 'K-02', sex: 'Female' }, // intra-batch duplicate with index 2
        { index: 2, name: 'Kit 3', tattoo: ' k-02 ', sex: 'Female' }, // intra-batch duplicate with index 1
        { index: 3, name: 'Kit 4', tattoo: 'K-02', sex: 'Male' }, // different sex, no same-sex collision
      ],
      'Rabbit',
      existing
    );

    expect(conflicts).toHaveLength(3);
    expect(conflicts[0].rowIndex).toBe(0);
    expect(conflicts[0].existingMatches.map((a) => a.id)).toEqual(['r-buck']);
    expect(conflicts[1].rowIndex).toBe(1);
    expect(conflicts[1].batchPeerIndices).toEqual([2]);
    expect(conflicts[2].rowIndex).toBe(2);
    expect(conflicts[2].batchPeerIndices).toEqual([1]);
  });

  it('identifies dependent offspring before changing an animal sex to prevent parent sex mismatches', () => {
    const animals = [
      makeAnimal('sire-1', { species: 'Rabbit', sex: 'Male' }),
      makeAnimal('dam-1', { species: 'Rabbit', sex: 'Female' }),
      makeAnimal('kit-1', { species: 'Rabbit', sireId: 'sire-1', damId: 'dam-1' }),
      makeAnimal('sheep-1', { species: 'Sheep', sireId: 'sire-1', damId: 'dam-1' }),
    ];

    const deps = findOffspringRequiringParentSex('sire-1', 'Rabbit', animals);
    expect(deps.asSireOf.map((a) => a.id)).toEqual(['kit-1']);
    expect(deps.asDamOf).toHaveLength(0);
  });

  it('flags imported animals & colliding peers for review without blocking imports and respects ignored conflict kinds', () => {
    const existingBuck = makeAnimal('existing-buck', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'DUP-9',
      needsAttention: false,
    });
    const importedDupBuck = makeAnimal('imp-buck', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'DUP-9',
      needsAttention: false,
    });
    const importedFemaleSire = makeAnimal('imp-female-sire', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'FS-1',
    });
    const importedWrongKid = makeAnimal('imp-kid', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'KID-1',
      sireId: 'imp-female-sire',
      needsAttention: false,
    });

    const flagResult = applyImportConflictAttentionFlags(
      [existingBuck, importedDupBuck, importedFemaleSire, importedWrongKid],
      new Set(['imp-buck', 'imp-female-sire', 'imp-kid'])
    );

    expect(flagResult.conflictedAnimalIds.sort()).toEqual(['existing-buck', 'imp-buck', 'imp-kid']);
    expect(flagResult.newlyFlaggedIds.sort()).toEqual(['existing-buck', 'imp-buck', 'imp-kid']);
    expect(flagResult.duplicateTattooAnimalCount).toBe(2);
    expect(flagResult.parentSexMismatchAnimalCount).toBe(1);
    expect(flagResult.alertMessage).toContain('3 record(s) needing review');

    const flaggedMap = new Map(flagResult.animals.map((a) => [a.id, a]));
    expect(flaggedMap.get('existing-buck')?.needsAttention).toBe(true);
    expect(flaggedMap.get('imp-buck')?.needsAttention).toBe(true);
    expect(flaggedMap.get('imp-kid')?.needsAttention).toBe(true);

    // Ignoring conflicts keeps soft warning while dropping active conflict & sort priority
    const ignoredKid = {
      ...flaggedMap.get('imp-kid')!,
      needsAttention: false,
      ignoredConflicts: ['parent_sex_mismatch' as const],
    };
    const summaries = analyzeBarnAnimalConflicts([
      flaggedMap.get('existing-buck')!,
      flaggedMap.get('imp-buck')!,
      importedFemaleSire,
      ignoredKid,
    ]);

    const activeSummary = summaries.get('imp-buck');
    const ignoredSummary = summaries.get('imp-kid');
    const cleanSummary = summaries.get('imp-female-sire');

    expect(activeSummary?.hasActiveConflict).toBe(true);
    expect(activeSummary?.isIgnoredWithSoftWarning).toBe(false);
    expect(getConflictSortPriority(activeSummary)).toBe(0);

    expect(ignoredSummary?.hasAnyConflict).toBe(true);
    expect(ignoredSummary?.hasActiveConflict).toBe(false);
    expect(ignoredSummary?.isIgnoredWithSoftWarning).toBe(true);
    expect(getConflictSortPriority(ignoredSummary)).toBe(1);

    expect(cleanSummary?.hasAnyConflict).toBe(false);
    expect(getConflictSortPriority(cleanSummary)).toBe(2);
  });

  it('reports within-species duplicate tattoos and parent sex mismatches in database health checks without destroying any data on repair', () => {
    const femaleAsSire = makeAnimal('sire-wrong', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'F-1',
    });
    const maleAsDam = makeAnimal('dam-wrong', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'M-1',
    });
    const unknownAsSire = makeAnimal('sire-unknown', {
      species: 'Rabbit',
      sex: 'Unknown',
      tattoo: 'U-1',
    });
    const kitBadParents = makeAnimal('kit-bad', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'DUP-77',
      sireId: 'sire-wrong',
      damId: 'dam-wrong',
    });
    const kitUnknownSire = makeAnimal('kit-unk', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'dup-77',
      sireId: 'sire-unknown',
    });
    const sheepSameTattoo = makeAnimal('sheep-ok', {
      species: 'Sheep',
      sex: 'Male',
      tattoo: 'DUP-77',
    });

    const snapshot = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
      animals: [
        femaleAsSire,
        maleAsDam,
        unknownAsSire,
        kitBadParents,
        kitUnknownSire,
        sheepSameTattoo,
      ],
    });

    const report = analyzeBarnDataHealth(snapshot);
    const dupIssue = report.issues.find((i) => i.code === 'DUPLICATE_SPECIES_TATTOO');
    const sexIssue = report.issues.find((i) => i.code === 'PARENT_SEX_MISMATCH');

    expect(dupIssue).toBeDefined();
    expect(dupIssue?.severity).toBe('warn');
    expect(dupIssue?.autoRepairable).toBe(false);
    expect(dupIssue?.count).toBe(1); // 1 group within Rabbit ("DUP-77"), ignoring Sheep

    expect(sexIssue).toBeDefined();
    expect(sexIssue?.severity).toBe('warn');
    expect(sexIssue?.autoRepairable).toBe(false);
    expect(sexIssue?.count).toBe(3); // female sire, male dam, unknown sire
    expect(sexIssue?.title).toContain('1 female recorded as Sire');
    expect(sexIssue?.title).toContain('1 male recorded as Dam');
    expect(sexIssue?.title).toContain('1 Unknown-sex parent link(s)');

    // Non-destructive health repair leaves warning-only parent links & duplicate tattoos intact
    const repaired = repairBarnDataHealth(snapshot);
    expect(repaired.nextSnapshot.animals).toHaveLength(6);
    const repairedKit = repaired.nextSnapshot.animals.find((a) => a.id === 'kit-bad');
    expect(repairedKit?.sireId).toBe('sire-wrong');
    expect(repairedKit?.damId).toBe('dam-wrong');
  });
});
```

## `src/core/__tests__/backupStatus.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  evaluateBackupStatus,
  formatLocalDateTimeReadable,
  formatRelativeBackupAge,
  getLatestSnapshotTimestamp,
  hasNonTestingBarnData,
  LastBackupMeta,
} from '../backupStatus';
import { makeAnimal, makeEmptySnapshot, makeSettings } from './testFixtures';

describe('backupStatus — freshness evaluation, sample gating & readable timestamps', () => {
  it('distinguishes sample-only testing herds from non-testing breeder data', () => {
    const sampleOnly = makeEmptySnapshot({
      animals: [makeAnimal('seed-rabbit-1', { name: 'Demo Buck' })],
    });
    expect(hasNonTestingBarnData(sampleOnly)).toBe(false);

    const withRealAnimal = makeEmptySnapshot({
      animals: [
        makeAnimal('seed-rabbit-1', { name: 'Demo Buck' }),
        makeAnimal('real-animal-1', { name: 'Barn Buck' }),
      ],
    });
    expect(hasNonTestingBarnData(withRealAnimal)).toBe(true);

    const withCustomSpecies = makeEmptySnapshot({
      speciesProfiles: [
        {
          id: 'sp-buffalo',
          name: 'Water Buffalo',
          sortOrder: 0,
          gestationDays: 315,
          rebreedDaysAfterBirth: 60,
          weanDaysAfterBirth: 180,
          birthEventLabel: 'Calving',
          maleLabel: 'Bull',
          femaleLabel: 'Cow',
          offspringLabel: 'Calf',
          exampleBreeds: ['Murrah'],
          milestones: [],
          createdAt: '2026-03-01T12:00:00.000Z',
          updatedAt: '2026-03-01T12:00:00.000Z',
        },
      ],
    });
    expect(hasNonTestingBarnData(withCustomSpecies)).toBe(true);
  });

  it('finds the newest ISO updatedAt timestamp across all collections and settings', () => {
    const snap = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-01-01T00:00:00.000Z' }),
      animals: [makeAnimal('a1', { updatedAt: '2026-04-10T08:30:00.000Z' })],
      shows: [
        {
          id: 'sh1',
          species: 'Rabbit',
          name: 'Spring Classic',
          location: 'Fairgrounds',
          sanctioningBody: 'ARBA',
          eventDateIso: '2026-05-01',
          entryDeadlineIso: '2026-04-20',
          enteredAnimalIds: ['a1'],
          notes: 'BOB',
          createdAt: '2026-05-01T08:00:00.000Z',
          updatedAt: '2026-05-02T14:15:00.000Z',
        },
      ],
    });

    expect(getLatestSnapshotTimestamp(snap)).toBe('2026-05-02T14:15:00.000Z');
  });

  it('evaluates never_backed_up, up_to_date, changes_pending, overdue, and 24h snooze states', () => {
    const nowMs = new Date('2026-06-15T12:00:00.000Z').getTime();
    const snap = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-06-14T10:00:00.000Z' }),
      animals: [makeAnimal('real-1', { updatedAt: '2026-06-14T11:00:00.000Z' })],
    });

    // 1. Never backed up -> needs reminder & shows banner for real data
    const never = evaluateBackupStatus(snap, null, nowMs, 0);
    expect(never.level).toBe('never_backed_up');
    expect(never.needsReminder).toBe(true);
    expect(never.showDismissibleBanner).toBe(true);

    // 2. Snoozed -> still needsReminder in Settings, but banner hidden
    const snoozed = evaluateBackupStatus(snap, null, nowMs, nowMs + 1000 * 60 * 60);
    expect(snoozed.needsReminder).toBe(true);
    expect(snoozed.showDismissibleBanner).toBe(false);

    // 3. Exported after latest edit -> up_to_date
    const recentBackup: LastBackupMeta = {
      exportedAtIso: '2026-06-14T12:00:00.000Z',
      format: 'json',
      fileName: 'barn-backup.json',
    };
    const upToDate = evaluateBackupStatus(snap, recentBackup, nowMs, 0);
    expect(upToDate.level).toBe('up_to_date');
    expect(upToDate.needsReminder).toBe(false);
    expect(upToDate.showDismissibleBanner).toBe(false);
    expect(upToDate.lastExportLabel).toContain('.JSON');

    // 4. Record edited after last export -> changes_pending
    const editedSnap = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-06-14T10:00:00.000Z' }),
      animals: [makeAnimal('real-1', { updatedAt: '2026-06-15T09:00:00.000Z' })],
    });
    const pending = evaluateBackupStatus(editedSnap, recentBackup, nowMs, 0);
    expect(pending.level).toBe('changes_pending');
    expect(pending.hasChangesSinceBackup).toBe(true);
    expect(pending.showDismissibleBanner).toBe(true);

    // 5. Export >= 7 days old -> overdue
    const oldBackup: LastBackupMeta = {
      exportedAtIso: '2026-06-01T12:00:00.000Z',
      format: 'sqlite',
    };
    const overdue = evaluateBackupStatus(editedSnap, oldBackup, nowMs, 0);
    expect(overdue.level).toBe('overdue');
    expect(overdue.ageDays).toBeGreaterThanOrEqual(7);
    expect(overdue.showDismissibleBanner).toBe(true);
  });

  it('formats readable relative and local timestamps safely', () => {
    const baseMs = new Date('2026-06-15T12:00:00.000Z').getTime();
    expect(formatRelativeBackupAge('2026-06-15T11:59:30.000Z', baseMs)).toBe('just now');
    expect(formatRelativeBackupAge('2026-06-15T11:45:00.000Z', baseMs)).toBe('15m ago');
    expect(formatRelativeBackupAge('2026-06-15T09:00:00.000Z', baseMs)).toBe('3h ago');
    expect(formatRelativeBackupAge('2026-06-10T12:00:00.000Z', baseMs)).toBe('5d ago');
    expect(formatLocalDateTimeReadable(null)).toBe('Not recorded');
  });
});
```

## `src/core/__tests__/backupVault.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildArchivedAnimalsBundle,
  buildExportCanaryProbe,
  buildVaultBackupEnvelope,
  computePedigreeReferencedIds,
  CURRENT_BACKUP_SCHEMA_VERSION,
  deserializeVaultBackupPayload,
  extractArchiveIndexMetadataOnly,
  isZipMagicBytes,
  mergeRestoredArchiveIntoSnapshot,
  migrateAndValidateBackupEnvelope,
  serializeCompressedVaultBackupZip,
  serializeVaultBackupEnvelope,
  sha256HexPure,
  unpackArchivedAnimalBundle,
  verifyExportCanaryRoundTrip,
} from '../backupVault';
import { Animal, AnimalPhoto, BarnDatabaseSnapshot, CareLog } from '../models';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';

function makeAnimal(overrides: Partial<Animal>): Animal {
  return {
    id: 'a-1',
    tattoo: 'T1',
    name: 'Test Animal',
    species: 'Rabbit',
    breed: 'Holland Lop',
    variety: 'Tort',
    sex: 'Female',
    status: 'Active',
    archived: false,
    needsAttention: false,
    birthDateIso: '2023-02-10',
    weightGrams: 1700,
    genotype: [],
    genotypeRaw: '',
    registrationNumber: '',
    grandChampionNumber: '',
    legsCount: 0,
    cageLocation: 'R-1',
    breederName: 'Barn Owner',
    ownerName: 'Barn Owner',
    sireId: '',
    damId: '',
    notes: 'Original notes',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRichSnapshot(): BarnDatabaseSnapshot {
  const sample = buildFullPredefinedSampleSnapshot();
  const sire = makeAnimal({
    id: 'arch-sire',
    name: 'Grand Sire',
    tattoo: 'GS1',
    sex: 'Male',
    status: 'Deceased',
    archived: true,
    deceasedDateIso: '2025-04-01',
    deathCause: 'Age',
  });
  const unlinkedSold = makeAnimal({
    id: 'arch-unlinked-sold',
    name: 'Sold Junior',
    tattoo: 'SJ9',
    sex: 'Female',
    status: 'Sold',
    archived: true,
    soldDateIso: '2025-05-12',
    buyerName: 'Maple Creek Rabbitry',
  });
  const activeChild = makeAnimal({
    id: 'active-doe',
    name: 'Active Daughter',
    tattoo: 'AD2',
    sex: 'Female',
    status: 'Active',
    archived: false,
    sireId: 'arch-sire',
  });

  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const photos: AnimalPhoto[] = [
    {
      id: 'photo-sire',
      species: 'Rabbit',
      animalId: 'arch-sire',
      isPrimary: true,
      sortOrder: 0,
      caption: 'Show table pose',
      originalFileName: 'sire.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      originalBytes: 100,
      storedBytes: 68,
      thumbnailDataUrl: tinyPng,
      dataUrl: tinyPng,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'photo-sold',
      species: 'Rabbit',
      animalId: 'arch-unlinked-sold',
      isPrimary: true,
      sortOrder: 0,
      caption: 'Sale photo',
      originalFileName: 'sold.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      originalBytes: 100,
      storedBytes: 68,
      thumbnailDataUrl: tinyPng,
      dataUrl: tinyPng,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];
  const careLogs: CareLog[] = [
    {
      id: 'log-sire',
      species: 'Rabbit',
      animalId: 'arch-sire',
      dateIso: '2024-06-01',
      type: 'Weight Check',
      title: 'Monthly weigh-in',
      weightGrams: 1850,
      withdrawalDays: 0,
      withdrawalClearDateIso: '',
      showLegEarned: false,
      notes: 'Steady weight',
      createdAt: '2024-06-01T00:00:00.000Z',
      updatedAt: '2024-06-01T00:00:00.000Z',
    },
    {
      id: 'log-active',
      species: 'Rabbit',
      animalId: 'active-doe',
      dateIso: '2025-06-01',
      type: 'Weight Check',
      title: 'Senior weigh-in',
      weightGrams: 1740,
      withdrawalDays: 0,
      withdrawalClearDateIso: '',
      showLegEarned: false,
      notes: '',
      createdAt: '2025-06-01T00:00:00.000Z',
      updatedAt: '2025-06-01T00:00:00.000Z',
    },
  ];

  return {
    settings: {
      ...sample.settings,
      barnName: 'Cedar Ridge Barn',
      autoOffloadRetiredToOpfs: true,
    },
    speciesProfiles: sample.speciesProfiles.slice(0, 2),
    animals: [sire, unlinkedSold, activeChild],
    animalPhotos: photos,
    cages: [],
    breedings: [],
    tasks: [],
    careLogs,
    shows: [],
    feedBatches: [],
    feedAllocations: [],
  };
}

describe('backupVault envelopes, schema migration & root validation', () => {
  it('stamps _schemaVersion=6 and verifies SHA-256 checksum on round-trip', () => {
    const snap = makeRichSnapshot();
    const { envelope, jsonText } = serializeVaultBackupEnvelope(snap, {
      kind: 'monthly',
      note: 'Automated monthly verification',
    });

    expect(envelope._schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(envelope.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256HexPure('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );

    for (const len of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 250]) {
      const payload = 'a'.repeat(len);
      const expectedHex = createHash('sha256').update(payload, 'utf8').digest('hex');
      expect(sha256HexPure(payload)).toBe(expectedHex);
    }
    const unicodeSample = '🐇 Barn #1 — Pedigree UTF-8 Block Boundary Check '.repeat(5);
    expect(sha256HexPure(unicodeSample)).toBe(
      createHash('sha256').update(unicodeSample, 'utf8').digest('hex')
    );

    const restored = migrateAndValidateBackupEnvelope(jsonText, snap.settings);
    expect(restored.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(restored.migratedFromVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(restored.vaultKind).toBe('monthly');
    expect(restored.checksumValid).toBe(true);
    expect(restored.snapshot.settings.barnName).toBe('Cedar Ridge Barn');
    expect(restored.snapshot.settings.autoOffloadRetiredToOpfs).toBe(true);
    expect(restored.snapshot.animals).toHaveLength(3);
  });

  it('rejects tampered vault envelopes and malformed root JSON', () => {
    const snap = makeRichSnapshot();
    const direct = buildVaultBackupEnvelope(snap, { kind: 'manual' });
    expect(direct.vaultKind).toBe('manual');
    const { envelope } = serializeVaultBackupEnvelope(snap, { kind: 'manual' });

    envelope.snapshot.settings.barnName = 'Tampered Barn';
    expect(() =>
      migrateAndValidateBackupEnvelope(JSON.stringify(envelope))
    ).toThrow(/checksum verification failed/i);

    expect(() => migrateAndValidateBackupEnvelope('[]')).toThrow(
      /non-empty JSON object/i
    );
    expect(() =>
      migrateAndValidateBackupEnvelope(
        JSON.stringify({
          format: 'community-pedigree-vault-backup',
          _schemaVersion: 6,
          snapshot: { animals: 'bad' },
        })
      )
    ).toThrow(/missing required animals or speciesProfiles/i);
  });

  it('migrates legacy v4/v5 direct backup payloads cleanly to schema v6', () => {
    const snap = makeRichSnapshot();
    const legacyV4 = {
      format: 'community-pedigree-backup',
      version: 4,
      settings: {
        barnName: 'Legacy Barn',
        preferredUnit: 'lbs_oz',
        defaultSpecies: 'Rabbit',
        defaultGenerations: 4,
        themeMode: 'light',
      },
      speciesProfiles: snap.speciesProfiles,
      animals: snap.animals.map((a) => ({
        ...a,
        offloadedArchiveKey: 'arch-legacy-1',
        offloadedAtIso: '2025-06-01T00:00:00.000Z',
      })),
      cages: [],
      breedings: [],
      tasks: [],
      careLogs: snap.careLogs,
      shows: [],
      animalPhotos: [],
    };

    const migrated = migrateAndValidateBackupEnvelope(JSON.stringify(legacyV4));
    expect(migrated.schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(migrated.migratedFromVersion).toBe(4);
    expect(migrated.checksumValid).toBeNull();
    expect(migrated.snapshot.settings.barnName).toBe('Legacy Barn');
    expect(migrated.snapshot.animals[0].offloadedArchiveKey).toBe('arch-legacy-1');
  });

  it('compresses vault envelopes into .vault.zip and deserializes both .vault.zip and legacy .json', () => {
    const snap = makeRichSnapshot();
    const { envelope, zipBytes } = serializeCompressedVaultBackupZip(snap, {
      kind: 'manual',
      note: 'Compressed vault check',
    });
    const { jsonText: prettyJson } = serializeVaultBackupEnvelope(snap, {
      kind: 'manual',
      note: 'Compressed vault check',
    });

    expect(isZipMagicBytes(zipBytes)).toBe(true);
    expect(zipBytes.byteLength).toBeLessThan(prettyJson.length);
    expect(envelope.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    const fromZip = deserializeVaultBackupPayload(zipBytes, snap.settings, 'manual-vault.vault.zip');
    expect(fromZip.checksumValid).toBe(true);
    expect(fromZip.snapshot.animals).toHaveLength(3);
    expect(fromZip.snapshot.settings.barnName).toBe('Cedar Ridge Barn');

    const fromLegacyJson = deserializeVaultBackupPayload(
      prettyJson,
      snap.settings,
      'manual-vault.json'
    );
    expect(fromLegacyJson.checksumValid).toBe(true);
    expect(fromLegacyJson.snapshot.animals).toHaveLength(3);

    expect(() =>
      deserializeVaultBackupPayload(
        new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
        snap.settings,
        'corrupt.vault.zip'
      )
    ).toThrow();
  });
});

describe('Export Canary probe round-trip verification', () => {
  it('passes valid canary probes and flags checksum or count tampering', () => {
    const snap = makeRichSnapshot();
    const probe = buildExportCanaryProbe(snap);
    expect(probe.format).toBe('community-pedigree-canary-v1');
    expect(probe.animalCount).toBe(3);

    expect(verifyExportCanaryRoundTrip(probe, JSON.stringify(probe))).toEqual({
      ok: true,
    });

    const altered = { ...probe, animalCount: 99 };
    const failed = verifyExportCanaryRoundTrip(probe, JSON.stringify(altered));
    expect(failed.ok).toBe(false);
    expect(failed.reason).toBeTruthy();

    const invalidJson = verifyExportCanaryRoundTrip(probe, '{corrupt');
    expect(invalidJson.ok).toBe(false);
  });
});

describe('Archived Herds bundle offload, Pedigree Stub preservation & restore', () => {
  it('retains a Pedigree Reference Stub only for ancestor-linked animals and removes unlinked ones cleanly', () => {
    const snap = makeRichSnapshot();
    const offloadIds = new Set(['arch-sire', 'arch-unlinked-sold']);
    const referenced = computePedigreeReferencedIds(snap.animals, offloadIds);
    expect(referenced.has('arch-sire')).toBe(true);
    expect(referenced.has('arch-unlinked-sold')).toBe(false);

    const built = buildArchivedAnimalsBundle(snap, ['arch-sire', 'arch-unlinked-sold']);
    expect(built.stubAnimalIds).toEqual(['arch-sire']);
    expect(built.removedAnimalIds).toEqual(['arch-unlinked-sold']);
    expect(built.indexEntry.animalCount).toBe(2);
    expect(built.indexEntry.photoCount).toBe(2);
    expect(built.indexEntry.careLogCount).toBe(1);

    // Active DB keeps the active daughter + stripped Pedigree Reference stub for Grand Sire
    expect(built.nextActiveSnapshot.animals.map((a) => a.id).sort()).toEqual([
      'active-doe',
      'arch-sire',
    ]);
    const stub = built.nextActiveSnapshot.animals.find((a) => a.id === 'arch-sire')!;
    expect(stub.offloadedArchiveKey).toBe(built.archiveKey);
    expect(stub.archived).toBe(true);
    // Active DB no longer carries photos or care logs for offloaded animals
    expect(built.nextActiveSnapshot.animalPhotos).toHaveLength(0);
    expect(built.nextActiveSnapshot.careLogs.map((l) => l.id)).toEqual(['log-active']);

    // Unpack archive ZIP and merge back to Active
    const unpacked = unpackArchivedAnimalBundle(built.zipBytes, snap.settings);
    expect(unpacked.animals).toHaveLength(2);
    expect(unpacked.animalPhotos).toHaveLength(2);
    expect(unpacked.careLogs).toHaveLength(1);

    const merged = mergeRestoredArchiveIntoSnapshot(built.nextActiveSnapshot, unpacked, {
      restoreToActiveStatus: true,
    });
    expect(merged.restoredAnimalCount).toBe(2);
    expect(merged.restoredPhotoCount).toBe(2);
    expect(merged.restoredCareLogCount).toBe(1);
    expect(merged.nextSnapshot.animals).toHaveLength(3);
    const restoredSire = merged.nextSnapshot.animals.find((a) => a.id === 'arch-sire')!;
    expect(restoredSire.offloadedArchiveKey).toBeUndefined();
    expect(restoredSire.status).toBe('Active');
    expect(restoredSire.archived).toBe(false);
    expect(merged.nextSnapshot.animalPhotos).toHaveLength(2);
    expect(merged.nextSnapshot.careLogs).toHaveLength(2);

    const rebuiltMeta = extractArchiveIndexMetadataOnly(built.zipBytes, built.fileName);
    expect(rebuiltMeta.archiveKey).toBe(built.indexEntry.archiveKey);
    expect(rebuiltMeta.animalCount).toBe(2);
    expect(rebuiltMeta.photoCount).toBe(2);
    expect(rebuiltMeta.careLogCount).toBe(1);
    expect(rebuiltMeta.checksumSha256).toBe(built.indexEntry.checksumSha256);
  });
});
```

## `src/core/__tests__/barnAlerts.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildSpeciesMemoSignature,
  buildTaskAlertGroupSignature,
  buildWithdrawalByAnimalMap,
  evaluateAnimalActiveWithdrawal,
  evaluateCageAssignmentCapacityWarning,
  evaluateCageOccupancy,
  evaluateShowWithdrawalConflicts,
  evaluateSpeciesActiveWithdrawalsAlert,
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesCagesOccupancy,
  evaluateSpeciesDueTasksAlert,
  evaluateSpeciesMemoReminderAlert,
  evaluateSpeciesNeedsAttentionAlert,
  evaluateWithdrawalDispositionWarning,
  formatArrivalTimingLabel,
  getGestationSoonWindowDays,
  isCageOccupyingAnimal,
  resolveCareLogWithdrawalClearDateIso,
} from '../barnAlerts';
import { BarnTask, BreedingRecord, CageLocation, CareLog } from '../models';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

function makeTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: `Task ${id}`,
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-11-15',
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeBreeding(id: string, overrides: Partial<BreedingRecord> = {}): BreedingRecord {
  return {
    id,
    species: 'Rabbit',
    sireId: 's1',
    damId: 'd1',
    sireName: 'Buck One',
    damName: 'Doe One',
    bredDateIso: '2026-10-16',
    expectedDueDateIso: '2026-11-16',
    actualBirthDateIso: '',
    projectedCoiPercent: 0,
    liveCount: 0,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 0,
    offspringCreated: false,
    status: 'Bred',
    notes: '',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('barnAlerts — per-species due/overdue task alerts and babies arriving soon', () => {
  it('detects due today and overdue tasks strictly per species while excluding completed and future tasks', () => {
    const tasks: BarnTask[] = [
      makeTask('overdue-1', { dueDateIso: '2026-11-12', title: 'Overdue Nestbox' }),
      makeTask('due-today', { dueDateIso: '2026-11-15', title: 'Due Kindling Check' }),
      makeTask('future', { dueDateIso: '2026-11-20', title: 'Future Chore' }),
      makeTask('done', { dueDateIso: '2026-11-10', completed: true }),
      makeTask('goat-task', { species: 'Goat', dueDateIso: '2026-11-10' }),
    ];

    const evalRabbit = evaluateSpeciesDueTasksAlert(tasks, 'Rabbit', {
      todayIso: '2026-11-15',
    });

    expect(evalRabbit.shouldShow).toBe(true);
    expect(evalRabbit.overdueCount).toBe(1);
    expect(evalRabbit.dueTodayCount).toBe(1);
    expect(evalRabbit.tasks.map((t) => t.id)).toEqual(['overdue-1', 'due-today']);
  });

  it('permanently suppresses ignored task IDs and clears current group without ignoring tasks when group signature matches', () => {
    const t1 = makeTask('t1', { dueDateIso: '2026-11-10' });
    const t2 = makeTask('t2', { dueDateIso: '2026-11-14' });
    const t3New = makeTask('t3', { dueDateIso: '2026-11-15' });

    // 1) Clearing current group signature hides the alert while keeping both tasks active
    const firstEval = evaluateSpeciesDueTasksAlert([t1, t2], 'Rabbit', {
      todayIso: '2026-11-15',
    });
    expect(firstEval.shouldShow).toBe(true);

    const clearedEval = evaluateSpeciesDueTasksAlert([t1, t2], 'Rabbit', {
      todayIso: '2026-11-15',
      clearedGroupSignature: firstEval.groupSignature,
    });
    expect(clearedEval.shouldShow).toBe(false);
    expect(clearedEval.tasks).toHaveLength(2);

    // 2) Adding a new due task changes the group signature, so alert automatically reappears
    const newGroupEval = evaluateSpeciesDueTasksAlert([t1, t2, t3New], 'Rabbit', {
      todayIso: '2026-11-15',
      clearedGroupSignature: firstEval.groupSignature,
    });
    expect(newGroupEval.shouldShow).toBe(true);
    expect(newGroupEval.groupSignature).not.toBe(buildTaskAlertGroupSignature([t1, t2]));

    // 3) Permanently ignoring specific overdue tasks removes them and clears alert if none remain
    const ignoredEval = evaluateSpeciesDueTasksAlert([t1, t2], 'Rabbit', {
      todayIso: '2026-11-15',
      ignoredTaskIds: new Set(['t1', 't2']),
    });
    expect(ignoredEval.shouldShow).toBe(false);
    expect(ignoredEval.tasks).toHaveLength(0);
  });

  it('evaluates babies about to arrive when gestation is nearly complete and excludes born/missed litters', () => {
    const rabbitProfile = makeSpeciesProfile('Rabbit'); // 31d gestation -> 5d window
    const goatProfile = makeSpeciesProfile('Goat'); // 150d gestation -> capped at 7d window

    expect(getGestationSoonWindowDays(rabbitProfile.gestationDays)).toBe(5);
    expect(getGestationSoonWindowDays(goatProfile.gestationDays)).toBe(7);
    expect(formatArrivalTimingLabel(0)).toBe('Due today');
    expect(formatArrivalTimingLabel(1)).toBe('Due tomorrow');
    expect(formatArrivalTimingLabel(3)).toBe('Due in 3 days');
    expect(formatArrivalTimingLabel(-2)).toBe('2 days past due date');

    const breedings: BreedingRecord[] = [
      makeBreeding('due-in-4', { expectedDueDateIso: '2026-11-19', damName: 'Clover' }),
      makeBreeding('due-tomorrow', {
        expectedDueDateIso: '2026-11-16',
        damName: 'Maple',
        status: 'Palpated Positive',
      }),
      makeBreeding('too-early', { expectedDueDateIso: '2026-11-28', damName: 'Future Doe' }),
      makeBreeding('already-born', {
        expectedDueDateIso: '2026-11-16',
        status: 'Born',
        damName: 'Born Doe',
      }),
      makeBreeding('missed', {
        expectedDueDateIso: '2026-11-16',
        status: 'Missed',
        damName: 'Missed Doe',
      }),
      makeBreeding('too-old-overdue', {
        expectedDueDateIso: '2026-11-01',
        damName: 'Stale Breeding',
      }),
    ];

    const res = evaluateSpeciesArrivingBabiesAlert(breedings, rabbitProfile, {
      todayIso: '2026-11-15',
    });

    expect(res.shouldShow).toBe(true);
    expect(res.offspringPluralLabel).toBe('Kits');
    expect(res.items.map((i) => i.breeding.damName)).toEqual(['Maple', 'Clover']);
    expect(res.items[0].timingLabel).toBe('Due tomorrow');
    expect(res.items[1].timingLabel).toBe('Due in 4 days');
  });

  it('evaluates per-species Needs Attention animals cleanly and clears when resolved', () => {
    const animals = [
      makeAnimal('r1', { name: 'Zebra Buck', species: 'Rabbit', needsAttention: true }),
      makeAnimal('r2', { name: 'Alpha Buck', species: 'Rabbit', needsAttention: true }),
      makeAnimal('r3', { name: 'Resolved Doe', species: 'Rabbit', needsAttention: false }),
      makeAnimal('g1', { name: 'Outside Buck', species: 'Goat', needsAttention: true }),
    ];

    const rabbitRes = evaluateSpeciesNeedsAttentionAlert(animals, 'Rabbit');
    expect(rabbitRes.shouldShow).toBe(true);
    expect(rabbitRes.animals.map((a) => a.name)).toEqual(['Alpha Buck', 'Zebra Buck']);

    const clearedRes = evaluateSpeciesNeedsAttentionAlert(
      animals.map((a) => ({ ...a, needsAttention: false })),
      'Rabbit'
    );
    expect(clearedRes.shouldShow).toBe(false);
    expect(clearedRes.animals).toHaveLength(0);
  });

  it('shows subtle memo pad reminder when memo has non-whitespace text, allows closing, and returns when edited', () => {
    const emptyEval = evaluateSpeciesMemoReminderAlert({ memoText: '   \n\t  ', memoUpdatedAt: '' });
    expect(emptyEval.hasMemo).toBe(false);
    expect(emptyEval.shouldShow).toBe(false);
    expect(emptyEval.signature).toBe('');

    const initialProfile = {
      ...makeSpeciesProfile('Rabbit'),
      memoText: '# Spring Notes\n- [ ] Weigh kits on Sunday',
      memoUpdatedAt: '2026-11-15T10:00:00.000Z',
    };
    const firstEval = evaluateSpeciesMemoReminderAlert(initialProfile);
    expect(firstEval.hasMemo).toBe(true);
    expect(firstEval.shouldShow).toBe(true);
    expect(firstEval.previewText).toBe('Spring Notes');
    expect(firstEval.signature).toBe(
      buildSpeciesMemoSignature(initialProfile.memoText, initialProfile.memoUpdatedAt)
    );

    // Dismissing with the matching signature hides the reminder
    const dismissedEval = evaluateSpeciesMemoReminderAlert(initialProfile, {
      dismissedSignature: firstEval.signature,
    });
    expect(dismissedEval.hasMemo).toBe(true);
    expect(dismissedEval.shouldShow).toBe(false);

    // Editing the memo pad text (or timestamp) changes the signature so the notice returns
    const editedByTextEval = evaluateSpeciesMemoReminderAlert(
      {
        memoText: '# Spring Notes\n- [ ] Weigh kits on Sunday\n- Check nestbox',
        memoUpdatedAt: '2026-11-15T10:00:00.000Z',
      },
      { dismissedSignature: firstEval.signature }
    );
    expect(editedByTextEval.shouldShow).toBe(true);
    expect(editedByTextEval.signature).not.toBe(firstEval.signature);

    const editedTimestampOnlyEval = evaluateSpeciesMemoReminderAlert(
      {
        memoText: initialProfile.memoText,
        memoUpdatedAt: '2026-11-16T08:30:00.000Z',
      },
      { dismissedSignature: firstEval.signature }
    );
    expect(editedTimestampOnlyEval.shouldShow).toBe(true);
    expect(editedTimestampOnlyEval.signature).not.toBe(firstEval.signature);
  });
});

function makeHealthLog(id: string, animalId: string, overrides: Partial<CareLog> = {}): CareLog {
  return {
    id,
    species: 'Rabbit',
    animalId,
    dateIso: '2026-11-10',
    type: 'Health / Vet',
    title: 'Vet Treatment',
    weightGrams: 0,
    showLegEarned: false,
    medicationName: 'Ivermectin',
    dosage: '0.2 mL',
    administrationRoute: 'SubQ',
    withdrawalDays: 14,
    withdrawalClearDateIso: '2026-11-24',
    notes: '',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('barnAlerts — active medication withdrawal countdowns & safety warnings', () => {
  it('resolves clear dates via explicit ISO or fallback dateIso + withdrawalDays and clears on the clear date itself', () => {
    const fallbackLog = makeHealthLog('l-fallback', 'a1', {
      dateIso: '2026-11-10',
      withdrawalDays: 10,
      withdrawalClearDateIso: '',
    });
    expect(resolveCareLogWithdrawalClearDateIso(fallbackLog)).toBe('2026-11-20');

    // Day before clear date -> active (1d left)
    const activeDayBefore = evaluateAnimalActiveWithdrawal([fallbackLog], 'a1', {
      todayIso: '2026-11-19',
    });
    expect(activeDayBefore.isActive).toBe(true);
    expect(activeDayBefore.clearDateIso).toBe('2026-11-20');
    expect(activeDayBefore.daysRemaining).toBe(1);
    expect(activeDayBefore.shortCountdownLabel).toBe('1d left');
    expect(activeDayBefore.countdownLabel).toBe('1 day remaining');

    // On the clear date itself -> cleared!
    const clearedOnDate = evaluateAnimalActiveWithdrawal([fallbackLog], 'a1', {
      todayIso: '2026-11-20',
    });
    expect(clearedOnDate.isActive).toBe(false);
    expect(clearedOnDate.daysRemaining).toBe(0);
    expect(clearedOnDate.activeLogs).toHaveLength(0);
  });

  it('picks the furthest clear date and deduplicates medications across overlapping logs', () => {
    const logs: CareLog[] = [
      makeHealthLog('l1', 'a1', {
        medicationName: 'Penicillin G',
        withdrawalClearDateIso: '2026-11-22',
      }),
      makeHealthLog('l2', 'a1', {
        medicationName: 'Ivermectin',
        withdrawalClearDateIso: '2026-11-29',
      }),
      makeHealthLog('l3', 'a1', {
        medicationName: 'Penicillin G',
        withdrawalClearDateIso: '2026-11-25',
      }),
    ];

    const byAnimal = buildWithdrawalByAnimalMap(logs, { todayIso: '2026-11-18' });
    const evalA1 = byAnimal.get('a1');
    expect(evalA1?.isActive).toBe(true);
    expect(evalA1?.clearDateIso).toBe('2026-11-29');
    expect(evalA1?.daysRemaining).toBe(11);
    expect(evalA1?.shortCountdownLabel).toBe('11d left');
    expect(evalA1?.medicationSummary).toBe('Ivermectin, Penicillin G');
  });

  it('evaluates per-species withdrawal alerts, excludes Deceased/Sold/Archived stock, and honors session dismissal', () => {
    const animals = [
      makeAnimal('r-active', { name: 'Clover', species: 'Rabbit', status: 'Active' }),
      makeAnimal('r-culled', { name: 'Bramble', species: 'Rabbit', status: 'Active', culled: true }),
      makeAnimal('r-sold', { name: 'Sold Doe', species: 'Rabbit', status: 'Sold', archived: true }),
      makeAnimal('r-dead', { name: 'Deceased Buck', species: 'Rabbit', status: 'Deceased', archived: true }),
      makeAnimal('g-active', { name: 'Goat Kid', species: 'Goat', status: 'Active' }),
    ];
    const logs: CareLog[] = [
      makeHealthLog('log-clover', 'r-active', { withdrawalClearDateIso: '2026-11-25' }),
      makeHealthLog('log-bramble', 'r-culled', { withdrawalClearDateIso: '2026-11-21' }),
      makeHealthLog('log-sold', 'r-sold', { withdrawalClearDateIso: '2026-11-28' }),
      makeHealthLog('log-dead', 'r-dead', { withdrawalClearDateIso: '2026-11-28' }),
      makeHealthLog('log-goat', 'g-active', { species: 'Goat', withdrawalClearDateIso: '2026-11-24' }),
    ];

    const byAnimal = buildWithdrawalByAnimalMap(logs, { todayIso: '2026-11-18' });
    const rabbitAlert = evaluateSpeciesActiveWithdrawalsAlert(animals, logs, 'Rabbit', {
      todayIso: '2026-11-18',
      withdrawalByAnimalId: byAnimal,
    });
    expect(rabbitAlert.shouldShow).toBe(true);
    expect(rabbitAlert.items.map((item) => item.animal.name)).toEqual(['Bramble', 'Clover']);
    expect(rabbitAlert.items[0].evaluation.daysRemaining).toBe(3);
    expect(rabbitAlert.items[1].evaluation.daysRemaining).toBe(7);

    // Dismissed for the current session hides shouldShow while keeping items inspected
    const dismissedAlert = evaluateSpeciesActiveWithdrawalsAlert(animals, logs, 'Rabbit', {
      todayIso: '2026-11-18',
      withdrawalByAnimalId: byAnimal,
      dismissedSpeciesKeys: new Set(['rabbit']),
    });
    expect(dismissedAlert.items).toHaveLength(2);
    expect(dismissedAlert.shouldShow).toBe(false);
  });

  it('triggers disposition soft confirmation only on Sold and Flagged for Cull', () => {
    const logs = [makeHealthLog('l1', 'a1', { withdrawalClearDateIso: '2026-11-24' })];
    const evalActive = evaluateAnimalActiveWithdrawal(logs, 'a1', { todayIso: '2026-11-18' });

    expect(
      evaluateWithdrawalDispositionWarning(evalActive, {
        animalName: 'Clover',
        isNewlySold: false,
        isNewlyCulled: false,
      })
    ).toBeNull();

    const soldWarning = evaluateWithdrawalDispositionWarning(evalActive, {
      animalName: 'Clover',
      isNewlySold: true,
      isNewlyCulled: false,
    });
    expect(soldWarning?.reasons).toEqual(['Sold']);
    expect(soldWarning?.detail).toContain('Ivermectin');
    expect(soldWarning?.detail).toContain('6 days remaining');

    const cullWarning = evaluateWithdrawalDispositionWarning(evalActive, {
      animalName: 'Clover',
      isNewlySold: false,
      isNewlyCulled: true,
    });
    expect(cullWarning?.reasons).toEqual(['Flagged for Cull']);
  });

  it('warns on Show entry when withdrawal overlaps the show event date and clears on the clear date itself', () => {
    const animals = [
      makeAnimal('a1', { name: 'Clover', species: 'Rabbit' }),
      makeAnimal('a2', { name: 'Maple', species: 'Rabbit' }),
    ];
    const logs = [
      makeHealthLog('l1', 'a1', { withdrawalClearDateIso: '2026-11-24' }),
      makeHealthLog('l2', 'a2', { withdrawalClearDateIso: '2026-11-20' }),
    ];

    // Show on Nov 23 -> a1 overlaps (clears Nov 24), a2 already cleared (Nov 20)
    const conflictEval = evaluateShowWithdrawalConflicts(animals, ['a1', 'a2'], logs, '2026-11-23');
    expect(conflictEval.hasConflict).toBe(true);
    expect(conflictEval.conflicts.map((c) => c.animal.name)).toEqual(['Clover']);

    // Show on Nov 24 (the exact clear date) -> cleared!
    const clearDayShow = evaluateShowWithdrawalConflicts(animals, ['a1', 'a2'], logs, '2026-11-24');
    expect(clearDayShow.hasConflict).toBe(false);
    expect(clearDayShow.conflicts).toHaveLength(0);
  });
});

function makeCage(id: string, overrides: Partial<CageLocation> = {}): CageLocation {
  return {
    id,
    species: 'Rabbit',
    label: `Hutch ${id}`,
    section: 'Row A',
    capacity: 2,
    notes: '',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('barnAlerts — cage / pen occupancy & capacity welfare warnings', () => {
  it('counts only Active, Junior, and unarchived Retired animals as occupants with species & trimmed label matching', () => {
    const cageR1 = makeCage('r1', { label: 'Hutch R-01', capacity: 2 });
    const cageR2 = makeCage('r2', { label: 'Hutch R-02', capacity: 2 });
    const cageR3 = makeCage('r3', { label: 'Hutch R-03', capacity: 2 });
    const cageGoat = makeCage('g1', { species: 'Goat', label: 'Hutch R-01', capacity: 2 });

    const animals = [
      // R-01: 3 occupants vs capacity 2 -> 3/2 over capacity
      makeAnimal('a1', { name: 'Clover', cageLocation: ' hutch r-01 ', status: 'Active' }),
      makeAnimal('a2', { name: 'Maple', cageLocation: 'HUTCH R-01', status: 'Junior' }),
      makeAnimal('a3', { name: 'Bramble', cageLocation: 'Hutch R-01', status: 'Retired' }),
      // Excluded non-occupants in R-01:
      makeAnimal('a4', { name: 'Sold Doe', cageLocation: 'Hutch R-01', status: 'Sold' }),
      makeAnimal('a5', { name: 'Dead Buck', cageLocation: 'Hutch R-01', status: 'Deceased' }),
      makeAnimal('a6', { name: 'Archived Doe', cageLocation: 'Hutch R-01', status: 'Archived' }),
      makeAnimal('a7', {
        name: 'Flagged Archived',
        cageLocation: 'Hutch R-01',
        status: 'Active',
        archived: true,
      }),
      makeAnimal('a8', {
        name: 'Offloaded Stub',
        cageLocation: 'Hutch R-01',
        status: 'Retired',
        offloadedArchiveKey: 'a8.archive.zip',
      }),
      // Different species sharing label must not leak into Rabbit cage
      makeAnimal('g1-kid', { species: 'Goat', name: 'Kid', cageLocation: 'Hutch R-01', status: 'Active' }),
      // R-02: 2/2 full
      makeAnimal('b1', { name: 'Oak', cageLocation: 'Hutch R-02', status: 'Active' }),
      makeAnimal('b2', { name: 'Pine', cageLocation: 'Hutch R-02', status: 'Active' }),
      // R-03: 0/2 empty
    ];

    expect(isCageOccupyingAnimal(animals[0])).toBe(true);
    expect(isCageOccupyingAnimal(animals[3])).toBe(false);
    expect(isCageOccupyingAnimal(animals[7])).toBe(false);

    const singleEval = evaluateCageOccupancy(cageR1, animals);
    expect(singleEval.occupantCount).toBe(3);
    expect(singleEval.status).toBe('over_capacity');
    expect(singleEval.isOverCapacity).toBe(true);
    expect(singleEval.overBy).toBe(1);
    expect(singleEval.ratioLabel).toBe('3/2 over capacity');
    expect(singleEval.occupants.map((a) => a.name)).toEqual(['Bramble', 'Clover', 'Maple']);

    const summary = evaluateSpeciesCagesOccupancy([cageR1, cageR2, cageR3, cageGoat], animals, 'Rabbit');
    expect(summary.evaluations).toHaveLength(3);
    expect(summary.shouldShowOverCapacityAlert).toBe(true);
    expect(summary.totalOverCapacityCount).toBe(1);
    expect(summary.overCapacityExtraAnimalsCount).toBe(1);
    expect(summary.byCageId.get('r2')?.status).toBe('full');
    expect(summary.byCageId.get('r2')?.ratioLabel).toBe('2/2 full');
    expect(summary.byCageId.get('r3')?.status).toBe('empty');
    expect(summary.byCageId.get('r3')?.ratioLabel).toBe('0/2');
  });

  it('triggers assignment capacity warning only when newly exceeding CageLocation.capacity', () => {
    const cage = makeCage('c1', { label: 'Pen A', capacity: 2 });
    const animals = [
      makeAnimal('a1', { name: 'Alpha', cageLocation: 'Pen A', status: 'Active' }),
      makeAnimal('a2', { name: 'Bravo', cageLocation: 'Pen A', status: 'Active' }),
      makeAnimal('a3', { name: 'Charlie', cageLocation: '', status: 'Active' }),
      makeAnimal('a4', { name: 'Delta', cageLocation: 'Pen A', status: 'Sold' }),
    ];

    // 1) Assigning into open 1/2 cage -> null (reaches 2/2 exact capacity, not exceeding)
    expect(
      evaluateCageAssignmentCapacityWarning({
        targetCageLabel: 'Pen A',
        cages: [cage],
        animals: [animals[0], animals[2]],
        speciesName: 'Rabbit',
        animalId: 'a3',
        animalName: 'Charlie',
        wasAlreadyOccupyingTargetCage: false,
        willOccupyAfterSave: true,
      })
    ).toBeNull();

    // 2) Assigning a 3rd active animal into 2/2 full Pen A -> wouldExceed: true (3/2)
    const exceedWarn = evaluateCageAssignmentCapacityWarning({
      targetCageLabel: 'Pen A',
      cages: [cage],
      animals,
      speciesName: 'Rabbit',
      animalId: 'a3',
      animalName: 'Charlie',
      wasAlreadyOccupyingTargetCage: false,
      willOccupyAfterSave: true,
    });
    expect(exceedWarn).not.toBeNull();
    expect(exceedWarn?.wouldExceed).toBe(true);
    expect(exceedWarn?.projectedOccupantCount).toBe(3);
    expect(exceedWarn?.overBy).toBe(1);
    expect(exceedWarn?.headline).toContain('3/2 over capacity');

    // 3) Reactivating a Sold animal already labeled with Pen A when Pen A already has 2 active animals -> wouldExceed: true
    const reactivateWarn = evaluateCageAssignmentCapacityWarning({
      targetCageLabel: 'Pen A',
      cages: [cage],
      animals,
      speciesName: 'Rabbit',
      animalId: 'a4',
      animalName: 'Delta',
      wasAlreadyOccupyingTargetCage: false,
      willOccupyAfterSave: true,
    });
    expect(reactivateWarn?.wouldExceed).toBe(true);
    expect(reactivateWarn?.projectedOccupantCount).toBe(3);

    // 4) Editing an animal already occupying an over-capacity cage without moving -> passive (wouldExceed: false)
    const overAnimals = [...animals.slice(0, 2), { ...animals[2], cageLocation: 'Pen A' }];
    const passiveWarn = evaluateCageAssignmentCapacityWarning({
      targetCageLabel: 'Pen A',
      cages: [cage],
      animals: overAnimals,
      speciesName: 'Rabbit',
      animalId: 'a1',
      animalName: 'Alpha',
      wasAlreadyOccupyingTargetCage: true,
      willOccupyAfterSave: true,
    });
    expect(passiveWarn?.wouldExceed).toBe(false);
    expect(passiveWarn?.alreadyOverCapacity).toBe(true);

    // 5) Retiring / marking Sold inside full cage or using unregistered free-text cage -> null
    expect(
      evaluateCageAssignmentCapacityWarning({
        targetCageLabel: 'Pen A',
        cages: [cage],
        animals,
        speciesName: 'Rabbit',
        animalId: 'a3',
        animalName: 'Charlie',
        wasAlreadyOccupyingTargetCage: false,
        willOccupyAfterSave: false,
      })
    ).toBeNull();

    expect(
      evaluateCageAssignmentCapacityWarning({
        targetCageLabel: 'Unregistered Pasture',
        cages: [cage],
        animals,
        speciesName: 'Rabbit',
        animalId: 'a3',
        animalName: 'Charlie',
      })
    ).toBeNull();
  });
});


```

## `src/core/__tests__/barnBench.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  BARN_BENCH_SECTION_ALL,
  BARN_BENCH_SECTION_UNASSIGNED,
  buildBarnBenchCommitPlan,
  buildBarnBenchQueue,
  extractSpeciesCageSections,
  findNextBarnBenchIndex,
} from '../barnBench';
import { CageLocation, CareLog } from '../models';
import { makeAnimal } from './testFixtures';

const TS = '2026-06-15T14:30:00.000Z';

function makeCage(id: string, overrides: Partial<CageLocation> = {}): CageLocation {
  return {
    id,
    species: 'Rabbit',
    label: id,
    section: 'Row A',
    capacity: 1,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeCareLog(id: string, overrides: Partial<CareLog> = {}): CareLog {
  return {
    id,
    species: 'Rabbit',
    animalId: 'a1',
    dateIso: '2026-06-01',
    type: 'Weight Check',
    title: 'Weight Check',
    weightGrams: 0,
    showLegEarned: false,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('barnBench — Fast Sequential Batch Entry Engine', () => {
  it('extracts deduplicated, species-isolated cage sections in natural numeric order', () => {
    const cages: CageLocation[] = [
      makeCage('c1', { species: 'Rabbit', label: 'R-10', section: 'Row 10' }),
      makeCage('c2', { species: 'Rabbit', label: 'R-2', section: 'Row 2' }),
      makeCage('c3', { species: 'Rabbit', label: 'R-3', section: 'row 2' }),
      makeCage('c4', { species: 'Rabbit', label: 'R-4', section: '   ' }),
      makeCage('c5', { species: 'Goat', label: 'P-1', section: 'Pasture 1' }),
    ];

    expect(extractSpeciesCageSections(cages, 'Rabbit')).toEqual(['Row 2', 'Row 10']);
    expect(extractSpeciesCageSections(cages, 'Goat')).toEqual(['Pasture 1']);
  });

  it('builds a strictly species-isolated, naturally ordered cage walkthrough queue with latest BCS & nail trim dates', () => {
    const cages: CageLocation[] = [
      makeCage('c1', { species: 'Rabbit', label: 'Hutch R-2', section: 'Row A' }),
      makeCage('c2', { species: 'Rabbit', label: 'Hutch R-10', section: 'Row A' }),
      makeCage('c3', { species: 'Rabbit', label: 'Hutch B-1', section: 'Row B' }),
    ];

    const animals = [
      makeAnimal('a-r10', { name: 'Bramble', cageLocation: 'Hutch R-10', status: 'Active' }),
      makeAnimal('a-r2', { name: 'Clover', cageLocation: 'Hutch R-2', status: 'Active' }),
      makeAnimal('a-b1', { name: 'Thistle', cageLocation: 'Hutch B-1', status: 'Junior' }),
      makeAnimal('a-other', { name: 'Fern', cageLocation: 'Temp Carrier', status: 'Active' }),
      makeAnimal('a-unassigned', { name: 'Moss', cageLocation: '', status: 'Active' }),
      makeAnimal('a-sold', { name: 'Sold Bunny', cageLocation: 'Hutch R-2', status: 'Sold' }),
      makeAnimal('a-archived', {
        name: 'Archived Bunny',
        cageLocation: 'Hutch R-2',
        status: 'Active',
        archived: true,
      }),
      makeAnimal('a-stub', {
        name: 'Offloaded Stub',
        cageLocation: 'Hutch R-2',
        status: 'Active',
        offloadedArchiveKey: 'archive-1',
      }),
      makeAnimal('g-1', { species: 'Goat', name: 'Billy', cageLocation: 'Hutch R-2', status: 'Active' }),
    ];

    const careLogs: CareLog[] = [
      makeCareLog('l1', {
        animalId: 'a-r2',
        dateIso: '2026-05-01',
        type: 'Health Score / BCS',
        bodyConditionScore: 3,
      }),
      makeCareLog('l2', {
        animalId: 'a-r2',
        dateIso: '2026-06-10',
        type: 'Health Score / BCS',
        bodyConditionScore: 3.5,
      }),
      makeCareLog('l3', {
        animalId: 'a-r2',
        dateIso: '2026-05-20',
        type: 'Grooming & Hoof',
        title: 'Nail Trim',
      }),
      makeCareLog('l4', {
        animalId: 'a-r2',
        dateIso: '2026-06-12',
        type: 'Grooming & Hoof',
        title: 'Nail Trim',
      }),
      // Cross-species log must be ignored
      makeCareLog('l5', {
        species: 'Goat',
        animalId: 'a-r2',
        dateIso: '2026-06-14',
        type: 'Health Score / BCS',
        bodyConditionScore: 5,
      }),
    ];

    const queue = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', sectionFilter: BARN_BENCH_SECTION_ALL },
    });

    // Natural walkthrough order: Row A (R-2 before R-10) -> Row B -> Other Cages -> Unassigned
    expect(queue.map((r) => r.animal.id)).toEqual([
      'a-r2',
      'a-r10',
      'a-b1',
      'a-other',
      'a-unassigned',
    ]);
    expect(queue[0].latestBcs).toBe(3.5);
    expect(queue[0].latestBcsDateIso).toBe('2026-06-10');
    expect(queue[0].latestNailTrimDateIso).toBe('2026-06-12');
    expect(queue[3].sectionLabel).toBe('Other Cages');
    expect(queue[4].sectionLabel).toBe('Unassigned');
    expect(queue[4].hasAssignedCage).toBe(false);

    // Filter by section
    const rowAOnly = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', sectionFilter: 'Row A' },
    });
    expect(rowAOnly.map((r) => r.animal.id)).toEqual(['a-r2', 'a-r10']);

    // Filter by unassigned
    const unassignedOnly = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', sectionFilter: BARN_BENCH_SECTION_UNASSIGNED },
    });
    expect(unassignedOnly.map((r) => r.animal.id)).toEqual(['a-unassigned']);

    // Filter by junior_only
    const juniorsOnly = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', statusFilter: 'junior_only' },
    });
    expect(juniorsOnly.map((r) => r.animal.id)).toEqual(['a-b1']);

    // Search query matching cage label
    const searched = buildBarnBenchQueue({
      animals,
      cages,
      careLogs,
      options: { speciesName: 'Rabbit', searchQuery: 'r-10' },
    });
    expect(searched.map((r) => r.animal.id)).toEqual(['a-r10']);
  });

  it('builds atomic CareLogs and a single _rev-bumped Animal patch for combined bench entries', () => {
    const animal = makeAnimal('a1', {
      name: 'Clover',
      weightGrams: 4000,
      cageLocation: 'R-1',
      _rev: 3,
    });

    const plan = buildBarnBenchCommitPlan(
      animal,
      {
        animalId: 'a1',
        dateIso: '2026-06-15',
        weightGrams: 4250.4,
        bodyConditionScore: 3.5,
        nailTrimDone: true,
        targetCageLocation: 'R-4',
        notes: 'Good coat condition',
      },
      TS
    );

    expect(plan.hasChanges).toBe(true);
    expect(plan.careLogs).toHaveLength(3);
    expect(plan.careLogs.map((l) => l.type)).toEqual([
      'Weight Check',
      'Health Score / BCS',
      'Grooming & Hoof',
    ]);
    expect(plan.careLogs[0].weightGrams).toBe(4250);
    expect(plan.careLogs[1].bodyConditionScore).toBe(3.5);
    expect(plan.careLogs.every((l) => l.dateIso === '2026-06-15' && l.notes === 'Good coat condition')).toBe(
      true
    );
    expect(plan.updatedAnimal).not.toBeNull();
    expect(plan.updatedAnimal?.weightGrams).toBe(4250);
    expect(plan.updatedAnimal?.cageLocation).toBe('R-4');
    expect(plan.updatedAnimal?._rev).toBe(4);
    expect(plan.updatedAnimal?.updatedAt).toBe(TS);
    expect(plan.summaryParts).toEqual(['Weight', 'BCS 3.5', 'Nail Trim', 'Moved → R-4']);
  });

  it('handles standalone notes, cage-only moves, unchanged-weight re-logs, and offloaded stubs safely', () => {
    const animal = makeAnimal('a1', { weightGrams: 4000, cageLocation: 'R-1', _rev: 2 });

    // Standalone note creates a Journal Note without patching animal
    const noteOnly = buildBarnBenchCommitPlan(
      animal,
      { animalId: 'a1', dateIso: '2026-06-15', notes: 'Slight molt on flanks' },
      TS
    );
    expect(noteOnly.hasChanges).toBe(true);
    expect(noteOnly.careLogs).toHaveLength(1);
    expect(noteOnly.careLogs[0].type).toBe('Journal Note');
    expect(noteOnly.updatedAnimal).toBeNull();

    // Unassigning cage updates animal without creating empty care logs
    const unassign = buildBarnBenchCommitPlan(
      animal,
      { animalId: 'a1', dateIso: '2026-06-15', targetCageLocation: '' },
      TS
    );
    expect(unassign.hasChanges).toBe(true);
    expect(unassign.careLogs).toHaveLength(0);
    expect(unassign.updatedAnimal?.cageLocation).toBe('');
    expect(unassign.updatedAnimal?._rev).toBe(3);
    expect(unassign.summaryParts).toEqual(['Unassigned Cage']);

    // Logging identical weight creates Weight Check CareLog without redundant Animal patch
    const sameWeight = buildBarnBenchCommitPlan(
      animal,
      { animalId: 'a1', dateIso: '2026-06-15', weightGrams: 4000 },
      TS
    );
    expect(sameWeight.hasChanges).toBe(true);
    expect(sameWeight.careLogs).toHaveLength(1);
    expect(sameWeight.updatedAnimal).toBeNull();

    // Offloaded archive stubs produce no changes
    const stub = makeAnimal('a-stub', { offloadedArchiveKey: 'arc-1' });
    const stubPlan = buildBarnBenchCommitPlan(
      stub,
      { animalId: 'a-stub', weightGrams: 4500, nailTrimDone: true },
      TS
    );
    expect(stubPlan.hasChanges).toBe(false);
    expect(stubPlan.careLogs).toHaveLength(0);
    expect(stubPlan.updatedAnimal).toBeNull();
  });

  it('advances smoothly to the next unlogged bench index and wraps cleanly when tail rows are logged', () => {
    const queue = buildBarnBenchQueue({
      animals: [
        makeAnimal('a1', { name: 'Alpha', cageLocation: 'R-1' }),
        makeAnimal('a2', { name: 'Beta', cageLocation: 'R-2' }),
        makeAnimal('a3', { name: 'Gamma', cageLocation: 'R-3' }),
        makeAnimal('a4', { name: 'Delta', cageLocation: 'R-4' }),
      ],
      cages: [],
      careLogs: [],
      options: { speciesName: 'Rabbit' },
    });

    // Skip already logged a2, jump to a3 (index 2)
    expect(
      findNextBarnBenchIndex({
        queue,
        currentIndex: 0,
        loggedAnimalIds: new Set(['a1', 'a2']),
        preferUnlogged: true,
      })
    ).toBe(2);

    // Tail rows logged -> wraps around to earlier unlogged row a1 (index 0)
    expect(
      findNextBarnBenchIndex({
        queue,
        currentIndex: 2,
        loggedAnimalIds: new Set(['a3', 'a4']),
        preferUnlogged: true,
      })
    ).toBe(0);

    // All rows logged -> steps forward sequentially clamped at end
    expect(
      findNextBarnBenchIndex({
        queue,
        currentIndex: 2,
        loggedAnimalIds: new Set(['a1', 'a2', 'a3', 'a4']),
        preferUnlogged: true,
      })
    ).toBe(3);

    // Empty queue returns 0 safely
    expect(
      findNextBarnBenchIndex({
        queue: [],
        currentIndex: 0,
        loggedAnimalIds: new Set(),
      })
    ).toBe(0);
  });
});
```

## `src/core/__tests__/barnBinder.test.ts`

```typescript
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCompleteBackupZipArchive, parseBackupArchiveInput } from '../backupArchive';
import {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  computeAnimalKinshipSummary,
  generateSpeciesBarnBinderHtml,
  resolveBinderPalette,
} from '../barnBinder';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('barnBinder — printable human-readable species binders & automatic ZIP inclusion', () => {
  it('enforces pure white #ffffff paper backgrounds even when Barn is in dark mode with custom Color Picker accents', () => {
    const paletteColor = resolveBinderPalette('color', {
      lightPrimary: '#9E3D22',
      lightAccent: '#6E4B26',
      lightMale: '#35607A',
      darkCanvas: '#0F1611',
      darkSurface: '#172219',
    });
    expect(paletteColor.paperBg).toBe('#FFFFFF');
    expect(paletteColor.primary).toBe('#9E3D22');
    expect(paletteColor.accent).toBe('#6E4B26');
    expect(paletteColor.male).toBe('#35607A');

    // Very light pastel Color Picker picks get automatically darkened for print legibility
    const pastelContrast = resolveBinderPalette('color', {
      lightPrimary: '#FFFFAA',
    });
    expect(pastelContrast.primary).not.toBe('#FFFFAA');

    const inkSaver = resolveBinderPalette('ink_saver', {
      lightPrimary: '#9E3D22',
    });
    expect(inkSaver.paperBg).toBe('#FFFFFF');
    expect(inkSaver.primary).toBe('#000000');

    const snap = makeEmptySnapshot({
      settings: makeSettings({
        themeMode: 'dark',
        customColors: {
          lightPrimary: '#9E3D22',
          lightAccent: '#6E4B26',
          lightMale: '#35607A',
          darkCanvas: '#0F1611',
          darkSurface: '#172219',
        },
      }),
      animals: [makeAnimal('r1', { name: 'Copper King', species: 'Rabbit', sex: 'Male' })],
    });

    const html = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { colorMode: 'color' });
    expect(html).toContain('<meta name="color-scheme" content="light only" />');
    expect(html).toContain('<meta name="barn-preserve-accent-ink" content="true" />');
    expect(html).toContain('background: #ffffff;');
    expect(html).not.toContain('#0F1611');
    expect(html).not.toContain('#172219');

    const inkHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { colorMode: 'ink_saver' });
    expect(inkHtml).not.toContain('barn-preserve-accent-ink');
    expect(inkHtml).toContain('Ink Saver Monochrome');
  });

  it('inherits unset species preferences (weight unit, generations, barn & breeder names) from global BarnSettings', () => {
    const rabbitProfile = makeSpeciesProfile('Rabbit');
    rabbitProfile.preferredUnit = undefined;
    const snap = makeEmptySnapshot({
      settings: makeSettings({
        barnName: 'Cedar Ridge Barn',
        breederName: 'Kimberly B.',
        preferredUnit: 'kg',
        defaultGenerations: 4,
      }),
      speciesProfiles: [rabbitProfile],
      animals: [makeAnimal('r1', { name: 'Maple Star', species: 'Rabbit', weightGrams: 4500 })],
    });

    const defaults = buildDefaultBarnBinderOptions(snap.settings);
    expect(defaults.generations).toBe(4);
    expect(defaults.includeArchived).toBe(false);

    const html = generateSpeciesBarnBinderHtml(snap, 'Rabbit', defaults);
    expect(html).toContain('Cedar Ridge Barn');
    expect(html).toContain('Kimberly B.');
    expect(html).toContain('Kilograms (kg)');
    expect(html).toContain('inherited from Barn Settings');
    expect(html).toContain('4.50 kg');
    expect(html).toContain('4 Generations (inherited default)');
    expect(html).toContain('Breeder Truthfulness Acknowledgment &amp; Herd Transfer Certification');

    expect(buildBarnBinderFileName('Cedar Ridge Barn', 'Rabbit', '2026-11-16')).toBe(
      'cedar-ridge-barn-rabbit-binder-2026-11-16.htm'
    );
  });

  it('renders active-only by default while preserving full lineage, noteworthy archived/deceased relatives, medical logs, litters, shows, reg #, photos & remaining notes', () => {
    const gcGrandsire = makeAnimal('gs1', {
      name: 'Grand Legend',
      tattoo: 'GL-1',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Deceased',
      archived: true,
      grandChampionNumber: 'GC-9942',
      legsCount: 5,
    });
    const sire = makeAnimal('s1', {
      name: 'Red Baron',
      tattoo: 'RB-10',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Sold',
      archived: true,
      sireId: 'gs1',
      legsCount: 3,
      registrationNumber: 'REG-S100',
    });
    const dam = makeAnimal('d1', {
      name: 'Autumn Blossom',
      tattoo: 'AB-22',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Active',
    });
    const subject = makeAnimal('sub1', {
      name: 'Ruby Horizon',
      tattoo: 'RH-301',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Active',
      sireId: 's1',
      damId: 'd1',
      registrationNumber: 'REG-RH-8899',
      grandChampionNumber: 'GC-2026',
      legsCount: 4,
      genotype: [
        { locus: 'A', allele1: 'A', allele2: 'a' },
        { locus: 'E', allele1: 'e', allele2: 'e' },
      ],
      genotypeRaw: 'Aa B_ C_ D_ ee',
      notes: 'Calm mother, broad hindquarters, sensitive to sudden feed switch.',
    });
    const activeKit = makeAnimal('k1', {
      name: 'Copper Pebble',
      tattoo: 'CP-401',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Junior',
      sireId: 'gs1',
      damId: 'sub1',
      legsCount: 1,
    });
    const soldKit = makeAnimal('k2', {
      name: 'Crimson Flash',
      tattoo: 'CF-402',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Sold',
      archived: true,
      sireId: 'gs1',
      damId: 'sub1',
      grandChampionNumber: 'GC-7711',
      legsCount: 4,
    });
    const halfSib = makeAnimal('hs1', {
      name: 'Amber Sun',
      tattoo: 'AS-205',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Active',
      sireId: 's1',
    });

    const rabbitSp = makeSpeciesProfile('Rabbit');
    rabbitSp.memoText = 'Watch ventilation fan switch in North aisle.';

    const snap = makeEmptySnapshot({
      speciesProfiles: [rabbitSp],
      animals: [gcGrandsire, sire, dam, subject, activeKit, soldKit, halfSib],
      careLogs: [
        {
          id: 'cl1',
          species: 'Rabbit',
          animalId: 'sub1',
          dateIso: '2026-08-12',
          type: 'Health / Vet',
          title: 'Ear Mite Preventative',
          weightGrams: 4620,
          showLegEarned: false,
          notes: 'Clean ears, healthy coat.',
          createdAt: '2026-08-12T10:00:00Z',
          updatedAt: '2026-08-12T10:00:00Z',
        },
        {
          id: 'cl2',
          species: 'Rabbit',
          animalId: 'sub1',
          dateIso: '2026-09-20',
          type: 'Show / Leg',
          title: 'Best of Breed — State Fair',
          weightGrams: 0,
          showLegEarned: true,
          notes: 'Class of 18 senior does.',
          createdAt: '2026-09-20T10:00:00Z',
          updatedAt: '2026-09-20T10:00:00Z',
        },
      ],
      breedings: [
        {
          id: 'br1',
          species: 'Rabbit',
          sireId: 'gs1',
          damId: 'sub1',
          sireName: 'Grand Legend',
          damName: 'Ruby Horizon',
          bredDateIso: '2026-03-01',
          expectedDueDateIso: '2026-04-01',
          actualBirthDateIso: '2026-04-02',
          projectedCoiPercent: 12.5,
          liveCount: 7,
          stillbornCount: 1,
          fosteredCount: 0,
          weanedCount: 7,
          offspringCreated: true,
          status: 'Weaned',
          notes: 'Pulled generous fur nest overnight.',
          createdAt: '2026-03-01T10:00:00Z',
          updatedAt: '2026-05-15T10:00:00Z',
        },
      ],
      shows: [
        {
          id: 'sh1',
          species: 'Rabbit',
          name: 'Midwest Specialty Show',
          location: 'Madison, WI',
          sanctioningBody: 'ARBA',
          eventDateIso: '2026-10-10',
          entryDeadlineIso: '2026-10-01',
          enteredAnimalIds: ['sub1'],
          notes: 'Open Youth & Senior Doe division.',
          createdAt: '2026-09-01T10:00:00Z',
          updatedAt: '2026-09-01T10:00:00Z',
        },
      ],
      cages: [
        {
          id: 'cg1',
          species: 'Rabbit',
          label: 'R-1',
          section: 'Does Row',
          capacity: 1,
          notes: 'All-wire 30x36 cage',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      animalPhotos: [
        {
          id: 'ph1',
          species: 'Rabbit',
          animalId: 'sub1',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Side profile showing smooth hindquarters at State Fair',
          originalFileName: 'ruby-profile.webp',
          mimeType: 'image/webp',
          width: 800,
          height: 600,
          originalBytes: 12000,
          storedBytes: 12000,
          thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          createdAt: '2026-09-21T10:00:00Z',
          updatedAt: '2026-09-21T10:00:00Z',
        },
      ],
    });

    const kinship = computeAnimalKinshipSummary(subject, snap.animals, snap.careLogs, rabbitSp);
    expect(kinship.directOffspring.map((o) => o.animal.id).sort()).toEqual(['k1', 'k2']);
    expect(kinship.inHerdRelatives.some((r) => r.animal.id === 'hs1')).toBe(true);
    expect(kinship.inHerdRelatives.some((r) => r.animal.id === 'd1')).toBe(true);
    // Noteworthy includes deceased Grand Legend & sold Crimson Flash
    expect(kinship.noteworthyRelatives.some((n) => n.animal.id === 'gs1')).toBe(true);
    expect(kinship.noteworthyRelatives.some((n) => n.animal.id === 'k2')).toBe(true);

    // Active-only default omits archived animals as top-level dossiers while keeping kinship references
    const activeOnlyHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', {
      includeArchived: false,
    });
    expect(activeOnlyHtml).toContain('Active &amp; Current Breeding Stock Only');
    expect(activeOnlyHtml).toContain('Ruby Horizon');
    expect(activeOnlyHtml).toContain('REG-RH-8899');
    expect(activeOnlyHtml).toContain('Aa B_ C_ D_ ee');
    expect(activeOnlyHtml).toContain('Ear Mite Preventative');
    expect(activeOnlyHtml).toContain('Pulled generous fur nest overnight.');
    expect(activeOnlyHtml).toContain('Midwest Specialty Show');
    expect(activeOnlyHtml).toContain('Side profile showing smooth hindquarters at State Fair');
    expect(activeOnlyHtml).toContain('Calm mother, broad hindquarters, sensitive to sudden feed switch.');
    expect(activeOnlyHtml).toContain('Watch ventilation fan switch in North aisle.');
    // Archived animals are referenced in kinship/noteworthy tables, NOT as standalone dossiers
    expect(activeOnlyHtml).not.toContain('>Grand Legend<span');
    expect(activeOnlyHtml).toContain('GC-9942');
    expect(activeOnlyHtml).toContain('GC-7711');

    // Full archive toggle promotes deceased/sold animals to full standalone dossiers
    const fullArchiveHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', {
      includeArchived: true,
    });
    expect(fullArchiveHtml).toContain('Complete Species Archive (Active + Archived / Sold / Deceased)');
    expect(fullArchiveHtml).toContain('Grand Legend');
    expect(fullArchiveHtml).toContain('Red Baron');
    expect(fullArchiveHtml).toContain('Crimson Flash');
  });

  it('automatically embeds complete Barn Binder .HTM files inside both Mass and Species .ZIP backups with zero breaking effect on restore', () => {
    const snap = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
      animals: [
        makeAnimal('r-active', { name: 'Clover', species: 'Rabbit', status: 'Active' }),
        makeAnimal('r-arch', {
          name: 'Old Timer',
          species: 'Rabbit',
          status: 'Deceased',
          archived: true,
        }),
        makeAnimal('s-active', { name: 'Woolly', species: 'Sheep', status: 'Active' }),
      ],
    });

    // Mass Backup .ZIP includes binders for ALL species and ALL animals (including Archived/Deceased)
    const massZip = buildCompleteBackupZipArchive(snap);
    expect(massZip.binderCount).toBe(2);
    const massEntries = unzipSync(massZip.bytes);
    expect(massEntries['binder/rabbit-binder.htm']).toBeTruthy();
    expect(massEntries['binder/sheep-binder.htm']).toBeTruthy();
    const massRabbitBinder = strFromU8(massEntries['binder/rabbit-binder.htm']);
    expect(massRabbitBinder).toContain('Clover');
    expect(massRabbitBinder).toContain('Old Timer');
    expect(massRabbitBinder).toContain('Complete Species Archive');

    // Mass ZIP restores cleanly without binder HTML causing issues
    const restoredMass = parseBackupArchiveInput(
      massZip.bytes,
      'community-pedigree-archive.zip',
      snap.settings
    );
    expect(restoredMass.kind).toBe('full_snapshot');
    if (restoredMass.kind === 'full_snapshot') {
      expect(restoredMass.snapshot.animals).toHaveLength(3);
    }

    // Species Backup .ZIP automatically embeds ONLY that species binder (still with ALL animals of that species)
    const speciesZip = buildCompleteBackupZipArchive(snap, 'Rabbit', {
      backupScope: 'species',
      backupReason: 'manual',
      targetSpecies: 'Rabbit',
    });
    expect(speciesZip.binderCount).toBe(1);
    const spEntries = unzipSync(speciesZip.bytes);
    expect(spEntries['binder/rabbit-binder.htm']).toBeTruthy();
    expect(spEntries['binder/sheep-binder.htm']).toBeUndefined();
    const spBinder = strFromU8(spEntries['binder/rabbit-binder.htm']);
    expect(spBinder).toContain('Old Timer');

    const restoredSpecies = parseBackupArchiveInput(
      speciesZip.bytes,
      'meadowbrook-rabbit-backup.zip',
      snap.settings
    );
    expect(restoredSpecies.kind).toBe('full_snapshot');
    if (restoredSpecies.kind === 'full_snapshot') {
      expect(restoredSpecies.snapshot.animals.map((a) => a.id).sort()).toEqual([
        'r-active',
        'r-arch',
      ]);
    }
  });

  it('strips SVG and malformed data URLs from primary pedigree and gallery photo slots while keeping safe raster images', () => {
    const safePng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const svgPayload =
      'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=';
    const breakoutPayload =
      'data:image/png;base64,iVBOR" onerror="alert(1)';

    const snap = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit')],
      animals: [
        makeAnimal('a-svg', { name: 'Vector Buck', species: 'Rabbit' }),
        makeAnimal('a-safe', { name: 'Raster Doe', species: 'Rabbit' }),
      ],
      animalPhotos: [
        {
          id: 'ph-svg',
          species: 'Rabbit',
          animalId: 'a-svg',
          isPrimary: true,
          sortOrder: 0,
          caption: 'SVG payload attempt',
          originalFileName: 'bad.svg',
          mimeType: 'image/svg+xml',
          width: 100,
          height: 100,
          originalBytes: 100,
          storedBytes: 100,
          thumbnailDataUrl: svgPayload,
          dataUrl: svgPayload,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'ph-breakout',
          species: 'Rabbit',
          animalId: 'a-svg',
          isPrimary: false,
          sortOrder: 1,
          caption: 'Attribute injection attempt',
          originalFileName: 'bad.png',
          mimeType: 'image/png',
          width: 100,
          height: 100,
          originalBytes: 100,
          storedBytes: 100,
          thumbnailDataUrl: breakoutPayload,
          dataUrl: breakoutPayload,
          createdAt: '2026-10-01T00:01:00Z',
          updatedAt: '2026-10-01T00:01:00Z',
        },
        {
          id: 'ph-safe',
          species: 'Rabbit',
          animalId: 'a-safe',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Safe PNG',
          originalFileName: 'good.png',
          mimeType: 'image/png',
          width: 100,
          height: 100,
          originalBytes: 100,
          storedBytes: 100,
          thumbnailDataUrl: safePng,
          dataUrl: safePng,
          createdAt: '2026-10-01T00:02:00Z',
          updatedAt: '2026-10-01T00:02:00Z',
        },
      ],
    });

    const html = generateSpeciesBarnBinderHtml(snap, 'Rabbit', {
      includePhotos: true,
    });
    expect(html).not.toContain('data:image/svg+xml');
    expect(html).not.toContain('onerror=');
    expect(html).not.toContain(svgPayload);
    expect(html).not.toContain(breakoutPayload);
    expect(html).toContain(`src="${safePng}"`);
  });
});

```

## `src/core/__tests__/barnScheduler.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildBarnGanttTimeline,
  buildPriorityEscalationUpdates,
  evaluateTaskPriorityEscalation,
  resizeTaskStartDateByDays,
  shiftTaskDatesByDays,
} from '../barnScheduler';
import { BarnTask, BreedingRecord } from '../models';
import { makeSpeciesProfile } from './testFixtures';

const TS = '2026-04-10T10:00:00.000Z';

function makeTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: 'Sample Chore',
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-04-12',
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
    _rev: 1,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('barnScheduler — Smart Priority Escalation & Drag-and-Drop Gantt Timeline', () => {
  it('escalates overdue/due-today/tomorrow Nestbox and Birth Check tasks to High priority', () => {
    const todayIso = '2026-04-10';

    const nestboxTomorrow = makeTask('t1', {
      category: 'Nestbox',
      priority: 'Normal',
      dueDateIso: '2026-04-11',
    });
    const birthOverdue = makeTask('t2', {
      category: 'Birth Check',
      priority: 'Low',
      dueDateIso: '2026-04-08',
    });
    const routineFuture = makeTask('t3', {
      category: 'Care',
      priority: 'Normal',
      dueDateIso: '2026-04-18',
    });
    const completedNestbox = makeTask('t4', {
      category: 'Nestbox',
      priority: 'Low',
      dueDateIso: '2026-04-05',
      completed: true,
    });
    const severelyOverdueGeneral = makeTask('t5', {
      category: 'Care',
      priority: 'Low',
      dueDateIso: '2026-04-06',
    });

    const e1 = evaluateTaskPriorityEscalation(nestboxTomorrow, todayIso);
    expect(e1.isEscalated).toBe(true);
    expect(e1.effectivePriority).toBe('High');
    expect(e1.isCriticalTimeWindow).toBe(true);

    const e2 = evaluateTaskPriorityEscalation(birthOverdue, todayIso);
    expect(e2.isEscalated).toBe(true);
    expect(e2.isOverdue).toBe(true);
    expect(e2.daysUntilDue).toBe(-2);
    expect(e2.effectivePriority).toBe('High');

    const e3 = evaluateTaskPriorityEscalation(routineFuture, todayIso);
    expect(e3.isEscalated).toBe(false);
    expect(e3.effectivePriority).toBe('Normal');

    const e4 = evaluateTaskPriorityEscalation(completedNestbox, todayIso);
    expect(e4.isEscalated).toBe(false);

    const e5 = evaluateTaskPriorityEscalation(severelyOverdueGeneral, todayIso);
    expect(e5.isEscalated).toBe(true);
    expect(e5.effectivePriority).toBe('High');

    const updates = buildPriorityEscalationUpdates(
      [nestboxTomorrow, birthOverdue, routineFuture, completedNestbox, severelyOverdueGeneral],
      todayIso,
      TS
    );
    expect(updates.map((u) => u.id)).toEqual(['t1', 't2', 't5']);
    expect(updates[0].priority).toBe('High');
    expect(updates[0]._rev).toBe(2);
  });

  it('shifts and resizes task calendar spans cleanly in pure UTC across month boundaries', () => {
    const task = makeTask('span-1', {
      startDateIso: '2026-03-30',
      dueDateIso: '2026-04-01',
      _rev: 3,
    });

    const shifted = shiftTaskDatesByDays(task, 3, '2026-04-11T00:00:00.000Z');
    expect(shifted).not.toBeNull();
    expect(shifted?.startDateIso).toBe('2026-04-02');
    expect(shifted?.dueDateIso).toBe('2026-04-04');
    expect(shifted?._rev).toBe(4);

    // Resize start forward by +5 days clamps cleanly at dueDateIso (collapsing to milestone '')
    const collapsed = resizeTaskStartDateByDays(task, 5, '2026-04-11T00:00:00.000Z');
    expect(collapsed).not.toBeNull();
    expect(collapsed?.startDateIso).toBe('');
    expect(collapsed?.dueDateIso).toBe('2026-04-01');
    expect(collapsed?._rev).toBe(4);
  });

  it('builds Gantt lanes, multi-day spans, overdue tails, and unscheduled tasks', () => {
    const species = makeSpeciesProfile('Rabbit');
    const breeding: BreedingRecord = {
      id: 'b1',
      species: 'Rabbit',
      sireId: 's1',
      damId: 'd1',
      sireName: 'Buck One',
      damName: 'Doe One',
      bredDateIso: '2026-03-10',
      expectedDueDateIso: '2026-04-10',
      actualBirthDateIso: '',
      projectedCoiPercent: 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status: 'Palpated Positive',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const tOverdue = makeTask('t-over', {
      title: 'Place Nestbox',
      category: 'Nestbox',
      priority: 'Normal',
      dueDateIso: '2026-04-08',
      linkedBreedingId: 'b1',
    });
    const tMulti = makeTask('t-multi', {
      title: 'Wean Transition',
      category: 'Weaning',
      startDateIso: '2026-04-12',
      dueDateIso: '2026-04-15',
      linkedBreedingId: 'b1',
    });
    const tUnsched = makeTask('t-unsched', {
      title: 'Clean Feed Bins',
      dueDateIso: '',
    });

    const timeline = buildBarnGanttTimeline({
      tasks: [tOverdue, tMulti, tUnsched],
      breedings: [breeding],
      speciesProfile: species,
      windowStartIso: '2026-04-06',
      windowDays: 14,
      grouping: 'breeding_or_animal',
      includeCompleted: false,
      todayIso: '2026-04-10',
    });

    expect(timeline.days).toHaveLength(14);
    expect(timeline.summary.totalOpenCount).toBe(3);
    expect(timeline.summary.overdueCount).toBe(1);
    expect(timeline.summary.escalatedCount).toBe(1);
    expect(timeline.summary.criticalNestboxOrBirthCount).toBe(1);
    expect(timeline.unscheduledTasks).toHaveLength(1);
    expect(timeline.lanes).toHaveLength(1);

    const lane = timeline.lanes[0];
    expect(lane.label).toBe('Doe One × Buck One');
    expect(lane.hasOverdueTask).toBe(true);
    expect(lane.hasEscalatedTask).toBe(true);
    expect(lane.bars[0].overdueTailCols).toBe(2); // Apr 9 & Apr 10
    expect(lane.bars[1].durationDays).toBe(4); // Apr 12..Apr 15
    expect(lane.bars[1].spanCols).toBe(4);
  });
});
```

## `src/core/__tests__/batchPrint.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildBatchPrintFileName,
  buildDefaultBatchPrintOptions,
  computeBatchPrintPageCount,
  generateBatchPrintHtml,
  resolveBatchPrintAnimals,
} from '../batchPrint';
import { makeAnimal, makeSettings, makeSpeciesProfile } from './testFixtures';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('batchPrint — multi-select cage cards, 4-up mini sheets, 4x6 photo cards & stacked pedigrees', () => {
  const speciesProfiles = [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')];
  const settings = makeSettings({
    barnName: 'Oak Ridge Rabbitry',
    breederName: 'Kimberly',
    defaultGenerations: 4,
  });

  const gSire = makeAnimal('gs1', { name: 'Grandpa Rex', tattoo: 'GS1', sex: 'Male', breed: 'Rex', variety: 'Castor' });
  const gDam = makeAnimal('gd1', { name: 'Grandma Velvet', tattoo: 'GD1', sex: 'Female', breed: 'Rex', variety: 'Black' });
  const sire = makeAnimal('s1', {
    name: 'King Clover',
    tattoo: 'KC1',
    sex: 'Male',
    breed: 'Rex',
    variety: 'Castor',
    sireId: 'gs1',
    damId: 'gd1',
    weightGrams: 3900,
    registrationNumber: 'R-991',
  });
  const dam = makeAnimal('d1', {
    name: 'Queen Hazel',
    tattoo: 'QH1',
    sex: 'Female',
    breed: 'Rex',
    variety: 'Red',
    weightGrams: 4100,
  });

  it('resolves multi-selected animals in visible sort order with strict species isolation and deduplication', () => {
    const a1 = makeAnimal('a1', { name: 'Alpha' });
    const a2 = makeAnimal('a2', { name: 'Bravo' });
    const a3 = makeAnimal('a3', { name: 'Charlie', status: 'Archived' });
    const sheep = makeAnimal('sh1', { name: 'Woolly', species: 'Sheep' });

    const resolved = resolveBatchPrintAnimals(
      ['a3', 'a2', 'a1', 'a2', 'sh1'],
      [a1, a2], // visible filtered order
      [a1, a2, a3, sheep],
      'Rabbit'
    );

    expect(resolved.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('computes accurate page counts and clean filenames across all four batch layouts', () => {
    expect(computeBatchPrintPageCount(0, { layout: 'cage_cards', photoCardPaperMode: 'letter_2up' })).toBe(0);
    expect(computeBatchPrintPageCount(9, { layout: 'cage_cards', photoCardPaperMode: 'letter_2up' })).toBe(2);
    expect(computeBatchPrintPageCount(5, { layout: 'mini_pedigree_4up', photoCardPaperMode: 'letter_2up' })).toBe(2);
    expect(computeBatchPrintPageCount(3, { layout: 'photo_cards_4x6', photoCardPaperMode: 'letter_2up' })).toBe(2);
    expect(computeBatchPrintPageCount(3, { layout: 'photo_cards_4x6', photoCardPaperMode: 'photo_4x6' })).toBe(3);
    expect(computeBatchPrintPageCount(4, { layout: 'stacked_pedigrees', photoCardPaperMode: 'letter_2up' })).toBe(4);

    expect(
      buildBatchPrintFileName('My Barn', 'Rabbit', 'cage_cards', 8, '2026-11-20')
    ).toBe('pedigree-rabbit-cage-cards-8-2026-11-20.htm');
    expect(
      buildBatchPrintFileName('Oak Ridge Rabbitry', 'Rabbit', 'mini_pedigree_4up', 6, '2026-11-20')
    ).toBe('oak-ridge-rabbitry-rabbit-mini-pedigrees-4up-6-2026-11-20.htm');
    expect(
      buildBatchPrintFileName('Oak Ridge Rabbitry', 'Rabbit', 'photo_cards_4x6', 4, '2026-11-20')
    ).toBe('oak-ridge-rabbitry-rabbit-photo-cards-4x6-4-2026-11-20.htm');
    expect(
      buildBatchPrintFileName('Oak Ridge Rabbitry', 'Rabbit', 'stacked_pedigrees', 3, '2026-11-20')
    ).toBe('oak-ridge-rabbitry-rabbit-stacked-pedigrees-3-2026-11-20.htm');
  });

  it('paginates 10 animals into 2 pages of 8-up cage cards with sire/dam, cage, and optional cut lines', () => {
    const batch = Array.from({ length: 10 }, (_, idx) =>
      makeAnimal(`kit-${idx + 1}`, {
        name: `Show Kit ${idx + 1}`,
        tattoo: `SK${idx + 1}`,
        sex: idx % 2 === 0 ? 'Male' : 'Female',
        cageLocation: `Row A-${idx + 1}`,
        sireId: 's1',
        damId: 'd1',
        genotypeRaw: 'Aa B_ C_ D_ ee',
      })
    );
    const allAnimals = [gSire, gDam, sire, dam, ...batch];

    const html = generateBatchPrintHtml({
      subjects: batch,
      allAnimals,
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'cage_cards',
        includeCutLines: true,
        showGenotypes: true,
        showWeights: true,
      },
      photoDataUrlByAnimalId: { 'kit-1': VALID_PNG_DATA_URL },
    });

    expect(html.match(/class="batch-page cage-page"/g)?.length).toBe(2);
    expect(html.match(/class="cage-card with-cut-lines"/g)?.length).toBe(10);
    expect(html).toContain('Show Kit 1');
    expect(html).toContain('Show Kit 10');
    expect(html).toContain('Row A-1');
    expect(html).toContain('King Clover (KC1)');
    expect(html).toContain('Queen Hazel (QH1)');
    expect(html).toContain('Aa B_ C_ D_ ee (genetics in dev)');
    expect(html).toContain(VALID_PNG_DATA_URL);
  });

  it('renders stacked formal pedigrees with 1 landscape page per animal, depth controls, and footer options', () => {
    const k1 = makeAnimal('k1', {
      name: 'Bramble',
      tattoo: 'BR1',
      sex: 'Male',
      sireId: 's1',
      damId: 'd1',
      genotypeRaw: 'A_ B_ C_ D_ ee',
      legsCount: 2,
    });
    const k2 = makeAnimal('k2', {
      name: 'Thistle',
      tattoo: 'TH2',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
    });

    const defaults = buildDefaultBatchPrintOptions(settings);
    expect(defaults.generations).toBe(4);

    const html = generateBatchPrintHtml({
      subjects: [k1, k2],
      allAnimals: [gSire, gDam, sire, dam, k1, k2],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'stacked_pedigrees',
        generations: 5,
        showWeights: false,
        showGenotypes: true,
        showBreederFooter: true,
        breederContactLine: 'oakridge.example · 555-0199',
      },
    });

    expect(html.match(/class="batch-page ped-page"/g)?.length).toBe(2);
    expect(html).toContain('Page 1 of 2');
    expect(html).toContain('Page 2 of 2');
    expect(html).toContain('5th Generation (Gen 5)');
    expect(html).toContain('Grandpa Rex');
    expect(html).toContain('oakridge.example');
    expect(html).toContain('under development and incomplete (unverified)');
    expect(html).not.toContain('<strong>Weight:</strong>');
  });

  it('paginates 5 animals into 2 pages of 4-up (1/4-page) mini pedigree sheets', () => {
    const subjects = Array.from({ length: 5 }, (_, idx) =>
      makeAnimal(`m-${idx + 1}`, {
        name: `Mini ${idx + 1}`,
        tattoo: `M${idx + 1}`,
        sex: 'Female',
        sireId: 's1',
        damId: 'd1',
      })
    );

    const html = generateBatchPrintHtml({
      subjects,
      allAnimals: [gSire, gDam, sire, dam, ...subjects],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'mini_pedigree_4up',
        includeCutLines: false,
      },
    });

    expect(html.match(/class="batch-page mini-page"/g)?.length).toBe(2);
    expect(html.match(/class="mini-card no-cut-lines"/g)?.length).toBe(5);
    expect(html).toContain('Grandpa Rex');
    expect(html).toContain('Great-Grandparents (G3)');
  });

  it('renders 3-gen 4x6 photo cards in both 2-up Letter and direct 4x6 modes while sanitizing unsafe images and XSS', () => {
    const xssAnimal = makeAnimal('x1', {
      name: '<script>alert(1)</script>Maple',
      tattoo: 'MP"1',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
    });
    const cleanAnimal = makeAnimal('c2', {
      name: 'Cedar',
      tattoo: 'CD2',
      sex: 'Male',
      sireId: 's1',
      damId: 'd1',
    });

    const letterHtml = generateBatchPrintHtml({
      subjects: [xssAnimal, cleanAnimal],
      allAnimals: [gSire, gDam, sire, dam, xssAnimal, cleanAnimal],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'photo_cards_4x6',
        photoCardPaperMode: 'letter_2up',
        includePhotos: true,
        includeCutLines: true,
        breederContactLine: '<b>Unsafe</b>',
      },
      photoDataUrlByAnimalId: {
        x1: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pjwvc3ZnPg==',
        c2: VALID_PNG_DATA_URL,
      },
    });

    expect(letterHtml.match(/class="batch-page photo4x6-page"/g)?.length).toBe(1);
    expect(letterHtml).toContain('@page { size: letter portrait;');
    expect(letterHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Maple');
    expect(letterHtml).not.toContain('<script>alert(1)</script>');
    expect(letterHtml).not.toContain('data:image/svg+xml');
    expect(letterHtml).toContain('photo4x6-placeholder'); // monogram fallback for rejected SVG / missing photo
    expect(letterHtml).toContain(VALID_PNG_DATA_URL);
    expect(letterHtml).toContain('&lt;b&gt;Unsafe&lt;/b&gt;');

    const directHtml = generateBatchPrintHtml({
      subjects: [xssAnimal, cleanAnimal],
      allAnimals: [gSire, gDam, sire, dam, xssAnimal, cleanAnimal],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: {
        layout: 'photo_cards_4x6',
        photoCardPaperMode: 'photo_4x6',
        includePhotos: false,
      },
    });

    expect(directHtml.match(/class="batch-page photo4x6-page"/g)?.length).toBe(2);
    expect(directHtml).toContain('@page { size: 6in 4in;');
    expect(directHtml).not.toContain('class="photo4x6-img"');
    expect(directHtml).not.toContain('class="photo4x6-placeholder"');
  });

  it('handles empty or cross-species selections safely without throwing', () => {
    const sheepOnly = makeAnimal('sh1', { species: 'Sheep', name: 'Ewe 1' });
    const html = generateBatchPrintHtml({
      subjects: [sheepOnly],
      allAnimals: [sheepOnly],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      options: { layout: 'cage_cards' },
    });

    expect(html).toContain('No Rabbit animals are selected');
    expect(html).not.toContain('Ewe 1');
  });

  it('embeds scannable vector QR codes on 8-up cage cards when includeQrCodes is enabled and omits them when disabled', () => {
    const k1 = makeAnimal('qr-1', {
      name: 'Hazel',
      tattoo: 'HZ1',
      sex: 'Female',
      cageLocation: 'Hutch R-01',
    });
    const k2 = makeAnimal('qr-2', {
      name: 'Bramble',
      tattoo: 'BR2',
      sex: 'Male',
      cageLocation: 'Hutch R-02',
    });

    const withQr = generateBatchPrintHtml({
      subjects: [k1, k2],
      allAnimals: [k1, k2],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      appBaseUrl: 'https://askkim.org/pedigree/',
      options: {
        layout: 'cage_cards',
        includeQrCodes: true,
      },
    });

    expect(withQr.match(/class="cage-qr"/g)?.length).toBe(2);
    expect(withQr).toContain('<svg ');
    expect(withQr).toContain('animalId=qr-1');
    expect(withQr).toContain('animalId=qr-2');

    const withoutQr = generateBatchPrintHtml({
      subjects: [k1, k2],
      allAnimals: [k1, k2],
      speciesProfiles,
      settings,
      speciesName: 'Rabbit',
      appBaseUrl: 'https://askkim.org/pedigree/',
      options: {
        layout: 'cage_cards',
        includeQrCodes: false,
      },
    });

    expect(withoutQr).not.toContain('class="cage-qr"');
    expect(withoutQr).not.toContain('<svg ');
  });
});
```

## `src/core/__tests__/calendarExport.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildExternalCalendarWebUrls,
  buildGoogleCalendarEventPayload,
  buildIcsCalendarForTasks,
  buildMultiSpeciesAgenda,
  buildTaskAppDeepLink,
  formatExternalCalendarTaskSummary,
  formatIcsAlarmTrigger,
  formatSystemTaskTitle,
} from '../calendarExport';
import {
  Animal,
  BarnTask,
  BreedingRecord,
  DEFAULT_CALENDAR_SYNC_SETTINGS,
  normalizeCalendarSyncSettings,
  SpeciesProfile,
  stripAnimalNamePrefix,
} from '../models';

function makeTask(overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id: 'task-1',
    species: 'Rabbit',
    title: 'Palpation Check: Copper Creek Briar (× Copper Creek Marshal)',
    category: 'Palpation',
    priority: 'High',
    dueDateIso: '2026-11-29',
    linkedAnimalId: 'a1',
    linkedAnimalName: 'Copper Creek Briar',
    linkedBreedingId: 'b1',
    completed: false,
    createdAt: '2026-11-15T12:00:00.000Z',
    updatedAt: '2026-11-15T12:00:00.000Z',
    ...overrides,
  };
}

const rabbitSpecies: SpeciesProfile = {
  id: 'sp-rabbit',
  name: 'Rabbit',
  defaultAnimalPrefix: 'Copper Creek',
  gestationDays: 31,
  rebreedDaysAfterBirth: 28,
  weanDaysAfterBirth: 42,
  birthEventLabel: 'Kindling',
  maleLabel: 'Buck',
  femaleLabel: 'Doe',
  offspringLabel: 'Kit',
  exampleBreeds: ['New Zealand'],
  milestones: [],
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

const damAnimal: Animal = {
  id: 'a1',
  tattoo: 'NZR-102',
  name: 'Copper Creek Briar',
  species: 'Rabbit',
  breed: 'New Zealand',
  variety: 'Red',
  sex: 'Female',
  status: 'Active',
  birthDateIso: '2024-01-01',
  weightGrams: 4200,
  genotype: [],
  genotypeRaw: '',
  registrationNumber: '',
  grandChampionNumber: '',
  legsCount: 0,
  cageLocation: 'R-01',
  breederName: '',
  ownerName: '',
  sireId: '',
  damId: '',
  notes: '',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

const sireAnimal: Animal = {
  ...damAnimal,
  id: 'a2',
  tattoo: 'NZR-051',
  name: 'Copper Creek Marshal',
  sex: 'Male',
};

const sampleBreeding: BreedingRecord = {
  id: 'b1',
  species: 'Rabbit',
  sireId: 'a2',
  damId: 'a1',
  sireName: 'Copper Creek Marshal',
  damName: 'Copper Creek Briar',
  bredDateIso: '2026-11-15',
  expectedDueDateIso: '2026-12-16',
  actualBirthDateIso: '',
  projectedCoiPercent: 0,
  liveCount: 0,
  stillbornCount: 0,
  fosteredCount: 0,
  weanedCount: 0,
  offspringCreated: false,
  status: 'Bred',
  notes: '',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
};

describe('calendarExport (.ics + VALARM)', () => {
  it('formats RFC 5545 VALARM trigger durations cleanly', () => {
    expect(formatIcsAlarmTrigger(0)).toBe('PT0S');
    expect(formatIcsAlarmTrigger(15)).toBe('-PT15M');
    expect(formatIcsAlarmTrigger(60)).toBe('-PT1H');
    expect(formatIcsAlarmTrigger(1440)).toBe('-P1D');
    expect(formatIcsAlarmTrigger(2880)).toBe('-P2D');
  });

  it('normalizes invalid calendar sync settings safely', () => {
    const norm = normalizeCalendarSyncSettings({
      autoAddNewTasks: true,
      reminderTimeLocal: 'bad-time',
      alarmMinutesBefore: -50,
      includeAnimalPrefix: false,
      includeAnimalName: false,
    });
    expect(norm.autoAddNewTasks).toBe(true);
    expect(norm.reminderTimeLocal).toBe(DEFAULT_CALENDAR_SYNC_SETTINGS.reminderTimeLocal);
    expect(norm.alarmMinutesBefore).toBe(DEFAULT_CALENDAR_SYNC_SETTINGS.alarmMinutesBefore);
    expect(norm.includeAnimalPrefix).toBe(false);
    expect(norm.includeAnimalName).toBe(false);
  });

  it('strips configured prefixes cleanly without returning empty strings', () => {
    expect(stripAnimalNamePrefix('Copper Creek Briar', 'Copper Creek')).toBe('Briar');
    expect(stripAnimalNamePrefix('OR-Ruby', 'OR-')).toBe('Ruby');
    expect(stripAnimalNamePrefix('CC: Snowball', 'CC:')).toBe('Snowball');
    expect(stripAnimalNamePrefix('Copper Creek', 'Copper Creek')).toBe('Copper Creek');
    expect(stripAnimalNamePrefix('Briar', 'Copper Creek')).toBe('Briar');
  });

  it('formats external calendar summaries for prefix, ear number, and appended species', () => {
    const ctx = {
      animals: [damAnimal, sireAnimal],
      breedings: [sampleBreeding],
      speciesProfiles: [rabbitSpecies],
    };
    const task = makeTask();

    expect(
      formatExternalCalendarTaskSummary(
        task,
        { includeAnimalPrefix: true, includeAnimalName: true },
        ctx
      )
    ).toBe('Palpation Check: Copper Creek Briar (× Copper Creek Marshal) [Rabbit]');

    expect(
      formatExternalCalendarTaskSummary(
        task,
        { includeAnimalPrefix: false, includeAnimalName: true },
        ctx
      )
    ).toBe('Palpation Check: Briar (× Marshal) [Rabbit]');

    expect(
      formatExternalCalendarTaskSummary(
        task,
        { includeAnimalPrefix: true, includeAnimalName: false },
        ctx
      )
    ).toBe('Palpation Check: NZR-102 (× NZR-051) [Rabbit]');

    // Manual task linked to an animal without animal name typed in title
    const manualLinkedTask = makeTask({
      id: 'task-manual',
      title: 'Trim front nails',
      linkedBreedingId: '',
      linkedAnimalId: 'a1',
      linkedAnimalName: 'Copper Creek Briar',
    });
    expect(
      formatExternalCalendarTaskSummary(
        manualLinkedTask,
        { includeAnimalPrefix: false, includeAnimalName: true },
        ctx
      )
    ).toBe('Trim front nails — Briar [Rabbit]');
    expect(
      formatExternalCalendarTaskSummary(
        manualLinkedTask,
        { includeAnimalName: false },
        ctx
      )
    ).toBe('Trim front nails — NZR-102 [Rabbit]');
  });

  it('formats in-app system task titles cleanly without appending species tags or unmentioned tokens', () => {
    const ctx = {
      animals: [damAnimal, sireAnimal],
      breedings: [sampleBreeding],
      speciesProfiles: [rabbitSpecies],
    };
    const task = makeTask();

    expect(
      formatSystemTaskTitle(
        task,
        { includeAnimalPrefix: true, includeAnimalName: true },
        ctx
      )
    ).toBe('Palpation Check: Copper Creek Briar (× Copper Creek Marshal)');

    expect(
      formatSystemTaskTitle(
        task,
        { includeAnimalPrefix: false, includeAnimalName: true },
        ctx
      )
    ).toBe('Palpation Check: Briar (× Marshal)');

    expect(
      formatSystemTaskTitle(
        task,
        { includeAnimalPrefix: true, includeAnimalName: false },
        ctx
      )
    ).toBe('Palpation Check: NZR-102 (× NZR-051)');

    const manualLinkedTask = makeTask({
      id: 'task-manual',
      title: 'Trim front nails',
      linkedBreedingId: '',
      linkedAnimalId: 'a1',
      linkedAnimalName: 'Copper Creek Briar',
    });
    expect(
      formatSystemTaskTitle(
        manualLinkedTask,
        { includeAnimalPrefix: false, includeAnimalName: false },
        ctx
      )
    ).toBe('Trim front nails');

    const singleTaskIcs = buildIcsCalendarForTasks(
      [task],
      { includeAnimalPrefix: false, includeAnimalName: false },
      'Copper Creek Barn',
      undefined,
      ctx
    );
    expect(singleTaskIcs).not.toBeNull();
    expect(singleTaskIcs!.filename).toMatch(/^palpation-check-nzr-102-nzr-051-\d{4}-\d{2}-\d{2}\.ics$/);
    expect(singleTaskIcs!.filename).not.toContain('copper-creek');
    expect(singleTaskIcs!.filename).not.toContain('briar');
  });

  it('builds valid multi-event .ics with VALARM and task deep links', () => {
    const res = buildIcsCalendarForTasks(
      [
        makeTask({ id: 't1', dueDateIso: '2026-11-29' }),
        makeTask({
          id: 't2',
          title: 'Place Nestbox: Copper Creek Briar',
          category: 'Nestbox',
          dueDateIso: '2026-12-13',
        }),
        makeTask({ id: 't-undated', dueDateIso: '' }),
      ],
      {
        autoAddNewTasks: true,
        includeBreedingTasks: true,
        includeManualTasks: true,
        reminderTimeLocal: '07:30',
        alarmEnabled: true,
        alarmMinutesBefore: 30,
        includeAnimalPrefix: false,
        includeAnimalName: false,
      },
      'Copper Creek Barn',
      'briar-litter-chores',
      {
        animals: [damAnimal, sireAnimal],
        breedings: [sampleBreeding],
        speciesProfiles: [rabbitSpecies],
        appBaseUrl: 'https://barn.local/',
      }
    );

    expect(res).not.toBeNull();
    expect(res!.eventCount).toBe(2);
    expect(res!.filename).toMatch(/^briar-litter-chores-\d{4}-\d{2}-\d{2}\.ics$/);
    expect(res!.icsContent).toContain('\r\n');
    expect(res!.icsContent).toContain('BEGIN:VCALENDAR');
    expect(res!.icsContent).toContain('DTSTART:20261129T073000');
    expect(res!.icsContent).toContain('DTEND:20261129T080000');
    expect(res!.icsContent).toContain('SUMMARY:Palpation Check: NZR-102 (× NZR-051) [Rabbit]');
    expect(res!.icsContent).toContain('Animal Ear #: NZR-102');
    expect(res!.icsContent).not.toContain('Copper Creek Briar');
    expect(res!.icsContent).toContain(
      `URL;VALUE=URI:${buildTaskAppDeepLink('https://barn.local/', { id: 't1', species: 'Rabbit' })}`
    );
    expect(res!.icsContent).toContain('Open Task in App: https://barn.local/?route=dashboard');
    expect(res!.icsContent).toContain('BEGIN:VALARM');
    expect(res!.icsContent).toContain('TRIGGER:-PT30M');
    expect(res!.icsContent).toContain('PRIORITY:1');
    expect(res!.icsContent).not.toContain('t-undated');
  });

  it('omits VALARM when alarmEnabled is false and rolls over midnight end times cleanly', () => {
    const res = buildIcsCalendarForTasks(
      [makeTask({ id: 't-late', dueDateIso: '2026-11-30' })],
      {
        reminderTimeLocal: '23:45',
        alarmEnabled: false,
      },
      'Barn; North, Field'
    );

    expect(res).not.toBeNull();
    expect(res!.icsContent).toContain('DTSTART:20261130T234500');
    expect(res!.icsContent).toContain('DTEND:20261201T001500');
    expect(res!.icsContent).toContain('Barn\\; North\\, Field');
    expect(res!.icsContent).not.toContain('BEGIN:VALARM');
  });

  it('returns null when no tasks have due dates', () => {
    expect(buildIcsCalendarForTasks([makeTask({ dueDateIso: '' })])).toBeNull();
  });

  it('builds Google Calendar event payloads and web template fallback URLs', () => {
    const task = makeTask({ id: 'g1', dueDateIso: '2026-11-29' });
    const ctx = {
      animals: [damAnimal, sireAnimal],
      breedings: [sampleBreeding],
      speciesProfiles: [rabbitSpecies],
      appBaseUrl: 'https://barn.local/',
    };
    const payload = buildGoogleCalendarEventPayload(
      task,
      {
        reminderTimeLocal: '08:15',
        alarmEnabled: true,
        alarmMinutesBefore: 30,
        includeAnimalPrefix: false,
        includeAnimalName: true,
      },
      'Copper Creek Barn',
      'America/Los_Angeles',
      ctx
    );

    expect(payload).not.toBeNull();
    expect(payload!.summary).toBe('Palpation Check: Briar (× Marshal) [Rabbit]');
    expect(payload!.start).toEqual({
      dateTime: '2026-11-29T08:15:00',
      timeZone: 'America/Los_Angeles',
    });
    expect(payload!.end).toEqual({
      dateTime: '2026-11-29T08:45:00',
      timeZone: 'America/Los_Angeles',
    });
    expect(payload!.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    });
    expect(payload!.source?.url).toBe(
      'https://barn.local/?route=dashboard&species=Rabbit&taskId=g1'
    );

    const urls = buildExternalCalendarWebUrls(
      task,
      { reminderTimeLocal: '08:15', includeAnimalName: false },
      'Copper Creek Barn',
      ctx
    );
    expect(urls).not.toBeNull();
    expect(urls!.googleWebUrl).toContain('https://calendar.google.com/calendar/render');
    expect(urls!.googleWebUrl).toContain(encodeURIComponent('Palpation Check: NZR-102 (× NZR-051) [Rabbit]'));
    expect(urls!.outlookWebUrl).toContain('https://outlook.live.com/calendar/0/deeplink/compose');
  });

  it('builds a multi-species 7/14-day agenda scoped strictly to added species with combined ICS export', () => {
    const dogSpecies: SpeciesProfile = {
      ...rabbitSpecies,
      id: 'sp-dog',
      name: 'Dog',
      birthEventLabel: 'Whelping',
      maleLabel: 'Stud',
      femaleLabel: 'Dam',
      offspringLabel: 'Puppy',
    };
    const rabbitDueToday = makeTask({
      id: 't-rabbit-today',
      species: 'Rabbit',
      title: 'Nestbox Check',
      dueDateIso: '2026-11-16',
    });
    const dogOverdue = makeTask({
      id: 't-dog-overdue',
      species: 'Dog',
      title: 'Deworm Litter',
      linkedAnimalId: '',
      linkedAnimalName: '',
      linkedBreedingId: '',
      dueDateIso: '2026-11-14',
    });
    const goatUnadded = makeTask({
      id: 't-goat-unadded',
      species: 'Goat',
      title: 'Hoof Trim',
      linkedAnimalId: '',
      linkedAnimalName: '',
      linkedBreedingId: '',
      dueDateIso: '2026-11-16',
    });
    const farFutureTask = makeTask({
      id: 't-rabbit-12d',
      species: 'Rabbit',
      title: 'Wean Litter',
      dueDateIso: '2026-11-28',
    });

    const summary7 = buildMultiSpeciesAgenda({
      tasks: [rabbitDueToday, dogOverdue, goatUnadded, farFutureTask],
      animals: [damAnimal, sireAnimal],
      breedings: [],
      speciesProfiles: [rabbitSpecies, dogSpecies],
      todayIso: '2026-11-16',
      horizonDays: 7,
    });

    expect(summary7.overdueCount).toBe(1);
    expect(summary7.todayCount).toBe(1);
    expect(summary7.items.map((i) => i.species)).toEqual(['Dog', 'Rabbit']);
    expect(summary7.exportableTasks.map((t) => t.id)).toEqual(['t-dog-overdue', 't-rabbit-today']);

    // Combined multi-species ICS contains both Dog and Rabbit events
    const combinedIcs = buildIcsCalendarForTasks(summary7.exportableTasks);
    expect(combinedIcs).not.toBeNull();
    expect(combinedIcs!.eventCount).toBe(2);
    expect(combinedIcs!.icsContent).toContain('[Dog]');
    expect(combinedIcs!.icsContent).toContain('[Rabbit]');

    // 14-day horizon brings in the 12-day task and speciesFilter isolates Dog
    const summary14 = buildMultiSpeciesAgenda({
      tasks: [rabbitDueToday, dogOverdue, goatUnadded, farFutureTask],
      animals: [damAnimal, sireAnimal],
      breedings: [],
      speciesProfiles: [rabbitSpecies, dogSpecies],
      todayIso: '2026-11-16',
      horizonDays: 14,
    });
    expect(summary14.items).toHaveLength(3);

    const dogOnly = buildMultiSpeciesAgenda({
      tasks: [rabbitDueToday, dogOverdue, goatUnadded, farFutureTask],
      animals: [damAnimal, sireAnimal],
      breedings: [],
      speciesProfiles: [rabbitSpecies, dogSpecies],
      todayIso: '2026-11-16',
      horizonDays: 14,
      speciesFilter: 'Dog',
    });
    expect(dogOnly.items).toHaveLength(1);
    expect(dogOnly.items[0].species).toBe('Dog');
  });
});
```

## `src/core/__tests__/carrierGenetics.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { generateSpeciesBarnBinderHtml } from '../barnBinder';
import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisks,
  doesAnimalMatchCarrierFilter,
  extractHomozygousCoatClearances,
  formatCompactCarrierDisclosure,
  getAnimalCarrierDisclosures,
  getCarrierTraitSuggestionsForSpecies,
  normalizeCarrierTraitList,
  reconcileCarrierTraitLists,
} from '../carrierGenetics';
import { exportAnimalsCsv } from '../csvExport';
import { getPlatformImporterById } from '../importers/registry';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import {
  exportBarnBackupJson,
  generateEvansHtmPedigree,
  parseBarnBackupJson,
} from '../syncAndExports';
import {
  makeAnimal,
  makeEmptySnapshot,
  makeSettings,
  makeSpeciesProfile,
} from './testFixtures';

describe('carrierGenetics & pedigree disclosure outputs', () => {
  it('provides species-specific trait suggestions including neutral coat colors and health markers', () => {
    const rabbitSuggestions = getCarrierTraitSuggestionsForSpecies('Rabbit');
    expect(rabbitSuggestions).toEqual(
      expect.arrayContaining([
        'REW / Ruby-Eyed White (cc)',
        'Dilute / Blue-Lilac-Fawn (dd)',
        'Satin Coat (sa)',
        'Megacolon / Charlie Risk (EnEn)',
      ])
    );

    const goatSuggestions = getCarrierTraitSuggestionsForSpecies('Goat');
    expect(goatSuggestions).toContain('G6S Deficiency');
  });

  it('normalizes whitespace, deduplicates case-insensitively, and reconciles confirmed/suspected/cleared', () => {
    expect(
      normalizeCarrierTraitList(['  Dilute (dd) ', 'dilute (dd)', '', 'Satin Coat'])
    ).toEqual(['Dilute (dd)', 'Satin Coat']);

    const reconciled = reconcileCarrierTraitLists(
      ['Dilute (dd)', 'REW / Ruby-Eyed White (cc)', 'Wide Band (ww)'],
      ['dilute (dd)', 'Satin Coat'],
      [{ trait: 'Wide Band (ww)', proofType: 'test_bred', testBreedingCount: 4 }],
      'cleared'
    );
    expect(reconciled.confirmedCarrierOf).toEqual(['dilute (dd)', 'Satin Coat']);
    expect(reconciled.suspectedCarrierOf).toEqual(['REW / Ruby-Eyed White (cc)']);
    expect(reconciled.clearedCarrierOf).toHaveLength(1);
  });

  it('formats compact carrier disclosure strings and returns empty string when none recorded', () => {
    const plain = makeAnimal('plain');
    expect(formatCompactCarrierDisclosure(plain)).toBe('');
    expect(getAnimalCarrierDisclosures(plain).hasAny).toBe(false);

    const carrier = makeAnimal('carrier', {
      confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)', 'Satin Coat (sa)'],
      suspectedCarrierOf: ['Megacolon / Charlie Risk (EnEn)'],
    });
    expect(formatCompactCarrierDisclosure(carrier)).toBe(
      'Confirmed: Dilute / Blue-Lilac-Fawn (dd), Satin Coat (sa) · Suspected: Megacolon / Charlie Risk (EnEn)'
    );
    expect(
      formatCompactCarrierDisclosure(carrier, { ultraCompact: true, maxItemsPerGroup: 2 })
    ).toBe('Conf: Dilute (dd), Satin Coat (sa) · Susp: Megacolon (EnEn)');
  });

  it('enforces independent Sire/Dam Cleared Branch Firewalls and homozygous dominant coat clearance (never _)', () => {
    // 1. Paternal grandsire is Confirmed Dilute (dd)
    const pGrandsire = makeAnimal('pgs', {
      name: 'Blue Grandsire',
      sex: 'Male',
      confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
    });
    // Sire was Test Bred Clear 4x against Dilute -> blocks paternal branch!
    const clearedSire = makeAnimal('sire', {
      name: 'Cleared Buck',
      sex: 'Male',
      sireId: pGrandsire.id,
      clearedCarrierOf: [
        { trait: 'Dilute / Blue-Lilac-Fawn (dd)', proofType: 'test_bred', testBreedingCount: 4 },
      ],
    });
    // Maternal granddam is Suspected Satin
    const mGranddam = makeAnimal('mgd', {
      name: 'Satin Line Grandmother',
      sex: 'Female',
      suspectedCarrierOf: ['Satin Coat (sa)'],
    });
    const unclearedDam = makeAnimal('dam', {
      name: 'Maternal Doe',
      sex: 'Female',
      damId: mGranddam.id,
    });
    const kit = makeAnimal('kit', {
      name: 'Junior Red',
      sex: 'Female',
      sireId: clearedSire.id,
      damId: unclearedDam.id,
    });

    const all = [pGrandsire, clearedSire, mGranddam, unclearedDam, kit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const analysis = analyzeAnimalCarrierLineage(kit, herd);

    // Dilute was blocked by clearedSire; Satin from maternal line MUST still show as Lineage Potential!
    expect(analysis.lineagePotential.some((l) => l.trait.includes('Dilute'))).toBe(false);
    expect(analysis.lineagePotential.some((l) => l.trait === 'Satin Coat (sa)' && l.viaBranches.includes('Dam'))).toBe(
      true
    );
    expect(analysis.blockedBranches.some((b) => b.branch === 'Sire' && b.clearedById === clearedSire.id)).toBe(
      true
    );

    // 2. Now verify homozygous dominant coat locus DD ALSO stops Dilute, while D_ / __ NEVER clears
    const dBlankSire = makeAnimal('blank_sire', {
      name: 'Unknown W Buck',
      sex: 'Male',
      genotypeRaw: 'A_ B_ C_ D_ ee __',
    });
    expect(extractHomozygousCoatClearances(dBlankSire)).toEqual([]);

    const dHomozygousSire = makeAnimal('hom_sire', {
      name: 'Dense Homozygous Buck',
      sex: 'Male',
      sireId: pGrandsire.id,
      genotypeRaw: 'A_ B_ C_ DD ee WW',
    });
    const clearCheck = extractHomozygousCoatClearances(dHomozygousSire);
    expect(clearCheck.some((c) => c.locus === 'D' && c.pair === 'DD')).toBe(true);
    expect(clearCheck.some((c) => c.locus === 'W' && c.pair === 'WW')).toBe(true);

    const kitFromHomSire = makeAnimal('kit2', {
      name: 'Kit 2',
      sex: 'Male',
      sireId: dHomozygousSire.id,
    });
    const herd2 = buildSpeciesHerdMap([pGrandsire, dHomozygousSire, kitFromHomSire], 'Rabbit');
    const analysis2 = analyzeAnimalCarrierLineage(kitFromHomSire, herd2);
    expect(analysis2.lineagePotential).toHaveLength(0);
    expect(analysis2.blockedBranches[0].proofLabel).toBe('Homozygous DD');
  });

  it('evaluates Breeding Lab shared carrier risks and Herd Carrier Finder filters cleanly', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      confirmedCarrierOf: ['Dilute (dd)'],
    });
    const doe = makeAnimal('doe', {
      sex: 'Female',
      confirmedCarrierOf: ['Dilute (dd)'],
      suspectedCarrierOf: ['REW (cc)'],
    });
    const herd = buildSpeciesHerdMap([buck, doe], 'Rabbit');

    const risks = analyzePairingCarrierRisks(buck, doe, herd);
    expect(risks[0].severity).toBe('danger');
    expect(risks[0].trait).toBe('Dilute (dd)');

    const buckAnalysis = analyzeAnimalCarrierLineage(buck, herd);
    expect(doesAnimalMatchCarrierFilter(buckAnalysis, 'confirmed', 'dilute')).toBe(true);
    expect(doesAnimalMatchCarrierFilter(buckAnalysis, 'suspected', 'dilute')).toBe(false);
    expect(doesAnimalMatchCarrierFilter(buckAnalysis, 'any_risk', 'dilute')).toBe(true);
  });

  it('discloses carrier entries in Evans .HTM pedigrees for both subject and ancestors across 3-gen and 6-gen charts', () => {
    const settings = makeSettings();
    const profiles = [makeSpeciesProfile('Rabbit')];

    const grandsire = makeAnimal('gs', {
      name: 'Grandfather Buck',
      tattoo: 'GS1',
      sex: 'Male',
      confirmedCarrierOf: ['Dilute (dd)'],
      suspectedCarrierOf: ['Satin Coat'],
    });
    const sire = makeAnimal('sire', {
      name: 'Father Buck',
      tattoo: 'S1',
      sex: 'Male',
      sireId: grandsire.id,
    });
    const kit = makeAnimal('kit', {
      name: 'Junior Kit',
      tattoo: 'K1',
      sex: 'Female',
      rufusLevel: 'High',
      sireId: sire.id,
      suspectedCarrierOf: ['REW (cc)'],
    });

    const html3 = generateEvansHtmPedigree(kit, [kit, sire, grandsire], profiles, settings, 3);
    expect(html3).toContain('Suspected: REW (cc)');
    expect(html3).toContain('Lineage Potential: Dilute (dd) (Sire), Satin Coat (Sire)');
    expect(html3).toContain('Confirmed: Dilute (dd) · Suspected: Satin Coat');
    expect(html3).toContain('Rufus Intensity:');
    expect(html3).toContain('High');

    // Even in compact 6-gen mode, ancestor carrier disclosures remain visible
    const html6 = generateEvansHtmPedigree(kit, [kit, sire, grandsire], profiles, settings, 6);
    expect(html6).toContain('Suspected: REW (cc)');
    expect(html6).toContain('Conf: Dilute (dd)');
    expect(html6).toContain('Susp: Satin Coat');
  });

  it('includes compact carrier disclosures, Cleared proofs, Lineage Potential, and Rufus Intensity on Barn Binder', () => {
    const grandsire = makeAnimal('gs', {
      name: 'Atlas',
      tattoo: 'AT1',
      sex: 'Male',
      confirmedCarrierOf: ['BEW / Vienna (vv)'],
    });
    const kit = makeAnimal('kit', {
      name: 'Clover',
      tattoo: 'CL1',
      sex: 'Female',
      rufusLevel: 'Medium',
      sireId: grandsire.id,
      suspectedCarrierOf: ['Dilute (dd)'],
      clearedCarrierOf: [{ trait: 'Wide Band (ww)', proofType: 'test_bred', testBreedingCount: 3 }],
    });
    const snap = makeEmptySnapshot({
      animals: [grandsire, kit],
    });

    const binderHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { generations: 3 });
    expect(binderHtml).toContain('Confirmed Carrier Of');
    expect(binderHtml).toContain('Suspected Carrier Of');
    expect(binderHtml).toContain('Cleared (Non-Carrier Of)');
    expect(binderHtml).toContain('Test Bred 3x');
    expect(binderHtml).toContain('BEW / Vienna (vv)');
    expect(binderHtml).toContain('Suspected: Dilute (dd)');
    expect(binderHtml).toContain('Rufus Intensity');
    expect(binderHtml).toContain('Medium');
  });

  it('round-trips carrier disclosures, clearedCarrierOf, and rufusLevel cleanly through JSON and CSV exports', () => {
    const settings = makeSettings();
    const doe = makeAnimal('doe1', {
      name: 'Ruby Doe',
      rufusLevel: 'High',
      confirmedCarrierOf: ['Dilute (dd)'],
      suspectedCarrierOf: ['Satin Coat', 'dilute (dd)'],
      clearedCarrierOf: [{ trait: 'Wide Band (ww)', proofType: 'dna_tested' }],
    });
    const snap = makeEmptySnapshot({
      settings,
      animals: [doe],
    });

    const json = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(json, settings);
    expect(parsed.animals[0].confirmedCarrierOf).toEqual(['Dilute (dd)']);
    expect(parsed.animals[0].suspectedCarrierOf).toEqual(['Satin Coat']);
    expect(parsed.animals[0].rufusLevel).toBe('High');
    expect(parsed.animals[0].clearedCarrierOf).toEqual([
      { trait: 'Wide Band (ww)', proofType: 'dna_tested' },
    ]);

    const csv = exportAnimalsCsv(parsed.animals, parsed.speciesProfiles, parsed.settings);
    expect(csv).toContain('Rufus_Intensity');
    expect(csv).toContain('Confirmed_Carrier_Of');
    expect(csv).toContain('Suspected_Carrier_Of');
    expect(csv).toContain('Cleared_Carrier_Of');
    expect(csv).toContain('Lineage_Potential_Carriers');
    expect(csv).toContain('High');
    expect(csv).toContain('Dilute (dd)');
    expect(csv).toContain('Wide Band (ww) (DNA Clear)');
  });

  it('never silently assumes ww Wide-Band or Rufus level when importing a Red New Zealand Rabbit', async () => {
    const csvContent = [
      'Species,Name,Tattoo,Sex,Breed,Color,Notes',
      'Rabbit,Scarlet Queen,NZ1,Female,New Zealand,Red,Imported show doe',
    ].join('\n');

    const importer = getPlatformImporterById('herdboss');
    const preview = importer.parse(
      [{ fileName: 'rabbits.csv', bytes: new TextEncoder().encode(csvContent) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(1);
    const imported = preview.animals[0];
    expect(imported.variety).toBe('Red');
    expect(imported.genotypeRaw).toBe('');
    expect(imported.genotype).toEqual([]);
    expect(imported.rufusLevel).toBeUndefined();
  });

  it('scopes homozygous coat-locus clearances strictly by species and isolates custom species', () => {
    // Chinchilla VV must clear Violet (vv), NEVER Rabbit BEW / Vienna (vv)
    const chinSir = makeAnimal('ch_pgs', {
      species: 'Chinchilla',
      sex: 'Male',
      confirmedCarrierOf: ['Violet (vv)'],
    });
    const chinNonVioletDam = makeAnimal('ch_dam', {
      species: 'Chinchilla',
      sex: 'Female',
      sireId: chinSir.id,
      genotypeRaw: 'whwh toto bgbg VV SS EbEb AlAl',
    });
    const chinClear = extractHomozygousCoatClearances(chinNonVioletDam);
    expect(chinClear.some((c) => c.trait === 'Violet (vv)' && c.pair === 'VV')).toBe(true);
    expect(chinClear.some((c) => c.trait.includes('BEW'))).toBe(false);

    const chinKit = makeAnimal('ch_kit', {
      species: 'Chinchilla',
      sex: 'Male',
      damId: chinNonVioletDam.id,
    });
    const chinHerd = buildSpeciesHerdMap([chinSir, chinNonVioletDam, chinKit], 'Chinchilla');
    const chinLineage = analyzeAnimalCarrierLineage(chinKit, chinHerd);
    expect(chinLineage.lineagePotential).toHaveLength(0);
    expect(chinLineage.blockedBranches.some((b) => b.proofLabel === 'Homozygous VV')).toBe(true);

    // Cat: Bb1 carries cinnamon so must NOT clear Chocolate/Cinnamon; BB DOES clear it. Ccs must NOT clear Colorpoint; CC DOES.
    const catCarrierB1 = makeAnimal('cat_b1', {
      species: 'Cat',
      sex: 'Female',
      genotypeRaw: 'aa Bb1 Ccs DD oo ww ii',
    });
    const catCarrierClear = extractHomozygousCoatClearances(catCarrierB1);
    expect(catCarrierClear.some((c) => c.locus === 'B')).toBe(false);
    expect(catCarrierClear.some((c) => c.locus === 'C')).toBe(false);
    expect(catCarrierClear.some((c) => c.locus === 'D')).toBe(true);

    const catPure = makeAnimal('cat_pure', {
      species: 'Cat',
      sex: 'Female',
      genotypeRaw: 'aa BB CC DD oo ww ii',
    });
    const catPureClear = extractHomozygousCoatClearances(catPure);
    expect(catPureClear.some((c) => c.locus === 'B' && c.pair === 'BB')).toBe(true);
    expect(catPureClear.some((c) => c.locus === 'C' && c.pair === 'CC')).toBe(true);

    // Custom species with pre-populated genotype pairs MUST return []
    const customDuck = makeAnimal('duck1', {
      species: 'Heritage Duck',
      genotypeRaw: 'VV DD WW',
      genotype: [{ locus: 'V', allele1: 'V', allele2: 'V' }],
    });
    expect(extractHomozygousCoatClearances(customDuck)).toEqual([]);
  });
});

```

## `src/core/__tests__/clientCrm.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildSuggestedAgreementNumber,
  evaluateCrmFollowUpReminders,
  evaluateReservationFinancials,
  findWaitlistMatches,
  formatClientsCsv,
  formatReservationsCsv,
  formatWaitlistCsv,
  generateSalesAgreementHtml,
} from '../clientCrm';
import { Animal, AnimalReservation, BarnSettings, BreedingRecord, ClientContact, WaitlistEntry } from '../models';

const TS = '2026-06-01T12:00:00.000Z';

function makeClient(overrides: Partial<ClientContact> = {}): ClientContact {
  return {
    id: 'cli-1',
    species: 'Rabbit',
    fullName: 'Alice Walker',
    ranchOrHerdName: 'Walker Rabbitry',
    email: 'alice@example.com',
    phone: '555-0101',
    preferredContact: 'sms',
    clientKind: 'show_breeder',
    cityState: 'Ames, IA',
    shippingAddress: '',
    tags: ['repeat-buyer', 'holland-lop'],
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeWaitlist(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'wl-1',
    species: 'Rabbit',
    clientId: 'cli-1',
    clientName: 'Alice Walker',
    priorityRank: 1,
    status: 'Active',
    intent: 'Show / Breeding',
    desiredBreed: 'Holland Lop',
    desiredVariety: 'Broken Tort',
    preferredSex: 'Female',
    requestedByDateIso: '2026-08-01',
    inquiryDateIso: '2026-05-15',
    followUpDateIso: '2026-06-03',
    lastContactedDateIso: '2026-05-15',
    maxBudgetCents: 20000,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<AnimalReservation> = {}): AnimalReservation {
  return {
    id: 'res-1',
    species: 'Rabbit',
    agreementNumber: 'SA-0001',
    clientId: 'cli-1',
    clientName: 'Alice Walker',
    itemLabel: 'Maple — Broken Tort Doe',
    status: 'Pending Deposit',
    reservedDateIso: '2026-06-01',
    holdExpiresDateIso: '2026-06-04',
    totalPriceCents: 15000,
    depositRequiredCents: 5000,
    depositPaidCents: 0,
    depositDueDateIso: '2026-06-02',
    depositPaidDateIso: '',
    pickupScheduledDateIso: '2026-06-20',
    completedDateIso: '',
    balanceReminderDateIso: '2026-06-18',
    paymentMethod: 'Cash / Venmo',
    termsSummary: '',
    healthGuaranteeNotes: '',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

const baseSettings: BarnSettings = {
  id: 'barn_settings',
  barnName: 'Copper Creek Barn',
  breederName: 'Kimberly H.',
  preferredUnit: 'lbs_oz',
  currencyCode: 'USD',
  defaultSpecies: 'Rabbit',
  pinnedLandingSpecies: '',
  defaultGenerations: 3,
  themeMode: 'dark',
  updatedAt: TS,
};

describe('clientCrm engine', () => {
  it('computes reservation deposit coverage, balance remaining, and suggested status accurately', () => {
    const unpaid = evaluateReservationFinancials(makeReservation());
    expect(unpaid.depositRemainingCents).toBe(5000);
    expect(unpaid.balanceRemainingCents).toBe(15000);
    expect(unpaid.isDepositSatisfied).toBe(false);
    expect(unpaid.isPaidInFull).toBe(false);
    expect(unpaid.suggestedStatus).toBe('Pending Deposit');

    const deposited = evaluateReservationFinancials(
      makeReservation({ depositPaidCents: 5000, status: 'Pending Deposit' })
    );
    expect(deposited.depositRemainingCents).toBe(0);
    expect(deposited.balanceRemainingCents).toBe(10000);
    expect(deposited.depositCoveragePercent).toBe(100);
    expect(deposited.totalPaidPercent).toBe(33);
    expect(deposited.isDepositSatisfied).toBe(true);
    expect(deposited.suggestedStatus).toBe('Deposit Paid');

    const paidFull = evaluateReservationFinancials(
      makeReservation({ depositPaidCents: 15000, status: 'Deposit Paid' })
    );
    expect(paidFull.balanceRemainingCents).toBe(0);
    expect(paidFull.isPaidInFull).toBe(true);
    expect(paidFull.suggestedStatus).toBe('Paid in Full');
  });

  it('builds sequential agreement numbers cleanly', () => {
    expect(buildSuggestedAgreementNumber([])).toBe('SA-0001');
    expect(
      buildSuggestedAgreementNumber([
        { agreementNumber: 'SA-0004' },
        { agreementNumber: 'SA-0012' },
      ])
    ).toBe('SA-0013');
  });

  it('detects overdue deposits, expiring holds, upcoming pickups, and waitlist follow-ups sorted by urgency', () => {
    const summary = evaluateCrmFollowUpReminders({
      clients: [makeClient()],
      waitlistEntries: [makeWaitlist({ followUpDateIso: '2026-06-05' })],
      reservations: [
        makeReservation({
          depositDueDateIso: '2026-06-01', // 3 days overdue relative to 2026-06-04
          holdExpiresDateIso: '2026-06-04', // due today
          pickupScheduledDateIso: '2026-06-07', // upcoming in 3d
          balanceReminderDateIso: '2026-06-15', // > 3d lead, ignored for now
        }),
        makeReservation({
          id: 'res-done',
          status: 'Picked Up / Completed',
          depositPaidCents: 20000,
          totalPriceCents: 20000,
        }),
        makeReservation({
          id: 'res-cancel',
          status: 'Cancelled',
          depositDueDateIso: '2026-05-01',
        }),
      ],
      todayIso: '2026-06-04',
    });

    expect(summary.activeReservationsCount).toBe(1);
    expect(summary.completedReservationsCount).toBe(1);
    expect(summary.outstandingDepositsCents).toBe(5000);
    expect(summary.collectedDepositsCents).toBe(20000);
    expect(summary.overdueReminderCount).toBe(1);
    expect(summary.reminders.map((r) => r.kind)).toEqual([
      'deposit_overdue',
      'hold_expiring',
      'waitlist_follow_up',
      'pickup_upcoming',
    ]);
  });

  it('matches waitlist entries to available unreserved animals and active breedings only', () => {
    const animals: Animal[] = [
      {
        id: 'a-match',
        tattoo: 'M1',
        name: 'Maple',
        species: 'Rabbit',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Female',
        status: 'Junior',
        birthDateIso: '2026-04-01',
        weightGrams: 900,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'a-reserved',
        tattoo: 'M2',
        name: 'Clover',
        species: 'Rabbit',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Female',
        status: 'Junior',
        birthDateIso: '2026-04-01',
        weightGrams: 900,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'a-buck',
        tattoo: 'B1',
        name: 'Buckley',
        species: 'Rabbit',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Male',
        status: 'Active',
        birthDateIso: '2025-04-01',
        weightGrams: 1700,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const breedings: BreedingRecord[] = [
      {
        id: 'br-1',
        species: 'Rabbit',
        sireId: 'a-buck',
        damId: 'dam-1',
        sireName: 'Buckley',
        damName: 'Daisy',
        bredDateIso: '2026-05-20',
        expectedDueDateIso: '2026-06-20',
        actualBirthDateIso: '',
        projectedCoiPercent: 0,
        liveCount: 0,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        offspringCreated: false,
        status: 'Bred',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const matches = findWaitlistMatches(
      makeWaitlist({ preferredBreedingId: 'br-1' }),
      animals,
      breedings,
      [makeReservation({ animalId: 'a-reserved', status: 'Deposit Paid' })]
    );
    expect(matches.some((m) => m.id === 'a-match')).toBe(true);
    expect(matches.some((m) => m.id === 'a-reserved')).toBe(false);
    expect(matches.some((m) => m.id === 'a-buck')).toBe(false);
    expect(matches.some((m) => m.id === 'br-1')).toBe(true);
  });

  it('escapes CSV formulas and renders XSS-safe Sales Agreement HTML with active withdrawal notices', () => {
    const clientsCsv = formatClientsCsv([makeClient({ fullName: '=SUM(A1)' })]);
    expect(clientsCsv.startsWith('\uFEFF')).toBe(true);
    expect(clientsCsv).toContain("'=SUM(A1)");

    const waitlistCsv = formatWaitlistCsv([makeWaitlist()]);
    expect(waitlistCsv).toContain('Alice Walker');

    const resCsv = formatReservationsCsv([makeReservation()]);
    expect(resCsv).toContain('SA-0001');

    const html = generateSalesAgreementHtml({
      reservation: makeReservation({
        notes: '<script>alert("xss")</script>',
      }),
      client: makeClient({ fullName: '<b>Buyer & Sons</b>' }),
      settings: baseSettings,
      activeWithdrawal: {
        animalId: 'a-1',
        isActive: true,
        clearDateIso: '2026-06-15',
        daysRemaining: 11,
        countdownLabel: '11 days remaining',
        shortCountdownLabel: '11d left',
        activeLogs: [],
        medicationSummary: 'Ivermectin',
      },
      generatedDateIso: '2026-06-04',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;b&gt;Buyer &amp; Sons&lt;/b&gt;');
    expect(html).toContain('ACTIVE MEDICATION WITHDRAWAL DISCLOSURE');
    expect(html).toContain('Ivermectin');
    expect(html).toContain('SA-0001');
  });
});
```

## `src/core/__tests__/csvExport.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildCleanCsvExportFileName,
  escapeCsvCell,
  exportAnimalsCsv,
  formatParentReferenceForCsv,
  UTF8_BOM,
} from '../csvExport';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('csvExport — human-readable UTF-8 BOM spreadsheet export', () => {
  it('prepends a UTF-8 BOM and resolves parent UUIDs to readable names and tattoos', () => {
    const sireId = '550e8400-e29b-41d4-a716-446655440001';
    const damId = '550e8400-e29b-41d4-a716-446655440002';
    const kitId = '550e8400-e29b-41d4-a716-446655440003';

    const sire = makeAnimal(sireId, {
      name: 'Copper Creek Firestorm',
      tattoo: 'NZR-201',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Retired',
      archived: true,
    });
    const dam = makeAnimal(damId, {
      name: 'Crimson Clover',
      tattoo: 'NZR-202',
      species: 'Rabbit',
      sex: 'Female',
    });
    const kit = makeAnimal(kitId, {
      name: 'Ruby Rose',
      tattoo: 'NZR-301',
      species: 'Rabbit',
      breed: 'New Zealand',
      variety: 'Red',
      sex: 'Female',
      status: 'Junior',
      birthDateIso: '2026-08-10',
      sireId,
      damId,
      notes: 'Show prospect, gentle\nLine 2 "quoted"',
    });

    const snap = makeEmptySnapshot({
      animals: [kit, dam, sire],
      speciesProfiles: [makeSpeciesProfile('Rabbit')],
      settings: makeSettings({ preferredUnit: 'lbs_oz' }),
    });

    const csv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, snap.settings);

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    // Raw internal parent UUIDs must never leak into the spreadsheet
    expect(csv).not.toContain(sireId);
    expect(csv).not.toContain(damId);
    // Resolved parent names & tattoos must appear cleanly
    expect(csv).toContain('Copper Creek Firestorm (NZR-201),NZR-201,Crimson Clover (NZR-202),NZR-202');
    // Multi-line notes with commas and quotes are RFC-4180 escaped inside one cell
    expect(csv).toContain('"Show prospect, gentle\nLine 2 ""quoted"""');
  });

  it('handles missing/unlinked parent IDs and CRLF line breaks gracefully', () => {
    expect(formatParentReferenceForCsv(undefined, '')).toBe('');
    expect(formatParentReferenceForCsv(undefined, 'orphan-uuid-999')).toBe('Unknown / Unlinked');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('builds clean dated CSV export filenames from barn name and optional species', () => {
    expect(buildCleanCsvExportFileName('My Barn', undefined, '2026-11-16')).toBe(
      'pedigree-export-2026-11-16.csv'
    );
    expect(buildCleanCsvExportFileName('Copper Creek Barn', undefined, '2026-11-16')).toBe(
      'copper-creek-barn-export-2026-11-16.csv'
    );
    expect(buildCleanCsvExportFileName('My Barn', 'Rabbit', '2026-11-16')).toBe(
      'pedigree-rabbit-export-2026-11-16.csv'
    );
  });
});
```

## `src/core/__tests__/deviceCapability.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  assessBrowserCompatibility,
  BrowserFeatureSignals,
  buildLowMemorySettingsPatch,
  classifyDeviceCapability,
  DEVICE_CAPABILITY_TIER_LIST,
  DEVICE_CAPABILITY_TIERS,
  DeviceHardwareSignals,
  evaluateBarnWorkloadForTier,
  getHeavyZipExportGate,
  getTierStoragePolicy,
  TIER_STORAGE_POLICIES,
} from '../deviceCapability';

const MB = 1024 * 1024;

function makeSignals(overrides: Partial<DeviceHardwareSignals> = {}): DeviceHardwareSignals {
  return {
    deviceMemoryGb: null,
    hardwareConcurrency: 4,
    jsHeapLimitBytes: null,
    usedHeapBytes: null,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-A155U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    maxTouchPoints: 5,
    coarsePointer: true,
    screenWidthPx: 412,
    screenHeightPx: 915,
    devicePixelRatio: 2.6,
    ...overrides,
  };
}

function makeBrowserSignals(
  overrides: Partial<BrowserFeatureSignals> = {}
): BrowserFeatureSignals {
  return {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    promiseSupported: true,
    indexedDbSupported: true,
    wasmSupported: true,
    moduleWorkerSupported: true,
    opfsSupported: true,
    directoryPickerSupported: true,
    persistStorageSupported: true,
    clipboardWriteSupported: true,
    webShareFilesSupported: false,
    webpEncodeSupported: true,
    createImageBitmapSupported: true,
    workerRuntimeDisabled: false,
    ...overrides,
  };
}

describe('deviceCapability — 5-tier classification, closability rules & low-memory handling', () => {
  it('enforces exact Home & Settings closability/reopenability rules across all 5 tiers', () => {
    expect(DEVICE_CAPABILITY_TIERS[1].homeClosable).toBe(false);
    expect(DEVICE_CAPABILITY_TIERS[1].settingsClosable).toBe(false);

    expect(DEVICE_CAPABILITY_TIERS[2].homeClosable).toBe(true);
    expect(DEVICE_CAPABILITY_TIERS[2].settingsClosable).toBe(false);

    for (const tier of [3, 4, 5] as const) {
      expect(DEVICE_CAPABILITY_TIERS[tier].homeClosable).toBe(true);
      expect(DEVICE_CAPABILITY_TIERS[tier].settingsClosable).toBe(true);
      expect(DEVICE_CAPABILITY_TIERS[tier].canReopenInSettings).toBe(true);
    }

    expect(DEVICE_CAPABILITY_TIER_LIST).toHaveLength(5);
  });

  it('classifies mobile and tablet RAM profiles across Tiers 1 through 4 and desktops into Tier 5', () => {
    const tier1 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 1,
        hardwareConcurrency: 2,
        jsHeapLimitBytes: 96 * MB,
        userAgent: 'Mozilla/5.0 (Linux; Android 5.1.1; SM-G530T) Mobile Safari/537.36',
      })
    );
    expect(tier1.tier).toBe(1);
    expect(tier1.shouldApplyLowMemoryHandling).toBe(true);

    const tier2 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 2,
        hardwareConcurrency: 4,
        jsHeapLimitBytes: 220 * MB,
        userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G950U) Mobile Safari/537.36',
      })
    );
    expect(tier2.tier).toBe(2);
    expect(tier2.shouldApplyLowMemoryHandling).toBe(true);

    const tier2Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 3,
        hardwareConcurrency: 8,
        userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-T220) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        screenWidthPx: 800,
        screenHeightPx: 1340,
      })
    );
    expect(tier2Tablet.tier).toBe(2);
    expect(tier2Tablet.formFactor).toBe('tablet');

    const tier3 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        jsHeapLimitBytes: 512 * MB,
      })
    );
    expect(tier3.tier).toBe(3);
    expect(tier3.shouldApplyLowMemoryHandling).toBe(false);

    const tier3Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 8,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        screenWidthPx: 800,
        screenHeightPx: 1280,
      })
    );
    expect(tier3Tablet.tier).toBe(3);
    expect(tier3Tablet.formFactor).toBe('tablet');

    const tier4 = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
        jsHeapLimitBytes: 1024 * MB,
      })
    );
    expect(tier4.tier).toBe(4);
    expect(tier4.formFactor).toBe('phone');

    const tier4Tablet = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 8,
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 820,
        screenHeightPx: 1180,
      })
    );
    expect(tier4Tablet.tier).toBe(4);
    expect(tier4Tablet.formFactor).toBe('tablet');

    const tier5Desktop = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 8,
        hardwareConcurrency: 12,
        jsHeapLimitBytes: 2048 * MB,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
        coarsePointer: false,
        screenWidthPx: 1920,
        screenHeightPx: 1080,
      })
    );
    expect(tier5Desktop.tier).toBe(5);
    expect(tier5Desktop.formFactor).toBe('desktop');
  });

  it('classifies browsers without navigator.deviceMemory (such as iOS Safari) cleanly', () => {
    const legacyIphone = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 2,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 12_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 375,
        screenHeightPx: 667,
        devicePixelRatio: 2,
      })
    );
    expect(legacyIphone.tier).toBe(2);
    expect(legacyIphone.confidence).toBe('estimated');

    const modernIphone = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: null,
        hardwareConcurrency: 6,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        screenWidthPx: 393,
        screenHeightPx: 852,
        devicePixelRatio: 3,
      })
    );
    expect(modernIphone.tier).toBe(4);
  });

  it('down-tiers mobile devices when V8 JS heap limit is tightly constrained even if deviceMemory reads higher', () => {
    const tightHeapPhone = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 4,
        hardwareConcurrency: 4,
        jsHeapLimitBytes: 240 * MB,
      })
    );
    expect(tightHeapPhone.tier).toBe(2);
  });

  it('evaluates barn workload against device tier ceiling and suggests low-memory patches only for Tiers 1-2', () => {
    const tier2 = classifyDeviceCapability(makeSignals({ deviceMemoryGb: 2 }));
    const okLoad = evaluateBarnWorkloadForTier(1200, tier2);
    expect(okLoad.status).toBe('ok');
    expect(okLoad.guidance).toBeNull();

    const nearLoad = evaluateBarnWorkloadForTier(2500, tier2);
    expect(nearLoad.status).toBe('approaching_limit');
    expect(nearLoad.guidance).toContain('2,500');

    const overLoad = evaluateBarnWorkloadForTier(3400, tier2);
    expect(overLoad.status).toBe('over_limit');
    expect(overLoad.guidance).toContain('3,000');

    const heavySettingsPatch = buildLowMemorySettingsPatch(
      {
        imageOptimizationPreset: 'high_detail',
        defaultGenerations: 5,
        includePhotoOnPedigree: true,
      },
      tier2
    );
    expect(heavySettingsPatch).toEqual({
      imageOptimizationPreset: 'compact',
      defaultGenerations: 3,
      includePhotoOnPedigree: false,
    });

    const alreadySafePatch = buildLowMemorySettingsPatch(
      {
        imageOptimizationPreset: 'compact',
        defaultGenerations: 3,
        includePhotoOnPedigree: false,
      },
      tier2
    );
    expect(alreadySafePatch).toBeNull();

    const tier4 = classifyDeviceCapability(makeSignals({ deviceMemoryGb: 8, hardwareConcurrency: 8 }));
    expect(
      buildLowMemorySettingsPatch(
        {
          imageOptimizationPreset: 'high_detail',
          defaultGenerations: 5,
          includePhotoOnPedigree: true,
        },
        tier4
      )
    ).toBeNull();
  });

  it('enforces tightened local storage caps & thumbnail-light mirror dehydration on Tiers 1 and 2', () => {
    const t1 = getTierStoragePolicy(1);
    const t2 = getTierStoragePolicy(2);
    const t3 = getTierStoragePolicy(3);
    const t5 = getTierStoragePolicy(5);

    expect(t1.monthlyCap).toBe(2);
    expect(t1.preUpgradeCap).toBe(1);
    expect(t1.manualCap).toBe(3);
    expect(t1.rollingIdbCap).toBe(1);
    expect(t1.dehydrateMirrorPhotos).toBe(true);
    expect(t1.skipHeavyCanaryZip).toBe(true);
    expect(t1.compressVaultBackups).toBe(true);

    expect(t2.monthlyCap).toBe(3);
    expect(t2.manualCap).toBe(5);
    expect(t2.rollingIdbCap).toBe(2);
    expect(t2.dehydrateMirrorPhotos).toBe(true);
    expect(t2.maxSafeImportBytesHint).toBeGreaterThan(t1.maxSafeImportBytesHint);

    expect(t3.dehydrateMirrorPhotos).toBe(false);
    expect(t5.monthlyCap).toBe(6);
    expect(t5.preUpgradeCap).toBe(3);
    expect(t5.preResetCap).toBe(8);
    expect(t5.manualCap).toBe(12);
    expect(Object.keys(TIER_STORAGE_POLICIES)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('assesses browser compatibility gaps, WASM fallback state, and Tier 1 / outdated .ZIP confirmation gates', () => {
    const modernDesktop = classifyDeviceCapability(
      makeSignals({
        deviceMemoryGb: 16,
        hardwareConcurrency: 12,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
        coarsePointer: false,
      })
    );
    const modernBrowser = assessBrowserCompatibility(makeBrowserSignals(), modernDesktop.tier);
    expect(modernBrowser.isOutdatedBrowser).toBe(false);
    expect(modernBrowser.wasmFallbackActive).toBe(false);
    expect(modernBrowser.shouldConfirmHeavyZipExport).toBe(false);
    expect(getHeavyZipExportGate(modernDesktop, modernBrowser).requiresConfirmation).toBe(false);

    const tier1Device = classifyDeviceCapability(makeSignals({ deviceMemoryGb: 1, hardwareConcurrency: 2 }));
    const tier1Gate = getHeavyZipExportGate(tier1Device, assessBrowserCompatibility(makeBrowserSignals(), tier1Device.tier));
    expect(tier1Gate.requiresConfirmation).toBe(true);
    expect(tier1Gate.advice).toContain('.JSON');

    const olderSafari = assessBrowserCompatibility(
      makeBrowserSignals({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        wasmSupported: false,
        opfsSupported: false,
        directoryPickerSupported: false,
        persistStorageSupported: false,
        webpEncodeSupported: false,
      }),
      3
    );
    expect(olderSafari.isOutdatedBrowser).toBe(true);
    expect(olderSafari.wasmFallbackActive).toBe(true);
    expect(olderSafari.shouldConfirmHeavyZipExport).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'wasm')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'opfs')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'directoryPicker')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'persistStorage')).toBe(true);
    expect(olderSafari.unavailableFeatures.some((f) => f.key === 'webp')).toBe(true);
  });
});
```

## `src/core/__tests__/economicsLedger.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { repairBarnDataHealth } from '../dataHealthCheck';
import {
  calculateDressOutPercent,
  computeAnimalProfitMargins,
  computeFeedAllocationCostCents,
  computeLitterProfitMargins,
  evaluateProcessingSummary,
  evaluateSpeciesEconomicsSummary,
  evaluateYouthProjectSummary,
  formatEconomicsLedgerCsv,
  formatProcessingLogsCsv,
  generateYouthProjectReportHtml,
} from '../economicsLedger';
import {
  BreedingRecord,
  FeedAllocation,
  FeedBatch,
  LedgerEntry,
  ProcessingLog,
  YouthProjectBook,
} from '../models';
import { migrateAnimalsToSpecies } from '../speciesMigration';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

const TS = '2026-10-01T12:00:00.000Z';

describe('economicsLedger — P&L margins, processing yields & 4-H/FFA project books', () => {
  it('computes live-to-dressed carcass yield percentage accurately and handles invalid inputs safely', () => {
    expect(calculateDressOutPercent(2500, 1450)).toBe(58);
    expect(calculateDressOutPercent(3000, 1750)).toBe(58.3);
    expect(calculateDressOutPercent(0, 1200)).toBeUndefined();
    expect(calculateDressOutPercent(2500, 0)).toBeUndefined();
    expect(calculateDressOutPercent(Number.NaN, 1200)).toBeUndefined();
  });

  it('computes per-animal and per-litter profit margins across sales, purchases, stud fees, allocated feed, and processing', () => {
    const buck = makeAnimal('a-buck', {
      name: 'OakridgeRex',
      sex: 'Male',
      purchaseCostCents: 6500,
    });
    const doe = makeAnimal('a-doe', {
      name: 'CloverBelle',
      sex: 'Female',
      purchaseCostCents: 5000,
    });
    const kitSold = makeAnimal('a-kit-1', {
      name: 'Clover Kit 1',
      status: 'Sold',
      sireId: 'a-buck',
      damId: 'a-doe',
      birthDateIso: '2026-06-01',
      soldDateIso: '2026-08-15',
      salePriceCents: 7500,
    });

    const breeding: BreedingRecord = {
      id: 'br-1',
      species: 'Rabbit',
      sireId: 'a-buck',
      damId: 'a-doe',
      sireName: 'OakridgeRex',
      damName: 'CloverBelle',
      bredDateIso: '2026-05-01',
      expectedDueDateIso: '2026-06-01',
      actualBirthDateIso: '2026-06-01',
      projectedCoiPercent: 0,
      liveCount: 6,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 5,
      offspringCreated: true,
      status: 'Weaned',
      serviceFeeCents: 2500,
      serviceFeeDirection: 'earned',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const feedBatch: FeedBatch = {
      id: 'fb-1',
      species: 'Rabbit',
      brand: 'Purina',
      productName: 'Show Pellet',
      lotNumber: 'LOT-9',
      millCode: 'M1',
      manufactureDateIso: '2026-06-01',
      purchaseDateIso: '2026-06-02',
      bagCount: 2,
      bagWeightValue: 50,
      bagWeightUnit: 'lbs',
      totalQuantity: 100,
      remainingQuantity: 50,
      lowStockThreshold: 20,
      totalCostCents: 5000,
      supplierName: 'Local Co-op',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const allocations: FeedAllocation[] = [
      {
        id: 'fa-1',
        species: 'Rabbit',
        feedBatchId: 'fb-1',
        targetType: 'litter',
        targetId: 'br-1',
        targetLabel: 'CloverBelle × OakridgeRex',
        quantity: 20,
        unit: 'lbs',
        dateIso: '2026-06-20',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'fa-2',
        species: 'Rabbit',
        feedBatchId: 'fb-1',
        targetType: 'animal',
        targetId: 'a-buck',
        targetLabel: 'OakridgeRex',
        quantity: 10,
        unit: 'lbs',
        dateIso: '2026-06-22',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const batchMap = new Map([[feedBatch.id, feedBatch]]);
    expect(computeFeedAllocationCostCents(allocations[0], batchMap)).toBe(1000);
    expect(computeFeedAllocationCostCents(allocations[1], batchMap)).toBe(500);

    const ledgerEntries: LedgerEntry[] = [
      {
        id: 'le-bedding',
        species: 'Rabbit',
        dateIso: '2026-06-15',
        entryType: 'expense',
        category: 'bedding',
        amountCents: 1200,
        title: 'Pine Shavings',
        vendorOrParty: 'Tractor Supply',
        linkedBreedingId: 'br-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'le-vet-buck',
        species: 'Rabbit',
        dateIso: '2026-07-01',
        entryType: 'expense',
        category: 'vet',
        amountCents: 1500,
        title: 'Nail & Ear Check',
        vendorOrParty: 'Barn Vet',
        linkedAnimalId: 'a-buck',
        receiptPhotoDataUrl: 'data:image/webp;base64,AAA',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'le-feed-linked',
        species: 'Rabbit',
        dateIso: '2026-06-02',
        entryType: 'expense',
        category: 'feed',
        amountCents: 5000,
        title: 'Show Pellet Bags',
        vendorOrParty: 'Local Co-op',
        linkedFeedBatchId: 'fb-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const processingLogs: ProcessingLog[] = [
      {
        id: 'pl-1',
        species: 'Rabbit',
        title: 'Litter Fryer Harvest',
        linkedBreedingId: 'br-1',
        scheduledDateIso: '2026-08-20',
        harvestDateIso: '2026-08-20',
        status: 'Processed',
        animalCount: 2,
        liveWeightGrams: 5000,
        dressedWeightGrams: 2900,
        dressOutPercent: 58,
        peltCount: 2,
        peltGrade: 'Prime',
        peltColorNotes: 'Dense glossy coat',
        processingCostCents: 800,
        meatValueCents: 3200,
        peltValueCents: 1400,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const animalRows = computeAnimalProfitMargins({
      animals: [buck, doe, kitSold],
      breedings: [breeding],
      ledgerEntries,
      feedBatches: [feedBatch],
      feedAllocations: allocations,
      processingLogs,
    });

    const buckRow = animalRows.find((r) => r.animal.id === 'a-buck');
    expect(buckRow).toBeDefined();
    expect(buckRow?.studFeesEarnedCents).toBe(2500);
    expect(buckRow?.purchaseCostCents).toBe(6500);
    expect(buckRow?.allocatedFeedCostCents).toBe(500);
    expect(buckRow?.ledgerExpenseCents).toBe(1500);
    expect(buckRow?.netProfitCents).toBe(2500 - (6500 + 500 + 1500));

    const litterRows = computeLitterProfitMargins({
      animals: [buck, doe, kitSold],
      breedings: [breeding],
      ledgerEntries,
      feedBatches: [feedBatch],
      feedAllocations: allocations,
      processingLogs,
    });
    expect(litterRows).toHaveLength(1);
    const litter = litterRows[0];
    expect(litter.offspringSalesCents).toBe(7500);
    expect(litter.studFeesEarnedCents).toBe(2500);
    expect(litter.processingRevenueCents).toBe(4600); // 3200 + 1400
    expect(litter.totalRevenueCents).toBe(14600);
    expect(litter.allocatedFeedCostCents).toBe(1000);
    expect(litter.ledgerExpenseCents).toBe(1200);
    expect(litter.processingCostCents).toBe(800);
    expect(litter.totalCostCents).toBe(3000);
    expect(litter.netProfitCents).toBe(11600);
    expect(litter.costPerWeanedCents).toBe(600); // 3000 / 5 weaned

    // Species economics summary must avoid double-counting feedBatch fb-1 already linked by le-feed-linked
    const summary = evaluateSpeciesEconomicsSummary({
      animals: [buck, doe, kitSold],
      breedings: [breeding],
      ledgerEntries,
      feedBatches: [feedBatch],
      processingLogs,
      currencyCode: 'USD',
    });
    expect(summary.unlinkedFeedBatchCostCents).toBe(0);
    expect(summary.ledgerExpensesCents).toBe(7700); // 1200 + 1500 + 5000
    expect(summary.totalRevenueCents).toBe(7500 + 2500 + 4600);
    expect(summary.totalExpenseCents).toBe(11500 + 7700 + 800); // purchases 11500 + ledger 7700 + proc 800
    expect(summary.receiptAttachedCount).toBe(1);
    expect(summary.expenseBreakdown.length).toBeGreaterThan(0);
  });

  it('summarizes scheduled vs overdue vs processed meat/pelt yields and pelt grade tallies', () => {
    const logs: ProcessingLog[] = [
      {
        id: 'p-1',
        species: 'Rabbit',
        title: 'Batch A',
        scheduledDateIso: '2026-09-01',
        harvestDateIso: '2026-09-01',
        status: 'Processed',
        animalCount: 4,
        liveWeightGrams: 10000,
        dressedWeightGrams: 5800,
        peltCount: 4,
        peltGrade: 'Prime',
        peltColorNotes: 'Castor',
        processingCostCents: 1000,
        meatValueCents: 6400,
        peltValueCents: 2000,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'p-2',
        species: 'Rabbit',
        title: 'Batch Overdue',
        scheduledDateIso: '2026-10-05',
        harvestDateIso: '',
        status: 'Scheduled',
        animalCount: 3,
        liveWeightGrams: 0,
        dressedWeightGrams: 0,
        peltCount: 0,
        peltGrade: '',
        peltColorNotes: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'p-3',
        species: 'Rabbit',
        title: 'Batch Upcoming',
        scheduledDateIso: '2026-10-25',
        harvestDateIso: '',
        status: 'Scheduled',
        animalCount: 2,
        liveWeightGrams: 0,
        dressedWeightGrams: 0,
        peltCount: 0,
        peltGrade: '',
        peltColorNotes: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'p-4',
        species: 'Rabbit',
        title: 'Batch Cancelled',
        scheduledDateIso: '2026-10-02',
        harvestDateIso: '',
        status: 'Cancelled',
        animalCount: 1,
        liveWeightGrams: 0,
        dressedWeightGrams: 0,
        peltCount: 0,
        peltGrade: 'Cull',
        peltColorNotes: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const summary = evaluateProcessingSummary(logs, '2026-10-10');
    expect(summary.totalLogs).toBe(4);
    expect(summary.processedCount).toBe(1);
    expect(summary.scheduledCount).toBe(2);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.overdueScheduledLogs.map((l) => l.id)).toEqual(['p-2']);
    expect(summary.upcomingScheduledLogs.map((l) => l.id)).toEqual(['p-3']);
    expect(summary.averageDressOutPercent).toBe(58);
    expect(summary.totalPelts).toBe(4);
    expect(summary.peltGradeCounts).toEqual({ Prime: 4 });
    expect(summary.totalMeatValueCents).toBe(6400);
    expect(summary.totalPeltValueCents).toBe(2000);
  });

  it('evaluates 4-H/FFA Youth Project books without double counting sales and escapes HTML safely', () => {
    const projectAnimal = makeAnimal('a-4h', {
      name: 'Fair Champion',
      purchaseCostCents: 4000,
      salePriceCents: 9000,
    });
    const projectBook: YouthProjectBook = {
      id: 'yp-1',
      species: 'Rabbit',
      organization: '4-H',
      projectTitle: '<script>alert(1)</script>Market Rabbit SAE',
      memberName: 'Alex Mercer',
      clubOrChapter: 'Valley Clover 4-H',
      leaderOrAdvisor: 'Coach Kim',
      projectYear: '2026',
      startDateIso: '2026-01-15',
      endDateIso: '2026-09-30',
      status: 'Completed',
      linkedAnimalIds: ['a-4h'],
      linkedBreedingIds: [],
      startingInventoryValueCents: 5000,
      endingInventoryValueCents: 7500,
      feedLogs: [
        {
          id: 'fl-1',
          dateIso: '2026-03-01',
          feedType: '18% Show Pellet',
          quantity: 50,
          unit: 'lbs',
          costCents: 2200,
        },
      ],
      goalsAndReflection: 'Learned tattooing and daily condition scoring.',
      showAndCommunityNotes: 'Won Best of Breed & Youth Showmanship.',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    };

    const linkedLedger: LedgerEntry[] = [
      {
        id: 'le-sale',
        species: 'Rabbit',
        dateIso: '2026-09-15',
        entryType: 'income',
        category: 'animal_sale',
        amountCents: 9000, // matches a-4h salePriceCents; must not double-count
        title: 'Fair Auction Sale',
        vendorOrParty: 'County Fair Auction',
        linkedAnimalId: 'a-4h',
        linkedProjectId: 'yp-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'le-show',
        species: 'Rabbit',
        dateIso: '2026-08-20',
        entryType: 'expense',
        category: 'show_entry',
        amountCents: 800,
        title: 'Fair Entry Fee',
        vendorOrParty: 'County Fair',
        linkedProjectId: 'yp-1',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];

    const summary = evaluateYouthProjectSummary(projectBook, {
      animals: [projectAnimal],
      breedings: [],
      ledgerEntries: linkedLedger,
    });

    expect(summary.totalFeedLogCostCents).toBe(2200);
    expect(summary.ledgerIncomeCents).toBe(9000);
    expect(summary.enrolledAnimalSalesCents).toBe(0); // deduplicated via le-sale
    expect(summary.totalIncomeCents).toBe(9000);
    expect(summary.totalExpenseCents).toBe(4000 + 2200 + 800); // 7000
    expect(summary.cashNetCents).toBe(2000);
    expect(summary.inventoryDeltaCents).toBe(2500); // 7500 - 5000
    expect(summary.netProjectProfitCents).toBe(4500);

    const html = generateYouthProjectReportHtml({
      summary,
      settings: makeSettings(),
      speciesProfile: makeSpeciesProfile('Rabbit'),
      generatedDateIso: '2026-10-01',
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Market Rabbit SAE');
    expect(html).toContain('18% Show Pellet');

    const ledgerCsv = formatEconomicsLedgerCsv(linkedLedger, 'USD');
    expect(ledgerCsv.startsWith('\uFEFF')).toBe(true);
    expect(ledgerCsv).toContain('Fair Auction Sale');

    const procCsv = formatProcessingLogsCsv([], 'lbs_oz', 'USD');
    expect(procCsv.startsWith('\uFEFF')).toBe(true);
    expect(procCsv).toContain('Dress-Out %');
  });

  it('keeps ledger, processing, and project book records healthy across repair & species migration', () => {
    const animal = makeAnimal('a-1', { species: 'Rabbit' });
    const snapshot = makeEmptySnapshot({
      animals: [animal],
      ledgerEntries: [
        {
          id: 'le-1',
          species: 'Rabbit',
          dateIso: '2026-08-01',
          entryType: 'expense',
          category: 'supplies',
          amountCents: -500,
          title: 'Water Crocks',
          vendorOrParty: 'Supply Store',
          linkedAnimalId: 'a-1',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      processingLogs: [
        {
          id: 'pl-neg',
          species: 'Rabbit',
          title: 'Bad Weight',
          scheduledDateIso: '2026-08-05',
          harvestDateIso: '',
          status: 'Scheduled',
          animalCount: 0,
          liveWeightGrams: -100,
          dressedWeightGrams: -50,
          peltCount: -1,
          peltGrade: '',
          peltColorNotes: '',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });

    const repaired = repairBarnDataHealth(snapshot);
    expect(repaired.nextSnapshot.ledgerEntries?.[0]?.amountCents).toBe(0);
    expect(repaired.nextSnapshot.processingLogs?.[0]?.liveWeightGrams).toBe(0);

    const migrated = migrateAnimalsToSpecies(
      repaired.nextSnapshot,
      ['a-1'],
      'Meat Rabbit',
      { migrateEntireSpecies: true, sourceSpeciesName: 'Rabbit' }
    );
    expect(migrated.snapshot.ledgerEntries?.[0]?.species).toBe('Meat Rabbit');
    expect(migrated.snapshot.processingLogs?.[0]?.species).toBe('Meat Rabbit');
  });
});
```

## `src/core/__tests__/exportersRegistry.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildExporterCatalog,
  BUILTIN_NON_NATIVE_EXPORTERS,
  EXTERNAL_EXPORTERS,
  getExternalExporterById,
  PLANNED_EXTERNAL_SCHEMA_TARGETS,
  runExternalExporter,
} from '../exporters/registry';
import type { ExternalExporterDescriptor } from '../exporters/exporterTypes';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';

describe('exporters/registry — extensible non-native format exporters', () => {
  it('registers all built-in ready exporters and planned external schema targets with unique IDs', () => {
    const ids = new Set<string>();
    for (const exp of EXTERNAL_EXPORTERS) {
      expect(exp.id.trim().length).toBeGreaterThan(0);
      expect(ids.has(exp.id)).toBe(false);
      ids.add(exp.id);
      if (exp.status === 'ready') {
        expect(typeof exp.exportPayload).toBe('function');
      }
    }
    expect(BUILTIN_NON_NATIVE_EXPORTERS.length).toBeGreaterThanOrEqual(5);
    expect(PLANNED_EXTERNAL_SCHEMA_TARGETS.length).toBeGreaterThanOrEqual(1);
    expect(getExternalExporterById('clean-csv')?.formatExtension).toBe('.CSV');
  });

  it('executes CSV, Evans .HTM, Barn Binder .HTM, Report DTO .JSON, and .ICS exporters in pure TS', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const rabbit = snapshot.animals.find((a) => a.species === 'Rabbit')!;

    const csv = runExternalExporter('clean-csv', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(csv.filename.endsWith('.csv')).toBe(true);
    expect(csv.content.charCodeAt(0)).toBe(0xfeff);
    expect(csv.recordCount).toBeGreaterThan(0);

    const evans = runExternalExporter('evans-htm', {
      snapshot,
      speciesName: 'Rabbit',
      animalId: rabbit.id,
      generations: 8,
    });
    expect(evans.filename.endsWith('.htm')).toBe(true);
    expect(evans.content).toContain(rabbit.name);
    expect(evans.content).toContain('8-Generation');

    const card = runExternalExporter('shareable-pedigree-card', {
      snapshot,
      speciesName: 'Rabbit',
      animalId: rabbit.id,
      generations: 6,
    });
    expect(card.filename.endsWith('.html')).toBe(true);
    expect(card.mimeType).toBe('text/html;charset=utf-8');
    expect(card.content).toContain(rabbit.name);
    expect(card.content).toContain('3-Generation Lineage Summary');

    const binder = runExternalExporter('barn-binder-htm', {
      snapshot,
      speciesName: 'Rabbit',
      includeArchived: false,
    });
    expect(binder.filename.endsWith('.htm')).toBe(true);
    expect(binder.content).toContain('Rabbit');

    const dto = runExternalExporter('pdf-report-dto-json', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(dto.filename.endsWith('.json')).toBe(true);
    const parsedDto = JSON.parse(dto.content);
    expect(parsedDto.filterSpecies).toBe('Rabbit');
    expect(Array.isArray(parsedDto.animals)).toBe(true);

    const ics = runExternalExporter('calendar-ics', {
      snapshot: {
        ...snapshot,
        tasks: [
          ...snapshot.tasks,
          {
            id: 'task-export-test',
            species: 'Rabbit',
            title: 'Kindling Nestbox Check',
            category: 'Birth Check',
            priority: 'High',
            dueDateIso: '2026-11-25',
            linkedAnimalId: rabbit.id,
            linkedAnimalName: rabbit.name,
            linkedBreedingId: '',
            completed: false,
            createdAt: '2026-11-18T12:00:00Z',
            updatedAt: '2026-11-18T12:00:00Z',
          },
        ],
      },
      speciesName: 'Rabbit',
    });
    expect(ics.filename.endsWith('.ics')).toBe(true);
    expect(ics.content).toContain('BEGIN:VCALENDAR');
    expect(ics.content).toContain('Kindling Nestbox Check');
  });

  it('supports extending or overriding catalog entries cleanly without UI code changes', () => {
    const customSchema: ExternalExporterDescriptor = {
      id: 'kintracs-custom-csv',
      name: 'Kintracs Transfer CSV',
      formatExtension: '.CSV',
      category: 'external_schema',
      targetPlatform: 'Kintracs',
      scopeMode: 'all_or_species',
      supportsSpeciesFilter: true,
      status: 'ready',
      description: 'Custom external schema extension test.',
      compatibilityNote: 'Pure extensible registry test.',
      exportPayload: ({ snapshot }) => ({
        exporterId: 'kintracs-custom-csv',
        filename: 'kintracs-export.csv',
        mimeType: 'text/csv;charset=utf-8',
        content: `Count\n${snapshot.animals.length}`,
        recordCount: snapshot.animals.length,
        summary: 'Custom export succeeded.',
        warnings: [],
      }),
    };

    const extendedCatalog = buildExporterCatalog([customSchema]);
    const snapshot = buildFullPredefinedSampleSnapshot();
    const res = runExternalExporter('kintracs-custom-csv', { snapshot }, extendedCatalog);
    expect(res.filename).toBe('kintracs-export.csv');
    expect(res.recordCount).toBe(snapshot.animals.length);

    expect(() => runExternalExporter('herdboss-transfer-bundle', { snapshot })).toThrow(
      /planned external schema target/i
    );
  });
});
```

## `src/core/__tests__/facilityBoard.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildCageMaintenanceTaskDraft,
  buildFacilityBoardModel,
  compareNaturalLabels,
  diffCalendarDaysIso,
  evaluateCageFeedStatus,
  evaluateCageMaintenanceStatus,
  inferHousingUnitType,
  matchesFacilityBoardFilter,
} from '../facilityBoard';
import { BarnTask, CageLocation } from '../models';
import { makeAnimal } from './testFixtures';

const TS = '2026-11-01T00:00:00.000Z';

function makeCage(id: string, overrides: Partial<CageLocation> = {}): CageLocation {
  return {
    id,
    species: 'Rabbit',
    label: `Hutch ${id}`,
    section: 'Row A',
    capacity: 1,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeTask(id: string, overrides: Partial<BarnTask> = {}): BarnTask {
  return {
    id,
    species: 'Rabbit',
    title: 'Clean hutch',
    category: 'Care',
    priority: 'Normal',
    dueDateIso: '2026-11-21',
    linkedAnimalId: '',
    linkedAnimalName: '',
    linkedBreedingId: '',
    completed: false,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('facilityBoard — visual hutch-row board, feedlot rollups & maintenance schedules', () => {
  it('computes pure UTC calendar day differences and natural alphanumeric sorting', () => {
    expect(diffCalendarDaysIso('2026-11-20', '2026-11-27')).toBe(7);
    expect(diffCalendarDaysIso('2026-11-20', '2026-11-18')).toBe(-2);
    expect(diffCalendarDaysIso('2026-11-20', '2026-11-20')).toBe(0);
    expect(diffCalendarDaysIso('bad-date', '2026-11-20')).toBeNull();

    const unsorted = ['Row 10', 'Row 2', 'Row 1', 'North Pasture'];
    expect([...unsorted].sort(compareNaturalLabels)).toEqual([
      'North Pasture',
      'Row 1',
      'Row 2',
      'Row 10',
    ]);
  });

  it('infers sensible housing unit types from label and section hints', () => {
    expect(inferHousingUnitType({ label: 'North Pasture', section: 'Field' })).toBe('pasture');
    expect(inferHousingUnitType({ label: 'Colony Run 1', section: 'East Yard' })).toBe('colony');
    expect(inferHousingUnitType({ label: 'Stall 4', section: 'Main Barn' })).toBe('stall');
    expect(inferHousingUnitType({ label: 'Hutch R-01', section: 'Row A' })).toBe('hutch');
    expect(inferHousingUnitType({ label: 'Growout Pen 2', section: 'West Wall' })).toBe('pen');
    expect(inferHousingUnitType({ label: 'R-01', section: 'Row A', unitType: 'stall' })).toBe('stall');
  });

  it('evaluates recurring maintenance statuses accurately across overdue, due_today, due_soon, ok, unlogged, and none', () => {
    const today = '2026-11-20';

    expect(evaluateCageMaintenanceStatus(makeCage('c0'), today).state).toBe('none');

    const unlogged = evaluateCageMaintenanceStatus(
      makeCage('c1', { maintenanceIntervalDays: 7, maintenanceTaskLabel: 'Sanitize pan' }),
      today
    );
    expect(unlogged.state).toBe('unlogged');
    expect(unlogged.nextDueDateIso).toBe(today);

    const overdue = evaluateCageMaintenanceStatus(
      makeCage('c2', { maintenanceIntervalDays: 7, lastMaintenanceDateIso: '2026-11-10' }),
      today
    );
    expect(overdue.state).toBe('overdue');
    expect(overdue.nextDueDateIso).toBe('2026-11-17');
    expect(overdue.daysUntilDue).toBe(-3);

    const dueToday = evaluateCageMaintenanceStatus(
      makeCage('c3', { maintenanceIntervalDays: 7, lastMaintenanceDateIso: '2026-11-13' }),
      today
    );
    expect(dueToday.state).toBe('due_today');
    expect(dueToday.daysUntilDue).toBe(0);

    const dueSoon = evaluateCageMaintenanceStatus(
      makeCage('c4', { maintenanceIntervalDays: 7, lastMaintenanceDateIso: '2026-11-15' }),
      today
    );
    expect(dueSoon.state).toBe('due_soon');
    expect(dueSoon.daysUntilDue).toBe(2);

    const ok = evaluateCageMaintenanceStatus(
      makeCage('c5', { maintenanceIntervalDays: 14, lastMaintenanceDateIso: '2026-11-18' }),
      today
    );
    expect(ok.state).toBe('ok');
    expect(ok.daysUntilDue).toBe(12);
  });

  it('evaluates feedlot stock statuses (none, depleted, low, ok)', () => {
    const none = evaluateCageFeedStatus(makeCage('f0'));
    expect(none.hasFeedLink).toBe(false);
    expect(none.isLowStock).toBe(false);

    const depleted = evaluateCageFeedStatus(
      makeCage('f1', { feedLotName: 'Pellet Bin', feedStockRemaining: 0, feedLowThreshold: 10 })
    );
    expect(depleted.hasFeedLink).toBe(true);
    expect(depleted.isDepleted).toBe(true);
    expect(depleted.isLowStock).toBe(true);

    const low = evaluateCageFeedStatus(
      makeCage('f2', { feedLotName: 'Pellet Bin', feedStockRemaining: 8, feedLowThreshold: 10 })
    );
    expect(low.hasFeedLink).toBe(true);
    expect(low.isDepleted).toBe(false);
    expect(low.isLowStock).toBe(true);

    const ok = evaluateCageFeedStatus(
      makeCage('f3', { feedLotName: 'Pellet Bin', feedStockRemaining: 25, feedLowThreshold: 10 })
    );
    expect(ok.hasFeedLink).toBe(true);
    expect(ok.isDepleted).toBe(false);
    expect(ok.isLowStock).toBe(false);
  });

  it('groups pens by physical section, rolls up feedlots, detects unregistered pens and unassigned animals, and enforces species isolation', () => {
    const cages: CageLocation[] = [
      makeCage('c-10', {
        label: 'Hutch A-10',
        section: 'Row 10',
        capacity: 1,
        feedLotName: '16% Pellet Bin',
        feedStockRemaining: 5,
        feedStockUnit: 'lbs',
        feedLowThreshold: 10,
        maintenanceIntervalDays: 7,
        lastMaintenanceDateIso: '2026-11-10',
      }),
      makeCage('c-2', {
        label: 'Hutch A-2',
        section: 'Row 2',
        capacity: 2,
        feedLotName: '16% Pellet Bin',
        feedStockRemaining: 5,
        feedStockUnit: 'lbs',
        feedLowThreshold: 10,
      }),
      makeCage('c-general', {
        label: 'Colony Q-1',
        section: '',
        capacity: 1,
        unitType: 'colony',
      }),
      makeCage('c-sheep', {
        species: 'Sheep',
        label: 'Pasture S-1',
        section: 'South Field',
        capacity: 10,
      }),
    ];

    const animals = [
      makeAnimal('a1', { name: 'Clover', cageLocation: 'Hutch A-10' }),
      makeAnimal('a2', { name: 'Maple', cageLocation: 'Hutch A-10' }), // causes over-capacity 2/1
      makeAnimal('a3', { name: 'Thistle', cageLocation: 'Hutch A-2' }),
      makeAnimal('a4', { name: 'Unassigned Kit', cageLocation: '' }),
      makeAnimal('a5', { name: 'Growout Kit', cageLocation: 'Growout Pen G-1' }), // unregistered cage
      makeAnimal('sh1', { species: 'Sheep', name: 'Ewe 1', cageLocation: 'Pasture S-1' }),
    ];

    const tasks: BarnTask[] = [
      makeTask('t1', { title: 'Hutch A-10: Sanitize & refill', linkedAnimalId: 'a1' }),
      makeTask('t2', { title: 'Unrelated chore', linkedAnimalId: 'a4' }),
      makeTask('t3', { species: 'Sheep', title: 'Pasture S-1: Fence check' }),
    ];

    const board = buildFacilityBoardModel({
      cages,
      animals,
      tasks,
      speciesName: 'Rabbit',
      todayIso: '2026-11-20',
    });

    // Natural section ordering with General Barn last
    expect(board.sections.map((s) => s.sectionName)).toEqual(['Row 2', 'Row 10', 'General Barn']);
    expect(board.totals.totalPens).toBe(3);
    expect(board.totals.overCapacityPens).toBe(1);
    expect(board.totals.maintenanceDueOrOverdue).toBe(1);
    expect(board.totals.lowFeedPens).toBe(2);
    expect(board.unassignedActiveAnimals.map((a) => a.id)).toEqual(['a4']);
    expect(board.unregisteredCages).toHaveLength(1);
    expect(board.unregisteredCages[0].label).toBe('Growout Pen G-1');
    expect(board.unregisteredCages[0].animals.map((a) => a.id)).toEqual(['a5']);

    // Feedlot rollup merges both pens sharing "16% Pellet Bin"
    expect(board.feedLots).toHaveLength(1);
    expect(board.feedLots[0].penCount).toBe(2);
    expect(board.feedLots[0].animalCount).toBe(3);
    expect(board.feedLots[0].hasLowStock).toBe(true);

    // Filter checks
    const row10Pen = board.sections[1].pens[0];
    expect(row10Pen.openLinkedTasks.map((t) => t.id)).toEqual(['t1']);
    expect(matchesFacilityBoardFilter(row10Pen, 'over_capacity')).toBe(true);
    expect(matchesFacilityBoardFilter(row10Pen, 'maintenance_due')).toBe(true);
    expect(matchesFacilityBoardFilter(row10Pen, 'low_feed')).toBe(true);
    expect(matchesFacilityBoardFilter(row10Pen, 'open')).toBe(false);

    const row2Pen = board.sections[0].pens[0];
    expect(matchesFacilityBoardFilter(row2Pen, 'open')).toBe(true);
    expect(matchesFacilityBoardFilter(row2Pen, 'over_capacity')).toBe(false);
  });

  it('builds recurring maintenance Master Task List drafts using pure UTC calendar math', () => {
    const cage = makeCage('c1', {
      label: 'Hutch B-04',
      maintenanceIntervalDays: 14,
      maintenanceTaskLabel: 'Deep clean wire & trays',
    });
    const draft = buildCageMaintenanceTaskDraft(cage, '2026-11-20');
    expect(draft).not.toBeNull();
    expect(draft!.species).toBe('Rabbit');
    expect(draft!.title).toBe('[Hutch B-04] Deep clean wire & trays');
    expect(draft!.dueDateIso).toBe('2026-12-04');
    expect(draft!.completed).toBe(false);
  });
});
```

## `src/core/__tests__/feedInventory.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { repairBarnDataHealth } from '../dataHealthCheck';
import {
  applyFeedAllocationToBatch,
  evaluateFeedInventorySummary,
  extractFeedTagDetailsFromOcrText,
  findPurgeEligibleFeedTagPhotos,
  formatFeedLedgerCsv,
  isFeedBatchLowStock,
  purgeExpiredFeedTagPhotosPure,
  reverseFeedAllocationFromBatch,
  traceFeedLotToCagesAndLitters,
} from '../feedInventory';
import {
  FEED_MANUFACTURER_DIRECTORY,
  filterFeedManufacturerDirectory,
  matchManufacturerForBrand,
} from '../feedManufacturerDirectory';
import {
  BreedingRecord,
  CageLocation,
  FeedAllocation,
  FeedBatch,
  normalizeFeedPurgeWindowDays,
} from '../models';
import { countAllSpeciesRecords, purgeAllSpeciesRecordsPure } from '../sampleData';
import {
  exportBarnBackupJson,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot } from './testFixtures';

const TS = '2026-04-01T12:00:00.000Z';

function makeBatch(id: string, overrides: Partial<FeedBatch> = {}): FeedBatch {
  return {
    id,
    species: 'Rabbit',
    brand: 'Purina',
    productName: 'Show Hutch 17%',
    lotNumber: '4291A-0814',
    millCode: 'P12',
    manufactureDateIso: '2026-03-10',
    purchaseDateIso: '2026-03-15',
    bagCount: 2,
    bagWeightValue: 50,
    bagWeightUnit: 'lbs',
    totalQuantity: 100,
    remainingQuantity: 100,
    lowStockThreshold: 25,
    totalCostCents: 4800,
    supplierName: 'Valley Feed Co-op',
    proteinPercent: 17,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeAllocation(id: string, overrides: Partial<FeedAllocation> = {}): FeedAllocation {
  return {
    id,
    species: 'Rabbit',
    feedBatchId: 'fb-1',
    targetType: 'cage',
    targetId: 'cage-1',
    targetLabel: 'Hutch R-01',
    dateIso: '2026-03-20',
    quantity: 15,
    unit: 'lbs',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

describe('feedInventory — OCR parsing, biosecurity purge, allocations & traceability', () => {
  it('extracts lot numbers, mill code, weights, protein %, dates, and brands from feed tag OCR text', () => {
    const sampleTag = `
      PURINA ANIMAL NUTRITION - COMPLETE SHOW RABBIT PELLET
      GUARANTEED ANALYSIS: Crude Protein (Min) 17.5%
      NET WT. 50 LB (22.68 KG)
      PLANT CODE: P12  MFG DATE: 03/14/2026
      LOT: 4291A-0814   ALT RUN: 26073K
    `;
    const parsed = extractFeedTagDetailsFromOcrText(sampleTag);
    expect(parsed.bestLotNumber).toBe('4291A-0814');
    expect(parsed.lotCandidates).toContain('26073K');
    expect(parsed.millCode).toBe('P12');
    expect(parsed.manufactureDateIso).toBe('2026-03-14');
    expect(parsed.detectedBrand).toBe('Purina Animal Nutrition');
    expect(parsed.detectedBagWeight).toEqual({ value: 50, unit: 'lbs' });
    expect(parsed.detectedProteinPercent).toBe(17.5);
  });

  it('never purges tag photos without an indexed lot number and respects 30/60/90/0 windows', () => {
    const photoUrl = 'data:image/webp;base64,' + 'A'.repeat(240);
    const thumbUrl = 'data:image/webp;base64,' + 'B'.repeat(80);

    const indexedOld = makeBatch('fb-old-indexed', {
      lotNumber: '26010A',
      millCode: 'K04',
      ocrRawText: 'LOT 26010A KALMBACH',
      tagPhotoDataUrl: photoUrl,
      tagPhotoThumbnailDataUrl: thumbUrl,
      tagPhotoBytes: 320,
      tagPhotoCapturedDateIso: '2026-01-01',
    });
    const indexedRecent = makeBatch('fb-recent-indexed', {
      lotNumber: '26085B',
      tagPhotoDataUrl: photoUrl,
      tagPhotoThumbnailDataUrl: thumbUrl,
      tagPhotoBytes: 320,
      tagPhotoCapturedDateIso: '2026-03-25',
    });
    const unindexedOld = makeBatch('fb-old-unindexed', {
      lotNumber: '',
      tagPhotoDataUrl: photoUrl,
      tagPhotoThumbnailDataUrl: thumbUrl,
      tagPhotoBytes: 320,
      tagPhotoCapturedDateIso: '2025-12-01',
    });

    const batches = [indexedOld, indexedRecent, unindexedOld];

    // Manual-only (0) disables auto-purge
    expect(normalizeFeedPurgeWindowDays(0)).toBe(0);
    expect(findPurgeEligibleFeedTagPhotos(batches, 0, '2026-04-10')).toHaveLength(0);

    // On 2026-02-15 (45 days since 2026-01-01): eligible at 30d, NOT at 60d/90d
    expect(findPurgeEligibleFeedTagPhotos(batches, 30, '2026-02-15').map((c) => c.batch.id)).toEqual([
      'fb-old-indexed',
    ]);
    expect(findPurgeEligibleFeedTagPhotos(batches, 60, '2026-02-15')).toHaveLength(0);

    // Run pure 60-day purge on 2026-04-10 (99 days old)
    const purged = purgeExpiredFeedTagPhotosPure(batches, 60, {
      todayIso: '2026-04-10',
      nowIso: '2026-04-10T10:00:00.000Z',
    });
    expect(purged.purgedCount).toBe(1);
    expect(purged.purgedBatchIds).toEqual(['fb-old-indexed']);
    expect(purged.reclaimedBytes).toBe(320);

    const updatedOld = purged.nextBatches.find((b) => b.id === 'fb-old-indexed')!;
    expect(updatedOld.tagPhotoDataUrl).toBeUndefined();
    expect(updatedOld.tagPhotoThumbnailDataUrl).toBeUndefined();
    expect(updatedOld.tagPhotoPurgedAtIso).toBe('2026-04-10T10:00:00.000Z');
    expect(updatedOld.tagPhotoBytesReclaimed).toBe(320);
    // Critical biosecurity invariant: lot metadata stays permanently intact
    expect(updatedOld.lotNumber).toBe('26010A');
    expect(updatedOld.millCode).toBe('K04');
    expect(updatedOld.ocrRawText).toBe('LOT 26010A KALMBACH');

    // Unindexed photo must remain untouched so user never loses ability to read stamp later
    const untouchedUnindexed = purged.nextBatches.find((b) => b.id === 'fb-old-unindexed')!;
    expect(untouchedUnindexed.tagPhotoDataUrl).toBe(photoUrl);
  });

  it('deducts and restores batch inventory cleanly on allocation and reversal', () => {
    const batch = makeBatch('fb-1', { totalQuantity: 100, remainingQuantity: 40, lowStockThreshold: 25 });
    const afterAlloc = applyFeedAllocationToBatch(batch, 20, '2026-04-02T00:00:00.000Z');
    expect(afterAlloc.remainingQuantity).toBe(20);
    expect(isFeedBatchLowStock(afterAlloc)).toBe(true);

    // Never drops below 0
    const overAlloc = applyFeedAllocationToBatch(afterAlloc, 50, '2026-04-02T00:01:00.000Z');
    expect(overAlloc.remainingQuantity).toBe(0);

    // Reversal caps cleanly at totalQuantity
    const restored = reverseFeedAllocationFromBatch(afterAlloc, 20, '2026-04-02T00:02:00.000Z');
    expect(restored.remainingQuantity).toBe(40);
    const capped = reverseFeedAllocationFromBatch(batch, 500, '2026-04-02T00:03:00.000Z');
    expect(capped.remainingQuantity).toBe(100);
  });

  it('isolates summary metrics per species and traces flagged lots across cages, litters, and animals', () => {
    const rabbitBatch = makeBatch('fb-r', {
      species: 'Rabbit',
      lotNumber: 'LOT-8842R',
      remainingQuantity: 20,
      lowStockThreshold: 25,
      recallFlagged: true,
      recallNote: 'Mold odor watch',
    });
    const sheepBatch = makeBatch('fb-s', {
      species: 'Sheep',
      lotNumber: 'LOT-9901S',
      totalQuantity: 200,
      remainingQuantity: 180,
    });

    const cages: CageLocation[] = [
      {
        id: 'c1',
        species: 'Rabbit',
        label: 'Hutch A-1',
        section: 'Row A',
        capacity: 1,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'c2',
        species: 'Rabbit',
        label: 'Hutch A-2',
        section: 'Row A',
        capacity: 2,
        feedLotName: 'Purina Show (LOT-8842R)',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const breedings: BreedingRecord[] = [
      {
        id: 'br1',
        species: 'Rabbit',
        damId: 'doe-1',
        sireId: 'buck-1',
        damName: 'Doe 1',
        sireName: 'Buck 1',
        bredDateIso: '2026-03-01',
        expectedDueDateIso: '2026-04-01',
        actualBirthDateIso: '2026-04-01',
        projectedCoiPercent: 0,
        status: 'Born',
        liveCount: 6,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        offspringCreated: false,
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const animals = [makeAnimal('doe-1'), makeAnimal('buck-1')];

    const allocations: FeedAllocation[] = [
      makeAllocation('al-1', { feedBatchId: 'fb-r', targetType: 'cage', targetId: 'c1', quantity: 10 }),
      makeAllocation('al-2', {
        feedBatchId: 'fb-r',
        targetType: 'litter',
        targetId: 'br1',
        targetLabel: 'Doe 1 × Buck 1',
        quantity: 12,
      }),
      makeAllocation('al-3', {
        feedBatchId: 'fb-r',
        targetType: 'animal',
        targetId: 'doe-1',
        targetLabel: 'Doe 1',
        quantity: 5,
      }),
    ];

    const summary = evaluateFeedInventorySummary({
      batches: [rabbitBatch, sheepBatch],
      allocations,
      speciesName: 'Rabbit',
      purgeWindowDays: 60,
    });
    expect(summary.totalBatches).toBe(1);
    expect(summary.lowStockBatches).toHaveLength(1);
    expect(summary.recallFlaggedBatches).toHaveLength(1);
    expect(summary.totalAllocationsCount).toBe(3);

    const traces = traceFeedLotToCagesAndLitters({
      lotQuery: '8842R',
      batches: [rabbitBatch],
      allocations,
      cages,
      breedings,
      animals,
    });
    expect(traces).toHaveLength(1);
    expect(traces[0].hasRecallFlag).toBe(true);
    expect(traces[0].linkedCages.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(traces[0].linkedBreedings.map((b) => b.id)).toEqual(['br1']);
    expect(traces[0].linkedAnimals.map((a) => a.id)).toEqual(['doe-1']);
    expect(traces[0].totalAllocated).toBe(27);

    const csv = formatFeedLedgerCsv([rabbitBatch], allocations, 'USD');
    expect(csv).toContain('LOT-8842R');
    expect(csv).toContain('FLAGGED: Mold odor watch');
  });

  it('searches bundled offline manufacturer emergency contacts and preserves feed records in backups & health repair', () => {
    expect(FEED_MANUFACTURER_DIRECTORY.length).toBeGreaterThanOrEqual(8);
    expect(matchManufacturerForBrand('Nutrena Country Feeds')?.id).toBe('nutrena-cargill');
    expect(
      filterFeedManufacturerDirectory({ query: 'kalmbach', speciesName: 'Rabbit' }).some(
        (c) => c.id === 'kalmbach-feeds'
      )
    ).toBe(true);
    expect(
      filterFeedManufacturerDirectory({ category: 'regulatory' }).some(
        (c) => c.id === 'fda-cvm-safety-portal'
      )
    ).toBe(true);

    const batch = makeBatch('fb-backup', { lotNumber: 'K12-9012', proteinPercent: 18 });
    const alloc = makeAllocation('al-backup', { feedBatchId: 'fb-backup' });
    const snap = makeEmptySnapshot({
      settings: {
        ...makeEmptySnapshot().settings,
        feedTagPurgeWindowDays: 90,
      },
      feedBatches: [batch],
      feedAllocations: [alloc],
    });

    const json = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(json, snap.settings);
    expect(parsed.settings.feedTagPurgeWindowDays).toBe(90);
    expect(parsed.feedBatches).toHaveLength(1);
    expect(parsed.feedBatches[0].lotNumber).toBe('K12-9012');
    expect(parsed.feedAllocations).toHaveLength(1);

    const merged = mergeBarnSnapshots(makeEmptySnapshot(), parsed);
    expect(merged.snapshot.feedBatches).toHaveLength(1);
    expect(merged.snapshot.feedAllocations).toHaveLength(1);

    const repaired = repairBarnDataHealth(parsed);
    expect(repaired.nextSnapshot.feedBatches).toHaveLength(1);
    expect(countAllSpeciesRecords(parsed, 'Rabbit')).toBe(2);

    const purgedSpecies = purgeAllSpeciesRecordsPure(parsed, 'Rabbit');
    expect(purgedSpecies.nextSnapshot.feedBatches).toHaveLength(0);
    expect(purgedSpecies.nextSnapshot.feedAllocations).toHaveLength(0);
  });
});
```

## `src/core/__tests__/geneticsEngine.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildPresetGenotypeWithConfirmations,
  buildSandboxHypotheticalAnimal,
  evaluateSingleGenotypeSandbox,
  formatGenotypeArray,
  getGeneticsSpecForSpecies,
  getSpeciesVarietyPresets,
  inferHiddenAlleles,
  parseGenotypeString,
  setLocusInGenotypeString,
  simulatePairingGenetics,
} from '../geneticsEngine';
import { PREDEFINED_SPECIES_PRESETS } from '../models';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import { makeAnimal } from './testFixtures';

describe('geneticsEngine — genotype parsing, allele inference & Punnett simulation', () => {
  it('parses multi-character alleles (chd, En, at) and formats back cleanly', () => {
    const parsed = parseGenotypeString('Aat Bb Cchd D_ ee Ww Enen', 'Rabbit');
    expect(parsed).toEqual([
      { locus: 'A', allele1: 'A', allele2: 'at' },
      { locus: 'B', allele1: 'B', allele2: 'b' },
      { locus: 'C', allele1: 'C', allele2: 'chd' },
      { locus: 'D', allele1: 'D', allele2: '_' },
      { locus: 'E', allele1: 'e', allele2: 'e' },
      { locus: 'W', allele1: 'W', allele2: 'w' },
      { locus: 'En', allele1: 'En', allele2: 'en' },
    ]);

    expect(formatGenotypeArray(parsed)).toBe('Aat Bb Cchd D_ ee Ww Enen');
  });

  it('normalizes leading blanks (_a -> a_) during parsing and inference', () => {
    const parsed = parseGenotypeString('_a _b CC D_ E_', 'Rabbit');
    expect(formatGenotypeArray(parsed)).toBe('a_ b_ CC D_ E_');
  });

  it('updates individual loci interactively via setLocusInGenotypeString without corrupting positional slots', () => {
    const step1 = setLocusInGenotypeString('', 'En', 'En', 'en', 'Rabbit');
    expect(step1).toBe('__ __ __ __ __ __ Enen');
    const step2 = setLocusInGenotypeString(step1, 'E', 'e', 'e', 'Rabbit');
    expect(step2).toBe('__ __ __ __ ee __ Enen');
    const cleared = setLocusInGenotypeString(step2, 'En', '_', '_', 'Rabbit');
    expect(cleared).toBe('__ __ __ __ ee');
    expect(setLocusInGenotypeString(cleared, 'E', '_', '_', 'Rabbit')).toBe('');

    // Cat X-linked Male OY formatting & Female pairing normalization
    expect(setLocusInGenotypeString('aa BB', 'O', 'O', '_', 'Cat', 'Male')).toBe(
      'aa BB __ __ OY'
    );
    expect(setLocusInGenotypeString('aa BB', 'O', 'o', 'O', 'Cat', 'Female')).toBe(
      'aa BB __ __ Oo'
    );
  });

  it('keeps New Zealand Red / Red variety presets conservative (__ for Wide-Band) unless explicitly confirmed ww', () => {
    const presets = getSpeciesVarietyPresets('Rabbit');
    const nzRed = presets.find((p) => p.variety === 'New Zealand Red');
    expect(nzRed).toBeDefined();
    expect(nzRed!.conservativeGenotype).toBe('A_ B_ C_ D_ ee __');
    expect(nzRed!.optionalConfirmations?.some((o) => o.locus === 'W' && o.suggestedAlleles === 'ww')).toBe(
      true
    );

    expect(buildPresetGenotypeWithConfirmations(nzRed!, [], 'Rabbit')).toBe('A_ B_ C_ D_ ee __');
    expect(buildPresetGenotypeWithConfirmations(nzRed!, ['W'], 'Rabbit')).toBe('A_ B_ C_ D_ ee ww');
  });

  it('never fabricates fake __ homozygous certainty in Punnett outcomes and notes Wide-Band unverified Red', () => {
    const redSire = makeAnimal('sire', {
      sex: 'Male',
      genotypeRaw: 'AA BB CC DD ee Ww enen',
      genotype: parseGenotypeString('AA BB CC DD ee Ww enen', 'Rabbit'),
    });
    const redDam = makeAnimal('dam', {
      sex: 'Female',
      genotypeRaw: 'AA BB CC DD ee __ enen',
      genotype: parseGenotypeString('AA BB CC DD ee __ enen', 'Rabbit'),
    });

    const sim = simulatePairingGenetics(redSire, redDam, 'Rabbit');
    expect(sim.hasUnknownAlleles).toBe(true);
    expect(sim.uncertainLociNotes.length).toBeGreaterThan(0);

    const wOutcome = sim.locusBreakdowns.find((l) => l.locus === 'W');
    expect(wOutcome).toBeDefined();
    expect(wOutcome!.outcomes.some((o) => o.genotype === '__')).toBe(false);
    expect(wOutcome!.outcomes.every((o) => o.hasUnknownCarrier)).toBe(true);
    expect(
      sim.lethalOrHealthAlerts.some((a) => a.locus === 'W' && a.title.includes('Wide-Band'))
    ).toBe(true);
  });

  it('infers hidden recessive alleles and homozygous dominant parental pairs cleanly', () => {
    const rewSire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Snowball',
      genotypeRaw: 'AA BB cc D_ E_',
      genotype: parseGenotypeString('AA BB cc D_ E_', 'Rabbit'),
    });
    const agoutiDam = makeAnimal('dam', {
      sex: 'Female',
      name: 'Lady',
      genotypeRaw: 'AA BB C_ D_ E_',
      genotype: parseGenotypeString('AA BB C_ D_ E_', 'Rabbit'),
    });
    const subject = makeAnimal('subj', {
      sex: 'Female',
      name: 'Ruby',
      sireId: 'sire',
      damId: 'dam',
      genotypeRaw: 'A_ B_ C_ D_ E_',
      genotype: parseGenotypeString('A_ B_ C_ D_ E_', 'Rabbit'),
    });
    const redKit = makeAnimal('kit', {
      sex: 'Male',
      name: 'Copper',
      damId: 'subj',
      genotypeRaw: 'A_ B_ cc D_ ee',
      genotype: parseGenotypeString('A_ B_ cc D_ ee', 'Rabbit'),
    });

    const all = [rewSire, agoutiDam, subject, redKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const inferred = inferHiddenAlleles(subject, herd, all, 'Rabbit');

    expect(inferred.conflicts).toHaveLength(0);
    expect(inferred.updatedPairs.find((p) => p.locus === 'A')).toEqual({
      locus: 'A',
      allele1: 'A',
      allele2: 'A',
    });
    expect(inferred.updatedPairs.find((p) => p.locus === 'B')).toEqual({
      locus: 'B',
      allele1: 'B',
      allele2: 'B',
    });
    expect(inferred.updatedPairs.find((p) => p.locus === 'C')).toEqual({
      locus: 'C',
      allele1: 'C',
      allele2: 'c',
    });
    expect(inferred.updatedPairs.find((p) => p.locus === 'E')).toEqual({
      locus: 'E',
      allele1: 'E',
      allele2: 'e',
    });
  });

  it('infers intermediate otter (at) and dark chinchilla (chd) carrier status from homozygous offspring', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      name: 'Ches',
      genotypeRaw: 'A_ BB C_ DD E_',
      genotype: parseGenotypeString('A_ BB C_ DD E_', 'Rabbit'),
    });
    const kit = makeAnimal('kit', {
      sex: 'Female',
      name: 'Otter Chin Kit',
      sireId: 'buck',
      genotypeRaw: 'atat BB chdchd DD E_',
      genotype: parseGenotypeString('atat BB chdchd DD E_', 'Rabbit'),
    });
    const all = [buck, kit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const inferred = inferHiddenAlleles(buck, herd, all, 'Rabbit');

    expect(inferred.conflicts).toHaveLength(0);
    expect(inferred.formatted).toBe('Aat BB Cchd DD E_');
  });

  it('flags biological impossibility conflicts when recorded genotypes contradict parents or kits', () => {
    const chocoSire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Cocoa',
      genotypeRaw: 'aa bb C_ D_ E_',
      genotype: parseGenotypeString('aa bb C_ D_ E_', 'Rabbit'),
    });
    const impossibleKit = makeAnimal('kit', {
      sex: 'Female',
      name: 'Jet',
      sireId: 'sire',
      genotypeRaw: 'aa BB C_ D_ E_',
      genotype: parseGenotypeString('aa BB C_ D_ E_', 'Rabbit'),
    });

    const all = [chocoSire, impossibleKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const result = inferHiddenAlleles(impossibleKit, herd, all, 'Rabbit');

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain('bb');
    expect(result.conflicts[0]).toContain('BB');
  });

  it('simulates Punnett locus outcomes and New Zealand Red vs Tortoise phenotypes', () => {
    const buck = makeAnimal('buck', {
      sex: 'Male',
      genotypeRaw: 'Aa BB CC DD ee ww Enen',
      genotype: parseGenotypeString('Aa BB CC DD ee ww Enen', 'Rabbit'),
    });
    const doe = makeAnimal('doe', {
      sex: 'Female',
      genotypeRaw: 'Aa BB CC DD ee ww enen',
      genotype: parseGenotypeString('Aa BB CC DD ee ww enen', 'Rabbit'),
    });

    const sim = simulatePairingGenetics(buck, doe, 'Rabbit');

    expect(sim.hasUnknownAlleles).toBe(false);
    const aLocus = sim.locusBreakdowns.find((l) => l.locus === 'A');
    expect(aLocus?.outcomes).toEqual([
      { genotype: 'Aa', probabilityPercent: 50, hasUnknownCarrier: false },
      { genotype: 'AA', probabilityPercent: 25, hasUnknownCarrier: false },
      { genotype: 'aa', probabilityPercent: 25, hasUnknownCarrier: false },
    ]);

    const enLocus = sim.locusBreakdowns.find((l) => l.locus === 'En');
    expect(enLocus?.outcomes).toEqual([
      { genotype: 'Enen', probabilityPercent: 50, hasUnknownCarrier: false },
      { genotype: 'enen', probabilityPercent: 50, hasUnknownCarrier: false },
    ]);

    const totalPhenoProb = sim.predictedPhenotypes.reduce(
      (sum, p) => sum + p.probabilityPercent,
      0
    );
    expect(totalPhenoProb).toBeCloseTo(100, 1);
    expect(sim.predictedPhenotypes.some((p) => p.label === 'New Zealand Red (Wide-Band ww)')).toBe(
      true
    );
    expect(sim.predictedPhenotypes.some((p) => p.label === 'Black Tortoise')).toBe(true);
  });

  it('computes X-linked sex-stratified Punnett outcomes for Cat O/o crossings', () => {
    const tom = makeAnimal('tom', {
      species: 'Cat',
      sex: 'Male',
      genotypeRaw: 'aa BB CC DD OY ww ii',
      genotype: parseGenotypeString('aa BB CC DD OY ww ii', 'Cat'),
    });
    const queen = makeAnimal('queen', {
      species: 'Cat',
      sex: 'Female',
      genotypeRaw: 'aa BB CC DD oo ww ii',
      genotype: parseGenotypeString('aa BB CC DD oo ww ii', 'Cat'),
    });

    const sim = simulatePairingGenetics(tom, queen, 'Cat');
    const oLocus = sim.locusBreakdowns.find((l) => l.locus === 'O');
    expect(oLocus?.inheritanceMode).toBe('x_linked');
    expect(oLocus?.sexSplitOutcomes?.male).toEqual([
      { genotype: 'oY', probabilityPercent: 100, hasUnknownCarrier: false },
    ]);
    expect(oLocus?.sexSplitOutcomes?.female).toEqual([
      { genotype: 'Oo', probabilityPercent: 100, hasUnknownCarrier: false },
    ]);
    expect(
      sim.predictedPhenotypes.some((p) => p.sexGroup === 'Female' && p.label.includes('Tortoiseshell'))
    ).toBe(true);
    expect(sim.predictedPhenotypes.some((p) => p.sexGroup === 'Male' && p.label.includes('Black'))).toBe(
      true
    );
  });

  it('provides species specs for all 11 predefined species and isolates custom species to null fallback', () => {
    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const spec = getGeneticsSpecForSpecies(preset.name);
      expect(spec, `Expected spec for ${preset.name}`).not.toBeNull();
      expect(spec!.loci.length).toBeGreaterThanOrEqual(3);
      expect(spec!.varietyPresets.length).toBeGreaterThan(0);

      // Smoke-test conservative preset round-trip parsing + Punnett simulation
      const g = spec!.varietyPresets[0].conservativeGenotype;
      const parsed = parseGenotypeString(g, preset.name);
      expect(parsed.length).toBeGreaterThan(0);

      const s = makeAnimal('s', { species: preset.name, sex: 'Male', genotypeRaw: g, genotype: parsed });
      const d = makeAnimal('d', { species: preset.name, sex: 'Female', genotypeRaw: g, genotype: parsed });
      const sim = simulatePairingGenetics(s, d, preset.name);
      expect(sim.isCustomSpeciesFallback).toBe(false);
    }

    // Custom species MUST return null so Rabbit rules never leak into Emu / Duck / Custom
    expect(getGeneticsSpecForSpecies('Heritage Duck')).toBeNull();
    expect(parseGenotypeString('Aa Bb cc', 'Heritage Duck')).toEqual([]);

    const customSire = makeAnimal('cs', {
      species: 'Heritage Duck',
      sex: 'Male',
      genotypeRaw: 'M+m Li+li',
    });
    const customDam = makeAnimal('cd', {
      species: 'Heritage Duck',
      sex: 'Female',
      genotypeRaw: 'M+M+ lili',
    });
    const customSim = simulatePairingGenetics(customSire, customDam, 'Heritage Duck');
    expect(customSim.isCustomSpeciesFallback).toBe(true);
    expect(customSim.locusBreakdowns).toHaveLength(0);
    expect(customSim.sireRaw).toBe('M+m Li+li');
  });

  it('triggers lethal & health alerts for Dog MM, Rabbit EnEn, Guinea Pig RnRn, Chinchilla WhWh, and Ferret Blaze/Panda', () => {
    const rabbitSim = simulatePairingGenetics(
      makeAnimal('rs', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'A_ B_ C_ D_ E_ W_ Enen' }),
      makeAnimal('rd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'A_ B_ C_ D_ E_ W_ Enen' }),
      'Rabbit'
    );
    expect(rabbitSim.lethalOrHealthAlerts.some((a) => a.locus === 'En' && a.severity === 'danger')).toBe(
      true
    );

    const dogSim = simulatePairingGenetics(
      makeAnimal('ds', { species: 'Dog', sex: 'Male', genotypeRaw: 'ayat BB DD EE kyky Mm hh SS' }),
      makeAnimal('dd', { species: 'Dog', sex: 'Female', genotypeRaw: 'ayat BB DD EE kyky Mm hh SS' }),
      'Dog'
    );
    expect(dogSim.lethalOrHealthAlerts.some((a) => a.locus === 'M' && a.severity === 'danger')).toBe(
      true
    );

    const gpSim = simulatePairingGenetics(
      makeAnimal('gs', { species: 'Guinea Pig', sex: 'Male', genotypeRaw: 'aa BB CC EE PP SS Rnrn' }),
      makeAnimal('gd', { species: 'Guinea Pig', sex: 'Female', genotypeRaw: 'aa BB CC EE PP SS Rnrn' }),
      'Guinea Pig'
    );
    expect(gpSim.lethalOrHealthAlerts.some((a) => a.locus === 'Rn' && a.severity === 'danger')).toBe(
      true
    );

    const chinSim = simulatePairingGenetics(
      makeAnimal('cs', { species: 'Chinchilla', sex: 'Male', genotypeRaw: 'Whwh TOto bgbg VV SS ebeb' }),
      makeAnimal('cd', { species: 'Chinchilla', sex: 'Female', genotypeRaw: 'Whwh TOto bgbg VV SS ebeb' }),
      'Chinchilla'
    );
    expect(chinSim.lethalOrHealthAlerts.some((a) => a.locus === 'Wh')).toBe(true);
    expect(chinSim.lethalOrHealthAlerts.some((a) => a.locus === 'TO')).toBe(true);

    const ferretSim = simulatePairingGenetics(
      makeAnimal('fs', { species: 'Ferret', sex: 'Male', genotypeRaw: 'BB CC papa Blbl roro mtmt' }),
      makeAnimal('fd', { species: 'Ferret', sex: 'Female', genotypeRaw: 'BB CC Papa blbl roro mtmt' }),
      'Ferret'
    );
    expect(ferretSim.lethalOrHealthAlerts.some((a) => a.title.includes('Waardenburg'))).toBe(true);
  });

  it('classifies Rabbit ARBA varieties (at, chl, chc, vv, dudu, ej, Es) and keeps Fawn Wide-Band conservative', () => {
    const fawn = getSpeciesVarietyPresets('Rabbit').find((p) => p.variety === 'Fawn');
    expect(fawn?.conservativeGenotype).toBe('A_ B_ C_ dd ee __');

    const hima = simulatePairingGenetics(
      makeAnimal('hs', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'aa BB chc DD EE WW enen VV DuDu' }),
      makeAnimal('hd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'aa BB cc DD EE WW enen VV DuDu' }),
      'Rabbit'
    );
    expect(hima.predictedPhenotypes.some((p) => p.label.includes('Himalayan'))).toBe(true);

    const bew = simulatePairingGenetics(
      makeAnimal('bs', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'AA BB CC DD EE WW enen vv DuDu' }),
      makeAnimal('bd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'AA BB CC DD EE WW enen vv DuDu' }),
      'Rabbit'
    );
    expect(bew.predictedPhenotypes[0].label).toBe('Blue-Eyed White (BEW)');

    const dutchSteel = simulatePairingGenetics(
      makeAnimal('ds', { species: 'Rabbit', sex: 'Male', genotypeRaw: 'at_ BB chl_ DD EsEs WW enen VV dudu' }),
      makeAnimal('dd', { species: 'Rabbit', sex: 'Female', genotypeRaw: 'at_ BB chl_ DD EsEs WW enen VV dudu' }),
      'Rabbit'
    );
    expect(dutchSteel.predictedPhenotypes.some((p) => p.label.includes('Dutch'))).toBe(true);
  });

  it('covers species-specific genetics across Cat, Dog, Goat, Sheep, Cattle, Swine, Alpaca, Guinea Pig, Chinchilla, and Ferret', () => {
    // Cat csc Point & cbc Sepia & cbcs Mink heterozygote dominance
    const catPoint = simulatePairingGenetics(
      makeAnimal('c1', { species: 'Cat', sex: 'Male', genotypeRaw: 'aa BB csc DD oY ww ii' }),
      makeAnimal('c2', { species: 'Cat', sex: 'Female', genotypeRaw: 'aa BB cbc DD oo ww ii' }),
      'Cat'
    );
    expect(catPoint.predictedPhenotypes.some((p) => p.label.includes('Mink'))).toBe(true);
    expect(catPoint.predictedPhenotypes.some((p) => p.label.includes('Point'))).toBe(true);
    expect(catPoint.predictedPhenotypes.some((p) => p.label.includes('Sepia'))).toBe(true);

    // Dog epistatic ee Cream vs KB Black
    const dogSim = simulatePairingGenetics(
      makeAnimal('dg1', { species: 'Dog', sex: 'Male', genotypeRaw: 'atat kyky ee BB DD mm SS ii' }),
      makeAnimal('dg2', { species: 'Dog', sex: 'Female', genotypeRaw: 'atat kyky ee BB DD mm SS ii' }),
      'Dog'
    );
    expect(dogSim.predictedPhenotypes[0].label).toBe('Cream');

    // Goat codominant Agouti (Ab + As)
    const goatSim = simulatePairingGenetics(
      makeAnimal('gt1', { species: 'Goat', sex: 'Male', genotypeRaw: 'AbAb BB E+E+ spsp msms rnrn' }),
      makeAnimal('gt2', { species: 'Goat', sex: 'Female', genotypeRaw: 'AsAs BB E+E+ spsp msms rnrn' }),
      'Goat'
    );
    expect(goatSim.predictedPhenotypes[0].label).toContain('Codominant Badgerface + Swiss Markings');

    // Sheep Moorit Brown (bb) & inference
    const sheepSim = simulatePairingGenetics(
      makeAnimal('sh1', { species: 'Sheep', sex: 'Male', genotypeRaw: 'AaAa bb E+E+ SS' }),
      makeAnimal('sh2', { species: 'Sheep', sex: 'Female', genotypeRaw: 'AaAa bb E+E+ SS' }),
      'Sheep'
    );
    expect(sheepSim.predictedPhenotypes[0].label).toBe('Solid Moorit Brown');

    // Cattle codominant Roan (Rr x Rr -> 25% RR Roan-White, 50% Roan, 25% Red/Black)
    const cattleSim = simulatePairingGenetics(
      makeAnimal('ct1', { species: 'Cattle', sex: 'Male', genotypeRaw: 'ee dd Rr SS' }),
      makeAnimal('ct2', { species: 'Cattle', sex: 'Female', genotypeRaw: 'ee dd Rr SS' }),
      'Cattle'
    );
    expect(cattleSim.predictedPhenotypes.some((p) => p.label === 'Roan-White' && p.probabilityPercent === 25)).toBe(
      true
    );
    expect(cattleSim.predictedPhenotypes.some((p) => p.label === 'Red Roan' && p.probabilityPercent === 50)).toBe(
      true
    );

    // Swine Hampshire Belted Red vs Dominant White
    const swineSim = simulatePairingGenetics(
      makeAnimal('sw1', { species: 'Swine / Pig', sex: 'Male', genotypeRaw: 'ee ii BeBe rnrn' }),
      makeAnimal('sw2', { species: 'Swine / Pig', sex: 'Female', genotypeRaw: 'ee ii bebe rnrn' }),
      'Swine / Pig'
    );
    expect(swineSim.predictedPhenotypes[0].label).toBe('Red Hampshire Belted');

    // Alpaca True Black with Grey & Pinto
    const alpacaSim = simulatePairingGenetics(
      makeAnimal('al1', { species: 'Alpaca', sex: 'Male', genotypeRaw: 'EE aa Gg ss' }),
      makeAnimal('al2', { species: 'Alpaca', sex: 'Female', genotypeRaw: 'EE aa gg ss' }),
      'Alpaca'
    );
    expect(alpacaSim.predictedPhenotypes.some((p) => p.label === 'True Black (Grey Pinto/Appaloosa)')).toBe(
      true
    );

    // Guinea Pig Himalayan crca + Pink-eyed Lilac pp
    const gpHima = simulatePairingGenetics(
      makeAnimal('gp1', { species: 'Guinea Pig', sex: 'Male', genotypeRaw: 'aa BB crca EE PP SS rnrn' }),
      makeAnimal('gp2', { species: 'Guinea Pig', sex: 'Female', genotypeRaw: 'aa BB caca EE PP SS rnrn' }),
      'Guinea Pig'
    );
    expect(gpHima.predictedPhenotypes.some((p) => p.label === 'Himalayan / California Pointed')).toBe(
      true
    );

    // Chinchilla Bgbg x Bgbg incomplete dominance
    const chinBeige = simulatePairingGenetics(
      makeAnimal('ch1', { species: 'Chinchilla', sex: 'Male', genotypeRaw: 'whwh toto Bgbg VV SS EbEb AlAl' }),
      makeAnimal('ch2', { species: 'Chinchilla', sex: 'Female', genotypeRaw: 'whwh toto Bgbg VV SS EbEb AlAl' }),
      'Chinchilla'
    );
    expect(chinBeige.predictedPhenotypes.some((p) => p.label === 'Homozygous Beige' && p.probabilityPercent === 25)).toBe(
      true
    );
    expect(chinBeige.predictedPhenotypes.some((p) => p.label === 'Beige' && p.probabilityPercent === 50)).toBe(
      true
    );

    // Ferret Chocolate Champagne bb
    const ferretChoc = simulatePairingGenetics(
      makeAnimal('fe1', { species: 'Ferret', sex: 'Male', genotypeRaw: 'bb CC papa blbl roro mtmt' }),
      makeAnimal('fe2', { species: 'Ferret', sex: 'Female', genotypeRaw: 'bb CC papa blbl roro mtmt' }),
      'Ferret'
    );
    expect(ferretChoc.predictedPhenotypes[0].label).toBe('Chocolate / Champagne');
  });

  it('infers Cat X-linked Female/Dam alleles symmetrically and notes one-sided loci in Punnett predictions', () => {
    const orangeTom = makeAnimal('ot', {
      species: 'Cat',
      name: 'Marmalade',
      sex: 'Male',
      genotypeRaw: 'aa BB CC DD OY ww ii',
    });
    const blackDam = makeAnimal('bd', {
      species: 'Cat',
      name: 'Shadow',
      sex: 'Female',
      genotypeRaw: 'aa BB CC DD O_ ww ii',
    });
    const tortieDaughter = makeAnimal('td', {
      species: 'Cat',
      name: 'Ember',
      sex: 'Female',
      sireId: orangeTom.id,
      damId: blackDam.id,
      genotypeRaw: 'aa BB CC DD o_ ww ii',
    });
    const nonRedSon = makeAnimal('nrs', {
      species: 'Cat',
      name: 'Coal',
      sex: 'Male',
      damId: blackDam.id,
      genotypeRaw: 'aa BB CC DD oY ww ii',
    });

    const catHerd = [orangeTom, blackDam, tortieDaughter, nonRedSon];
    const catMap = buildSpeciesHerdMap(catHerd, 'Cat');

    // Daughter o_ gets 'O' from OY Sire -> Oo
    const daughterInf = inferHiddenAlleles(tortieDaughter, catMap, catHerd, 'Cat');
    expect(daughterInf.conflicts).toHaveLength(0);
    expect(daughterInf.updatedPairs.find((p) => p.locus === 'O')).toEqual({
      locus: 'O',
      allele1: 'O',
      allele2: 'o',
    });

    // Dam O_ gets 'o' proven by non-red son oY -> Oo
    const damInf = inferHiddenAlleles(blackDam, catMap, catHerd, 'Cat');
    expect(damInf.conflicts).toHaveLength(0);
    expect(damInf.updatedPairs.find((p) => p.locus === 'O')).toEqual({
      locus: 'O',
      allele1: 'O',
      allele2: 'o',
    });

    // One-sided missing locus in simulatePairingGenetics surfaces an uncertainLociNote
    const partialBuck = makeAnimal('pb', {
      species: 'Rabbit',
      name: 'Partial Buck',
      sex: 'Male',
      genotypeRaw: 'AA BB CC DD ee ww',
    });
    const partialDoe = makeAnimal('pd', {
      species: 'Rabbit',
      name: 'Partial Doe',
      sex: 'Female',
      genotypeRaw: 'AA BB CC DD ee',
    });
    const sim = simulatePairingGenetics(partialBuck, partialDoe, 'Rabbit');
    expect(sim.uncertainLociNotes.some((n) => n.includes('(W)') && n.includes('Partial Doe'))).toBe(
      true
    );
  });

  it('evaluates single hypothetical genotypes, hidden carriers, health alerts, and What-If crosses for Coat Explorer Sandbox', () => {
    const emptyEval = evaluateSingleGenotypeSandbox('__ __', 'Rabbit');
    expect(emptyEval.hasInsufficientLoci).toBe(true);
    expect(emptyEval.recessiveCarriers).toHaveLength(0);

    const lilacEval = evaluateSingleGenotypeSandbox('aa bb CC dd EE', 'Rabbit');
    expect(lilacEval.hasInsufficientLoci).toBe(false);
    expect(lilacEval.predictedVariety).toBe('Lilac');
    expect(lilacEval.recessiveCarriers).toHaveLength(0);

    const chestnutCarrierEval = evaluateSingleGenotypeSandbox('Aa Bb Cc Dd Ee WW EnEn', 'Rabbit');
    expect(chestnutCarrierEval.predictedVariety).toBe('Charlie Chestnut Agouti');
    expect(chestnutCarrierEval.recessiveCarriers.map((c) => `${c.locus}:${c.allele}`)).toEqual([
      'A:a',
      'B:b',
      'C:c',
      'D:d',
      'E:e',
    ]);
    expect(chestnutCarrierEval.healthAlerts.some((a) => a.locus === 'En' && a.severity === 'danger')).toBe(
      true
    );

    const catMaleOrange = evaluateSingleGenotypeSandbox('aa BB CC DD OY ww ii', 'Cat', 'Male');
    expect(catMaleOrange.predictedVariety).toContain('Red / Orange Tabby');
    expect(catMaleOrange.unverifiedCoreLoci).toHaveLength(0);

    const dogDoubleMerle = evaluateSingleGenotypeSandbox('ayat kyky EE BB DD MM SS II', 'Dog');
    expect(dogDoubleMerle.predictedVariety).toContain('Double Merle');
    expect(dogDoubleMerle.healthAlerts.some((a) => a.locus === 'M' && a.severity === 'danger')).toBe(
      true
    );

    const customEval = evaluateSingleGenotypeSandbox('M+m Li+li', 'Heritage Duck');
    expect(customEval.isCustomSpeciesFallback).toBe(true);
    expect(customEval.predictedVariety).toBe('');

    const hypoSire = buildSandboxHypotheticalAnimal({
      id: '__sandbox_sire__',
      name: 'Hypo Buck',
      speciesName: 'Rabbit',
      sex: 'Male',
      genotypeRaw: 'Aa BB CC DD ee ww enen',
    });
    const hypoDam = buildSandboxHypotheticalAnimal({
      id: '__sandbox_dam__',
      name: 'Hypo Doe',
      speciesName: 'Rabbit',
      sex: 'Female',
      genotypeRaw: 'Aa BB CC DD ee ww Enen',
    });
    const hypoSim = simulatePairingGenetics(hypoSire, hypoDam, 'Rabbit');
    expect(hypoSim.predictedPhenotypes.some((p) => p.label.includes('Tortoise'))).toBe(true);
    expect(hypoSim.predictedPhenotypes.some((p) => p.label.includes('Broken'))).toBe(true);
  });
});

```

## `src/core/__tests__/growthAnalytics.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  buildAnimalGrowthSeries,
  buildBarnCohortBenchmarkCurve,
  buildComparativeGrowthChartModel,
  diffCalendarDaysNonNeg,
  diffCalendarDaysSigned,
  evaluateLitterSurvivalAndMilestones,
  formatCompactWeightAxisTick,
  formatRateOfGain,
  gramsToAxisNumeric,
  interpolateTargetWeightAtAge,
  resolveMeteorologicalSeason,
} from '../growthAnalytics';
import {
  BreedingRecord,
  CareLog,
  normalizeLitterWeightMilestones,
  normalizeTargetWeightCurve,
} from '../models';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

const TS = '2026-06-01T12:00:00.000Z';

function makeBreeding(id: string, overrides: Partial<BreedingRecord> = {}): BreedingRecord {
  return {
    id,
    species: 'Rabbit',
    sireId: 'sire-1',
    damId: 'dam-1',
    sireName: 'Apollo',
    damName: 'Clover',
    bredDateIso: '2026-01-01',
    expectedDueDateIso: '2026-02-01',
    actualBirthDateIso: '2026-02-01',
    projectedCoiPercent: 0,
    liveCount: 8,
    stillbornCount: 0,
    fosteredCount: 0,
    weanedCount: 7,
    offspringCreated: false,
    status: 'Weaned',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeWeightLog(
  id: string,
  animalId: string,
  dateIso: string,
  weightGrams: number,
  species = 'Rabbit'
): CareLog {
  return {
    id,
    species,
    animalId,
    dateIso,
    type: 'Weight Check',
    title: `Weight check ${dateIso}`,
    weightGrams,
    showLegEarned: false,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
  };
}

describe('growthAnalytics — date, season, litter survival, milestones & comparative ADG engine', () => {
  it('computes UTC calendar day diffs safely across DST and rejects invalid dates', () => {
    // US DST spring-forward boundary (2026-03-08) must still equal exact calendar days
    expect(diffCalendarDaysSigned('2026-03-01', '2026-03-15')).toBe(14);
    expect(diffCalendarDaysSigned('2026-03-15', '2026-03-01')).toBe(-14);
    expect(diffCalendarDaysNonNeg('2026-03-15', '2026-03-01')).toBeNull();
    expect(diffCalendarDaysNonNeg('2026-02-30', '2026-03-05')).toBeNull();
  });

  it('classifies meteorological seasons in chronological order (including Jan/Feb vs Dec)', () => {
    const jan = resolveMeteorologicalSeason('2026-01-15');
    const mar = resolveMeteorologicalSeason('2026-03-01');
    const jul = resolveMeteorologicalSeason('2026-07-04');
    const oct = resolveMeteorologicalSeason('2026-10-20');
    const dec = resolveMeteorologicalSeason('2026-12-10');

    expect(jan?.seasonKey).toBe('Winter 2026');
    expect(mar?.seasonKey).toBe('Spring 2026');
    expect(jul?.seasonKey).toBe('Summer 2026');
    expect(oct?.seasonKey).toBe('Fall 2026');
    expect(dec?.seasonKey).toBe('Winter 2026');
    expect(resolveMeteorologicalSeason('bad-date')).toBeNull();

    // Jan/Feb rank 0 < Spring 1 < Summer 2 < Fall 3 < Dec 4 within the same year
    expect((jan?.sortOrder ?? 0) < (mar?.sortOrder ?? 0)).toBe(true);
    expect((mar?.sortOrder ?? 0) < (jul?.sortOrder ?? 0)).toBe(true);
    expect((jul?.sortOrder ?? 0) < (oct?.sortOrder ?? 0)).toBe(true);
    expect((oct?.sortOrder ?? 0) < (dec?.sortOrder ?? 0)).toBe(true);
  });

  it('normalizes target curves and litter milestones safely', () => {
    const curve = normalizeTargetWeightCurve([
      { ageDays: 56, weightGrams: 2040, label: '8w' },
      { ageDays: 21, weightGrams: 540 },
      { ageDays: -5, weightGrams: 100 }, // invalid age ignored
      { ageDays: 42, weightGrams: 0 }, // invalid zero weight ignored
      { ageDays: 56, weightGrams: 2100, label: 'Updated 8w' }, // deduplicates by age
    ]);
    expect(curve).toEqual([
      { ageDays: 21, weightGrams: 540 },
      { ageDays: 56, weightGrams: 2100, label: 'Updated 8w' },
    ]);

    const milestones = normalizeLitterWeightMilestones([
      { id: 'm-8w', ageDays: 56, label: '8-Week', totalWeightGrams: 16000, liveCount: 8 },
      { id: 'm-3w', ageDays: 21, label: '3-Week', avgWeightGrams: 520, liveCount: 8, totalWeightGrams: 0 },
      { id: 'bad', ageDays: -1, label: 'Bad', totalWeightGrams: 500 },
    ]);
    expect(milestones).toHaveLength(2);
    expect(milestones[0].ageDays).toBe(21);
    expect(milestones[0].totalWeightGrams).toBe(4160);
    expect(milestones[1].ageDays).toBe(56);
    expect(milestones[1].avgWeightGrams).toBe(2000);
  });

  it('evaluates litter survival rates (including fostering), parent summaries, seasonal curves & offspring CareLog fallback milestones', () => {
    const rabbitProfile = makeSpeciesProfile('Rabbit');
    const damClover = makeAnimal('dam-1', { name: 'Clover', tattoo: 'CLV1', sex: 'Female' });
    const damWillow = makeAnimal('dam-2', { name: 'Willow', tattoo: 'WLW2', sex: 'Female' });
    const sireApollo = makeAnimal('sire-1', { name: 'Apollo', tattoo: 'APL1', sex: 'Male' });

    // Offspring from Willow's Summer litter weighed individually via CareLogs (no explicit litter milestone at 21d)
    const kitA = makeAnimal('kit-a', {
      name: 'Kit A',
      sex: 'Female',
      sireId: 'sire-1',
      damId: 'dam-2',
      birthDateIso: '2026-07-01',
      weightGrams: 500,
    });
    const kitB = makeAnimal('kit-b', {
      name: 'Kit B',
      sex: 'Male',
      sireId: 'sire-1',
      damId: 'dam-2',
      birthDateIso: '2026-07-01',
      weightGrams: 540,
    });

    const breedings: BreedingRecord[] = [
      // Clover Winter litter: 8 live, 2 stillborn (80% live birth), +1 fostered (rearing base = 9), 9 weaned (100% weaning survival)
      makeBreeding('b-1', {
        damId: 'dam-1',
        damName: 'Clover',
        sireId: 'sire-1',
        sireName: 'Apollo',
        bredDateIso: '2026-01-01',
        actualBirthDateIso: '2026-02-01',
        liveCount: 8,
        stillbornCount: 2,
        fosteredCount: 1,
        weanedCount: 9,
        status: 'Weaned',
        litterWeightMilestones: [
          { id: 'm1', ageDays: 21, label: '3w', liveCount: 9, totalWeightGrams: 4950, avgWeightGrams: 550 },
          { id: 'm2', ageDays: 42, label: '6w', liveCount: 9, totalWeightGrams: 13050, avgWeightGrams: 1450 },
          { id: 'm3', ageDays: 56, label: '8w', liveCount: 9, totalWeightGrams: 19350, avgWeightGrams: 2150 },
        ],
      }),
      // Clover Spring miss
      makeBreeding('b-2', {
        damId: 'dam-1',
        damName: 'Clover',
        sireId: 'sire-1',
        sireName: 'Apollo',
        bredDateIso: '2026-03-10',
        expectedDueDateIso: '2026-04-10',
        actualBirthDateIso: '',
        liveCount: 0,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        status: 'Missed',
      }),
      // Willow Summer litter: 6 live, 0 stillborn, -2 fostered out (rearing base = 4), 3 weaned (75% weaning survival)
      makeBreeding('b-3', {
        damId: 'dam-2',
        damName: 'Willow',
        sireId: 'sire-1',
        sireName: 'Apollo',
        bredDateIso: '2026-06-01',
        expectedDueDateIso: '2026-07-02',
        actualBirthDateIso: '2026-07-01',
        liveCount: 6,
        stillbornCount: 0,
        fosteredCount: -2,
        weanedCount: 3,
        status: 'Weaned',
        litterWeightMilestones: [
          { id: 'w-8w', ageDays: 56, label: '8w', liveCount: 3, totalWeightGrams: 5400, avgWeightGrams: 1800 },
        ],
      }),
      // Different species (must stay strictly isolated)
      makeBreeding('b-goat', {
        species: 'Goat',
        damId: 'g-dam',
        damName: 'Nanny',
        sireId: 'g-sire',
        sireName: 'Billy',
        liveCount: 2,
        weanedCount: 2,
        status: 'Weaned',
      }),
    ];

    const careLogs: CareLog[] = [
      // Linked kit logs at day 21 (2026-07-22) should auto-supplement Willow's litter 3w milestone
      makeWeightLog('cl-ka', 'kit-a', '2026-07-22', 460),
      makeWeightLog('cl-kb', 'kit-b', '2026-07-22', 500),
    ];

    const res = evaluateLitterSurvivalAndMilestones({
      speciesProfile: rabbitProfile,
      breedings,
      animals: [damClover, damWillow, sireApollo, kitA, kitB],
      careLogs,
    });

    expect(res.speciesName).toBe('Rabbit');
    expect(res.litters).toHaveLength(2);
    expect(res.overallSummary.littersBornCount).toBe(2);
    expect(res.overallSummary.missedCount).toBe(1);
    expect(res.overallSummary.totalLiveBorn).toBe(14);
    expect(res.overallSummary.totalStillborn).toBe(2);
    expect(res.overallSummary.totalWeaned).toBe(12);
    // Live birth: 14 / 16 = 87.5%
    expect(res.overallSummary.liveBirthRatePct).toBe(87.5);
    // Weaning survival: 12 / (9 + 4) = 92.3%
    expect(res.overallSummary.weaningSurvivalRatePct).toBe(92.3);

    const clover = res.damSummaries.find((d) => d.parentId === 'dam-1');
    expect(clover?.totalBreedings).toBe(2);
    expect(clover?.conceptionRatePct).toBe(50);
    expect(clover?.liveBirthRatePct).toBe(80);
    expect(clover?.weaningSurvivalRatePct).toBe(100);
    expect(clover?.avg3WeekGrams).toBe(550);
    expect(clover?.avg6WeekGrams).toBe(1450);
    expect(clover?.avg8WeekGrams).toBe(2150);
    // ADG from 550g at 21d to 2150g at 56d = 1600 / 35 = 45.7 g/day
    expect(clover?.meanLitterAdgGramsPerDay).toBe(45.7);

    const willow = res.damSummaries.find((d) => d.parentId === 'dam-2');
    expect(willow?.weaningSurvivalRatePct).toBe(75);
    // Fallback offspring CareLog mean (460 + 500) / 2 = 480g
    expect(willow?.avg3WeekGrams).toBe(480);
    expect(willow?.litters[0].milestones[0].source).toBe('offspring_logs');

    // Sire summary rolls up Apollo across all 3 Rabbit breedings
    expect(res.sireSummaries).toHaveLength(1);
    expect(res.sireSummaries[0].totalBreedings).toBe(3);
    expect(res.sireSummaries[0].littersBornCount).toBe(2);

    // Season filter isolates Winter 2026 cleanly
    const winterOnly = evaluateLitterSurvivalAndMilestones({
      speciesProfile: rabbitProfile,
      breedings,
      animals: [damClover, damWillow, sireApollo, kitA, kitB],
      careLogs,
      seasonFilter: 'Winter 2026',
    });
    expect(winterOnly.litters).toHaveLength(1);
    expect(winterOnly.litters[0].breeding.id).toBe('b-1');
    expect(winterOnly.seasonalSummaries.map((s) => s.seasonKey)).toEqual(['Winter 2026']);
  });

  it('computes interpolated goal weights, multi-animal ADG series, and 7-day Barn Cohort Benchmarks', () => {
    const targetCurve = [
      { ageDays: 21, weightGrams: 500, label: '3w' },
      { ageDays: 56, weightGrams: 1900, label: '8w' },
    ];
    expect(interpolateTargetWeightAtAge(targetCurve, 21)).toBe(500);
    // Midpoint at 38.5d? Test exact age 35d -> 500 + (14/35)*1400 = 1060g
    expect(interpolateTargetWeightAtAge(targetCurve, 35)).toBe(1060);
    expect(interpolateTargetWeightAtAge(targetCurve, 10)).toBeNull();

    const rabbitProfile = {
      ...makeSpeciesProfile('Rabbit'),
      targetWeightCurve: targetCurve,
    };

    const fastKit = makeAnimal('k-fast', {
      name: 'Rocket',
      sex: 'Male',
      birthDateIso: '2026-04-01',
      weightGrams: 2200,
    });
    const slowKit = makeAnimal('k-slow', {
      name: 'Pebble',
      sex: 'Female',
      birthDateIso: '2026-04-01',
      weightGrams: 1650,
    });
    const noDobAnimal = makeAnimal('k-nodob', {
      name: 'Mystery',
      birthDateIso: '',
      weightGrams: 3000,
    });
    const goatAnimal = makeAnimal('g-kid', {
      species: 'Goat',
      name: 'Goat Kid',
      birthDateIso: '2026-04-01',
      weightGrams: 8000,
    });

    const careLogs: CareLog[] = [
      // Same-day log deduplication keeps latest log entry (560g)
      makeWeightLog('l1a', 'k-fast', '2026-04-22', 520),
      makeWeightLog('l1b', 'k-fast', '2026-04-22', 560),
      makeWeightLog('l2', 'k-fast', '2026-05-27', 2200), // 56d, +1640g over 35d = 46.9 g/d
      makeWeightLog('l3', 'k-slow', '2026-04-22', 440), // 21d
      makeWeightLog('l4', 'k-slow', '2026-05-27', 1650), // 56d
      makeWeightLog('lg', 'g-kid', '2026-05-27', 10000, 'Goat'),
    ];

    const fastSeries = buildAnimalGrowthSeries({
      animal: fastKit,
      careLogs,
      targetCurve,
      referenceDateIso: '2026-06-01',
    });
    expect(fastSeries.hasBirthDate).toBe(true);
    expect(fastSeries.points).toHaveLength(2);
    expect(fastSeries.startAgeDays).toBe(21);
    expect(fastSeries.startWeightGrams).toBe(560);
    expect(fastSeries.latestAgeDays).toBe(56);
    expect(fastSeries.totalGainGrams).toBe(1640);
    expect(fastSeries.overallAdgGramsPerDay).toBe(46.9);
    // Latest 2200g vs target 1900g = +300g (+15.8%)
    expect(fastSeries.targetDeltaGrams).toBe(300);
    expect(fastSeries.targetDeltaPct).toBe(15.8);

    const noDobSeries = buildAnimalGrowthSeries({
      animal: noDobAnimal,
      careLogs,
      referenceDateIso: '2026-06-01',
    });
    expect(noDobSeries.hasBirthDate).toBe(false);
    expect(noDobSeries.points).toEqual([]);

    // Barn cohort curve must group only Rabbit observations into 7-day buckets
    const cohort = buildBarnCohortBenchmarkCurve({
      animals: [fastKit, slowKit, noDobAnimal, goatAnimal],
      careLogs,
      speciesName: 'Rabbit',
      referenceDateIso: '2026-06-01',
    });
    expect(cohort.map((c) => c.ageDays)).toEqual([21, 56]);
    expect(cohort[0].meanWeightGrams).toBe(500); // (560 + 440) / 2
    expect(cohort[1].meanWeightGrams).toBe(1925); // (2200 + 1650) / 2
    expect(cohort[1].sampleCount).toBe(2);

    const chartModel = buildComparativeGrowthChartModel({
      animals: [fastKit, slowKit, goatAnimal],
      selectedAnimalIds: ['k-fast', 'k-slow'],
      careLogs,
      speciesProfile: rabbitProfile,
      includeCohortBenchmark: true,
      referenceDateIso: '2026-06-01',
    });
    expect(chartModel.series).toHaveLength(2);
    expect(chartModel.targetCurve).toEqual(targetCurve);
    expect(chartModel.cohortCurve).toHaveLength(2);
    expect(chartModel.maxAgeDays).toBe(56);
    expect(chartModel.maxWeightGrams).toBe(2200);
  });

  it('formats Rate of Gain and axis ticks across all WeightUnits cleanly', () => {
    expect(formatRateOfGain(null, 'grams')).toBe('—');
    expect(formatRateOfGain(42.5, 'grams')).toBe('+42.5 g/d');
    expect(formatRateOfGain(-100, 'kg')).toBe('-0.100 kg/d');
    expect(formatRateOfGain(453.59237, 'lbs')).toBe('+1.000 lb/d');
    expect(formatRateOfGain(28.349523125, 'lbs_oz')).toBe('+1.00 oz/d (+28.3 g/d)');

    expect(gramsToAxisNumeric(2500, 'kg')).toBe(2.5);
    expect(formatCompactWeightAxisTick(1500, 'grams')).toBe('1500g');
    expect(formatCompactWeightAxisTick(1500, 'kg')).toBe('1.5kg');
    expect(formatCompactWeightAxisTick(2268, 'lbs')).toBe('5.0lb');
    expect(formatCompactWeightAxisTick(2268, 'lbs_oz')).toContain('.');
  });
});
```

## `src/core/__tests__/herdBossImporter.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { HerdBossImporter } from '../importers/herdBossImporter';
import { isAnimalActive, isAnimalArchived, normalizeAnimalStatus } from '../models';
import { makeEmptySnapshot } from './testFixtures';

function encodeCsv(csv: string): Uint8Array {
  return new TextEncoder().encode(csv);
}

describe('herdBossImporter & AnimalStatus archive detection', () => {
  it('normalizes active, junior, and inactive/archived import statuses consistently', () => {
    expect(normalizeAnimalStatus('Active')).toBe('Active');
    expect(normalizeAnimalStatus('Weanling')).toBe('Junior');
    expect(normalizeAnimalStatus('Inactive')).toBe('Archived');
    expect(normalizeAnimalStatus('Not Active')).toBe('Archived');
    expect(normalizeAnimalStatus('Sold')).toBe('Sold');
    expect(normalizeAnimalStatus('Deceased')).toBe('Deceased');
    expect(normalizeAnimalStatus('Reference Ancestor')).toBe('Retired');

    expect(isAnimalActive({ status: 'Active' })).toBe(true);
    expect(isAnimalActive({ status: 'Junior' })).toBe(true);
    expect(isAnimalArchived({ status: 'Archived' })).toBe(true);
    expect(isAnimalArchived({ status: 'Sold' })).toBe(true);
    expect(isAnimalArchived({ status: 'Deceased' })).toBe(true);
    expect(isAnimalArchived({ status: 'Retired' })).toBe(true);
  });

  it('detects Archived/Sold/Deceased/Active flags and resolves sire/dam pedigrees on CSV import', () => {
    const csv = [
      'ID,Species,Name,Tag,Sex,Status,Archived,Active,Sold_Date,Death_Date,Birth_Date,Weight,Sire,Dam',
      '101,Rabbit,Founder Buck,FB1,Buck,Active,false,true,,,2022-03-01,9.5,,',
      '102,Rabbit,Past Doe,PD2,Doe,,true,,,,2022-04-10,10.0,,',
      '103,Rabbit,Inactive Doe,ID3,Doe,,false,false,,,2023-01-12,9.2,FB1,PD2',
      '104,Rabbit,Market Kit,MK4,Buck,Active,,,2025-05-01,,2025-02-01,5.0,FB1,ID3',
      '105,Rabbit,Lost Kit,LK5,Doe,,,,2024-06-01,2024-08-01,2024-03-01,4.1,FB1,PD2',
      '106,Alpaca,Andean Star,AS6,Macho,Active,false,true,,,2023-07-07,135,,',
    ].join('\n');

    const snapshot = makeEmptySnapshot();
    const preview = HerdBossImporter.parse(
      [{ fileName: 'animals.csv', bytes: encodeCsv(csv) }],
      snapshot,
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(6);
    expect(preview.speciesDetected).toContain('Rabbit');
    expect(preview.speciesDetected).toContain('Alpaca');
    expect(preview.newSpeciesProfiles.some((p) => p.name === 'Alpaca')).toBe(true);

    const byName = new Map(preview.animals.map((a) => [a.name, a]));
    expect(byName.get('Founder Buck')?.status).toBe('Active');
    expect(byName.get('Founder Buck')?.sex).toBe('Male');

    expect(byName.get('Past Doe')?.status).toBe('Archived');
    expect(isAnimalArchived(byName.get('Past Doe')!)).toBe(true);

    expect(byName.get('Inactive Doe')?.status).toBe('Archived');
    expect(byName.get('Inactive Doe')?.sireId).toBe(byName.get('Founder Buck')?.id);
    expect(byName.get('Inactive Doe')?.damId).toBe(byName.get('Past Doe')?.id);

    expect(byName.get('Market Kit')?.status).toBe('Sold');
    expect(byName.get('Lost Kit')?.status).toBe('Deceased');
    expect(byName.get('Andean Star')?.sex).toBe('Male');
    expect(preview.parentLinksResolved).toBeGreaterThanOrEqual(6);
  });
});
```

## `src/core/__tests__/imageOptimizationSpec.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  capCanvasDevicePixelRatio,
  clampCanvasDimensionsToAreaCeiling,
  computeScaledDimensions,
  getCanvasAreaCeiling,
  MAX_CANVAS_AREA_PX,
  MAX_CONSTRAINED_CANVAS_AREA_PX,
} from '../imageOptimizationSpec';

describe('imageOptimizationSpec canvas area ceilings & DPR caps', () => {
  it('defines 16M px standard ceiling and 3M px constrained ceiling', () => {
    expect(MAX_CANVAS_AREA_PX).toBe(16_000_000);
    expect(MAX_CONSTRAINED_CANVAS_AREA_PX).toBe(3_000_000);
    expect(getCanvasAreaCeiling(false)).toBe(16_000_000);
    expect(getCanvasAreaCeiling(true)).toBe(3_000_000);
  });

  it('clamps oversized canvas dimensions proportionally to stay within the area ceiling', () => {
    const ok = clampCanvasDimensionsToAreaCeiling(4000, 4000, MAX_CANVAS_AREA_PX);
    expect(ok).toEqual({ width: 4000, height: 4000, wasClamped: false });

    const ultraWide = clampCanvasDimensionsToAreaCeiling(10000, 3000, MAX_CANVAS_AREA_PX);
    expect(ultraWide.wasClamped).toBe(true);
    expect(ultraWide.width * ultraWide.height).toBeLessThanOrEqual(MAX_CANVAS_AREA_PX);
    expect(ultraWide.width).toBeGreaterThan(ultraWide.height);

    const constrained = clampCanvasDimensionsToAreaCeiling(
      3000,
      2000,
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );
    expect(constrained.wasClamped).toBe(true);
    expect(constrained.width * constrained.height).toBeLessThanOrEqual(
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );

    const edge = clampCanvasDimensionsToAreaCeiling(0, -10, 0);
    expect(edge.width).toBeGreaterThanOrEqual(1);
    expect(edge.height).toBeGreaterThanOrEqual(1);
  });

  it('applies area ceilings inside computeScaledDimensions when maxDimension alone exceeds ceiling', () => {
    const squareConstrained = computeScaledDimensions(
      4000,
      4000,
      2048,
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );
    expect(squareConstrained.wasResized).toBe(true);
    expect(squareConstrained.width * squareConstrained.height).toBeLessThanOrEqual(
      MAX_CONSTRAINED_CANVAS_AREA_PX
    );
    expect(squareConstrained.width).toBe(squareConstrained.height);
  });

  it('caps devicePixelRatio at min(2, dpr || 1) and forces 1 when constrained', () => {
    expect(capCanvasDevicePixelRatio(3, false)).toBe(2);
    expect(capCanvasDevicePixelRatio(2, false)).toBe(2);
    expect(capCanvasDevicePixelRatio(1.5, false)).toBe(1.5);
    expect(capCanvasDevicePixelRatio(0, false)).toBe(1);
    expect(capCanvasDevicePixelRatio(undefined, false)).toBe(1);
    expect(capCanvasDevicePixelRatio(Number.NaN, false)).toBe(1);

    expect(capCanvasDevicePixelRatio(3, true)).toBe(1);
    expect(capCanvasDevicePixelRatio(2, true)).toBe(1);
  });
});
```

## `src/core/__tests__/improvementRegistry.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildImprovementsRecoveryJson,
  evaluateImprovementInvariants,
  formatImprovementsMarkdown,
  IMPROVEMENTS_REGISTRY,
} from '../improvementRegistry';

describe('improvementRegistry — anti-wipeout tracking & drift verification', () => {
  it('defines unique IDs, non-empty tracked files, invariants, and restoration playbooks for every entry', () => {
    const ids = new Set<string>();
    for (const entry of IMPROVEMENTS_REGISTRY) {
      expect(entry.id).toMatch(/^IMP-\d{3}$/);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);

      expect(entry.title.trim().length).toBeGreaterThan(5);
      expect(entry.files.length).toBeGreaterThan(0);
      expect(entry.invariants.length).toBeGreaterThan(0);
      expect(entry.restorePlaybook.length).toBeGreaterThan(0);
      for (const inv of entry.invariants) {
        expect(inv.requiredSubstrings.length).toBeGreaterThan(0);
      }
    }
  });

  it('passes when all required tokens are present and flags missing or forbidden drift accurately', () => {
    const mockDisk: Record<string, string> = {};
    for (const entry of IMPROVEMENTS_REGISTRY) {
      for (const inv of entry.invariants) {
        mockDisk[inv.filePath] = [
          mockDisk[inv.filePath] ?? '',
          ...inv.requiredSubstrings,
        ].join('\n');
      }
    }

    const cleanReport = evaluateImprovementInvariants(mockDisk);
    expect(cleanReport.ok).toBe(true);
    expect(cleanReport.violations).toHaveLength(0);
    expect(cleanReport.passedCount).toBe(IMPROVEMENTS_REGISTRY.length);

    // Simulate a GitHub overwrite wiping a critical helper in syncAndExports.ts and re-enabling devOptions SW
    const driftedDisk: Record<string, string> = {
      ...mockDisk,
      'src/core/syncAndExports.ts': 'export function exportBarnBackupJson() {}',
      'vite.config.ts': `${mockDisk['vite.config.ts']}\ndevOptions: {\n      enabled: true`,
    };

    const driftedReport = evaluateImprovementInvariants(driftedDisk);
    expect(driftedReport.ok).toBe(false);
    expect(driftedReport.violations.some((v) => v.entryId === 'IMP-001')).toBe(true);
    expect(driftedReport.violations.some((v) => v.entryId === 'IMP-007')).toBe(true);
    expect(
      driftedReport.violations.some((v) => v.issue.includes('Detected regression pattern'))
    ).toBe(true);
  });

  it('generates readable Markdown documentation and valid JSON recovery bundles', () => {
    const md = formatImprovementsMarkdown();
    expect(md).toContain('# Community Pedigree — App Improvements & GitHub-Overwrite Recovery Log');
    expect(md).toContain('npm run verify:improvements');
    expect(md).toContain('IMP-001');
    expect(md).toContain('IMP-011');
    expect(md).toContain('IMP-014');
    expect(md).toContain('IMP-015');
    expect(md).toContain('IMP-016');
    expect(md).toContain('IMP-017');
    expect(md).toContain('IMP-021');
    expect(md).toContain('IMP-022');
    expect(md).toContain('IMP-023');
    expect(md).toContain('IMP-029');
    expect(md).toContain('IMP-030');
    expect(md).toContain('IMP-031');
    expect(md).toContain('IMP-032');
    expect(md).toContain('IMP-034');
    expect(md).toContain('IMP-035');
    expect(md).toContain('IMP-036');
    expect(md).toContain('IMP-037');
    expect(md).toContain('IMP-038');
    expect(md).toContain('IMP-039');
    expect(md).toContain('IMP-040');
    expect(md).toContain('IMP-041');
    expect(md).toContain('IMP-042');
    expect(md).toContain('IMP-043');
    expect(md).toContain('IMP-044');
    expect(md).toContain('IMP-045');
    expect(md).toContain('IMP-046');
    expect(md).toContain('IMP-047');

    const jsonText = buildImprovementsRecoveryJson();
    const parsed = JSON.parse(jsonText);
    expect(parsed.format).toBe('community-pedigree-improvements-log');
    expect(parsed.totalEntries).toBe(IMPROVEMENTS_REGISTRY.length);
    expect(Array.isArray(parsed.entries)).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-017')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-021')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-022')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-023')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-029')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-030')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-031')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-032')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-034')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-035')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-036')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-037')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-038')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-039')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-040')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-041')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-042')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-043')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-044')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-045')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-046')).toBe(true);
    expect(parsed.entries.some((e: { id: string }) => e.id === 'IMP-047')).toBe(true);
  });
});
```

## `src/core/__tests__/p2pSyncProtocol.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  createP2pAckWireMessage,
  createP2pDeltaWireMessage,
  decodeP2pSignalToken,
  encodeP2pSignalToken,
  parseP2pWireOrDeltaPayload,
  summarizeTaskReconciliation,
} from '../p2pSyncProtocol';
import {
  BarnDatabaseSnapshot,
  BarnTask,
} from '../models';
import {
  diffEntityFieldsToOperations,
  mergeDeltaOperations,
} from '../syncOutbox';
import { makeEmptySnapshot } from './testFixtures';

const TS1 = '2026-04-10T10:00:00.000Z';
const TS2 = '2026-04-10T11:00:00.000Z';

describe('p2pSyncProtocol — LAN P2P Signaling, Wire Framing & Outbox Reconciliation', () => {
  it('roundtrips UTF-8 SDP signaling envelopes via CP-LAN1 tokens', () => {
    const token = encodeP2pSignalToken({
      v: 1,
      type: 'offer',
      deviceId: 'barn-tablet-ñ1',
      sdp: 'v=0\r\no=- 12345 2 IN IP4 192.168.1.42\r\ns=Pedigree™\r\n',
      createdAtIso: TS1,
    });

    expect(token.startsWith('CP-LAN1:')).toBe(true);
    const decoded = decodeP2pSignalToken(token);
    expect(decoded.type).toBe('offer');
    expect(decoded.deviceId).toBe('barn-tablet-ñ1');
    expect(decoded.sdp).toContain('Pedigree™');
  });

  it('frames P2P delta and ack packets and rejects malformed payloads', () => {
    const op = diffEntityFieldsToOperations({
      entityType: 'task',
      previous: undefined,
      next: {
        id: 'task-1',
        species: 'Rabbit',
        title: 'Check Nestbox',
        category: 'Nestbox',
        priority: 'High',
        startDateIso: '2026-04-10',
        dueDateIso: '2026-04-12',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        completed: false,
        _rev: 1,
        createdAt: TS1,
        updatedAt: TS1,
      } satisfies BarnTask,
      deviceId: 'dev-a',
      nextCounter: (() => {
        let c = 0;
        return () => ++c;
      })(),
      timestamp: TS1,
      recordRev: 1,
    });

    const wire = createP2pDeltaWireMessage({
      senderDeviceId: 'dev-a',
      operations: op,
      sentAtIso: TS1,
    });

    const parsedDelta = parseP2pWireOrDeltaPayload(JSON.stringify(wire));
    expect(parsedDelta.messageKind).toBe('delta');
    expect(parsedDelta.senderDeviceId).toBe('dev-a');
    expect(parsedDelta.operations.length).toBeGreaterThan(0);

    const ack = createP2pAckWireMessage({
      senderDeviceId: 'dev-b',
      receivedCount: parsedDelta.operations.length,
      appliedCount: parsedDelta.operations.length,
      taskOpsCount: parsedDelta.operations.length,
      conflictCount: 0,
      ackAtIso: TS2,
    });
    const parsedAck = parseP2pWireOrDeltaPayload(JSON.stringify(ack));
    expect(parsedAck.messageKind).toBe('ack');
    expect(parsedAck.ack?.appliedCount).toBe(parsedDelta.operations.length);

    expect(() => parseP2pWireOrDeltaPayload('{"invalid":true}')).toThrow();
  });

  it('reconciles rescheduled Gantt startDateIso/dueDateIso and surfaces field conflicts', () => {
    const baseTask: BarnTask = {
      id: 'task-99',
      species: 'Rabbit',
      title: 'Wean Litter A',
      category: 'Weaning',
      priority: 'Normal',
      startDateIso: '2026-04-10',
      dueDateIso: '2026-04-14',
      linkedAnimalId: '',
      linkedAnimalName: '',
      linkedBreedingId: '',
      completed: false,
      _rev: 1,
      createdAt: TS1,
      updatedAt: TS1,
    };

    const snapshotA: BarnDatabaseSnapshot = makeEmptySnapshot({
      tasks: [{ ...baseTask, dueDateIso: '2026-04-16', _rev: 2, updatedAt: TS1 }],
    });

    let counterB = 10;
    const opsFromB = diffEntityFieldsToOperations({
      entityType: 'task',
      previous: baseTask,
      next: {
        ...baseTask,
        startDateIso: '2026-04-11',
        dueDateIso: '2026-04-18',
        _rev: 2,
        updatedAt: TS2,
      },
      deviceId: 'dev-b',
      nextCounter: () => ++counterB,
      timestamp: TS2,
      recordRev: 2,
    });

    const localDueOp = diffEntityFieldsToOperations({
      entityType: 'task',
      previous: baseTask,
      next: { ...baseTask, dueDateIso: '2026-04-16', _rev: 2, updatedAt: TS1 },
      deviceId: 'dev-a',
      nextCounter: () => 5,
      timestamp: TS1,
      recordRev: 2,
    });

    const merged = mergeDeltaOperations(snapshotA, localDueOp, opsFromB, 'dev-a');

    const updatedTask = merged.nextSnapshot.tasks.find((t) => t.id === 'task-99');
    expect(updatedTask?.startDateIso).toBe('2026-04-11');
    expect(updatedTask?.dueDateIso).toBe('2026-04-18');
    expect(merged.newConflicts.some((c) => c.field_name === 'dueDateIso')).toBe(true);

    const summary = summarizeTaskReconciliation({
      peerDeviceId: 'dev-b',
      receivedOps: opsFromB,
      appliedOpCount: merged.appliedOpCount,
      newConflicts: merged.newConflicts,
      reconciledAtIso: TS2,
    });

    expect(summary.taskOpsReceivedCount).toBe(opsFromB.length);
    expect(summary.newTaskConflictCount).toBeGreaterThanOrEqual(1);
    expect(summary.appliedOpCount).toBeGreaterThan(0);
  });
});
```

## `src/core/__tests__/pairingMatrix.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { Animal } from '../models';
import {
  buildPairingComparisonMatrix,
  MAX_MATRIX_CANDIDATES,
  selectDefaultMatrixCandidateIds,
} from '../pairingMatrix';
import { makeAnimal } from './testFixtures';

function toHerdMap(animals: Animal[]): Map<string, Animal> {
  return new Map(animals.map((a) => [a.id, a]));
}

function buildLineageFixture(): {
  dam: Animal;
  outcrossSire: Animal;
  halfSibSire: Animal;
  fullSibSire: Animal;
  charlieRiskSire: Animal;
  herdById: Map<string, Animal>;
} {
  const founderBuck = makeAnimal('founder-buck', {
    name: 'King Crimson',
    tattoo: 'KC-01',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Red',
    genotypeRaw: 'AA BB CC DD ee ww enen',
    confirmedCarrierOf: ['REW / Ruby-Eyed White (cc)'],
  });

  const founderDoeA = makeAnimal('founder-doe-a', {
    name: 'Maple Queen',
    tattoo: 'MQ-01',
    sex: 'Female',
    breed: 'New Zealand',
    variety: 'Red',
    genotypeRaw: 'AA BB CC DD ee ww enen',
  });

  const founderDoeB = makeAnimal('founder-doe-b', {
    name: 'Clover Belle',
    tattoo: 'CB-01',
    sex: 'Female',
    breed: 'New Zealand',
    variety: 'Red',
    genotypeRaw: 'AA BB CC DD ee ww enen',
  });

  // Dam: daughter of King Crimson x Maple Queen, Confirmed Dilute carrier + Broken (Enen)
  const dam = makeAnimal('dam-1', {
    name: 'Amber Rose',
    tattoo: 'AR-10',
    sex: 'Female',
    breed: 'New Zealand',
    variety: 'Broken Red',
    sireId: founderBuck.id,
    damId: founderDoeA.id,
    genotypeRaw: 'AA BB Cc DD ee ww Enen',
    confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
  });

  // Outcross Sire: unrelated, cleared of Dilute, solid black
  const outcrossSire = makeAnimal('sire-outcross', {
    name: 'Shadow Oak',
    tattoo: 'SO-02',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Black',
    genotypeRaw: 'aa BB CC DD EE ww enen',
    clearedCarrierOf: [{ trait: 'Dilute / Blue-Lilac-Fawn (dd)', proofType: 'dna_tested' }],
  });

  // Half-sibling Sire: shares King Crimson (COI = 12.5%) and Suspected Dilute
  const halfSibSire = makeAnimal('sire-halfsib', {
    name: 'Copper Ridge',
    tattoo: 'CR-05',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Red',
    sireId: founderBuck.id,
    damId: founderDoeB.id,
    genotypeRaw: 'AA BB CC DD ee ww enen',
    suspectedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
  });

  // Full-sibling Sire: shares King Crimson & Maple Queen (COI = 25%) + Confirmed Dilute (Danger!)
  const fullSibSire = makeAnimal('sire-fullsib', {
    name: 'Scarlet Blaze',
    tattoo: 'SB-09',
    sex: 'Male',
    breed: 'New Zealand',
    variety: 'Red',
    sireId: founderBuck.id,
    damId: founderDoeA.id,
    genotypeRaw: 'AA BB CC DD ee ww enen',
    confirmedCarrierOf: ['Dilute / Blue-Lilac-Fawn (dd)'],
  });

  // Unrelated Broken Sire: 0% COI, but Enen x Enen triggers 25% Charlie (EnEn) genetic danger
  const charlieRiskSire = makeAnimal('sire-charlie', {
    name: 'Spotty Jack',
    tattoo: 'SJ-07',
    sex: 'Male',
    breed: 'Rex',
    variety: 'Broken Red',
    genotypeRaw: 'AA BB CC DD ee ww Enen',
  });

  const herdById = toHerdMap([
    founderBuck,
    founderDoeA,
    founderDoeB,
    dam,
    outcrossSire,
    halfSibSire,
    fullSibSire,
    charlieRiskSire,
  ]);

  return { dam, outcrossSire, halfSibSire, fullSibSire, charlieRiskSire, herdById };
}

describe('pairingMatrix — multi-candidate side-by-side breeding comparison', () => {
  it('compares 1 dam against multiple candidate sires with exact COI, bottleneck ancestors, carrier/genetic risks, and coat varieties', () => {
    const { dam, outcrossSire, halfSibSire, fullSibSire, charlieRiskSire, herdById } =
      buildLineageFixture();

    const result = buildPairingComparisonMatrix({
      anchor: dam,
      anchorRole: 'dam',
      candidates: [fullSibSire, halfSibSire, charlieRiskSire, outcrossSire],
      herdById,
      speciesName: 'Rabbit',
      sortBy: 'best_match',
    });

    expect(result.anchorRole).toBe('dam');
    expect(result.anchor.id).toBe(dam.id);
    expect(result.rows).toHaveLength(4);

    // Best match puts 0-danger outcross first, then 0-danger half-sib (12.5% COI), then danger rows
    expect(result.rows[0].candidate.id).toBe(outcrossSire.id);
    expect(result.rows[0].coiPercent).toBeCloseTo(0, 4);
    expect(result.rows[0].isRecommendedLowestRisk).toBe(true);
    expect(result.rows[0].topBottlenecks).toHaveLength(0);
    expect(result.rows[0].riskSummary.totalDangerCount).toBe(0);
    expect(result.rows[0].topVarieties.length).toBeGreaterThan(0);

    // Half-sib row: 12.5% COI via King Crimson bottleneck + Dilute warning (Confirmed x Suspected)
    const halfSibRow = result.rows.find((r) => r.candidate.id === halfSibSire.id)!;
    expect(halfSibRow.coiPercent).toBeCloseTo(12.5, 2);
    expect(halfSibRow.topBottlenecks).toHaveLength(1);
    expect(halfSibRow.topBottlenecks[0].name).toBe('King Crimson');
    expect(halfSibRow.topBottlenecks[0].coiContributionPercent).toBeCloseTo(12.5, 2);
    expect(halfSibRow.riskSummary.carrierDangerCount).toBe(0);
    expect(halfSibRow.riskSummary.carrierWarningCount).toBeGreaterThanOrEqual(1);

    // Full-sib row: 25% COI via 2 shared bottlenecks + Confirmed x Confirmed Dilute danger
    const fullSibRow = result.rows.find((r) => r.candidate.id === fullSibSire.id)!;
    expect(fullSibRow.coiPercent).toBeCloseTo(25.0, 2);
    expect(fullSibRow.topBottlenecks).toHaveLength(2);
    expect(fullSibRow.riskSummary.carrierDangerCount).toBe(1);
    expect(fullSibRow.riskSummary.totalDangerCount).toBe(1);

    // Charlie risk row: 0% COI but 25% EnEn genetic danger alert
    const charlieRow = result.rows.find((r) => r.candidate.id === charlieRiskSire.id)!;
    expect(charlieRow.coiPercent).toBeCloseTo(0, 4);
    expect(charlieRow.riskSummary.geneticDangerCount).toBe(1);
    expect(charlieRow.riskSummary.totalDangerCount).toBe(1);
    expect(charlieRow.sameBreed).toBe(false);
    expect(
      charlieRow.riskSummary.geneticAlerts.some((a) => a.title.includes('Charlie'))
    ).toBe(true);

    // Summary stats
    expect(result.summary.totalEvaluated).toBe(4);
    expect(result.summary.dangerRiskCount).toBe(2);
    expect(result.summary.lowCoiCount).toBe(1);
    expect(result.summary.lowestCoiPercent).toBeCloseTo(0, 4);
    expect(result.summary.highestCoiPercent).toBeCloseTo(25, 2);
  });

  it('supports reverse mode (1 anchor sire vs. multiple candidate dams)', () => {
    const { dam, halfSibSire, herdById } = buildLineageFixture();
    const unrelatedDam = makeAnimal('dam-unrelated', {
      name: 'Willow Snow',
      tattoo: 'WS-04',
      sex: 'Female',
      breed: 'New Zealand',
      variety: 'Red',
      genotypeRaw: 'AA BB CC DD ee ww enen',
    });
    herdById.set(unrelatedDam.id, unrelatedDam);

    const result = buildPairingComparisonMatrix({
      anchor: halfSibSire,
      anchorRole: 'sire',
      candidates: [dam, unrelatedDam],
      herdById,
      speciesName: 'Rabbit',
    });

    expect(result.anchorRole).toBe('sire');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sire.id).toBe(halfSibSire.id);
    expect(result.rows[0].dam.id).toBe(unrelatedDam.id);
    expect(result.rows[0].coiPercent).toBeCloseTo(0, 4);
    expect(result.rows[1].dam.id).toBe(dam.id);
    expect(result.rows[1].coiPercent).toBeCloseTo(12.5, 2);
  });

  it('supports sorting modes and hideDangerRisks / maxCoiPercent filters', () => {
    const { dam, outcrossSire, halfSibSire, fullSibSire, charlieRiskSire, herdById } =
      buildLineageFixture();

    const byCoiDesc = buildPairingComparisonMatrix({
      anchor: dam,
      anchorRole: 'dam',
      candidates: [outcrossSire, halfSibSire, fullSibSire, charlieRiskSire],
      herdById,
      sortBy: 'coi_desc',
    });
    expect(byCoiDesc.rows[0].candidate.id).toBe(fullSibSire.id);
    expect(byCoiDesc.rows[1].candidate.id).toBe(halfSibSire.id);

    const filteredSafeLowCoi = buildPairingComparisonMatrix({
      anchor: dam,
      anchorRole: 'dam',
      candidates: [outcrossSire, halfSibSire, fullSibSire, charlieRiskSire],
      herdById,
      hideDangerRisks: true,
      maxCoiPercent: 10,
    });
    expect(filteredSafeLowCoi.rows.map((r) => r.candidate.id)).toEqual([outcrossSire.id]);
    expect(filteredSafeLowCoi.summary.totalEvaluated).toBe(4);
    expect(filteredSafeLowCoi.summary.totalMatchingFilters).toBe(1);
  });

  it('isolates custom species without bleeding Rabbit coat color formulas and enforces species boundary / deduplication / cap', () => {
    const customDam = makeAnimal('yak-dam', {
      name: 'Tibetan Star',
      tattoo: 'YS-1',
      species: 'Yak',
      sex: 'Female',
      genotypeRaw: 'Trim-White / Polled',
    });
    const customSire = makeAnimal('yak-sire', {
      name: 'Summit Bull',
      tattoo: 'YS-2',
      species: 'Yak',
      sex: 'Male',
      genotypeRaw: 'Royal Black',
    });
    const wrongSpeciesSire = makeAnimal('rabbit-intruder', {
      name: 'Rabbit Intruder',
      tattoo: 'RB-9',
      species: 'Rabbit',
      sex: 'Male',
      genotypeRaw: 'AA BB CC DD ee',
    });

    const herdById = toHerdMap([customDam, customSire, wrongSpeciesSire]);
    const result = buildPairingComparisonMatrix({
      anchor: customDam,
      anchorRole: 'dam',
      candidates: [customDam, customSire, customSire, wrongSpeciesSire],
      herdById,
      speciesName: 'Yak',
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].candidate.id).toBe(customSire.id);
    expect(result.rows[0].genetics.isCustomSpeciesFallback).toBe(true);
    expect(result.rows[0].topVarieties).toHaveLength(0);

    // Cap enforcement test
    const manySires: Animal[] = Array.from({ length: MAX_MATRIX_CANDIDATES + 5 }, (_, i) =>
      makeAnimal(`yak-s-${i}`, {
        name: `Bull ${i}`,
        tattoo: `B-${i}`,
        species: 'Yak',
        sex: 'Male',
      })
    );
    const cappedResult = buildPairingComparisonMatrix({
      anchor: customDam,
      anchorRole: 'dam',
      candidates: manySires,
      herdById: toHerdMap([customDam, ...manySires]),
      speciesName: 'Yak',
    });
    expect(cappedResult.summary.totalRequested).toBe(MAX_MATRIX_CANDIDATES + 5);
    expect(cappedResult.summary.totalEvaluated).toBe(MAX_MATRIX_CANDIDATES);
    expect(cappedResult.summary.truncatedCount).toBe(5);
  });

  it('selects default candidates prioritizing active same-breed animals before different breeds and archived stock', () => {
    const anchor = makeAnimal('d-1', {
      name: 'Anchor',
      sex: 'Female',
      breed: 'Holland Lop',
    });
    const archivedSame = makeAnimal('s-arch', {
      name: 'Alpha Archived',
      sex: 'Male',
      breed: 'Holland Lop',
      status: 'Archived',
      archived: true,
    });
    const diffBreed = makeAnimal('s-diff', {
      name: 'Beta Rex',
      sex: 'Male',
      breed: 'Mini Rex',
    });
    const sameBreedActive = makeAnimal('s-same', {
      name: 'Zeta Lop',
      sex: 'Male',
      breed: 'Holland Lop',
    });

    const ids = selectDefaultMatrixCandidateIds(
      anchor,
      [archivedSame, diffBreed, sameBreedActive],
      2
    );
    expect(ids).toEqual(['s-same', 's-diff']);
  });
});
```

## `src/core/__tests__/pdfExporter.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  formatPedigreeWeight,
  formatWeightArbaLbsOzDot,
} from '../models';
import { buildPedigreePdfBytes } from '../pdfExporter';
import {
  exportBarnBackupJson,
  generateEvansHtmPedigree,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

describe('ARBA lbs.oz dot notation, pedigree orientation/logo, and offline PDF export', () => {
  it('formats weights in ARBA lbs.oz dot notation (e.g., 10.04) and handles ounce rollover', () => {
    // 10 lb 4 oz = 164 oz = 4649.32 g
    expect(formatWeightArbaLbsOzDot(Math.round(164 * 28.349523125))).toBe('10.04');
    // 4 lb 12 oz = 76 oz
    expect(formatWeightArbaLbsOzDot(Math.round(76 * 28.349523125))).toBe('4.12');
    // 0 lb 8 oz = 8 oz
    expect(formatWeightArbaLbsOzDot(Math.round(8 * 28.349523125))).toBe('0.08');
    // Rollover edge: 5 lb 15.9 oz -> rounds to 6.00
    expect(formatWeightArbaLbsOzDot(Math.round((5 * 16 + 15.9) * 28.349523125))).toBe('6.00');
    expect(formatWeightArbaLbsOzDot(0)).toBe('Unweighed');

    expect(formatPedigreeWeight(Math.round(164 * 28.349523125), 'lbs_oz', false)).toBe('10 lb 4 oz');
    expect(formatPedigreeWeight(Math.round(164 * 28.349523125), 'kg', true)).toBe('10.04');
  });

  it('supports Landscape/Portrait orientation, breeder logo, and lbs.oz notation in generateEvansHtmPedigree', () => {
    const profiles = [makeSpeciesProfile('Rabbit')];
    const sire = makeAnimal('s1', {
      name: 'Copper King',
      tattoo: 'CK1',
      sex: 'Male',
      weightGrams: Math.round(164 * 28.349523125), // 10.04
    });
    const dam = makeAnimal('d1', {
      name: 'Ruby Queen',
      tattoo: 'RQ2',
      sex: 'Female',
      weightGrams: Math.round(172 * 28.349523125), // 10.12
    });
    const kit = makeAnimal('k1', {
      name: 'Clover',
      tattoo: 'CL9',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
      weightGrams: Math.round(76 * 28.349523125), // 4.12
    });
    const logoUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const settings = makeSettings({ breederLogoDataUrl: logoUrl });

    const portraitHtml = generateEvansHtmPedigree(
      kit,
      [kit, sire, dam],
      profiles,
      settings,
      4,
      undefined,
      {
        orientation: 'portrait',
        showWeights: true,
        arbaLbsOzDotNotation: true,
        showBreederLogo: true,
      }
    );

    expect(portraitHtml).toContain('@page { size: letter portrait;');
    expect(portraitHtml).toContain('max-width: 8.5in;');
    expect(portraitHtml).toContain(`class="barn-logo" src="${logoUrl}"`);
    expect(portraitHtml).toContain('4.12');
    expect(portraitHtml).toContain('10.04');
    expect(portraitHtml).toContain('10.12');

    // Can disable logo & use SVG-rejected safety
    const hiddenLogoHtml = generateEvansHtmPedigree(
      kit,
      [kit, sire, dam],
      profiles,
      settings,
      3,
      undefined,
      {
        orientation: 'landscape',
        showBreederLogo: false,
        breederLogoDataUrl: 'data:image/svg+xml,<svg/>',
      }
    );
    expect(hiddenLogoHtml).toContain('@page { size: letter landscape;');
    expect(hiddenLogoHtml).not.toContain('class="barn-logo"');
  });

  it('builds a valid offline PDF 1.4 binary with exact xref offsets, Portrait/Landscape MediaBox, and JPEG XObjects', () => {
    const profiles = [makeSpeciesProfile('Rabbit')];
    const sire = makeAnimal('s1', {
      name: 'Copper King',
      tattoo: 'CK1',
      sex: 'Male',
      weightGrams: Math.round(164 * 28.349523125),
      registrationNumber: 'ARBA-1234',
    });
    const dam = makeAnimal('d1', {
      name: 'Ruby Queen',
      tattoo: 'RQ2',
      sex: 'Female',
      weightGrams: Math.round(172 * 28.349523125),
    });
    const kit = makeAnimal('k1', {
      name: 'Clover (Special)',
      tattoo: 'CL\\9',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
      weightGrams: Math.round(76 * 28.349523125),
      genotypeRaw: 'A_ B_ C_ D_ ee',
    });
    const settings = makeSettings();
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

    const landscapePdf = buildPedigreePdfBytes({
      subject: kit,
      allAnimals: [kit, sire, dam],
      speciesProfiles: profiles,
      settings,
      generations: 3,
      printOptions: {
        orientation: 'landscape',
        showWeights: true,
        arbaLbsOzDotNotation: true,
        showGenotypes: true,
        showBreederFooter: true,
        breederContactLine: 'https://meadowbrook.example',
        showBreederLogo: true,
      },
      breederLogoJpeg: { bytes: fakeJpeg, width: 120, height: 60 },
      subjectPhotoJpeg: { bytes: fakeJpeg, width: 200, height: 200 },
    });

    const landscapeText = bytesToLatin1(landscapePdf);
    expect(landscapeText.startsWith('%PDF-1.4')).toBe(true);
    expect(landscapeText.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(landscapeText).toContain('/MediaBox [0 0 792 612]');
    expect(landscapeText).toContain('/ImLogo');
    expect(landscapeText).toContain('/ImPhoto');
    expect(landscapeText).toContain('/Filter /DCTDecode');
    expect(landscapeText).toContain('Clover \\(Special\\)');
    expect(landscapeText).toContain('CL\\\\9');
    expect(landscapeText).toContain('4.12');
    expect(landscapeText).toContain('10.04');
    expect(landscapeText).toContain('https://meadowbrook.example');

    // Verify startxref offset points directly to 'xref'
    const startXrefMatch = landscapeText.match(/startxref\n(\d+)\n%%EOF/);
    expect(startXrefMatch).toBeTruthy();
    const xrefPos = Number(startXrefMatch![1]);
    expect(landscapeText.slice(xrefPos, xrefPos + 4)).toBe('xref');

    // Verify every xref object offset points to `<id> 0 obj`
    const xrefBody = landscapeText.slice(xrefPos).split('trailer')[0];
    const entryMatches = Array.from(xrefBody.matchAll(/(\d{10}) 00000 n /g));
    expect(entryMatches.length).toBeGreaterThanOrEqual(7);
    entryMatches.forEach((m, idx) => {
      const objOffset = Number(m[1]);
      expect(landscapeText.slice(objOffset, objOffset + 12)).toMatch(
        new RegExp(`^${idx + 1} 0 obj\\n`)
      );
    });

    // Portrait 6-generation check
    const portraitPdf = buildPedigreePdfBytes({
      subject: kit,
      allAnimals: [kit, sire, dam],
      speciesProfiles: profiles,
      settings,
      generations: 6,
      printOptions: {
        orientation: 'portrait',
        showWeights: false,
        showGenotypes: false,
        showBreederFooter: false,
      },
    });
    const portraitText = bytesToLatin1(portraitPdf);
    expect(portraitText).toContain('/MediaBox [0 0 612 792]');
    expect(portraitText).not.toContain('Breeder Signature:');
  });

  it('round-trips BarnSettings.breederLogoDataUrl safely through JSON backup export & parse', () => {
    const logoUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const snap = makeEmptySnapshot({
      settings: makeSettings({ breederLogoDataUrl: logoUrl }),
    });
    const json = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(json, makeSettings());
    expect(parsed.settings.breederLogoDataUrl).toBe(logoUrl);

    // Rejects unsafe SVG data URLs during backup parse
    const tampered = JSON.parse(json);
    tampered.settings.breederLogoDataUrl = 'data:image/svg+xml,<svg onload=alert(1)/>';
    const parsedTampered = parseBarnBackupJson(JSON.stringify(tampered), makeSettings());
    expect(parsedTampered.settings.breederLogoDataUrl).toBeUndefined();
  });

  it('builds valid multi-page PDF 1.4 binaries for 7-gen (2 pages) and 8-gen (4 pages) pedigrees with custom print presets', () => {
    const profiles = [makeSpeciesProfile('Rabbit')];
    const settings = makeSettings({ barnName: 'Multi-Sheet Rabbitry' });

    const g8 = makeAnimal('g8-pdf', { sex: 'Male', name: 'G8 Patriarch', tattoo: 'P8' });
    const g7 = makeAnimal('g7-pdf', { sex: 'Male', name: 'G7 Sire', sireId: 'g8-pdf' });
    const g6 = makeAnimal('g6-pdf', { sex: 'Male', name: 'G6 Sire', sireId: 'g7-pdf' });
    const g5 = makeAnimal('g5-pdf', { sex: 'Male', name: 'G5 Sire', sireId: 'g6-pdf' });
    const g4 = makeAnimal('g4-pdf', { sex: 'Male', name: 'G4 Sire', sireId: 'g5-pdf' });
    const g3 = makeAnimal('g3-pdf', { sex: 'Male', name: 'G3 Sire', sireId: 'g4-pdf' });
    const g2 = makeAnimal('g2-pdf', { sex: 'Male', name: 'G2 Grandsire', sireId: 'g3-pdf' });
    const g1 = makeAnimal('g1-pdf', { sex: 'Male', name: 'G1 Sire', sireId: 'g2-pdf' });
    const subject = makeAnimal('subj-pdf8', {
      sex: 'Female',
      name: 'Sheeted Prospect',
      tattoo: 'SP8',
      sireId: 'g1-pdf',
    });
    const allAnimals = [g8, g7, g6, g5, g4, g3, g2, g1, subject];

    const verifyValidPdfXref = (pdfText: string, expectedPages: number) => {
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText.trimEnd().endsWith('%%EOF')).toBe(true);
      expect(pdfText).toContain(`/Count ${expectedPages}`);
      const startXrefMatch = pdfText.match(/startxref\n(\d+)\n%%EOF/);
      expect(startXrefMatch).toBeTruthy();
      const xrefPos = Number(startXrefMatch![1]);
      expect(pdfText.slice(xrefPos, xrefPos + 4)).toBe('xref');
      const xrefBody = pdfText.slice(xrefPos).split('trailer')[0];
      const entryMatches = Array.from(xrefBody.matchAll(/(\d{10}) 00000 n /g));
      entryMatches.forEach((m, idx) => {
        const objOffset = Number(m[1]);
        expect(pdfText.slice(objOffset, objOffset + 12)).toMatch(
          new RegExp(`^${idx + 1} 0 obj\\n`)
        );
      });
    };

    const pdf7 = buildPedigreePdfBytes({
      subject,
      allAnimals,
      speciesProfiles: profiles,
      settings,
      generations: 7,
      printOptions: {
        orientation: 'landscape',
        colorPreset: 'royal_navy',
        borderStyle: 'double_frame',
        layoutPreset: 'show_certificate',
      },
    });
    const pdf7Text = bytesToLatin1(pdf7);
    verifyValidPdfXref(pdf7Text, 2);
    expect(pdf7Text).toContain('Sheet 1 of 2');
    expect(pdf7Text).toContain('Sheet 2 of 2');
    expect(pdf7Text).toContain('Page 1/2');
    expect(pdf7Text).toContain('Page 2/2');

    const pdf8 = buildPedigreePdfBytes({
      subject,
      allAnimals,
      speciesProfiles: profiles,
      settings,
      generations: 8,
      printOptions: {
        orientation: 'landscape',
        colorPreset: 'monochrome_ink',
        borderStyle: 'minimal_lines',
        layoutPreset: 'compact_ledger',
      },
    });
    const pdf8Text = bytesToLatin1(pdf8);
    verifyValidPdfXref(pdf8Text, 4);
    expect(pdf8Text).toContain('Sheet 1 of 4');
    expect(pdf8Text).toContain('Sheet 4 of 4');
    expect(pdf8Text).toContain('G8 Patriarch');
  });
});

```

## `src/core/__tests__/pedigreeAnalysis.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  analyzeAlleleProvenance,
  parseGenotypeString,
} from '../geneticsEngine';
import {
  analyzePedigreeTree,
  evaluateAnimalArbaRegistration,
  isArbaRegistrationSpecies,
} from '../pedigreeAnalysis';
import { buildPedigreeSlots, buildSpeciesHerdMap } from '../pedigreeCalculator';
import { makeAnimal } from './testFixtures';

describe('pedigreeAnalysis — convergence, ARBA registration flags & allele provenance', () => {
  it('scopes ARBA registration species strictly to Rabbit and Guinea Pig / Cavy', () => {
    expect(isArbaRegistrationSpecies('Rabbit')).toBe(true);
    expect(isArbaRegistrationSpecies('Rabbits')).toBe(true);
    expect(isArbaRegistrationSpecies('Guinea Pig')).toBe(true);
    expect(isArbaRegistrationSpecies('Cavy')).toBe(true);
    expect(isArbaRegistrationSpecies('Cavies')).toBe(true);

    expect(isArbaRegistrationSpecies('Cat')).toBe(false);
    expect(isArbaRegistrationSpecies('Dog')).toBe(false);
    expect(isArbaRegistrationSpecies('Goat')).toBe(false);
    expect(isArbaRegistrationSpecies('Custom Reptile')).toBe(false);
    expect(isArbaRegistrationSpecies('')).toBe(false);
  });

  it('flags missing ARBA subject and ancestor fields and breed mismatches accurately', () => {
    const incompleteSubject = makeAnimal('subj', {
      species: 'Rabbit',
      tattoo: '',
      breed: 'Holland Lop',
      variety: '',
      weightGrams: 0,
      birthDateIso: '',
      sex: 'Unknown',
    });
    const subjectEval = evaluateAnimalArbaRegistration(incompleteSubject, {
      isSubject: true,
      knownAncestorsIn3Gen: 10,
      speciesName: 'Rabbit',
    });

    expect(subjectEval.isApplicable).toBe(true);
    expect(subjectEval.isBlocking).toBe(true);
    expect(subjectEval.deficiencies.map((d) => d.code)).toEqual([
      'missing_tattoo',
      'missing_variety',
      'missing_weight',
      'missing_dob',
      'unknown_sex',
      'incomplete_3gen_lineage',
    ]);
    expect(subjectEval.summaryText).toContain('Incomplete 3-gen lineage (10/14 ancestors)');

    const mismatchedAncestor = makeAnimal('anc', {
      species: 'Rabbit',
      tattoo: 'R1',
      breed: 'Mini Rex',
      variety: 'Castor',
      weightGrams: 1800,
    });
    const ancEval = evaluateAnimalArbaRegistration(mismatchedAncestor, {
      isSubject: false,
      subjectBreed: 'Holland Lop',
      speciesName: 'Rabbit',
    });
    expect(ancEval.isBlocking).toBe(true);
    expect(ancEval.deficiencies.map((d) => d.code)).toEqual(['breed_mismatch']);
  });

  it('classifies convergent vs unique ancestors and excludes Gen 4–6 from ARBA blocking checks', () => {
    // Build a 4-gen tree where one Gen-2 buck ('shared-gg') appears on both Sire and Dam sides,
    // and Gen 4 has an incomplete ancestor that must NOT trigger ARBA blocking flags.
    const gen4Incomplete = makeAnimal('g4-inc', {
      species: 'Rabbit',
      tattoo: '',
      breed: '',
      variety: '',
      weightGrams: 0,
      sex: 'Male',
    });
    const sharedGrandSire = makeAnimal('shared-gs', {
      species: 'Rabbit',
      tattoo: 'GS1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1650,
      sex: 'Male',
      sireId: 'g4-inc',
    });
    const uniqueGrandDam = makeAnimal('unique-gd', {
      species: 'Rabbit',
      tattoo: 'GD1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1700,
      sex: 'Female',
    });
    const sire = makeAnimal('sire', {
      species: 'Rabbit',
      tattoo: 'S1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1600,
      sex: 'Male',
      sireId: 'shared-gs',
      damId: 'unique-gd',
    });
    const dam = makeAnimal('dam', {
      species: 'Rabbit',
      tattoo: 'D1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1680,
      sex: 'Female',
      sireId: 'shared-gs',
    });
    const subject = makeAnimal('subj', {
      species: 'Rabbit',
      tattoo: 'SUBJ1',
      breed: 'Holland Lop',
      variety: 'Chestnut',
      weightGrams: 1620,
      birthDateIso: '2026-01-15',
      sex: 'Female',
      sireId: 'sire',
      damId: 'dam',
    });

    const all = [gen4Incomplete, sharedGrandSire, uniqueGrandDam, sire, dam, subject];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');
    const slots = buildPedigreeSlots(subject, herd, 4);
    const analysis = analyzePedigreeTree(subject, slots, 'Rabbit');

    expect(analysis.isArbaSpecies).toBe(true);
    expect(analysis.hasConvergentAncestors).toBe(true);
    expect(analysis.convergentAnimalIds.has('shared-gs')).toBe(true);
    expect(analysis.convergentAnimalIds.has('unique-gd')).toBe(false);
    expect(analysis.convergentSlotKeys.has('2:0')).toBe(true);
    expect(analysis.convergentSlotKeys.has('2:2')).toBe(true);
    expect(analysis.convergentSlotKeys.has('2:1')).toBe(false);

    // Gen 4 incomplete ancestor is excluded from ARBA checks
    const gen4Status = analysis.registrationBySlotKey.get('4:0');
    expect(gen4Status?.isApplicable).toBe(false);
    expect(gen4Status?.isBlocking).toBe(false);

    // Missing Gen 1-3 ancestor slots block subject 3-gen ARBA pedigree
    expect(analysis.missingAncestorSlotCount).toBeGreaterThan(0);
    expect(analysis.subjectRegistration?.isBlocking).toBe(true);
    expect(
      analysis.subjectRegistration?.deficiencies.some((d) => d.code === 'incomplete_3gen_lineage')
    ).toBe(true);

    // Non-ARBA species disables ARBA blocking while still identifying convergent ancestors
    const catAnalysis = analyzePedigreeTree(subject, slots, 'Cat');
    expect(catAnalysis.isArbaSpecies).toBe(false);
    expect(catAnalysis.blockingNodeCount).toBe(0);
    expect(catAnalysis.hasConvergentAncestors).toBe(true);
  });

  it('infers autosomal allele provenance across sire, dam, offspring, manual, and uncommitted inference', () => {
    const sire = makeAnimal('sire', {
      sex: 'Male',
      name: 'Buck',
      genotypeRaw: 'AA Bb cc D_ E_',
      genotype: parseGenotypeString('AA Bb cc D_ E_', 'Rabbit'),
    });
    const dam = makeAnimal('dam', {
      sex: 'Female',
      name: 'Doe',
      genotypeRaw: 'aa BB CC D_ ee',
      genotype: parseGenotypeString('aa BB CC D_ ee', 'Rabbit'),
    });
    const subject = makeAnimal('subj', {
      sex: 'Female',
      name: 'Hazel',
      sireId: 'sire',
      damId: 'dam',
      genotypeRaw: 'Aa Bb Cc D_ E_',
      genotype: parseGenotypeString('Aa Bb Cc D_ E_', 'Rabbit'),
    });
    const diluteKit = makeAnimal('kit', {
      sex: 'Male',
      name: 'BlueKit',
      damId: 'subj',
      genotypeRaw: 'aa BB CC dd ee',
      genotype: parseGenotypeString('aa BB CC dd ee', 'Rabbit'),
    });

    const all = [sire, dam, subject, diluteKit];
    const herd = buildSpeciesHerdMap(all, 'Rabbit');

    // Saved provenance
    const savedProv = analyzeAlleleProvenance(subject, herd, all, 'Rabbit');
    expect(savedProv.isCustomSpeciesFallback).toBe(false);
    expect(savedProv.hasAnyProvenance).toBe(true);

    const aLocus = savedProv.loci.find((l) => l.locus === 'A');
    expect(aLocus?.allele1).toMatchObject({ allele: 'A', source: 'sire' });
    expect(aLocus?.allele2).toMatchObject({ allele: 'a', source: 'dam' });

    const bLocus = savedProv.loci.find((l) => l.locus === 'B');
    expect(bLocus?.allele1).toMatchObject({ allele: 'B', source: 'dam' });
    expect(bLocus?.allele2).toMatchObject({ allele: 'b', source: 'sire' });

    const cLocus = savedProv.loci.find((l) => l.locus === 'C');
    expect(cLocus?.allele1).toMatchObject({ allele: 'C', source: 'dam' });
    expect(cLocus?.allele2).toMatchObject({ allele: 'c', source: 'sire' });

    const dLocus = savedProv.loci.find((l) => l.locus === 'D');
    expect(dLocus?.allele1).toMatchObject({ allele: 'D', source: 'manual' });
    expect(dLocus?.allele2).toMatchObject({ allele: '_', source: 'unknown' });

    const eLocus = savedProv.loci.find((l) => l.locus === 'E');
    expect(eLocus?.allele1).toMatchObject({ allele: 'E', source: 'sire' });
    expect(eLocus?.allele2).toMatchObject({ allele: '_', source: 'unknown' });

    // Uncommitted inference preview fills Dd (d from diluteKit) and Ee (e from homozygous ee dam)
    const inferredProv = analyzeAlleleProvenance(subject, herd, all, 'Rabbit', {
      includeInferred: true,
    });
    const dInferred = inferredProv.loci.find((l) => l.locus === 'D');
    expect(dInferred?.allele2).toMatchObject({
      allele: 'd',
      source: 'offspring',
      isInferredUncommitted: true,
    });

    const eInferred = inferredProv.loci.find((l) => l.locus === 'E');
    expect(eInferred?.allele2).toMatchObject({
      allele: 'e',
      source: 'dam',
      isInferredUncommitted: true,
    });
  });

  it('tracks X-linked Cat O/o provenance and isolates custom species safely', () => {
    const tomSire = makeAnimal('tom', {
      species: 'Cat',
      sex: 'Male',
      name: 'Marmalade',
      genotypeRaw: 'aa BB CC DD OY',
      genotype: parseGenotypeString('aa BB CC DD OY', 'Cat'),
    });
    const queenDam = makeAnimal('queen', {
      species: 'Cat',
      sex: 'Female',
      name: 'Shadow',
      genotypeRaw: 'aa BB CC DD oo',
      genotype: parseGenotypeString('aa BB CC DD oo', 'Cat'),
    });
    const tortieDaughter = makeAnimal('daughter', {
      species: 'Cat',
      sex: 'Female',
      name: 'Patches',
      sireId: 'tom',
      damId: 'queen',
      genotypeRaw: 'aa BB CC DD Oo',
      genotype: parseGenotypeString('aa BB CC DD Oo', 'Cat'),
    });
    const redSon = makeAnimal('son', {
      species: 'Cat',
      sex: 'Male',
      name: 'Rusty',
      sireId: 'tom',
      damId: 'queen',
      genotypeRaw: 'aa BB CC DD oY',
      genotype: parseGenotypeString('aa BB CC DD oY', 'Cat'),
    });

    const cats = [tomSire, queenDam, tortieDaughter, redSon];
    const catHerd = buildSpeciesHerdMap(cats, 'Cat');

    const daughterProv = analyzeAlleleProvenance(tortieDaughter, catHerd, cats, 'Cat');
    const daughterO = daughterProv.loci.find((l) => l.locus === 'O');
    expect(daughterO?.allele1).toMatchObject({ allele: 'O', source: 'sire' });
    expect(daughterO?.allele2).toMatchObject({ allele: 'o', source: 'dam' });

    const sonProv = analyzeAlleleProvenance(redSon, catHerd, cats, 'Cat');
    const sonO = sonProv.loci.find((l) => l.locus === 'O');
    expect(sonO?.allele1).toMatchObject({ allele: 'o', source: 'dam' });
    expect(sonO?.allele2).toMatchObject({ allele: 'Y', source: 'sire' });

    const gecko = makeAnimal('gecko', {
      species: 'Crested Gecko',
      sex: 'Female',
      genotypeRaw: 'Lilly White het Axanthic',
    });
    const customProv = analyzeAlleleProvenance(
      gecko,
      new Map([[gecko.id, gecko]]),
      [gecko],
      'Crested Gecko'
    );
    expect(customProv.isCustomSpeciesFallback).toBe(true);
    expect(customProv.rawFallback).toBe('Lilly White het Axanthic');
    expect(customProv.loci).toHaveLength(0);
  });
});
```

## `src/core/__tests__/pedigreeAnalytics.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  analyzeAnimalFounderContributions,
  analyzePairingFounderShift,
  analyzeSpeciesFounderLoss,
  analyzeSpeciesHeritabilityTrends,
} from '../pedigreeAnalytics';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import { BreedingRecord, CareLog } from '../models';
import { makeAnimal } from './testFixtures';

const TS = '2026-01-15T12:00:00.000Z';

function makeCareLog(
  id: string,
  animalId: string,
  dateIso: string,
  weightGrams: number
): CareLog {
  return {
    id,
    species: 'Rabbit',
    animalId,
    dateIso,
    type: 'Weight Check',
    title: 'Scale Check',
    weightGrams,
    showLegEarned: false,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
  };
}

describe('pedigreeAnalytics — Founder Loss, Effective Founders & Heritability h²', () => {
  it('computes exact path-summed founder contributions (0.5^depth), fe, and sire/dam splits', () => {
    const f1 = makeAnimal('f1', { sex: 'Male', name: 'Founder Buck A' });
    const f2 = makeAnimal('f2', { sex: 'Female', name: 'Founder Doe B' });
    const f3 = makeAnimal('f3', { sex: 'Male', name: 'Founder Buck C' });
    const f4 = makeAnimal('f4', { sex: 'Female', name: 'Founder Doe D' });

    const sire = makeAnimal('s1', { sex: 'Male', sireId: 'f1', damId: 'f2' });
    const dam = makeAnimal('d1', { sex: 'Female', sireId: 'f3', damId: 'f4' });
    const kid = makeAnimal('k1', { sex: 'Male', sireId: 's1', damId: 'd1' });

    const herd = buildSpeciesHerdMap([f1, f2, f3, f4, sire, dam, kid], 'Rabbit');
    const analysis = analyzeAnimalFounderContributions(kid, herd);

    expect(analysis.knownFounderCount).toBe(4);
    expect(analysis.knownLineagePercent).toBeCloseTo(100, 5);
    expect(analysis.unknownOriginPercent).toBeCloseTo(0, 5);
    expect(analysis.effectiveFoundersFe).toBeCloseTo(4, 5);
    expect(analysis.founderBalanceRatio).toBeCloseTo(1, 5);

    const byId = new Map(analysis.founders.map((f) => [f.animal.id, f]));
    expect(byId.get('f1')?.contributionPercent).toBeCloseTo(25, 5);
    expect(byId.get('f1')?.sireLinePercent).toBeCloseTo(25, 5);
    expect(byId.get('f1')?.damLinePercent).toBeCloseTo(0, 5);
    expect(byId.get('f4')?.damLinePercent).toBeCloseTo(25, 5);
  });

  it('tracks incomplete pedigree unknown-origin percentage and avoids cycles safely', () => {
    const f1 = makeAnimal('f1', { sex: 'Male' });
    const sire = makeAnimal('s1', { sex: 'Male', sireId: 'f1', damId: 'missing-dam' });
    const dam = makeAnimal('d1', { sex: 'Female', sireId: 'cycle-s', damId: '' });
    // Deliberate corrupt cycle edge back to kid
    dam.sireId = 'kid';
    const kid = makeAnimal('kid', { sireId: 's1', damId: 'd1' });

    const herd = buildSpeciesHerdMap([f1, sire, dam, kid], 'Rabbit');
    const analysis = analyzeAnimalFounderContributions(kid, herd);

    expect(analysis.knownFounderCount).toBe(1);
    expect(analysis.knownLineagePercent).toBeCloseTo(25, 5);
    expect(analysis.unknownOriginPercent).toBeCloseTo(75, 5);
  });

  it('evaluates pairing founder shift and shared vs unique founders', () => {
    const fShared = makeAnimal('fShared', { sex: 'Male', name: 'Shared Buck' });
    const fSireMaternal = makeAnimal('fSM', { sex: 'Female', name: 'Sire Maternal' });
    const fDamMaternal = makeAnimal('fDM', { sex: 'Female', name: 'Dam Maternal' });

    const sire = makeAnimal('sire', { sex: 'Male', sireId: 'fShared', damId: 'fSM' });
    const dam = makeAnimal('dam', { sex: 'Female', sireId: 'fShared', damId: 'fDM' });

    const herd = buildSpeciesHerdMap([fShared, fSireMaternal, fDamMaternal, sire, dam], 'Rabbit');
    const shift = analyzePairingFounderShift(sire, dam, herd);

    expect(shift.sharedFounderIds).toEqual(['fShared']);
    expect(shift.uniqueSireFounderIds).toEqual(['fSM']);
    expect(shift.uniqueDamFounderIds).toEqual(['fDM']);
    expect(shift.projectedCoiPercent).toBeCloseTo(12.5, 5);
    const sharedContrib = shift.projectedOffspring.founders.find(
      (f) => f.animal.id === 'fShared'
    );
    expect(sharedContrib?.contributionPercent).toBeCloseTo(50, 5);
    expect(shift.projectedOffspring.effectiveFoundersFe).toBeCloseTo(1 / (0.5 ** 2 + 0.25 ** 2 + 0.25 ** 2), 4);
  });

  it('detects Lost, Endangered, and Active Core founders in species founder-loss ledger', () => {
    const fLost = makeAnimal('fLost', { sex: 'Male', status: 'Deceased', name: 'Lost Founder' });
    const fLostKit = makeAnimal('fLostKit', { sex: 'Female', sireId: 'fLost', status: 'Sold' });

    const fCore = makeAnimal('fCore', { sex: 'Male', status: 'Deceased', name: 'Core Founder' });
    const fEndangered = makeAnimal('fEnd', {
      sex: 'Female',
      status: 'Deceased',
      name: 'Endangered Founder',
    });

    const act1 = makeAnimal('a1', { sex: 'Male', sireId: 'fCore', damId: '' });
    const act2 = makeAnimal('a2', { sex: 'Female', sireId: 'fCore', damId: 'fEnd' });

    const report = analyzeSpeciesFounderLoss(
      [fLost, fLostKit, fCore, fEndangered, act1, act2],
      'Rabbit'
    );

    expect(report.totalFoundersCount).toBe(3);
    expect(report.lostFoundersCount).toBe(1);
    expect(report.endangeredFoundersCount).toBe(1);
    expect(report.activeFoundersCount).toBe(2);
    expect(report.founderLossPercent).toBeCloseTo((1 / 3) * 100, 4);

    const statusById = new Map(report.founderLedger.map((r) => [r.founder.id, r.status]));
    expect(statusById.get('fLost')).toBe('Lost');
    expect(statusById.get('fEnd')).toBe('Endangered');
    expect(statusById.get('fCore')).toBe('Active Core');
  });

  it('estimates mid-parent OLS heritability h², guards insufficient < 3 pairs, and builds birth-year cohorts', () => {
    // Construct 4 families whose offspring weight follows ~0.8 * midParentWeight + intercept
    const s1 = makeAnimal('s1', { sex: 'Male', birthDateIso: '2024-01-10', weightGrams: 3000 });
    const d1 = makeAnimal('d1', { sex: 'Female', birthDateIso: '2024-01-15', weightGrams: 3000 });
    const s2 = makeAnimal('s2', { sex: 'Male', birthDateIso: '2024-02-10', weightGrams: 3500 });
    const d2 = makeAnimal('d2', { sex: 'Female', birthDateIso: '2024-02-15', weightGrams: 3500 });
    const s3 = makeAnimal('s3', { sex: 'Male', birthDateIso: '2024-03-10', weightGrams: 4000 });
    const d3 = makeAnimal('d3', { sex: 'Female', birthDateIso: '2024-03-15', weightGrams: 4000 });
    const s4 = makeAnimal('s4', { sex: 'Male', birthDateIso: '2024-04-10', weightGrams: 4500 });
    const d4 = makeAnimal('d4', { sex: 'Female', birthDateIso: '2024-04-15', weightGrams: 4500 });

    const k1 = makeAnimal('k1', { birthDateIso: '2025-03-01', sireId: 's1', damId: 'd1', weightGrams: 3150 });
    const k2 = makeAnimal('k2', { birthDateIso: '2025-04-01', sireId: 's2', damId: 'd2', weightGrams: 3550 });
    const k3 = makeAnimal('k3', { birthDateIso: '2025-05-01', sireId: 's3', damId: 'd3', weightGrams: 3950 });
    const k4 = makeAnimal('k4', { birthDateIso: '2026-01-20', sireId: 's4', damId: 'd4', weightGrams: 4350 });

    // Only 1 animal has >=2 care logs -> ADG remains insufficient (< 3 pairs), while s1 latest weight stays 3000g
    const careLogs: CareLog[] = [
      makeCareLog('cl1', 's1', '2024-02-01', 1200),
      makeCareLog('cl2', 's1', '2024-03-02', 3000),
    ];
    const breedings: BreedingRecord[] = [];

    const report = analyzeSpeciesHeritabilityTrends({
      animals: [s1, d1, s2, d2, s3, d3, s4, d4, k1, k2, k3, k4],
      breedings,
      careLogs,
      speciesName: 'Rabbit',
    });

    const weightEst = report.traits.find((t) => t.traitKey === 'weight_grams')!;
    const adgEst = report.traits.find((t) => t.traitKey === 'adg_grams_per_day')!;

    expect(weightEst.method).toBe('mid_parent');
    expect(weightEst.pairCount).toBe(4);
    expect(weightEst.heritabilityH2).toBeCloseTo(0.8, 5);
    expect(weightEst.rSquared).toBeCloseTo(1, 5);

    expect(adgEst.method).toBe('insufficient');
    expect(adgEst.heritabilityH2).toBeNull();

    expect(report.cohorts.map((c) => c.year)).toEqual([2024, 2025, 2026]);
    expect(report.cohorts[0].cumulativeWeightH2).toBeNull();
    expect(report.cohorts[1].weightPairCount).toBe(3);
    expect(report.cohorts[1].cumulativeWeightH2).toBeCloseTo(0.8, 5);
  });
});
```

## `src/core/__tests__/pedigreeCalculator.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildPedigreeBranchViewport,
  buildPedigreeSlots,
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  describeCoiRisk,
  getGen3BranchesWithKnownAncestors,
  getGen3BranchIndex,
  getPedigreeCompletenessSummary,
  wouldCreateCycle,
} from '../pedigreeCalculator';
import { makeAnimal, makeSpeciesProfile } from './testFixtures';

describe('pedigreeCalculator — Wright COI, cycles & 5/6-gen pedigree slots', () => {
  it('computes 0% Outcross COI for unrelated parents', () => {
    const sire = makeAnimal('sire', { sex: 'Male', name: 'Crimson King' });
    const dam = makeAnimal('dam', { sex: 'Female', name: 'Amber Rose' });
    const kit = makeAnimal('kit', { sireId: 'sire', damId: 'dam', name: 'Spark' });

    const herd = buildSpeciesHerdMap([sire, dam, kit], 'Rabbit');
    const analysis = calculateAnimalCoi(kit, herd);

    expect(analysis.coiPercent).toBe(0);
    expect(analysis.coiFraction).toBe(0);
    expect(analysis.risk.code).toBe('OUTCROSS');
    expect(analysis.sharedAncestors).toHaveLength(0);
    expect(analysis.knownAncestorsIn3Gen).toBe(2);
  });

  it('computes exact 25% COI for parent × offspring pairing', () => {
    const founderSire = makeAnimal('sire0', { sex: 'Male', name: 'Founder Buck' });
    const founderDam = makeAnimal('dam0', { sex: 'Female', name: 'Founder Doe' });
    const daughter = makeAnimal('d1', {
      sex: 'Female',
      sireId: 'sire0',
      damId: 'dam0',
      name: 'Daughter',
    });

    const herd = buildSpeciesHerdMap([founderSire, founderDam, daughter], 'Rabbit');
    const pairing = calculatePairingCoi('sire0', 'd1', herd);

    expect(pairing.coiPercent).toBeCloseTo(25, 5);
    expect(pairing.risk.code).toBe('HIGH');
    expect(pairing.sharedAncestors[0]?.ancestor.id).toBe('sire0');
    expect(pairing.sharedAncestors[0]?.coiContributionPercent).toBeCloseTo(25, 5);
  });

  it('computes exact 25% COI for full-sibling pairing and 12.5% for half-sibling pairing', () => {
    const s = makeAnimal('s', { sex: 'Male' });
    const d1 = makeAnimal('d1', { sex: 'Female' });
    const d2 = makeAnimal('d2', { sex: 'Female' });

    const fullBro = makeAnimal('fb', { sex: 'Male', sireId: 's', damId: 'd1' });
    const fullSis = makeAnimal('fs', { sex: 'Female', sireId: 's', damId: 'd1' });
    const halfSis = makeAnimal('hs', { sex: 'Female', sireId: 's', damId: 'd2' });

    const herd = buildSpeciesHerdMap([s, d1, d2, fullBro, fullSis, halfSis], 'Rabbit');

    const fullSibCoi = calculatePairingCoi('fb', 'fs', herd);
    expect(fullSibCoi.coiPercent).toBeCloseTo(25, 5);
    expect(fullSibCoi.sharedAncestors).toHaveLength(2);

    const halfSibCoi = calculatePairingCoi('fb', 'hs', herd);
    expect(halfSibCoi.coiPercent).toBeCloseTo(12.5, 5);
    expect(halfSibCoi.risk.code).toBe('LINEBRED');
    expect(halfSibCoi.sharedAncestors).toHaveLength(1);
    expect(halfSibCoi.sharedAncestors[0].ancestor.id).toBe('s');
  });

  it('accounts for (1 + F_A) when the shared common ancestor is itself inbred', () => {
    // Founder Buck mated to his daughter produces inbred common ancestor A with F(A) = 0.25
    const fBuck = makeAnimal('fbuck', { sex: 'Male' });
    const fDoe = makeAnimal('fdoe', { sex: 'Female' });
    const daughter = makeAnimal('dau', { sex: 'Female', sireId: 'fbuck', damId: 'fdoe' });
    const inbredA = makeAnimal('inbA', { sex: 'Male', sireId: 'fbuck', damId: 'dau' });

    const outDoe1 = makeAnimal('od1', { sex: 'Female' });
    const outDoe2 = makeAnimal('od2', { sex: 'Female' });
    const son = makeAnimal('son', { sex: 'Male', sireId: 'inbA', damId: 'od1' });
    const dau2 = makeAnimal('dau2', { sex: 'Female', sireId: 'inbA', damId: 'od2' });

    const herd = buildSpeciesHerdMap(
      [fBuck, fDoe, daughter, inbredA, outDoe1, outDoe2, son, dau2],
      'Rabbit'
    );

    // Half-sibs via inbredA: F = (0.5)^3 * (1 + 0.25) = 0.125 * 1.25 = 15.625%
    const halfSibThroughInbred = calculatePairingCoi('son', 'dau2', herd);
    expect(halfSibThroughInbred.coiPercent).toBeCloseTo(15.625, 5);
  });

  it('enforces strict species isolation in buildSpeciesHerdMap', () => {
    const rabbit = makeAnimal('r1', { species: 'Rabbit', sex: 'Male' });
    const sheep = makeAnimal('s1', { species: 'Sheep', sex: 'Female' });
    const crossKid = makeAnimal('r2', {
      species: 'Rabbit',
      sireId: 'r1',
      damId: 's1', // invalid cross-species ref must be ignored
    });

    const rabbitHerd = buildSpeciesHerdMap([rabbit, sheep, crossKid], 'Rabbit');
    expect(rabbitHerd.has('r1')).toBe(true);
    expect(rabbitHerd.has('s1')).toBe(false);

    const slots = buildPedigreeSlots(crossKid, rabbitHerd, 3);
    const gen1Dam = slots.find((sl) => sl.generation === 1 && sl.slotIndex === 1);
    expect(gen1Dam?.animal).toBeNull();
  });

  it('prevents direct self-links and multi-generation pedigree cycles via wouldCreateCycle', () => {
    const gp = makeAnimal('gp', { sex: 'Male' });
    const parent = makeAnimal('p', { sex: 'Female', sireId: 'gp' });
    const child = makeAnimal('c', { sex: 'Male', damId: 'p' });
    const unrelated = makeAnimal('u', { sex: 'Male' });
    const herd = buildSpeciesHerdMap([gp, parent, child, unrelated], 'Rabbit');

    // Direct self-parent
    expect(wouldCreateCycle('c', 'c', herd)).toBe(true);
    // Assigning grandchild `c` as parent of grandparent `gp` creates cycle gp -> p -> c -> gp
    expect(wouldCreateCycle('gp', 'c', herd)).toBe(true);
    // Assigning unrelated animal as parent of `gp` is safe
    expect(wouldCreateCycle('gp', 'u', herd)).toBe(false);
  });

  it('builds 5-gen (63 slots) and 6-gen (127 slots) pedigree trees with repeated-ancestor counts', () => {
    const animals = [];
    // Create a 6-generation chain on the top sire line, plus a shared ancestor on dam line
    const sharedG5 = makeAnimal('g5-shared', { sex: 'Male', name: 'Old Iron' });
    animals.push(sharedG5);

    let prevSireId = 'g5-shared';
    for (let g = 4; g >= 1; g--) {
      const id = `sire-gen-${g}`;
      animals.push(makeAnimal(id, { sex: 'Male', sireId: prevSireId }));
      prevSireId = id;
    }

    const damG1 = makeAnimal('dam-gen-1', { sex: 'Female', sireId: 'g5-shared' });
    const subject = makeAnimal('subj', {
      sex: 'Male',
      sireId: 'sire-gen-1',
      damId: 'dam-gen-1',
    });
    animals.push(damG1, subject);

    const herd = buildSpeciesHerdMap(animals, 'Rabbit');
    const rabbitProfile = makeSpeciesProfile('Rabbit');

    const slots5 = buildPedigreeSlots(subject, herd, 5, rabbitProfile);
    // 1 + 2 + 4 + 8 + 16 + 32 = 63
    expect(slots5).toHaveLength(63);
    expect(slots5.filter((s) => s.generation === 5)).toHaveLength(32);

    const slots6 = buildPedigreeSlots(subject, herd, 6, rabbitProfile);
    // 1 + 2 + 4 + 8 + 16 + 32 + 64 = 127
    expect(slots6).toHaveLength(127);
    expect(slots6.filter((s) => s.generation === 6)).toHaveLength(64);

    // Old Iron appears twice across generations 1..6 (once at gen5 sire line, once at gen2 maternal grandsire)
    const oldIronSlots = slots6.filter((s) => s.animal?.id === 'g5-shared');
    expect(oldIronSlots).toHaveLength(2);
    expect(oldIronSlots[0].occurrenceCount).toBe(2);
  });

  it('categorizes COI risk levels across thresholds cleanly', () => {
    expect(describeCoiRisk(0).code).toBe('OUTCROSS');
    expect(describeCoiRisk(3.125).code).toBe('LOW');
    expect(describeCoiRisk(6.25).code).toBe('MODERATE');
    expect(describeCoiRisk(12.5).code).toBe('LINEBRED');
    expect(describeCoiRisk(25).code).toBe('HIGH');
  });

  it('handles cyclic parent links safely without infinite recursion', () => {
    const a = makeAnimal('cyc-a', { sex: 'Male', sireId: 'cyc-b', damId: 'cyc-a' });
    const b = makeAnimal('cyc-b', { sex: 'Female', sireId: 'cyc-a', damId: 'cyc-b' });
    const herd = buildSpeciesHerdMap([a, b], 'Rabbit');

    const resA = calculateAnimalCoi(a, herd);
    const resPair = calculatePairingCoi('cyc-a', 'cyc-b', herd);

    expect(Number.isFinite(resA.coiPercent)).toBe(true);
    expect(Number.isFinite(resPair.coiPercent)).toBe(true);
  });

  it('flags 0% outcross results with fewer than 14 recorded 3-gen ancestors as incomplete pedigrees', () => {
    const summarySparse = getPedigreeCompletenessSummary({
      coiPercent: 0,
      knownAncestorsIn3Gen: 2,
      knownAncestorsIn4Gen: 2,
    });
    expect(summarySparse.percent3Gen).toBe(14);
    expect(summarySparse.isSparsePedigree).toBe(true);
    expect(summarySparse.isIncompleteZeroOutcross).toBe(true);

    const summaryComplete = getPedigreeCompletenessSummary({
      coiPercent: 0,
      knownAncestorsIn3Gen: 14,
      knownAncestorsIn4Gen: 26,
    });
    expect(summaryComplete.percent3Gen).toBe(100);
    expect(summaryComplete.isSparsePedigree).toBe(false);
    expect(summaryComplete.isIncompleteZeroOutcross).toBe(false);
  });

  it('bounds collapsed 5-gen and 6-gen charts to 15 Gen 0–3 slots and reveals branches on demand', () => {
    const animals = [];
    // Populate Gen 5 ancestor on Sire Branch 0 and Gen 4 ancestor on Dam Branch 4
    const gen5SireRoot = makeAnimal('g5-b0', { sex: 'Male', name: 'Branch 0 Founder' });
    const gen4SireRoot = makeAnimal('g4-b0', { sex: 'Male', sireId: 'g5-b0' });
    const gen3Sire = makeAnimal('g3-0', { sex: 'Male', sireId: 'g4-b0' });
    const gen2Sire = makeAnimal('g2-0', { sex: 'Male', sireId: 'g3-0' });
    const gen1Sire = makeAnimal('g1-0', { sex: 'Male', sireId: 'g2-0' });

    const gen4DamRoot = makeAnimal('g4-b4', { sex: 'Male', name: 'Branch 4 Sire' });
    const gen3Dam = makeAnimal('g3-4', { sex: 'Male', sireId: 'g4-b4' });
    const gen2Dam = makeAnimal('g2-2', { sex: 'Male', sireId: 'g3-4' });
    const gen1Dam = makeAnimal('g1-1', { sex: 'Female', sireId: 'g2-2' });

    const subject = makeAnimal('subj-vp', {
      sex: 'Female',
      sireId: 'g1-0',
      damId: 'g1-1',
    });
    animals.push(
      gen5SireRoot,
      gen4SireRoot,
      gen3Sire,
      gen2Sire,
      gen1Sire,
      gen4DamRoot,
      gen3Dam,
      gen2Dam,
      gen1Dam,
      subject
    );

    const herd = buildSpeciesHerdMap(animals, 'Rabbit');
    const slots6 = buildPedigreeSlots(subject, herd, 6, makeSpeciesProfile('Rabbit'));
    expect(slots6).toHaveLength(127);

    expect(getGen3BranchIndex(3, 2)).toBeNull();
    expect(getGen3BranchIndex(4, 0)).toBe(0);
    expect(getGen3BranchIndex(5, 16)).toBe(4);
    expect(getGen3BranchIndex(6, 63)).toBe(7);

    expect(getGen3BranchesWithKnownAncestors(slots6)).toEqual([0, 4]);

    const collapsed = buildPedigreeBranchViewport(slots6, 6, new Set());
    expect(collapsed.visibleSlots).toHaveLength(15);
    expect(collapsed.hiddenSlotsCount).toBe(112);
    expect(collapsed.hiddenKnownAncestorsCount).toBe(3); // g4-b0, g5-b0, g4-b4
    expect(collapsed.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(2);
    expect(collapsed.branchSummaries.get('3:4')?.hiddenKnownAncestors).toBe(1);

    // Expanding Gen-3 Branch 0 adds its 2 + 4 + 8 = 14 descendant slots (15 + 14 = 29 visible)
    const branch0Expanded = buildPedigreeBranchViewport(slots6, 6, new Set([0]));
    expect(branch0Expanded.visibleSlots).toHaveLength(29);
    expect(branch0Expanded.hiddenKnownAncestorsCount).toBe(1);
    expect(branch0Expanded.branchSummaries.get('3:0')?.isExpanded).toBe(true);
    expect(branch0Expanded.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(0);
    expect(branch0Expanded.branchSummaries.get('3:0')?.hasKnownAncestors).toBe(true);
  });

  it('surfaces hasKnownAncestors for externalKnownBranches even before Gen 4+ animals are loaded into memory', () => {
    const gen3Sire = makeAnimal('g3-0', { sex: 'Male', sireId: 'g4-lazy-unfetched' });
    const gen2Sire = makeAnimal('g2-0', { sex: 'Male', sireId: 'g3-0' });
    const gen1Sire = makeAnimal('g1-0', { sex: 'Male', sireId: 'g2-0' });
    const subject = makeAnimal('subj-lazy', { sex: 'Female', sireId: 'g1-0' });

    // Only Gen 0–3 exist in the base map initially
    const gen0To3Herd = buildSpeciesHerdMap([gen3Sire, gen2Sire, gen1Sire, subject], 'Rabbit');
    const slots = buildPedigreeSlots(subject, gen0To3Herd, 5, makeSpeciesProfile('Rabbit'));

    const withoutExternal = buildPedigreeBranchViewport(slots, 5, new Set());
    expect(withoutExternal.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(0);
    expect(withoutExternal.branchSummaries.get('3:0')?.hasKnownAncestors).toBe(false);

    // SQLite/OPFS probe indicates Branch 0 (3:0) has deeper ancestors
    const withExternal = buildPedigreeBranchViewport(slots, 5, new Set(), new Set([0]));
    expect(withExternal.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(0);
    expect(withExternal.branchSummaries.get('3:0')?.hasKnownAncestors).toBe(true);
    expect(withExternal.branchSummaries.get('3:1')?.hasKnownAncestors).toBe(false);
  });

  it('builds 7-generation (255 slots) and 8-generation (511 slots) pedigree trees with accurate role labels and viewport filtering', () => {
    const chain: ReturnType<typeof makeAnimal>[] = [];
    let childId = 'g8-sire-root';
    chain.push(makeAnimal(childId, { sex: 'Male', name: 'Gen 8 Ancestor' }));

    // Build an unbroken paternal line from Gen 8 down to Gen 0 subject
    for (let g = 7; g >= 1; g--) {
      const id = `g${g}-sire`;
      chain.push(
        makeAnimal(id, {
          sex: 'Male',
          name: `Gen ${g} Sire`,
          sireId: childId,
        })
      );
      childId = id;
    }
    const subject = makeAnimal('subj-8g', {
      sex: 'Female',
      name: '8G Subject',
      sireId: childId,
    });
    chain.push(subject);

    const herd = buildSpeciesHerdMap(chain, 'Rabbit');
    const rabbitProfile = makeSpeciesProfile('Rabbit');

    const slots7 = buildPedigreeSlots(subject, herd, 7, rabbitProfile);
    expect(slots7).toHaveLength(255); // 1 + 2 + 4 + 8 + 16 + 32 + 64 + 128
    const gen7Slots = slots7.filter((s) => s.generation === 7);
    expect(gen7Slots).toHaveLength(128);
    expect(gen7Slots[0].animal?.id).toBe('g7-sire');
    expect(gen7Slots[0].roleLabel).toContain('5th Great-Grand');

    const slots8 = buildPedigreeSlots(subject, herd, 8, rabbitProfile);
    expect(slots8).toHaveLength(511); // + 256
    const gen8Slots = slots8.filter((s) => s.generation === 8);
    expect(gen8Slots).toHaveLength(256);
    expect(gen8Slots[0].animal?.id).toBe('g8-sire-root');
    expect(gen8Slots[0].roleLabel).toContain('6th Great-Grand');

    // Collapsing Gen-3 branches keeps 0..3 visible (15 slots) and counts Gen 4..8 recorded ancestors as hidden
    const collapsed8 = buildPedigreeBranchViewport(slots8, 8, new Set());
    expect(collapsed8.visibleSlots).toHaveLength(15);
    expect(collapsed8.hiddenKnownAncestorsCount).toBe(5); // g4..g8 along branch 0
    expect(collapsed8.branchSummaries.get('3:0')?.hiddenKnownAncestors).toBe(5);

    // Expanding branch 0 reveals Gen 4..8 slots for that branch (15 + (2+4+8+16+32) = 77 slots)
    const expanded8 = buildPedigreeBranchViewport(slots8, 8, new Set([0]));
    expect(expanded8.visibleSlots).toHaveLength(77);
    expect(expanded8.hiddenKnownAncestorsCount).toBe(0);
  });
});


```

## `src/core/__tests__/pedigreeOcrParser.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { buildPedigreePdfBytes } from '../pdfExporter';
import { extractPedigreePdfPages } from '../importers/pdfScanExtractor';
import {
  buildPlatformImportPreviewFromOcrDrafts,
  OcrWordBox,
  parsePedigreeOcrResult,
  parsePedigreeSlotLines,
} from '../importers/pedigreeOcrParser';
import { makeAnimal, makeEmptySnapshot, makeSpeciesProfile } from './testFixtures';

function makeWordRow(
  text: string,
  x0: number,
  y0: number,
  charW = 7,
  h = 12,
  conf = 92
): OcrWordBox[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  let cursorX = x0;
  return tokens.map((tok) => {
    const w = tok.length * charW;
    const box: OcrWordBox = {
      text: tok,
      x0: cursorX,
      y0,
      x1: cursorX + w,
      y1: y0 + h,
      confidence: conf,
    };
    cursorX += w + charW;
    return box;
  });
}

describe('pedigreeOcrParser & pdfScanExtractor', () => {
  it('extracts name, parenthetical tattoo, ARBA reg #, GC #, legs, compound weight, DOB, variety & genotype', () => {
    const parsed = parsePedigreeSlotLines(
      [
        'Oakridge Barnaby (OR-101)',
        'Ear: OR-101 · Reg: 4412A · GC: GC-88 · Legs: 4',
        'Wt: 4# 8oz · Born: 03/14/2024',
        'Breed: Holland Lop · Var: Broken Tort · Geno: aa B_ C_ Dd E_ Enen',
      ],
      'Male',
      'lbs_oz'
    );

    expect(parsed.isUnknown).toBe(false);
    expect(parsed.name).toBe('Oakridge Barnaby');
    expect(parsed.tattoo).toBe('OR-101');
    expect(parsed.registrationNumber).toBe('4412A');
    expect(parsed.grandChampionNumber).toBe('GC-88');
    expect(parsed.legsCount).toBe(4);
    expect(parsed.weightGrams).toBeGreaterThan(2030);
    expect(parsed.weightGrams).toBeLessThan(2050);
    expect(parsed.birthDateIso).toBe('2024-03-14');
    expect(parsed.breed).toBe('Holland Lop');
    expect(parsed.variety).toBe('Broken Tort');
    expect(parsed.genotypeRaw).toBe('aa B_ C_ Dd E_ Enen');
    expect(parsed.sex).toBe('Male');
  });

  it('parses 2D bounding-box 4-column pedigree trees into Subject + Gen 1..3 slots', () => {
    const words: OcrWordBox[] = [
      // Col 0: Subject
      ...makeWordRow('Oakridge Clover (OC-7)', 40, 360),
      ...makeWordRow('Reg: 5510B · Wt: 4# 4oz', 40, 380),
      // Col 1: Gen 1 Sire & Dam
      ...makeWordRow('Briarwood Titan', 280, 180),
      ...makeWordRow('Ear: BW-11 · Reg: 3100X', 280, 198),
      ...makeWordRow('Briarwood Daisy', 280, 560),
      ...makeWordRow('Ear: BW-12 · Wt: 4 lbs 2 oz', 280, 578),
      // Col 2: Gen 2 Grandparents (4 buckets across 80..720)
      ...makeWordRow('Hilltop Rex', 520, 95),
      ...makeWordRow('Hilltop Rose', 520, 275),
      ...makeWordRow('Cedar Buck', 520, 455),
      ...makeWordRow('Cedar Belle', 520, 645),
      // Col 3: Gen 3 Great-Grandparents (top and bottom anchors)
      ...makeWordRow('Founder King (FK-1)', 770, 55),
      ...makeWordRow('Founder Queen (FQ-8)', 770, 695),
    ];

    const res = parsePedigreeOcrResult({
      sourceFileName: 'arba-pedigree-card.jpg',
      rawText: 'Oakridge Clover\nBriarwood Titan\nBriarwood Daisy',
      imageWidth: 1000,
      imageHeight: 760,
      words,
      confidence: 91,
    });

    expect(res.layoutMode).toBe('bounding_box_tree');
    expect(res.detectedSpecies).toBe('Rabbit');
    expect(res.populatedSlotCount).toBeGreaterThanOrEqual(9);

    const byKey = new Map(res.slots.map((s) => [s.slotKey, s]));
    expect(byKey.get('subject')?.name).toBe('Oakridge Clover');
    expect(byKey.get('subject')?.tattoo).toBe('OC-7');
    expect(byKey.get('subject')?.registrationNumber).toBe('5510B');
    expect(byKey.get('sire')?.name).toBe('Briarwood Titan');
    expect(byKey.get('sire')?.tattoo).toBe('BW-11');
    expect(byKey.get('dam')?.name).toBe('Briarwood Daisy');
    expect(byKey.get('dam')?.tattoo).toBe('BW-12');
    expect(byKey.get('pgs')?.name).toBe('Hilltop Rex');
    expect(byKey.get('pgd')?.name).toBe('Hilltop Rose');
    expect(byKey.get('mgs')?.name).toBe('Cedar Buck');
    expect(byKey.get('mgd')?.name).toBe('Cedar Belle');
    expect(byKey.get('sss')?.name).toBe('Founder King');
    expect(byKey.get('ddd')?.name).toBe('Founder Queen');
  });

  it('parses labeled text-line pedigree transcripts and returns clean manual_empty when blank', () => {
    const res = parsePedigreeOcrResult({
      sourceFileName: 'goat-pedigree.png',
      rawText: [
        'Subject: Willow Creek Apollo',
        'Ear: WCA-04 · Breed: Nigerian Dwarf · Color: Buckskin',
        'Sire: Blue Ridge Orion',
        'Reg: ADGA-9981 · Wt: 75 lbs',
        'Dam: Willow Creek Juniper',
        'Ear: WCA-01 · Legs: 2',
        'PGS: Pinehollow Atlas',
        'MGD: Meadow Star',
      ].join('\n'),
      confidence: 84,
    });

    expect(res.layoutMode).toBe('line_heuristic');
    expect(res.detectedSpecies).toBe('Goat');
    const byKey = new Map(res.slots.map((s) => [s.slotKey, s]));
    expect(byKey.get('subject')?.name).toBe('Willow Creek Apollo');
    expect(byKey.get('subject')?.breed).toBe('Nigerian Dwarf');
    expect(byKey.get('sire')?.registrationNumber).toBe('ADGA-9981');
    expect(byKey.get('dam')?.legsCount).toBe(2);
    expect(byKey.get('pgs')?.name).toBe('Pinehollow Atlas');
    expect(byKey.get('mgd')?.name).toBe('Meadow Star');

    const emptyRes = parsePedigreeOcrResult({
      sourceFileName: 'blank.jpg',
      rawText: '',
    });
    expect(emptyRes.layoutMode).toBe('manual_empty');
    expect(emptyRes.populatedSlotCount).toBe(0);
    expect(emptyRes.slots).toHaveLength(15);
  });

  it('round-trips a searchable PDF generated by buildPedigreePdfBytes through extractPedigreePdfPages & OCR parser', () => {
    const sp = makeSpeciesProfile('Rabbit');
    const pgs = makeAnimal('pgs-1', {
      name: 'Sunset Rex',
      tattoo: 'SR-01',
      sex: 'Male',
      breed: 'Holland Lop',
      variety: 'Tort',
    });
    const pgd = makeAnimal('pgd-1', {
      name: 'Sunset Belle',
      tattoo: 'SB-02',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Black',
    });
    const sire = makeAnimal('sire-1', {
      name: 'Oakridge Storm',
      tattoo: 'OS-10',
      sex: 'Male',
      breed: 'Holland Lop',
      variety: 'Blue Tort',
      registrationNumber: 'ARBA-7712',
      sireId: pgs.id,
      damId: pgd.id,
    });
    const dam = makeAnimal('dam-1', {
      name: 'Oakridge Blossom',
      tattoo: 'OB-20',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
    });
    const subject = makeAnimal('sub-1', {
      name: 'Oakridge Clover',
      tattoo: 'OC-99',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
      registrationNumber: 'ARBA-8821',
      sireId: sire.id,
      damId: dam.id,
    });

    const snap = makeEmptySnapshot({
      speciesProfiles: [sp],
      animals: [subject, sire, dam, pgs, pgd],
    });

    const pdfBytes = buildPedigreePdfBytes({
      subject,
      allAnimals: snap.animals,
      speciesProfiles: snap.speciesProfiles,
      settings: snap.settings,
      generations: 3,
    });

    const extracted = extractPedigreePdfPages(pdfBytes);
    expect(extracted.ok).toBe(true);
    expect(extracted.isEncrypted).toBe(false);
    expect(extracted.pages.length).toBeGreaterThanOrEqual(1);
    expect(extracted.pages[0].kind).toBe('vector_text');
    expect(extracted.pages[0].rawText).toContain('Oakridge Clover');
    expect(extracted.pages[0].rawText).toContain('Oakridge Storm');
    expect(extracted.pages[0].rawText).toContain('Oakridge Blossom');

    const ocrWords: OcrWordBox[] = (extracted.pages[0].words ?? []).map((w) => ({
      ...w,
      confidence: 98,
    }));
    const parsed = parsePedigreeOcrResult({
      sourceFileName: 'exported-pedigree.pdf',
      rawText: extracted.pages[0].rawText || '',
      imageWidth: extracted.pages[0].width,
      imageHeight: extracted.pages[0].height,
      words: ocrWords,
      confidence: 98,
    });

    expect(parsed.populatedSlotCount).toBeGreaterThanOrEqual(4);
    const byKey = new Map(parsed.slots.map((s) => [s.slotKey, s]));
    expect(byKey.get('subject')?.name).toContain('Oakridge Clover');
    expect(byKey.get('sire')?.name).toContain('Oakridge Storm');
    expect(byKey.get('dam')?.name).toContain('Oakridge Blossom');
  });

  it('extracts embedded /DCTDecode scanned JPEG pages and rejects encrypted PDFs cleanly', () => {
    const fakeJpeg = new Uint8Array(1400);
    fakeJpeg[0] = 0xff;
    fakeJpeg[1] = 0xd8;
    fakeJpeg[1398] = 0xff;
    fakeJpeg[1399] = 0xd9;

    const head = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Type /XObject /Subtype /Image /Width 1200 /Height 900 /Filter /DCTDecode /Length 1400 >>\nstream\n'
    );
    const tail = new TextEncoder().encode('\nendstream\nendobj\n%%EOF\n');
    const scanPdf = new Uint8Array(head.length + fakeJpeg.length + tail.length);
    scanPdf.set(head, 0);
    scanPdf.set(fakeJpeg, head.length);
    scanPdf.set(tail, head.length + fakeJpeg.length);

    const scanRes = extractPedigreePdfPages(scanPdf);
    expect(scanRes.ok).toBe(true);
    expect(scanRes.pages).toHaveLength(1);
    expect(scanRes.pages[0].kind).toBe('raster_jpeg');
    expect(scanRes.pages[0].jpegBytes?.[0]).toBe(0xff);
    expect(scanRes.pages[0].jpegBytes?.[1]).toBe(0xd8);
    expect(scanRes.pages[0].jpegBytes?.slice(-2)).toEqual(new Uint8Array([0xff, 0xd9]));

    const encryptedPdf = new TextEncoder().encode(
      '%PDF-1.6\n1 0 obj\n<< /Filter /Standard /Encrypt 2 0 R >>\nendobj\n%%EOF'
    );
    const encRes = extractPedigreePdfPages(encryptedPdf);
    expect(encRes.ok).toBe(false);
    expect(encRes.isEncrypted).toBe(true);
    expect(encRes.errorMessage).toContain('password-protected');
  });

  it('builds PlatformImportPreview with 3-gen parent links, Subject scan photo attachment & preexisting conflict detection', () => {
    const existingSubject = makeAnimal('existing-oc-7', {
      tattoo: 'OC-7',
      name: 'Oakridge Clover',
      breed: 'Holland Lop',
      variety: 'Tort',
      weightGrams: 1850,
    });
    const snapshot = makeEmptySnapshot({
      animals: [existingSubject],
    });

    const parsed = parsePedigreeOcrResult({
      sourceFileName: 'clover-card.jpg',
      rawText: [
        'Subject: Oakridge Clover',
        'Ear: OC-7 · Breed: Holland Lop · Var: Broken Tort · Wt: 4# 8oz',
        'Sire: Briarwood Titan',
        'Ear: BW-11',
        'Dam: Briarwood Daisy',
        'Ear: BW-12',
      ].join('\n'),
    });

    const fakeScanBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const preview = buildPlatformImportPreviewFromOcrDrafts({
      slots: parsed.slots,
      speciesName: 'Rabbit',
      sourceFileName: 'clover-card.jpg',
      existingSnapshot: snapshot,
      attachedScanPhoto: {
        fileName: 'clover-card.jpg',
        mimeHint: 'image/jpeg',
        bytes: fakeScanBytes,
      },
    });

    expect(preview.animals).toHaveLength(3);
    expect(preview.parentLinksResolved).toBe(2);
    expect(preview.matchedExistingAnimalsCount).toBe(1);
    expect(preview.conflicts.length).toBe(1);
    expect(preview.conflicts[0].animalId).toBe(existingSubject.id);

    const subj = preview.animals.find((a) => a.id === existingSubject.id)!;
    const sire = preview.animals.find((a) => a.name === 'Briarwood Titan')!;
    const dam = preview.animals.find((a) => a.name === 'Briarwood Daisy')!;
    expect(subj.sireId).toBe(sire.id);
    expect(subj.damId).toBe(dam.id);

    expect(preview.stagedPhotos).toHaveLength(1);
    expect(preview.stagedPhotos[0].animalId).toBe(existingSubject.id);
    expect(preview.stagedPhotos[0].species).toBe('Rabbit');
  });
});
```

## `src/core/__tests__/promptsCatalog.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPromptsCatalogManifest,
  isValidPromptsManifest,
  parsePromptEntry,
  partitionPromptsByStatus,
  PROMPTS_FILE_STRUCTURE_BREADCRUMB,
  PROMPTS_FOLDER_PATH,
  PROMPTS_MOVED_DOCUMENTATION_NOTE,
} from '../promptsCatalog';

describe('promptsCatalog — /prompts/ inventory, protection flags & active/archived split', () => {
  it('verifies all seven repository prompts live in root /prompts/ with DO_NOT_REMOVE_WITHOUT_CONFIRMATION', () => {
    const promptsDir = path.resolve(process.cwd(), 'prompts');
    const filenames = fs
      .readdirSync(promptsDir)
      .filter((name) => !name.startsWith('.'))
      .sort();

    expect(filenames).toEqual([
      'fix_error_log_prompt.md',
      'master_system_prompt.md',
      'master_system_prompt_old_v1.md',
      'master_system_prompt_old_v2.md',
      'master_system_prompt_old_v4.md',
      'resume_backlog_plan_prompt.md',
      'start_new_backlog_prompt.md',
    ]);

    const filesByPath: Record<string, string> = {};
    for (const name of filenames) {
      filesByPath[`/prompts/${name}`] = fs.readFileSync(path.join(promptsDir, name), 'utf8');
    }

    const manifest = buildPromptsCatalogManifest(filesByPath, '2026-11-18T10:00:00.000Z');
    expect(manifest.folderPath).toBe('/prompts');
    expect(manifest.entries).toHaveLength(7);
    expect(isValidPromptsManifest(manifest)).toBe(true);

    for (const entry of manifest.entries) {
      expect(entry.protectedDoNotRemove).toBe(true);
      expect(entry.protectionFlag).toBe('DO_NOT_REMOVE_WITHOUT_CONFIRMATION');
      expect(entry.relativePath).toBe(`prompts/${entry.filename}`);
      expect(entry.summary.length).toBeGreaterThan(20);
    }

    const { active, archived } = partitionPromptsByStatus(manifest.entries);
    expect(active.map((e) => e.filename)).toEqual([
      'master_system_prompt.md',
      'start_new_backlog_prompt.md',
      'resume_backlog_plan_prompt.md',
      'fix_error_log_prompt.md',
    ]);
    expect(archived.map((e) => e.filename)).toEqual([
      'master_system_prompt_old_v4.md',
      'master_system_prompt_old_v2.md',
      'master_system_prompt_old_v1.md',
    ]);
  });

  it('parses newly added custom prompts or scripts dynamically and detects missing lock flags', () => {
    const customActive = parsePromptEntry(
      '/prompts/release_audit_script.md',
      `# Release Audit Checklist\n\nVerify offline SQLite backups and bundle budgets before tagging.\n`
    );
    expect(customActive.status).toBe('active');
    expect(customActive.title).toBe('Release Audit Checklist');
    expect(customActive.protectedDoNotRemove).toBe(false);
    expect(customActive.protectionFlag).toBeNull();
    expect(customActive.summary).toContain('Verify offline SQLite backups');

    const customArchived = parsePromptEntry(
      'prompts/legacy_migration_old_v0.md',
      `<!-- DO_NOT_REMOVE_WITHOUT_CONFIRMATION: true -->\n# Legacy Migration\n\nOld script.\n`
    );
    expect(customArchived.status).toBe('archived');
    expect(customArchived.protectedDoNotRemove).toBe(true);
  });

  it('exposes root folder breadcrumb constants and relocation documentation note', () => {
    expect(PROMPTS_FOLDER_PATH).toBe('/prompts');
    expect(PROMPTS_FILE_STRUCTURE_BREADCRUMB).toEqual(['Pedigree (Repo Root)', 'prompts']);
    expect(PROMPTS_MOVED_DOCUMENTATION_NOTE).toContain('/prompts/');
    expect(PROMPTS_MOVED_DOCUMENTATION_NOTE).toContain('PromptsDirectoryScreen.tsx');
  });

  it('rejects malformed prompts-manifest payloads cleanly', () => {
    expect(isValidPromptsManifest(null)).toBe(false);
    expect(isValidPromptsManifest({})).toBe(false);
    expect(
      isValidPromptsManifest({
        folderPath: '/prompts',
        scannedAtIso: '2026-11-18T00:00:00.000Z',
        entries: [{ filename: 'broken.md' }],
      })
    ).toBe(false);
  });
});
```

## `src/core/__tests__/qrCode.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildAnimalProfileDeepLink,
  buildCageBoardDeepLink,
  computeReedSolomonRemainder,
  encodeQrMatrix,
  normalizeAppBaseUrl,
  parseAppDeepLinkParams,
  renderQrSvg,
} from '../qrCode';
import {
  exportBarnBackupJson,
  generateThermalCageCardHtml,
  parseBarnBackupJson,
} from '../syncAndExports';
import { CageLocation } from '../models';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

// Independent GF(256) evaluator (primitive poly 0x11D) to verify Reed-Solomon syndromes === 0
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function evalPolyAtRoot(codeword: Uint8Array, rootExp: number): number {
  let acc = 0;
  const alpha = GF_EXP[rootExp % 255];
  for (let i = 0; i < codeword.length; i++) {
    acc = gfMul(acc, alpha) ^ codeword[i];
  }
  return acc;
}

describe('qrCode — ISO/IEC 18004 pure TS QR encoder, SVG renderer & deep links', () => {
  it('produces mathematically valid Reed-Solomon codewords with zero syndromes at every generator root', () => {
    const data = new Uint8Array([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    const ecCount = 10;
    const ec = computeReedSolomonRemainder(data, ecCount);
    expect(ec.length).toBe(ecCount);

    const fullCodeword = new Uint8Array(data.length + ec.length);
    fullCodeword.set(data, 0);
    fullCodeword.set(ec, data.length);

    for (let root = 0; root < ecCount; root++) {
      expect(evalPolyAtRoot(fullCodeword, root)).toBe(0);
    }
  });

  it('encodes short, medium, and long deep-link URLs with valid finder, timing, and dark-module geometry', () => {
    const payloads = [
      'https://barn.app/',
      'https://askkim.org/pedigree/?route=herd&species=Rabbit&animalId=animal-12345678-abcd-ef01',
      `https://askkim.org/pedigree/?route=herd&species=Holland%20Lop%20Rabbit&animalId=${'a'.repeat(160)}`,
      `https://askkim.org/pedigree/?payload=${'z'.repeat(380)}`,
    ];

    for (const payload of payloads) {
      const qr = encodeQrMatrix(payload);
      expect(qr.version).toBeGreaterThanOrEqual(1);
      expect(qr.version).toBeLessThanOrEqual(14);
      expect(qr.size).toBe(17 + qr.version * 4);
      expect(qr.modules.length).toBe(qr.size);
      expect(qr.modules[0].length).toBe(qr.size);

      const at = (r: number, c: number) => qr.modules[r][c];

      // Top-left, top-right, and bottom-left 7x7 finder outer border + 3x3 center
      const finderOrigins: Array<[number, number]> = [
        [0, 0],
        [0, qr.size - 7],
        [qr.size - 7, 0],
      ];
      for (const [r0, c0] of finderOrigins) {
        expect(at(r0, c0)).toBe(true);
        expect(at(r0 + 3, c0 + 3)).toBe(true);
        expect(at(r0 + 1, c0 + 1)).toBe(false);
        expect(at(r0 + 6, c0 + 6)).toBe(true);
      }

      // Alternating timing patterns on row 6 and col 6
      for (let i = 8; i < qr.size - 8; i++) {
        expect(at(6, i)).toBe(i % 2 === 0);
        expect(at(i, 6)).toBe(i % 2 === 0);
      }

      // Mandatory dark module at (size - 8, 8)
      expect(at(qr.size - 8, 8)).toBe(true);
    }

    // Long payload (> 360 bytes) cleanly upgrades to V12–V14 EC-L fallback without throwing
    const huge = encodeQrMatrix(`https://askkim.org/pedigree/?x=${'k'.repeat(400)}`);
    expect(huge.version).toBeGreaterThanOrEqual(11);
    expect(huge.ecLevel).toBe('L');
  });

  it('renders crisp single-path SVG with quiet zone and escaped aria-label', () => {
    const svg = renderQrSvg('https://askkim.org/?route=herd&animalId=abc', {
      sizePx: 96,
      quietZone: 4,
      ariaLabel: 'QR for <"Clover">',
    });
    expect(svg).toContain('<svg ');
    expect(svg).toContain('width="96" height="96"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('aria-label="QR for &lt;&quot;Clover&quot;&gt;"');
    expect(svg).not.toContain('<"Clover">');
  });

  it('builds and parses animal profile and cage board deep links cleanly', () => {
    expect(normalizeAppBaseUrl('https://askkim.org/pedigree/?old=1#hash')).toBe(
      'https://askkim.org/pedigree/'
    );

    const animalLink = buildAnimalProfileDeepLink(
      'https://askkim.org/pedigree/',
      { id: 'an-42', species: 'Rabbit' }
    );
    expect(animalLink).toBe(
      'https://askkim.org/pedigree/?route=herd&species=Rabbit&animalId=an-42'
    );

    const parsedAnimal = parseAppDeepLinkParams(animalLink.slice(animalLink.indexOf('?')));
    expect(parsedAnimal).toEqual({
      route: 'herd',
      species: 'Rabbit',
      animalId: 'an-42',
      cageId: '',
      taskId: '',
      emergencyReset: false,
      hasDeepLink: true,
    });

    const cageLink = buildCageBoardDeepLink(
      'https://askkim.org/pedigree/',
      { id: 'cage-7', species: 'Goat' }
    );
    const parsedCage = parseAppDeepLinkParams(cageLink.slice(cageLink.indexOf('?')));
    expect(parsedCage.route).toBe('dashboard');
    expect(parsedCage.species).toBe('Goat');
    expect(parsedCage.cageId).toBe('cage-7');
    expect(parsedCage.hasDeepLink).toBe(true);
  });

  it('embeds scannable QR vector SVG in thermal cage cards and allows disabling QR', () => {
    const sp = makeSpeciesProfile('Rabbit');
    const settings = makeSettings({ barnName: 'Oak Ridge' });
    const sire = makeAnimal('s1', { name: 'Buck Alpha', tattoo: 'BA1', sex: 'Male' });
    const dam = makeAnimal('d1', { name: 'Doe Beta', tattoo: 'DB1', sex: 'Female' });
    const subject = makeAnimal('a1', {
      name: 'Clover',
      tattoo: 'CL1',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
      cageLocation: 'Hutch A-03',
    });
    const allAnimals = [sire, dam, subject];

    const htmlWithQr = generateThermalCageCardHtml(subject, allAnimals, [sp], settings, {
      includeQrCode: true,
      appBaseUrl: 'https://askkim.org/pedigree/',
    });
    expect(htmlWithQr).toContain('class="qr-box"');
    expect(htmlWithQr).toContain('<svg ');
    expect(htmlWithQr).toContain('animalId=a1');

    const htmlWithoutQr = generateThermalCageCardHtml(subject, allAnimals, [sp], settings, {
      includeQrCode: false,
      appBaseUrl: 'https://askkim.org/pedigree/',
    });
    expect(htmlWithoutQr).not.toContain('class="qr-box"');
    expect(htmlWithoutQr).not.toContain('<svg ');
  });

  it('preserves extended CageLocation housing, feedlot, and maintenance fields across JSON backup round-trips', () => {
    const cage: CageLocation = {
      id: 'cage-r1',
      species: 'Rabbit',
      label: 'Hutch R-01',
      section: 'Row A',
      capacity: 2,
      notes: 'Shaded east wall',
      unitType: 'hutch',
      feedLotName: '16% Pellet Bin',
      feedStockRemaining: 42.5,
      feedStockUnit: 'lbs',
      dailyRationNote: '4 oz / head',
      feedLowThreshold: 15,
      maintenanceIntervalDays: 7,
      maintenanceTaskLabel: 'Sanitize tray & refresh bedding',
      lastMaintenanceDateIso: '2026-11-15',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };
    const snap = makeEmptySnapshot({ cages: [cage] });
    const exported = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(exported, makeSettings());
    expect(parsed.cages).toHaveLength(1);
    const restored = parsed.cages[0];
    expect(restored.unitType).toBe('hutch');
    expect(restored.feedLotName).toBe('16% Pellet Bin');
    expect(restored.feedStockRemaining).toBe(42.5);
    expect(restored.feedStockUnit).toBe('lbs');
    expect(restored.dailyRationNote).toBe('4 oz / head');
    expect(restored.feedLowThreshold).toBe(15);
    expect(restored.maintenanceIntervalDays).toBe(7);
    expect(restored.maintenanceTaskLabel).toBe('Sanitize tray & refresh bedding');
    expect(restored.lastMaintenanceDateIso).toBe('2026-11-15');
  });
});
```

## `src/core/__tests__/reportCatalog.test.ts`

```typescript
/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { buildReportCatalogForSpecies } from '../reportCatalog';
import { makeSpeciesProfile } from './testFixtures';

describe('buildReportCatalogForSpecies', () => {
  it('uses universal Male, Female, and Non-Adults wording across species', () => {
    const goatCatalog = buildReportCatalogForSpecies(makeSpeciesProfile('Goat'));
    const titles = goatCatalog.map((e) => e.title);

    expect(titles).toContain('Male Income Report');
    expect(titles).toContain('Female Income Report');
    expect(titles).toContain('Male Report');
    expect(titles).toContain('Female Report');
    expect(titles).toContain('Non-Adults (Male & Female) Report');
    expect(titles).toContain('Body Condition & Parasite Score Report');

    // No hardcoded Buck / Doe / Kid / Herd / FAMACHA titles
    for (const title of titles) {
      expect(title).not.toMatch(/\b(Buck|Doe|Kid|Herd|FAMACHA)\b/);
    }
    expect(goatCatalog.every((e) => e.scopeLabel === 'Goat Only')).toBe(true);
  });

  it('adapts birth event and identifier terminology strictly to each added species', () => {
    const dogCatalog = buildReportCatalogForSpecies(makeSpeciesProfile('Dog'));
    const dogMarksCal = dogCatalog.find((e) => e.id === 'birth-calendar-marks');
    const dogMissingId = dogCatalog.find((e) => e.id === 'unmarked-report');

    expect(dogMarksCal?.title).toBe('Whelping Calendar (By ID)');
    expect(dogMarksCal?.description).toContain('id / microchip');
    expect(dogMissingId?.description).toContain('id / microchip');
    expect(dogCatalog.every((e) => e.scopeLabel === 'Dog Only')).toBe(true);

    // Ensure Dog catalog contains zero goat/rabbit terminology
    for (const entry of dogCatalog) {
      expect(`${entry.title} ${entry.description}`).not.toMatch(/\b(kidding|kindling|buck|doe)\b/i);
    }
  });

  it('supports custom user-defined species profiles without leaking other species labels', () => {
    const customProfile = {
      ...makeSpeciesProfile('Rabbit'),
      id: 'species-custom-quail',
      name: 'Quail',
      birthEventLabel: 'Hatching',
      maleLabel: 'Rooster',
      femaleLabel: 'Hen',
      offspringLabel: 'Chick',
    };
    const quailCatalog = buildReportCatalogForSpecies(customProfile);
    expect(quailCatalog).toHaveLength(28);
    expect(quailCatalog.map((r) => r.id)).toContain('barn-economics-report');
    expect(quailCatalog.map((r) => r.id)).toContain('meat-pelt-yield-report');
    expect(quailCatalog.map((r) => r.id)).toContain('youth-project-report');
    expect(quailCatalog.map((r) => r.id)).toContain('crm-waitlist-report');
    expect(quailCatalog.map((r) => r.id)).toContain('crm-reservations-deposits-report');
    expect(quailCatalog[0].title).toBe('Hatching Calendar (By ID)');
    expect(quailCatalog.every((e) => e.scopeLabel === 'Quail Only')).toBe(true);
  });
});
```

## `src/core/__tests__/reportGenerators.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  Animal,
  BarnDatabaseSnapshot,
  BreedingRecord,
  CareLog,
} from '../models';
import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisks,
  analyzePairingCarrierRisksFromAnalyses,
} from '../carrierGenetics';
import {
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  createSpeciesCoiEvaluator,
} from '../pedigreeCalculator';
import { buildReportCatalogForSpecies } from '../reportCatalog';
import {
  buildPrintableReportHtml,
  buildReportFileName,
  exportReportToCsv,
  generateSpeciesReport,
} from '../reportGenerators';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

const TS = '2026-11-01T12:00:00.000Z';

function buildMultiSpeciesTestSnapshot(): BarnDatabaseSnapshot {
  const rabbitProfile = {
    ...makeSpeciesProfile('Rabbit'),
    preferredUnit: 'lbs_oz' as const,
    maturityDays: 150,
    weanDaysAfterBirth: 42,
  };
  const goatProfile = {
    ...makeSpeciesProfile('Goat'),
    preferredUnit: 'kg' as const,
    maturityDays: 240,
    weanDaysAfterBirth: 60,
  };

  // Founder pair (outcross parents)
  const rFounderBuck = makeAnimal('r-buck-1', {
    species: 'Rabbit',
    name: 'Apollo',
    tattoo: 'RB-01',
    sex: 'Male',
    status: 'Active',
    birthDateIso: '2024-03-01',
    weightGrams: 4536, // 10 lb 0 oz
    breed: 'New Zealand',
    variety: 'Red',
    cageLocation: 'Barn A-1',
    registrationNumber: 'ARBA-101',
    legsCount: 3,
    ownershipType: 'Owned',
  });

  const rDoe1 = makeAnimal('r-doe-1', {
    species: 'Rabbit',
    name: 'Clover',
    tattoo: 'RB-02',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2024-04-01',
    weightGrams: 4800,
    breed: 'New Zealand',
    variety: 'Red',
    cageLocation: 'Barn A-2',
    registrationNumber: 'ARBA-102',
    confirmedCarrierOf: ['Dilute (dd)'],
    ownershipType: 'Owned',
  });

  // Unmarked juvenile buck (born 2026-08-20 -> 72 days old on 2026-10-31 -> Non-Adult < 150d)
  const rJrBuck = makeAnimal('r-jr-buck', {
    species: 'Rabbit',
    name: 'Pip',
    tattoo: '',
    registrationNumber: '',
    sex: 'Male',
    status: 'Junior',
    birthDateIso: '2026-08-20',
    weightGrams: 1800,
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    cageLocation: 'Growout-1',
    ownershipType: 'Owned',
  });

  // Juvenile doe flagged for culling
  const rJrDoe = makeAnimal('r-jr-doe', {
    species: 'Rabbit',
    name: 'Willow',
    tattoo: 'RB-04',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2026-07-15', // 108 days old on 2026-10-31 -> Non-Adult < 150d
    weightGrams: 2200,
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    culled: true,
    cullDateIso: '2026-10-15',
    cullReason: 'Pinched hindquarters',
    ownershipType: 'Owned',
  });

  // Sold offspring out of Clover (Female Income + Sold Stock)
  const rSoldOffspring = makeAnimal('r-sold-kit', {
    species: 'Rabbit',
    name: 'Copper Kid',
    tattoo: 'RB-05',
    sex: 'Male',
    status: 'Sold',
    birthDateIso: '2026-03-01',
    soldDateIso: '2026-06-15',
    salePriceCents: 12500,
    purchaseCostCents: 2000,
    buyerName: 'Hilltop Acres',
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    weightGrams: 3400,
    ownershipType: 'Owned',
  });

  // Deceased non-adult rabbit
  const rDeadKit = makeAnimal('r-dead-kit', {
    species: 'Rabbit',
    name: 'Shadow',
    tattoo: 'RB-06',
    sex: 'Female',
    status: 'Deceased',
    birthDateIso: '2026-09-01',
    deceasedDateIso: '2026-10-05', // 34 days old -> Non-Adult
    deathCause: 'Weaning bloat',
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    ownershipType: 'Owned',
  });

  // Outside unrelated Doe (ideal outcross match) & Outside Reference Sire
  const rOutcrossDoe = makeAnimal('r-doe-outcross', {
    species: 'Rabbit',
    name: 'Saffron',
    tattoo: 'EXT-90',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2024-05-10',
    weightGrams: 4600,
    breed: 'New Zealand',
    variety: 'Red',
    ownershipType: 'Outside',
    ownerName: 'Maple Creek Farm',
  });

  const rRefBuck = makeAnimal('r-ref-buck', {
    species: 'Rabbit',
    name: 'Titan',
    tattoo: 'REF-11',
    sex: 'Male',
    status: 'Retired',
    birthDateIso: '2022-01-01',
    confirmedCarrierOf: ['Dilute (dd)'],
    ownershipType: 'Reference',
    ownerName: 'Heritage Lines',
  });

  // Another active breeding male unrelated to Clover
  const rOutcrossBuck = makeAnimal('r-buck-outcross', {
    species: 'Rabbit',
    name: 'Bramble',
    tattoo: 'RB-09',
    sex: 'Male',
    status: 'Active',
    birthDateIso: '2024-06-01',
    weightGrams: 4400,
    breed: 'New Zealand',
    variety: 'Red',
    confirmedCarrierOf: ['Dilute (dd)'],
    ownershipType: 'Owned',
  });

  // Separate Species: Goat (strictly isolated)
  const goatBuck = makeAnimal('g-buck-1', {
    species: 'Goat',
    name: 'Summit King',
    tattoo: 'GT-10',
    sex: 'Male',
    status: 'Active',
    birthDateIso: '2023-02-01',
    weightGrams: 38500, // 38.50 kg
    breed: 'Nigerian Dwarf',
    ownershipType: 'Owned',
  });

  const goatDoe = makeAnimal('g-doe-1', {
    species: 'Goat',
    name: 'Meadowlark',
    tattoo: 'GT-20',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2023-03-15',
    weightGrams: 31250, // 31.25 kg
    breed: 'Nigerian Dwarf',
    ownershipType: 'Owned',
  });

  const breedings: BreedingRecord[] = [
    {
      id: 'br-r-1',
      species: 'Rabbit',
      sireId: rFounderBuck.id,
      damId: rDoe1.id,
      sireName: rFounderBuck.name,
      damName: rDoe1.name,
      bredDateIso: '2026-10-05',
      expectedDueDateIso: '2026-11-05',
      actualBirthDateIso: '',
      projectedCoiPercent: 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status: 'Palpated Positive',
      serviceFeeCents: 7500,
      serviceFeeDirection: 'earned',
      ultrasoundDateIso: '2026-10-20',
      ultrasoundResult: 'Positive',
      ultrasoundFetalCount: 6,
      ultrasoundProjectedDueIso: '2026-11-04',
      notes: 'Clear fetal sacs',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'br-r-2',
      species: 'Rabbit',
      sireId: rFounderBuck.id,
      damId: rDoe1.id,
      sireName: rFounderBuck.name,
      damName: rDoe1.name,
      bredDateIso: '2026-01-25',
      expectedDueDateIso: '2026-02-25',
      actualBirthDateIso: '2026-02-26',
      projectedCoiPercent: 0,
      liveCount: 8,
      stillbornCount: 1,
      fosteredCount: 0,
      weanedCount: 7,
      offspringCreated: true,
      status: 'Weaned',
      serviceFeeCents: 4000,
      serviceFeeDirection: 'paid',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'br-g-1',
      species: 'Goat',
      sireId: goatBuck.id,
      damId: goatDoe.id,
      sireName: goatBuck.name,
      damName: goatDoe.name,
      bredDateIso: '2026-08-01',
      expectedDueDateIso: '2026-12-29',
      actualBirthDateIso: '',
      projectedCoiPercent: 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status: 'Bred',
      serviceFeeCents: 15000,
      serviceFeeDirection: 'earned',
      ultrasoundDateIso: '2026-09-10',
      ultrasoundResult: 'Positive',
      ultrasoundFetalCount: 2,
      ultrasoundProjectedDueIso: '2026-12-28',
      notes: 'Twins visible',
      createdAt: TS,
      updatedAt: TS,
    },
  ];

  const careLogs: CareLog[] = [
    {
      id: 'cl-wt-1',
      species: 'Rabbit',
      animalId: rJrBuck.id,
      dateIso: '2026-10-01',
      type: 'Weight Check',
      title: '6-Week Weight',
      weightGrams: 1100,
      showLegEarned: false,
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-wt-2',
      species: 'Rabbit',
      animalId: rJrBuck.id,
      dateIso: '2026-10-21',
      type: 'Weight Check',
      title: '9-Week Weight',
      weightGrams: 1800, // +700g over 20 days = 35 g/day
      showLegEarned: false,
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-med-1',
      species: 'Rabbit',
      animalId: rFounderBuck.id,
      dateIso: '2026-10-20',
      type: 'Health / Vet',
      title: 'Ear Mite Treatment',
      weightGrams: 0,
      showLegEarned: false,
      medicationName: 'Ivermectin 1%',
      dosage: '0.2 mL',
      administrationRoute: 'SubQ',
      withdrawalDays: 28,
      withdrawalClearDateIso: '2026-11-17',
      notes: 'Hold until Nov 17',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-bcs-1',
      species: 'Goat',
      animalId: goatDoe.id,
      dateIso: '2026-10-25',
      type: 'Health Score / BCS',
      title: 'Pre-winter parasite check',
      weightGrams: 0,
      showLegEarned: false,
      bodyConditionScore: 3.5,
      famachaScore: 4,
      fecalEggCount: 1200,
      notes: 'Schedule deworming recheck',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-us-1',
      species: 'Goat',
      animalId: goatDoe.id,
      dateIso: '2026-09-12',
      type: 'Ultrasound',
      title: 'Re-check scan',
      weightGrams: 0,
      showLegEarned: false,
      ultrasoundResult: 'Positive',
      ultrasoundFetalCount: 2,
      notes: 'Confirmed heartbeat',
      createdAt: TS,
      updatedAt: TS,
    },
  ];

  return makeEmptySnapshot({
    settings: makeSettings({
      barnName: 'Copper Creek Barn',
      currencyCode: 'CAD',
      preferredUnit: 'lbs',
    }),
    speciesProfiles: [rabbitProfile, goatProfile],
    animals: [
      rFounderBuck,
      rDoe1,
      rJrBuck,
      rJrDoe,
      rSoldOffspring,
      rDeadKit,
      rOutcrossDoe,
      rRefBuck,
      rOutcrossBuck,
      goatBuck,
      goatDoe,
    ],
    breedings,
    careLogs,
  });
}

describe('reportGenerators (Phase 3)', () => {
  it('generates every single one of the 28 catalog reports for an added species without errors', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();
    const rabbitProfile = snapshot.speciesProfiles[0];
    const catalog = buildReportCatalogForSpecies(rabbitProfile);

    expect(catalog).toHaveLength(28);

    for (const entry of catalog) {
      const rep = generateSpeciesReport(snapshot, 'Rabbit', entry.id, {
        referenceDateIso: '2026-10-31',
      });
      expect(rep.speciesAdded).toBe(true);
      expect(rep.speciesName).toBe('Rabbit');
      expect(rep.columns.length).toBeGreaterThan(0);

      // CSV and printable HTML must work for every report
      const csv = exportReportToCsv(rep);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      const html = buildPrintableReportHtml(rep, snapshot.settings);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(entry.title.replace(/&/g, '&amp;'));
    }
  });

  it('refuses to leak data or generate presets for unadded species', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();
    const rep = generateSpeciesReport(snapshot, 'Cattle', 'roster-report');

    expect(rep.speciesAdded).toBe(false);
    expect(rep.rows).toHaveLength(0);
    expect(rep.summaryMetrics[0]?.value).toBe('Not Added to Barn');
  });

  it('strictly isolates records per species and uses species weight unit overrides', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const rabbitRoster = generateSpeciesReport(snapshot, 'Rabbit', 'roster-report', {
      referenceDateIso: '2026-10-31',
    });
    const rabbitNames = rabbitRoster.rows.map((r) => String(r.cells.name));
    expect(rabbitNames).toContain('Apollo');
    expect(rabbitNames).not.toContain('Summit King');
    expect(rabbitNames).not.toContain('Meadowlark');
    expect(rabbitRoster.weightUnit).toBe('lbs_oz');
    const apolloRow = rabbitRoster.rows.find((r) => r.cells.name === 'Apollo');
    expect(String(apolloRow?.cells.weight)).toContain('lb');

    const goatRoster = generateSpeciesReport(snapshot, 'Goat', 'roster-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(goatRoster.rows).toHaveLength(2);
    expect(goatRoster.weightUnit).toBe('kg');
    const goatRow = goatRoster.rows.find((r) => r.cells.name === 'Summit King');
    expect(goatRow?.cells.weight).toBe('38.50 kg');
  });

  it('applies All / Male / Female / Non-Adult Male / Non-Adult Female audience filters and maturityDays', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const nonAdultMales = generateSpeciesReport(snapshot, 'Rabbit', 'non-adult-report', {
      filter: 'Non-Adult Male',
      referenceDateIso: '2026-10-31',
    });
    expect(nonAdultMales.rows.map((r) => r.cells.name)).toEqual(['Pip']);

    const nonAdultFemales = generateSpeciesReport(snapshot, 'Rabbit', 'non-adult-report', {
      filter: 'Non-Adult Female',
      referenceDateIso: '2026-10-31',
    });
    expect(nonAdultFemales.rows.map((r) => r.cells.name)).toEqual(['Willow']);

    const maleOnlyRoster = generateSpeciesReport(snapshot, 'Rabbit', 'roster-report', {
      filter: 'Male',
      referenceDateIso: '2026-10-31',
    });
    expect(maleOnlyRoster.rows.every((r) => r.cells.sex === 'Buck')).toBe(true);
    expect(maleOnlyRoster.rows.map((r) => r.cells.name)).toContain('Apollo');
    expect(maleOnlyRoster.rows.map((r) => r.cells.name)).not.toContain('Clover');
  });

  it('computes Male Income, Female Income, and Sold Stock with configured currency', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const maleIncome = generateSpeciesReport(snapshot, 'Rabbit', 'male-income-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(maleIncome.currencyCode).toBe('CAD');
    const apolloIncome = maleIncome.rows.find((r) => r.cells.name === 'Apollo');
    expect(String(apolloIncome?.cells.studEarned)).toContain('$75.00');
    expect(String(apolloIncome?.cells.feesPaid)).toContain('$40.00');

    const femaleIncome = generateSpeciesReport(snapshot, 'Rabbit', 'female-income-report', {
      referenceDateIso: '2026-10-31',
    });
    const cloverIncome = femaleIncome.rows.find((r) => r.cells.name === 'Clover');
    expect(cloverIncome?.cells.offspringSold).toBe(1);
    expect(String(cloverIncome?.cells.offspringRevenue)).toContain('$125.00');
    expect(String(cloverIncome?.cells.studPaid)).toContain('$40.00');
    expect(String(cloverIncome?.cells.netIncome)).toContain('$85.00');

    const soldStock = generateSpeciesReport(snapshot, 'Rabbit', 'sold-stock-report');
    expect(soldStock.rows).toHaveLength(1);
    expect(soldStock.rows[0].cells.buyer).toBe('Hilltop Acres');
    expect(String(soldStock.rows[0].cells.netMargin)).toContain('$105.00');
  });

  it('computes ADG in Weight Gain Report, active withdrawal holds in Medicine Report, and BCS/FAMACHA alerts', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const weightGain = generateSpeciesReport(snapshot, 'Rabbit', 'weight-gain-report', {
      referenceDateIso: '2026-10-31',
    });
    const pipGain = weightGain.rows.find((r) => r.cells.name === 'Pip');
    expect(pipGain?.cells.days).toBe('20');
    expect(String(pipGain?.cells.adg)).toContain('35.0 g/day');

    const medReport = generateSpeciesReport(snapshot, 'Rabbit', 'medicine-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(medReport.rows).toHaveLength(1);
    expect(String(medReport.rows[0].cells.withdrawalStatus)).toContain('Active Hold');

    const clearedMedReport = generateSpeciesReport(snapshot, 'Rabbit', 'medicine-report', {
      referenceDateIso: '2026-11-20',
    });
    expect(clearedMedReport.rows[0].cells.withdrawalStatus).toBe('Cleared');

    const healthScore = generateSpeciesReport(snapshot, 'Goat', 'health-score-report');
    expect(healthScore.rows).toHaveLength(1);
    expect(healthScore.rows[0].cells.bcs).toBe('3.5');
    expect(healthScore.rows[0].cells.famacha).toBe('4 / 5');
    expect(healthScore.rows[0].cells.fec).toBe('1200 EPG');
    expect(healthScore.rows[0].highlightTone).toBe('danger');
  });

  it('handles ultrasound calendars, mortality ages, culls, missing IDs, ownership splits, and breed-with COI screening', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const usCalendar = generateSpeciesReport(snapshot, 'Rabbit', 'birth-calendar-ultrasounds');
    expect(usCalendar.rows).toHaveLength(1);
    expect(usCalendar.rows[0].cells.projectedDue).toBe('Nov 4, 2026');
    expect(usCalendar.rows[0].cells.estCount).toBe('6');

    const goatUltrasounds = generateSpeciesReport(snapshot, 'Goat', 'ultrasound-report');
    expect(goatUltrasounds.rows).toHaveLength(2); // 1 Breeding scan + 1 Care Log scan

    const deathReport = generateSpeciesReport(snapshot, 'Rabbit', 'death-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(deathReport.rows).toHaveLength(1);
    expect(deathReport.rows[0].cells.stageAtDeath).toBe('Non-Adult');
    expect(deathReport.rows[0].cells.ageAtDeath).toBe('34 d');

    const cullReport = generateSpeciesReport(snapshot, 'Rabbit', 'cull-report');
    expect(cullReport.rows).toHaveLength(1);
    expect(cullReport.rows[0].cells.reason).toBe('Pinched hindquarters');

    const unmarked = generateSpeciesReport(snapshot, 'Rabbit', 'unmarked-report');
    expect(unmarked.rows.some((r) => r.cells.name === 'Pip')).toBe(true);

    const owned = generateSpeciesReport(snapshot, 'Rabbit', 'my-owned-stock-report');
    const outside = generateSpeciesReport(snapshot, 'Rabbit', 'outside-reference-stock-report');
    expect(owned.rows.some((r) => r.cells.name === 'Saffron')).toBe(false);
    expect(outside.rows.map((r) => r.cells.name).sort()).toEqual(['Saffron', 'Titan']);

    const breedWith = generateSpeciesReport(snapshot, 'Rabbit', 'breed-with-report', {
      subjectAnimalId: 'r-doe-1',
    });
    // Outcross Apollo x Clover (0% COI, 0 confirmed carrier danger) should rank ahead of Bramble x Clover (both Confirmed Dilute carriers -> danger!)
    expect(breedWith.rows[0].cells.sire).toBe('Apollo');
    expect(breedWith.rows[0].cells.coi).toBe('0.00%');
    const brambleRow = breedWith.rows.find((r) => r.cells.sire === 'Bramble');
    expect(brambleRow?.highlightTone).toBe('danger');
    expect(String(brambleRow?.cells.carriers)).toContain('DANGER');

    const csvName = buildReportFileName(breedWith, 'csv', snapshot.settings.barnName);
    expect(csvName).toBe('copper-creek-barn-rabbit-breed-with-report-2026-11-01.csv'.replace('2026-11-01', breedWith.generatedAtDateIso));
  });

  it('matches uncached COI & carrier risk results identically via batch evaluators', () => {
    const fSire = makeAnimal('f-sire', { name: 'Founder Sire', sex: 'Male', confirmedCarrierOf: ['Dilute (dd)'] });
    const fDam = makeAnimal('f-dam', { name: 'Founder Dam', sex: 'Female' });
    const midBuck = makeAnimal('m-buck', {
      name: 'Mid Buck',
      sex: 'Male',
      sireId: fSire.id,
      damId: fDam.id,
    });
    const midDoe = makeAnimal('m-doe', {
      name: 'Mid Doe',
      sex: 'Female',
      sireId: fSire.id,
      damId: fDam.id,
      suspectedCarrierOf: ['Self (aa)'],
    });
    const linebredChild = makeAnimal('lb-child', {
      name: 'Linebred Child',
      sex: 'Female',
      sireId: midBuck.id,
      damId: midDoe.id,
    });
    const herd = [fSire, fDam, midBuck, midDoe, linebredChild];
    const herdMap = buildSpeciesHerdMap(herd, 'Rabbit');
    const evaluator = createSpeciesCoiEvaluator(herdMap);

    // Animal COI parity
    for (const animal of herd) {
      const expected = calculateAnimalCoi(animal, herdMap);
      const actual = evaluator.calculateAnimalCoi(animal);
      expect(actual.coiPercent).toBeCloseTo(expected.coiPercent, 8);
      expect(actual.knownAncestorsIn3Gen).toBe(expected.knownAncestorsIn3Gen);
      expect(actual.knownAncestorsIn4Gen).toBe(expected.knownAncestorsIn4Gen);
      expect(actual.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])).toEqual(
        expected.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])
      );
    }

    // Pairing COI & carrier risk parity (linebred backcross + full-sib)
    const pairs: Array<[Animal, Animal]> = [
      [midBuck, midDoe],
      [midBuck, linebredChild],
      [fSire, linebredChild],
    ];
    for (const [sire, dam] of pairs) {
      const expectedCoi = calculatePairingCoi(sire.id, dam.id, herdMap);
      const actualCoi = evaluator.calculatePairingCoi(sire.id, dam.id);
      expect(actualCoi.coiPercent).toBeCloseTo(expectedCoi.coiPercent, 8);
      expect(actualCoi.knownAncestorsIn3Gen).toBe(expectedCoi.knownAncestorsIn3Gen);
      expect(actualCoi.knownAncestorsIn4Gen).toBe(expectedCoi.knownAncestorsIn4Gen);
      expect(actualCoi.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])).toEqual(
        expectedCoi.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])
      );

      const expectedCarrier = analyzePairingCarrierRisks(sire, dam, herdMap);
      const actualCarrier = analyzePairingCarrierRisksFromAnalyses(
        analyzeAnimalCarrierLineage(sire, herdMap),
        analyzeAnimalCarrierLineage(dam, herdMap)
      );
      expect(actualCarrier).toEqual(expectedCarrier);
    }
  });

  it('rejects invalid calendar dates like Feb 31 in Weight Gain Report and formats zero delta cleanly', () => {
    const base = buildMultiSpeciesTestSnapshot();
    const flatBuck = makeAnimal('r-flat', {
      species: 'Rabbit',
      name: 'Flatline',
      tattoo: 'FL-1',
      sex: 'Male',
      status: 'Active',
      weightGrams: 2000,
    });
    const invalidDateBuck = makeAnimal('r-bad-date', {
      species: 'Rabbit',
      name: 'BadDate',
      tattoo: 'BD-1',
      sex: 'Male',
      status: 'Active',
      weightGrams: 2500,
    });

    const snap: BarnDatabaseSnapshot = {
      ...base,
      animals: [...base.animals, flatBuck, invalidDateBuck],
      careLogs: [
        ...base.careLogs,
        {
          id: 'cl-flat-1',
          species: 'Rabbit',
          animalId: flatBuck.id,
          dateIso: '2026-10-01',
          type: 'Weight Check',
          title: 'Check 1',
          weightGrams: 2000,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'cl-flat-2',
          species: 'Rabbit',
          animalId: flatBuck.id,
          dateIso: '2026-10-11',
          type: 'Weight Check',
          title: 'Check 2',
          weightGrams: 2000,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'cl-bad-1',
          species: 'Rabbit',
          animalId: invalidDateBuck.id,
          dateIso: '2026-02-31',
          type: 'Weight Check',
          title: 'Bad Check 1',
          weightGrams: 1500,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'cl-bad-2',
          species: 'Rabbit',
          animalId: invalidDateBuck.id,
          dateIso: '2026-03-05',
          type: 'Weight Check',
          title: 'Valid Check 2',
          weightGrams: 2500,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    };

    const weightGain = generateSpeciesReport(snap, 'Rabbit', 'weight-gain-report', {
      referenceDateIso: '2026-10-31',
    });

    const flatRow = weightGain.rows.find((r) => r.cells.name === 'Flatline');
    expect(flatRow?.cells.totalGain).toBe('0');
    expect(flatRow?.cells.adg).toBe('0.000 lb/day (0.0 g/day)');

    // Invalid calendar date 2026-02-31 must not roll over to Mar 3 or produce bogus days/ADG
    const badRow = weightGain.rows.find((r) => r.cells.name === 'BadDate');
    expect(badRow).toBeDefined();
    expect(badRow?.cells.days).toBe('—');
    expect(badRow?.cells.adg).toBe('—');
    expect(String(badRow?.cells.startWeight)).toContain('(2026-02-31)');
  });

  it('builds Litter Survival & Parent Performance Report with Male/Female role switching', () => {
    const base = buildMultiSpeciesTestSnapshot();
    const snap: BarnDatabaseSnapshot = {
      ...base,
      breedings: [
        ...base.breedings,
        {
          id: 'br-r-survival-1',
          species: 'Rabbit',
          sireId: 'r-buck-outcross',
          damId: 'r-doe-outcross',
          sireName: 'Bramble',
          damName: 'Saffron',
          bredDateIso: '2026-06-01',
          expectedDueDateIso: '2026-07-02',
          actualBirthDateIso: '2026-07-02',
          projectedCoiPercent: 0,
          liveCount: 8,
          stillbornCount: 2,
          fosteredCount: 0,
          weanedCount: 7,
          offspringCreated: false,
          status: 'Weaned',
          litterWeightMilestones: [
            {
              id: 'ms-21d',
              ageDays: 21,
              label: '3-Week',
              liveCount: 7,
              totalWeightGrams: 3500,
              avgWeightGrams: 500,
            },
            {
              id: 'ms-56d',
              ageDays: 56,
              label: '8-Week',
              liveCount: 7,
              totalWeightGrams: 13300,
              avgWeightGrams: 1900,
            },
          ],
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    };

    const femaleReport = generateSpeciesReport(snap, 'Rabbit', 'litter-survival-performance-report', {
      filter: 'Female',
    });
    expect(femaleReport.columns[0].label).toBe('Female');
    const saffronRow = femaleReport.rows.find((r) => r.cells.parent === 'Saffron');
    expect(saffronRow).toBeDefined();
    expect(saffronRow?.cells.liveBorn).toBe('8');
    expect(saffronRow?.cells.stillborn).toBe('2');
    expect(saffronRow?.cells.liveBirthPct).toBe('80.0%');
    expect(saffronRow?.cells.weanSurvivalPct).toBe('87.5%');
    expect(saffronRow?.highlightTone).toBe('success');

    const maleReport = generateSpeciesReport(snap, 'Rabbit', 'litter-survival-performance-report', {
      filter: 'Male',
    });
    expect(maleReport.columns[0].label).toBe('Male');
    const brambleRow = maleReport.rows.find((r) => r.cells.parent === 'Bramble');
    expect(brambleRow).toBeDefined();
    expect(brambleRow?.cells.weaned).toBe('7');
  });

  it('generates Barn Economics, Meat & Pelt Yield, and 4-H/FFA Youth Project reports cleanly', () => {
    const base = buildMultiSpeciesTestSnapshot();
    const snap = {
      ...base,
      ledgerEntries: [
        {
          id: 'rep-le-1',
          species: 'Rabbit',
          dateIso: '2026-10-05',
          entryType: 'expense' as const,
          category: 'bedding' as const,
          amountCents: 1850,
          title: 'Shavings Bale',
          vendorOrParty: 'Feed Store',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      processingLogs: [
        {
          id: 'rep-pl-1',
          species: 'Rabbit',
          title: 'Fall Fryer Batch',
          scheduledDateIso: '2026-10-10',
          harvestDateIso: '2026-10-10',
          status: 'Processed' as const,
          animalCount: 3,
          liveWeightGrams: 7500,
          dressedWeightGrams: 4350,
          dressOutPercent: 58,
          peltCount: 3,
          peltGrade: 'Prime' as const,
          peltColorNotes: 'White',
          meatValueCents: 4500,
          peltValueCents: 1200,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      youthProjectBooks: [
        {
          id: 'rep-yp-1',
          species: 'Rabbit',
          organization: '4-H' as const,
          projectTitle: 'County Fair Market Pen',
          memberName: 'Jordan Lee',
          clubOrChapter: 'Pine Creek 4-H',
          leaderOrAdvisor: 'Kim',
          projectYear: '2026',
          startDateIso: '2026-02-01',
          endDateIso: '2026-10-15',
          status: 'Completed' as const,
          linkedAnimalIds: [],
          linkedBreedingIds: [],
          startingInventoryValueCents: 3000,
          endingInventoryValueCents: 4500,
          feedLogs: [],
          goalsAndReflection: 'Completed record book.',
          showAndCommunityNotes: '',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    };

    const econRep = generateSpeciesReport(snap, 'Rabbit', 'barn-economics-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(econRep.rows.some((r) => String(r.cells.title) === 'Shavings Bale')).toBe(true);

    const yieldRep = generateSpeciesReport(snap, 'Rabbit', 'meat-pelt-yield-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(yieldRep.rows.some((r) => String(r.cells.title) === 'Fall Fryer Batch')).toBe(true);
    expect(yieldRep.rows[0]?.cells.dressOut).toBe('58.0%');

    const youthRep = generateSpeciesReport(snap, 'Rabbit', 'youth-project-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(youthRep.rows).toHaveLength(1);
    expect(youthRep.rows[0]?.cells.title).toBe('County Fair Market Pen');
  });
});
```

## `src/core/__tests__/reportsPhase1.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { exportAnimalsCsv } from '../csvExport';
import { resolveAnimalsWithConflictChoices } from '../importers/conflictResolver';
import {
  formatCurrencyCents,
  isAnimalNonAdult,
  normalizeOwnershipType,
  normalizeUltrasoundResult,
} from '../models';
import {
  buildPdfReadyBarnSnapshot,
  exportBarnBackupJson,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('Reports Phase 1 — structured fields, migrations, CSV/JSON round-trip & helpers', () => {
  it('round-trips all new settings, species, animal, breeding, and care log fields through JSON v5 backups and multi-device merge', () => {
    const rabbitProfile = {
      ...makeSpeciesProfile('Rabbit'),
      maturityDays: 180,
    };

    const soldAnimal = makeAnimal('a-sold', {
      name: 'Copper Baron',
      tattoo: 'CB-1',
      status: 'Sold',
      archived: true,
      ownershipType: 'Owned',
      soldDateIso: '2026-10-12',
      salePriceCents: 12500,
      purchaseCostCents: 4500,
      buyerName: 'Willow Creek Rabbitry',
    });

    const referenceDam = makeAnimal('a-ref', {
      name: 'Outside Empress',
      tattoo: 'EXT-9',
      sex: 'Female',
      status: 'Archived',
      archived: true,
      ownershipType: 'Reference',
      culled: true,
      cullDateIso: '2026-09-01',
      cullReason: 'Disposition / Pedigree only',
      deceasedDateIso: '2026-11-01',
      deathCause: 'Age',
    });

    const snap = makeEmptySnapshot({
      settings: makeSettings({ currencyCode: 'CAD' }),
      speciesProfiles: [rabbitProfile],
      animals: [soldAnimal, referenceDam],
      breedings: [
        {
          id: 'br-1',
          species: 'Rabbit',
          sireId: 'a-sold',
          damId: 'a-ref',
          sireName: 'Copper Baron',
          damName: 'Outside Empress',
          bredDateIso: '2026-09-10',
          expectedDueDateIso: '2026-10-11',
          actualBirthDateIso: '',
          projectedCoiPercent: 0,
          liveCount: 0,
          stillbornCount: 0,
          fosteredCount: 0,
          weanedCount: 0,
          offspringCreated: false,
          status: 'Palpated Positive',
          serviceFeeCents: 3500,
          serviceFeeDirection: 'earned',
          ultrasoundDateIso: '2026-09-24',
          ultrasoundResult: 'Positive',
          ultrasoundFetalCount: 6,
          ultrasoundProjectedDueIso: '2026-10-10',
          notes: 'Checked at day 14',
          createdAt: '2026-09-10T12:00:00.000Z',
          updatedAt: '2026-09-24T12:00:00.000Z',
        },
      ],
      careLogs: [
        {
          id: 'cl-med',
          species: 'Rabbit',
          animalId: 'a-sold',
          dateIso: '2026-09-05',
          type: 'Health / Vet',
          title: 'Ear mite treatment',
          weightGrams: 0,
          showLegEarned: false,
          medicationName: 'Ivermectin',
          dosage: '0.2 mL',
          administrationRoute: 'SubQ',
          withdrawalDays: 28,
          withdrawalClearDateIso: '2026-10-03',
          bodyConditionScore: 3.5,
          famachaScore: 2,
          fecalEggCount: 150,
          ultrasoundResult: 'Positive',
          ultrasoundFetalCount: 4,
          notes: 'Clean recheck',
          createdAt: '2026-09-05T12:00:00.000Z',
          updatedAt: '2026-09-05T12:00:00.000Z',
        },
      ],
    });

    const json = exportBarnBackupJson(snap);
    const restored = parseBarnBackupJson(json, makeSettings());

    expect(restored.settings.currencyCode).toBe('CAD');
    expect(restored.speciesProfiles[0]?.maturityDays).toBe(180);

    const restoredSold = restored.animals.find((a) => a.id === 'a-sold');
    expect(restoredSold?.ownershipType).toBe('Owned');
    expect(restoredSold?.soldDateIso).toBe('2026-10-12');
    expect(restoredSold?.salePriceCents).toBe(12500);
    expect(restoredSold?.purchaseCostCents).toBe(4500);
    expect(restoredSold?.buyerName).toBe('Willow Creek Rabbitry');

    const restoredRef = restored.animals.find((a) => a.id === 'a-ref');
    expect(restoredRef?.ownershipType).toBe('Reference');
    expect(restoredRef?.culled).toBe(true);
    expect(restoredRef?.cullDateIso).toBe('2026-09-01');
    expect(restoredRef?.cullReason).toBe('Disposition / Pedigree only');
    expect(restoredRef?.deceasedDateIso).toBe('2026-11-01');
    expect(restoredRef?.deathCause).toBe('Age');

    expect(restored.breedings[0]?.serviceFeeCents).toBe(3500);
    expect(restored.breedings[0]?.serviceFeeDirection).toBe('earned');
    expect(restored.breedings[0]?.ultrasoundResult).toBe('Positive');
    expect(restored.breedings[0]?.ultrasoundFetalCount).toBe(6);
    expect(restored.breedings[0]?.ultrasoundProjectedDueIso).toBe('2026-10-10');

    expect(restored.careLogs[0]?.medicationName).toBe('Ivermectin');
    expect(restored.careLogs[0]?.dosage).toBe('0.2 mL');
    expect(restored.careLogs[0]?.administrationRoute).toBe('SubQ');
    expect(restored.careLogs[0]?.withdrawalDays).toBe(28);
    expect(restored.careLogs[0]?.withdrawalClearDateIso).toBe('2026-10-03');
    expect(restored.careLogs[0]?.bodyConditionScore).toBe(3.5);
    expect(restored.careLogs[0]?.famachaScore).toBe(2);
    expect(restored.careLogs[0]?.fecalEggCount).toBe(150);

    const merged = mergeBarnSnapshots(makeEmptySnapshot(), restored);
    expect(merged.snapshot.animals).toHaveLength(2);
    expect(merged.snapshot.breedings[0]?.serviceFeeCents).toBe(3500);
  });

  it('normalizes legacy v3/v4/v5 backups missing the new Phase 1 fields safely', () => {
    const legacyJson = JSON.stringify({
      version: 4,
      settings: { barnName: 'Legacy Barn', preferredUnit: 'lbs_oz' },
      animals: [
        {
          id: 'leg-1',
          name: 'Legacy Doe',
          species: 'Rabbit',
          sex: 'Female',
          status: 'Active',
        },
      ],
      breedings: [{ id: 'b-leg', species: 'Rabbit', status: 'Bred' }],
      careLogs: [{ id: 'c-leg', animalId: 'leg-1', type: 'Weight Check', weightGrams: 3200 }],
    });

    const parsed = parseBarnBackupJson(legacyJson, makeSettings());
    expect(parsed.settings.currencyCode).toBe('USD');
    expect(parsed.animals[0]?.ownershipType).toBe('Owned');
    expect(parsed.animals[0]?.culled).toBe(false);
    expect(parsed.animals[0]?.salePriceCents).toBe(0);
    expect(parsed.breedings[0]?.serviceFeeDirection).toBe('none');
    expect(parsed.breedings[0]?.ultrasoundResult).toBe('');
    expect(parsed.careLogs[0]?.withdrawalDays).toBe(0);
    expect(parsed.careLogs[0]?.medicationName).toBe('');
  });

  it('appends new ownership/cull/sale/mortality columns to CSV export and preserves PDF DTO + conflict merge fields', () => {
    const animal = makeAnimal('c1', {
      name: 'Show Sale Doe',
      tattoo: 'SS-1',
      status: 'Sold',
      archived: true,
      ownershipType: 'Outside',
      culled: true,
      cullDateIso: '2026-10-01',
      cullReason: 'Age',
      soldDateIso: '2026-10-05',
      salePriceCents: 9500,
      buyerName: 'Alex',
      deceasedDateIso: '',
      deathCause: '',
    });

    const snap = makeEmptySnapshot({
      settings: makeSettings({ currencyCode: 'USD' }),
      animals: [animal],
    });

    const csv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, snap.settings);
    const [headerLine, rowLine] = csv.split('\r\n');
    expect(headerLine.endsWith('Ownership,Culled,Cull_Date,Cull_Reason,Sold_Date,Sale_Price,Buyer,Deceased_Date,Death_Cause')).toBe(true);
    expect(rowLine).toContain('Outside,Yes,2026-10-01,Age,2026-10-05,$95.00,Alex,,');

    const pdf = buildPdfReadyBarnSnapshot(snap, 'Rabbit');
    expect(pdf.animals[0]?.ownershipType).toBe('Outside');
    expect(pdf.animals[0]?.culled).toBe(true);
    expect(pdf.animals[0]?.salePriceCents).toBe(9500);

    const incomingPartial = makeAnimal('c1', {
      name: 'Show Sale Doe Updated',
      weightGrams: 4200,
    });
    const resolved = resolveAnimalsWithConflictChoices([incomingPartial], snap, {});
    expect(resolved[0]?.ownershipType).toBe('Outside');
    expect(resolved[0]?.salePriceCents).toBe(9500);
    expect(resolved[0]?.buyerName).toBe('Alex');

    const baseUnculled = makeAnimal('c2', {
      name: 'Herd Buck',
      culled: false,
      salePriceCents: 0,
      purchaseCostCents: 0,
    });
    const incomingEnriched = makeAnimal('c2', {
      name: 'Herd Buck',
      culled: true,
      cullReason: 'Disposition',
      salePriceCents: 18500,
      purchaseCostCents: 4200,
    });
    const enrichedResolved = resolveAnimalsWithConflictChoices(
      [incomingEnriched],
      makeEmptySnapshot({ animals: [baseUnculled] }),
      {}
    );
    expect(enrichedResolved[0]?.culled).toBe(true);
    expect(enrichedResolved[0]?.cullReason).toBe('Disposition');
    expect(enrichedResolved[0]?.salePriceCents).toBe(18500);
    expect(enrichedResolved[0]?.purchaseCostCents).toBe(4200);
  });

  it('classifies non-adults and formats currencies/normalizers purely', () => {
    const rabbitProfile = { ...makeSpeciesProfile('Rabbit'), weanDaysAfterBirth: 42, maturityDays: 150 };
    expect(isAnimalNonAdult({ status: 'Junior', birthDateIso: '2024-01-01' }, rabbitProfile, '2026-11-16')).toBe(true);
    expect(isAnimalNonAdult({ status: 'Active', birthDateIso: '2026-09-01' }, rabbitProfile, '2026-11-16')).toBe(true);
    expect(isAnimalNonAdult({ status: 'Active', birthDateIso: '2025-01-01' }, rabbitProfile, '2026-11-16')).toBe(false);

    expect(formatCurrencyCents(12550, 'USD')).toBe('$125.50');
    expect(normalizeOwnershipType('pedigree reference')).toBe('Reference');
    expect(normalizeUltrasoundResult('pregnant')).toBe('Positive');
  });
});
```

## `src/core/__tests__/resilienceAndUniversalImport.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { analyzeBarnDataHealth, repairBarnDataHealth } from '../dataHealthCheck';
import {
  decodeTextBytes,
  normalizeFlexibleDateIso,
  parseDelimitedTable,
  parseFlexibleWeightToGrams,
} from '../importers/archiveAndCsvUtils';
import { resolveCsvColumnAssignments } from '../importers/csvColumnMapper';
import { buildStarterCsvTemplate } from '../importers/csvStarterTemplate';
import { UniversalPedigreeImporter } from '../importers/universalPedigreeImporter';
import { BarnDatabaseSnapshot } from '../models';
import { buildSpeciesHerdMap, calculateAnimalCoi } from '../pedigreeCalculator';
import { buildPdfReadyBarnSnapshot, parseBarnBackupJson } from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings } from './testFixtures';

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function encodeUtf16Le(str: string, withBom: boolean): Uint8Array {
  const offset = withBom ? 2 : 0;
  const buf = new Uint8Array(offset + str.length * 2);
  if (withBom) {
    buf[0] = 0xff;
    buf[1] = 0xfe;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[offset + i * 2] = code & 0xff;
    buf[offset + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

function encodeUtf16Be(str: string, withBom: boolean): Uint8Array {
  const offset = withBom ? 2 : 0;
  const buf = new Uint8Array(offset + str.length * 2);
  if (withBom) {
    buf[0] = 0xfe;
    buf[1] = 0xff;
  }
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[offset + i * 2] = (code >> 8) & 0xff;
    buf[offset + i * 2 + 1] = code & 0xff;
  }
  return buf;
}

describe('Pedigree cycle termination & structural data health repair', () => {
  it('terminates calculateAnimalCoi cleanly on circular ancestry without stack overflow', () => {
    const buck = makeAnimal('buck-loop', {
      name: 'Loop Buck',
      sex: 'Male',
      sireId: 'doe-loop',
      damId: 'buck-loop',
    });
    const doe = makeAnimal('doe-loop', {
      name: 'Loop Doe',
      sex: 'Female',
      sireId: 'buck-loop',
      damId: 'doe-loop',
    });
    const child = makeAnimal('child-loop', {
      name: 'Child',
      sex: 'Male',
      sireId: 'buck-loop',
      damId: 'doe-loop',
    });

    const herdMap = buildSpeciesHerdMap([buck, doe, child], 'Rabbit');
    const result = calculateAnimalCoi(child, herdMap);

    expect(Number.isFinite(result.coiPercent)).toBe(true);
    expect(result.coiPercent).toBeGreaterThanOrEqual(0);
    expect(result.coiPercent).toBeLessThanOrEqual(100);
    expect(result.knownAncestorsIn3Gen).toBeLessThanOrEqual(14);
    expect(result.knownAncestorsIn4Gen).toBeLessThanOrEqual(30);
  });

  it('analyzes and repairs malformed snapshot entries (null rows, NaN/negative numbers, dangling/cyclic parent links)', () => {
    const buck = makeAnimal('b1', {
      name: 'Cyclone',
      sex: 'Male',
      weightGrams: -250,
      legsCount: Number.NaN,
      sireId: 'b1', // self-cycle
      damId: 'missing-dam-999', // dangling link
    });
    const doe = makeAnimal('d1', {
      name: 'Clover',
      sex: 'Female',
      weightGrams: Number.POSITIVE_INFINITY,
      salePriceCents: -100,
      purchaseCostCents: Number.NaN,
    });

    const malformedSnapshot = {
      ...makeEmptySnapshot(),
      animals: [null as unknown as typeof buck, buck, doe],
      animalPhotos: [null as any],
    } as BarnDatabaseSnapshot;

    const before = analyzeBarnDataHealth(malformedSnapshot);
    expect(before.healthy).toBe(false);
    expect(before.issues.some((i) => i.code === 'CYCLIC_PARENT_LINK')).toBe(true);
    expect(before.issues.some((i) => i.code === 'DANGLING_PARENT_LINK')).toBe(true);
    expect(before.issues.some((i) => i.code === 'NEGATIVE_NUMERIC_FIELD')).toBe(true);

    const repair = repairBarnDataHealth(malformedSnapshot);
    expect(repair.reportAfter.healthy).toBe(true);
    expect(repair.repairsApplied.length).toBeGreaterThan(0);

    const fixedBuck = repair.nextSnapshot.animals.find((a) => a.id === 'b1')!;
    expect(fixedBuck.weightGrams).toBe(0);
    expect(fixedBuck.legsCount).toBe(0);
    expect(fixedBuck.sireId).toBe('');
    expect(fixedBuck.damId).toBe('');
    expect(fixedBuck.notes).toContain('missing-dam-999');

    const fixedDoe = repair.nextSnapshot.animals.find((a) => a.id === 'd1')!;
    expect(fixedDoe.weightGrams).toBe(0);
    expect(fixedDoe.salePriceCents).toBe(0);
    expect(fixedDoe.purchaseCostCents).toBe(0);
  });
});

describe('Backup JSON parser & PDF DTO snapshot resilience', () => {
  it('handles array settings, null records, NaN numbers, and __proto__ keys safely', () => {
    const fallbackSettings = makeSettings();
    const maliciousJson = JSON.stringify({
      settings: ['not', 'an', 'object'],
      animals: [
        null,
        {
          id: '__proto__',
          name: 'Prototype Attempt',
          species: 'Rabbit',
          weightGrams: 'not-a-number',
          legsCount: 'NaN',
          salePriceCents: -500,
        },
        {
          id: 'valid-1',
          name: 'Valid Rabbit',
          species: 'Rabbit',
          weightGrams: 3500,
          legsCount: 3,
        },
      ],
      speciesProfiles: [null],
      breedings: [null],
      cages: [null],
      tasks: [null],
      careLogs: [null],
      shows: [null],
    });

    const parsed = parseBarnBackupJson(maliciousJson, fallbackSettings);
    expect(parsed.settings.barnName).toBe(fallbackSettings.barnName);
    expect(parsed.animals).toHaveLength(2);

    const protoReplacement = parsed.animals.find((a) => a.name === 'Prototype Attempt')!;
    expect(protoReplacement.id).not.toBe('__proto__');
    expect(protoReplacement.weightGrams).toBe(0);
    expect(protoReplacement.legsCount).toBe(0);
    expect(protoReplacement.salePriceCents).toBe(0);

    const valid = parsed.animals.find((a) => a.id === 'valid-1')!;
    expect(valid.weightGrams).toBe(3500);
    expect(valid.legsCount).toBe(3);

    // Ensure buildPdfReadyBarnSnapshot runs cleanly with valid COI evaluation
    const report = buildPdfReadyBarnSnapshot(parsed, 'Rabbit');
    expect(report.totalAnimals).toBe(2);
    expect(report.animals[0].coiPercent).toMatch(/%$/);
  });
});

describe('Encoding decoder, delimited parser, flexible date & weight normalization', () => {
  it('decodes UTF-16LE (BOM), UTF-16BE (BOM), un-BOMmed UTF-16LE, and Windows-1252 bytes', () => {
    const sample = 'Name,Variety\nBriar,Café Red';
    expect(decodeTextBytes(encodeUtf16Le(sample, true))).toBe(sample);
    expect(decodeTextBytes(encodeUtf16Be(sample, true))).toBe(sample);
    expect(decodeTextBytes(encodeUtf16Le('Name,Sex\nBuck,Male', false))).toBe('Name,Sex\nBuck,Male');

    // Invalid UTF-8 byte sequence 0xE9 ('é' in Windows-1252) falls back to Windows-1252
    const win1252Bytes = new Uint8Array([
      ...encodeUtf8('Name\nCaf'),
      0xe9,
    ]);
    expect(decodeTextBytes(win1252Bytes)).toBe('Name\nCafé');
  });

  it('parses semicolon/pipe tables, title preamble rows, and unclosed quotes gracefully', () => {
    const semiWithPreamble = [
      'Evans Rabbit Export - Spring 2026',
      'Name;Tattoo;Sex;Breed',
      'Copper;CC-01;Buck;New Zealand',
      '"Willow; Jr.";CC-02;Doe;"Unclosed quote note',
    ].join('\n');

    const semiResult = parseDelimitedTable(semiWithPreamble);
    expect(semiResult.headers).toEqual(['Name', 'Tattoo', 'Sex', 'Breed']);
    expect(semiResult.rows).toHaveLength(2);
    expect(semiResult.rows[0].Name).toBe('Copper');
    expect(semiResult.rows[1].Name).toBe('Willow; Jr.');
    expect(semiResult.rows[1].Breed).toContain('Unclosed quote note');

    const pipeTable = 'ID|Name|Sire|Dam\nR1|Pip|Buck A|Doe B';
    const pipeResult = parseDelimitedTable(pipeTable);
    expect(pipeResult.headers).toEqual(['ID', 'Name', 'Sire', 'Dam']);
    expect(pipeResult.rows[0].Sire).toBe('Buck A');
  });

  it('normalizes Excel serial dates, European dot dates, historical 1895 dates, and rejects invalid calendar dates', () => {
    // 45123 -> 2023-07-16 in Excel serial epoch (1899-12-30)
    expect(normalizeFlexibleDateIso('45123')).toBe('2023-07-16');
    expect(normalizeFlexibleDateIso('14.02.2025')).toBe('2025-02-14');
    expect(normalizeFlexibleDateIso('05.11.2024')).toBe('2024-11-05');
    expect(normalizeFlexibleDateIso('1895-05-01')).toBe('1895-05-01');
    expect(normalizeFlexibleDateIso('2025-02-30')).toBe('');
    expect(normalizeFlexibleDateIso('2025-13-01')).toBe('');
  });

  it('parses flexible pound, pound-ounce, and metric weight formats', () => {
    expect(parseFlexibleWeightToGrams('8.5#')).toBe(Math.round(8.5 * 453.59237));
    expect(parseFlexibleWeightToGrams('4 lbs. 8 oz.')).toBe(Math.round(4.5 * 453.59237));
    expect(parseFlexibleWeightToGrams('3200 g')).toBe(3200);
    expect(parseFlexibleWeightToGrams('4.2 kg')).toBe(4200);
  });
});

describe('UniversalPedigreeImporter — heterogeneous system imports & graceful failure', () => {
  it('imports an Evans Software .HTM rowspan pedigree chart with Sire/Dam/Grandparent links', () => {
    const evansHtml = `
      <!doctype html>
      <html>
        <head><title>Pedigree - Meadowbrook Apollo (MA-10)</title></head>
        <body>
          <div>Breed &amp; Variety: New Zealand, Broken Red</div>
          <table>
            <tr>
              <td rowspan="4">Meadowbrook Apollo<br/>Ear: MA-10<br/>DOB: 2024-03-15<br/>Wt: 9 lb 4 oz</td>
              <td rowspan="2">Oak King<br/>Tattoo: OK-01<br/>Red</td>
              <td>Senior Sire<br/>Tattoo: SS-01</td>
            </tr>
            <tr>
              <td>Senior Dam<br/>Tattoo: SD-01</td>
            </tr>
            <tr>
              <td rowspan="2">Valley Queen<br/>Tattoo: VQ-02<br/>White</td>
              <td>Maternal Grandsire<br/>Tattoo: MS-01</td>
            </tr>
            <tr>
              <td>Maternal Granddam<br/>Tattoo: MD-01</td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const snapshot = makeEmptySnapshot();
    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'apollo-evans-pedigree.htm', bytes: encodeUtf8(evansHtml) }],
      snapshot,
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals.length).toBeGreaterThanOrEqual(7);
    expect(preview.parentLinksResolved).toBeGreaterThanOrEqual(6);

    const apollo = preview.animals.find((a) => a.tattoo === 'MA-10');
    const oak = preview.animals.find((a) => a.tattoo === 'OK-01');
    const queen = preview.animals.find((a) => a.tattoo === 'VQ-02');
    expect(apollo).toBeDefined();
    expect(apollo?.sireId).toBe(oak?.id);
    expect(apollo?.damId).toBe(queen?.id);
    expect(oak?.sireId).toBeDefined();
    expect(oak?.damId).toBeDefined();
  });

  it('imports a flat multi-generation CSV spreadsheet with Gen 1-3 ancestor columns', () => {
    const csv = [
      'Name,Ear Tag,Sex,Breed,DOB,Weight,Sire,Dam,PGS,PGD,MGS,MGD',
      'Alpine Comet,AC-09,Doe,French Angora,45123,7 lbs. 8 oz.,Thunder (TH-1),Dawn (DN-2),Storm (ST-3),Breeze (BR-4),Sun (SN-5),Moon (MN-6)',
    ].join('\n');

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'kintracs-export.csv', bytes: encodeUtf8(csv) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(7);
    expect(preview.parentLinksResolved).toBe(6);

    const comet = preview.animals.find((a) => a.tattoo === 'AC-09')!;
    const thunder = preview.animals.find((a) => a.tattoo === 'TH-1')!;
    const storm = preview.animals.find((a) => a.tattoo === 'ST-3')!;
    expect(comet.birthDateIso).toBe('2023-07-16');
    expect(comet.sex).toBe('Female');
    expect(comet.sireId).toBe(thunder.id);
    expect(thunder.sireId).toBe(storm.id);
  });

  it('imports a nested JSON { sire, dam } tree', () => {
    const nested = {
      name: 'Cedar Star',
      tattoo: 'CS-77',
      species: 'Goat',
      sex: 'Doe',
      dob: '04/12/2024',
      sire: {
        name: 'Cedar Buck',
        tattoo: 'CB-10',
        sire: { name: 'Grandpa Buck', tattoo: 'GB-01' },
      },
      dam: {
        name: 'Cedar Doe',
        tattoo: 'CD-20',
      },
    };

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'goat-tree.json', bytes: encodeUtf8(JSON.stringify(nested)) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Goat' }
    );

    expect(preview.animals).toHaveLength(4);
    expect(preview.parentLinksResolved).toBe(3);

    const star = preview.animals.find((a) => a.tattoo === 'CS-77')!;
    const cb = preview.animals.find((a) => a.tattoo === 'CB-10')!;
    const gb = preview.animals.find((a) => a.tattoo === 'GB-01')!;
    expect(star.species).toBe('Goat');
    expect(star.sireId).toBe(cb.id);
    expect(cb.sireId).toBe(gb.id);
  });

  it('produces graceful actionable warnings for unsupported binary files and corrupt JSON/HTML without throwing', () => {
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    const xlsxMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const brokenJson = encodeUtf8('{ "animals": [ { "name": "truncated" ');

    const preview = UniversalPedigreeImporter.parse(
      [
        { fileName: 'pedigree.pdf', bytes: pdfMagic },
        { fileName: 'herd.xlsx', bytes: xlsxMagic },
        { fileName: 'corrupt.json', bytes: brokenJson },
      ],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(0);
    expect(preview.warnings.some((w) => w.includes('pedigree.pdf'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('herd.xlsx'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('corrupt.json'))).toBe(true);
  });

  it('generates a Starter CSV Template with standard headers that round-trips cleanly with zero unresolved links', () => {
    const template = buildStarterCsvTemplate('Rabbit');
    expect(template.headers.slice(0, 11)).toEqual([
      'Name',
      'Ear_ID',
      'Sex',
      'DOB',
      'Breed',
      'Variety',
      'Weight',
      'Sire_ID',
      'Dam_ID',
      'Reg_No',
      'GC_No',
    ]);
    expect(template.content.startsWith('\uFEFF')).toBe(true);

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: template.filename, bytes: encodeUtf8(template.content) }],
      makeEmptySnapshot(),
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(3);
    expect(preview.unresolvedParentLinks).toHaveLength(0);
    expect(preview.parentLinksResolved).toBe(2);
    expect(preview.csvTables).toHaveLength(1);
    expect(preview.csvTables![0].columns.every((c) => c.assignedField !== '')).toBe(true);

    const sire = preview.animals.find((a) => a.tattoo === 'OR-101')!;
    const dam = preview.animals.find((a) => a.tattoo === 'OR-102')!;
    const offspring = preview.animals.find((a) => a.tattoo === 'OR-205')!;
    expect(offspring.sireId).toBe(sire.id);
    expect(offspring.damId).toBe(dam.id);
    expect(sire.registrationNumber).toBe('REG-1042');
    expect(sire.grandChampionNumber).toBe('GC-881');
  });

  it('supports interactive CSV column mapping overrides and __ignore__ exclusions with sample previews', () => {
    const csv = [
      'Barn_Call_Name,Custom_Ear,Gender_Code,Papa_Ref,Mama_Ref,Internal_Row_Num',
      'Maple Star,MS-11,Doe,MS-01,MS-02,999',
      'Maple King,MS-01,Buck,,,1000',
    ].join('\n');

    const { headers, rows } = parseDelimitedTable(csv);
    const initial = resolveCsvColumnAssignments(headers, rows, undefined, 'custom.csv');
    expect(initial.unmappedColumns).toContain('Barn_Call_Name');
    expect(initial.unmappedColumns).toContain('Custom_Ear');
    expect(initial.unmappedColumns).toContain('Papa_Ref');

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'custom.csv', bytes: encodeUtf8(csv) }],
      makeEmptySnapshot(),
      {
        fallbackSpeciesName: 'Rabbit',
        csvColumnMapping: {
          'custom.csv::Barn_Call_Name': 'name',
          'custom.csv::Custom_Ear': 'tattoo',
          'custom.csv::Gender_Code': 'sex',
          'custom.csv::Papa_Ref': 'sire',
          'custom.csv::Mama_Ref': 'dam',
          'custom.csv::Internal_Row_Num': '__ignore__',
        },
      }
    );

    const star = preview.animals.find((a) => a.tattoo === 'MS-11')!;
    const king = preview.animals.find((a) => a.tattoo === 'MS-01')!;
    expect(star).toBeDefined();
    expect(star.name).toBe('Maple Star');
    expect(star.sex).toBe('Female');
    expect(star.sireId).toBe(king.id); // Resolved out-of-order to row 2!

    // Mama_Ref 'MS-02' was not in CSV or barn -> flagged in unresolvedParentLinks
    expect(preview.unresolvedParentLinks).toHaveLength(1);
    expect(preview.unresolvedParentLinks![0]).toMatchObject({
      rowNumber: 1,
      childName: 'Maple Star',
      role: 'dam',
      rawReference: 'MS-02',
      placeholderCreated: true,
    });
  });

  it('resolves existing barn parents cleanly and leaves unresolved Sire/Dam unlinked when placeholder creation is disabled', () => {
    const existingBuck = makeAnimal('existing-buck-1', {
      name: 'Barn Champion',
      tattoo: 'BC-10',
      sex: 'Male',
      species: 'Rabbit',
    });
    const snapshot = {
      ...makeEmptySnapshot(),
      animals: [existingBuck],
    };

    const csv = [
      'Name,Ear_ID,Sex,Sire_ID,Dam_ID',
      'Clover Kit,CK-77,Doe,BC-10,MISSING-DOE-9',
    ].join('\n');

    const preview = UniversalPedigreeImporter.parse(
      [{ fileName: 'kits.csv', bytes: encodeUtf8(csv) }],
      snapshot,
      {
        fallbackSpeciesName: 'Rabbit',
        createPlaceholderAncestorsForUnlinked: false,
      }
    );

    expect(preview.animals).toHaveLength(1);
    const kit = preview.animals[0];
    expect(kit.sireId).toBe(existingBuck.id);
    expect(kit.damId).toBe('');
    expect(preview.unresolvedParentLinks).toHaveLength(1);
    expect(preview.unresolvedParentLinks![0]).toMatchObject({
      role: 'dam',
      rawReference: 'MISSING-DOE-9',
      placeholderCreated: false,
    });
  });
});
```

## `src/core/__tests__/sampleData.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import {
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesDueTasksAlert,
} from '../barnAlerts';
import { inferHiddenAlleles } from '../geneticsEngine';
import { isAnimalArchived, PREDEFINED_SPECIES_PRESETS, todayDateIso } from '../models';
import { buildPedigreeSlots, buildSpeciesHerdMap, calculateAnimalCoi } from '../pedigreeCalculator';
import {
  buildFullPredefinedSampleSnapshot,
  buildSampleDataForSpecies,
  countAllSpeciesRecords,
  isSampleTestingId,
  purgeSpeciesTestingDataPure,
} from '../sampleData';

describe('sampleData 6-generation pedigree seeding', () => {
  it('gives about half of active animals a full 6-gen pedigree across all predefined species using inactive ancestors', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const herdById = buildSpeciesHerdMap(snapshot.animals, preset.name);
      const speciesAnimals = Array.from(herdById.values());
      const activeAnimals = speciesAnimals.filter((a) => !isAnimalArchived(a));
      const inactiveAnimals = speciesAnimals.filter((a) => isAnimalArchived(a));

      expect(activeAnimals.length).toBeGreaterThanOrEqual(5);
      expect(inactiveAnimals.length).toBeGreaterThan(100);

      const fullSixGenActive = activeAnimals.filter((a) => {
        const slots = buildPedigreeSlots(a, herdById, 6);
        const filledAncestors = slots.filter((s) => s.generation > 0 && s.animal !== null).length;
        return filledAncestors === 126;
      });

      const ratio = fullSixGenActive.length / activeAnimals.length;
      expect(ratio).toBeGreaterThanOrEqual(0.5);
      expect(ratio).toBeLessThanOrEqual(0.6);

      // Every generated animal must carry a seed- ID so Delete Testing Data removes it cleanly
      expect(speciesAnimals.every((a) => isSampleTestingId(a.id))).toBe(true);
    }
  });

  it('keeps Rabbit 12.5% COI and produces zero genetic conflicts on seeded animals', () => {
    const bundle = buildSampleDataForSpecies('Rabbit');
    expect(bundle).not.toBeNull();
    const herdById = buildSpeciesHerdMap(bundle!.animals, 'Rabbit');
    const jrFemale = bundle!.animals.find((a) => a.id === 'seed-rabbit-jr-female')!;
    const coi = calculateAnimalCoi(jrFemale, herdById);
    expect(coi.coiPercent).toBeCloseTo(12.5, 2);

    for (const animal of bundle!.animals) {
      const genetics = inferHiddenAlleles(animal, herdById, bundle!.animals);
      expect(genetics.conflicts).toEqual([]);
    }
  });

  it('supports custom species sample data with full 6-gen pedigrees and clean testing-data purge', () => {
    const bundle = buildSampleDataForSpecies('Quail');
    expect(bundle).not.toBeNull();
    const herdById = buildSpeciesHerdMap(bundle!.animals, 'Quail');
    const active = bundle!.animals.filter((a) => !isAnimalArchived(a));
    const fullCount = active.filter((a) => {
      const slots = buildPedigreeSlots(a, herdById, 6);
      return slots.filter((s) => s.generation > 0 && s.animal !== null).length === 126;
    }).length;
    expect(fullCount).toBe(3);
    expect(active.length).toBe(6);

    const base = buildFullPredefinedSampleSnapshot();
    const purged = purgeSpeciesTestingDataPure(base, 'Rabbit');
    expect(countAllSpeciesRecords(purged.nextSnapshot, 'Rabbit')).toBe(0);
    expect(countAllSpeciesRecords(purged.nextSnapshot, 'Goat')).toBeGreaterThan(0);
  });

  it('seeds a dynamic overdue task and due-soon pregnancy per species so restoring sample data always triggers alerts', () => {
    const today = todayDateIso();
    const snapshot = buildFullPredefinedSampleSnapshot(undefined, today);

    for (const profile of snapshot.speciesProfiles) {
      const dueAlert = evaluateSpeciesDueTasksAlert(snapshot.tasks, profile.name, {
        todayIso: today,
      });
      expect(dueAlert.shouldShow).toBe(true);
      expect(dueAlert.overdueCount).toBeGreaterThanOrEqual(1);
      expect(dueAlert.tasks.every((t) => isSampleTestingId(t.id))).toBe(true);

      const arrivalAlert = evaluateSpeciesArrivingBabiesAlert(snapshot.breedings, profile, {
        todayIso: today,
      });
      expect(arrivalAlert.shouldShow).toBe(true);
      expect(arrivalAlert.items.length).toBeGreaterThanOrEqual(1);
      expect(isSampleTestingId(arrivalAlert.items[0].breeding.id)).toBe(true);
    }

    // Simulate restoring sample data years later when old dates would otherwise have become stale/past
    const futureRestoreDate = '2029-07-04';
    const restoredLater = buildFullPredefinedSampleSnapshot(undefined, futureRestoreDate);
    for (const profile of restoredLater.speciesProfiles) {
      const dueAlert = evaluateSpeciesDueTasksAlert(restoredLater.tasks, profile.name, {
        todayIso: futureRestoreDate,
      });
      expect(dueAlert.shouldShow).toBe(true);
      expect(dueAlert.overdueCount).toBeGreaterThanOrEqual(1);

      const arrivalAlert = evaluateSpeciesArrivingBabiesAlert(restoredLater.breedings, profile, {
        todayIso: futureRestoreDate,
      });
      expect(arrivalAlert.shouldShow).toBe(true);
      expect(arrivalAlert.items[0].daysUntilDue).toBeGreaterThanOrEqual(0);
      expect(arrivalAlert.items[0].daysUntilDue).toBeLessThanOrEqual(arrivalAlert.windowDays);
    }

    // Custom species sample data also carries both dynamic alerts
    const customBundle = buildSampleDataForSpecies('Quail', undefined, futureRestoreDate)!;
    const customDue = evaluateSpeciesDueTasksAlert(customBundle.tasks, 'Quail', {
      todayIso: futureRestoreDate,
    });
    const customArrival = evaluateSpeciesArrivingBabiesAlert(
      customBundle.breedings,
      customBundle.speciesProfile,
      { todayIso: futureRestoreDate }
    );
    expect(customDue.shouldShow).toBe(true);
    expect(customDue.overdueCount).toBeGreaterThanOrEqual(1);
    expect(customArrival.shouldShow).toBe(true);
    expect(customArrival.items.length).toBeGreaterThanOrEqual(1);
  });
});
```

<!-- END OF PART 12 OF 16 (42 files) -->
