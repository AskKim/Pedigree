/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Uncached `version.json` / `status.json` Upgrade Gate & Pre-Flight Evaluator
 * (`src/domain/upgradeGate.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `fetch`) or Node dependencies.
 */

import { CURRENT_BACKUP_SCHEMA_VERSION } from './backupVault';
import { nowEpochMs } from './models';

export const CURRENT_APP_VERSION = '0.1.0-alpha.3';

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
