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
