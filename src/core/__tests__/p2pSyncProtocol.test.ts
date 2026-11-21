import { describe, expect, it } from 'vitest';
import {
  createP2pAckWireMessage,
  createP2pDeltaWireMessage,
  decodeP2pSignalToken,
  encodeP2pSignalToken,
  parseP2pWireOrDeltaPayload,
  summarizeTaskReconciliation,
} from '../p2pSyncProtocol';
import {
  BarnDatabaseSnapshot,
  BarnTask,
} from '../models';
import {
  diffEntityFieldsToOperations,
  mergeDeltaOperations,
} from '../syncOutbox';
import { makeEmptySnapshot } from './testFixtures';

const TS1 = '2026-04-10T10:00:00.000Z';
const TS2 = '2026-04-10T11:00:00.000Z';

describe('p2pSyncProtocol — LAN P2P Signaling, Wire Framing & Outbox Reconciliation', () => {
  it('roundtrips UTF-8 SDP signaling envelopes via CP-LAN1 tokens', () => {
    const token = encodeP2pSignalToken({
      v: 1,
      type: 'offer',
      deviceId: 'barn-tablet-ñ1',
      sdp: 'v=0\r\no=- 12345 2 IN IP4 192.168.1.42\r\ns=Pedigree™\r\n',
      createdAtIso: TS1,
    });

    expect(token.startsWith('CP-LAN1:')).toBe(true);
    const decoded = decodeP2pSignalToken(token);
    expect(decoded.type).toBe('offer');
    expect(decoded.deviceId).toBe('barn-tablet-ñ1');
    expect(decoded.sdp).toContain('Pedigree™');
  });

  it('frames P2P delta and ack packets and rejects malformed payloads', () => {
    const op = diffEntityFieldsToOperations({
      entityType: 'task',
      previous: undefined,
      next: {
        id: 'task-1',
        species: 'Rabbit',
        title: 'Check Nestbox',
        category: 'Nestbox',
        priority: 'High',
        startDateIso: '2026-04-10',
        dueDateIso: '2026-04-12',
        linkedAnimalId: '',
        linkedAnimalName: '',
        linkedBreedingId: '',
        completed: false,
        _rev: 1,
        createdAt: TS1,
        updatedAt: TS1,
      } satisfies BarnTask,
      deviceId: 'dev-a',
      nextCounter: (() => {
        let c = 0;
        return () => ++c;
      })(),
      timestamp: TS1,
      recordRev: 1,
    });

    const wire = createP2pDeltaWireMessage({
      senderDeviceId: 'dev-a',
      operations: op,
      sentAtIso: TS1,
    });

    const parsedDelta = parseP2pWireOrDeltaPayload(JSON.stringify(wire));
    expect(parsedDelta.messageKind).toBe('delta');
    expect(parsedDelta.senderDeviceId).toBe('dev-a');
    expect(parsedDelta.operations.length).toBeGreaterThan(0);

    const ack = createP2pAckWireMessage({
      senderDeviceId: 'dev-b',
      receivedCount: parsedDelta.operations.length,
      appliedCount: parsedDelta.operations.length,
      taskOpsCount: parsedDelta.operations.length,
      conflictCount: 0,
      ackAtIso: TS2,
    });
    const parsedAck = parseP2pWireOrDeltaPayload(JSON.stringify(ack));
    expect(parsedAck.messageKind).toBe('ack');
    expect(parsedAck.ack?.appliedCount).toBe(parsedDelta.operations.length);

    expect(() => parseP2pWireOrDeltaPayload('{"invalid":true}')).toThrow();
  });

  it('reconciles rescheduled Gantt startDateIso/dueDateIso and surfaces field conflicts', () => {
    const baseTask: BarnTask = {
      id: 'task-99',
      species: 'Rabbit',
      title: 'Wean Litter A',
      category: 'Weaning',
      priority: 'Normal',
      startDateIso: '2026-04-10',
      dueDateIso: '2026-04-14',
      linkedAnimalId: '',
      linkedAnimalName: '',
      linkedBreedingId: '',
      completed: false,
      _rev: 1,
      createdAt: TS1,
      updatedAt: TS1,
    };

    const snapshotA: BarnDatabaseSnapshot = makeEmptySnapshot({
      tasks: [{ ...baseTask, dueDateIso: '2026-04-16', _rev: 2, updatedAt: TS1 }],
    });

    let counterB = 10;
    const opsFromB = diffEntityFieldsToOperations({
      entityType: 'task',
      previous: baseTask,
      next: {
        ...baseTask,
        startDateIso: '2026-04-11',
        dueDateIso: '2026-04-18',
        _rev: 2,
        updatedAt: TS2,
      },
      deviceId: 'dev-b',
      nextCounter: () => ++counterB,
      timestamp: TS2,
      recordRev: 2,
    });

    const localDueOp = diffEntityFieldsToOperations({
      entityType: 'task',
      previous: baseTask,
      next: { ...baseTask, dueDateIso: '2026-04-16', _rev: 2, updatedAt: TS1 },
      deviceId: 'dev-a',
      nextCounter: () => 5,
      timestamp: TS1,
      recordRev: 2,
    });

    const merged = mergeDeltaOperations(snapshotA, localDueOp, opsFromB, 'dev-a');

    const updatedTask = merged.nextSnapshot.tasks.find((t) => t.id === 'task-99');
    expect(updatedTask?.startDateIso).toBe('2026-04-11');
    expect(updatedTask?.dueDateIso).toBe('2026-04-18');
    expect(merged.newConflicts.some((c) => c.field_name === 'dueDateIso')).toBe(true);

    const summary = summarizeTaskReconciliation({
      peerDeviceId: 'dev-b',
      receivedOps: opsFromB,
      appliedOpCount: merged.appliedOpCount,
      newConflicts: merged.newConflicts,
      reconciledAtIso: TS2,
    });

    expect(summary.taskOpsReceivedCount).toBe(opsFromB.length);
    expect(summary.newTaskConflictCount).toBeGreaterThanOrEqual(1);
    expect(summary.appliedOpCount).toBeGreaterThan(0);
  });
});
