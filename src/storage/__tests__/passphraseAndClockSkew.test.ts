import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLOCK_DRIFT_WARNING_THRESHOLD_MS,
  formatClockSkewHuman,
  getAdjustedNowIsoUtc,
  getConnectivitySnapshot,
  getRecordedClockSkewMs,
  recordServerDateHeaderSkew,
  resetConnectivityStateForTests,
} from '../storageProtection';
import {
  decryptBytesWithPassphrase,
  decryptTextWithPassphrase,
  encryptBytesWithPassphrase,
  encryptTextWithPassphrase,
  supportsPassphraseCrypto,
} from '../passphraseCrypto';
import {
  EncryptedSyncPassphraseError,
  parseDeltaFileTextAsync,
} from '../localSyncChannels';
import { createOutboxOperation } from '../../core/syncOutbox';
import { BarnTask } from '../../core/models';
import { pushTasksToGoogleCalendar } from '../../utils/googleCalendarClient';

describe('Stage B storage & network resilience (IMP-023)', () => {
  afterEach(() => {
    resetConnectivityStateForTests();
    vi.restoreAllMocks();
  });

  describe('Device Clock Skew Compensation & Drift Warning', () => {
    it('captures server Date header skew, triggers 5-min drift warning, and shifts getAdjustedNowIsoUtc', () => {
      resetConnectivityStateForTests();
      const localFixedNow = Date.parse('2026-06-01T12:00:00.000Z');
      // Device clock is 15 minutes slow compared to server Date header
      const serverDateHeader = 'Mon, 01 Jun 2026 12:15:00 GMT';

      const skew = recordServerDateHeaderSkew(serverDateHeader, localFixedNow);
      expect(skew).toBe(15 * 60_000);
      expect(getRecordedClockSkewMs()).toBe(15 * 60_000);

      const snap = getConnectivitySnapshot();
      expect(snap.clockDriftWarning).toBe(true);
      expect(Math.abs(snap.clockSkewMs ?? 0)).toBeGreaterThanOrEqual(
        CLOCK_DRIFT_WARNING_THRESHOLD_MS
      );
      expect(formatClockSkewHuman(snap.clockSkewMs)).toContain('15 min behind server time');

      const adjustedMs = Date.parse(getAdjustedNowIsoUtc());
      expect(Math.abs(adjustedMs - (Date.now() + 15 * 60_000))).toBeLessThan(2000);
    });

    it('keeps clockDriftWarning false when drift is under 5 minutes', () => {
      const localFixedNow = Date.parse('2026-06-01T12:00:00.000Z');
      recordServerDateHeaderSkew('Mon, 01 Jun 2026 12:02:00 GMT', localFixedNow);
      expect(getConnectivitySnapshot().clockDriftWarning).toBe(false);
    });
  });

  describe('Web Crypto Passphrase Encryption (AES-256-GCM + PBKDF2)', () => {
    it('round-trips bytes and delta JSON text with fast test iteration counts and rejects wrong passphrases', async () => {
      if (!supportsPassphraseCrypto()) {
        return;
      }

      const rawBytes = new Uint8Array([1, 2, 3, 4, 5, 99, 250]);
      const envBytes = await encryptBytesWithPassphrase(rawBytes, 'barn-secret-2026', {
        payloadKind: 'zip_archive',
        originalFileName: 'barn.zip',
        iterations: 10_000,
      });

      const restoredBytes = await decryptBytesWithPassphrase(envBytes, 'barn-secret-2026');
      expect(Array.from(restoredBytes)).toEqual(Array.from(rawBytes));

      await expect(decryptBytesWithPassphrase(envBytes, 'wrong-pass')).rejects.toThrow(
        /incorrect passphrase/i
      );

      const deltaPayload = JSON.stringify({
        format: 'community-pedigree-delta-v1',
        device_id: 'dev-a',
        exported_at: '2026-06-01T12:00:00.000Z',
        operations: [
          createOutboxOperation({
            entityType: 'animal',
            entityUuid: 'ani-1',
            deviceId: 'dev-a',
            logicalCounter: 1,
            fieldName: 'name',
            newValue: 'Clover',
            timestamp: '2026-06-01T12:00:00.000Z',
            recordRev: 1,
          }),
        ],
      });

      const encryptedDeltaEnv = await encryptTextWithPassphrase(
        deltaPayload,
        'worker-pass-42',
        {
          payloadKind: 'delta_log',
          originalFileName: 'delta_dev-a.json',
          iterations: 10_000,
        }
      );
      const encryptedDeltaJson = JSON.stringify(encryptedDeltaEnv);

      await expect(parseDeltaFileTextAsync(encryptedDeltaJson)).rejects.toBeInstanceOf(
        EncryptedSyncPassphraseError
      );

      const decryptedDelta = await parseDeltaFileTextAsync(
        encryptedDeltaJson,
        'worker-pass-42'
      );
      expect(decryptedDelta.wasEncrypted).toBe(true);
      expect(decryptedDelta.operations).toHaveLength(1);
      expect(decryptedDelta.operations[0]?.new_value).toBe('Clover');

      const plainParsed = await parseDeltaFileTextAsync(deltaPayload);
      expect(plainParsed.wasEncrypted).toBe(false);
      expect(plainParsed.operations).toHaveLength(1);
    });
  });

  describe('Google Calendar 409 conflict update-in-place + Date skew capture', () => {
    it('retries with PUT using deterministic event id when POST returns 409', async () => {
      const calls: Array<{ url: string; method: string }> = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        calls.push({ url, method });
        if (method === 'POST') {
          return new Response(JSON.stringify({ error: { code: 409 } }), {
            status: 409,
            headers: {
              'content-type': 'application/json',
              date: new Date(Date.now() + 10 * 60_000).toUTCString(),
            },
          });
        }
        return new Response(JSON.stringify({ htmlLink: 'https://calendar.google.com/e/1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });

      vi.stubGlobal('fetch', fetchMock);

      const task: BarnTask = {
        id: 'deterministic-task-id-001',
        species: 'Rabbit',
        title: 'Wean Litter',
        dueDateIso: '2026-07-01',
        priority: 'Normal',
        category: 'Weaning',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        completed: false,
        createdAt: '2026-06-01T12:00:00.000Z',
        updatedAt: '2026-06-01T12:00:00.000Z',
      };

      const res = await pushTasksToGoogleCalendar({
        accessToken: 'fake-token',
        calendarId: 'primary',
        tasks: [task],
        config: {},
        barnName: 'Kim Barn',
      });

      expect(res.createdCount).toBe(1);
      expect(res.failedCount).toBe(0);
      expect(res.htmlLinks).toEqual(['https://calendar.google.com/e/1']);
      expect(calls.map((c) => c.method)).toEqual(['POST', 'PUT']);
      expect(calls[1]?.url).toMatch(/\/events\/cped[a-v0-9]+$/);
      expect(getConnectivitySnapshot().clockDriftWarning).toBe(true);
    });
  });
});
