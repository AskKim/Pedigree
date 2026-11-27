/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  buildCloudRollingBackupEnvelope,
  buildRollingCloudBackupFileName,
  classifyCloudHttpResponse,
  CLOUD_SYNC_PROVIDER_DESCRIPTORS,
  createDefaultCloudQuotaCircuitBreaker,
  DEFAULT_CLOUD_SYNC_SETTINGS,
  dismissCloudCircuitBreakerWarning,
  NORMAL_DELTA_CHUNK_MAX_OPS,
  normalizeCloudSyncPersistedState,
  normalizeCloudSyncSettings,
  planIncrementalCloudDeltaChunks,
  resetCloudQuotaCircuitBreaker,
  selectRollingCloudBackupsToPrune,
  shouldRunAutomatedCloudSync,
  TIGHT_STORAGE_DELTA_CHUNK_MAX_BYTES,
  TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS,
  tripCloudQuotaCircuitBreaker,
} from '../cloudAppFolderSync';
import { createOutboxOperation } from '../syncOutbox';
import { makeAnimal, makeEmptySnapshot } from './testFixtures';

describe('cloudAppFolderSync — pure incremental chunking & 403/507 circuit breaker', () => {
  it('defaults to strictly opt-in disabled settings and clamps thresholds safely', () => {
    expect(DEFAULT_CLOUD_SYNC_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_CLOUD_SYNC_SETTINGS.autoBackgroundSync).toBe(false);
    expect(CLOUD_SYNC_PROVIDER_DESCRIPTORS.google_drive.folderName).toBe('appDataFolder');
    expect(CLOUD_SYNC_PROVIDER_DESCRIPTORS.onedrive.folderName).toBe('special/approot');

    const normalized = normalizeCloudSyncSettings({
      enabled: true,
      provider: 'onedrive',
      autoBackgroundSync: true,
      rollingBackupRetentionCount: 999,
      storageTightThresholdPercent: 12,
      customOAuthClientId: '  client-123\n<script>  ',
    });
    expect(normalized.enabled).toBe(true);
    expect(normalized.provider).toBe('onedrive');
    expect(normalized.rollingBackupRetentionCount).toBe(10);
    expect(normalized.storageTightThresholdPercent).toBe(50);
    expect(normalized.customOAuthClientId).not.toContain('\n');

    const state = normalizeCloudSyncPersistedState({
      version: 1,
      uploadedOpIdsByProvider: {
        google_drive: ['op-1', 'op-1', 'op-2', ''],
      },
    });
    expect(state.uploadedOpIdsByProvider.google_drive).toEqual(['op-1', 'op-2']);
    expect(state.uploadedOpIdsByProvider.onedrive).toEqual([]);
  });

  it('plans normal vs tight-storage incremental delta chunks and skips already uploaded op_ids', () => {
    const ops = Array.from({ length: 65 }, (_, i) =>
      createOutboxOperation({
        entityType: 'animal',
        entityUuid: `animal-${i + 1}`,
        deviceId: 'dev-alpha',
        logicalCounter: i + 1,
        fieldName: 'notes',
        newValue: `Note ${i + 1} ${'x'.repeat(240)}`,
        timestamp: `2026-11-23T12:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(
          i % 60
        ).padStart(2, '0')}.000Z`,
      })
    );

    const alreadyUploaded = ops.slice(0, 5).map((o) => o.op_id);

    const normalPlan = planIncrementalCloudDeltaChunks({
      deviceId: 'dev-alpha',
      operations: ops,
      alreadyUploadedOpIds: alreadyUploaded,
      storagePercentUsed: 30,
      storageTightThresholdPercent: 75,
      deviceTier: 3,
      createdAtIso: '2026-11-23T13:00:00.000Z',
    });

    expect(normalPlan.strategy).toBe('normal');
    expect(normalPlan.maxOpsPerChunk).toBe(NORMAL_DELTA_CHUNK_MAX_OPS);
    expect(normalPlan.pendingOpsCount).toBe(60);
    expect(normalPlan.chunks).toHaveLength(1);
    expect(normalPlan.chunks[0].bundle.operations).toHaveLength(60);

    const tightPlan = planIncrementalCloudDeltaChunks({
      deviceId: 'dev-alpha',
      operations: ops,
      alreadyUploadedOpIds: alreadyUploaded,
      storagePercentUsed: 82,
      storageTightThresholdPercent: 75,
      deviceTier: 3,
      createdAtIso: '2026-11-23T13:00:00.000Z',
    });

    expect(tightPlan.strategy).toBe('tight_storage_incremental');
    expect(tightPlan.maxOpsPerChunk).toBe(TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS);
    expect(tightPlan.maxBytesPerChunk).toBe(TIGHT_STORAGE_DELTA_CHUNK_MAX_BYTES);
    expect(tightPlan.tightReasons.length).toBeGreaterThan(0);
    expect(tightPlan.pendingOpsCount).toBe(60);
    expect(tightPlan.chunks.length).toBeGreaterThanOrEqual(3);
    for (const chunk of tightPlan.chunks) {
      expect(chunk.bundle.operations.length).toBeLessThanOrEqual(TIGHT_STORAGE_DELTA_CHUNK_MAX_OPS);
      expect(chunk.estimatedBytes).toBeLessThanOrEqual(TIGHT_STORAGE_DELTA_CHUNK_MAX_BYTES);
      expect(chunk.bundle.strategy).toBe('tight_storage_incremental');
    }

    // Tier <= 2 also triggers tight-storage incremental chunking even at low disk usage
    const lowRamPlan = planIncrementalCloudDeltaChunks({
      deviceId: 'dev-alpha',
      operations: ops,
      alreadyUploadedOpIds: alreadyUploaded,
      storagePercentUsed: 10,
      deviceTier: 2,
      createdAtIso: '2026-11-23T13:00:00.000Z',
    });
    expect(lowRamPlan.strategy).toBe('tight_storage_incremental');
  });

  it('classifies HTTP 507 and 403 quota responses vs 401 auth expiry and permission errors', () => {
    const res507 = classifyCloudHttpResponse({ status: 507, bodyText: 'Insufficient Storage' });
    expect(res507.kind).toBe('insufficient_storage_507');
    expect(res507.isQuotaBreakerTrigger).toBe(true);
    expect(res507.breakerStatusCode).toBe(507);

    const res403Quota = classifyCloudHttpResponse({
      status: 403,
      bodyText: '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}',
      isWriteOperation: true,
    });
    expect(res403Quota.kind).toBe('quota_exceeded_403');
    expect(res403Quota.isQuotaBreakerTrigger).toBe(true);
    expect(res403Quota.breakerStatusCode).toBe(403);

    const res403WriteFallback = classifyCloudHttpResponse({
      status: 403,
      bodyText: '',
      isWriteOperation: true,
    });
    expect(res403WriteFallback.isQuotaBreakerTrigger).toBe(true);

    const res403ScopeDeny = classifyCloudHttpResponse({
      status: 403,
      bodyText: '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
      isWriteOperation: true,
    });
    expect(res403ScopeDeny.kind).toBe('forbidden_403_other');
    expect(res403ScopeDeny.isQuotaBreakerTrigger).toBe(false);

    const res401 = classifyCloudHttpResponse({ status: 401, bodyText: 'Invalid Credentials' });
    expect(res401.kind).toBe('auth_expired_401');
    expect(res401.isAuthExpired).toBe(true);
    expect(res401.isQuotaBreakerTrigger).toBe(false);
  });

  it('trips, dismisses warning, gates automated sync, and resets the quota circuit breaker', () => {
    const baseBreaker = createDefaultCloudQuotaCircuitBreaker();
    const settings = normalizeCloudSyncSettings({
      enabled: true,
      autoBackgroundSync: true,
      provider: 'google_drive',
    });

    expect(
      shouldRunAutomatedCloudSync({
        settings,
        circuitBreaker: baseBreaker,
        isOnline: true,
        hasToken: true,
      }).allowed
    ).toBe(true);

    const tripped = tripCloudQuotaCircuitBreaker(baseBreaker, {
      provider: 'google_drive',
      statusCode: 507,
      nowIso: '2026-11-23T14:00:00.000Z',
      prunedCount: 2,
    });
    expect(tripped.tripped).toBe(true);
    expect(tripped.pausedAutomatedSync).toBe(true);
    expect(tripped.statusCode).toBe(507);
    expect(tripped.lastPrunedCount).toBe(2);

    const gated = shouldRunAutomatedCloudSync({
      settings,
      circuitBreaker: tripped,
      isOnline: true,
      hasToken: true,
    });
    expect(gated.allowed).toBe(false);
    expect(gated.skipReason).toContain('circuit breaker');

    const dismissed = dismissCloudCircuitBreakerWarning(tripped, '2026-11-23T14:05:00.000Z');
    expect(dismissed.warningDismissedAtIso).toBe('2026-11-23T14:05:00.000Z');
    expect(dismissed.tripped).toBe(true);
    expect(dismissed.pausedAutomatedSync).toBe(true);

    const reset = resetCloudQuotaCircuitBreaker();
    expect(reset.tripped).toBe(false);
    expect(reset.pausedAutomatedSync).toBe(false);
    expect(reset.statusCode).toBeNull();
  });

  it('selects oldest rolling cloud backups for pruning while leaving delta chunks intact', () => {
    const oldest = buildRollingCloudBackupFileName({
      deviceId: 'dev1',
      createdAtIso: '2026-11-20T10:00:00.000Z',
    });
    const middle = buildRollingCloudBackupFileName({
      deviceId: 'dev1',
      createdAtIso: '2026-11-21T10:00:00.000Z',
    });
    const newest = buildRollingCloudBackupFileName({
      deviceId: 'dev1',
      createdAtIso: '2026-11-22T10:00:00.000Z',
    });

    const toPrune = selectRollingCloudBackupsToPrune(
      [
        { id: 'delta-1', name: 'cp-delta-dev1-20261120T100000Z-c001.json' },
        { id: 'r-old', name: oldest },
        { id: 'r-new', name: newest },
        { id: 'r-mid', name: middle },
        { id: 'other', name: 'readme.txt' },
      ],
      1
    );

    expect(toPrune.map((f) => f.id)).toEqual(['r-mid', 'r-old']);
  });

  it('builds compact rolling cloud backup envelopes by stripping inline photo data URLs', () => {
    const snap = makeEmptySnapshot({
      animals: [makeAnimal('a1')],
      animalPhotos: [
        {
          id: 'p1',
          species: 'Rabbit',
          animalId: 'a1',
          dataUrl: 'data:image/jpeg;base64,/9j/4AAQ',
          thumbnailDataUrl: 'data:image/jpeg;base64,/9j/thumb',
          originalFileName: 'side-pose.jpg',
          mimeType: 'image/jpeg',
          originalBytes: 24000,
          storedBytes: 12000,
          width: 800,
          height: 600,
          isPrimary: true,
          sortOrder: 0,
          caption: 'Side pose',
          createdAt: '2026-11-23T12:00:00.000Z',
          updatedAt: '2026-11-23T12:00:00.000Z',
        },
      ],
    });

    const envelope = buildCloudRollingBackupEnvelope({
      snapshot: snap,
      deviceId: 'dev-1',
      createdAtIso: '2026-11-23T12:30:00.000Z',
    });

    expect(envelope.animalCount).toBe(1);
    expect(envelope.photoMetadataCount).toBe(1);
    expect(envelope.snapshot.animalPhotos[0].dataUrl).toBe('');
    expect(envelope.snapshot.animalPhotos[0].thumbnailDataUrl).toBe('');
    expect(envelope.snapshot.animalPhotos[0].caption).toBe('Side pose');
  });
});
