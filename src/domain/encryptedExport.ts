/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Encrypted Export Envelope Format & ZIP Wrapper (`src/domain/encryptedExport.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * Zero browser DOM or WebCrypto calls live here — only schema definitions, validation,
 * and `fflate` `.zip` envelope framing so encrypted exports work cleanly across Web PWA
 * (paired with `src/storage/passphraseCrypto.ts`) and React Native / Expo.
 */

import {
  isGenericEncryptedEnvelope,
  tryExtractGenericEncryptedEnvelopeFromZip,
  tryParseGenericEncryptedEnvelopeJson,
  wrapGenericEncryptedZip,
} from '@engine/primitives/crypto';

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
  return isGenericEncryptedEnvelope(value, ENCRYPTED_ENVELOPE_FORMAT);
}

export function tryParseEncryptedEnvelopeJson(
  text: string
): EncryptedPayloadEnvelope | null {
  const parsed = tryParseGenericEncryptedEnvelopeJson(text, ENCRYPTED_ENVELOPE_FORMAT);
  return parsed && isEncryptedPayloadEnvelope(parsed) ? parsed : null;
}

/**
 * Wraps an `EncryptedPayloadEnvelope` inside a standard `.ZIP` container with a
 * plain-text README explaining how to restore it inside Community Pedigree.
 */
export function wrapEncryptedZipContainer(
  envelope: EncryptedPayloadEnvelope,
  originalArchiveName = 'archive.zip'
): Uint8Array {
  return wrapGenericEncryptedZip({
    envelope,
    payloadEntryName: ENCRYPTED_ZIP_PAYLOAD_ENTRY,
    readmeTitle: 'Community Pedigree — Passphrase-Encrypted Backup Archive',
    originalFileNameLabel: originalArchiveName,
    restoreHint: [
      'To restore or merge this encrypted backup:',
      'Open Community Pedigree -> Settings -> Open Data Portability & Backups',
      '-> Restore (.JSON / .ZIP) or Merge (.JSON / .ZIP), then enter your passphrase.',
    ].join('\n'),
  });
}

/**
 * Checks whether raw `.ZIP` bytes are an encrypted Community Pedigree container wrapping
 * `ENCRYPTED-PAYLOAD.json` and extracts the validated envelope without modifying it.
 */
export function tryExtractEncryptedEnvelopeFromZip(
  bytes: Uint8Array,
  fileName = 'encrypted.zip'
): EncryptedPayloadEnvelope | null {
  const extracted = tryExtractGenericEncryptedEnvelopeFromZip(bytes, {
    fileName,
    expectedFormat: ENCRYPTED_ENVELOPE_FORMAT,
    payloadEntryName: ENCRYPTED_ZIP_PAYLOAD_ENTRY,
  });
  return extracted && isEncryptedPayloadEnvelope(extracted) ? extracted : null;
}
