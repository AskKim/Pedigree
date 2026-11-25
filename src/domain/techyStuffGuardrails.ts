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

export type DeveloperConsoleTabId =
  | 'storage'
  | 'runtime'
  | 'logs'
  | 'maintenance'
  | 'all';

export interface DeveloperConsoleTabDefinition {
  id: DeveloperConsoleTabId;
  label: string;
  shortDescription: string;
}

export const DEVELOPER_CONSOLE_TABS: readonly DeveloperConsoleTabDefinition[] = [
  {
    id: 'storage',
    label: 'Storage & OPFS',
    shortDescription: 'Quota pre-flight, OPFS namespaces, Vault, and DB footprint',
  },
  {
    id: 'runtime',
    label: 'Runtime & Sync',
    shortDescription: 'Connectivity, clock skew, release gate, browser APIs & outbox',
  },
  {
    id: 'logs',
    label: 'Logs & Support',
    shortDescription: 'Diagnostic ring buffer, telemetry triggers & support ZIP/TXT',
  },
  {
    id: 'maintenance',
    label: 'Maintenance & Resets',
    shortDescription: 'Photo pruner, DB self-repair, cache recovery & guarded resets',
  },
] as const;

export const DEVELOPER_CONSOLE_SUBUNIT_IDS = [
  'telemetry',
  'tier_hierarchy',
  'storage_protection',
  'opfs_inspector',
  'collection_footprint',
  'connectivity_clock',
  'update_release_gate',
  'browser_matrix',
  'handles_freeze',
  'sync_outbox',
  'diagnostics_logs',
  'manual_trigger',
  'testing_fixtures',
  'diagnostics_maintenance',
  'destructive_lab',
] as const;

export type DeveloperConsoleSubunitId = (typeof DEVELOPER_CONSOLE_SUBUNIT_IDS)[number];

export function createDefaultSubunitOpenMap(
  expanded = false
): Record<DeveloperConsoleSubunitId, boolean> {
  return {
    telemetry: expanded,
    tier_hierarchy: expanded,
    storage_protection: expanded,
    opfs_inspector: expanded,
    collection_footprint: expanded,
    connectivity_clock: expanded,
    update_release_gate: expanded,
    browser_matrix: expanded,
    handles_freeze: expanded,
    sync_outbox: expanded,
    diagnostics_logs: expanded,
    manual_trigger: expanded,
    testing_fixtures: expanded,
    diagnostics_maintenance: expanded,
    destructive_lab: expanded,
  };
}

export function normalizeDeveloperConsoleTab(value: unknown): DeveloperConsoleTabId {
  if (
    value === 'storage' ||
    value === 'runtime' ||
    value === 'logs' ||
    value === 'maintenance' ||
    value === 'all'
  ) {
    return value;
  }
  return 'storage';
}

export interface SnapshotCollectionFootprintRow {
  key: string;
  label: string;
  recordCount: number;
  estimatedBytes: number;
  sharePercent: number;
}

export interface SnapshotCollectionFootprintReport {
  totalRecords: number;
  totalEstimatedBytes: number;
  speciesCount: number;
  photoSummary: {
    totalPhotos: number;
    fullResStoredBytes: number;
    thumbnailEstimatedBytes: number;
    photosWithFullResCount: number;
  };
  collections: SnapshotCollectionFootprintRow[];
}

export interface MinimalSnapshotForFootprint {
  speciesProfiles?: ReadonlyArray<unknown>;
  animals?: ReadonlyArray<unknown>;
  animalPhotos?: ReadonlyArray<{
    storedBytes?: number;
    dataUrl?: string;
    thumbnailDataUrl?: string;
  }>;
  cages?: ReadonlyArray<unknown>;
  breedings?: ReadonlyArray<unknown>;
  tasks?: ReadonlyArray<unknown>;
  careLogs?: ReadonlyArray<unknown>;
  shows?: ReadonlyArray<unknown>;
  feedBatches?: ReadonlyArray<{
    tagPhotoDataUrl?: string;
    tagPhotoThumbnailDataUrl?: string;
  }>;
  feedAllocations?: ReadonlyArray<unknown>;
  ledgerEntries?: ReadonlyArray<{
    receiptPhotoDataUrl?: string;
    receiptPhotoThumbnailDataUrl?: string;
  }>;
  processingLogs?: ReadonlyArray<unknown>;
  youthProjectBooks?: ReadonlyArray<{ feedLogs?: ReadonlyArray<unknown> }>;
  clientContacts?: ReadonlyArray<unknown>;
  waitlistEntries?: ReadonlyArray<unknown>;
  animalReservations?: ReadonlyArray<unknown>;
  woolHarvests?: ReadonlyArray<unknown>;
  mileageLogs?: ReadonlyArray<unknown>;
  journalEntries?: ReadonlyArray<unknown>;
  judgeClubs?: ReadonlyArray<unknown>;
  judgeAssignments?: ReadonlyArray<unknown>;
  judgeExpenses?: ReadonlyArray<unknown>;
}

/**
 * Pure TypeScript estimator computing per-collection record counts and byte footprint
 * across all persisted BarnDatabaseSnapshot tables so developers can spot bloat immediately.
 */
export function computeSnapshotCollectionFootprint(
  snapshot: MinimalSnapshotForFootprint | null | undefined
): SnapshotCollectionFootprintReport {
  if (!snapshot) {
    return {
      totalRecords: 0,
      totalEstimatedBytes: 0,
      speciesCount: 0,
      photoSummary: {
        totalPhotos: 0,
        fullResStoredBytes: 0,
        thumbnailEstimatedBytes: 0,
        photosWithFullResCount: 0,
      },
      collections: [],
    };
  }

  const photos = snapshot.animalPhotos ?? [];
  let fullResStoredBytes = 0;
  let thumbnailEstimatedBytes = 0;
  let photosWithFullResCount = 0;

  for (const p of photos) {
    const rawBytes = Number(p.storedBytes) > 0
      ? Number(p.storedBytes)
      : p.dataUrl
      ? Math.round(p.dataUrl.length * 0.73)
      : 0;
    if (rawBytes > 0) {
      photosWithFullResCount += 1;
    }
    fullResStoredBytes += rawBytes;
    thumbnailEstimatedBytes += p.thumbnailDataUrl ? Math.round(p.thumbnailDataUrl.length * 0.73) : 0;
  }

  const photoCollectionBytes = photos.length * 220 + fullResStoredBytes + thumbnailEstimatedBytes;

  let feedBatchBytes = 0;
  for (const fb of snapshot.feedBatches ?? []) {
    feedBatchBytes +=
      360 +
      (fb.tagPhotoDataUrl?.length || 0) +
      (fb.tagPhotoThumbnailDataUrl?.length || 0);
  }

  let ledgerBytes = 0;
  for (const le of snapshot.ledgerEntries ?? []) {
    ledgerBytes +=
      320 +
      (le.receiptPhotoDataUrl?.length || 0) +
      (le.receiptPhotoThumbnailDataUrl?.length || 0);
  }

  let youthBytes = 0;
  for (const yp of snapshot.youthProjectBooks ?? []) {
    youthBytes += 540 + (yp.feedLogs?.length || 0) * 140;
  }

  const rawRows: Array<Omit<SnapshotCollectionFootprintRow, 'sharePercent'>> = [
    {
      key: 'animals',
      label: 'Animals & Pedigrees',
      recordCount: snapshot.animals?.length ?? 0,
      estimatedBytes: (snapshot.animals?.length ?? 0) * 650,
    },
    {
      key: 'animalPhotos',
      label: 'Animal Photos (Full + Thumbs)',
      recordCount: photos.length,
      estimatedBytes: photoCollectionBytes,
    },
    {
      key: 'breedings',
      label: 'Breedings & Litters',
      recordCount: snapshot.breedings?.length ?? 0,
      estimatedBytes: (snapshot.breedings?.length ?? 0) * 380,
    },
    {
      key: 'careLogs',
      label: 'Health & Weight Care Logs',
      recordCount: snapshot.careLogs?.length ?? 0,
      estimatedBytes: (snapshot.careLogs?.length ?? 0) * 300,
    },
    {
      key: 'tasks',
      label: 'Barn Tasks & Reminders',
      recordCount: snapshot.tasks?.length ?? 0,
      estimatedBytes: (snapshot.tasks?.length ?? 0) * 260,
    },
    {
      key: 'cages',
      label: 'Cages & Pens',
      recordCount: snapshot.cages?.length ?? 0,
      estimatedBytes: (snapshot.cages?.length ?? 0) * 240,
    },
    {
      key: 'shows',
      label: 'Show Events & Placements',
      recordCount: snapshot.shows?.length ?? 0,
      estimatedBytes: (snapshot.shows?.length ?? 0) * 340,
    },
    {
      key: 'feedBatches',
      label: 'Feed Lots & Tag Scans',
      recordCount: snapshot.feedBatches?.length ?? 0,
      estimatedBytes: feedBatchBytes,
    },
    {
      key: 'feedAllocations',
      label: 'Feed Allocations',
      recordCount: snapshot.feedAllocations?.length ?? 0,
      estimatedBytes: (snapshot.feedAllocations?.length ?? 0) * 220,
    },
    {
      key: 'ledgerEntries',
      label: 'Economics Ledger & Receipts',
      recordCount: snapshot.ledgerEntries?.length ?? 0,
      estimatedBytes: ledgerBytes,
    },
    {
      key: 'processingLogs',
      label: 'Meat & Processing Logs',
      recordCount: snapshot.processingLogs?.length ?? 0,
      estimatedBytes: (snapshot.processingLogs?.length ?? 0) * 320,
    },
    {
      key: 'woolHarvests',
      label: 'Wool / Fiber Harvests',
      recordCount: snapshot.woolHarvests?.length ?? 0,
      estimatedBytes: (snapshot.woolHarvests?.length ?? 0) * 320,
    },
    {
      key: 'youthProjectBooks',
      label: '4-H / FFA Project Books',
      recordCount: snapshot.youthProjectBooks?.length ?? 0,
      estimatedBytes: youthBytes,
    },
    {
      key: 'clientContacts',
      label: 'Client CRM Contacts',
      recordCount: snapshot.clientContacts?.length ?? 0,
      estimatedBytes: (snapshot.clientContacts?.length ?? 0) * 320,
    },
    {
      key: 'waitlistEntries',
      label: 'Buyer Waitlists',
      recordCount: snapshot.waitlistEntries?.length ?? 0,
      estimatedBytes: (snapshot.waitlistEntries?.length ?? 0) * 260,
    },
    {
      key: 'animalReservations',
      label: 'Animal Reservations & Holds',
      recordCount: snapshot.animalReservations?.length ?? 0,
      estimatedBytes: (snapshot.animalReservations?.length ?? 0) * 280,
    },
    {
      key: 'mileageLogs',
      label: 'Mileage & Tax Logs',
      recordCount: snapshot.mileageLogs?.length ?? 0,
      estimatedBytes: (snapshot.mileageLogs?.length ?? 0) * 260,
    },
    {
      key: 'journalEntries',
      label: 'Personal Barn Journal',
      recordCount: snapshot.journalEntries?.length ?? 0,
      estimatedBytes: (snapshot.journalEntries?.length ?? 0) * 480,
    },
    {
      key: 'judgeRecords',
      label: 'Judge Clubs, Shows & Expenses',
      recordCount:
        (snapshot.judgeClubs?.length ?? 0) +
        (snapshot.judgeAssignments?.length ?? 0) +
        (snapshot.judgeExpenses?.length ?? 0),
      estimatedBytes:
        (snapshot.judgeClubs?.length ?? 0) * 260 +
        (snapshot.judgeAssignments?.length ?? 0) * 360 +
        (snapshot.judgeExpenses?.length ?? 0) * 220,
    },
    {
      key: 'speciesProfiles',
      label: 'Species Configurations',
      recordCount: snapshot.speciesProfiles?.length ?? 0,
      estimatedBytes: (snapshot.speciesProfiles?.length ?? 0) * 640,
    },
  ];

  const totalRecords = rawRows.reduce((acc, r) => acc + r.recordCount, 0);
  const totalEstimatedBytes = rawRows.reduce((acc, r) => acc + r.estimatedBytes, 0);

  const collections: SnapshotCollectionFootprintRow[] = rawRows
    .map((r) => ({
      ...r,
      sharePercent:
        totalEstimatedBytes > 0
          ? Math.round((r.estimatedBytes / totalEstimatedBytes) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.estimatedBytes - a.estimatedBytes || b.recordCount - a.recordCount);

  return {
    totalRecords,
    totalEstimatedBytes,
    speciesCount: snapshot.speciesProfiles?.length ?? 0,
    photoSummary: {
      totalPhotos: photos.length,
      fullResStoredBytes,
      thumbnailEstimatedBytes,
      photosWithFullResCount,
    },
    collections,
  };
}
