/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Serverless LAN / Peer-to-Peer WebRTC DataChannel & Folder Sync Bridge (`src/storage/p2pLanChannel.ts`).
 *
 * Enables two devices on the same local Wi-Fi / LAN (with ZERO cloud servers or signaling relays)
 * to pair via single-line `CP-LAN1:...` SDP offer/answer codes and exchange `SyncOperation[]`
 * outbox logs directly over an ordered `RTCDataChannel`.
 */

import { nowIsoUtc } from '../core/models';
import {
  decodeP2pSignalToken,
  encodeP2pSignalToken,
  P2pWireMessage,
  parseP2pWireOrDeltaPayload,
} from '../core/p2pSyncProtocol';
import { SyncOperation } from '../core/syncOutbox';
import {
  resumePersistedDirectorySyncIfGranted,
  syncWithPickedDirectory,
} from './localSyncChannels';

export type LanP2pSessionState =
  | 'idle'
  | 'creating_offer'
  | 'awaiting_answer'
  | 'creating_answer'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export interface LanP2pSessionController {
  getState: () => LanP2pSessionState;
  createOfferToken: () => Promise<string>;
  acceptOfferAndCreateAnswerToken: (offerToken: string) => Promise<string>;
  completeHandshakeWithAnswer: (answerToken: string) => Promise<void>;
  sendWireMessage: (message: P2pWireMessage) => void;
  close: () => void;
}

const DATA_CHANNEL_LABEL = 'community-pedigree-sync';
const ICE_GATHER_TIMEOUT_MS = 2200;
const CHUNK_SIZE_CHARS = 16384;

interface ChunkFrame {
  kind: 'cp-lan-chunk-v1';
  transferId: string;
  index: number;
  total: number;
  data: string;
}

export function supportsLanWebRtcP2p(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

function waitForIceGathering(pc: RTCPeerConnection, signalClosed: () => boolean): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pc.removeEventListener('icegatheringstatechange', onStateChange);
      pc.removeEventListener('icecandidate', onCandidate);
      resolve();
    };

    const onStateChange = () => {
      if (signalClosed() || pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      if (signalClosed() || ev.candidate === null) {
        finish();
      }
    };

    pc.addEventListener('icegatheringstatechange', onStateChange);
    pc.addEventListener('icecandidate', onCandidate);
    timer = setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
  });
}

/**
 * Creates a clean, self-contained serverless WebRTC DataChannel session controller.
 * Configured with `iceServers: []` so all ICE candidates stay strictly on the local LAN/device.
 */
export function createLanP2pSession(options: {
  deviceId: string;
  onDeltaOperations: (ops: SyncOperation[], senderDeviceId: string) => void;
  onAckReceived?: (ack: Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }>) => void;
  onStateChange?: (state: LanP2pSessionState, detail?: string) => void;
  onError?: (message: string) => void;
}): LanP2pSessionController {
  let state: LanP2pSessionState = 'idle';
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let closed = false;
  const incomingChunkMap = new Map<string, { parts: string[]; received: number; total: number }>();

  const setState = (next: LanP2pSessionState, detail?: string) => {
    if (closed && next !== 'closed') return;
    state = next;
    options.onStateChange?.(next, detail);
  };

  const fail = (msg: string) => {
    setState('error', msg);
    options.onError?.(msg);
  };

  const handleCompleteTextPayload = (rawText: string) => {
    try {
      const parsed = parseP2pWireOrDeltaPayload(rawText);
      if (parsed.messageKind === 'ack' && parsed.ack) {
        options.onAckReceived?.(parsed.ack);
        return;
      }
      options.onDeltaOperations(parsed.operations, parsed.senderDeviceId);
    } catch (err) {
      options.onError?.(err instanceof Error ? err.message : 'Invalid incoming LAN sync message.');
    }
  };

  const attachDataChannel = (channel: RTCDataChannel) => {
    dc = channel;
    channel.onopen = () => {
      setState('connected', `Peer link open (${channel.label})`);
    };
    channel.onclose = () => {
      if (!closed) {
        setState('closed', 'Peer disconnected');
      }
    };
    channel.onerror = () => {
      if (!closed) {
        fail('WebRTC DataChannel transport error.');
      }
    };
    channel.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      const text = ev.data;
      if (text.includes('"cp-lan-chunk-v1"')) {
        try {
          const frame = JSON.parse(text) as Partial<ChunkFrame>;
          if (
            frame.kind === 'cp-lan-chunk-v1' &&
            typeof frame.transferId === 'string' &&
            typeof frame.index === 'number' &&
            typeof frame.total === 'number' &&
            typeof frame.data === 'string' &&
            frame.total > 0 &&
            frame.total <= 2048 &&
            frame.index >= 0 &&
            frame.index < frame.total
          ) {
            let bucket = incomingChunkMap.get(frame.transferId);
            if (!bucket) {
              bucket = {
                parts: new Array<string>(frame.total),
                received: 0,
                total: frame.total,
              };
              incomingChunkMap.set(frame.transferId, bucket);
            }
            if (bucket.parts[frame.index] === undefined) {
              bucket.parts[frame.index] = frame.data;
              bucket.received += 1;
            }
            if (bucket.received === bucket.total) {
              incomingChunkMap.delete(frame.transferId);
              handleCompleteTextPayload(bucket.parts.join(''));
            }
            return;
          }
        } catch {
          // Fall through to normal parser
        }
      }
      handleCompleteTextPayload(text);
    };
  };

  const ensurePeerConnection = () => {
    if (!supportsLanWebRtcP2p()) {
      throw new Error('WebRTC DataChannel is not supported in this browser. Use LAN Folder Sync or Delta JSON instead.');
    }
    if (pc) {
      try {
        pc.close();
      } catch {
        // Ignore cleanup error
      }
    }
    closed = false;
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.onconnectionstatechange = () => {
      if (!pc || closed) return;
      if (pc.connectionState === 'connected') {
        if (dc?.readyState === 'open') {
          setState('connected');
        }
      } else if (pc.connectionState === 'failed') {
        fail('LAN peer connection failed. Verify both devices are on the same Wi-Fi/LAN.');
      } else if (pc.connectionState === 'closed') {
        setState('closed');
      }
    };
    pc.ondatachannel = (ev) => {
      attachDataChannel(ev.channel);
    };
    return pc;
  };

  return {
    getState: () => state,

    createOfferToken: async () => {
      const conn = ensurePeerConnection();
      setState('creating_offer');
      const channel = conn.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      attachDataChannel(channel);

      const offer = await conn.createOffer();
      await conn.setLocalDescription(offer);
      await waitForIceGathering(conn, () => closed);

      const localSdp = conn.localDescription?.sdp || offer.sdp || '';
      if (!localSdp) {
        throw new Error('Failed to generate local WebRTC offer SDP.');
      }
      setState('awaiting_answer');
      return encodeP2pSignalToken({
        v: 1,
        type: 'offer',
        deviceId: options.deviceId,
        sdp: localSdp,
        createdAtIso: nowIsoUtc(),
      });
    },

    acceptOfferAndCreateAnswerToken: async (offerToken: string) => {
      const env = decodeP2pSignalToken(offerToken);
      if (env.type !== 'offer') {
        throw new Error('Expected a peer Offer code (`CP-LAN1:...`) from the initiating device.');
      }
      const conn = ensurePeerConnection();
      setState('creating_answer');
      await conn.setRemoteDescription({ type: 'offer', sdp: env.sdp });
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      await waitForIceGathering(conn, () => closed);

      const localSdp = conn.localDescription?.sdp || answer.sdp || '';
      if (!localSdp) {
        throw new Error('Failed to generate local WebRTC answer SDP.');
      }
      setState('connecting', `Connecting to ${env.deviceId}...`);
      return encodeP2pSignalToken({
        v: 1,
        type: 'answer',
        deviceId: options.deviceId,
        sdp: localSdp,
        createdAtIso: nowIsoUtc(),
      });
    },

    completeHandshakeWithAnswer: async (answerToken: string) => {
      if (!pc) {
        throw new Error('Create a LAN Offer code first before applying a peer Answer code.');
      }
      const env = decodeP2pSignalToken(answerToken);
      if (env.type !== 'answer') {
        throw new Error('Expected a peer Answer code (`CP-LAN1:...`) from the joining device.');
      }
      setState('connecting', `Connecting to ${env.deviceId}...`);
      await pc.setRemoteDescription({ type: 'answer', sdp: env.sdp });
    },

    sendWireMessage: (message: P2pWireMessage) => {
      if (!dc || dc.readyState !== 'open') {
        throw new Error('LAN DataChannel is not open yet. Complete pairing first.');
      }
      const serialized = JSON.stringify(message);
      if (serialized.length <= CHUNK_SIZE_CHARS) {
        dc.send(serialized);
        return;
      }
      const total = Math.ceil(serialized.length / CHUNK_SIZE_CHARS);
      const transferId = `${options.deviceId}-${Date.now().toString(36)}`;
      for (let i = 0; i < total; i++) {
        const chunk: ChunkFrame = {
          kind: 'cp-lan-chunk-v1',
          transferId,
          index: i,
          total,
          data: serialized.slice(i * CHUNK_SIZE_CHARS, (i + 1) * CHUNK_SIZE_CHARS),
        };
        dc.send(JSON.stringify(chunk));
      }
    },

    close: () => {
      closed = true;
      incomingChunkMap.clear();
      if (dc) {
        try {
          dc.onopen = null;
          dc.onclose = null;
          dc.onerror = null;
          dc.onmessage = null;
          dc.close();
        } catch {
          // Ignore close error
        }
        dc = null;
      }
      if (pc) {
        try {
          pc.onconnectionstatechange = null;
          pc.ondatachannel = null;
          pc.close();
        } catch {
          // Ignore close error
        }
        pc = null;
      }
      state = 'closed';
      options.onStateChange?.('closed');
    },
  };
}

/**
 * Reconciles delta outbox files using a persisted or freshly picked LAN / SyncThing folder.
 */
export async function reconcileWithPickedSyncFolder(params: {
  deviceId: string;
  localOperations: SyncOperation[];
  masterBackupJson: string;
  passphrase?: string;
}): Promise<{
  folderName: string;
  peerFilesRead: number;
  incomingOps: SyncOperation[];
  encryptedPeersSkipped: number;
  wroteEncrypted: boolean;
}> {
  const resumed = await resumePersistedDirectorySyncIfGranted({
    deviceId: params.deviceId,
    localOperations: params.localOperations,
    masterBackupJson: params.masterBackupJson,
    passphrase: params.passphrase,
  });
  if (resumed.resumed) {
    return {
      folderName: resumed.folderName,
      peerFilesRead: resumed.peerFilesRead,
      incomingOps: resumed.incomingOps,
      encryptedPeersSkipped: resumed.encryptedPeersSkipped,
      wroteEncrypted: resumed.wroteEncrypted,
    };
  }
  return syncWithPickedDirectory({
    deviceId: params.deviceId,
    localOperations: params.localOperations,
    masterBackupJson: params.masterBackupJson,
    passphrase: params.passphrase,
  });
}
