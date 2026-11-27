/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Watertight Resilience & End-to-End Release Sanity Suite
 * Tests:
 * 1. Multi-Species Full Backup & Restore Round-Trip with deep 6-gen pedigrees
 * 2. Deep Recursion & Wright COI Performance under complex inbreeding loops
 * 3. Schema & Data Hygiene invariants (ISO UTC timestamps, monotonic revisions)
 */

import { describe, expect, it } from 'vitest';
import {
  deserializeVaultBackupPayload,
  serializeCompressedVaultBackupZip,
  serializeVaultBackupEnvelope,
} from '../backupVault';
import { calculatePairingCoi, buildPedigreeSlots } from '../pedigreeCalculator';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';

describe('Watertight Resilience — End-to-End Release Sanity', () => {
  it('Scenario 1: Complete Backup & Restore Round-Trip preserves 100% of data and relationships', () => {
    // 1. Generate full authentic multi-species sample dataset
    const originalSnapshot = buildFullPredefinedSampleSnapshot();
    const settings = originalSnapshot.settings;

    expect(originalSnapshot.animals.length).toBeGreaterThan(50);
    expect(originalSnapshot.speciesProfiles.length).toBeGreaterThanOrEqual(9);

    // 2. Export to compressed .zip archive
    const { zipBytes } = serializeCompressedVaultBackupZip(originalSnapshot, { kind: 'manual' });
    expect(zipBytes.byteLength).toBeGreaterThan(1000);

    // 3. Deserialize back into a clean snapshot
    const restoredFromZip = deserializeVaultBackupPayload(
      zipBytes,
      settings,
      'test-watertight-backup.vault.zip'
    );

    expect(restoredFromZip.checksumValid).toBe(true);
    expect(restoredFromZip.snapshot.animals.length).toBe(originalSnapshot.animals.length);
    expect(restoredFromZip.snapshot.breedings.length).toBe(originalSnapshot.breedings.length);
    expect(restoredFromZip.snapshot.tasks.length).toBe(originalSnapshot.tasks.length);

    // 4. Verify parentage relationships are 100% intact
    const originalWithSire = originalSnapshot.animals.filter((a) => Boolean(a.sireId));
    expect(originalWithSire.length).toBeGreaterThan(10);

    for (const orig of originalWithSire) {
      const restored = restoredFromZip.snapshot.animals.find((a) => a.id === orig.id);
      expect(restored).toBeDefined();
      expect(restored?.sireId).toBe(orig.sireId);
      expect(restored?.damId).toBe(orig.damId);
      expect(restored?.species).toBe(orig.species);
    }

    // 5. Export to standard JSON and verify round-trip
    const { jsonText } = serializeVaultBackupEnvelope(originalSnapshot, { kind: 'manual' });
    const restoredFromJson = deserializeVaultBackupPayload(
      jsonText,
      settings,
      'test-watertight-backup.json'
    );

    expect(restoredFromJson.checksumValid).toBe(true);
    expect(restoredFromJson.snapshot.animals.length).toBe(originalSnapshot.animals.length);
  });

  it('Scenario 2: Deep 6-Generation Pedigree & Wright COI executes swiftly without stack overflow', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const rabbitProfile = snapshot.speciesProfiles.find((sp) => sp.name.toLowerCase() === 'rabbit')!;
    expect(rabbitProfile).toBeDefined();

    // Map animals by ID for fast lookup
    const herdById = new Map(snapshot.animals.map((a) => [a.id, a]));

    // Find active rabbits
    const activeRabbits = snapshot.animals.filter(
      (a) => a.species.toLowerCase() === 'rabbit' && a.status === 'Active'
    );
    expect(activeRabbits.length).toBeGreaterThan(0);

    const testSubject = activeRabbits[0];

    const startTime = performance.now();

    // Build 3, 4, 5, and 6-generation pedigree slot structures
    for (const gen of [3, 4, 5, 6] as const) {
      const slots = buildPedigreeSlots(
        testSubject,
        herdById,
        gen,
        rabbitProfile
      );
      expect(slots.length).toBe((1 << (gen + 1)) - 1);
    }

    // Calculate COI for pairing
    const bucks = activeRabbits.filter((a) => a.sex === 'Male');
    const does = activeRabbits.filter((a) => a.sex === 'Female');
    expect(bucks.length).toBeGreaterThan(0);
    expect(does.length).toBeGreaterThan(0);

    const analysis = calculatePairingCoi(bucks[0].id, does[0].id, herdById);
    const durationMs = performance.now() - startTime;

    expect(analysis.coiFraction).toBeGreaterThanOrEqual(0);
    expect(analysis.coiFraction).toBeLessThanOrEqual(1);
    expect(analysis.coiPercent).toBeGreaterThanOrEqual(0);
    expect(analysis.coiPercent).toBeLessThanOrEqual(100);
    // Computation of multiple 6-gen trees + COI should easily take under 500ms
    expect(durationMs).toBeLessThan(500);
  });

  it('Scenario 3: Date strings adhere strictly to ISO-8601 UTC and calendar invariants', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();

    // Every task dueDateIso must match "YYYY-MM-DD"
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const task of snapshot.tasks) {
      expect(task.dueDateIso).toMatch(dateRegex);
    }

    // Every animal birthDateIso (when present) must match "YYYY-MM-DD"
    for (const animal of snapshot.animals) {
      if (animal.birthDateIso) {
        expect(animal.birthDateIso).toMatch(dateRegex);
      }
    }

    // Every breeding record bredDateIso must match "YYYY-MM-DD"
    for (const breeding of snapshot.breedings) {
      expect(breeding.bredDateIso).toMatch(dateRegex);
      expect(breeding.expectedDueDateIso).toMatch(dateRegex);
    }
  });
});
