/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Web Crypto Passphrase Encryption & Decryption (PBKDF2-SHA256 + AES-256-GCM)
 * (`src/storage/passphraseCrypto.ts`).
 *
 * Strictly zero key persistence: passphrases stay in memory only for the current
 * export/sync/restore action and never enter SQLite, IndexedDB, or localStorage.
 */

import {
  base64ToBytesPure,
  bytesToBase64Pure,
  bytesToUtf8String,
  utf8StringToBytes,
} from '@engine/binaryEncoding';
import {
  DEFAULT_PBKDF2_ITERATIONS,
  ENCRYPTED_ENVELOPE_FORMAT,
  EncryptedPayloadEnvelope,
  EncryptedPayloadKind,
} from '../domain/encryptedExport';
import { nowIsoUtc } from '../domain/models';

export function supportsPassphraseCrypto(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    Boolean(globalThis.crypto?.subtle) &&
    typeof globalThis.crypto?.getRandomValues === 'function'
  );
}

function getSubtleCrypto(): SubtleCrypto {
  if (!supportsPassphraseCrypto()) {
    throw new Error(
      'Passphrase encryption (Web Crypto AES-GCM) is unavailable in this browser context.'
    );
  }
  return globalThis.crypto.subtle;
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: 'encrypt' | 'decrypt'
): Promise<CryptoKey> {
  const cleanPass = passphrase;
  if (!cleanPass || cleanPass.length < 4) {
    throw new Error('Enter a passphrase of at least 4 characters.');
  }
  const subtle = getSubtleCrypto();
  const baseKey = await subtle.importKey(
    'raw',
    toExactArrayBuffer(utf8StringToBytes(cleanPass)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toExactArrayBuffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encryptBytesWithPassphrase(
  bytes: Uint8Array,
  passphrase: string,
  options: {
    payloadKind: EncryptedPayloadKind;
    originalFileName?: string;
    iterations?: number;
  }
): Promise<EncryptedPayloadEnvelope> {
  const subtle = getSubtleCrypto();
  const iterations = Math.max(
    10_000,
    Math.round(options.iterations ?? DEFAULT_PBKDF2_ITERATIONS)
  );
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(passphrase, salt, iterations, 'encrypt');

  const cipherBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: toExactArrayBuffer(iv) },
    key,
    toExactArrayBuffer(bytes)
  );

  return {
    format: ENCRYPTED_ENVELOPE_FORMAT,
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    saltBase64: bytesToBase64Pure(salt),
    ivBase64: bytesToBase64Pure(iv),
    payloadKind: options.payloadKind,
    originalFileName: options.originalFileName,
    createdAtIso: nowIsoUtc(),
    ciphertextBase64: bytesToBase64Pure(new Uint8Array(cipherBuffer)),
  };
}

export async function decryptBytesWithPassphrase(
  envelope: EncryptedPayloadEnvelope,
  passphrase: string
): Promise<Uint8Array> {
  if (!passphrase) {
    throw new Error('Passphrase required to unlock encrypted Pedigree file.');
  }
  const subtle = getSubtleCrypto();
  const salt = base64ToBytesPure(envelope.saltBase64);
  const iv = base64ToBytesPure(envelope.ivBase64);
  const ciphertext = base64ToBytesPure(envelope.ciphertextBase64);

  if (salt.byteLength < 8 || iv.byteLength !== 12 || ciphertext.byteLength === 0) {
    throw new Error('Encrypted payload header is damaged or incomplete.');
  }

  const key = await deriveAesGcmKey(
    passphrase,
    salt,
    envelope.iterations,
    'decrypt'
  );

  try {
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: toExactArrayBuffer(iv) },
      key,
      toExactArrayBuffer(ciphertext)
    );
    return new Uint8Array(plainBuffer);
  } catch {
    throw new Error(
      'Incorrect passphrase or corrupted encrypted archive. Verify the passphrase and try again.'
    );
  }
}

export async function encryptTextWithPassphrase(
  text: string,
  passphrase: string,
  options: {
    payloadKind: EncryptedPayloadKind;
    originalFileName?: string;
    iterations?: number;
  }
): Promise<EncryptedPayloadEnvelope> {
  return encryptBytesWithPassphrase(utf8StringToBytes(text), passphrase, options);
}

export async function decryptTextWithPassphrase(
  envelope: EncryptedPayloadEnvelope,
  passphrase: string
): Promise<string> {
  const plainBytes = await decryptBytesWithPassphrase(envelope, passphrase);
  return bytesToUtf8String(plainBytes);
}
