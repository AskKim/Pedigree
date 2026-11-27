import { describe, expect, it } from 'vitest';
import {
  buildVerifiedPreUpgradeJsonBackup,
  CURRENT_BACKUP_SCHEMA_VERSION,
  verifyPreUpgradeJsonBackup,
} from '../backupVault';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';
import {
  computeHttpDateClockSkewMs,
  CURRENT_APP_VERSION,
  evaluateUpgradeGate,
  parseStatusManifestJson,
  parseVersionManifestJson,
} from '../upgradeGate';

describe('upgradeGate — release manifests, safe-harbor floor & schema gates', () => {
  it('parses version.json and status.json manifests safely and rejects invalid roots', () => {
    expect(parseVersionManifestJson(null)).toBeNull();
    expect(parseVersionManifestJson([])).toBeNull();
    expect(parseVersionManifestJson({ schemaVersion: 6 })).toBeNull();

    const parsedVer = parseVersionManifestJson({
      appVersion: '0.2.0',
      schemaVersion: 8,
      minDirectUpgradeSchema: 5,
      releaseNotes: '  Major pedigree release  ',
    });
    expect(parsedVer).toEqual({
      appVersion: '0.2.0',
      schemaVersion: 8,
      minDirectUpgradeSchema: 5,
      releaseNotes: 'Major pedigree release',
    });

    expect(parseStatusManifestJson('bad')).toBeNull();
    const parsedStatus = parseStatusManifestJson({
      allowUpdates: false,
      revokedVersions: [' 0.1.0-bad ', '', 123],
      advisoryMessage: 'Maintenance window active',
    });
    expect(parsedStatus).toEqual({
      allowUpdates: false,
      revokedVersions: ['0.1.0-bad'],
      advisoryMessage: 'Maintenance window active',
    });
  });

  it('evaluates all 5 UpgradeGateDecision states including schemaDelta>=2 verified bypass', () => {
    // 1. Paused via allowUpdates=false
    const paused = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.2.0', schemaVersion: 6, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: false, revokedVersions: [] },
    });
    expect(paused.status).toBe('blocked_paused');
    expect(paused.canProceedWithDirectSwSwap).toBe(false);

    // 2. Revoked release block (matches either target or current)
    const revokedTarget = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.1.5-bad', schemaVersion: 6, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: ['0.1.5-bad'] },
    });
    expect(revokedTarget.status).toBe('blocked_revoked');
    expect(revokedTarget.canProceedWithDirectSwSwap).toBe(false);

    const revokedCurrent = evaluateUpgradeGate({
      currentAppVersion: '0.0.9-recalled',
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.2.0', schemaVersion: 6, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: ['0.0.9-recalled'] },
    });
    expect(revokedCurrent.status).toBe('blocked_revoked');
    expect(revokedCurrent.canProceedWithDirectSwSwap).toBe(false);

    // 3. Safe-Harbor Archive & Re-Import required when local schema < minDirectUpgradeSchema
    const safeHarbor = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 4,
      remoteVersion: { appVersion: '0.3.0', schemaVersion: 8, minDirectUpgradeSchema: 6 },
      remoteStatus: { allowUpdates: true, revokedVersions: [] },
    });
    expect(safeHarbor.status).toBe('requires_safe_harbor_reset');
    expect(safeHarbor.requiresSafeHarborReset).toBe(true);
    expect(safeHarbor.canProceedWithDirectSwSwap).toBe(false);

    // 4. schemaDelta >= 2 without verified backup blocks until verified
    const unverifiedDelta = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.4.0', schemaVersion: 8, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: [] },
      backupVerifiedForTarget: false,
    });
    expect(unverifiedDelta.status).toBe('requires_verified_backup');
    expect(unverifiedDelta.schemaDelta).toBe(2);
    expect(unverifiedDelta.requiresVerifiedBackup).toBe(true);
    expect(unverifiedDelta.canProceedWithDirectSwSwap).toBe(false);

    // 5. Same delta with verified pre-upgrade backup proceeds safely
    const verifiedDelta = evaluateUpgradeGate({
      currentAppVersion: CURRENT_APP_VERSION,
      currentSchemaVersion: 6,
      remoteVersion: { appVersion: '0.4.0', schemaVersion: 8, minDirectUpgradeSchema: 4 },
      remoteStatus: { allowUpdates: true, revokedVersions: [] },
      backupVerifiedForTarget: true,
    });
    expect(verifiedDelta.status).toBe('allowed');
    expect(verifiedDelta.canProceedWithDirectSwSwap).toBe(true);
  });

  it('computes signed HTTP Date clock skew in ms cleanly', () => {
    const localNow = Date.UTC(2026, 4, 10, 12, 0, 0);
    const serverHeader = new Date(localNow + 420_000).toUTCString();
    expect(computeHttpDateClockSkewMs(serverHeader, localNow)).toBe(420_000);
    expect(computeHttpDateClockSkewMs('not-a-date', localNow)).toBeNull();
    expect(computeHttpDateClockSkewMs(null, localNow)).toBeNull();
  });
});

describe('pre-upgrade SHA-256 JSON backup creation & tamper verification', () => {
  it('builds a _schemaVersion-stamped pre_upgrade backup and detects checksum tampering', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const { envelope, jsonText, verification } = buildVerifiedPreUpgradeJsonBackup(
      snapshot,
      CURRENT_APP_VERSION,
      'Stage A test backup'
    );

    expect(envelope.vaultKind).toBe('pre_upgrade');
    expect(envelope._schemaVersion).toBe(CURRENT_BACKUP_SCHEMA_VERSION);
    expect(verification.ok).toBe(true);
    expect(verification.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verification.animalCount).toBe(snapshot.animals.length);

    expect(verifyPreUpgradeJsonBackup(jsonText, envelope.checksumSha256).ok).toBe(true);

    // Tamper snapshot payload after signing
    const tampered = JSON.parse(jsonText);
    tampered.snapshot.settings.barnName = 'Tampered Name';
    const tamperedCheck = verifyPreUpgradeJsonBackup(
      JSON.stringify(tampered),
      envelope.checksumSha256
    );
    expect(tamperedCheck.ok).toBe(false);
    expect(tamperedCheck.reason).toMatch(/checksum/i);
  });
});
