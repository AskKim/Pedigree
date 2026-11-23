/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Local P2P / LAN Outbox Reconciliation Protocol (`src/core/p2pSyncProtocol.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with ZERO browser DOM (`window`, `document`) dependencies.
 * Enables zero-server WebRTC DataChannel & local LAN delta exchange by framing
 * compact SDP session signals and `SyncOperation[]` outbox payloads for deterministic
 * field-level reconciliation via `mergeDeltaOperations`.
 */

import { isValidSyncOperation, MAX_DELTA_OPERATIONS } from './inputSanitization';
import { nowIsoUtc } from './models';
import {
  DeltaExportFile,
  SyncConflictEntry,
  SyncOperation,
} from './syncOutbox';

export type P2pWireMessage =
  | {
      kind: 'pedigree-p2p-delta-v1';
      senderDeviceId: string;
      sentAtIso: string;
      operations: SyncOperation[];
    }
  | {
      kind: 'pedigree-p2p-ack-v1';
      senderDeviceId: string;
      receivedCount: number;
      appliedCount: number;
      taskOpsCount: number;
      conflictCount: number;
      ackAtIso: string;
    };

export interface P2pSignalEnvelope {
  v: 1;
  type: 'offer' | 'answer';
  deviceId: string;
  sdp: string;
  createdAtIso: string;
}

export interface P2pReconciliationSummary {
  peerDeviceId: string;
  receivedOpsCount: number;
  appliedOpCount: number;
  taskOpsReceivedCount: number;
  newConflictCount: number;
  newTaskConflictCount: number;
  reconciledAtIso: string;
}

/**
 * Builds an outbound P2P wire message containing all delta operations authored by
 * `deviceId` (or all known operations when relaying across peers).
 */
export function createP2pDeltaWireMessage(params: {
  senderDeviceId: string;
  operations: SyncOperation[];
  includePeerRelays?: boolean;
  sentAtIso?: string;
}): P2pWireMessage {
  const filtered = params.includePeerRelays
    ? params.operations
    : params.operations.filter((op) => op.device_id === params.senderDeviceId);

  return {
    kind: 'pedigree-p2p-delta-v1',
    senderDeviceId: params.senderDeviceId,
    sentAtIso: params.sentAtIso || nowIsoUtc(),
    operations: filtered.slice(-MAX_DELTA_OPERATIONS),
  };
}

/**
 * Builds a P2P reconciliation acknowledgment packet.
 */
export function createP2pAckWireMessage(params: {
  senderDeviceId: string;
  receivedCount: number;
  appliedCount: number;
  taskOpsCount: number;
  conflictCount: number;
  ackAtIso?: string;
}): P2pWireMessage {
  return {
    kind: 'pedigree-p2p-ack-v1',
    senderDeviceId: params.senderDeviceId,
    receivedCount: params.receivedCount,
    appliedCount: params.appliedCount,
    taskOpsCount: params.taskOpsCount,
    conflictCount: params.conflictCount,
    ackAtIso: params.ackAtIso || nowIsoUtc(),
  };
}

/**
 * Parses an incoming wire JSON message from a P2P DataChannel or pasted LAN delta bundle.
 * Supports both `pedigree-p2p-delta-v1` wire packets and `community-pedigree-delta-v1` files.
 */
export function parseP2pWireOrDeltaPayload(rawText: string): {
  messageKind: 'delta' | 'ack';
  senderDeviceId: string;
  operations: SyncOperation[];
  ack?: Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>;
} {
  const parsed = JSON.parse(rawText) as Record<string, unknown> | unknown[];
  if (parsed && !Array.isArray(parsed) && parsed.kind === 'pedigree-p2p-ack-v1') {
    return {
      messageKind: 'ack',
      senderDeviceId: String(parsed.senderDeviceId || 'peer'),
      operations: [],
      ack: parsed as unknown as Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>,
    };
  }

  let rawOps: unknown[] | null = null;
  let senderDeviceId = 'peer';

  if (Array.isArray(parsed)) {
    rawOps = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.operations)) {
      rawOps = parsed.operations;
    }
    if (typeof parsed.senderDeviceId === 'string' && parsed.senderDeviceId.trim()) {
      senderDeviceId = parsed.senderDeviceId.trim();
    } else if (typeof (parsed as Partial<DeltaExportFile>).device_id === 'string') {
      senderDeviceId = String((parsed as Partial<DeltaExportFile>).device_id).trim() || 'peer';
    }
  }

  if (!rawOps) {
    throw new Error('Payload is not a valid Community Pedigree P2P or delta outbox message.');
  }
  if (rawOps.length > MAX_DELTA_OPERATIONS) {
    throw new Error(
      `Peer payload contains ${rawOps.length.toLocaleString()} operations, exceeding the ${MAX_DELTA_OPERATIONS.toLocaleString()} safety limit.`
    );
  }

  const validOps = rawOps.filter((op): op is SyncOperation => isValidSyncOperation(op));
  return {
    messageKind: 'delta',
    senderDeviceId,
    operations: validOps,
  };
}

/**
 * Summarizes task-specific reconciliation outcomes from a `mergeDeltaOperations` run.
 */
export function summarizeTaskReconciliation(params: {
  peerDeviceId: string;
  receivedOps: SyncOperation[];
  appliedOpCount: number;
  newConflicts: SyncConflictEntry[];
  reconciledAtIso?: string;
}): P2pReconciliationSummary {
  const taskOpsReceivedCount = params.receivedOps.filter(
    (op) => op.entity_type === 'task'
  ).length;
  const newTaskConflictCount = params.newConflicts.filter(
    (c) => c.entity_type === 'task'
  ).length;

  return {
    peerDeviceId: params.peerDeviceId || 'peer',
    receivedOpsCount: params.receivedOps.length,
    appliedOpCount: params.appliedOpCount,
    taskOpsReceivedCount,
    newConflictCount: params.newConflicts.length,
    newTaskConflictCount,
    reconciledAtIso: params.reconciledAtIso || nowIsoUtc(),
  };
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const hasB1 = i + 1 < bytes.length;
    const hasB2 = i + 2 < bytes.length;
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_CHARS[(triplet >> 18) & 63];
    out += BASE64_CHARS[(triplet >> 12) & 63];
    out += hasB1 ? BASE64_CHARS[(triplet >> 6) & 63] : '=';
    out += hasB2 ? BASE64_CHARS[triplet & 63] : '=';
  }
  return out;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, '');
  if (typeof atob === 'function') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const len = clean.length;
  if (len % 4 !== 0) {
    throw new Error('Malformed base64 pairing token.');
  }
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  const outLen = (len / 4) * 3 - padding;
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c0 = BASE64_CHARS.indexOf(clean[i]);
    const c1 = BASE64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : BASE64_CHARS.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : BASE64_CHARS.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error('Malformed base64 character in pairing token.');
    }
    const triplet = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 16) & 255;
    if (outIdx < outLen) out[outIdx++] = (triplet >> 8) & 255;
    if (outIdx < outLen) out[outIdx++] = triplet & 255;
  }
  return out;
}

/**
 * Encodes a serverless WebRTC SDP Offer/Answer envelope into a single-line copy/QR token (`CP-LAN1:...`).
 * Uses pure UTF-8 base64 without requiring DOM `window.btoa` or Node `Buffer`.
 */
export function encodeP2pSignalToken(envelope: P2pSignalEnvelope): string {
  const json = JSON.stringify(envelope);
  const bytes = new TextEncoder().encode(json);
  return `CP-LAN1:${encodeBytesToBase64(bytes)}`;
}

/**
 * Decodes a `CP-LAN1:...` or raw JSON WebRTC SDP Offer/Answer token.
 */
export function decodeP2pSignalToken(rawToken: string): P2pSignalEnvelope {
  const clean = rawToken.trim();
  if (!clean) {
    throw new Error('Paste a peer connection code first.');
  }
  let jsonStr = clean;
  if (clean.startsWith('CP-LAN1:')) {
    const b64 = clean.slice('CP-LAN1:'.length).trim();
    const bytes = decodeBase64ToBytes(b64);
    jsonStr = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(jsonStr) as Partial<P2pSignalEnvelope>;
  if (
    !parsed ||
    parsed.v !== 1 ||
    (parsed.type !== 'offer' && parsed.type !== 'answer') ||
    typeof parsed.sdp !== 'string' ||
    !parsed.sdp.trim()
  ) {
    throw new Error('Invalid LAN P2P pairing code. Copy the full CP-LAN1 token from your peer device.');
  }
  return {
    v: 1,
    type: parsed.type,
    deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId.trim() ? parsed.deviceId.trim() : 'peer',
    sdp: parsed.sdp,
    createdAtIso: typeof parsed.createdAtIso === 'string' ? parsed.createdAtIso : nowIsoUtc(),
  };
}
