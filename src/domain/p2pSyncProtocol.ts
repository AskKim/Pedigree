/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure TypeScript Local P2P / LAN Outbox Reconciliation Protocol (`src/domain/p2pSyncProtocol.ts`).
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
  createGenericP2pDeltaMessage,
  decodeGenericP2pSignalToken,
  encodeGenericP2pSignalToken,
  parseGenericP2pWirePayload,
  type GenericP2pSignalEnvelope,
} from '@engine/primitives/genericSync';
import { SyncConflictEntry, SyncOperation } from './syncOutbox';

export const PEDIGREE_P2P_DELTA_KIND = 'pedigree-p2p-delta-v1' as const;
export const PEDIGREE_P2P_ACK_KIND = 'pedigree-p2p-ack-v1' as const;
export const PEDIGREE_P2P_SIGNAL_PREFIX = 'CP-LAN1:' as const;

export type P2pWireMessage =
  | {
      kind: typeof PEDIGREE_P2P_DELTA_KIND;
      senderDeviceId: string;
      sentAtIso: string;
      operations: SyncOperation[];
    }
  | {
      kind: typeof PEDIGREE_P2P_ACK_KIND;
      senderDeviceId: string;
      receivedCount: number;
      appliedCount: number;
      taskOpsCount: number;
      conflictCount: number;
      ackAtIso: string;
    };

export type P2pSignalEnvelope = GenericP2pSignalEnvelope;

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
  return createGenericP2pDeltaMessage({
    deltaKind: PEDIGREE_P2P_DELTA_KIND,
    senderDeviceId: params.senderDeviceId,
    operations: params.operations,
    includePeerRelays: params.includePeerRelays,
    sentAtIso: params.sentAtIso || nowIsoUtc(),
    maxOperations: MAX_DELTA_OPERATIONS,
  });
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
    kind: PEDIGREE_P2P_ACK_KIND,
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
  return parseGenericP2pWirePayload<
    SyncOperation,
    Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>
  >(rawText, {
    ackKind: PEDIGREE_P2P_ACK_KIND,
    maxOperations: MAX_DELTA_OPERATIONS,
    validateOperation: isValidSyncOperation,
    invalidPayloadMessage: 'Payload is not a valid Pedigree P2P or delta outbox message.',
  });
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

/**
 * Encodes a serverless WebRTC SDP Offer/Answer envelope into a single-line copy/QR token (`CP-LAN1:...`).
 * Uses pure UTF-8 base64 without requiring DOM `window.btoa` or Node `Buffer`.
 */
export function encodeP2pSignalToken(envelope: P2pSignalEnvelope): string {
  return encodeGenericP2pSignalToken(envelope, PEDIGREE_P2P_SIGNAL_PREFIX);
}

/**
 * Decodes a `CP-LAN1:...` or raw JSON WebRTC SDP Offer/Answer token.
 */
export function decodeP2pSignalToken(rawToken: string): P2pSignalEnvelope {
  return decodeGenericP2pSignalToken(rawToken, PEDIGREE_P2P_SIGNAL_PREFIX);
}
