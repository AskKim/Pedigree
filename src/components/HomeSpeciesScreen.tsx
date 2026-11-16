/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Multi-Species Barn Home Landing Screen (`Home`).
 *
 * Displays first-time Farm/Barn Name onboarding, optional condensed summary strip,
 * reorderable per-species workspace cards with targeted Due/Overdue Task alerts and
 * Upcoming Birth alerts, and a bottom "Add Species" link into Settings.
 */

import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Baby,
  Check,
  GripVertical,
  Plus,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesDueTasksAlert,
  evaluateSpeciesNeedsAttentionAlert,
} from '../core/barnAlerts';
import { formatSystemTaskTitle } from '../core/calendarExport';
import {
  BarnDatabaseSnapshot,
  isAnimalArchived,
  todayDateIso,
} from '../core/models';
import { WorkspaceRoute } from '../hooks/useBarnStore';

interface HomeSpeciesScreenProps {
  snapshot: BarnDatabaseSnapshot;
  onOpenSpecies: (speciesName: string, route?: WorkspaceRoute) => void;
  onMoveSpeciesCard: (speciesId: string, direction: 'up' | 'down' | 'top') => void;
  onReorderSpeciesCards: (orderedIds: string[]) => void;
  onSaveBarnName: (name: string) => void;
  onHideSummaryGrid: () => void;
  onIgnoreTaskAlerts: (taskIds: string[]) => void;
  onClearTaskAlertGroup: (speciesName: string, groupSignature: string | string[]) => void;
  onNavigateToAddSpecies: () => void;
}

export function HomeSpeciesScreen({
  snapshot,
  onOpenSpecies,
  onMoveSpeciesCard,
  onReorderSpeciesCards,
  onSaveBarnName,
  onHideSummaryGrid,
  onIgnoreTaskAlerts,
  onClearTaskAlertGroup,
  onNavigateToAddSpecies,
}: HomeSpeciesScreenProps) {
  const [draggedSpeciesId, setDraggedSpeciesId] = useState<string | null>(null);
  const [dragOverSpeciesId, setDragOverSpeciesId] = useState<string | null>(null);
  const [onboardingBarnName, setOnboardingBarnName] = useState<string>(
    snapshot.settings.barnName === 'My Barn' ? '' : snapshot.settings.barnName
  );

  const today = todayDateIso();
  const pinnedName = snapshot.settings.pinnedLandingSpecies;
  const showOnboarding = !snapshot.settings.barnNameOnboarded;
  const showSummaryGrid = snapshot.settings.showHomeSummaryGrid !== false;

  const archivedIdSet = new Set(
    snapshot.animals.filter((a) => isAnimalArchived(a)).map((a) => a.id)
  );
  const ignoredTaskIdSet = new Set(snapshot.settings.ignoredTaskIds || []);

  const activeTasks = snapshot.tasks.filter(
    (t) => !t.linkedAnimalId || !archivedIdSet.has(t.linkedAnimalId)
  );

  const activeGestations = snapshot.breedings.filter((b) =>
    ['Planned', 'Bred', 'Palpated Positive'].includes(b.status)
  ).length;
  const openTasks = activeTasks.filter((t) => !t.completed).length;

  const handleDropOnCard = (targetId: string) => {
    if (!draggedSpeciesId || draggedSpeciesId === targetId) {
      setDraggedSpeciesId(null);
      setDragOverSpeciesId(null);
      return;
    }
    const ids = snapshot.speciesProfiles.map((sp) => sp.id);
    const fromIdx = ids.indexOf(draggedSpeciesId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const nextIds = [...ids];
      const [moved] = nextIds.splice(fromIdx, 1);
      nextIds.splice(toIdx, 0, moved);
      onReorderSpeciesCards(nextIds);
    }
    setDraggedSpeciesId(null);
    setDragOverSpeciesId(null);
  };

  return (
    <div className="space-y-6">
      {/* First-Time Barn / Farm Name Onboarding Prompt */}
      {showOnboarding && (
        <section
          aria-label="Set Your Barn or Farm Name"
          className="bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold">
              Welcome — Name Your Barn, Rabbitry, or Farm
            </h2>
            <p className="text-xs text-[var(--barn-muted)]">
              This name appears on your barn dashboard and printed pedigrees. You can change it
              anytime in Settings.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSaveBarnName(onboardingBarnName.trim() || 'My Barn');
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <input
              type="text"
              placeholder="e.g. Copper Creek Rabbitry or Maple Hill Homestead"
              value={onboardingBarnName}
              onChange={(e) => setOnboardingBarnName(e.target.value)}
              className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-sm"
            />
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Save Farm Name
              </button>
              <button
                type="button"
                onClick={() => onSaveBarnName(snapshot.settings.barnName || 'My Barn')}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
              >
                Use &ldquo;{snapshot.settings.barnName || 'My Barn'}&rdquo;
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Barn Hero Header */}
      <section className="space-y-3.5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="space-y-0.5">
            <p className="text-xs text-[var(--barn-muted)]">
              Multi**Species Livestock Pedigree &amp; Management System
            </p>
            <p className="text-xs text-[var(--barn-muted)]">
              100% local app ownership — offline-first with zero cloud lock-in.
            </p>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance pt-1">
            {snapshot.settings.barnName || 'My Barn'}
          </h1>
          <div
            role="note"
            className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/70 text-xs text-[var(--barn-ink)]"
          >
            <AlertTriangle
              className="w-3.5 h-3.5 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              <strong>Pre-alpha:</strong> Use at your own risk — always back up your data before
              upgrading or deleting records.
            </span>
          </div>
          <p className="text-sm text-[var(--barn-muted)]">
            Choose a livestock species below to open its isolated barn hub, manage records, or
            reorder cards to match your daily chore route.
          </p>
        </div>

        {/* Ultra-Compact Optional 4-Metric Summary Bar */}
        {showSummaryGrid && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex-1 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl p-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1">
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Species</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {snapshot.speciesProfiles.length}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Gestations</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {activeGestations}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Open Chores</span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {openTasks}
                </span>
              </div>
              <div className="px-2.5 py-1 rounded-lg flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--barn-muted)] truncate">Startup</span>
                <span className="text-[11px] font-semibold truncate">
                  {pinnedName ? `${pinnedName}` : 'Home'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onHideSummaryGrid}
              className="self-end sm:self-center text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-ink)] underline whitespace-nowrap shrink-0"
            >
              Hide strip
            </button>
          </div>
        )}
      </section>

      {/* Reorderable Species Hub Cards Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">
            Your Livestock ({snapshot.speciesProfiles.length})
          </h2>
          <span className="text-xs text-[var(--barn-muted)]">
            Use ↑ ↓ / ⤒ arrows (or drag cards) to sort
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {snapshot.speciesProfiles.map((sp, index) => {
            const spKey = sp.name.trim().toLowerCase();
            const rawCleared = snapshot.settings.dismissedTaskGroupKeys?.[spKey];
            const dueAlert = evaluateSpeciesDueTasksAlert(activeTasks, sp.name, {
              todayIso: today,
              ignoredTaskIds: ignoredTaskIdSet,
              clearedGroupSignature: typeof rawCleared === 'string' ? rawCleared : undefined,
            });
            const dueTasks = dueAlert.tasks;
            const dueTaskIds = dueTasks.map((t) => t.id);
            const legacyDismissed = Array.isArray(rawCleared) ? new Set(rawCleared) : null;
            const showDueTaskAlert =
              dueAlert.shouldShow &&
              (!legacyDismissed || dueTaskIds.some((id) => !legacyDismissed.has(id)));

            const arrivingAlert = evaluateSpeciesArrivingBabiesAlert(
              snapshot.breedings,
              sp,
              { todayIso: today }
            );
            const attentionAlert = evaluateSpeciesNeedsAttentionAlert(
              snapshot.animals,
              sp.name
            );

            const isFirst = index === 0;
            const isLast = index === snapshot.speciesProfiles.length - 1;
            const isDragTarget =
              dragOverSpeciesId === sp.id && draggedSpeciesId !== null && draggedSpeciesId !== sp.id;

            return (
              <article
                key={sp.id}
                draggable
                onDragStart={(e: React.DragEvent<HTMLElement>) => {
                  setDraggedSpeciesId(sp.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e: React.DragEvent<HTMLElement>) => {
                  e.preventDefault();
                  if (dragOverSpeciesId !== sp.id) {
                    setDragOverSpeciesId(sp.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverSpeciesId === sp.id) {
                    setDragOverSpeciesId(null);
                  }
                }}
                onDrop={(e: React.DragEvent<HTMLElement>) => {
                  e.preventDefault();
                  handleDropOnCard(sp.id);
                }}
                onDragEnd={() => {
                  setDraggedSpeciesId(null);
                  setDragOverSpeciesId(null);
                }}
                className={`bg-[var(--barn-surface)] border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isDragTarget
                    ? 'border-[var(--barn-sage)] ring-2 ring-[var(--barn-sage)]/40'
                    : 'border-[var(--barn-border)]'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Header: Drag Grip + Invisibly Linked Name + Open Hub + Reorder Arrows */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span
                        title="Drag card to reorder"
                        className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <h3 className="font-display text-lg font-semibold leading-snug truncate min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                          aria-label={`Open ${sp.name} hub`}
                          className="text-left text-inherit font-inherit truncate max-w-full hover:opacity-80 focus:outline-none focus-visible:underline cursor-pointer"
                        >
                          {sp.name}
                        </button>
                      </h3>
                      <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        Open Hub
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>

                      <div
                        role="group"
                        aria-label={`Reorder ${sp.name} card`}
                        className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5 shrink-0"
                      >
                        {index > 1 && (
                          <button
                            type="button"
                            onClick={() => onMoveSpeciesCard(sp.id, 'top')}
                            title={`Move ${sp.name} to top (#1)`}
                            aria-label={`Move ${sp.name} to top`}
                            className="min-h-[32px] min-w-[28px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
                          >
                            <ArrowUpToLine className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isFirst}
                          onClick={() => onMoveSpeciesCard(sp.id, 'up')}
                          title={`Move ${sp.name} up`}
                          aria-label={`Move ${sp.name} up`}
                          className="min-h-[32px] min-w-[28px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isLast}
                          onClick={() => onMoveSpeciesCard(sp.id, 'down')}
                          title={`Move ${sp.name} down`}
                          aria-label={`Move ${sp.name} down`}
                          className="min-h-[32px] min-w-[28px] rounded-md text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center transition-colors"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Babies About to Arrive Alert (gestation nearly complete) */}
                  {arrivingAlert.shouldShow && (
                    <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <Baby
                            className="w-4 h-4 text-[var(--barn-sage)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)]">
                              {arrivingAlert.items.length} {arrivingAlert.offspringPluralLabel} Due Soon
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {arrivingAlert.items
                                .slice(0, 2)
                                .map((item) => `${item.breeding.damName} (${item.timingLabel})`)
                                .join(' · ')}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'breeding')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          View Breeding
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Needs Attention Animals Notice (e.g., quick-added unlisted parents) */}
                  {attentionAlert.shouldShow && (
                    <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/80 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <AlertCircle
                            className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)]">
                              {attentionAlert.animals.length}{' '}
                              {attentionAlert.animals.length === 1 ? 'Record' : 'Records'} Need
                              Attention
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {attentionAlert.animals
                                .slice(0, 2)
                                .map((a) => a.name)
                                .join(' · ')}
                              {attentionAlert.animals.length > 2
                                ? ` +${attentionAlert.animals.length - 2} more`
                                : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'herd')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-terracotta)]/50 text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold whitespace-nowrap shrink-0"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Due / Overdue Tasks Alert (only shown when non-ignored tasks are due/overdue) */}
                  {showDueTaskAlert && (
                    <div className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <AlertTriangle
                          className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--barn-ink)] font-mono tabular-nums">
                            {dueTasks.length} Due / Overdue Task
                            {dueTasks.length === 1 ? '' : 's'}
                          </div>
                          <div className="text-[11px] text-[var(--barn-muted)] truncate">
                            {dueTasks
                              .slice(0, 2)
                              .map((t) =>
                                formatSystemTaskTitle(t, snapshot.settings.calendarSync, {
                                  animals: snapshot.animals,
                                  breedings: snapshot.breedings,
                                  speciesProfiles: snapshot.speciesProfiles,
                                })
                              )
                              .join(' · ')}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold whitespace-nowrap"
                        >
                          Do Tasks
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onClearTaskAlertGroup(sp.name, dueAlert.groupSignature)
                          }
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] font-medium hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                        >
                          Clear Alert
                        </button>
                        <button
                          type="button"
                          onClick={() => onIgnoreTaskAlerts(dueTaskIds)}
                          className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[11px] text-[var(--barn-muted)] hover:text-[var(--barn-danger)] whitespace-nowrap"
                        >
                          Ignore Permanently
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Add Species CTA below all species cards, linking to Settings */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onNavigateToAddSpecies}
            className="w-full min-h-[48px] px-5 py-3 rounded-2xl border border-dashed border-[var(--barn-border)] bg-[var(--barn-surface)] hover:border-[var(--barn-sage)] hover:bg-[var(--barn-subtle)]/50 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
            Add Species (Configure Livestock &amp; Custom Prefix in Settings)
          </button>
        </div>
      </section>
    </div>
  );
}
