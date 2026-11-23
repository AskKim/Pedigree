/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive Drag-and-Drop Barn Scheduler Gantt Timeline, Smart Priority Escalation,
 * and Local P2P / LAN Outbox Reconciliation Panel (`src/components/BarnSchedulerGantt.tsx`).
 */

import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderSync,
  Layers,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BarnGanttBarItem,
  buildBarnGanttTimeline,
  GanttGroupingMode,
  GanttWindowDays,
  resizeTaskStartDateByDays,
  shiftTaskDatesByDays,
} from '../core/barnScheduler';
import { formatSystemTaskTitle } from '../core/calendarExport';
import {
  addDaysIso,
  Animal,
  BarnSettings,
  BarnTask,
  BreedingRecord,
  formatReadableDate,
  SpeciesProfile,
  todayDateIso,
} from '../core/models';
import {
  createP2pAckWireMessage,
  createP2pDeltaWireMessage,
  P2pReconciliationSummary,
  P2pWireMessage,
  parseP2pWireOrDeltaPayload,
} from '../core/p2pSyncProtocol';
import { SyncConflictEntry, SyncOperation } from '../core/syncOutbox';
import { BackupSyncStatus } from '../storage/localSyncChannels';
import {
  createLanP2pSession,
  LanP2pSessionController,
  LanP2pSessionState,
  reconcileWithPickedSyncFolder,
  supportsLanWebRtcP2p,
} from '../storage/p2pLanChannel';
import { copyTextWithFallback } from '../utils/webFileActions';

interface BarnSchedulerGanttProps {
  speciesProfile: SpeciesProfile;
  animals: Animal[];
  tasks: BarnTask[];
  breedings: BreedingRecord[];
  settings: BarnSettings;
  deviceId: string;
  syncOperations: SyncOperation[];
  syncConflicts: SyncConflictEntry[];
  backupSyncStatus?: BackupSyncStatus | null;
  masterBackupJson?: string;
  onToggleTask: (task: BarnTask) => Promise<boolean | void> | void;
  onRescheduleTask: (
    task: BarnTask,
    nextDates: { startDateIso?: string; dueDateIso: string }
  ) => Promise<boolean>;
  onApplySmartEscalations: (tasksToEscalate?: BarnTask[]) => Promise<number>;
  onDeleteTask: (taskId: string) => void;
  onOpenAnimal: (animalId: string) => void;
  onReconcileOutboxOps: (
    incomingOps: SyncOperation[],
    peerDeviceId?: string
  ) => Promise<P2pReconciliationSummary>;
  onResolveSyncConflict: (conflictId: string, useSide: 'winning' | 'losing') => Promise<void>;
  onDismissSyncConflict: (conflictId: string) => Promise<void>;
  onBuildLocalDeltaJson: () => { filename: string; content: string };
}

interface ActiveDragState {
  task: BarnTask;
  mode: 'move' | 'resize-start';
  startClientX: number;
  trackWidthPx: number;
  deltaDays: number;
}

export function BarnSchedulerGantt({
  speciesProfile,
  animals,
  tasks,
  breedings,
  settings,
  deviceId,
  syncOperations,
  syncConflicts,
  backupSyncStatus,
  masterBackupJson,
  onToggleTask,
  onRescheduleTask,
  onApplySmartEscalations,
  onDeleteTask,
  onOpenAnimal,
  onReconcileOutboxOps,
  onResolveSyncConflict,
  onDismissSyncConflict,
  onBuildLocalDeltaJson,
}: BarnSchedulerGanttProps) {
  const baseId = useId();
  const today = todayDateIso();

  const [windowStartIso, setWindowStartIso] = useState<string>(() => addDaysIso(today, -3));
  const [windowDays, setWindowDays] = useState<GanttWindowDays>(21);
  const [grouping, setGrouping] = useState<GanttGroupingMode>('breeding_or_animal');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [escalatingBusy, setEscalatingBusy] = useState(false);
  const [rescheduleBusyId, setRescheduleBusyId] = useState<string | null>(null);

  // Drag-and-drop state
  const [dragState, setDragState] = useState<ActiveDragState | null>(null);
  const dragStateRef = useRef<ActiveDragState | null>(null);
  const timelineGridRef = useRef<HTMLDivElement | null>(null);

  // P2P / LAN Outbox Reconciliation drawer state
  const [showP2pDrawer, setShowP2pDrawer] = useState(false);
  const [p2pState, setP2pState] = useState<LanP2pSessionState>('idle');
  const [p2pStatusText, setP2pStatusText] = useState<string>('');
  const [p2pError, setP2pError] = useState<string | null>(null);
  const [localOfferToken, setLocalOfferToken] = useState('');
  const [remoteAnswerInput, setRemoteAnswerInput] = useState('');
  const [remoteOfferInput, setRemoteOfferInput] = useState('');
  const [localAnswerToken, setLocalAnswerToken] = useState('');
  const [manualDeltaInput, setManualDeltaInput] = useState('');
  const [p2pBusy, setP2pBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState<P2pReconciliationSummary | null>(null);
  const [lastPeerAck, setLastPeerAck] = useState<
    Extract<P2pWireMessage, { kind: 'pedigree-p2p-ack-v1' }> | null
  >(null);

  const sessionRef = useRef<LanP2pSessionController | null>(null);
  const onReconcileRef = useRef(onReconcileOutboxOps);
  onReconcileRef.current = onReconcileOutboxOps;
  const onRescheduleRef = useRef(onRescheduleTask);
  onRescheduleRef.current = onRescheduleTask;

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  const timeline = useMemo(
    () =>
      buildBarnGanttTimeline({
        tasks,
        breedings,
        speciesProfile,
        windowStartIso,
        windowDays,
        grouping,
        includeCompleted,
        todayIso: today,
      }),
    [tasks, breedings, speciesProfile, windowStartIso, windowDays, grouping, includeCompleted, today]
  );

  const taskTitleContext = useMemo(
    () => ({
      animals,
      breedings,
      speciesProfiles: [speciesProfile],
    }),
    [animals, breedings, speciesProfile]
  );

  const escalatedBars = useMemo(() => {
    const out: BarnGanttBarItem[] = [];
    for (const lane of timeline.lanes) {
      for (const bar of lane.bars) {
        if (bar.escalation.isEscalated) {
          out.push(bar);
        }
      }
    }
    return out.sort((a, b) => b.escalation.urgencyScore - a.escalation.urgencyScore);
  }, [timeline.lanes]);

  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [selectedTaskId, tasks]
  );

  const unresolvedConflicts = useMemo(
    () =>
      syncConflicts
        .filter((c) => !c.resolved)
        .sort((a, b) => {
          if (a.entity_type === 'task' && b.entity_type !== 'task') return -1;
          if (b.entity_type === 'task' && a.entity_type !== 'task') return 1;
          return b.detected_at.localeCompare(a.detected_at);
        }),
    [syncConflicts]
  );

  // Global pointer listeners while actively dragging a Gantt bar
  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (ev: PointerEvent) => {
      const active = dragStateRef.current;
      if (!active) return;
      const colWidth = Math.max(16, active.trackWidthPx / windowDays);
      const nextDelta = Math.round((ev.clientX - active.startClientX) / colWidth);
      if (nextDelta !== active.deltaDays) {
        const updated = { ...active, deltaDays: nextDelta };
        dragStateRef.current = updated;
        setDragState(updated);
      }
    };

    const commitDrag = async () => {
      const active = dragStateRef.current;
      dragStateRef.current = null;
      setDragState(null);
      if (!active || active.deltaDays === 0) return;

      const ts = new Date().toISOString();
      const updated =
        active.mode === 'move'
          ? shiftTaskDatesByDays(active.task, active.deltaDays, ts)
          : resizeTaskStartDateByDays(active.task, active.deltaDays, ts);
      if (!updated) return;

      setRescheduleBusyId(active.task.id);
      try {
        await onRescheduleRef.current(active.task, {
          startDateIso: updated.startDateIso ?? '',
          dueDateIso: updated.dueDateIso,
        });
      } finally {
        setRescheduleBusyId(null);
      }
    };

    const handlePointerCancel = () => {
      dragStateRef.current = null;
      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', commitDrag);
    window.addEventListener('pointercancel', handlePointerCancel);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', commitDrag);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [dragState !== null, windowDays]);

  const startBarDrag = (
    e: React.PointerEvent<HTMLElement>,
    task: BarnTask,
    mode: 'move' | 'resize-start'
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    const trackWidthPx = timelineGridRef.current?.clientWidth || 560;
    const next: ActiveDragState = {
      task,
      mode,
      startClientX: e.clientX,
      trackWidthPx,
      deltaDays: 0,
    };
    dragStateRef.current = next;
    setDragState(next);
    setSelectedTaskId(task.id);
  };

  const handleNudgeTaskDays = async (
    task: BarnTask,
    deltaDays: number,
    mode: 'move' | 'resize-start'
  ) => {
    const ts = new Date().toISOString();
    const updated =
      mode === 'move'
        ? shiftTaskDatesByDays(task, deltaDays, ts)
        : resizeTaskStartDateByDays(task, deltaDays, ts);
    if (!updated) return;
    setRescheduleBusyId(task.id);
    try {
      await onRescheduleTask(task, {
        startDateIso: updated.startDateIso ?? '',
        dueDateIso: updated.dueDateIso,
      });
    } finally {
      setRescheduleBusyId(null);
    }
  };

  const handleApplyEscalationsClick = async () => {
    setEscalatingBusy(true);
    try {
      await onApplySmartEscalations(tasks);
    } finally {
      setEscalatingBusy(false);
    }
  };

  const ensureLanSession = useCallback((): LanP2pSessionController => {
    if (sessionRef.current && sessionRef.current.getState() !== 'closed') {
      return sessionRef.current;
    }
    const ctrl = createLanP2pSession({
      deviceId,
      onDeltaOperations: (ops, senderDeviceId) => {
        void onReconcileRef
          .current(ops, senderDeviceId)
          .then((summary) => {
            setLastSummary(summary);
            setP2pError(null);
            setP2pStatusText(
              `Reconciled ${summary.appliedOpCount} op(s) from ${summary.peerDeviceId} (${summary.taskOpsReceivedCount} task op(s)).`
            );
            try {
              ctrl.sendWireMessage(
                createP2pAckWireMessage({
                  senderDeviceId: deviceId,
                  receivedCount: summary.receivedOpsCount,
                  appliedCount: summary.appliedOpCount,
                  taskOpsCount: summary.taskOpsReceivedCount,
                  conflictCount: summary.newConflictCount,
                })
              );
            } catch {
              // Ignore ack error if channel closed concurrently
            }
          })
          .catch((err) => {
            setP2pError(err instanceof Error ? err.message : 'Outbox reconciliation failed.');
          });
      },
      onAckReceived: (ack) => {
        setLastPeerAck(ack);
        setP2pStatusText(
          `Peer ${ack.senderDeviceId} confirmed: ${ack.appliedCount} of ${ack.receivedCount} op(s) merged (${ack.conflictCount} conflict(s)).`
        );
      },
      onStateChange: (nextState, detail) => {
        setP2pState(nextState);
        if (detail) setP2pStatusText(detail);
      },
      onError: (msg) => {
        setP2pError(msg);
      },
    });
    sessionRef.current = ctrl;
    return ctrl;
  }, [deviceId]);

  const handleCreateOffer = async () => {
    setP2pBusy(true);
    setP2pError(null);
    try {
      sessionRef.current?.close();
      sessionRef.current = null;
      const sess = ensureLanSession();
      const token = await sess.createOfferToken();
      setLocalOfferToken(token);
      setLocalAnswerToken('');
      setP2pStatusText('Offer code generated. Share it with your second device on this LAN.');
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Unable to create LAN offer.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleAcceptOffer = async () => {
    setP2pBusy(true);
    setP2pError(null);
    try {
      sessionRef.current?.close();
      sessionRef.current = null;
      const sess = ensureLanSession();
      const answerToken = await sess.acceptOfferAndCreateAnswerToken(remoteOfferInput);
      setLocalAnswerToken(answerToken);
      setP2pStatusText('Answer code ready. Send it back to the host device to open the link.');
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Invalid peer Offer code.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleCompleteHandshake = async () => {
    if (!sessionRef.current) {
      setP2pError('Generate an Offer code first.');
      return;
    }
    setP2pBusy(true);
    setP2pError(null);
    try {
      await sessionRef.current.completeHandshakeWithAnswer(remoteAnswerInput);
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Invalid peer Answer code.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleSendOutboxOverP2p = () => {
    if (!sessionRef.current || p2pState !== 'connected') {
      setP2pError('Complete the LAN P2P pairing first.');
      return;
    }
    setP2pError(null);
    try {
      const msg = createP2pDeltaWireMessage({
        senderDeviceId: deviceId,
        operations: syncOperations,
        includePeerRelays: true,
      });
      sessionRef.current.sendWireMessage(msg);
      setP2pStatusText(
        `Sent ${msg.kind === 'pedigree-p2p-delta-v1' ? msg.operations.length : 0} outbox op(s) to connected peer.`
      );
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Failed to send outbox over WebRTC.');
    }
  };

  const handleFolderSyncClick = async () => {
    setP2pBusy(true);
    setP2pError(null);
    try {
      const deltaPayload = onBuildLocalDeltaJson();
      const folderRes = await reconcileWithPickedSyncFolder({
        deviceId,
        localOperations: syncOperations,
        masterBackupJson: masterBackupJson || deltaPayload.content,
      });
      const summary = await onReconcileOutboxOps(
        folderRes.incomingOps,
        `folder:${folderRes.folderName}`
      );
      setLastSummary(summary);
      setP2pStatusText(
        `Folder "${folderRes.folderName}": read ${folderRes.peerFilesRead} peer file(s), merged ${summary.appliedOpCount} op(s).`
      );
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Shared folder sync failed.');
    } finally {
      setP2pBusy(false);
    }
  };

  const handleManualReconcileClick = async () => {
    setP2pError(null);
    if (!manualDeltaInput.trim()) return;
    setP2pBusy(true);
    try {
      const parsed = parseP2pWireOrDeltaPayload(manualDeltaInput);
      const summary = await onReconcileOutboxOps(parsed.operations, parsed.senderDeviceId);
      setLastSummary(summary);
      setManualDeltaInput('');
      setP2pStatusText(
        `Manual delta merged: ${summary.appliedOpCount} of ${summary.receivedOpsCount} op(s) applied.`
      );
    } catch (err) {
      setP2pError(err instanceof Error ? err.message : 'Could not parse delta JSON payload.');
    } finally {
      setP2pBusy(false);
    }
  };

  const getBarToneClasses = (bar: BarnGanttBarItem): string => {
    if (bar.task.completed) {
      return 'bg-[var(--barn-subtle)] border-[var(--barn-border)] text-[var(--barn-muted)] line-through';
    }
    if (bar.escalation.isOverdue || bar.escalation.isCriticalTimeWindow) {
      return 'bg-[var(--barn-danger)] text-[var(--barn-on-danger)] border-transparent';
    }
    if (bar.escalation.effectivePriority === 'High') {
      return 'bg-[var(--barn-terracotta)] text-[var(--barn-on-terracotta)] border-transparent';
    }
    return 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-transparent';
  };

  return (
    <div className="space-y-4">
      {/* Smart Priority Escalation Banner */}
      {(timeline.summary.escalatedCount > 0 || timeline.summary.criticalNestboxOrBirthCount > 0) && (
        <div
          role="status"
          className="rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs"
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <div className="font-semibold text-[var(--barn-ink)]">
                Smart Priority Escalation:{' '}
                <span className="font-mono tabular-nums">
                  {timeline.summary.escalatedCount}
                </span>{' '}
                chore{timeline.summary.escalatedCount === 1 ? '' : 's'} queued for priority boost
                {timeline.summary.criticalNestboxOrBirthCount > 0 && (
                  <span className="text-[var(--barn-danger)]">
                    {' '}
                    ({timeline.summary.criticalNestboxOrBirthCount} critical nestbox /{' '}
                    {speciesProfile.birthEventLabel.toLowerCase()})
                  </span>
                )}
              </div>
              {escalatedBars.length > 0 && (
                <div className="text-[11px] text-[var(--barn-muted)] truncate">
                  {escalatedBars
                    .slice(0, 3)
                    .map(
                      (b) =>
                        `${formatSystemTaskTitle(b.task, settings.calendarSync, taskTitleContext)} (${b.escalation.reason})`
                    )
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>

          {timeline.summary.escalatedCount > 0 && (
            <button
              type="button"
              disabled={escalatingBusy}
              onClick={() => void handleApplyEscalationsClick()}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold whitespace-nowrap disabled:opacity-60"
            >
              {escalatingBusy
                ? 'Escalating...'
                : `Apply ${timeline.summary.escalatedCount} Smart Escalation${
                    timeline.summary.escalatedCount === 1 ? '' : 's'
                  }`}
            </button>
          )}
        </div>
      )}

      {/* Scheduler Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5">
            <button
              type="button"
              onClick={() => setWindowStartIso((prev) => addDaysIso(prev, -7))}
              aria-label="Shift Gantt timeline back 7 days"
              className="min-h-[30px] min-w-[30px] rounded-md hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setWindowStartIso(addDaysIso(today, -3))}
              className="min-h-[30px] px-2.5 rounded-md hover:bg-[var(--barn-subtle)] font-medium whitespace-nowrap"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setWindowStartIso((prev) => addDaysIso(prev, 7))}
              aria-label="Shift Gantt timeline forward 7 days"
              className="min-h-[30px] min-w-[30px] rounded-md hover:bg-[var(--barn-subtle)] flex items-center justify-center"
            >
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5">
            {([14, 21, 30] as const).map((daysOpt) => (
              <button
                key={daysOpt}
                type="button"
                aria-pressed={windowDays === daysOpt}
                onClick={() => setWindowDays(daysOpt)}
                className={`min-h-[30px] px-2 py-0.5 rounded-md font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                  windowDays === daysOpt
                    ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)]'
                    : 'text-[var(--barn-muted)]'
                }`}
              >
                {daysOpt}d
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setGrouping((prev) =>
                prev === 'breeding_or_animal' ? 'category' : 'breeding_or_animal'
              )
            }
            className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Group: {grouping === 'breeding_or_animal' ? 'Breeding / Animal' : 'Category'}
          </button>

          <label className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-[var(--barn-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
              className="accent-[var(--barn-sage)]"
            />
            Show Done
          </label>
        </div>

        <button
          type="button"
          aria-expanded={showP2pDrawer}
          onClick={() => setShowP2pDrawer((v) => !v)}
          className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            p2pState === 'connected'
              ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)]'
              : unresolvedConflicts.length > 0
              ? 'bg-[var(--barn-terracotta-tint)] border-[var(--barn-terracotta)] text-[var(--barn-ink)]'
              : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-[var(--barn-ink)]'
          }`}
        >
          <Wifi className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
          LAN P2P Outbox
          {unresolvedConflicts.length > 0 && (
            <span className="font-mono text-[11px] text-[var(--barn-danger)] font-semibold">
              ({unresolvedConflicts.length} conflict{unresolvedConflicts.length === 1 ? '' : 's'})
            </span>
          )}
        </button>
      </div>

      {/* Collapsible P2P / LAN Outbox Reconciliation Drawer */}
      {showP2pDrawer && (
        <div className="p-4 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-4 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-[var(--barn-ink)] flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                Local P2P / LAN Outbox Reconciliation (Zero Server)
              </h3>
              <p className="text-[11px] text-[var(--barn-muted)] mt-0.5">
                Device ID: <span className="font-mono text-[var(--barn-ink)]">{deviceId}</span> ·{' '}
                Outbox ops: <span className="font-mono">{syncOperations.length}</span> · Link:{' '}
                <span className="font-mono font-semibold text-[var(--barn-ink)]">{p2pState}</span>
              </p>
            </div>
            {p2pState === 'connected' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendOutboxOverP2p}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  Push Outbox to Peer
                </button>
                <button
                  type="button"
                  onClick={() => sessionRef.current?.close()}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)]"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {p2pStatusText && (
            <div className="px-3 py-2 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-ink)]">
              {p2pStatusText}
            </div>
          )}
          {p2pError && (
            <div
              role="alert"
              className="px-3 py-2 rounded-lg bg-[var(--barn-terracotta-tint)] border border-[var(--barn-danger)] text-[11px] text-[var(--barn-danger)] font-medium"
            >
              {p2pError}
            </div>
          )}

          {lastSummary && (
            <div className="font-mono text-[11px] text-[var(--barn-muted)] tabular-nums">
              Last Reconcile ({lastSummary.peerDeviceId}): {lastSummary.appliedOpCount} applied of{' '}
              {lastSummary.receivedOpsCount} ops ({lastSummary.taskOpsReceivedCount} task ops) ·{' '}
              {lastSummary.newConflictCount} new conflict(s)
            </div>
          )}
          {lastPeerAck && (
            <div className="font-mono text-[11px] text-[var(--barn-sage)] tabular-nums">
              Ack from {lastPeerAck.senderDeviceId}: merged {lastPeerAck.appliedCount}/
              {lastPeerAck.receivedCount} ops ({lastPeerAck.taskOpsCount} task ops)
            </div>
          )}

          {/* Direct WebRTC Pairing (Host / Join) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
              <div className="font-semibold text-[var(--barn-ink)]">
                1. Host Device (Same Wi-Fi / LAN)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={p2pBusy || !supportsLanWebRtcP2p()}
                  onClick={() => void handleCreateOffer()}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold disabled:opacity-50"
                >
                  Generate LAN Offer Code
                </button>
                {localOfferToken && (
                  <button
                    type="button"
                    onClick={() => void copyTextWithFallback(localOfferToken)}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    Copy Offer
                  </button>
                )}
              </div>
              {localOfferToken && (
                <textarea
                  readOnly
                  aria-label="Local LAN Offer Code"
                  rows={2}
                  value={localOfferToken}
                  className="w-full p-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px]"
                />
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Paste peer Answer code"
                  placeholder="Paste peer CP-LAN1 Answer code..."
                  value={remoteAnswerInput}
                  onChange={(e) => setRemoteAnswerInput(e.target.value)}
                  className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
                <button
                  type="button"
                  disabled={p2pBusy || !remoteAnswerInput.trim()}
                  onClick={() => void handleCompleteHandshake()}
                  className="min-h-[34px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] font-semibold text-[11px] disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2">
              <div className="font-semibold text-[var(--barn-ink)]">
                2. Joining Peer Device
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Paste host Offer code"
                  placeholder="Paste host CP-LAN1 Offer code..."
                  value={remoteOfferInput}
                  onChange={(e) => setRemoteOfferInput(e.target.value)}
                  className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px]"
                />
                <button
                  type="button"
                  disabled={p2pBusy || !remoteOfferInput.trim() || !supportsLanWebRtcP2p()}
                  onClick={() => void handleAcceptOffer()}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold text-[11px] disabled:opacity-50"
                >
                  Create Answer
                </button>
              </div>
              {localAnswerToken && (
                <div className="space-y-1.5">
                  <textarea
                    readOnly
                    aria-label="Generated LAN Answer Code"
                    rows={2}
                    value={localAnswerToken}
                    className="w-full p-2 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[10px]"
                  />
                  <button
                    type="button"
                    onClick={() => void copyTextWithFallback(localAnswerToken)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] inline-flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    Copy Answer Back to Host
                  </button>
                </div>
              )}
              {!supportsLanWebRtcP2p() && (
                <p className="text-[11px] text-[var(--barn-muted)]">
                  WebRTC is unavailable in this browser; use Folder Sync or Manual Delta JSON below.
                </p>
              )}
            </div>
          </div>

          {/* Shared LAN Folder & Manual Delta Fallback */}
          <div className="p-3 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-[var(--barn-ink)]">
                Shared Folder / Manual Delta Reconciliation
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={p2pBusy}
                  onClick={() => void handleFolderSyncClick()}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1.5 text-[11px] font-medium"
                >
                  <FolderSync className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                  {backupSyncStatus?.configured
                    ? `Sync Folder (${backupSyncStatus.folderName})`
                    : 'Pick Shared LAN / SyncThing Folder'}
                </button>
                <button
                  type="button"
                  onClick={() => void copyTextWithFallback(onBuildLocalDeltaJson().content)}
                  className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 text-[11px]"
                >
                  <Copy className="w-3 h-3" aria-hidden="true" />
                  Copy My Delta JSON
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="Paste peer delta JSON"
                placeholder="Paste peer delta_*.json or wire JSON to reconcile offline..."
                value={manualDeltaInput}
                onChange={(e) => setManualDeltaInput(e.target.value)}
                className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono text-[11px]"
              />
              <button
                type="button"
                disabled={p2pBusy || !manualDeltaInput.trim()}
                onClick={() => void handleManualReconcileClick()}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] text-[11px] font-semibold disabled:opacity-50 inline-flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                Merge
              </button>
            </div>
          </div>

          {/* Unresolved Field Collisions */}
          {unresolvedConflicts.length > 0 && (
            <div className="space-y-2">
              <div className="font-semibold text-[var(--barn-terracotta)]">
                Unresolved Outbox Collisions ({unresolvedConflicts.length})
              </div>
              <div className="divide-y divide-[var(--barn-border)] border border-[var(--barn-border)] rounded-xl bg-[var(--barn-surface)]">
                {unresolvedConflicts.slice(0, 6).map((c) => (
                  <div
                    key={c.conflict_id}
                    className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-[var(--barn-ink)] truncate">
                        [{c.entity_type}] {c.entity_label} · field{' '}
                        <span className="font-mono">{c.field_name}</span>
                      </div>
                      <div className="text-[var(--barn-muted)] font-mono truncate">
                        Applied ({c.winning_device_id}): {JSON.stringify(c.winning_value)} · Other (
                        {c.losing_device_id}): {JSON.stringify(c.losing_value)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onResolveSyncConflict(c.conflict_id, 'winning')}
                        className="min-h-[28px] px-2 py-0.5 rounded-md border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                      >
                        Keep Applied
                      </button>
                      <button
                        type="button"
                        onClick={() => void onResolveSyncConflict(c.conflict_id, 'losing')}
                        className="min-h-[28px] px-2 py-0.5 rounded-md bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] font-semibold"
                      >
                        Use Other
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDismissSyncConflict(c.conflict_id)}
                        aria-label={`Dismiss conflict ${c.conflict_id}`}
                        className="min-h-[28px] px-1.5 rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)]"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interactive Gantt Chart Grid */}
      {timeline.lanes.length === 0 ? (
        <div className="p-6 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-center text-xs text-[var(--barn-muted)]">
          No scheduled {speciesProfile.name.toLowerCase()} chores match the active filter.
        </div>
      ) : (
        <div className="border border-[var(--barn-border)] rounded-xl bg-[var(--barn-canvas)] overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Header Row */}
            <div className="flex border-b border-[var(--barn-border)] bg-[var(--barn-subtle)]">
              <div className="w-44 shrink-0 px-3 py-2 text-[11px] font-semibold text-[var(--barn-muted)] border-r border-[var(--barn-border)]">
                Lane / Target
              </div>
              <div
                ref={timelineGridRef}
                className="flex-1 grid"
                style={{ gridTemplateColumns: `repeat(${windowDays}, minmax(0, 1fr))` }}
              >
                {timeline.days.map((day) => (
                  <div
                    key={day.dateIso}
                    title={day.dateIso}
                    className={`py-1.5 text-center border-r last:border-r-0 border-[var(--barn-border)]/50 ${
                      day.isToday
                        ? 'bg-[var(--barn-sage-tint)] font-bold text-[var(--barn-ink)]'
                        : day.isWeekend
                        ? 'bg-[var(--barn-subtle)]/70 text-[var(--barn-muted)]'
                        : 'text-[var(--barn-muted)]'
                    }`}
                  >
                    <div className="text-[9px] uppercase tracking-wider">{day.weekdayShort}</div>
                    <div className="font-mono text-[11px] tabular-nums">{day.dayOfMonth}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lane Rows */}
            <div className="divide-y divide-[var(--barn-border)]">
              {timeline.lanes.map((lane) => {
                const barsToShow = lane.bars.filter((b) => b.isInWindow);
                return (
                  <div key={lane.laneId} className="flex items-stretch">
                    <div className="w-44 shrink-0 px-3 py-2.5 border-r border-[var(--barn-border)] flex flex-col justify-center min-w-0">
                      <div className="text-xs font-semibold text-[var(--barn-ink)] truncate">
                        {lane.label}
                      </div>
                      <div className="text-[10px] text-[var(--barn-muted)] truncate">
                        {lane.subtitle}
                      </div>
                      {lane.linkedAnimalId && (
                        <button
                          type="button"
                          onClick={() => onOpenAnimal(lane.linkedAnimalId!)}
                          className="text-[10px] text-[var(--barn-sage)] underline text-left mt-0.5 truncate"
                        >
                          Open animal
                        </button>
                      )}
                    </div>

                    <div className="flex-1 py-2 px-0.5 space-y-1.5 relative">
                      {/* Background Day Columns */}
                      <div
                        className="absolute inset-0 grid pointer-events-none"
                        style={{ gridTemplateColumns: `repeat(${windowDays}, minmax(0, 1fr))` }}
                      >
                        {timeline.days.map((day) => (
                          <div
                            key={day.dateIso}
                            className={`border-r last:border-r-0 border-[var(--barn-border)]/35 ${
                              day.isToday
                                ? 'bg-[var(--barn-sage-tint)]/45'
                                : day.isWeekend
                                ? 'bg-[var(--barn-subtle)]/30'
                                : ''
                            }`}
                          />
                        ))}
                      </div>

                      {barsToShow.length === 0 ? (
                        <div className="relative z-10 px-2 py-1 text-[11px] text-[var(--barn-muted)] font-mono">
                          {lane.bars.length} chore{lane.bars.length === 1 ? '' : 's'} outside current{' '}
                          {windowDays}d window ({lane.bars[0]?.effectiveDueIso})
                        </div>
                      ) : (
                        barsToShow.map((bar) => {
                          const isDraggingThis = dragState?.task.id === bar.task.id;
                          const deltaDays = isDraggingThis ? dragState.deltaDays : 0;
                          const rawStart =
                            isDraggingThis && dragState.mode === 'move'
                              ? bar.startColIndex + deltaDays
                              : isDraggingThis && dragState.mode === 'resize-start'
                              ? Math.min(
                                  bar.startColIndex + bar.spanCols - 1,
                                  bar.startColIndex + deltaDays
                                )
                              : bar.startColIndex;
                          const displayStart = Math.max(0, Math.min(windowDays - 1, rawStart));
                          const rawSpan =
                            isDraggingThis && dragState.mode === 'resize-start'
                              ? Math.max(1, bar.spanCols - deltaDays)
                              : bar.spanCols;
                          const displaySpan = Math.max(
                            1,
                            Math.min(windowDays - displayStart, rawSpan)
                          );

                          const leftPct = (displayStart / windowDays) * 100;
                          const widthPct = (displaySpan / windowDays) * 100;
                          const tailWidthPct =
                            !isDraggingThis && bar.overdueTailCols > 0
                              ? Math.min(
                                  ((windowDays - (displayStart + displaySpan)) / windowDays) * 100,
                                  (bar.overdueTailCols / windowDays) * 100
                                )
                              : 0;

                          const title = formatSystemTaskTitle(
                            bar.task,
                            settings.calendarSync,
                            taskTitleContext
                          );
                          const isSelected = selectedTaskId === bar.task.id;

                          return (
                            <div
                              key={bar.task.id}
                              className="relative h-8 flex items-center"
                            >
                              {tailWidthPct > 0 && (
                                <div
                                  aria-hidden="true"
                                  style={{
                                    left: `${leftPct + widthPct}%`,
                                    width: `${tailWidthPct}%`,
                                  }}
                                  className="absolute h-3 bg-[var(--barn-danger)]/35 border-y border-r border-dashed border-[var(--barn-danger)] rounded-r-md pointer-events-none"
                                />
                              )}

                              <div
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelected}
                                aria-label={`${title} (${bar.effectiveStartIso} to ${bar.effectiveDueIso}${
                                  bar.escalation.isEscalated ? `, Escalated: ${bar.escalation.reason}` : ''
                                })`}
                                onClick={() => setSelectedTaskId(bar.task.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedTaskId(bar.task.id);
                                  } else if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    void handleNudgeTaskDays(bar.task, -1, 'move');
                                  } else if (e.key === 'ArrowRight') {
                                    e.preventDefault();
                                    void handleNudgeTaskDays(bar.task, 1, 'move');
                                  }
                                }}
                                onPointerDown={(e) => startBarDrag(e, bar.task, 'move')}
                                style={{
                                  left: `${leftPct}%`,
                                  width: `${widthPct}%`,
                                  touchAction: 'none',
                                }}
                                className={`absolute z-10 h-7 rounded-lg border px-1.5 flex items-center gap-1 select-none cursor-grab active:cursor-grabbing text-[11px] font-medium shadow-xs transition-shadow ${getBarToneClasses(
                                  bar
                                )} ${
                                  isSelected ? 'ring-2 ring-[var(--barn-ink)] ring-offset-1' : ''
                                } ${rescheduleBusyId === bar.task.id ? 'opacity-60' : ''}`}
                              >
                                <span
                                  role="separator"
                                  aria-label={`Resize start date for ${title}`}
                                  onPointerDown={(e) => startBarDrag(e, bar.task, 'resize-start')}
                                  className="w-2 h-5 -ml-1 rounded-sm cursor-ew-resize hover:bg-black/20 shrink-0"
                                  title="Drag left edge to adjust start date span"
                                />
                                <span className="truncate flex-1">{title}</span>
                                {bar.escalation.isEscalated && (
                                  <span className="font-mono text-[9px] font-bold uppercase shrink-0">
                                    !
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selected Task Keyboard/Touch Inspector & Quick Actions */}
      {selectedTask && (
        <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="min-w-0 space-y-0.5">
            <div className="font-semibold text-[var(--barn-ink)] truncate">
              {formatSystemTaskTitle(selectedTask, settings.calendarSync, taskTitleContext)}
            </div>
            <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
              {selectedTask.startDateIso
                ? `${formatReadableDate(selectedTask.startDateIso)} → ${formatReadableDate(selectedTask.dueDateIso)}`
                : `Due ${formatReadableDate(selectedTask.dueDateIso)}`}{' '}
              · {selectedTask.category} · {selectedTask.priority} priority
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={rescheduleBusyId === selectedTask.id}
              onClick={() => void handleNudgeTaskDays(selectedTask, -1, 'resize-start')}
              title="Extend span 1 day earlier"
              className="min-h-[32px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-mono text-[11px]"
            >
              Start -1d
            </button>
            <button
              type="button"
              disabled={rescheduleBusyId === selectedTask.id}
              onClick={() => void handleNudgeTaskDays(selectedTask, -1, 'move')}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-mono text-[11px]"
            >
              Move -1d
            </button>
            <button
              type="button"
              disabled={rescheduleBusyId === selectedTask.id}
              onClick={() => void handleNudgeTaskDays(selectedTask, 1, 'move')}
              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-mono text-[11px]"
            >
              Move +1d
            </button>
            <button
              type="button"
              onClick={() => void onToggleTask(selectedTask)}
              className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold inline-flex items-center gap-1 text-[11px]"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              {selectedTask.completed ? 'Reopen' : 'Done'}
            </button>
            <button
              type="button"
              onClick={() => {
                onDeleteTask(selectedTask.id);
                setSelectedTaskId(null);
              }}
              aria-label={`Delete chore ${selectedTask.title}`}
              className="min-h-[32px] min-w-[32px] rounded-lg border border-[var(--barn-border)] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] flex items-center justify-center"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Unscheduled Tasks Strip */}
      {timeline.unscheduledTasks.length > 0 && (
        <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
          <div className="font-semibold text-[var(--barn-muted)] flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
            Unscheduled Chores ({timeline.unscheduledTasks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {timeline.unscheduledTasks.map(({ task }) => (
              <div
                key={task.id}
                className="px-2.5 py-1.5 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] flex items-center gap-2"
              >
                <span className="truncate max-w-[200px]">
                  {formatSystemTaskTitle(task, settings.calendarSync, taskTitleContext)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void onRescheduleTask(task, { startDateIso: '', dueDateIso: today })
                  }
                  className="text-[11px] font-semibold text-[var(--barn-sage)] underline whitespace-nowrap"
                >
                  Schedule Today
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
