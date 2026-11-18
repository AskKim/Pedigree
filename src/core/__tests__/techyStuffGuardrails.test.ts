/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  DESTRUCTIVE_CONFIRM_PHRASES,
  evaluateStorageQuotaForOperation,
  isDestructiveActionConfirmationValid,
  validateDiagnosticTriggerInput,
  validateLogRetentionDaysOverride,
  validatePwaUpdatePolicyOverride,
  validateSupportRecipientEmail,
} from '../techyStuffGuardrails';

describe('techyStuffGuardrails — quota preflight, strict sanitization & destructive safeguards', () => {
  it('allows healthy storage budgets, warns above 80%, and blocks critical quota writes', () => {
    const healthy = evaluateStorageQuotaForOperation({
      operation: 'support_bundle_zip',
      operationLabel: 'Support ZIP Export',
      estimatedRequiredBytes: 1_500_000,
      opfsSupported: true,
      storageStatus: {
        supported: true,
        persisted: true,
        usageBytes: 10_000_000,
        quotaBytes: 200_000_000,
        percentUsed: 5,
      },
    });
    expect(healthy.level).toBe('ok');
    expect(healthy.allowed).toBe(true);
    expect(healthy.requiresConfirmation).toBe(false);

    const lowHeadroom = evaluateStorageQuotaForOperation({
      operation: 'photo_reoptimize',
      operationLabel: 'Re-optimize Photos',
      estimatedRequiredBytes: 2_000_000,
      opfsSupported: true,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 84_000_000,
        quotaBytes: 100_000_000,
        percentUsed: 84,
      },
    });
    expect(lowHeadroom.level).toBe('warn');
    expect(lowHeadroom.allowed).toBe(true);
    expect(lowHeadroom.requiresConfirmation).toBe(true);

    const critical = evaluateStorageQuotaForOperation({
      operation: 'support_bundle_zip',
      operationLabel: 'Support ZIP Export',
      estimatedRequiredBytes: 4_000_000,
      opfsSupported: false,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 97_000_000,
        quotaBytes: 100_000_000,
        percentUsed: 97,
      },
    });
    expect(critical.level).toBe('blocked');
    expect(critical.allowed).toBe(false);
    expect(critical.requiresConfirmation).toBe(false);
  });

  it('never blocks space-freeing OPFS /tmp or cache purges even at 99% usage', () => {
    const tmpPurge = evaluateStorageQuotaForOperation({
      operation: 'opfs_tmp_purge',
      operationLabel: 'Purge OPFS /tmp',
      estimatedRequiredBytes: 0,
      opfsSupported: true,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 99_500_000,
        quotaBytes: 100_000_000,
        percentUsed: 99.5,
      },
    });
    expect(tmpPurge.allowed).toBe(true);
    expect(tmpPurge.level).toBe('ok');

    const cachePurge = evaluateStorageQuotaForOperation({
      operation: 'cache_purge_rebuild',
      operationLabel: 'Purge Stale Caches',
      estimatedRequiredBytes: 0,
      opfsSupported: false,
      storageStatus: {
        supported: true,
        persisted: false,
        usageBytes: 99_500_000,
        quotaBytes: 100_000_000,
        percentUsed: 99.5,
      },
    });
    expect(cachePurge.allowed).toBe(true);
  });

  it('handles missing StorageManager quota telemetry gracefully with OPFS hint', () => {
    const fallback = evaluateStorageQuotaForOperation({
      operation: 'pre_upgrade_backup',
      operationLabel: 'Pre-Upgrade Backup',
      estimatedRequiredBytes: 512_000,
      opfsSupported: false,
      requiresOpfsPreferred: true,
      storageStatus: null,
    });
    expect(fallback.allowed).toBe(true);
    expect(fallback.level).toBe('warn');
    expect(fallback.storageApiSupported).toBe(false);
  });

  it('validates and sanitizes manual diagnostic trigger payloads strictly', () => {
    const valid = validateDiagnosticTriggerInput({
      level: 'WARN',
      category: 'memory',
      message: '  Heap\nprobe\tcheck\u0000  ',
      note: 'Manual field note\u0007',
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.value.level).toBe('warn');
      expect(valid.value.category).toBe('memory');
      expect(valid.value.message).toBe('Heap probe check');
      expect(valid.value.note).toBe('Manual field note');
    }

    expect(
      validateDiagnosticTriggerInput({ level: 'fatal', category: 'storage', message: 'abc' }).ok
    ).toBe(false);
    expect(
      validateDiagnosticTriggerInput({ level: 'info', category: 'network', message: 'abc' }).ok
    ).toBe(false);
    expect(
      validateDiagnosticTriggerInput({ level: 'info', category: 'lifecycle', message: 'ab' }).ok
    ).toBe(false);
    expect(validateDiagnosticTriggerInput(null).ok).toBe(false);
  });

  it('validates log retention days, PWA update policies, and support email inputs', () => {
    expect(validateLogRetentionDaysOverride(7)).toEqual({ ok: true, days: 7 });
    expect(validateLogRetentionDaysOverride('14')).toEqual({ ok: true, days: 14 });
    expect(validateLogRetentionDaysOverride(30).ok).toBe(false);

    expect(validatePwaUpdatePolicyOverride('pinned')).toEqual({ ok: true, policy: 'pinned' });
    expect(validatePwaUpdatePolicyOverride('force').ok).toBe(false);

    expect(validateSupportRecipientEmail('')).toEqual({ ok: true, email: '' });
    expect(validateSupportRecipientEmail('  help@barnproject.org  ')).toEqual({
      ok: true,
      email: 'help@barnproject.org',
    });
    expect(validateSupportRecipientEmail('bad\nheader@evil.com').ok).toBe(false);
    expect(validateSupportRecipientEmail('not-an-email').ok).toBe(false);
  });

  it('requires exact confirmation phrases (case/whitespace normalized) for destructive developer actions', () => {
    expect(
      isDestructiveActionConfirmationValid(
        'factory_restore',
        `  ${DESTRUCTIVE_CONFIRM_PHRASES.factory_restore.toLowerCase()}  `
      )
    ).toBe(true);
    expect(isDestructiveActionConfirmationValid('factory_restore', 'FACTORY')).toBe(false);
    expect(isDestructiveActionConfirmationValid('wipe_all_animals', 'WIPE RECORDS')).toBe(true);
    expect(isDestructiveActionConfirmationValid('rebuild_local_db', 'REBUILD DB')).toBe(true);
    expect(isDestructiveActionConfirmationValid('clear_sync_outbox', 'RESET SYNC')).toBe(true);
    expect(isDestructiveActionConfirmationValid('purge_opfs_tmp', 'PURGE TMP')).toBe(true);
    expect(isDestructiveActionConfirmationValid('clear_diagnostic_logs', 'CLEAR LOGS')).toBe(true);
  });
});
