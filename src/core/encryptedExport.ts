/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Encrypted Export Envelope Format & ZIP Wrapper (`src/core/encryptedExport.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Zero browser DOM or WebCrypto calls live here — only schema definitions, validation,
 * and `fflate` `.zip` envelope framing so encrypted exports work cleanly across Web PWA
 * (paired with `src/storage/passphraseCrypto.ts`) and React Native / Expo.
 */

import { strFromU8, strToU8, zipSync } from 'fflate';
import {
  MAX_JSON_BACKUP_BYTES,
  safeUnzipArchive,
} from './inputSanitization';

export const ENCRYPTED_ENVELOPE_FORMAT = 'community-pedigree-encrypted-v1' as const;
export const ENCRYPTED_ZIP_PAYLOAD_ENTRY = 'ENCRYPTED-PAYLOAD.json';
export const DEFAULT_PBKDF2_ITERATIONS = 210_000;

export type EncryptedPayloadKind =
  | 'json_backup'
  | 'zip_archive'
  | 'delta_log'
  | 'vault_backup';

export interface EncryptedPayloadEnvelope {
  format: typeof ENCRYPTED_ENVELOPE_FORMAT;
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltBase64: string;
  ivBase64: string;
  payloadKind: EncryptedPayloadKind;
  originalFileName?: string;
  createdAtIso: string;
  ciphertextBase64: string;
}

export function isEncryptedPayloadEnvelope(
  value: unknown
): value is EncryptedPayloadEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.format === ENCRYPTED_ENVELOPE_FORMAT &&
    obj.cipher === 'AES-256-GCM' &&
    obj.kdf === 'PBKDF2-SHA256' &&
    typeof obj.iterations === 'number' &&
    Number.isFinite(obj.iterations) &&
    obj.iterations >= 10_000 &&
    typeof obj.saltBase64 === 'string' &&
    obj.saltBase64.length > 0 &&
    typeof obj.ivBase64 === 'string' &&
    obj.ivBase64.length > 0 &&
    typeof obj.ciphertextBase64 === 'string' &&
    obj.ciphertextBase64.length > 0
  );
}

export function tryParseEncryptedEnvelopeJson(
  text: string
): EncryptedPayloadEnvelope | null {
  if (!text || !text.includes(ENCRYPTED_ENVELOPE_FORMAT)) return null;
  try {
    const parsed = JSON.parse(text);
    return isEncryptedPayloadEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Wraps an `EncryptedPayloadEnvelope` inside a standard `.ZIP` container with a
 * plain-text README explaining how to restore it inside Community Pedigree.
 */
export function wrapEncryptedZipContainer(
  envelope: EncryptedPayloadEnvelope,
  originalArchiveName = 'archive.zip'
): Uint8Array {
  const readme = [
    'Community Pedigree — Passphrase-Encrypted Backup Archive',
    `Created: ${envelope.createdAtIso}`,
    `Cipher: ${envelope.cipher} (${envelope.kdf}, ${envelope.iterations.toLocaleString()} iterations)`,
    `Original File: ${originalArchiveName}`,
    '',
    'To restore or merge this encrypted backup:',
    'Open Community Pedigree -> Settings -> Open Data Portability & Backups',
    '-> Restore (.JSON / .ZIP) or Merge (.JSON / .ZIP), then enter your passphrase.',
  ].join('\n');

  return zipSync({
    [ENCRYPTED_ZIP_PAYLOAD_ENTRY]: [strToU8(JSON.stringify(envelope, null, 2)), { level: 6 }],
    'README-ENCRYPTED.txt': [strToU8(readme), { level: 6 }],
  });
}

function isZipHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Checks whether raw `.ZIP` bytes are an encrypted Community Pedigree container wrapping
 * `ENCRYPTED-PAYLOAD.json` and extracts the validated envelope without modifying it.
 */
export function tryExtractEncryptedEnvelopeFromZip(
  bytes: Uint8Array,
  fileName = 'encrypted.zip'
): EncryptedPayloadEnvelope | null {
  if (!isZipHeader(bytes)) return null;
  try {
    const unzipped = safeUnzipArchive(bytes, {
      archiveName: fileName,
      maxEntries: 16,
      entryFilter: (p) =>
        p.replace(/\\/g, '/').toLowerCase() === ENCRYPTED_ZIP_PAYLOAD_ENTRY.toLowerCase(),
    });
    const entryBytes =
      unzipped[ENCRYPTED_ZIP_PAYLOAD_ENTRY] ||
      Object.values(unzipped)[0];
    if (!entryBytes || entryBytes.byteLength > MAX_JSON_BACKUP_BYTES) {
      return null;
    }
    return tryParseEncryptedEnvelopeJson(strFromU8(entryBytes));
  } catch {
    return null;
  }
}
