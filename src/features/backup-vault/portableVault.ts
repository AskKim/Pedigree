/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Portable Backup Vault Feature (`@features/backup-vault/portableVault.ts`).
 *
 * Wraps `@engine/storage` portable bundles with SHA-256 checksum envelopes and optional
 * ZIP archive framing. Zero domain terms and zero cross-feature imports.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { utf8StringToBytes } from '@engine/binaryEncoding';
import { sha256HexPure } from '@engine/primitives';
import {
  exportPortableStorageBundle,
  type IStorageAdapter,
  type PortableStorageBundle,
  restorePortableStorageBundle,
} from '@engine/storage';
import type { IFeatureModule } from '../featureModule.interface';

export const PORTABLE_VAULT_FORMAT = 'core-portable-vault-v1' as const;

export interface PortableVaultEnvelope {
  readonly format: typeof PORTABLE_VAULT_FORMAT;
  readonly appFormatTag: string;
  readonly schemaVersion: number;
  readonly createdAtIso: string;
  readonly checksumSha256: string;
  readonly bundle: PortableStorageBundle;
}

export interface VaultExportOptions {
  readonly appFormatTag?: string;
  readonly schemaVersion?: number;
  readonly keyPrefix?: string;
  readonly compressZip?: boolean;
}

export interface VaultExportResult {
  readonly envelope: PortableVaultEnvelope;
  readonly jsonText: string;
  readonly bytes: Uint8Array;
  readonly compressed: boolean;
}

/**
 * Exports all key-value entries from an IStorageAdapter into a SHA-256 verified vault envelope.
 *
 * @param adapter The underlying storage adapter to dump
 * @param options Configuration options (prefix filter, format tag, optional ZIP compression)
 * @returns Serialized vault envelope, JSON string, and byte array
 */
export async function exportPortableVault(
  adapter: IStorageAdapter,
  options: VaultExportOptions = {}
): Promise<VaultExportResult> {
  const bundle = await exportPortableStorageBundle(adapter, options.keyPrefix);
  const bundleCanonical = JSON.stringify(bundle);
  const checksumSha256 = sha256HexPure(bundleCanonical);

  const envelope: PortableVaultEnvelope = {
    format: PORTABLE_VAULT_FORMAT,
    appFormatTag: options.appFormatTag || 'core-app-vault',
    schemaVersion: options.schemaVersion ?? 1,
    createdAtIso: new Date().toISOString(),
    checksumSha256,
    bundle,
  };

  const jsonText = JSON.stringify(envelope, null, 2);
  if (options.compressZip) {
    const bytes = zipSync({
      'vault-backup.json': [strToU8(jsonText), { level: 6 }],
    });
    return { envelope, jsonText, bytes, compressed: true };
  }

  return {
    envelope,
    jsonText,
    bytes: utf8StringToBytes(jsonText),
    compressed: false,
  };
}

/**
 * Parses and cryptographically verifies a portable vault envelope from bytes, JSON string, or object.
 *
 * @param input Raw bytes (JSON or ZIP), JSON string, or pre-parsed envelope
 * @param expectedAppFormatTag Optional application format tag to validate
 * @returns Verified PortableVaultEnvelope
 * @throws Error if signature mismatch, missing file, or format invalid
 */
export function parseAndVerifyPortableVault(
  input: string | Uint8Array | PortableVaultEnvelope,
  expectedAppFormatTag?: string
): PortableVaultEnvelope {
  let parsed: unknown;
  if (input instanceof Uint8Array) {
    const isZip = input.length >= 4 && input[0] === 0x50 && input[1] === 0x4b;
    if (isZip) {
      const files = unzipSync(input);
      const entry = files['vault-backup.json'];
      if (!entry) {
        throw new Error('Missing vault-backup.json inside compressed vault archive');
      }
      parsed = JSON.parse(strFromU8(entry));
    } else {
      parsed = JSON.parse(strFromU8(input));
    }
  } else if (typeof input === 'string') {
    parsed = JSON.parse(input);
  } else {
    parsed = input;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid portable vault envelope');
  }
  const candidate = parsed as Partial<PortableVaultEnvelope>;
  if (candidate.format !== PORTABLE_VAULT_FORMAT || !candidate.bundle) {
    throw new Error('Unsupported portable vault format');
  }
  if (expectedAppFormatTag && candidate.appFormatTag !== expectedAppFormatTag) {
    throw new Error(`Vault app format mismatch (expected ${expectedAppFormatTag})`);
  }

  const computedSha256 = sha256HexPure(JSON.stringify(candidate.bundle));
  if (candidate.checksumSha256 !== computedSha256) {
    throw new Error('Portable vault SHA-256 verification failed');
  }

  return candidate as PortableVaultEnvelope;
}

/**
 * Verifies a portable vault envelope and restores its contained key-value bundle into the storage adapter.
 *
 * @param adapter Destination storage adapter to populate
 * @param input Raw vault bytes, JSON string, or pre-parsed envelope
 * @param options Restoration options (format check, whether to clear existing storage before write)
 * @returns Number of restored keys and verified envelope
 */
export async function restorePortableVault(
  adapter: IStorageAdapter,
  input: string | Uint8Array | PortableVaultEnvelope,
  options: { expectedAppFormatTag?: string; clearExisting?: boolean } = {}
): Promise<{ restoredCount: number; envelope: PortableVaultEnvelope }> {
  const envelope = parseAndVerifyPortableVault(input, options.expectedAppFormatTag);
  const res = await restorePortableStorageBundle(adapter, envelope.bundle, {
    clearExisting: options.clearExisting,
  });
  return {
    restoredCount: res.restoredCount,
    envelope,
  };
}

export function createBackupVaultFeatureModule(): IFeatureModule<
  { appFormatTag?: string },
  { ready: boolean; appFormatTag?: string }
> {
  let ready = false;
  let appFormatTag: string | undefined;

  return {
    metadata: {
      id: 'backup-vault',
      name: 'Portable Backup Vault',
      version: '1.0.0',
      description: 'Content-agnostic SHA-256 verified portable vault exporter and restorer.',
    },
    async initialize(context) {
      appFormatTag = context.config?.appFormatTag;
      ready = true;
    },
    async dispose() {
      ready = false;
    },
    getStateSnapshot() {
      return { ready, appFormatTag };
    },
  };
}
